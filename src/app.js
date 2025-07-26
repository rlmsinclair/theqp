const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const webhookRoutes = require('./routes/webhook');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const db = require('./database');

// Create Express app
const app = express();

// Trust proxy for accurate IPs (Railway uses proxies)
// Set to specific number or list of proxies for express-rate-limit compatibility
app.set('trust proxy', 1); // Trust first proxy

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["https://js.stripe.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: config.app.env === 'production' 
    ? ['https://theqp.ai', 'https://www.theqp.ai']
    : true,
  credentials: true
}));

// Compression
app.use(compression());

// Request logging
app.use((req, res, next) => {
  // Skip logging for health checks
  if (req.path === '/api/health') {
    return next();
  }
  
  logger.info({
    type: 'request',
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Webhook routes (before body parsing)
app.use('/webhook', webhookRoutes);

// Body parsing (after webhook routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files with caching
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: config.app.env === 'production' ? '1d' : 0,
  etag: true,
  lastModified: true
}));

// API routes
app.use('/api', apiLimiter, apiRoutes);

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.app.env
  });
});

// Detailed health check
app.get('/health/detailed', async (req, res) => {
  const checks = {
    api: 'ok',
    database: 'checking',
    timestamp: new Date().toISOString(),
    environment: config.app.env,
    uptime: process.uptime()
  };
  
  try {
    // Check database
    const dbHealthy = await db.checkConnection();
    checks.database = dbHealthy ? 'ok' : 'error';
    
    // Check Stripe connectivity (only if enabled)
    if (config.features.stripeEnabled) {
      try {
        const stripe = require('stripe')(config.stripe.secretKey);
        await stripe.paymentIntents.list({ limit: 1 });
        checks.stripe = 'ok';
      } catch (err) {
        checks.stripe = 'error';
      }
    } else {
      checks.stripe = 'disabled';
    }
    
    const allHealthy = Object.values(checks).every(v => v === 'ok' || typeof v !== 'string');
    const statusCode = allHealthy ? 200 : 503;
    
    res.status(statusCode).json(checks);
  } catch (error) {
    checks.database = 'error';
    res.status(503).json(checks);
  }
});

// Page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/faq', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'faq.html'));
});

app.get('/lookup', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'lookup.html'));
});

app.get('/mars', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mars.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'API endpoint not found'
    }
  });
});


// Error handler (must be last)
app.use(errorHandler);

module.exports = app;