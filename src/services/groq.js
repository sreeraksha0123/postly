import OpenAI from 'openai'

const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
})

export async function generateWithGroq({ systemPrompt, userMessage }) {
  const response = await groqClient.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.7,
    max_tokens: 1000
  })
  const raw = response.choices[0].message.content
  // LLMs love wrapping json in markdown blocks which breaks JSON.parse
  const cleaned = raw.replace(/```json|```/g, '').trim()
  try {
    return { generated: JSON.parse(cleaned), tokensUsed: response.usage.total_tokens }
  } catch(e) {
    throw new Error('Groq returned invalid JSON: ' + raw.substring(0,100))
  }
}
