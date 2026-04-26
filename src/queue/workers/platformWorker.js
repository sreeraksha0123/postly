import { Worker } from 'bullmq'
import prisma from '../../config/db.js'
import redis from '../../config/redis.js'

let worker

try {
  worker = new Worker('platform-publish', async (job) => {
    const { platformPostId, platform, content, userId, postId } = job.data
    
    console.log(`[Worker] Processing ${platform} job for post ${postId}`)
    
    // Update to PROCESSING
    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: 'PROCESSING', attempts: job.attemptsMade + 1 }
    })

    // STUB: log instead of actually posting
    console.log(`[Worker] Would post to ${platform}: ${content?.substring(0, 50)}...`)
    await new Promise(resolve => setTimeout(resolve, 500))

    // Update to PUBLISHED
    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: 'PUBLISHED', publishedAt: new Date() }
    })

    // Check if all platform posts for this post are terminal
    const allPlatformPosts = await prisma.platformPost.findMany({
      where: { postId }
    })
    const allDone = allPlatformPosts.every(pp =>
      ['PUBLISHED', 'FAILED', 'CANCELLED'].includes(pp.status)
    )
    const anyFailed = allPlatformPosts.some(pp => pp.status === 'FAILED')
    
    if (allDone) {
      await prisma.post.update({
        where: { id: postId },
        data: { status: anyFailed ? 'FAILED' : 'PUBLISHED' }
      })
    }

    console.log(`[Worker] ${platform} job completed for post ${postId}`)

  }, {
    connection: redis,
    concurrency: 5,
  })

  worker.on('failed', async (job, err) => {
    console.error(`[Worker] Job failed: ${job?.data?.platform} — ${err.message}`)
    if (job?.data?.platformPostId) {
      await prisma.platformPost.update({
        where: { id: job.data.platformPostId },
        data: {
          status: 'FAILED',
          errorMessage: err.message,
          attempts: (job.attemptsMade || 0) + 1
        }
      }).catch(() => {})
    }
  })

  worker.on('completed', (job) => {
    console.log(`[Worker] Job completed: ${job?.data?.platform}`)
  })

  console.log('[Worker] Platform publish worker started')

} catch (err) {
  console.error('[Worker] Failed to initialize worker (non-fatal):', err.message)
}

export default worker
