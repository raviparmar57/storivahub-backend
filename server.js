const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Set server timezone to IST for consistent date handling
process.env.TZ = 'Asia/Kolkata';

// Import timezone utilities
const { logWithISTTime } = require('./utils/timezone');

// Import routes
const authRoutes = require('./routes/auth');
const storyRoutes = require('./routes/stories');
const uploadRoutes = require('./routes/upload');
const adminRoutes = require('./routes/admin');

// Import scheduler and pinger
const { initializeScheduler } = require('./services/scheduler');
const { initializePinger } = require('./services/serverPinger');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// Rate limiting - only in production
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // limit each IP to 200 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(15 * 60) // 15 minutes in seconds
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Skip rate limiting for health checks
    skip: (req) => {
      return req.path === '/api/health';
    }
  });

  // Apply rate limiting only to API routes in production
  app.use('/api/', limiter);
  console.log('Rate limiting enabled for production');
} else {
  console.log('Rate limiting disabled for development');
}

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  logWithISTTime('Connected to MongoDB');
  // Initialize scheduler after DB connection
  initializeScheduler();
  // Initialize server pinger to keep server alive
  initializePinger();
})
.catch((error) => {
  console.error('MongoDB connection error:', error);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const { getCurrentUTCTime, formatDateTimeIST } = require('./utils/timezone');
  const now = getCurrentUTCTime();
  
  res.json({ 
    status: 'OK', 
    message: 'StoryHub API is running',
    timestamp: now.toISOString(),
    serverTime: {
      utc: now.toISOString(),
      ist: formatDateTimeIST(now)
    },
    timezone: process.env.TZ || 'UTC'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

app.listen(PORT, () => {
  logWithISTTime(`Server running on port ${PORT}`);
  logWithISTTime(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logWithISTTime(`Server timezone set to: ${process.env.TZ}`);
});