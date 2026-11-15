import { test } from "node:test";
import assert from "node:assert/strict";
import { abilitiesToText, findAbilitiesSection, extractSectionHtml } from "../server/wiki.js";

const SAMPLE = `
<div class="mw-parser-output">
  <h2 id="Abilities">Abilities</h2>
  <div class="skill">
    <a href="https://wiki.leagueoflegends.com/en-us/Template:Data_Garen/Q?action=edit"><b>Edit</b></a>
    <div class="ability-info-stats__ability">Decisive Strike</div>
    <img src="/en-us/images/Q.png" srcset="/en-us/images/Q2.png 2x" onerror="alert(1)" />
    <a href="/en-us/Silence">silence</a>
    <a href="javascript:alert(1)">bad</a>
    <script>alert("x")</script>
    <p>COOLDOWN: 8</p>
    <div>NOTICE TO API USERS: blah</div>
  </div>
</div>`;

test("findAbilitiesSection finds the top-level Abilities section", () => {
  assert.deepEqual(
    findAbilitiesSection([{ line: "Lore", index: "1", level: "2" }, { line: "Abilities", index: "2", level: "2", anchor: "Abilities" }]),
    { index: "2", anchor: "Abilities" },
  );
  assert.equal(findAbilitiesSection([{ line: "Trivia", index: "1" }]), null);
  assert.equal(findAbilitiesSection(undefined), null);
});

test("findAbilitiesSection handles template-generated headings (Illaoi) with no index", () => {
  const illaoi = [
    { line: "Abilities", level: "2", index: "", anchor: "Abilities" },
    { line: "Pets", level: "2", index: "1", anchor: "Pets" },
    { line: "Abilities", level: "3", index: "", anchor: "Abilities_2" },
  ];
  assert.deepEqual(findAbilitiesSection(illaoi), { index: null, anchor: "Abilities" });
});

test("extractSectionHtml cuts from the heading to the next level-2 heading", () => {
  const page = `<div class="mw-parser-output">
    <p>Intro</p>
    <div class="mw-heading mw-heading2"><h2 id="Abilities">Abilities</h2></div>
    <div class="skill skill_q">Tentacle Smash</div>
    <div class="mw-heading mw-heading3"><h3 id="Sub">Sub</h3></div>
    <p>still abilities</p>
    <div class="mw-heading mw-heading2"><h2 id="Pets">Pets</h2></div>
    <p>pet stuff</p>
  </div>`;
  const out = extractSectionHtml(page, "Abilities");
  assert.match(out, /Tentacle Smash/);
  assert.match(out, /still abilities/);
  assert.match(out, /id="Abilities"/);
  assert.doesNotMatch(out, /Intro|Pets|pet stuff/);
  assert.equal(extractSectionHtml(page, "Missing"), null);
});

test("abilitiesToText produces clean text without chrome", () => {
  const text = abilitiesToText(SAMPLE);
  assert.match(text, /Decisive Strike/);
  assert.match(text, /COOLDOWN: 8/);
  assert.doesNotMatch(text, /Edit/);
  assert.doesNotMatch(text, /alert/);
  assert.doesNotMatch(text, /NOTICE TO API USERS/);
  assert.doesNotMatch(text, /\n\n/);
});
