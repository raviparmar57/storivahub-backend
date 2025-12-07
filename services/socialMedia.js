const axios = require('axios');

// Facebook API Integration
class FacebookAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  async postVideo(videoUrl, caption, hashtags, firstComment) {
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v24.0/${process.env.FACEBOOK_PAGE_ID}/videos`,
        {
          file_url: videoUrl,
          description: `${caption}\n\n${hashtags.map(tag => `#${tag}`).join(' ')}`
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const postId = response.data.id;
      console.log('Facebook post created with ID:', postId);

      return { 
        success: true, 
        postId, 
        needsComment: !!firstComment,
        firstComment: firstComment 
      };
    } catch (error) {
      console.error('Facebook post error:', error);
      const errorMessage = error.response?.data?.error?.message || 
                           error.response?.data?.message || 
                           error.message || 
                           'Unknown Facebook API error';
      return { success: false, error: errorMessage };
    }
  }

  async postComment(postId, comment) {
    try {
      console.log('Adding Facebook comment to post:', postId);
      console.log('Comment text:', comment);
      
      // Try using the page ID instead of post ID for commenting
      const pageId = process.env.FACEBOOK_PAGE_ID;
      
      const response = await axios.post(
        `https://graph.facebook.com/v24.0/${pageId}_${postId}/comments`,
        {
          message: comment
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );
      
