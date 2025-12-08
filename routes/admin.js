const express = require('express');
const Story = require('../models/Story');
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');
const { getPingerStats } = require('../services/serverPinger');

const router = express.Router();

// Get admin dashboard stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [
      totalStories,
      publishedStories,
      draftStories,
      scheduledStories,
      totalViews,
      totalUsers
    ] = await Promise.all([
      Story.countDocuments(),
      Story.countDocuments({ isPublished: true }),
      Story.countDocuments({ isPublished: false, scheduledDate: null }),
      Story.countDocuments({ 
        isPublished: false, 
        scheduledDate: { $exists: true, $ne: null } 
      }),
      Story.aggregate([
        { $group: { _id: null, totalViews: { $sum: '$views' } } }
      ]),
      User.countDocuments({ isActive: true })
    ]);

    // Get recent stories
    const recentStories = await Story.find()
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title isPublished views createdAt');

    // Get popular stories
    const popularStories = await Story.find({ isPublished: true })
      .populate('author', 'name email')
      .sort({ views: -1 })
      .limit(5)
      .select('title views createdAt');

    // Social media posting stats
    const socialMediaStats = await Story.aggregate([
      { $match: { isPublished: true } },
      {
        $project: {
          facebookPosted: '$socialMediaPosts.facebook.posted',
          instagramPosted: '$socialMediaPosts.instagram.posted',
          twitterPosted: '$socialMediaPosts.twitter.posted',
          youtubePosted: '$socialMediaPosts.youtube.posted'
        }
      },
      {
        $group: {
          _id: null,
          totalFacebookPosts: { $sum: { $cond: ['$facebookPosted', 1, 0] } },
          totalInstagramPosts: { $sum: { $cond: ['$instagramPosted', 1, 0] } },
          totalTwitterPosts: { $sum: { $cond: ['$twitterPosted', 1, 0] } },
          totalYoutubePosts: { $sum: { $cond: ['$youtubePosted', 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        totalStories,
        publishedStories,
        draftStories,
        scheduledStories,
        totalViews: totalViews[0]?.totalViews || 0,
        totalUsers,
        socialMedia: socialMediaStats[0] || {
          totalFacebookPosts: 0,
          totalInstagramPosts: 0,
          totalTwitterPosts: 0,
          totalYoutubePosts: 0
        }
      },
      recentStories,
      popularStories
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all stories for admin (with filters)
router.get('/stories', requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let query = {};
    
    // Filter by status
    if (status === 'published') {
      query.isPublished = true;
    } else if (status === 'draft') {
      query.isPublished = false;
      query.scheduledDate = null;
    } else if (status === 'scheduled') {
      query.isPublished = false;
      query.scheduledDate = { $exists: true, $ne: null };
    }

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const stories = await Story.find(query)
      .populate('author', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Story.countDocuments(query);

    res.json({
      success: true,
      stories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching admin stories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get scheduled posts
router.get('/scheduled-posts', requireAdmin, async (req, res) => {
  try {
    // Get stories that have social media posts scheduled (regardless of status)
    const stories = await Story.find({
      $or: [
        { 'socialMediaPosts.facebook.scheduledTime': { $exists: true, $ne: null } },
        { 'socialMediaPosts.instagram.scheduledTime': { $exists: true, $ne: null } }
      ]
    })
    .populate('author', 'name email')
    .sort({ createdAt: -1 });

    // Transform data to individual posts for each platform
    const posts = [];
    
    stories.forEach(story => {
      const platforms = ['facebook', 'instagram']; // Removed twitter and youtube
      
      platforms.forEach(platform => {
        const socialPost = story.socialMediaPosts?.[platform];
        if (socialPost?.scheduledTime) {
          // Construct proper image URL - all images are stored in Cloudinary
          let imageUrl = null;
          if (story.featuredImage) {
            // All images should be full Cloudinary URLs
            imageUrl = story.featuredImage;
          } else if (story.image?.url) {
            imageUrl = story.image.url;
          }
          
          posts.push({
            storyId: story._id,
            storyTitle: story.title,
            storyImage: imageUrl,
            platform: platform,
            scheduledTime: socialPost.scheduledTime,
            posted: socialPost.posted || false,
            postedAt: socialPost.postedAt || null,
            failed: socialPost.failed || false,
            error: socialPost.error || null
          });
        }
      });
    });

    // Sort by scheduled time (most recent first)
    posts.sort((a, b) => new Date(b.scheduledTime) - new Date(a.scheduledTime));

    res.json({
      success: true,
      posts: posts
    });
  } catch (error) {
    console.error('Error fetching scheduled posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get analytics data
router.get('/analytics', requireAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Views over time
    const viewsOverTime = await Story.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          isPublished: true
        }
      },
      {
        $group: {
          _id: { 
            $dateToString: { 
              format: '%Y-%m-%d', 
              date: '$createdAt' 
            } 
          },
          views: { $sum: '$views' },
          stories: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Top performing stories
    const topStories = await Story.find({
      isPublished: true,
      createdAt: { $gte: startDate }
    })
    .populate('author', 'name email')
    .sort({ views: -1 })
    .limit(10)
    .select('title views createdAt');

    // Tag performance
    const tagStats = await Story.aggregate([
      {
        $match: {
          isPublished: true,
          createdAt: { $gte: startDate }
        }
      },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 },
          totalViews: { $sum: '$views' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      analytics: {
        viewsOverTime,
        topStories,
        tagStats
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get detailed stats for admin stats page
router.get('/stats/detailed', requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Get basic counts
    const [
      totalStories,
      publishedStories,
      draftStories,
      totalViews,
      todayViews
    ] = await Promise.all([
      Story.countDocuments(),
      Story.countDocuments({ isPublished: true }),
      Story.countDocuments({ isPublished: false }),
      Story.aggregate([
        { $group: { _id: null, totalViews: { $sum: '$views' } } }
      ]),
      Story.aggregate([
        { 
          $match: { 
            isPublished: true,
            updatedAt: { $gte: todayStart }
          }
        },
        { $group: { _id: null, todayViews: { $sum: '$views' } } }
      ])
    ]);

    // Get top performing stories
    const topStories = await Story.find({ isPublished: true })
      .populate('author', 'name email')
      .sort({ views: -1 })
      .limit(10)
      .select('title views category createdAt');

    // Get category statistics
    const categoryStats = await Story.aggregate([
      { $match: { isPublished: true } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          views: { $sum: '$views' }
        }
      },
      { $sort: { views: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      totalStories,
      publishedStories,
      draftStories,
      totalViews: totalViews[0]?.totalViews || 0,
      todayViews: todayViews[0]?.todayViews || 0,
      topStories,
      categoryStats
    });
  } catch (error) {
    console.error('Error fetching detailed stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get story statistics
router.get('/stories/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await Promise.all([
      Story.countDocuments(),
      Story.countDocuments({ isPublished: true }),
      Story.countDocuments({ isPublished: false }),
      Story.aggregate([
        { $group: { _id: null, totalViews: { $sum: '$views' } } }
      ]),
      Story.aggregate([
        { $match: { isPublished: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalStories: stats[0],
        publishedStories: stats[1],
        draftStories: stats[2],
        totalViews: stats[3][0]?.totalViews || 0,
        categoryBreakdown: stats[4]
      }
    });
  } catch (error) {
    console.error('Error fetching story stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent activity
router.get('/activity', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    // Get recent stories with their creation/update activities
    const recentStories = await Story.find()
      .populate('author', 'name email')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select('title isPublished createdAt updatedAt');

    // Transform to activity format
    const activities = recentStories.map(story => {
      const isNew = story.createdAt.getTime() === story.updatedAt.getTime();
      return {
        type: story.isPublished ? 'published' : isNew ? 'created' : 'updated',
        description: `${story.isPublished ? 'Published' : isNew ? 'Created' : 'Updated'} story: ${story.title}`,
        createdAt: story.updatedAt,
        storyId: story._id
      };
    });

    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reschedule a social media post
router.post('/stories/:id/reschedule', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { platform, newScheduleTime } = req.body;
    
    if (!platform || !newScheduleTime) {
      return res.status(400).json({ error: 'Platform and new schedule time are required' });
    }

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Update the scheduled time for the specific platform
    if (story.socialMediaPosts && story.socialMediaPosts[platform]) {
      story.socialMediaPosts[platform].scheduledTime = new Date(newScheduleTime);
      story.socialMediaPosts[platform].posted = false;
      story.socialMediaPosts[platform].failed = false;
      story.socialMediaPosts[platform].error = null;
      story.socialMediaPosts[platform].postedAt = null;
    } else {
      // Create the social media post entry if it doesn't exist
      if (!story.socialMediaPosts) {
        story.socialMediaPosts = {};
      }
      story.socialMediaPosts[platform] = {
        scheduledTime: new Date(newScheduleTime),
        posted: false,
        failed: false,
        error: null,
        postedAt: null
      };
    }

    await story.save();

    res.json({
      success: true,
      message: 'Post rescheduled successfully',
      scheduledTime: newScheduleTime
    });
  } catch (error) {
    console.error('Error rescheduling post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get server pinger status
router.get('/pinger-status', requireAdmin, async (req, res) => {
  try {
    const pingerStats = getPingerStats();
    
    res.json({
      success: true,
      pinger: pingerStats || {
        isEnabled: false,
        message: 'Pinger not initialized'
      }
    });
  } catch (error) {
    console.error('Error fetching pinger status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;