import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChatRequest } from "../server/validation.js";
import { buildSystemPrompt } from "../server/prompt.js";
import { toChampionList } from "../server/champions.js";
import { createCache } from "../server/cache.js";
import { messagesToPrompt, parseCliLine } from "../server/providers/cli.js";
import { detectProvider } from "../server/providers/index.js";

const yes = async () => true;
const no = async () => false;

test("parseChatRequest accepts a valid conversation", () => {
  const r = parseChatRequest({ champion: "Garen", role: "top", messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.ok, true);
});

test("parseChatRequest rejects bad roles, ordering and oversize input", () => {
  assert.equal(parseChatRequest({ champion: "Garen", role: "mid", messages: [{ role: "user", content: "x" }] }).ok, false);
  assert.equal(
    parseChatRequest({ champion: "Garen", role: "top", messages: [{ role: "assistant", content: "x" }] }).ok,
    false,
  );
  assert.equal(
    parseChatRequest({
      champion: "Garen",
      role: "top",
      messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }],
    }).ok,
    false,
  );
  assert.equal(
    parseChatRequest({ champion: "Garen", role: "top", messages: [{ role: "user", content: "x".repeat(5000) }] }).ok,
    false,
  );
  assert.equal(parseChatRequest(null).ok, false);
});

test("buildSystemPrompt embeds both ability texts and the role", () => {
  const p = buildSystemPrompt({ opponent: "Garen", role: "jungle", dariusText: "DARIUS_Q", opponentText: "GAREN_Q" });
  assert.match(p, /<darius_abilities>\nDARIUS_Q\n<\/darius_abilities>/);
  assert.match(p, /champion="Garen">\nGAREN_Q/);
  assert.match(p, /exactly 3 short, simple tips/);
  assert.match(p, /Gank angles/);
  assert.match(p, /Darius jungle/);
  const top = buildSystemPrompt({ opponent: "Garen", role: "top", dariusText: "", opponentText: "" });
  assert.match(top, /Darius top lane/);
  assert.doesNotMatch(top, /Gank angles/);
});

test("toChampionList sorts and builds icon urls", () => {
  const list = toChampionList(
    { data: { Zed: { id: "Zed", name: "Zed", title: "t", image: { full: "Zed.png" } }, Aatrox: { id: "Aatrox", name: "Aatrox", title: "t" } } },
    "1.0",
  );
  assert.deepEqual(list.map((c) => c.name), ["Aatrox", "Zed"]);
  assert.match(list[0].icon, /cdn\/1\.0\/img\/champion\/Aatrox\.png$/);
  assert.throws(() => toChampionList({}, "1.0"));
});

test("createCache reuses values and does not cache failures", async () => {
  const cached = createCache(60_000);
  let calls = 0;
  const load = async () => ++calls;
  assert.equal(await cached("a", load), 1);
  assert.equal(await cached("a", load), 1);
  await assert.rejects(cached("b", async () => { throw new Error("boom"); }));
  assert.equal(await cached("b", load), 2);
});

test("messagesToPrompt folds history into a transcript", () => {
  assert.equal(messagesToPrompt([{ role: "user", content: "q1" }]), "q1");
  const p = messagesToPrompt([
    { role: "user", content: "q1" },
    { role: "assistant", content: "a1" },
    { role: "user", content: "q2" },
  ]);
  assert.match(p, /Player: q1\n\nCoach: a1/);
  assert.match(p, /Player's new message: q2$/);
});

test("parseCliLine extracts text deltas and errors", () => {
  const delta = JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } } });
  assert.deepEqual(parseCliLine(delta), { text: "hi" });
  assert.deepEqual(parseCliLine(JSON.stringify({ type: "result", is_error: true, result: "nope" })), { error: "nope" });
  assert.equal(parseCliLine(JSON.stringify({ type: "system" })), null);
  assert.equal(parseCliLine("not json"), null);
});

test("detectProvider prefers an API key, then the CLI, honoring overrides", async () => {
  assert.equal(await detectProvider({ ANTHROPIC_API_KEY: "k" }, no), "api");
  assert.equal(await detectProvider({}, yes), "cli");
  assert.equal(await detectProvider({}, no), null);
  assert.equal(await detectProvider({ ANTHROPIC_API_KEY: "k", CHAT_PROVIDER: "cli" }, yes), "cli");
  assert.equal(await detectProvider({ CHAT_PROVIDER: "api" }, yes), null);
});