      console.log('Facebook comment added successfully:', response.data);
      return { success: true, commentId: response.data.id };
    } catch (error) {
      console.error('Failed to add Facebook comment:', error.response?.data || error.message);
      
      // Try alternative approach - using just the post ID
      try {
        console.log('Retrying with alternative post ID format...');
        const retryResponse = await axios.post(
          `https://graph.facebook.com/v24.0/${postId}/comments`,
          {
            message: comment
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`
            }
          }
        );
        
        console.log('Facebook comment added successfully on retry:', retryResponse.data);
        return { success: true, commentId: retryResponse.data.id };
      } catch (retryError) {
        console.error('Failed to add Facebook comment on retry:', retryError.response?.data || retryError.message);
        const errorMessage = error.response?.data?.error?.message || 
                             error.response?.data?.message || 
                             error.message || 
                             'Failed to add comment - permissions error';
        return { success: false, error: errorMessage };
      }
    }
  }
}

// Instagram API Integration
class InstagramAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  async postVideo(videoUrl, caption, hashtags, firstComment) {
    try {
      // Create media container for Instagram Reel
      const createResponse = await axios.post(
        `https://graph.facebook.com/v24.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media`,
        {
          media_type: "REELS",  // Specify this is a Reel
          video_url: videoUrl,
          caption: `${caption}\n\n${hashtags.map(tag => `#${tag}`).join(' ')}`
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const creationId = createResponse.data.id;
      console.log('Instagram Reel container created with ID:', creationId);

      // Wait for media container to finish processing
      console.log('Waiting for Instagram media container to finish processing...');
      const isReady = await this.waitForMediaReady(creationId);
      
      if (!isReady) {
        throw new Error('Media container failed to process or timed out');
      }

      // Publish the media
      console.log('Media container ready, publishing Instagram Reel...');
      const publishResponse = await axios.post(
        `https://graph.facebook.com/v24.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media_publish`,
        {
          creation_id: creationId
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      console.log('Instagram Reel published successfully with ID:', publishResponse.data.id);
      return { 
        success: true, 
        postId: publishResponse.data.id, 
        needsComment: !!firstComment,
        firstComment: firstComment 
      };
    } catch (error) {
      console.error('Instagram post error:', error);
      const errorMessage = error.response?.data?.error?.message || 
                           error.response?.data?.message || 
                           error.message || 
                           'Unknown Instagram API error';
      return { success: false, error: errorMessage };
    }
  }

  async waitForMediaReady(creationId, maxRetries = 30, retryDelay = 10000) {
    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`Checking media container status (attempt ${attempt}/${maxRetries})...`);
        
        const statusResponse = await axios.get(
          `https://graph.facebook.com/v24.0/${creationId}`,
          {
            params: {
              fields: 'status_code,status'
            },
            headers: {
              'Authorization': `Bearer ${this.accessToken}`
            }
          }
        );

        const status = statusResponse.data.status_code || statusResponse.data.status;
        console.log(`Media container status: ${status}`);

        if (status === 'FINISHED') {
          console.log('✅ Media container processing completed successfully!');
          return true;
        }

        if (status === 'ERROR' || status === 'EXPIRED') {
          console.error(`❌ Media container processing failed with status: ${status}`);
          return false;
        }

        if (status === 'IN_PROGRESS' || status === 'PUBLISHED') {
          console.log(`⏳ Media container still processing... waiting ${retryDelay/1000}s`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        console.log(`⚠️  Unknown status: ${status}, continuing to wait...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      console.error('❌ Timeout: Media container did not finish processing within time limit');
      return false;
    } catch (error) {
      console.error('Error checking media container status:', error.response?.data || error.message);
      return false;
    }
  }

  async postComment(postId, comment) {
    try {
      console.log('Adding Instagram comment to post:', postId);
      console.log('Comment text:', comment);
      
      const response = await axios.post(
        `https://graph.facebook.com/v24.0/${postId}/comments`,
        {
          message: comment
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Instagram comment added successfully:', response.data);
      return { success: true, commentId: response.data.id };
    } catch (error) {
      console.error('Failed to add Instagram comment:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.error?.message || 
                           error.response?.data?.message || 
                           error.message || 
                           'Failed to add Instagram comment';
      return { success: false, error: errorMessage };
    }
  }
}

// Twitter API Integration
class TwitterAPI {
  constructor(apiKey, apiSecret, accessToken, accessTokenSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accessToken = accessToken;
    this.accessTokenSecret = accessTokenSecret;
  }

  async postVideo(videoUrl, caption, hashtags, firstComment) {
    try {
      const tweetText = `${caption}\n\n${hashtags.map(tag => `#${tag}`).join(' ')}`;
      
      // Note: Twitter API v2 requires proper OAuth and video upload is complex
      // For now, return mock response - implement proper Twitter API v2 integration
      return { 
        success: true, 
        postId: `twitter_${Date.now()}`,
        note: 'Twitter integration requires proper OAuth setup'
      };
    } catch (error) {
      console.error('Twitter post error:', error);
      return { success: false, error: error.message };
    }
  }
}

// YouTube API Integration
class YouTubeAPI {
  constructor(apiKey, clientId, clientSecret) {
    this.apiKey = apiKey;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async uploadVideo(videoUrl, title, description, hashtags) {
    try {
      const videoDescription = `${description}\n\nTags: ${hashtags.map(tag => `#${tag}`).join(' ')}`;
      
      // Note: YouTube upload requires OAuth2 and is more complex
      return { 
        success: true, 
        videoId: `youtube_${Date.now()}`,
        note: 'YouTube integration requires OAuth2 setup and proper video upload flow'
      };
    } catch (error) {
      console.error('YouTube upload error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Social Media Scheduler
class SocialMediaScheduler {
  constructor() {
    this.facebook = new FacebookAPI(process.env.FACEBOOK_ACCESS_TOKEN);
    this.instagram = new InstagramAPI(process.env.INSTAGRAM_ACCESS_TOKEN);
    this.twitter = new TwitterAPI(
      process.env.TWITTER_API_KEY,
      process.env.TWITTER_API_SECRET,
      process.env.TWITTER_ACCESS_TOKEN,
      process.env.TWITTER_ACCESS_TOKEN_SECRET
    );
    this.youtube = new YouTubeAPI(
      process.env.YOUTUBE_API_KEY,
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET
    );
  }

  async postToAllPlatforms(videoData) {
    const results = {
      facebook: null,
      instagram: null,
      twitter: null,
      youtube: null
    };

    try {
      const [facebookResult, instagramResult, twitterResult, youtubeResult] = await Promise.allSettled([
        this.facebook.postVideo(videoData.videoUrl, videoData.caption, videoData.hashtags, videoData.firstComment),
        this.instagram.postVideo(videoData.videoUrl, videoData.caption, videoData.hashtags, videoData.firstComment),
        this.twitter.postVideo(videoData.videoUrl, videoData.caption, videoData.hashtags, videoData.firstComment),
        this.youtube.uploadVideo(videoData.videoUrl, videoData.title, videoData.caption, videoData.hashtags)
      ]);

      results.facebook = facebookResult.status === 'fulfilled' ? facebookResult.value : { success: false, error: facebookResult.reason };
      results.instagram = instagramResult.status === 'fulfilled' ? instagramResult.value : { success: false, error: instagramResult.reason };
      results.twitter = twitterResult.status === 'fulfilled' ? twitterResult.value : { success: false, error: twitterResult.reason };
      results.youtube = youtubeResult.status === 'fulfilled' ? youtubeResult.value : { success: false, error: youtubeResult.reason };

      return results;
    } catch (error) {
      console.error('Error posting to social media platforms:', error);
      return results;
    }
  }
}

module.exports = {
  FacebookAPI,
  InstagramAPI,
  TwitterAPI,
  YouTubeAPI,
  SocialMediaScheduler
};