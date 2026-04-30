const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
  lazyConnect: false,
});

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

module.exports = redis;
