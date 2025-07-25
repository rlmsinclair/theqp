const rateLimit = require('express-rate-limit');
const config = require('../config');

// Create different limiters for different endpoints
const createLimiter = (options = {}) => {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Handle trust proxy setting for Railway/production
    keyGenerator: (req) => {
      // Use X-Forwarded-For header if available (Railway provides this)
      return req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    },
    ...options
  });
};

// Specific limiters
const paymentLimiter = createLimiter({
  max: 10, // 10 payment attempts per 15 minutes
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Rate limit by email or IP (with proper proxy handling)
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    return req.body?.email || ip;
  }
});

const checkPriceLimiter = createLimiter({
  max: 30, // 30 price checks per 15 minutes
  skipFailedRequests: true
});

const apiLimiter = createLimiter({
  max: 100 // 100 requests per 15 minutes for general API
});

module.exports = {
  paymentLimiter,
  checkPriceLimiter,
  apiLimiter
};