import Redis from 'ioredis'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableReadyCheck: false,
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  retryStrategy: (times) => {
    if (times > 5) return null
    return Math.min(times * 500, 3000)
  }
})

redis.on('connect', () => console.log('[REDIS] Connected'))
redis.on('error', (err) => console.error('[REDIS] Error:', err.message))

export default redis
