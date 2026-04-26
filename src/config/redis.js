import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Essential for BullMQ
});

redis.on('connect', () => {
  console.log('[REDIS] Connected successfully');
});

redis.on('error', (err) => {
  console.error('[REDIS] Connection error:', err.message);
});

export default redis;
