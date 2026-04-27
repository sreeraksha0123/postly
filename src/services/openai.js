import OpenAI from 'openai'
import { decrypt } from './encryption.js'
import { generateWithGroq } from './groq.js'

export async function generateContent({ systemPrompt, userMessage, userId, prisma }) {
  let apiKey = process.env.OPENAI_API_KEY

  if (userId && prisma) {
    try {
      const aiKeys = await prisma.aiKeys.findUnique({ where: { userId } })
      if (aiKeys?.openaiKeyEnc) {
        apiKey = decrypt(aiKeys.openaiKeyEnc)
      }
    } catch (e) {
      console.warn('[OpenAI Service] Could not fetch/decrypt user key, using server default')
    }
  }

  const client = new OpenAI({ apiKey })

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    })

    const raw = response.choices[0].message.content
    // llms love wrapping json in markdown blocks which breaks JSON.parse
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsedJSON = JSON.parse(cleaned)

    return {
      generated: parsedJSON,
      tokensUsed: response.usage.total_tokens,
      model_used: 'gpt-4o'
    }
  } catch (err) {
    const isBillingError =
      err?.status === 429 ||
      err?.status === 402 ||
      (err?.message || '').toLowerCase().includes('quota') ||
      (err?.message || '').toLowerCase().includes('billing') ||
      (err?.message || '').toLowerCase().includes('insufficient_quota')

    if (isBillingError) {
      console.warn('[OpenAI Service] Billing/quota issue — routing to Groq fallback')
      const result = await generateWithGroq({ systemPrompt, userMessage })
      return { ...result, model_used: 'groq-fallback (openai interface)' }
    }

    throw new Error('OpenAI API error: ' + err.message)
  }
}
