import * as cheerio from "cheerio";
import { WIKI_BASE } from "./config.js";

const SLOT_BY_CLASS = Object.freeze({
  skill_innate: "P",
  skill_q: "Q",
  skill_w: "W",
  skill_e: "E",
  skill_r: "R",
});

const LEAD_LABEL = /^(Innate|Passive|Active|Toggle|Recast|Second Cast|Third Cast)[^:]{0,20}:\s*/;

/** Collapses whitespace and keeps only the first variant of the wiki's 「a」「b」 alternates. */
export function cleanText(text) {
  return text
    .replace(/「([^」]*)」(?:\s*「[^」]*」)*/g, "$1")
    .replace(/[\s ]+/g, " ")
    .replace(/\s+([.,;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
}

function absolutize(src) {
  if (!src) return null;
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("/")) return `${WIKI_BASE}${src}`;
  return src;
}

function slotFor(skillEl, $) {
  const cls = ($(skillEl).attr("class") ?? "").split(/\s+/);
  const key = cls.find((c) => SLOT_BY_CLASS[c]);
  return key ? SLOT_BY_CLASS[key] : null;
}

function parseStats($, container) {
  return $(container)
    .find(".ability-info-stats__stat")
    .map((_, el) => ({
      label: cleanText($(el).find(".ability-info-stats__stat-label").text()).replace(/:$/, ""),
      value: cleanText($(el).find(".ability-info-stats__stat-value").text()),
    }))
    .get()
    .filter((s) => s.label && s.value);
}

function parseRow($, row) {
  const raw = cleanText($(row).find(".ability-info-description").text());
  const match = raw.match(LEAD_LABEL);
  const leveling = $(row)
    .find(".ability-info-stats dl")
    .map((_, dl) =>
      $(dl)
        .find("dt")
        .map((__, dt) => ({
          label: cleanText($(dt).text()).replace(/:$/, ""),
          value: cleanText($(dt).next("dd").text()),
        }))
        .get(),
    )
    .get()
    .filter((l) => l.label && l.value);
  return {
    label: match ? match[1] : null,
    text: match ? raw.slice(match[0].length) : raw,
    leveling,
  };
}

function parseContainer($, container, slot) {
  const icon = $(container).find(".ability-info-icon img").first().attr("src");
  return {
    slot,
    name: cleanText($(container).find(".ability-info-stats__ability").first().text()),
    icon: absolutize(icon),
    stats: parseStats($, container),
    rows: $(container)
      .find(".ability-info-row")
      .map((_, row) => parseRow($, row))
      .get()
      .filter((r) => r.text || r.leveling.length),
  };
}

/** Turns the wiki's Abilities section HTML into clean, structured ability cards. */
export function parseAbilities(rawHtml) {
  const $ = cheerio.load(rawHtml, null, false);
  return $(".skill")
    .map((_, skill) => {
      const slot = slotFor(skill, $);
      return $(skill)
        .find(".ability-info-container")
        .map((__, c) => parseContainer($, c, slot))
        .get();
    })
    .get()
    .filter((a) => a.name);
}
