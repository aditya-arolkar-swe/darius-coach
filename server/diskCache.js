import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** Readable, filesystem-safe file name for any key (slug + short hash so keys never collide). */
export function keyToFileName(key) {
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 10);
  return `${slug}-${hash}.json`;
}

/**
 * Persistent cache: each value is fetched once, saved as JSON under `dir`, and
 * read from disk afterwards (also kept in memory). An entry saved for a
 * different `version` (game patch) is refetched, so data updates once per patch.
 * Failures are never cached; a failed disk write still returns the value.
 */
export function createDiskCache(dir, { onError = () => {} } = {}) {
  const memory = new Map(); // key -> { version, promise }

  async function readEntry(file, key, version) {
    try {
      const entry = JSON.parse(await readFile(file, "utf8"));
      return entry?.key === key && entry.version === version ? entry.value : undefined;
    } catch (err) {
      if (err.code !== "ENOENT") onError(`cache read ${file}`, err);
      return undefined; // missing or corrupt -> refetch
    }
  }

  async function writeEntry(file, entry) {
    try {
      await mkdir(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(entry));
      await rename(tmp, file);
    } catch (err) {
      onError(`cache write ${file}`, err);
    }
  }

  async function load(key, version, loader) {
    const file = path.join(dir, keyToFileName(key));
    const saved = await readEntry(file, key, version);
    if (saved !== undefined) return saved;
    const value = await loader();
    await writeEntry(file, { key, version, savedAt: new Date().toISOString(), value });
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
