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
    const now = new Date();
    
    // Get stories with upcoming scheduled posts
    const scheduledPosts = await Story.find({
      isPublished: true,
      $or: [
        { 
          'socialMediaPosts.facebook.scheduledTime': { $gte: now },
          'socialMediaPosts.facebook.posted': false 
        },
        { 
          'socialMediaPosts.instagram.scheduledTime': { $gte: now },
          'socialMediaPosts.instagram.posted': false 
        },
        { 
          'socialMediaPosts.twitter.scheduledTime': { $gte: now },
          'socialMediaPosts.twitter.posted': false 
        },
        { 
          'socialMediaPosts.youtube.scheduledTime': { $gte: now },
          'socialMediaPosts.youtube.posted': false 
        }
      ]
    })
    .populate('author', 'name email')
    .sort({ 'socialMediaPosts.facebook.scheduledTime': 1 })
    .limit(20);

    res.json({
      success: true,
      scheduledPosts
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