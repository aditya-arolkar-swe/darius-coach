import { WIKI_BASE } from "./config.js";

const LOAD_PHP = `${WIKI_BASE}/en-us/load.php?lang=en&skin=vector&only=styles`;

/** The same stylesheets the wiki page loads (skin + extensions + gadgets, then site styles). */
export const WIKI_STYLESHEETS = Object.freeze([
  `${LOAD_PHP}&modules=${encodeURIComponent(
    "ext.cite.styles|jquery.makeCollapsible.styles|skins.vector.styles.legacy|ext.Tabber|ext.gadget.tooltips|ext.gadget.skilltabs",
  )}`,
  `${LOAD_PHP}&modules=site.styles`,
]);

/** Locks the embed down: only our own scripts run; styles, images and fonts may come from the wiki. */
export const EMBED_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "connect-src 'self'",
  `style-src 'self' 'unsafe-inline' ${WIKI_BASE}`,
  `img-src ${WIKI_BASE} data:`,
  `font-src ${WIKI_BASE} data:`,
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page({ title, body }) {
  return `<!doctype html>
<html class="client-js" lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
${WIKI_STYLESHEETS.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`).join("\n")}
<link rel="stylesheet" href="/embed/embed.css" />
</head>
<body class="skin-vector-legacy mediawiki ltr sitedir-ltr ns-0 ns-subject skin-vector action-view embed-body">
${body}
<script src="/embed/embed.js"></script>
</body>
</html>`;
}

/** Full HTML document showing only a champion's Abilities section, wiki-styled. */
export function renderAbilitiesPage({ title, html, sourceUrl }) {
  return page({
    title: `${title} abilities`,
    body: `<div id="content" class="mw-body">
  <div class="embed-source">From the League of Legends Wiki: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)} ↗</a></div>
  <div id="bodyContent" class="vector-body"><div id="mw-content-text" class="mw-body-content">${html}</div></div>
</div>`,
  });
}

export function renderErrorPage(message) {
  return page({ title: "Abilities unavailable", body: `<div class="embed-error">${escapeHtml(message)}</div>` });
}
