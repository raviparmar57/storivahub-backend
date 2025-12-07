const cron = require('node-cron');
const Story = require('../models/Story');
const { SocialMediaScheduler } = require('./socialMedia');

class PostScheduler {
  constructor() {
    this.scheduler = new SocialMediaScheduler();
    this.isRunning = false;
  }

  init() {
    // Run every minute to check for scheduled posts
    cron.schedule('* * * * *', async () => {
      if (this.isRunning) return;
      this.isRunning = true;

      try {
        await this.processScheduledPosts();
      } catch (error) {
        console.error('Error in scheduler:', error);
      } finally {
        this.isRunning = false;
      }
    });

    console.log('Post scheduler initialized');
  }

  async processScheduledPosts() {
    try {
      const now = new Date();
      
      // Find stories that are scheduled to be published
      const scheduledStories = await Story.find({
        scheduledDate: { $lte: now },
        isPublished: false
      });

      for (const story of scheduledStories) {
        await this.publishStory(story);
      }

      // Find stories with scheduled social media posts
      const storiesWithScheduledPosts = await Story.find({
        isPublished: true,
        $or: [
          { 
            'socialMediaPosts.facebook.scheduledTime': { $lte: now }, 
            'socialMediaPosts.facebook.posted': false 
          },
          { 
            'socialMediaPosts.instagram.scheduledTime': { $lte: now }, 
            'socialMediaPosts.instagram.posted': false 
          },
          { 
            'socialMediaPosts.twitter.scheduledTime': { $lte: now }, 
            'socialMediaPosts.twitter.posted': false 
          },
          { 
            'socialMediaPosts.youtube.scheduledTime': { $lte: now }, 
            'socialMediaPosts.youtube.posted': false 
          }
        ]
      });

      for (const story of storiesWithScheduledPosts) {
        await this.postToSocialMedia(story);
      }

    } catch (error) {
      console.error('Error processing scheduled posts:', error);
    }
  }

  async publishStory(story) {
    try {
      story.isPublished = true;
      await story.save();
      console.log(`Published story: ${story.title}`);
    } catch (error) {
      console.error(`Error publishing story ${story.title}:`, error);
    }
  }

  async postToSocialMedia(story) {
    if (!story.video) return;

    try {
      const videoData = {
        videoUrl: story.video.url,
        caption: story.video.caption || story.title,
        hashtags: story.video.hashtags || [],
        firstComment: story.video.firstComment || '',
        title: story.title
      };

      const now = new Date();
      const results = {
        facebook: null,
        instagram: null,
        twitter: null,
        youtube: null
      };

      // Only post to platforms that are scheduled for this time and haven't been posted yet

      // Post to Facebook if scheduled
      if (story.socialMediaPosts.facebook.scheduledTime && 
          story.socialMediaPosts.facebook.scheduledTime <= now && 
          !story.socialMediaPosts.facebook.posted) {
        results.facebook = await this.scheduler.facebook.postVideo(
          videoData.videoUrl, 
          videoData.caption, 
          videoData.hashtags, 
          videoData.firstComment
        );
      }

      // Post to Instagram if scheduled
      if (story.socialMediaPosts.instagram.scheduledTime && 
          story.socialMediaPosts.instagram.scheduledTime <= now && 
          !story.socialMediaPosts.instagram.posted) {
        results.instagram = await this.scheduler.instagram.postVideo(
          videoData.videoUrl, 
          videoData.caption, 
          videoData.hashtags, 
          videoData.firstComment
        );
      }

      // Post to Twitter if scheduled
      if (story.socialMediaPosts.twitter.scheduledTime && 
          story.socialMediaPosts.twitter.scheduledTime <= now && 
          !story.socialMediaPosts.twitter.posted) {
        results.twitter = await this.scheduler.twitter.postVideo(
          videoData.videoUrl, 
          videoData.caption, 
          videoData.hashtags, 
          videoData.firstComment
        );
      }

      // Post to YouTube if scheduled
      if (story.socialMediaPosts.youtube.scheduledTime && 
          story.socialMediaPosts.youtube.scheduledTime <= now && 
          !story.socialMediaPosts.youtube.posted) {
        results.youtube = await this.scheduler.youtube.uploadVideo(
          videoData.videoUrl, 
          videoData.title, 
          videoData.caption, 
          videoData.hashtags
        );
      }

      // Update Facebook posting status
      if (results.facebook) {
        story.socialMediaPosts.facebook.posted = results.facebook.success;
        if (results.facebook.postId) {
          story.socialMediaPosts.facebook.postId = results.facebook.postId;
        }
        if (!results.facebook.success) {
          story.socialMediaPosts.facebook.error = typeof results.facebook.error === 'string' 
            ? results.facebook.error 
            : JSON.stringify(results.facebook.error);
        }
      }

      // Update Instagram posting status
      if (results.instagram) {
        story.socialMediaPosts.instagram.posted = results.instagram.success;
        if (results.instagram.postId) {
          story.socialMediaPosts.instagram.postId = results.instagram.postId;
        }
        if (!results.instagram.success) {
          story.socialMediaPosts.instagram.error = typeof results.instagram.error === 'string' 
            ? results.instagram.error 
            : JSON.stringify(results.instagram.error);
        }
      }

      // Update Twitter posting status
      if (results.twitter) {
        story.socialMediaPosts.twitter.posted = results.twitter.success;
        if (results.twitter.postId) {
          story.socialMediaPosts.twitter.postId = results.twitter.postId;
        }
        if (!results.twitter.success) {
          story.socialMediaPosts.twitter.error = typeof results.twitter.error === 'string' 
            ? results.twitter.error 
            : JSON.stringify(results.twitter.error);
        }
      }

      // Update YouTube posting status
      if (results.youtube) {
        story.socialMediaPosts.youtube.posted = results.youtube.success;
        if (results.youtube.videoId) {
          story.socialMediaPosts.youtube.videoId = results.youtube.videoId;
        }
        if (!results.youtube.success) {
          story.socialMediaPosts.youtube.error = typeof results.youtube.error === 'string' 
            ? results.youtube.error 
            : JSON.stringify(results.youtube.error);
        }
      }

      await story.save();
      console.log(`Social media posting completed for story: ${story.title}`);

    } catch (error) {
      console.error(`Error posting to social media for story ${story.title}:`, error);
    }
  }
}

let schedulerInstance = null;

const initializeScheduler = () => {
  if (!schedulerInstance) {
    schedulerInstance = new PostScheduler();
    schedulerInstance.init();
  }
  return schedulerInstance;
};

module.exports = { initializeScheduler, PostScheduler };