import Anthropic from "@anthropic-ai/sdk";
import { EFFORT, MAX_OUTPUT_TOKENS, MODEL } from "../config.js";

let client;
function getClient() {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  return client;
}

export function friendlyApiError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Your ANTHROPIC_API_KEY was rejected. Create a new key at https://console.anthropic.com/settings/keys and update .env.";
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "This API key can't use that model. Check your Console workspace settings.";
  }
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Claude API. Wait a moment and retry.";
  if (err instanceof Anthropic.BadRequestError && /credit/i.test(err.message)) {
    return "Your Claude API account is out of credits. Add credits at https://console.anthropic.com/settings/billing.";
  }
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? "network"}): ${err.message}`;
  return null;
}

/** Streams text deltas from the Claude API (billed to your Console API account). */
export async function* streamViaApi({ system, messages }) {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // if a safety classifier declines, retry on a fallback model
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") yield "\n\n_(Claude declined to answer this one.)_";
  if (final.stop_reason === "max_tokens") yield "\n\n_(Answer was cut off — ask me to continue.)_";
}
