const cron = require('node-cron');
const Story = require('../models/Story');
const { SocialMediaScheduler } = require('./socialMedia');
const { getCurrentUTCTime, isScheduledTimeReached, logWithISTTime, formatDateTimeIST } = require('../utils/timezone');

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

    logWithISTTime('Post scheduler initialized');
  }

  async processScheduledPosts() {
    try {
      const now = getCurrentUTCTime();
      logWithISTTime('Processing scheduled posts...', `Current UTC: ${now.toISOString()}`, `Current IST: ${formatDateTimeIST(now)}`);
      
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
          }
        ]
      });

      logWithISTTime(`Found ${storiesWithScheduledPosts.length} stories with scheduled social media posts`);
      
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
      // Generate auto first comment if not present
      const generateFirstComment = (storyId) => {
        const baseUrl = process.env.FRONTEND_URL || 'https://storivahub.vercel.app';
        return `FULL STORY 👇👇👇 ${baseUrl}/s/${storyId}`;
      };

      const videoData = {
        videoUrl: story.video.url,
        caption: story.video.caption || story.title,
        hashtags: story.video.hashtags || [],
        firstComment: story.video.firstComment || generateFirstComment(story._id),
        title: story.title
      };

      console.log('Posting to social media for story:', story.title);
      console.log('Video data:', JSON.stringify(videoData, null, 2));

      const now = new Date();
      const results = {
        facebook: null,
        instagram: null
      };

      // Only post to platforms that are scheduled for this time and haven't been posted yet

      // Post to Facebook if scheduled
      if (story.socialMediaPosts.facebook.scheduledTime && 
          isScheduledTimeReached(story.socialMediaPosts.facebook.scheduledTime) && 
          !story.socialMediaPosts.facebook.posted) {
        logWithISTTime(`Posting to Facebook - Scheduled: ${formatDateTimeIST(story.socialMediaPosts.facebook.scheduledTime)}, Current: ${formatDateTimeIST(now)}`);
        results.facebook = await this.scheduler.facebook.postVideo(
          videoData.videoUrl, 
          videoData.caption, 
          videoData.hashtags, 
          videoData.firstComment
        );
      }

      // Post to Instagram if scheduled
      if (story.socialMediaPosts.instagram.scheduledTime && 
          isScheduledTimeReached(story.socialMediaPosts.instagram.scheduledTime) && 
          !story.socialMediaPosts.instagram.posted) {
        logWithISTTime(`Posting to Instagram - Scheduled: ${formatDateTimeIST(story.socialMediaPosts.instagram.scheduledTime)}, Current: ${formatDateTimeIST(now)}`);
        results.instagram = await this.scheduler.instagram.postVideo(
          videoData.videoUrl, 
          videoData.caption, 
          videoData.hashtags, 
          videoData.firstComment
        );
      }

      // Twitter and YouTube removed

      // Update Facebook posting status
      if (results.facebook) {
        story.socialMediaPosts.facebook.posted = results.facebook.success;
        if (results.facebook.success) {
          story.socialMediaPosts.facebook.postedAt = new Date(); // Record actual posting time
        }
        if (results.facebook.postId) {
          story.socialMediaPosts.facebook.postId = results.facebook.postId;
          
          // Post comment if needed - but don't delay the main save
          if (results.facebook.success && results.facebook.needsComment && results.facebook.firstComment) {
            console.log('Scheduling Facebook comment for post:', results.facebook.postId);
            
            // Post comment after a short delay to ensure post is processed
            setTimeout(async () => {
              try {
                const commentResult = await this.scheduler.facebook.postComment(
                  results.facebook.postId, 
                  results.facebook.firstComment
                );
                
                // Update the story in the database separately to avoid race conditions
                await Story.findByIdAndUpdate(story._id, {
                  $set: commentResult.success 
                    ? { 'socialMediaPosts.facebook.commentId': commentResult.commentId }
                    : { 'socialMediaPosts.facebook.commentError': commentResult.error }
                });
                
                if (commentResult.success) {
                  console.log('Facebook comment posted successfully');
                } else {
                  console.error('Failed to post Facebook comment:', commentResult.error);
                }
              } catch (commentError) {
                console.error('Error posting Facebook comment:', commentError);
              }
            }, 10000); // 10 second delay
          }
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
        if (results.instagram.success) {
          story.socialMediaPosts.instagram.postedAt = new Date(); // Record actual posting time
        }
        if (results.instagram.postId) {
          story.socialMediaPosts.instagram.postId = results.instagram.postId;
          
          // Post comment if needed - but don't delay the main save
          if (results.instagram.success && results.instagram.needsComment && results.instagram.firstComment) {
            console.log('Scheduling Instagram comment for post:', results.instagram.postId);
            
            // Post comment after a 10 second delay
            setTimeout(async () => {
              try {
                const commentResult = await this.scheduler.instagram.postComment(
                  results.instagram.postId, 
                  results.instagram.firstComment
                );
                
                // Update the story in the database separately to avoid race conditions
                await Story.findByIdAndUpdate(story._id, {
                  $set: commentResult.success 
                    ? { 'socialMediaPosts.instagram.commentId': commentResult.commentId }
                    : { 'socialMediaPosts.instagram.commentError': commentResult.error }
                });
                
                if (commentResult.success) {
                  console.log('Instagram comment posted successfully');
                } else {
                  console.error('Failed to post Instagram comment:', commentResult.error);
                }
              } catch (commentError) {
                console.error('Error posting Instagram comment:', commentError);
              }
            }, 10000); // 10 second delay
          }
        }
        if (!results.instagram.success) {
          story.socialMediaPosts.instagram.error = typeof results.instagram.error === 'string' 
            ? results.instagram.error 
            : JSON.stringify(results.instagram.error);
        }
      }

      // Twitter and YouTube status updates removed

      await story.save();
      logWithISTTime(`Social media posting completed for story: ${story.title}`);

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