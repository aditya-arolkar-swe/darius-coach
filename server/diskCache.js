import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Readable, filesystem-safe file name for any key (slug + short hash so keys never collide). */
export function keyToFileName(key) {
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
  return `${slug}-${sha256(key).slice(0, 10)}.json`;
}

/**
 * Key/value store with one JSON file per key under `dir`.
 * get() returns undefined for missing, corrupt or out-of-date (other `version`) entries.
 * set() writes atomically; a failed write is reported to onError but never thrown.
 */
export function createJsonStore(dir, { onError = () => {} } = {}) {
  const fileFor = (key) => path.join(dir, keyToFileName(key));

  async function get(key, version) {
    const file = fileFor(key);
    try {
      const entry = JSON.parse(await readFile(file, "utf8"));
      return entry?.key === key && entry.version === version ? entry.value : undefined;
    } catch (err) {
      if (err.code !== "ENOENT") onError(`cache read ${file}`, err);
      return undefined;
    }
  }

  async function set(key, version, value) {
    const file = fileFor(key);
    try {
      await mkdir(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify({ key, version, savedAt: new Date().toISOString(), value }));
      await rename(tmp, file);
    } catch (err) {
      onError(`cache write ${file}`, err);
    }
  }

  return { get, set };
}

/**
 * Persistent fetch-once cache: each value is loaded once, saved under `dir`, and
 * read from disk afterwards (also kept in memory). An entry saved for a
 * different `version` (game patch) is refetched, so data updates once per patch.
 * Failures are never cached; a failed disk write still returns the value.
 */
export function createDiskCache(dir, options = {}) {
  const store = createJsonStore(dir, options);
  const memory = new Map(); // key -> { version, promise }

  async function load(key, version, loader) {
    const saved = await store.get(key, version);
    if (saved !== undefined) return saved;
    const value = await loader();
    await store.set(key, version, value);
    return value;
  }

  return async function cached(key, version, loader) {
    const hit = memory.get(key);
    if (hit && hit.version === version) return hit.promise;
    const promise = load(key, version, loader);
    memory.set(key, { version, promise });
    try {
      return await promise;
    } catch (err) {
      if (memory.get(key)?.promise === promise) memory.delete(key);
      throw err;
    }
  };
}
