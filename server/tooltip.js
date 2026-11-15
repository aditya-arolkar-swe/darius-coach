import { CACHE_TTL_MS, WIKI_API } from "./config.js";
import { createCache } from "./cache.js";
import { fetchJson, UpstreamError } from "./http.js";
import { sanitizeWikiHtml } from "./wikiHtml.js";

const cached = createCache(CACHE_TTL_MS);

export const TOOLTIP_TEMPLATES = Object.freeze(["Ability", "Buff", "Champion", "Glossary", "Item", "Rune", "Spell", "Pp"]);
const MAX_LENGTH = 3000;
const TOOLTIP_RX = new RegExp(`^\\{\\{Tooltip/(${TOOLTIP_TEMPLATES.join("|")})\\|[^{}<>\\[\\]]*\\}\\}$`);

/** Only the wiki's own tooltip templates may be rendered, so this can't be used as an open proxy. */
export function isAllowedTooltip(text) {
  return typeof text === "string" && text.length <= MAX_LENGTH && TOOLTIP_RX.test(text);
}

/** Renders a wiki tooltip template (e.g. {{Tooltip/Glossary||tip=Silence|game=lol}}) to safe HTML. */
export function renderTooltip(text) {
  if (!isAllowedTooltip(text)) return Promise.reject(new UpstreamError("Unsupported tooltip", 400));
  return cached(text, async () => {
    const params = new URLSearchParams({
      action: "parse",
      format: "json",
      formatversion: "2",
      prop: "text",
      contentmodel: "wikitext",
      disablelimitreport: "1",
      text,
    });
    const body = await fetchJson(`${WIKI_API}?${params}`);
    if (typeof body.parse?.text !== "string") throw new UpstreamError("Wiki could not render this tooltip");
    return sanitizeWikiHtml(body.parse.text);
  });
}
