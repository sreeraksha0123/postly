import { Bot, InlineKeyboard } from 'grammy'
import redis from '../config/redis.js'
import prisma from '../config/db.js'
import publishingService from './publishingService.js'
import { generatePlatformContent } from './content.js'

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN)

const SESSION_TTL = 1800

// --- Session Helpers ---
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

const getUserId = async (chatId) => await redis.get(`bot:user:${chatId}`)

// --- Commands ---
bot.command('help', (ctx) => {
  ctx.reply("📖 *Postly Commands:*\n/post - Create a new campaign\n/status - Check last 5 campaign statuses\n/accounts - See linked accounts\n/help - Show this menu", { parse_mode: 'Markdown' })
})

bot.command(['start', 'post'], async (ctx) => {
  const userId = await getUserId(ctx.chat.id)
  if (!userId) {
    return ctx.reply("👋 Please link your account first by logging into the Postly dashboard and clicking 'Link Telegram'.")
  }
  
  await clearSession(ctx.chat.id)
  await saveSession(ctx.chat.id, { step: 'type', userId })

  const kb = new InlineKeyboard()
    .text("Announcement", "type:announcement").text("Thread", "type:thread").row()
    .text("Story", "type:story").text("Promotional", "type:promotional").row()
    .text("Educational", "type:educational").text("Opinion", "type:opinion")

  await ctx.reply("What type of content are we creating today?", { reply_markup: kb })
})

bot.command('status', async (ctx) => {
  const userId = await getUserId(ctx.chat.id)
  if (!userId) return ctx.reply("Please link your account first.")

  const posts = await prisma.post.findMany({
    where: { userId },
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { platformPosts: true }
  })

  if (!posts.length) return ctx.reply("No campaigns found.")

  let msg = "📊 *Last 5 Campaigns:*\n\n"
  posts.forEach(p => {
    msg += `📝 ${p.postType} (${p.status})\n`
    p.platformPosts.forEach(pp => {
        const icon = pp.status === 'PUBLISHED' ? '✅' : pp.status === 'FAILED' ? '❌' : '⏳'
        msg += `  ${icon} ${pp.platform}\n`
    })
    msg += "\n"
  })
  ctx.reply(msg, { parse_mode: 'Markdown' })
})

bot.command('accounts', async (ctx) => {
    const userId = await getUserId(ctx.chat.id)
    if (!userId) return ctx.reply("Please link your account first.")
    const accs = await prisma.socialAccount.findMany({ where: { userId } })
    if (!accs.length) return ctx.reply("No social accounts connected.")
    let msg = "🔗 *Connected Accounts:*\n"
    accs.forEach(a => msg += `- ${a.platform}: @${a.handle}\n`)
    ctx.reply(msg, { parse_mode: 'Markdown' })
})

// --- Callback Query Handler ---
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data
  const chatId = ctx.chat.id
  const session = await getSession(chatId)

  if (!session) return ctx.answerCallbackQuery({ text: "Session expired. Use /post to restart.", show_alert: true })

  try {
    if (data.startsWith('type:')) {
      session.postType = data.split(':')[1]
      session.step = 'platforms'
      session.platforms = []
      await saveSession(chatId, session)
      await ctx.editMessageText("Where should we publish? Select one or more:", { reply_markup: platformKeyboard([]) })
    }

    else if (data.startsWith('toggle:')) {
      const p = data.split(':')[1]
      if (session.platforms.includes(p)) session.platforms = session.platforms.filter(x => x !== p)
      else session.platforms.push(p)
      await saveSession(chatId, session)
      await ctx.editMessageReplyMarkup({ reply_markup: platformKeyboard(session.platforms) })
    }

    else if (data === 'platforms_done') {
      if (!session.platforms.length) return ctx.answerCallbackQuery("Pick at least one platform!")
      session.step = 'tone'
      await saveSession(chatId, session)
      const kb = new InlineKeyboard()
        .text("Professional", "tone:professional").text("Casual", "tone:casual").row()
        .text("Witty", "tone:witty").text("Friendly", "tone:friendly")
      await ctx.editMessageText("Select a tone:", { reply_markup: kb })
    }

    else if (data.startsWith('tone:')) {
      session.tone = data.split(':')[1]
      session.step = 'model'
      await saveSession(chatId, session)
      const kb = new InlineKeyboard()
        .text("GPT-4o (OpenAI)", "model:openai").row()
        .text("Claude Sonnet (Anthropic)", "model:anthropic")
      await ctx.editMessageText("Which model should brainstorm the content?", { reply_markup: kb })
    }

    else if (data.startsWith('model:')) {
      session.model = data.split(':')[1]
      session.step = 'idea'
      await saveSession(chatId, session)
      await ctx.editMessageText("Tell me your core idea (what is this post about?):")
    }

    else if (data === 'confirm_post') {
      await ctx.editMessageText("🚀 Publishing kampaign...")
      await publishingService.publishPost(session.userId, { ...session, language: 'en' })
      await ctx.reply("✅ Campaign successfully queued! Use /status to check progress.")
      await clearSession(chatId)
    }

    else if (data === 'edit_idea') {
      session.step = 'idea'
      await saveSession(chatId, session)
      await ctx.editMessageText("Okay, send me the updated core idea:")
    }

    else if (data === 'cancel') {
      await clearSession(chatId)
      await ctx.editMessageText("❌ Cancelled successfully.")
    }

    await ctx.answerCallbackQuery()
  } catch (err) {
    console.error(err)
    await ctx.reply("⚠️ An error occurred. Resetting to current step. Please try again.")
  }
})

// --- Message Handler ---
bot.on('message:text', async (ctx) => {
  const chatId = ctx.chat.id
  const session = await getSession(chatId)
  if (!session || session.step !== 'idea') return

  const idea = ctx.message.text
  if (idea.length > 500) return ctx.reply("Too long! Keep it under 500 characters.")

  session.idea = idea
  await saveSession(chatId, session)
  await ctx.reply("✨ Thinking...")

  try {
    const result = await generatePlatformContent({ ...session, language: 'en' })
    session.generated = result.generated
    session.step = 'confirm'
    await saveSession(chatId, session)

    let preview = "📝 *Content Preview:*\n\n"
    for (const [p, d] of Object.entries(result.generated)) {
      preview += `*${p.toUpperCase()}* (${d.char_count} chars):\n${d.content}\n\n`
    }

    const kb = new InlineKeyboard()
      .text("🚀 Post Now", "confirm_post").row()
      .text("✏️ Edit Idea", "edit_idea").row()
      .text("❌ Cancel", "cancel")

    await ctx.reply(preview, { parse_mode: 'Markdown', reply_markup: kb })
  } catch (err) {
    console.error(err)
    ctx.reply("❌ AI Generation failed. Try a different idea or model.")
  }
})

// --- UI Components ---
function platformKeyboard(selected) {
    const ps = ['twitter', 'linkedin', 'instagram', 'threads']
    const kb = new InlineKeyboard()
    ps.forEach(p => {
        const check = selected.includes(p) ? '✅ ' : ''
        kb.text(`${check}${p.charAt(0).toUpperCase() + p.slice(1)}`, `toggle:${p}`)
    })
    return kb.row().text("🏁 Done", "platforms_done")
}
