import { Bot, InlineKeyboard } from 'grammy'
import jwt from 'jsonwebtoken'
import redis from '../config/redis.js'
import prisma from '../config/db.js'
import publishingService from './publishingService.js'
import { generatePlatformContent } from './content.js'

let bot

try {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured')

  bot = new Bot(token)
  console.log('[Telegram] Bot initialized')

  const SESSION_TTL = 1800

  const getSession = async (chatId) => {
    const s = await redis.get(`bot:session:${chatId}`)
    if (s) {
      await redis.expire(`bot:session:${chatId}`, SESSION_TTL)
      return JSON.parse(s)
    }
    return null
  }

  const saveSession = async (chatId, session) =>
    redis.set(`bot:session:${chatId}`, JSON.stringify(session), 'EX', SESSION_TTL)

  const clearSession = async (chatId) => redis.del(`bot:session:${chatId}`)

  const platformKeyboard = (selected) => {
    const ps = ['twitter', 'linkedin', 'instagram', 'threads']
    const kb = new InlineKeyboard()
    ps.forEach((p, i) => {
      const check = selected.includes(p) ? '✅ ' : ''
      kb.text(`${check}${p.charAt(0).toUpperCase() + p.slice(1)}`, `toggle:${p}`)
      if (i % 2 !== 0) kb.row()
    })
    return kb.row().text('🏁 Done', 'platforms_done')
  }

  const getDbUser = async (chatId) =>
    prisma.user.findUnique({ where: { telegramChatId: chatId.toString() } })

  // commands

  bot.command('start', async (ctx) => {
    await clearSession(ctx.chat.id)
    await ctx.reply(
      '👋 Welcome to Postly!\n\nI help you create and publish AI-powered content across multiple platforms.\n\n' +
      '1️⃣ First, link your account: /login <access_token>\n' +
      '2️⃣ Then create content: /post\n\n' +
      'Get your access token from POST /api/auth/login'
    )
  })

  bot.command('login', async (ctx) => {
    const parts = ctx.message.text.trim().split(' ')
    const token = parts[1]

    if (!token) {
      return ctx.reply(
        '🔑 Send your access token like this:\n/login <access_token>\n\nGet it from:\nPOST /api/auth/login'
      )
    }

    try {
      // verifies jwt shared with the dashboard so we can link the telegram chat to a db user
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
      await prisma.user.update({
        where: { id: decoded.userId },
        data: { telegramChatId: ctx.chat.id.toString() }
      })
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
      await ctx.reply(`✅ Account linked! Welcome, ${user.name}! 🎉\n\nUse /post to create your first post.`)
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return ctx.reply('❌ Token expired. Get a fresh one from POST /api/auth/login')
      }
      await ctx.reply('❌ Invalid token. Get yours from POST /api/auth/login')
    }
  })

  bot.command('post', async (ctx) => {
    await clearSession(ctx.chat.id)

    const dbUser = await getDbUser(ctx.chat.id)
    if (!dbUser) {
      return ctx.reply('⚠️ Link your account first:\n/login <access_token>\n\nGet your token from POST /api/auth/login')
    }

    const session = { step: 'type', userId: dbUser.id, platforms: [] }
    await saveSession(ctx.chat.id, session)

    const kb = new InlineKeyboard()
      .text('Announcement', 'type:announcement').text('Thread', 'type:thread').row()
      .text('Story', 'type:story').text('Promotional', 'type:promotional').row()
      .text('Educational', 'type:educational').text('Opinion', 'type:opinion')

    await ctx.reply('📝 *Step 1/5 — Post Type*\n\nWhat type of post is this?', {
      parse_mode: 'Markdown',
      reply_markup: kb
    })
  })

  bot.command('status', async (ctx) => {
    const dbUser = await getDbUser(ctx.chat.id)
    if (!dbUser) {
      return ctx.reply('⚠️ Link your account first:\n/login <access_token>')
    }

    const posts = await prisma.post.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { platformPosts: true }
    })

    if (posts.length === 0) {
      return ctx.reply('📊 No posts yet. Use /post to create one!')
    }

    let msg = '📊 *Your last 5 posts:*\n\n'
    posts.forEach((post, i) => {
      // clip long ideas for status list
      const idea = post.idea.length > 40 ? post.idea.substring(0, 40) + '...' : post.idea
      const date = post.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      msg += `*${i + 1}. ${idea}* — ${date}\n`
      post.platformPosts.forEach(pp => {
        const icon = pp.status === 'PUBLISHED' ? '✅' : pp.status === 'FAILED' ? '❌' : '⏳'
        msg += `   ${pp.platform}: ${icon} ${pp.status.toLowerCase()}\n`
      })
      msg += '\n'
    })

    await ctx.reply(msg, { parse_mode: 'Markdown' })
  })

  bot.command('accounts', async (ctx) => {
    const dbUser = await getDbUser(ctx.chat.id)
    if (!dbUser) return ctx.reply('⚠️ Link your account first:\n/login <access_token>')

    const accounts = await prisma.socialAccount.findMany({
      where: { userId: dbUser.id },
      select: { platform: true, handle: true, connectedAt: true }
    })

    if (accounts.length === 0) {
      return ctx.reply('🔗 No social accounts connected.\nAdd them via PUT /api/user/social-accounts')
    }

    let msg = '🔗 *Connected Accounts:*\n\n'
    accounts.forEach(a => {
      msg += `${a.platform}: @${a.handle}\n`
    })
    await ctx.reply(msg, { parse_mode: 'Markdown' })
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(
      '📖 *Postly Commands:*\n\n' +
      '/start — Welcome message\n' +
      '/login <token> — Link your account\n' +
      '/post — Create and publish content\n' +
      '/status — Check your last 5 posts\n' +
      '/accounts — View connected social accounts\n' +
      '/help — Show this menu',
      { parse_mode: 'Markdown' }
    )
  })

  // callbacks

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data
    const chatId = ctx.chat.id
    const session = await getSession(chatId)

    if (!session) {
      return ctx.answerCallbackQuery({
        text: '⏰ Session expired. Use /post to start again.',
        show_alert: true
      })
    }

    try {
      // type
      if (data.startsWith('type:')) {
        session.postType = data.split(':')[1]
        session.step = 'platforms'
        await saveSession(chatId, session)

        await ctx.editMessageText(`✅ Post type: *${session.postType}*`, { parse_mode: 'Markdown' })
        await ctx.reply('📝 *Step 2/5 — Platforms*\n\nWhich platforms should I post to? Select all, then tap Done.', {
          parse_mode: 'Markdown',
          reply_markup: platformKeyboard(session.platforms)
        })
      }

      // platform toggle
      else if (data.startsWith('toggle:')) {
        const p = data.split(':')[1]
        session.platforms = session.platforms.includes(p)
          ? session.platforms.filter(x => x !== p)
          : [...session.platforms, p]
        await saveSession(chatId, session)
        await ctx.editMessageReplyMarkup({ reply_markup: platformKeyboard(session.platforms) })
      }

      // platforms done
      else if (data === 'platforms_done') {
        if (!session.platforms.length) {
          return ctx.answerCallbackQuery({ text: 'Select at least one platform!', show_alert: true })
        }
        session.step = 'tone'
        await saveSession(chatId, session)

        const platformList = session.platforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')
        await ctx.editMessageText(`✅ Platforms: *${platformList}*`, { parse_mode: 'Markdown' })

        const kb = new InlineKeyboard()
          .text('Professional', 'tone:professional').text('Casual', 'tone:casual').row()
          .text('Witty', 'tone:witty').text('Authoritative', 'tone:authoritative').row()
          .text('Friendly', 'tone:friendly')

        await ctx.reply('📝 *Step 3/5 — Tone*\n\nWhat tone should the content have?', {
          parse_mode: 'Markdown',
          reply_markup: kb
        })
      }

      // tone
      else if (data.startsWith('tone:')) {
        session.tone = data.split(':')[1]
        session.step = 'language'
        await saveSession(chatId, session)

        await ctx.editMessageText(`✅ Tone: *${session.tone}*`, { parse_mode: 'Markdown' })

        const kb = new InlineKeyboard()
          .text('🇬🇧 English', 'language:en')
          .text('🇮🇳 Hindi', 'language:hi')
          .text('🇸🇦 Arabic', 'language:ar')

        await ctx.reply('📝 *Step 4/5 — Language*\n\nWhat language should the content be in?', {
          parse_mode: 'Markdown',
          reply_markup: kb
        })
      }

      // language
      else if (data.startsWith('language:')) {
        session.language = data.split(':')[1]
        session.step = 'model'
        await saveSession(chatId, session)

        const langMap = { en: '🇬🇧 English', hi: '🇮🇳 Hindi', ar: '🇸🇦 Arabic' }
        await ctx.editMessageText(`✅ Language: *${langMap[session.language]}*`, { parse_mode: 'Markdown' })

        const kb = new InlineKeyboard()
          .text('🤖 GPT-4o (OpenAI)', 'model:openai').row()
          .text('🧠 Claude Sonnet (Anthropic)', 'model:anthropic')

        await ctx.reply('📝 *Step 5/5 — AI Model*\n\nWhich AI model should generate the content?', {
          parse_mode: 'Markdown',
          reply_markup: kb
        })
      }

      // model
      else if (data.startsWith('model:')) {
        session.model = data.split(':')[1]
        session.step = 'idea'
        await saveSession(chatId, session)

        const modelLabel = session.model === 'openai' ? '🤖 GPT-4o (OpenAI)' : '🧠 Claude Sonnet (Anthropic)'
        await ctx.editMessageText(`✅ Model: *${modelLabel}*`, { parse_mode: 'Markdown' })
        await ctx.reply('💡 Now tell me the idea or core message — keep it brief (max 500 chars).')
      }

      // confirm post
      else if (data === 'confirm_post') {
        await ctx.editMessageText('⏳ Publishing your content...')

        try {
          const result = await publishingService.publishPost(session.userId, {
            idea: session.idea,
            postType: session.postType,
            platforms: session.platforms,
            tone: session.tone,
            language: session.language || 'en',
            model: session.model,
            prisma
          })

          let statusMsg = '✅ *Content queued for publishing!*\n\n'
          result.platforms.forEach(p => {
            statusMsg += `${p.platform}: ⏳ Queued\n`
          })
          statusMsg += '\nUse /status to track progress.'

          await ctx.reply(statusMsg, { parse_mode: 'Markdown' })
        } catch (err) {
          console.error('[Bot] Publish error:', err)
          await ctx.reply(`❌ Publishing failed: ${err.message}\n\nTry /post again.`)
        }

        await clearSession(chatId)
      }

      // edit idea
      else if (data === 'edit_idea') {
        session.step = 'idea'
        await saveSession(chatId, session)
        await ctx.editMessageText('✏️ Send me the updated idea:')
      }

      // cancel
      else if (data === 'cancel') {
        await clearSession(chatId)
        await ctx.editMessageText('❌ Cancelled. Use /post to start again.')
      }

      await ctx.answerCallbackQuery()
    } catch (err) {
      console.error('[Bot Error]', err)
      await ctx.answerCallbackQuery()
      await ctx.reply('⚠️ Something went wrong. Use /post to restart.')
    }
  })

  // message handler

  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id
    const session = await getSession(chatId)

    if (!session) return

    if (session.step !== 'idea') return

    const idea = ctx.message.text.trim()
    if (idea.length > 500) {
      return ctx.reply(`❌ Too long! Your idea is ${idea.length} chars. Keep it under 500 and try again.`)
    }

    session.idea = idea
    await saveSession(chatId, session)
    await ctx.reply('⚙️ Generating your content, please wait...')

    try {
      const result = await generatePlatformContent({
        idea: session.idea,
        postType: session.postType,
        platforms: session.platforms,
        tone: session.tone,
        language: session.language || 'en',
        model: session.model,
        userId: session.userId,
        prisma
      })

      session.generated = result.generated
      session.step = 'confirm'
      await saveSession(chatId, session)

      let preview = '📝 *Content Preview:*\n\n'
      for (const [p, d] of Object.entries(result.generated)) {
        const name = p.charAt(0).toUpperCase() + p.slice(1)
        preview += `*${name}* (${d.content.length} chars):\n${d.content}\n\n`
      }

      const kb = new InlineKeyboard()
        .text('✅ Post Now', 'confirm_post').row()
        .text('✏️ Edit Idea', 'edit_idea').row()
        .text('❌ Cancel', 'cancel')

      await ctx.reply(preview, { parse_mode: 'Markdown', reply_markup: kb })
    } catch (err) {
      console.error('[Bot Generation Error]', err)
      await ctx.reply('❌ Content generation failed. Try again with /post')
    }
  })

} catch (err) {
  console.error('[Telegram] Bot initialization failed:', err.message)
  bot = {
    api: {
      setWebhook: async () => ({ ok: false }),
      getWebhookInfo: async () => ({})
    },
    start: async () => {},
    on: () => {},
    command: () => {},
    callbackQuery: () => {}
  }
}

export { bot }
