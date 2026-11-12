import * as cheerio from "cheerio";
import { CACHE_TTL_MS, WIKI_API, WIKI_BASE } from "./config.js";
import { createCache } from "./cache.js";
import { parseAbilities } from "./abilityParser.js";
import { fetchJson, UpstreamError } from "./http.js";

const cached = createCache(CACHE_TTL_MS);

const STRIP_SELECTORS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "noscript",
  'a[href*="action=edit"]',
  ".mw-editsection",
];

export function findAbilitiesSectionIndex(sections) {
  const match = (sections ?? []).find((s) => s.line?.trim().toLowerCase() === "abilities");
  return match ? match.index : null;
}

/** Plain-text version of the abilities section, used in the AI system prompt. */
export function abilitiesToText(rawHtml) {
  const $ = cheerio.load(rawHtml, null, false);
  $(STRIP_SELECTORS.join(",")).remove();
  $("br").replaceWith("\n");
  $("p, div, li, h2, h3, h4, tr, dd, dt").each((_, el) => $(el).append("\n"));
  return $.root()
    .text()
    .replace(/NOTICE TO API USERS:[^\n]*/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

async function fetchAbilitiesRaw(page) {
  const base = `${WIKI_API}?action=parse&format=json&formatversion=2&redirects=1&page=${encodeURIComponent(page)}`;
  const meta = await fetchJson(`${base}&prop=sections`);
  if (meta.error) throw new UpstreamError(`Wiki has no page for "${page}"`, 404);

  const index = findAbilitiesSectionIndex(meta.parse?.sections);
  if (!index) throw new UpstreamError(`No "Abilities" section on the wiki page for "${page}"`, 404);

  const body = await fetchJson(`${base}&prop=text&disableeditsection=1&section=${index}`);
  const html = body.parse?.text;
  if (typeof html !== "string") throw new UpstreamError("Wiki returned an unexpected response");
  return { title: meta.parse.title, html };
}

/** Returns { title, abilities, text, sourceUrl } for a champion's abilities. */
export function getAbilities(championName) {
  return cached(championName, async () => {
    const { title, html } = await fetchAbilitiesRaw(championName);
    return {
      title,
      abilities: parseAbilities(html),
      text: abilitiesToText(html),
      sourceUrl: `${WIKI_BASE}/en-us/${encodeURIComponent(title.replace(/ /g, "_"))}#Abilities`,
    };
  });
}
