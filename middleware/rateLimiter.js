// Simple in-memory rate limiter
// For production, consider using Redis-based rate limiting

const rateLimitMap = new Map();

const cleanupInterval = 60 * 1000; // Clean up every minute

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, cleanupInterval);

/**
 * Rate limiting middleware
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of requests per window
 * @param {string} options.message - Error message
 * @param {Function} options.keyGenerator - Function to generate rate limit key
 */
const rateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // 100 requests per window
    message = 'Too many requests from this IP, please try again later.',
    keyGenerator = (req) => req.ip || req.connection.remoteAddress
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    // Get or create rate limit entry
    let rateLimitInfo = rateLimitMap.get(key);

    if (!rateLimitInfo || now > rateLimitInfo.resetTime) {
      // Create new entry or reset expired one
      rateLimitInfo = {
        count: 0,
        resetTime: now + windowMs
      };
      rateLimitMap.set(key, rateLimitInfo);
    }

    // Increment count
    rateLimitInfo.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - rateLimitInfo.count));
    res.setHeader('X-RateLimit-Reset', new Date(rateLimitInfo.resetTime).toISOString());

    // Check if limit exceeded
    if (rateLimitInfo.count > max) {
      return res.status(429).json({
        status: 'error',
        message,
        retryAfter: Math.ceil((rateLimitInfo.resetTime - now) / 1000)
      });
    }

    next();
  };
};

// Specific rate limiters for different routes
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many API requests, please try again later.'
});

exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later.',
  keyGenerator: (req) => {
    // Use email if available, otherwise IP
    return req.body?.email || req.ip || req.connection.remoteAddress;
  }
});

exports.strictAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 attempts per hour
  message: 'Too many authentication attempts. Please try again after an hour.',
  keyGenerator: (req) => {
    return req.body?.email || req.ip || req.connection.remoteAddress;
  }
});

// Also export the rateLimit function for custom usage
exports.rateLimit = rateLimit;

