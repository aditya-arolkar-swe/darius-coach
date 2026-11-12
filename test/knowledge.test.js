import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createKnowledgeStore, entryInputSchema, knowledgeToPrompt } from "../server/knowledge.js";
import { buildSystemPrompt } from "../server/prompt.js";

const tmpFile = async () => path.join(await mkdtemp(path.join(tmpdir(), "kb-")), "nested", "knowledge.json");

test("store returns [] when the file does not exist", async () => {
  const store = createKnowledgeStore(await tmpFile());
  assert.deepEqual(await store.findAll(), []);
});

test("store creates, updates and removes entries and persists them", async () => {
  const file = await tmpFile();
  const store = createKnowledgeStore(file);

  const created = await store.create({ title: "Ward", text: "Ward raptors" });
  assert.equal(created.length, 1);
  const { id } = created[0];

  const updated = await store.update(id, { title: "Ward", text: "Ward blue" });
  assert.equal(updated[0].text, "Ward blue");
  assert.equal(updated[0].id, id);
  assert.notEqual(created[0], updated[0], "entries are replaced, not mutated");

  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), updated);
  assert.deepEqual(await store.remove(id), []);
});

test("store rejects unknown ids, malformed files and serializes concurrent writes", async () => {
  const file = await tmpFile();
  const store = createKnowledgeStore(file);
  await assert.rejects(store.update("nope", { title: "a", text: "b" }), { status: 404 });
  await assert.rejects(store.remove("nope"), { status: 404 });

  await Promise.all([1, 2, 3].map((n) => store.create({ title: `t${n}`, text: "x" })));
  assert.equal((await store.findAll()).length, 3);

  await writeFile(file, JSON.stringify([{ bad: true }]));
  await assert.rejects(store.findAll(), { status: 500 });
});

test("entry schema trims and enforces limits", () => {
  assert.equal(entryInputSchema.safeParse({ title: "  ", text: "x" }).success, false);
  assert.equal(entryInputSchema.safeParse({ title: "a", text: "x".repeat(2000) }).success, false);
  assert.deepEqual(entryInputSchema.parse({ title: " a ", text: " b " }), { title: "a", text: "b" });
});

test("playbook is formatted into the system prompt only when present", () => {
  const playbook = knowledgeToPrompt([{ id: "1", title: "Youmuu's core", text: "Prefer Youmuu's." }]);
  assert.equal(playbook, "1. Youmuu's core: Prefer Youmuu's.");
  assert.equal(knowledgeToPrompt([]), "");

  const withKb = buildSystemPrompt({ opponent: "Garen", role: "top", dariusText: "", opponentText: "", playbook });
  assert.match(withKb, /<player_playbook>\n1\. Youmuu's core: Prefer Youmuu's\.\n<\/player_playbook>/);
  assert.match(withKb, /following the player's playbook item preferences/);

  const without = buildSystemPrompt({ opponent: "Garen", role: "top", dariusText: "", opponentText: "" });
  assert.doesNotMatch(without, /player_playbook/);
});
