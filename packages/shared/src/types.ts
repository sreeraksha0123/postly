import { z } from "zod";

export type Platform = "linkedin" | "twitter" | "instagram" | "threads";

export type CampaignStatus =
  | "draft"
  | "planning"
  | "researching"
  | "generating"
  | "reviewing"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export type AgentType =
  | "orchestrator"
  | "planning"
  | "research"
  | "generation"
  | "review"
  | "publishing";

export const CampaignInputSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(3).max(200),
  idea: z.string().min(10),
  platforms: z.array(
    z.enum(["linkedin", "twitter", "instagram", "threads"])
  ).min(1),
  scheduledAt: z.string().datetime().optional(),
  brandVoice: z.string().optional(),
});
export type CampaignInput = z.infer<typeof CampaignInputSchema>;

export interface ContentPillar {
  name: string;
  description: string;
  weight: number;
}

export interface ContentStrategy {
  coreMessage: string;
  targetAudience: string;
  platformStrategy: Record<Platform, string>;
  contentPillars: ContentPillar[];
  toneGuidelines: string;
}

export interface ResearchFinding {
  source: "internal" | "web" | "news" | "sentiment";
  summary: string;
  citations: string[];
  confidence: number;
}

export interface ResearchBundle {
  findings: ResearchFinding[];
  aggregatedContext: string;
  sentimentScore: number;
}

export interface PlatformContent {
  platform: Platform;
  body: string;
  hashtags: string[];
  mediaPrompt?: string;
  characterCount: number;
  modelUsed: string;
}

export const QUALITY_DIMENSIONS = [
  "accuracy",
  "relevance",
  "readability",
  "engagement",
  "originality",
  "brandConsistency",
  "platformOptimization",
  "emotionalImpact",
  "callToAction",
] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

export type QualityScores = Record<QualityDimension, number>;

export interface QualityReview {
  platform: Platform;
  scores: QualityScores;
  overallScore: number;
  passed: boolean;
  suggestions: string[];
  improvedContent?: string;
}

export interface AgentExecutionRecord {
  id: string;
  campaignId: string;
  agentType: AgentType;
  input: unknown;
  output: unknown;
  status: "pending" | "running" | "completed" | "failed" | "retrying";
  retryCount: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface OrchestrationState {
  campaignId: string;
  input: CampaignInput;
  strategy?: ContentStrategy;
  research?: ResearchBundle;
  generatedContent: Partial<Record<Platform, PlatformContent>>;
  qualityReviews: Partial<Record<Platform, QualityReview>>;
  status: CampaignStatus;
  errors: string[];
  currentAgent: AgentType;
  retryCount: number;
}

export interface PublishResult {
  platform: Platform;
  postId: string;
  publishedAt: string;
  url?: string;
}

export const QUALITY_PASS_THRESHOLD = 0.8;
export const MAX_AUTO_IMPROVE_ATTEMPTS = 2;
