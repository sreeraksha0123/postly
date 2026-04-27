import { Worker } from 'bullmq'
import prisma from '../../config/db.js'
import redis from '../../config/redis.js'

let worker

try {
  worker = new Worker('platform-publish', async (job) => {
    const { platformPostId, platform, content, postId } = job.data
    
    console.log(`[Worker] Processing ${platform} job`)
    
    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: 'PROCESSING', attempts: job.attemptsMade + 1 }
    })

    // stub until we have real api creds for every platform
    console.log(`[Worker] Would post to ${platform}: ${content?.substring(0, 50)}...`)
    await new Promise(resolve => setTimeout(resolve, 500))

    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: 'PUBLISHED', publishedAt: new Date() }
    })

    const all = await prisma.platformPost.findMany({ where: { postId } })
    // check if this was the last platform job so we can flip the master post status
    const done = all.every(p => ['PUBLISHED','FAILED','CANCELLED'].includes(p.status))
    if (done) {
      const anyFailed = all.some(p => p.status === 'FAILED')
      await prisma.post.update({
        where: { id: postId },
        data: { status: anyFailed ? 'FAILED' : 'PUBLISHED' }
      })
    }

  }, { connection: redis, concurrency: 5 })

  worker.on('failed', async (job, err) => {
    console.error(`[Worker] Failed: ${job?.data?.platform} — ${err.message}`)
    if (job?.data?.platformPostId) {
      await prisma.platformPost.update({
        where: { id: job.data.platformPostId },
        data: { status: 'FAILED', errorMessage: err.message }
      }).catch(() => {})
    }
  })

  console.log('[Worker] Platform worker started')

} catch (err) {
  console.error('[Worker] Init failed (non-fatal):', err.message)
}

export default worker
