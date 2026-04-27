import prisma from '../config/db.js'
import { generateMultiPlatformContent } from './content.js'
import { addPublishJobs, publishQueue } from '../queue/publisher.js'

class PublishingService {
  async publishPost(userId, params) {
    const result = await generateMultiPlatformContent({ ...params, userId, prisma })

    const { post, platformPosts } = await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          userId,
          idea: params.idea,
          postType: params.postType.toUpperCase(),
          tone: params.tone,
          language: params.language || 'en',
          modelUsed: result.model_used,
          status: 'QUEUED'
        }
      })

      const platformPosts = await Promise.all(
        Object.entries(result.generated).map(([platform, data]) =>
          tx.platformPost.create({
            data: {
              postId: post.id,
              platform: platform.toUpperCase(),
              content: data.content,
              status: 'QUEUED'
            }
          })
        )
      )

      return { post, platformPosts }
    })

    await addPublishJobs(post, platformPosts)

    return {
      postId: post.id,
      platforms: platformPosts.map(pp => ({
        platform: pp.platform,
        platformPostId: pp.id,
        status: pp.status
      }))
    }
  }

  async schedulePost(userId, params) {
    const { publishAt } = params
    const scheduleDate = new Date(publishAt)

    if (scheduleDate <= new Date()) {
      throw new Error('Schedule date must be in the future')
    }

    const result = await generateMultiPlatformContent({ ...params, userId, prisma })

    const { post, platformPosts } = await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          userId,
          idea: params.idea,
          postType: params.postType.toUpperCase(),
          tone: params.tone,
          language: params.language || 'en',
          modelUsed: result.model_used,
          status: 'QUEUED',
          publishAt: scheduleDate
        }
      })

      const platformPosts = await Promise.all(
        Object.entries(result.generated).map(([platform, data]) =>
          tx.platformPost.create({
            data: {
              postId: post.id,
              platform: platform.toUpperCase(),
              content: data.content,
              status: 'QUEUED'
            }
          })
        )
      )

      return { post, platformPosts }
    })

    const delay = scheduleDate.getTime() - Date.now()

    // BullMQ handles the delay internally so we just add jobs with the delay option
    await Promise.all(
      platformPosts.map(pp =>
        publishQueue.add(
          `publish-${pp.platform.toLowerCase()}`,
          {
            platformPostId: pp.id,
            postId: post.id,
            platform: pp.platform,
            userId,
            content: pp.content
          },
          {
            delay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: false
          }
        )
      )
    )

    return {
      postId: post.id,
      platforms: platformPosts.map(pp => ({
        platform: pp.platform,
        platformPostId: pp.id,
        status: pp.status
      }))
    }
  }
}

export default new PublishingService()
