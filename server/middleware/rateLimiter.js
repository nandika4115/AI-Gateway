const rateLimit = require('express-rate-limit');

const rateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute window
  max: 100,                    // max 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      blocked: true,
      reason: 'Rate limit exceeded. Max 10 requests per minute.',
      retryAfter: '60 seconds'
    });
  }
});

module.exports = rateLimiter;