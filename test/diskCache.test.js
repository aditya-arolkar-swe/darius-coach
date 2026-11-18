import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDiskCache, keyToFileName } from "../server/diskCache.js";

async function withDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "dc-cache-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("keyToFileName is readable, safe and collision-resistant", () => {
  assert.match(keyToFileName("Kai'Sa"), /^kai-sa-[0-9a-f]{10}\.json$/);
  assert.notEqual(keyToFileName("Kai'Sa"), keyToFileName("Kai Sa"));
  assert.match(keyToFileName("{{Tooltip/Glossary||tip=Silence}}"), /^tooltip-glossary-tip-silence-[0-9a-f]{10}\.json$/);
  assert.doesNotMatch(keyToFileName("../../etc/passwd"), /[/\\]/);
});

test("loads once, then serves from disk across cache instances (server restarts)", async () => {
  await withDir(async (dir) => {
    let calls = 0;
    const loader = async () => ({ n: ++calls });
    assert.deepEqual(await createDiskCache(dir)("Illaoi", "16.22.1", loader), { n: 1 });
    assert.deepEqual(await createDiskCache(dir)("Illaoi", "16.22.1", loader), { n: 1 }); // fresh instance, from disk
    assert.equal(calls, 1);
    const [file] = await readdir(dir);
    const entry = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    assert.equal(entry.key, "Illaoi");
    assert.equal(entry.version, "16.22.1");
  });
});

test("a new patch refetches and overwrites the saved entry", async () => {
  await withDir(async (dir) => {
    let calls = 0;
    const loader = async () => ++calls;
    const cached = createDiskCache(dir);
    await cached("Garen", "16.22.1", loader);
    assert.equal(await cached("Garen", "16.23.1", loader), 2);
    assert.equal(await createDiskCache(dir)("Garen", "16.23.1", loader), 2);
    assert.equal((await readdir(dir)).length, 1);
  });
});

test("dedupes concurrent loads and never caches failures", async () => {
  await withDir(async (dir) => {
    const cached = createDiskCache(dir);
    let calls = 0;
    const slow = () => new Promise((r) => setTimeout(() => r(++calls), 20));
    const [a, b] = await Promise.all([cached("Sett", "v", slow), cached("Sett", "v", slow)]);
    assert.equal(a, 1);
    assert.equal(b, 1);

    await assert.rejects(cached("Zed", "v", async () => { throw new Error("wiki down"); }), /wiki down/);
    assert.equal(await cached("Zed", "v", async () => "ok"), "ok");
  });
});

test("corrupt files are refetched; unwritable dirs still return the value", async () => {
  await withDir(async (dir) => {
    await writeFile(path.join(dir, keyToFileName("Jax")), "{not json");
    const errors = [];
    assert.equal(await createDiskCache(dir, { onError: (c) => errors.push(c) })("Jax", "v", async () => "fresh"), "fresh");
    assert.equal(errors.length, 1);

    const blocked = path.join(dir, "file-not-dir");
    await writeFile(blocked, "x");
    const writeErrors = [];
    const cached = createDiskCache(path.join(blocked, "sub"), { onError: (c) => writeErrors.push(c) });
    assert.equal(await cached("Jax", "v", async () => "still works"), "still works");
    assert.ok(writeErrors.some((c) => c.startsWith("cache write")));
  });
});
