const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Story = require('../models/Story');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all stories (public route for published stories, admin route for all)
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isLength({ min: 1 }),
  query('tag').optional().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const tag = req.query.tag;
    
    let query = {};
    
    // Always filter to published stories for public routes
    // Admin routes should use /admin/stories endpoint instead
    query.isPublished = true;

    // Add search functionality
    if (search) {
      query.$text = { $search: search };
    }

    // Add tag filtering
    if (tag) {
      query.tags = { $in: [tag] };
    }
    
    const stories = await Story.find(query)
      .populate('author', 'name email')
      .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-socialMediaPosts -__v');
    
    const total = await Story.countDocuments(query);
    
    res.json({
      success: true,
      stories,
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

// Get single story by ID
router.get('/:id', async (req, res) => {
  try {
    const story = await Story.findById(req.params.id)
      .populate('author', 'name email');
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json({
      success: true,
      story
    });
  } catch (error) {
    console.error('Error fetching story:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create story (admin only)
router.post('/', requireAdmin, [
  body('title').isLength({ min: 1, max: 200 }).trim(),
  body('content').isLength({ min: 1 }).trim(),
  body('image.url').isURL(),
  body('image.publicId').isLength({ min: 1 }),
  body('tags').optional().isArray(),
  body('metaDescription').optional().isLength({ max: 160 }),
  body('scheduledDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const storyData = {
      ...req.body,
      author: req.user._id
    };

    // Handle social media posts - preserve scheduledTime if provided
    if (req.body.socialMediaPosts) {
      storyData.socialMediaPosts = req.body.socialMediaPosts;
    } else {
      storyData.socialMediaPosts = {
        facebook: { posted: false },
        instagram: { posted: false },
        twitter: { posted: false },
        youtube: { posted: false }
      };
    }

    if (req.body.scheduledDate) {
      storyData.scheduledDate = new Date(req.body.scheduledDate);
    }

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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update story (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const story = await Story.findByIdAndUpdate(
      req.params.id,
      req.body,
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

// Get related stories
router.get('/:id/related', async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Find stories with similar tags or recent stories
    const relatedStories = await Story.find({
      _id: { $ne: story._id },
      isPublished: true,
      $or: [
        { tags: { $in: story.tags } },
        { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
      ]
    })
    .populate('author', 'name email')
    .limit(6)
    .select('-socialMediaPosts -content -__v')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      stories: relatedStories
    });
  } catch (error) {
    console.error('Error fetching related stories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;