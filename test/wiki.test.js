import { test } from "node:test";
import assert from "node:assert/strict";
import { abilitiesToText, findAbilitiesSectionIndex } from "../server/wiki.js";

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

test("findAbilitiesSectionIndex finds the Abilities section", () => {
  assert.equal(findAbilitiesSectionIndex([{ line: "Lore", index: "1" }, { line: "Abilities", index: "2" }]), "2");
  assert.equal(findAbilitiesSectionIndex([{ line: "Trivia", index: "1" }]), null);
  assert.equal(findAbilitiesSectionIndex(undefined), null);
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
