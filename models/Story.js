const mongoose = require('mongoose');
const slugify = require('slugify');

const storySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  image: {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: Number,
    height: Number
  },
  video: {
    url: String,
    publicId: String,
    caption: String,
    hashtags: [String],
    firstComment: String,
    duration: Number,
    width: Number,
    height: Number
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  scheduledDate: Date,
  socialMediaPosts: {
    facebook: {
      postId: String,
      posted: { type: Boolean, default: false },
      scheduledTime: Date,
      error: String
    },
    instagram: {
      postId: String,
      posted: { type: Boolean, default: false },
      scheduledTime: Date,
      error: String
    },
    twitter: {
      postId: String,
      posted: { type: Boolean, default: false },
      scheduledTime: Date,
      error: String
    },
    youtube: {
      videoId: String,
      posted: { type: Boolean, default: false },
      scheduledTime: Date,
      error: String
    }
  },
  views: {
    type: Number,
    default: 0
  },
  tags: [String],
  metaDescription: {
    type: String,
    maxlength: 160
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Create indexes for performance
storySchema.index({ slug: 1 });
storySchema.index({ isPublished: 1, createdAt: -1 });
storySchema.index({ scheduledDate: 1 });
storySchema.index({ tags: 1 });
storySchema.index({ title: 'text', content: 'text' });
storySchema.index({ 'socialMediaPosts.facebook.scheduledTime': 1 });
storySchema.index({ 'socialMediaPosts.instagram.scheduledTime': 1 });
storySchema.index({ 'socialMediaPosts.twitter.scheduledTime': 1 });
storySchema.index({ 'socialMediaPosts.youtube.scheduledTime': 1 });

// Generate unique slug from title
storySchema.pre('save', async function(next) {
  try {
    if ((this.isModified('title') || this.isNew) && this.title) {
      let baseSlug = slugify(this.title, {
        lower: true,
        strict: true,
        remove: /[*+~.()'"!:@]/g
      });
      
      // If slugify returns empty string, use a default with timestamp
      if (!baseSlug || baseSlug.length === 0) {
        baseSlug = `story-${Date.now()}`;
      }
      
      let uniqueSlug = baseSlug;
      let counter = 1;
      
      // Ensure uniqueness by checking existing slugs
      const Story = mongoose.model('Story');
      let existingStory = await Story.findOne({ 
        slug: uniqueSlug, 
        _id: { $ne: this._id } 
      });
      
      while (existingStory) {
        uniqueSlug = `${baseSlug}-${counter}`;
        counter++;
        existingStory = await Story.findOne({ 
          slug: uniqueSlug, 
          _id: { $ne: this._id } 
        });
      }
      
      this.slug = uniqueSlug;
    }
    next();
  } catch (error) {
    console.error('Slug generation error:', error);
    next(error);
  }
});

// Virtual for excerpt
storySchema.virtual('excerpt').get(function() {
  if (!this.content) {
    return '';
  }
  const plainText = this.content.replace(/<[^>]*>/g, '');
  return plainText.length > 200 ? plainText.substring(0, 200) + '...' : plainText;
});

// Include virtuals in JSON
storySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Story', storySchema);