import { config } from "@postly/shared";

export type ModelTask = "planning" | "generation" | "review" | "long-form" | "short-form";

/**
 * Picks which model/provider handles a given task. Rationale is
 * intentionally simple and overridable — this is the seam where a
 * self-learning system (see packages/agents/src/learning.ts) can
 * later swap in data-driven routing instead of static rules.
 */
export function selectModel(task: ModelTask): { provider: "anthropic" | "openai" | "google"; model: string } {
  switch (task) {
    case "planning":
      // Strategy needs strong reasoning over ambiguous goals.
      return { provider: "anthropic", model: "claude-sonnet-4-6" };
    case "long-form":
      // LinkedIn/Threads benefit from a model tuned for coherent long prose.
      return { provider: "anthropic", model: "claude-sonnet-4-6" };
    case "short-form":
      // Twitter needs terse, punchy copy — GPT-4o is fast and cheap here.
      return { provider: "openai", model: "gpt-4o" };
    case "review":
      // A different model family than generation reduces correlated blind spots.
      return { provider: "google", model: "gemini-1.5-pro" };
    default:
      return { provider: config.models.defaultProvider, model: "claude-sonnet-4-6" };
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Unified chat call across providers. Each branch degrades to a
 * clearly-labeled mock response when no API key is configured, so
 * the whole pipeline is runnable end-to-end without any keys set —
 * useful for local dev/demo before wiring real credentials.
 */
export async function callModel(task: ModelTask, messages: ChatMessage[]): Promise<string> {
  const { provider, model } = selectModel(task);

  if (provider === "anthropic") {
    if (!config.models.anthropicKey) return mockResponse(task, messages);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.models.anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: messages.find((m) => m.role === "system")?.content,
        messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic call failed: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    return data.content?.map((c: any) => c.text).join("") || "";
  }

  if (provider === "openai") {
    if (!config.models.openaiKey) return mockResponse(task, messages);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.models.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) throw new Error(`OpenAI call failed: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  // google / gemini
  if (!config.models.googleKey) return mockResponse(task, messages);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.models.googleKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini call failed: ${res.status} ${await res.text()}`);
  const data: any = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
}

function mockResponse(task: ModelTask, messages: ChatMessage[]): string {
  const lastUser = messages.filter((m) => m.role === "user").pop()?.content || "";
  return `[MOCK:${task}] No API key configured for this provider — returning a deterministic placeholder so the pipeline still runs end-to-end. Prompt received: ${lastUser.slice(0, 160)}...`;
}
