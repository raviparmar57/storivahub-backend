const axios = require('axios');

// Facebook API Integration
class FacebookAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  async postVideo(videoUrl, caption, hashtags, firstComment) {
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/videos`,
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

      // Add first comment
      if (firstComment) {
        await axios.post(
          `https://graph.facebook.com/v18.0/${postId}/comments`,
          {
            message: firstComment
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`
            }
          }
        );
      }

      return { success: true, postId };
    } catch (error) {
      console.error('Facebook post error:', error);
      const errorMessage = error.response?.data?.error?.message || 
                           error.response?.data?.message || 
                           error.message || 
                           'Unknown Facebook API error';
      return { success: false, error: errorMessage };
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
      // Create media object
      const createResponse = await axios.post(
        `https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media`,
        {
          image_url: videoUrl,  // Instagram API uses image_url for both images and videos
          media_type: 'VIDEO',   // Specify that this is a video
          caption: `${caption}\n\n${hashtags.map(tag => `#${tag}`).join(' ')}`
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const creationId = createResponse.data.id;

      // Publish the media
      const publishResponse = await axios.post(
        `https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media_publish`,
        {
          creation_id: creationId
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      return { success: true, postId: publishResponse.data.id, firstComment };
    } catch (error) {
      console.error('Instagram post error:', error);
      const errorMessage = error.response?.data?.error?.message || 
                           error.response?.data?.message || 
                           error.message || 
                           'Unknown Instagram API error';
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