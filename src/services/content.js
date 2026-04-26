import { z } from 'zod';
import { generateContent as openaiGenerate } from './openai.js';
import { generateContent as anthropicGenerate } from './anthropic.js';

/**
 * Zod validation schema for content generation requests.
 */
export const generateSchema = z.object({
  idea: z.string().min(1).max(500),
  postType: z.enum(['announcement', 'thread', 'story', 'promotional', 'educational', 'opinion']),
  platforms: z.array(z.enum(['twitter', 'linkedin', 'instagram', 'threads'])).min(1),
  tone: z.enum(['professional', 'casual', 'witty', 'authoritative', 'friendly']),
  language: z.enum(['en', 'hi', 'ar']),
  model: z.enum(['openai', 'anthropic'])
});

/**
 * Builds the platform-optimized system prompt
 */
function buildSystemPrompt({ tone, language, postType, platforms }) {
  const rules = [];
  if (platforms.includes('twitter')) {
    rules.push('- Twitter/X: MAXIMUM 280 characters total including hashtags. 2-3 hashtags. Strong punchy opener.');
  }
  if (platforms.includes('linkedin')) {
    rules.push('- LinkedIn: 800-1300 characters. Professional tone always regardless of global tone. 3-5 hashtags. NO emojis in first line.');
  }
  if (platforms.includes('instagram')) {
    rules.push('- Instagram: Engaging caption. EXACTLY 10-15 hashtags placed at the end. Emoji-friendly.');
  }
  if (platforms.includes('threads')) {
    rules.push('- Threads: MAXIMUM 500 characters. Conversational, relatable tone.');
  }

  const platformJsonShape = {};
  if (platforms.includes('twitter')) platformJsonShape.twitter = '{ "content": "...", "hashtags": ["#tag"] }';
  if (platforms.includes('linkedin')) platformJsonShape.linkedin = '{ "content": "...", "hashtags": ["#tag"] }';
  if (platforms.includes('instagram')) platformJsonShape.instagram = '{ "content": "...", "hashtags": ["#tag1","#tag2"] }';
  if (platforms.includes('threads')) platformJsonShape.threads = '{ "content": "..." }';

  return `You are an expert social media content strategist.
Generate platform-optimized content following these STRICT rules:
${rules.join('\n')}

Global tone: ${tone}
Language: ${language}
Post type: ${postType}

Return ONLY valid JSON with no markdown fences, no explanation, nothing else:
{
${Object.entries(platformJsonShape).map(([k,v]) => `  "${k}": ${v}`).join(',\n')}
}`;
}

/**
 * Main Content Generation Orchestrator
 */
export async function generatePlatformContent(params) {
  // 1. Validate Input
  const validated = generateSchema.parse(params);
  const { idea, postType, platforms, tone, language, model } = validated;

  // 2. Prepare Messages
  const systemPrompt = buildSystemPrompt({ tone, language, postType, platforms });
  const userMessage = `Core idea: ${idea}\nGenerate content for these platforms: ${platforms.join(', ')}`;

  // 3. Route to specific provider (openai | anthropic)
  const service = model === 'openai' ? openaiGenerate : anthropicGenerate;

  const result = await service({
    systemPrompt,
    userMessage,
    userId: params.userId,
    prisma: params.prisma
  });

  // 4. Enrich result with character counts
  const enriched = {};
  for (const platform of platforms) {
    if (result.generated[platform]) {
      enriched[platform] = {
        ...result.generated[platform],
        char_count: result.generated[platform].content.length
      };
    }
  }

  return {
    generated: enriched,
    model_used: result.model_used,
    tokens_used: result.tokensUsed
  };
}

export const generateMultiPlatformContent = generatePlatformContent;
