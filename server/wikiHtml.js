import * as cheerio from "cheerio";
import { WIKI_BASE } from "./config.js";

/** Elements that are never rendered: active content, edit chrome and embedded videos. */
export const STRIP_SELECTORS = Object.freeze([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "noscript",
  "link",
  "meta",
  "base",
  'a[href*="action=edit"]',
  ".mw-editsection",
  ".embedvideo",
]);

const DANGEROUS_URL = /^\s*(javascript|vbscript|data):/i;

export function absolutizeUrl(value, pageUrl = "") {
  if (!value) return value;
  if (value.startsWith("#") && pageUrl) return `${pageUrl}${value}`;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${WIKI_BASE}${value}`;
  return value;
}

function absolutizeSrcset(srcset) {
  return srcset
    .split(",")
    .map((part) => {
      const [url, ...rest] = part.trim().split(/\s+/);
      return [absolutizeUrl(url), ...rest].join(" ");
    })
    .join(", ");
}

/**
 * Makes wiki-rendered HTML safe to embed: removes scripts, event handlers and
 * dangerous URLs, keeps classes / inline styles / data-* (needed for the wiki
 * look and tooltips), and points links and images at the wiki. `pageUrl` (the
 * champion's wiki page) resolves same-page #anchor links.
 */
export function sanitizeWikiHtml(rawHtml, pageUrl = "") {
  const $ = cheerio.load(rawHtml, null, false);
  // Video tabs would be empty once embeds are stripped, so drop the whole tab.
  $(".tabbertab").filter((_, tab) => $(tab).find(".embedvideo").length > 0).remove();
  $(STRIP_SELECTORS.join(",")).remove();

  $("*").each((_, el) => {
    for (const [attr, val] of Object.entries(el.attribs ?? {})) {
      const lower = attr.toLowerCase();
      if (lower.startsWith("on") || lower === "srcdoc" || lower === "formaction" || DANGEROUS_URL.test(val ?? "")) {
        $(el).removeAttr(attr);
      }
    }
  });
  $("[src]").each((_, el) => $(el).attr("src", absolutizeUrl($(el).attr("src"))));
  $("[srcset]").each((_, el) => $(el).attr("srcset", absolutizeSrcset($(el).attr("srcset"))));
  $("img[loading]").removeAttr("loading");
  $("a[href]").each((_, el) => {
    $(el).attr("href", absolutizeUrl($(el).attr("href"), pageUrl));
    $(el).attr("target", "_blank").attr("rel", "noopener noreferrer");
  });
  return $.html();
}
