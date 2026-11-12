import { CACHE_TTL_MS, DDRAGON_BASE } from "./config.js";
import { createCache } from "./cache.js";
import { fetchJson, UpstreamError } from "./http.js";

const cached = createCache(CACHE_TTL_MS);

/** Turns Data Dragon's champion.json into a sorted, minimal list. */
export function toChampionList(ddragon, version) {
  if (!ddragon?.data || typeof ddragon.data !== "object") {
    throw new UpstreamError("Unexpected champion data format from Data Dragon");
  }
  return Object.values(ddragon.data)
    .map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title,
      icon: `${DDRAGON_BASE}/cdn/${version}/img/champion/${c.image?.full ?? `${c.id}.png`}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getChampions() {
  return cached("champions", async () => {
    const versions = await fetchJson(`${DDRAGON_BASE}/api/versions.json`);
    const version = Array.isArray(versions) ? versions[0] : null;
    if (!version) throw new UpstreamError("Data Dragon returned no versions");
    const data = await fetchJson(`${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`);
    return { version, champions: toChampionList(data, version) };
  });
}

export async function findChampion(name) {
  const { champions } = await getChampions();
  return champions.find((c) => c.name === name) ?? null;
}
