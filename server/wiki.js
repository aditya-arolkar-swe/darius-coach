import * as cheerio from "cheerio";
import { CACHE_TTL_MS, WIKI_API, WIKI_BASE } from "./config.js";
import { createCache } from "./cache.js";
import { sanitizeWikiHtml, STRIP_SELECTORS } from "./wikiHtml.js";
import { fetchJson, UpstreamError } from "./http.js";

const cached = createCache(CACHE_TTL_MS);


/**
 * Finds the top-level "Abilities" section. Returns { index, anchor } or null.
 * `index` is null when the heading comes from a template (e.g. Illaoi's page),
 * because MediaWiki can't fetch such a section on its own.
 */
export function findAbilitiesSection(sections) {
  const isAbilities = (s) => s.line?.trim().toLowerCase() === "abilities";
  const list = sections ?? [];
  const match = list.find((s) => isAbilities(s) && String(s.level) === "2") ?? list.find(isAbilities);
  if (!match) return null;
  return { index: /^\d+$/.test(String(match.index ?? "")) ? String(match.index) : null, anchor: match.anchor || "Abilities" };
}

/** Cuts one level-2 section (its heading through to the next level-2 heading) out of full page HTML. */
export function extractSectionHtml(pageHtml, anchor) {
  const $ = cheerio.load(pageHtml, null, false);
  const target = $("h2").filter((_, el) => $(el).attr("id") === anchor || $(el).find(`[id="${anchor}"]`).length > 0).first();
  if (!target.length) return null;
  const heading = target.closest(".mw-heading2").length ? target.closest(".mw-heading2") : target;
  const isNextSection = (el) => $(el).is(".mw-heading2, h2");
  const parts = [$.html(heading)];
  for (let node = heading[0].nextSibling; node && !isNextSection(node); node = node.nextSibling) {
    parts.push($.html(node));
  }
  return parts.join("");
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

  const section = findAbilitiesSection(meta.parse?.sections);
  if (!section) throw new UpstreamError(`No "Abilities" section on the wiki page for "${page}"`, 404);

  // Numbered sections can be fetched alone; template-generated ones need the full page, then a cut.
  const sectionParam = section.index ? `&section=${section.index}` : "";
  const body = await fetchJson(`${base}&prop=text&disableeditsection=1${sectionParam}`);
  const text = body.parse?.text;
  if (typeof text !== "string") throw new UpstreamError("Wiki returned an unexpected response");
  const html = section.index ? text : extractSectionHtml(text, section.anchor);
  if (!html) throw new UpstreamError(`Couldn't find the Abilities section on the wiki page for "${page}"`, 404);
  return { title: meta.parse.title, html };
}

/** Returns { title, html, text, sourceUrl } for a champion's abilities. */
export function getAbilities(championName) {
  return cached(championName, async () => {
    const { title, html } = await fetchAbilitiesRaw(championName);
    const pageUrl = `${WIKI_BASE}/en-us/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    return {
      title,
      html: sanitizeWikiHtml(html, pageUrl),
      text: abilitiesToText(html),
      sourceUrl: `${pageUrl}#Abilities`,
    };
  });
}
