import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, parseAbilities } from "../server/abilityParser.js";

const SKILL = (cls, name, inner) => `
<div class="skill ${cls}"><div class="skill_header"><a href="?action=edit">Edit</a>
  <div class="ability-info-container">
    <div class="ability-info-stats__wrapper">
      <div class="ability-info-stats__ability">${name}</div>
      <div class="ability-info-stats__list">
        <div class="ability-info-stats__stat"><div class="ability-info-stats__stat-label">COOLDOWN:</div><div class="ability-info-stats__stat-value">8</div></div>
      </div>
    </div>
    <div class="ability-info-content">${inner}</div>
  </div></div></div>
<div class="tabbertab-bordered">Notes that should be ignored</div>`;

const ROW = `
<div class="ability-info-row">
  <div class="ability-info-icon"><img src="/en-us/images/Garen_Decisive_Strike.png" /></div>
  <div class="ability-info-description"><span><b>Active:</b></span> Garen gains <span>35%</span> bonus movement speed .</div>
  <div class="ability-info-stats"><dl class="skill-tabs"><dt>Bonus Damage:</dt><dd>30 / 60 / 90</dd></dl></div>
</div>
<div class="ability-info-row"><div class="ability-info-description no-stats">Resets his basic attack timer.</div><div class="ability-info-stats"></div></div>`;

test("cleanText collapses whitespace and keeps the first alternate value", () => {
  assert.equal(cleanText("  a \n b  ."), "a b.");
  assert.equal(cleanText("deals「 1 – 10 (based on level) 」「 0.1 – 1 」 damage"), "deals 1 – 10 (based on level) damage");
});

test("parseAbilities extracts slot, name, icon, stats, rows and leveling", () => {
  const [q] = parseAbilities(SKILL("skill_q", "Decisive Strike", ROW));
  assert.equal(q.slot, "Q");
  assert.equal(q.name, "Decisive Strike");
  assert.equal(q.icon, "https://wiki.leagueoflegends.com/en-us/images/Garen_Decisive_Strike.png");
  assert.deepEqual(q.stats, [{ label: "COOLDOWN", value: "8" }]);
  assert.equal(q.rows.length, 2);
  assert.deepEqual(q.rows[0], {
    label: "Active",
    text: "Garen gains 35% bonus movement speed.",
    leveling: [{ label: "Bonus Damage", value: "30 / 60 / 90" }],
  });
  assert.deepEqual(q.rows[1], { label: null, text: "Resets his basic attack timer.", leveling: [] });
});

test("parseAbilities handles innate, unknown slots and skips notes", () => {
  const html = SKILL("skill_innate", "Perseverance", ROW) + SKILL("skill_aphelios", "Calibrum", ROW);
  const abilities = parseAbilities(html);
  assert.deepEqual(abilities.map((a) => [a.slot, a.name]), [["P", "Perseverance"], [null, "Calibrum"]]);
  assert.ok(!JSON.stringify(abilities).includes("Notes that should be ignored"));
  assert.deepEqual(parseAbilities("<div>nothing</div>"), []);
});
