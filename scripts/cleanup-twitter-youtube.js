const mongoose = require('mongoose');
const Story = require('../models/Story');
require('dotenv').config();

async function cleanupTwitterYoutube() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Remove Twitter and YouTube fields from all stories
    const result = await Story.updateMany(
      {},
      {
        $unset: {
          'socialMediaPosts.twitter': '',
          'socialMediaPosts.youtube': ''
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} stories`);
    console.log('Twitter and YouTube data removed from all stories');
    
    await mongoose.disconnect();
    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupTwitterYoutube();