import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";

const CLI_TIMEOUT_MS = 5 * 60 * 1000;

/** The CLI takes one prompt, so earlier turns are folded into it as a transcript. */
export function messagesToPrompt(messages) {
  const last = messages.at(-1).content;
  const history = messages.slice(0, -1);
  if (history.length === 0) return last;
  const transcript = history
    .map((m) => `${m.role === "user" ? "Player" : "Coach"}: ${m.content}`)
    .join("\n\n");
  return `<conversation_so_far>\n${transcript}\n</conversation_so_far>\n\nPlayer's new message: ${last}`;
}

/** Extracts a text delta (or a terminal error) from one stream-json line. */
export function parseCliLine(line) {
  let evt;
  try {
    evt = JSON.parse(line);
  } catch {
    return null;
  }
  if (evt.type === "stream_event" && evt.event?.type === "content_block_delta" && evt.event.delta?.type === "text_delta") {
    return { text: evt.event.delta.text };
  }
  if (evt.type === "result" && evt.is_error) {
    return { error: typeof evt.result === "string" ? evt.result : "Claude CLI reported an error" };
  }
  return null;
}

/**
 * Streams text by running the Claude Code CLI in print mode. This uses whatever
 * account `claude` is logged into (your Claude Pro/Max subscription) — no API key.
 */
export async function* streamViaCli({ system, messages }) {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--system-prompt", system,
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "",
    "--no-session-persistence",
  ];
  const child = spawn("claude", args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
  const timer = setTimeout(() => child.kill("SIGTERM"), CLI_TIMEOUT_MS);

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  child.stdin.end(messagesToPrompt(messages));

  try {
    for await (const line of createInterface({ input: child.stdout })) {
      const parsed = parseCliLine(line);
      if (parsed?.error) throw new Error(parsed.error);
      if (parsed?.text) yield parsed.text;
    }
    const code = await exited;
    if (code !== 0) {
      throw new Error(stderr.trim() || `claude CLI exited with code ${code}. Run \`claude\` once in a terminal to log in.`);
    }
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}
