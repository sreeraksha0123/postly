import { Bot, InlineKeyboard } from 'grammy'
import redis from '../config/redis.js'
import prisma from '../config/db.js'
import publishingService from './publishingService.js'
import { generatePlatformContent } from './content.js'

let bot

try {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured')
  }
  bot = new Bot(token)
  console.log('[Telegram] Bot initialized')
  
  // --- Helpers ---
  const SESSION_TTL = 1800

  const getSession = async (chatId) => {
    const s = await redis.get(`bot:session:${chatId}`)
    if (s) {
      await redis.expire(`bot:session:${chatId}`, SESSION_TTL)
      return JSON.parse(s)
    }
    return null
  }

  const saveSession = async (chatId, session) => {
    await redis.set(`bot:session:${chatId}`, JSON.stringify(session), 'EX', SESSION_TTL)
  }

  const clearSession = async (chatId) => await redis.del(`bot:session:${chatId}`)

  const platformKeyboard = (selected) => {
    const ps = ['twitter', 'linkedin', 'instagram', 'threads']
    const kb = new InlineKeyboard()
    ps.forEach((p, i) => {
      const check = selected.includes(p) ? '✅ ' : ''
      kb.text(`${check}${p.charAt(0).toUpperCase() + p.slice(1)}`, `toggle:${p}`)
      if (i % 2 !== 0) kb.row()
    })
    return kb.row().text("🏁 Done", "platforms_done")
  }

  // --- Commands ---

  bot.command('start', async (ctx) => {
    await clearSession(ctx.chat.id)
    await ctx.reply("👋 Welcome to Postly! I help you create and publish AI-powered content across multiple platforms.\n\nUse /post to create your first post!")
  })

  bot.command('post', async (ctx) => {
    await clearSession(ctx.chat.id)
    const session = { step: 'type', userId: ctx.chat.id.toString(), platforms: [] }
    await saveSession(ctx.chat.id, session)

    const kb = new InlineKeyboard()
      .text("Announcement", "type:announcement").text("Thread", "type:thread").row()
      .text("Story", "type:story").text("Promotional", "type:promotional").row()
      .text("Educational", "type:educational").text("Opinion", "type:opinion")

    await ctx.reply("What type of post is this?", { reply_markup: kb })
  })

  bot.command('status', async (ctx) => {
    // Guest status for now
    await ctx.reply("📊 You have no posts yet. Use /post to create one!")
  })

  bot.command('accounts', async (ctx) => {
    await ctx.reply("🔗 No accounts connected yet. Connect them via the API.")
  })

  bot.command('help', async (ctx) => {
    const helpMsg = "📖 *Postly Commands:*\n" +
                    "/post — Create and publish content\n" +
                    "/status — Check your last 5 posts\n" +
                    "/accounts — View connected accounts\n" +
                    "/help — Show this menu"
    await ctx.reply(helpMsg, { parse_mode: 'Markdown' })
  })

  // --- Callback Queries ---

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data
    const chatId = ctx.chat.id
    const session = await getSession(chatId)

    if (!session) {
      return ctx.answerCallbackQuery({ text: "⏰ Your session expired. Use /post to start a new one.", show_alert: true })
    }

    try {
      if (data.startsWith('type:')) {
        session.postType = data.split(':')[1]
        session.step = 'platforms'
        await saveSession(chatId, session)
        await ctx.editMessageText("Which platforms should I post to? Select all, then tap Done.", { reply_markup: platformKeyboard(session.platforms) })
      }

      else if (data.startsWith('toggle:')) {
        const p = data.split(':')[1]
        if (session.platforms.includes(p)) {
          session.platforms = session.platforms.filter(x => x !== p)
        } else {
          session.platforms.push(p)
        }
        await saveSession(chatId, session)
        await ctx.editMessageReplyMarkup({ reply_markup: platformKeyboard(session.platforms) })
      }

      else if (data === 'platforms_done') {
        if (!session.platforms || session.platforms.length === 0) {
          return ctx.answerCallbackQuery({ text: "Please select at least one platform first!", show_alert: true })
        }
        session.step = 'tone'
        await saveSession(chatId, session)
        const kb = new InlineKeyboard()
          .text("Professional", "tone:professional").text("Casual", "tone:casual").row()
          .text("Witty", "tone:witty").text("Authoritative", "tone:authoritative").row()
          .text("Friendly", "tone:friendly")
        await ctx.editMessageText("What tone should the content have?", { reply_markup: kb })
      }

      else if (data.startsWith('tone:')) {
        session.tone = data.split(':')[1]
        session.step = 'model'
        await saveSession(chatId, session)
        const kb = new InlineKeyboard()
          .text("🤖 GPT-4o (OpenAI)", "model:openai").row()
          .text("🧠 Claude Sonnet (Anthropic)", "model:anthropic")
        await ctx.editMessageText("Which AI model should generate the content?", { reply_markup: kb })
      }

      else if (data.startsWith('model:')) {
        session.model = data.split(':')[1]
        session.step = 'idea'
        await saveSession(chatId, session)
        await ctx.editMessageText("Tell me the idea or core message — keep it brief (max 500 chars).")
      }

      else if (data === 'confirm_post') {
        await ctx.editMessageText("⏳ Publishing your content...")
        
        // Mocking the multi-platform response
        let statusMsg = "✅ Content queued for publishing!\n\n"
        session.platforms.forEach(p => {
          const name = p.charAt(0).toUpperCase() + p.slice(1)
          statusMsg += `${name}: ⏳ Queued\n`
        })
        statusMsg += "\nUse /status to check progress."
        
        await ctx.reply(statusMsg)
        await clearSession(chatId)
      }

      else if (data === 'edit_idea') {
        session.step = 'idea'
        await saveSession(chatId, session)
        await ctx.editMessageText("Send me the updated idea:")
      }

      else if (data === 'cancel') {
        await clearSession(chatId)
        await ctx.editMessageText("❌ Cancelled. Use /post to start again.")
      }

      await ctx.answerCallbackQuery()
    } catch (err) {
      console.error('[Bot Error]', err)
      await ctx.reply("⚠️ An error occurred. Use /post to restart.")
    }
  })

  // --- Message Handler ---

  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id
    const session = await getSession(chatId)

    if (!session) return // Ignore random messages with no session

    if (session.step !== 'idea') {
      // Re-prompt current step
      if (session.step === 'type') {
        const kb = new InlineKeyboard()
          .text("Announcement", "type:announcement").text("Thread", "type:thread").row()
          .text("Story", "type:story").text("Promotional", "type:promotional").row()
          .text("Educational", "type:educational").text("Opinion", "type:opinion")
        return ctx.reply("Please select a post type first:", { reply_markup: kb })
      }
      // Add other re-prompts here if needed, but for now just quiet return or generic msg
      return
    }

    const idea = ctx.message.text
    if (idea.length > 500) {
      return ctx.reply(`Too long! Your idea is ${idea.length} chars. Please keep it under 500 chars and try again.`)
    }

    session.idea = idea
    await saveSession(chatId, session)
    await ctx.reply("⚙️ Generating your content, please wait...")

    try {
      // Use the existing service logic
      const result = await generatePlatformContent({ ...session, language: 'en' })
      session.generated = result.generated
      session.step = 'confirm'
      await saveSession(chatId, session)

      let preview = "📝 *Content Preview:*\n\n"
      for (const [p, d] of Object.entries(result.generated)) {
        const name = p.charAt(0).toUpperCase() + p.slice(1)
        preview += `*${name}* (${d.content.length} chars):\n${d.content}\n\n`
      }

      const kb = new InlineKeyboard()
        .text("✅ Post Now", "confirm_post").row()
        .text("✏️ Edit Idea", "edit_idea").row()
        .text("❌ Cancel", "cancel")

      await ctx.reply(preview, { parse_mode: 'Markdown', reply_markup: kb })
    } catch (err) {
      console.error('[Bot Generation Error]', err)
      await ctx.reply("❌ Content generation failed. Try again with /post")
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
