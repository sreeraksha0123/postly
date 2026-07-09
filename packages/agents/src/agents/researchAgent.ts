import { ContentStrategy, ResearchBundle } from "@postly/shared";
import { retrieveMultiSource } from "@postly/rag";

/**
 * Research Agent — grounds the campaign in real, multi-source
 * context (internal RAG + web + news) plus a sentiment read, so
 * the Generation Agent isn't drafting from the model's own priors
 * alone. Reduces hallucination downstream.
 */
export async function runResearchAgent(strategy: ContentStrategy): Promise<ResearchBundle> {
  return retrieveMultiSource(strategy.coreMessage);
}
