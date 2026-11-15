import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSuggestionsPrompt, normalizeSuggestions, SUGGESTIONS_JSON_SCHEMA } from "../server/suggestions.js";
import { parseSuggestionsRequest, parseChatRequest } from "../server/validation.js";
import { parseCliJsonResult } from "../server/providers/cli.js";
import { completeJson } from "../server/providers/index.js";

const convo = [
  { role: "user", content: "How do I play into Garen?" },
  { role: "assistant", content: "1. **Respect Q silence**..." },
];

test("buildSuggestionsPrompt names the matchup and includes the conversation", () => {
  const { system, prompt } = buildSuggestionsPrompt({ opponent: "Garen", role: "jungle", messages: convo });
  assert.match(system, /Darius jungle against Garen/);
  assert.match(system, /exactly 3 questions/);
  assert.match(prompt, /Respect Q silence/);
  assert.match(prompt, /How do I play into Garen\?/);
});

test("normalizeSuggestions trims, dedupes, drops bad items and caps at 3", () => {
  const out = normalizeSuggestions({
    questions: ["  When do I  all-in? ", "when do i all-in?", "", "x".repeat(200), "What runes?", "Wave plan?", "Extra?"],
  });
  assert.deepEqual(out, ["When do I all-in?", "What runes?", "Wave plan?"]);
  assert.deepEqual(normalizeSuggestions(null), []);
  assert.deepEqual(normalizeSuggestions({ questions: "nope" }), []);
});

test("suggestions JSON schema matches what the CLI needs", () => {
  assert.equal(SUGGESTIONS_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(SUGGESTIONS_JSON_SCHEMA.required, ["questions"]);
});

test("parseSuggestionsRequest requires a conversation ending with the coach", () => {
  assert.equal(parseSuggestionsRequest({ champion: "Garen", role: "top", messages: convo }).ok, true);
  const endsWithUser = parseSuggestionsRequest({ champion: "Garen", role: "top", messages: convo.slice(0, 1) });
  assert.equal(endsWithUser.ok, false);
  assert.match(endsWithUser.error, /ending with assistant/);
  assert.equal(parseChatRequest({ champion: "Garen", role: "top", messages: convo }).ok, false);
});

test("parseCliJsonResult returns structured output or throws on errors", () => {
  assert.deepEqual(parseCliJsonResult(JSON.stringify({ is_error: false, structured_output: { questions: ["a"] } })), { questions: ["a"] });
  assert.equal(parseCliJsonResult(JSON.stringify({ is_error: false })), null);
  assert.throws(() => parseCliJsonResult(JSON.stringify({ is_error: true, result: "Not logged in" })), /Not logged in/);
  assert.throws(() => parseCliJsonResult("garbage"), /unreadable/);
});

test("completeJson rejects unknown providers", () => {
  assert.throws(() => completeJson("nope", {}), /Unknown provider/);
});
