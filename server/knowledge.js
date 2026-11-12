import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";

export const KNOWLEDGE_LIMITS = Object.freeze({ maxEntries: 50, maxTitle: 80, maxText: 1500 });

export const entryInputSchema = z.object({
  title: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.maxTitle),
  text: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.maxText),
});

const entrySchema = entryInputSchema.extend({ id: z.string().min(1) });
const fileSchema = z.array(entrySchema);

export class KnowledgeError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * File-backed repository for the player's playbook entries.
 * Every change writes a new array (no in-place mutation) via temp file + rename.
 */
export function createKnowledgeStore(filePath) {
  let queue = Promise.resolve(); // serializes writes

  async function findAll() {
    let raw;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
    const parsed = fileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new KnowledgeError(`Playbook file ${filePath} is malformed`, 500);
    return parsed.data;
  }

  async function save(entries) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(entries, null, 2)}\n`);
    await rename(tmp, filePath);
    return entries;
  }

  const mutate = (fn) => {
    const run = queue.then(async () => save(await fn(await findAll())));
    queue = run.catch(() => {});
    return run;
  };

  const create = (input) =>
    mutate((entries) => {
      if (entries.length >= KNOWLEDGE_LIMITS.maxEntries) {
        throw new KnowledgeError(`Playbook is limited to ${KNOWLEDGE_LIMITS.maxEntries} entries`, 400);
      }
      return [...entries, { id: randomUUID(), ...input }];
    });

  const update = (id, input) =>
    mutate((entries) => {
      if (!entries.some((e) => e.id === id)) throw new KnowledgeError("Entry not found", 404);
      return entries.map((e) => (e.id === id ? { ...e, ...input } : e));
    });

  const remove = (id) =>
    mutate((entries) => {
      if (!entries.some((e) => e.id === id)) throw new KnowledgeError("Entry not found", 404);
      return entries.filter((e) => e.id !== id);
    });

  return { findAll, create, update, remove };
}

/** Formats entries for the system prompt. */
export function knowledgeToPrompt(entries) {
  if (!entries.length) return "";
  return entries.map((e, i) => `${i + 1}. ${e.title}: ${e.text}`).join("\n");
}
