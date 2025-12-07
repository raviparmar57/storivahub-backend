const express = require('express');
const multer = require('multer');
const { uploadImage, uploadVideo } = require('../services/cloudinary');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/avi',
      'video/mov',
      'video/wmv'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Upload single file (image or video)
router.post('/', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { type } = req.body; // 'image' or 'video'
    const fileBuffer = req.file.buffer;
    const base64Data = `data:${req.file.mimetype};base64,${fileBuffer.toString('base64')}`;

    let result;
    
    if (type === 'video' || req.file.mimetype.startsWith('video/')) {
      result = await uploadVideo(base64Data);
    } else {
      result = await uploadImage(base64Data);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload multiple files
router.post('/multiple', requireAdmin, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const uploadPromises = req.files.map(async (file) => {
      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      
      if (file.mimetype.startsWith('video/')) {
        return await uploadVideo(base64Data);
      } else {
        return await uploadImage(base64Data);
      }
    });

    const results = await Promise.all(uploadPromises);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;