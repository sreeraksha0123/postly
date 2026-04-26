import { Worker } from 'bullmq'
import prisma from '../../config/db.js'
import redis from '../../config/redis.js'

/**
 * Worker for multi-platform publishing
 */
const worker = new Worker(
  'platform-publish',
  async (job) => {
    const { platformPostId, platform, content, postId } = job.data

    // 1. Mark as Processing
    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: 'PROCESSING', attempts: job.attemptsMade + 1 }
    })

    console.log(`[Worker] Started processing campaign ${postId} for ${platform}`)

    // 2. STUB: Actual social platform integration (Twitter/LinkedIn/etc APIs)
    // In a real app, we'd fetch socialAccount tokens, decrypt them, and call axios.post(...)
    console.log(`[Worker] STUB: Posting to ${platform}...`)
    console.log(`[Worker] Content: ${content.substring(0, 50)}...`)
    
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // 3. Mark as Published
    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: 'PUBLISHED', publishedAt: new Date() }
    })

    // 4. Check if whole Campaign (Post) is done
    const siblings = await prisma.platformPost.findMany({ where: { postId } })
    const allTerminal = siblings.every(s => ['PUBLISHED', 'FAILED', 'CANCELLED'].includes(s.status))

    if (allTerminal) {
      const anySuccess = siblings.some(s => s.status === 'PUBLISHED')
      const allFailed = siblings.every(s => s.status === 'FAILED')
      
      const newStatus = allFailed ? 'FAILED' : anySuccess ? 'PUBLISHED' : 'CANCELLED'
      
      await prisma.post.update({
        where: { id: postId },
        data: { status: newStatus }
      })
      console.log(`[Worker] Campaign ${postId} finalized with status: ${newStatus}`)
    }
  },
  { 
    connection: redis,
    concurrency: 5 
  }
)

/**
 * Global Event Handlers
 */
worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} for ${job.data.platform} successfully completed`)
})

worker.on('failed', async (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`)
  
  if (job?.data?.platformPostId) {
    await prisma.platformPost.update({
      where: { id: job.data.platformPostId },
      data: { status: 'FAILED', errorMessage: err.message }
    })
  }
})

export default worker
