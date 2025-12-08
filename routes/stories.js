const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Story = require('../models/Story');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper function to transform story for frontend compatibility
const transformStoryForFrontend = (story) => {
  const storyObj = story.toObject ? story.toObject() : story;
  
  // Set defaults if missing
  if (!storyObj.excerpt && storyObj.content) {
    const plainText = storyObj.content.replace(/<[^>]*>/g, '');
    storyObj.excerpt = plainText.length > 200 ? plainText.substring(0, 200) + '...' : plainText;
  }
  if (storyObj.isFeatured === undefined) storyObj.isFeatured = false;
  
  // Handle featured image
  // Set featuredImage properly - prioritize featuredImage field, then image.url, then default logo
  if (storyObj.featuredImage) {
    // Keep existing featuredImage
  } else if (storyObj.image && storyObj.image.url) {
    storyObj.featuredImage = storyObj.image.url;
  } else {
    storyObj.featuredImage = '/storiva-logo.jpeg';
  }
  
  return storyObj;
};

// Get all stories (public route for published stories, admin route for all)
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isLength({ min: 1 }),
  query('featured').optional().isBoolean(),
  query('tag').optional().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const featured = req.query.featured;
    const tag = req.query.tag;
    
    let query = {};
    
    // Always filter to published stories for public routes
    // Admin routes should use /admin/stories endpoint instead
    query.isPublished = true;

    // Add search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } }
      ];
    }

    // Add featured filtering
    if (featured !== undefined) {
      query.isFeatured = featured === 'true' || featured === true;
    }

    // Add tag filtering
    if (tag) {
      query.tags = { $in: [tag] };
    }
    
    const stories = await Story.find(query)
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-socialMediaPosts -content -__v');
    
    const total = await Story.countDocuments(query);
    
    res.json({
      success: true,
      stories: stories.map(transformStoryForFrontend),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching stories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get featured stories
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    
    const stories = await Story.find({ 
      isPublished: true,
      isFeatured: true 
    })
    .populate('author', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-socialMediaPosts -content -__v');

    res.json({
      success: true,
      stories: stories.map(transformStoryForFrontend)
    });
  } catch (error) {
    console.error('Error fetching featured stories:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get latest stories
router.get('/latest', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 8;
    
    const stories = await Story.find({ isPublished: true })
    .populate('author', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-socialMediaPosts -content -__v');

    res.json({
      success: true,
      stories: stories.map(transformStoryForFrontend)
    });
  } catch (error) {
    console.error('Error fetching latest stories:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Search stories
router.get('/search', async (req, res) => {
  try {
    const { q: query, page = 1, limit = 12 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const searchQuery = {
      isPublished: true,
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
        { excerpt: { $regex: query, $options: 'i' } },
        { tags: { $regex: query, $options: 'i' } }
      ]
    };

    const stories = await Story.find(searchQuery)
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-socialMediaPosts -content -__v');
    
    const total = await Story.countDocuments(searchQuery);
    
    res.json({
      success: true,
      stories: stories.map(transformStoryForFrontend),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error searching stories:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get story by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const story = await Story.findOne({ slug: req.params.slug, isPublished: true })
      .populate('author', 'name email');
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Increment view count
    story.views += 1;
    await story.save();

    res.json({
      success: true,
      story
    });
  } catch (error) {
    console.error('Error fetching story by slug:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single story by ID or slug
router.get('/:identifier', async (req, res) => {
  try {
    const identifier = req.params.identifier;
    let story;
    
    // Try to find by ObjectId first, then by slug
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      story = await Story.findById(identifier).populate('author', 'name email');
    } else {
      story = await Story.findOne({ slug: identifier, isPublished: true })
        .populate('author', 'name email');
      
      // Increment view count for published stories accessed by slug
      if (story) {
        story.views += 1;
        await story.save();
      }
    }
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json({
      success: true,
      story: transformStoryForFrontend(story)
    });
  } catch (error) {
    console.error('Error fetching story:', error);
    console.error('Error details:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Create story (admin only)
router.post('/', requireAdmin, [
  body('title').isLength({ min: 1, max: 200 }).trim(),
  body('excerpt').optional().isLength({ max: 500 }).trim(),
  body('content').isLength({ min: 1 }).trim(),
  body('featuredImage').optional().isString(),
  body('featured').optional().isBoolean(),
  body('status').optional().isIn(['draft', 'published']),
  body('tags').optional().isArray(),
  body('metaDescription').optional().isLength({ max: 160 }),
  body('scheduledAt').optional().isISO8601(),
  body('video').optional().isObject(),
  body('socialMediaPosts').optional().isObject(),
  body('publishToPlatforms').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    console.log('Received story data:', req.body);

    const storyData = {
      title: req.body.title,
      excerpt: req.body.excerpt,
      content: req.body.content,
      isFeatured: req.body.featured || false,
      isPublished: req.body.status === 'published' || true, // Default to published
      author: req.user._id
    };

    // Handle featured image
    if (req.body.featuredImage) {
      storyData.image = {
        url: req.body.featuredImage,
        publicId: `story-${Date.now()}`
      };
    }

    // Handle video data
    if (req.body.video) {
      storyData.video = {
        url: req.body.video.url || '',
        caption: req.body.video.caption || '',
        hashtags: req.body.video.hashtags || [],
        firstComment: req.body.video.firstComment || ''
      };
    }

    // Handle tags
    if (req.body.tags && Array.isArray(req.body.tags)) {
      storyData.tags = req.body.tags;
    }

    // Handle meta description
    if (req.body.metaDescription) {
      storyData.metaDescription = req.body.metaDescription;
    }

    // Handle social media posts with proper structure - only for selected platforms
    if (req.body.socialMediaPosts || req.body.publishToPlatforms) {
      storyData.socialMediaPosts = {};
      
      // Get selected platforms from publishToPlatforms
      const selectedPlatforms = req.body.publishToPlatforms || {};
      const socialMediaData = req.body.socialMediaPosts || {};
      
      console.log('Selected platforms:', selectedPlatforms);
      console.log('Social media data:', socialMediaData);
      
      // Only create entries for explicitly selected platforms with scheduledTime
      ['facebook', 'instagram'].forEach(platform => {
        // Only create entry if platform is selected AND has a scheduled time
        const isSelected = selectedPlatforms[platform] === true;
        const hasScheduledTime = socialMediaData[platform]?.scheduledTime;
        
        console.log(`Platform ${platform}: selected=${isSelected}, hasScheduledTime=${hasScheduledTime}`);
        
        if (isSelected && hasScheduledTime) {
          const platformData = socialMediaData[platform];
          storyData.socialMediaPosts[platform] = {
            posted: platformData.posted || false,
            scheduledTime: new Date(platformData.scheduledTime),
            error: null,
            postId: null
          };
          console.log(`Created socialMediaPosts entry for ${platform}`);
        }
        // Don't create any entries for unselected platforms or platforms without scheduled time
      });
      
      console.log('Final socialMediaPosts:', storyData.socialMediaPosts);
    }

    // Handle scheduled publishing
    if (req.body.scheduledAt) {
      storyData.scheduledDate = new Date(req.body.scheduledAt);
      storyData.isPublished = false;
    }

    console.log('Final story data:', JSON.stringify(storyData, null, 2));

    const story = new Story(storyData);
    await story.save();

    const populatedStory = await Story.findById(story._id)
      .populate('author', 'name email');

    res.status(201).json({
      success: true,
      story: populatedStory
    });
  } catch (error) {
    console.error('Error creating story:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.errors,
        message: error.message
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Update story (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    // Handle selective social media platform updates
    const updateData = { ...req.body };
    
    // Only update social media posts if explicitly provided in request
    // This preserves existing scheduled posts when user just updates story content
    if (updateData.socialMediaPosts !== undefined) {
      console.log('Update - received socialMediaPosts:', updateData.socialMediaPosts);
      
      // For edit operations, completely replace socialMediaPosts with only selected platforms
      // This ensures when user changes from Facebook to Instagram, Facebook gets removed
      const newSocialMediaPosts = {};
      
      // Only include platforms that are in the new update data and have actual scheduling data
      Object.keys(updateData.socialMediaPosts).forEach(platform => {
        const platformData = updateData.socialMediaPosts[platform];
        if (platformData && platformData.scheduledTime) {
          newSocialMediaPosts[platform] = {
            ...platformData,
            scheduledTime: new Date(platformData.scheduledTime)
          };
        }
      });
      
      updateData.socialMediaPosts = newSocialMediaPosts;
      console.log('Final socialMediaPosts for update:', updateData.socialMediaPosts);
    } else {
      // If no socialMediaPosts in request, remove it from update data
      // This preserves existing socialMediaPosts in database
      delete updateData.socialMediaPosts;
      console.log('No socialMediaPosts in request - preserving existing scheduled posts');
    }

    const story = await Story.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('author', 'name email');

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json({
      success: true,
      story
    });
  } catch (error) {
    console.error('Error updating story:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete story (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const story = await Story.findByIdAndDelete(req.params.id);
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json({
      success: true,
      message: 'Story deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle story status (admin only)
router.patch('/:id/toggle-status', requireAdmin, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    story.isPublished = !story.isPublished;
    await story.save();

    const updatedStory = await Story.findById(story._id)
      .populate('author', 'name email');

    res.json({
      success: true,
      story: updatedStory,
      message: `Story ${story.isPublished ? 'published' : 'unpublished'} successfully`
    });
  } catch (error) {
    console.error('Error toggling story status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get related stories
router.get('/:id/related', async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const limit = parseInt(req.query.limit) || 4;

    // Find random stories from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const relatedStories = await Story.aggregate([
      {
        $match: {
          _id: { $ne: story._id }, // Exclude current story being viewed
          isPublished: true,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      { $sample: { size: limit } }, // Random selection
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author'
        }
      },
      {
        $unwind: '$author'
      },
      {
        $project: {
          title: 1,
          excerpt: 1,
          slug: 1,
          featuredImage: 1,
          image: 1,
          isFeatured: 1,
          createdAt: 1,
          views: 1,
          tags: 1,
          'author.name': 1,
          'author.email': 1
        }
      }
    ]);

    res.json({
      success: true,
      stories: relatedStories
    });
  } catch (error) {
    console.error('Error fetching related stories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get next story
router.get('/:id/next', async (req, res) => {
  try {
    const currentStory = await Story.findById(req.params.id);
    
    if (!currentStory) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Get all published stories sorted by creation date (newest first)
    const allStories = await Story.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .select('_id');

    // Find current story index
    const currentIndex = allStories.findIndex(story => story._id.toString() === req.params.id);
    
    if (currentIndex === -1) {
      return res.status(404).json({ error: 'Current story not found in published stories' });
    }

    // Next story is the one before current (older story) in the sorted list
    // If we're at the last story, loop back to the first story
    const nextIndex = currentIndex + 1 >= allStories.length ? 0 : currentIndex + 1;

    const nextStory = await Story.findById(allStories[nextIndex]._id)
      .populate('author', 'name email')
      .select('-socialMediaPosts -content -__v');

    res.json({
      success: true,
      story: transformStoryForFrontend(nextStory)
    });
  } catch (error) {
    console.error('Error fetching next story:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get previous story
router.get('/:id/previous', async (req, res) => {
  try {
    const currentStory = await Story.findById(req.params.id);
    
    if (!currentStory) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Get all published stories sorted by creation date (newest first)
    const allStories = await Story.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .select('_id');

    // Find current story index
    const currentIndex = allStories.findIndex(story => story._id.toString() === req.params.id);
    
    if (currentIndex === -1) {
      return res.status(404).json({ error: 'Current story not found in published stories' });
    }

    // Previous story is the one after current (newer story) in the sorted list
    // If we're at the first story, loop back to the last story
    const previousIndex = currentIndex - 1 < 0 ? allStories.length - 1 : currentIndex - 1;

    const previousStory = await Story.findById(allStories[previousIndex]._id)
      .populate('author', 'name email')
      .select('-socialMediaPosts -content -__v');

    res.json({
      success: true,
      story: transformStoryForFrontend(previousStory)
    });
  } catch (error) {
    console.error('Error fetching previous story:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;