import { Queue } from 'bullmq'
import redis from '../config/redis.js'

export const publishQueue = new Queue('platform-publish', {
  connection: redis
})

export async function addPublishJobs(post, platformPosts) {
  const jobPromises = platformPosts.map((pp) => {
    return publishQueue.add(
      `publish-${pp.platform.toLowerCase()}`,
      {
        platformPostId: pp.id,
        postId: post.id,
        platform: pp.platform,
        userId: post.userId,
        content: pp.content
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000 // 1s, 2s, 4s retries
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    )
  })

  return await Promise.all(jobPromises)
}
