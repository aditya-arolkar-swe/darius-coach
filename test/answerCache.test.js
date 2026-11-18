import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { answerKey, createAnswerCache } from "../server/answerCache.js";

const base = {
  kind: "chat",
  provider: "cli",
  system: "coach prompt with Garen abilities",
  messages: [{ role: "user", content: "How do I play into Garen?" }],
};

test("answerKey is stable for identical input", () => {
  assert.equal(answerKey(base), answerKey({ ...base, messages: [...base.messages] }));
  assert.match(answerKey(base), /^chat:[0-9a-f]{64}$/);
});

test("answerKey changes when anything that shapes the answer changes", () => {
  const key = answerKey(base);
  assert.notEqual(answerKey({ ...base, system: base.system + " (new patch)" }), key);
  assert.notEqual(answerKey({ ...base, provider: "api" }), key);
  assert.notEqual(answerKey({ ...base, kind: "suggestions" }), key);
  assert.notEqual(answerKey({ ...base, messages: [{ role: "user", content: "How do I play into Garen? " }] }), key);
});

test("answer cache saves and replays answers across instances", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dc-answers-"));
  try {
    const key = answerKey(base);
    assert.equal(await createAnswerCache(dir).get(key), undefined);
    await createAnswerCache(dir).set(key, "1. **Respect Q**");
    assert.equal(await createAnswerCache(dir).get(key), "1. **Respect Q**");
    await createAnswerCache(dir).set("suggestions:x", ["a", "b", "c"]);
    assert.deepEqual(await createAnswerCache(dir).get("suggestions:x"), ["a", "b", "c"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
