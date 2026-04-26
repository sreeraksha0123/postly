import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    if (times > 3) return null
    return Math.min(times * 1000, 3000)
  }
})

redis.on('connect', () => console.log('[REDIS] Connected'))
redis.on('error', (err) => console.error('[REDIS] Error:', err.message))

export default redis
