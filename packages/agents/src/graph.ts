import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { CampaignInput, OrchestrationState, Platform } from "@postly/shared";
import { runPlanningAgent } from "./agents/planningAgent";
import { runResearchAgent } from "./agents/researchAgent";
import { runGenerationAgent } from "./agents/generationAgent";
import { runReviewAgent } from "./agents/reviewAgent";
import { runPublishingAgent } from "./agents/publishingAgent";

/**
 * LangGraph state channel definitions. Each key is merged (last
 * writer wins, or reduced with a custom fn) as the graph traverses
 * nodes — this is the "checkpointed state" that BullMQ jobs persist
 * between steps, enabling resumable multi-step workflows.
 */
const StateAnnotation = Annotation.Root({
  campaignId: Annotation<string>(),
  input: Annotation<CampaignInput>(),
  strategy: Annotation<OrchestrationState["strategy"]>(),
  research: Annotation<OrchestrationState["research"]>(),
  generatedContent: Annotation<OrchestrationState["generatedContent"]>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  qualityReviews: Annotation<OrchestrationState["qualityReviews"]>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  status: Annotation<OrchestrationState["status"]>(),
  errors: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  currentAgent: Annotation<OrchestrationState["currentAgent"]>(),
  retryCount: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
});

export type GraphState = typeof StateAnnotation.State;

/** Orchestrator node: decides routing, doesn't do agent work itself. */
function orchestratorNode(state: GraphState): Partial<GraphState> {
  return { currentAgent: "orchestrator", status: state.status || "planning" };
}

async function planningNode(state: GraphState): Promise<Partial<GraphState>> {
  try {
    const strategy = await runPlanningAgent(state.input);
    return { strategy, status: "researching", currentAgent: "planning" };
  } catch (err: any) {
    return { errors: [`planning: ${err.message}`], status: "failed" };
  }
}

async function researchNode(state: GraphState): Promise<Partial<GraphState>> {
  try {
    const research = await runResearchAgent(state.strategy!);
    return { research, status: "generating", currentAgent: "research" };
  } catch (err: any) {
    return { errors: [`research: ${err.message}`], status: "failed" };
  }
}

async function generationNode(state: GraphState): Promise<Partial<GraphState>> {
  try {
    const generatedContent = await runGenerationAgent(
      state.strategy!,
      state.research!,
      state.input.platforms as Platform[]
    );
    return { generatedContent, status: "reviewing", currentAgent: "generation" };
  } catch (err: any) {
    return { errors: [`generation: ${err.message}`], status: "failed" };
  }
}

async function reviewNode(state: GraphState): Promise<Partial<GraphState>> {
  try {
    const entries = await Promise.all(
      Object.entries(state.generatedContent).map(async ([platform, content]) => {
        const review = await runReviewAgent(content!, state.strategy!, state.research!);
        // If auto-improvement produced a better body, fold it back into content.
        if (review.improvedContent) {
          state.generatedContent[platform as Platform]!.body = review.improvedContent;
        }
        return [platform, review] as const;
      })
    );
    const qualityReviews = Object.fromEntries(entries);
    const allPassed = Object.values(qualityReviews).every((r: any) => r && r.overallScore >= 0.6);
    return {
      qualityReviews,
      status: allPassed ? "scheduled" : "failed",
      currentAgent: "review",
      errors: allPassed
        ? []
        : Object.entries(qualityReviews)
            .filter(([, r]: any) => !r || r.overallScore < 0.6)
            .map(([platform]) => `review: ${platform} scored below the 0.6 minimum bar`),
    };
  } catch (err: any) {
    return { errors: [`review: ${err.message}`], status: "failed" };
  }
}

async function publishingNode(state: GraphState): Promise<Partial<GraphState>> {
  try {
    const { failures } = await runPublishingAgent(state.generatedContent);
    if (failures.length > 0) {
      return {
        errors: failures.map((f) => `publishing:${f.platform}: ${f.error}`),
        status: failures.length === Object.keys(state.generatedContent).length ? "failed" : "published",
        currentAgent: "publishing",
      };
    }
    return { status: "published", currentAgent: "publishing" };
  } catch (err: any) {
    return { errors: [`publishing: ${err.message}`], status: "failed" };
  }
}

/** Conditional routing: bail out early to END if any agent failed. */
function routeAfter(state: GraphState): "continue" | "failed" {
  return state.status === "failed" ? "failed" : "continue";
}

/** Quality gate: only proceed to publishing if every platform passed review (set by reviewNode). */
function routeAfterReview(state: GraphState): "publish" | "failed" {
  return state.status === "failed" ? "failed" : "publish";
}

export function buildPostlyGraph() {
  const graph = new StateGraph(StateAnnotation)
    .addNode("orchestratorAgent", orchestratorNode)
    .addNode("planningAgent", planningNode)
    .addNode("researchAgent", researchNode)
    .addNode("generationAgent", generationNode)
    .addNode("reviewAgent", reviewNode)
    .addNode("publishingAgent", publishingNode)
    .addEdge(START, "orchestratorAgent")
    .addEdge("orchestratorAgent", "planningAgent")
    .addConditionalEdges("planningAgent", routeAfter, { continue: "researchAgent", failed: END })
    .addConditionalEdges("researchAgent", routeAfter, { continue: "generationAgent", failed: END })
    .addConditionalEdges("generationAgent", routeAfter, { continue: "reviewAgent", failed: END })
    .addConditionalEdges("reviewAgent", routeAfterReview, { publish: "publishingAgent", failed: END })
    .addEdge("publishingAgent", END);

  return graph.compile();
}

export async function runCampaignGraph(campaignId: string, input: CampaignInput): Promise<GraphState> {
  const app = buildPostlyGraph();
  const initialState: GraphState = {
    campaignId,
    input,
    strategy: undefined,
    research: undefined,
    generatedContent: {},
    qualityReviews: {},
    status: "draft",
    errors: [],
    currentAgent: "orchestrator",
    retryCount: 0,
  };
  const result = await app.invoke(initialState);
  return result as GraphState;
}
