/** Tiny TTL cache that also de-duplicates concurrent loads of the same key. */
export function createCache(ttlMs) {
  const entries = new Map();

  return async function cached(key, loader) {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;

    const value = loader();
    entries.set(key, { at: Date.now(), value });
    try {
      return await value;
    } catch (err) {
      entries.delete(key); // never cache failures
      throw err;
    }
  };
}
