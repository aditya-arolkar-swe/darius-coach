import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeWikiHtml, absolutizeUrl } from "../server/wikiHtml.js";
import { isAllowedTooltip } from "../server/tooltip.js";
import { renderAbilitiesPage, renderErrorPage, EMBED_CSP, WIKI_STYLESHEETS } from "../server/embed.js";

const DIRTY = `
<div class="skill skill_q" style="background:#082848">
  <a href="https://wiki.leagueoflegends.com/en-us/Template:Data_Garen/Q?action=edit">Edit</a>
  <span class="glossary" data-tip="Silence" data-game="lol">silence</span>
  <img src="/en-us/images/Q.png" srcset="/en-us/images/Q2.png 2x" onerror="alert(1)" loading="lazy" />
  <a href="/en-us/Silence">silence</a>
  <a href="javascript:alert(1)">bad</a>
  <iframe src="https://evil.example"></iframe>
  <div class="embedvideo">video</div>
  <script>alert("x")</script>
</div>`;

test("sanitizeWikiHtml keeps wiki styling hooks but strips active content", () => {
  const out = sanitizeWikiHtml(DIRTY);
  assert.match(out, /class="glossary" data-tip="Silence" data-game="lol"/);
  assert.match(out, /style="background:#082848"/);
  assert.match(out, /src="https:\/\/wiki\.leagueoflegends\.com\/en-us\/images\/Q\.png"/);
  assert.match(out, /srcset="https:\/\/wiki\.leagueoflegends\.com\/en-us\/images\/Q2\.png 2x"/);
  assert.match(out, /href="https:\/\/wiki\.leagueoflegends\.com\/en-us\/Silence" target="_blank" rel="noopener noreferrer"/);
  for (const bad of [/<script/, /onerror/, /javascript:/, /<iframe/, /action=edit/, /embedvideo/, /loading=/]) {
    assert.doesNotMatch(out, bad);
  }
});

test("absolutizeUrl handles relative, protocol-relative and absolute urls", () => {
  assert.equal(absolutizeUrl("/en-us/x"), "https://wiki.leagueoflegends.com/en-us/x");
  assert.equal(absolutizeUrl("//cdn.example/x"), "https://cdn.example/x");
  assert.equal(absolutizeUrl("https://a.b/c"), "https://a.b/c");
  assert.equal(absolutizeUrl(""), "");
  assert.equal(absolutizeUrl("#Pets", "https://wiki.leagueoflegends.com/en-us/Illaoi"), "https://wiki.leagueoflegends.com/en-us/Illaoi#Pets");
  assert.equal(absolutizeUrl("#Pets"), "#Pets");
});

test("isAllowedTooltip only accepts the wiki tooltip templates", () => {
  assert.equal(isAllowedTooltip("{{Tooltip/Glossary||tip=Silence|game=lol}}"), true);
  assert.equal(isAllowedTooltip("{{Tooltip/Ability|champion=Garen|ability=Judgment|variant=|game=lol}}"), true);
  assert.equal(isAllowedTooltip("{{Tooltip/Pp|bot_values=1;2|displayformula=1.3%+0.2% per level}}"), true);
  assert.equal(isAllowedTooltip("{{Tooltip/Evil|x=1}}"), false);
  assert.equal(isAllowedTooltip("{{Tooltip/Glossary|tip={{Template:Big}}}}"), false);
  assert.equal(isAllowedTooltip("{{Tooltip/Glossary|tip=<script>}}"), false);
  assert.equal(isAllowedTooltip("[[Category:x]]"), false);
  assert.equal(isAllowedTooltip(`{{Tooltip/Glossary|tip=${"a".repeat(4000)}}}`), false);
  assert.equal(isAllowedTooltip(undefined), false);
});

test("renderAbilitiesPage builds a wiki-styled, escaped document with our scripts only", () => {
  const html = renderAbilitiesPage({
    title: "Kai'Sa <x>",
    html: '<div class="skill">Q</div>',
    sourceUrl: "https://wiki.leagueoflegends.com/en-us/Kai%27Sa#Abilities",
  });
  for (const href of WIKI_STYLESHEETS) assert.ok(html.includes(href.replace(/&/g, "&amp;")));
  assert.match(html, /<script src="\/embed\/embed\.js"><\/script>/);
  assert.match(html, /Kai&#39;Sa &lt;x&gt; abilities/);
  assert.match(html, /<div class="skill">Q<\/div>/);
  assert.equal((html.match(/<script/g) ?? []).length, 1);
  assert.match(renderErrorPage("<b>nope</b>"), /&lt;b&gt;nope&lt;\/b&gt;/);
});

test("EMBED_CSP only allows our own scripts", () => {
  assert.match(EMBED_CSP, /script-src 'self'(;|$)/);
  assert.match(EMBED_CSP, /default-src 'none'/);
  assert.match(EMBED_CSP, /connect-src 'self'/);
});
