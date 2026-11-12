const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const STAT_LABELS = Object.freeze({
  COOLDOWN: "Cooldown",
  COST: "Cost",
  RANGE: "Range",
  "CAST TIME": "Cast time",
  "TARGET RANGE": "Target range",
  "EFFECT RADIUS": "Radius",
  WIDTH: "Width",
  SPEED: "Speed",
  "STATIC COOLDOWN": "Static CD",
  RECHARGE: "Recharge",
});

const prettyLabel = (label) => STAT_LABELS[label] ?? label.charAt(0) + label.slice(1).toLowerCase();

function renderStats(stats) {
  const wrap = el("div", "ab-stats");
  for (const s of stats) {
    const chip = el("span", "ab-stat");
    chip.append(el("b", null, `${prettyLabel(s.label)} `), s.value);
    wrap.append(chip);
  }
  return wrap;
}

function renderRow(row) {
  const wrap = el("div", "ab-row");
  const p = el("p");
  if (row.label) p.append(el("span", "ab-tag", row.label));
  p.append(row.text);
  wrap.append(p);
  if (row.leveling.length) {
    const dl = el("dl", "ab-leveling");
    for (const l of row.leveling) dl.append(el("dt", null, l.label), el("dd", null, l.value));
    wrap.append(dl);
  }
  return wrap;
}

function renderCard(ability) {
  const card = el("article", "ab-card");
  const head = el("header", "ab-head");
  const iconWrap = el("div", "ab-icon");
  if (ability.icon) iconWrap.append(Object.assign(el("img"), { src: ability.icon, alt: "" }));
  if (ability.slot) iconWrap.append(el("span", "ab-slot", ability.slot));
  const title = el("div");
  title.append(el("h3", null, ability.name));
  if (ability.stats.length) title.append(renderStats(ability.stats));
  head.append(iconWrap, title);
  card.append(head, ...ability.rows.map(renderRow));
  return card;
}

/** Renders parsed abilities into clean, readable cards. */
export function renderAbilities(container, { title, abilities, sourceUrl }) {
  const header = el("div", "ab-header");
  header.append(el("h2", null, `${title} abilities`));
  const link = el("a", null, "View on wiki ↗");
  Object.assign(link, { href: sourceUrl, target: "_blank", rel: "noopener noreferrer" });
  header.append(link);

  const list = abilities.length
    ? abilities.map(renderCard)
    : [el("div", "empty", "Couldn't read abilities from the wiki page. Use the wiki link above.")];
  container.replaceChildren(header, ...list);
  container.scrollTop = 0;
}
