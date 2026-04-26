const prisma = require('../config/db');
const contentService = require('./content');
const { addPublishJobs } = require('../queue/publisher');

class PublishingService {
  /**
   * Generates, saves, and queues content for immediate publishing
   */
  async publishPost(userId, params) {
    const { idea, postType, platforms, tone, language, model } = params;

    // 1. Generate content via AI
    const apiGenerated = await contentService.generateMultiPlatformContent(userId, params);

    // 2. Atomic Database Transaction
    return await prisma.$transaction(async (tx) => {
      // Create main Post record
      const post = await tx.post.create({
        data: {
          userId,
          idea,
          postType: postType.toUpperCase(),
          tone,
          language,
          modelUsed: apiGenerated.model_used,
          status: 'QUEUED'
        }
      });

      // Create individual PlatformPost records
      const platformPostsPromises = platforms.map((p) => {
        const gen = apiGenerated.generated[p.toLowerCase()];
        return tx.platformPost.create({
          data: {
            postId: post.id,
            platform: p.toUpperCase(),
            content: gen.content,
            status: 'QUEUED'
          }
        });
      });

      const platformPosts = await Promise.all(platformPostsPromises);

      // 3. Queue BullMQ Jobs
      await addPublishJobs(post, platformPosts);

      return {
        postId: post.id,
        platforms: platformPosts.map(pp => ({
          platform: pp.platform,
          platformPostId: pp.id,
          status: pp.status
        }))
      };
    });
  }

  /**
   * Generates, saves, and schedules content for future publishing
   */
  async schedulePost(userId, params) {
    const { idea, postType, platforms, tone, language, model, publishAt } = params;

    // 1. Generate content via AI
    const apiGenerated = await contentService.generateMultiPlatformContent(userId, params);

    const publishDate = new Date(publishAt);
    const delay = publishDate.getTime() - Date.now();

    // 2. Atomic Database Transaction
    return await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          userId,
          idea,
          postType: postType.toUpperCase(),
          tone,
          language,
          modelUsed: apiGenerated.model_used,
          status: 'QUEUED',
          publishAt: publishDate
        }
      });

      const platformPostsPromises = platforms.map((p) => {
        const gen = apiGenerated.generated[p.toLowerCase()];
        return tx.platformPost.create({
          data: {
            postId: post.id,
            platform: p.toUpperCase(),
            content: gen.content,
            status: 'QUEUED'
          }
        });
      });

      const platformPosts = await Promise.all(platformPostsPromises);

      // 3. Queue BullMQ Jobs with Delay
      // We'll update addPublishJobs to accept extra options if needed, 
      // or implement scheduling here. Since addPublishJobs uses .add(), 
      // we can pass delay in options.
      // Modifying queue logic slightly to support delay...
      
      // I'll handle the manual queueing here to ensure delay is applied
      const { platformPublishQueue } = require('../queue/publisher');
      for (const pp of platformPosts) {
        await platformPublishQueue.add(
          `publish-${pp.platform}`,
          {
            platformPostId: pp.id,
            postId: post.id,
            platform: pp.platform,
            userId: post.userId,
            content: pp.content
          },
          {
            delay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 }
          }
        );
      }

      return {
        postId: post.id,
        platforms: platformPosts.map(pp => ({
          platform: pp.platform,
          platformPostId: pp.id,
          status: pp.status
        }))
      };
    });
  }
}

module.exports = new PublishingService();
