import { generateWithGroq } from './groq.js'

export async function generateContent({ systemPrompt, userMessage, userId, prisma }) {
  // anthropic requires credit funding upfront so we use groq until key is active
  /*
  import Anthropic from '@anthropic-ai/sdk'
  let apiKey = process.env.ANTHROPIC_API_KEY
  if (userId && prisma) {
    const aiKeys = await prisma.aiKeys.findUnique({ where: { userId } })
    if (aiKeys?.anthropicKeyEnc) {
      const { decrypt } = await import('./encryption.js')
      apiKey = decrypt(aiKeys.anthropicKeyEnc)
    }
  }
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  })
  const raw = response.content[0].text
  const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim())
  return { generated: parsed, tokensUsed: response.usage.input_tokens + response.usage.output_tokens, model_used: 'claude-sonnet-4-5' }
  */

  console.log('[Anthropic Service] Routing to Groq fallback')
  const result = await generateWithGroq({ systemPrompt, userMessage })
  return { ...result, model_used: 'groq-fallback (anthropic interface)' }
}
