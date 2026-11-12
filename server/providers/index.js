import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { streamViaApi, friendlyApiError } from "./api.js";
import { streamViaCli } from "./cli.js";

const run = promisify(execFile);

async function cliAvailable() {
  try {
    await run("claude", ["--version"], { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Picks how chat reaches Claude:
 *  - CHAT_PROVIDER=api|cli forces one
 *  - otherwise an API key in the env means "api", else fall back to the logged-in Claude CLI
 */
export async function detectProvider(env = process.env, hasCli = cliAvailable) {
  const forced = env.CHAT_PROVIDER?.toLowerCase();
  const hasKey = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  if (forced === "api") return hasKey ? "api" : null;
  if (forced === "cli") return (await hasCli()) ? "cli" : null;
  if (hasKey) return "api";
  return (await hasCli()) ? "cli" : null;
}

export function streamChat(provider, payload) {
  if (provider === "api") return streamViaApi(payload);
  if (provider === "cli") return streamViaCli(payload);
  throw new Error(`Unknown provider: ${provider}`);
}

export function describeError(err) {
  return friendlyApiError(err) ?? err.message ?? "Unknown error";
}
