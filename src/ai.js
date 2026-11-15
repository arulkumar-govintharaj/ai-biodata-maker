// AI provider helper.
// Default: Cloudflare Workers AI (free daily allowance, no API key; needs the "AI" binding).
// Optional upgrade: set ANTHROPIC_API_KEY to use Claude instead (better Tamil, < ₹1 per biodata).

export const DEFAULT_WORKERS_AI_MODELS = [
  "@cf/google/gemma-4-26b-a4b-it", // primary: strong multilingual, very cheap
  "@cf/google/gemma-3-12b-it", // backup if the primary is unavailable
];
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";

export class NoAIError extends Error {}

export function aiAvailable(env) {
  return Boolean(env.ANTHROPIC_API_KEY || env.AI);
}

/** Runs one prompt and returns plain text. Throws NoAIError if nothing is configured. */
export async function runAI(env, { system, user, maxTokens = 800 }) {
  if (env.ANTHROPIC_API_KEY) return runClaude(env, { system, user, maxTokens });
  if (env.AI) return runWorkersAI(env, { system, user, maxTokens });
  throw new NoAIError("No AI configured");
}

async function runWorkersAI(env, { system, user, maxTokens }) {
  const models = env.WORKERS_AI_MODEL ? [env.WORKERS_AI_MODEL] : DEFAULT_WORKERS_AI_MODELS;
  let lastErr;
  for (const model of models) {
    try {
      const result = await env.AI.run(model, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      });
      const text = extractText(result);
      if (text) return text;
      lastErr = new Error(`Empty response from ${model}`);
    } catch (err) {
      console.error("Workers AI error", model, err?.message || err);
      lastErr = err;
    }
  }
  throw lastErr || new Error("Workers AI failed");
}

async function runClaude(env, { system, user, maxTokens }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.AI_MODEL || DEFAULT_CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    console.error("Anthropic API error", res.status, await res.text());
    throw new Error("AI request failed");
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Empty AI response");
  return text;
}

/** Workers AI models return different shapes; normalise to a string. */
export function extractText(result) {
  if (result == null) return "";
  if (typeof result === "string") return stripThinking(result);
  if (typeof result.response === "string") return stripThinking(result.response);
  if (result.response && typeof result.response === "object") return JSON.stringify(result.response);
  const msg = result.choices?.[0]?.message;
  if (msg) {
    if (typeof msg.content === "string") return stripThinking(msg.content);
    if (Array.isArray(msg.content)) return stripThinking(msg.content.map((p) => p.text || "").join(""));
  }
  if (typeof result.result?.response === "string") return stripThinking(result.result.response);
  return "";
}

function stripThinking(s) {
  return s.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
}

/** Pulls the first JSON object out of model text (handles ```json fences and chatter). */
export function parseJsonObject(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}
