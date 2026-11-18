import path from "node:path";
import { CACHE_DIR, EFFORT, MODEL } from "./config.js";
import { createJsonStore, sha256 } from "./diskCache.js";
import { logError } from "./log.js";

/** Bump to invalidate every saved answer (e.g. after changing how answers are produced). */
export const ANSWER_CACHE_VERSION = "1";

/**
 * Cache key covering everything that shapes an answer: the full system prompt
 * (both champions' abilities for the current patch, role and the playbook),
 * the whole conversation, and how Claude is reached. Change any of it -> new key.
 */
export function answerKey({ kind, provider, system, messages }) {
  return `${kind}:${sha256(JSON.stringify({ kind, provider, model: MODEL, effort: EFFORT, system, messages }))}`;
}

/** Saved coach replies and suggested questions, under data/cache/answers (gitignored). */
export function createAnswerCache(dir = path.join(CACHE_DIR, "answers")) {
  const store = createJsonStore(dir, { onError: logError });
  return {
    get: (key) => store.get(key, ANSWER_CACHE_VERSION),
    set: (key, value) => store.set(key, ANSWER_CACHE_VERSION, value),
  };
}
