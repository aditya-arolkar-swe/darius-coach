/*
 * Vanilla re-implementations of the League Wiki gadgets the Abilities section uses:
 * tooltips (ext.gadget.tooltips), Notes tabs (ext.Tabber), 「a」「b」 value flipping
 * (ext.gadget.flipText) and ◄ ► leveling tabs (ext.gadget.skilltabs).
 */
(function () {
  "use strict";

  // ---------- Tooltips ----------
  // Same wikitext templates the wiki's tooltip gadget sends to its parse API.
  const TOOLTIP_TYPES = [
    ["ability-icon", "{{Tooltip/Ability|champion=<#champion#>|ability=<#ability#>|variant=<#variant#>|game=<#game#>}}"],
    ["buff-icon", "{{Tooltip/Buff|<#param#>|buff=<#buff#>|variant=<#variant#>|game=<#game#>}}"],
    ["champion-icon", "{{Tooltip/Champion|champion=<#champion#>|skin=<#skin#>|variant=<#variant#>|game=<#game#>}}"],
    ["glossary", "{{Tooltip/Glossary|<#param#>|tip=<#tip#>|game=<#game#>}}"],
    ["item-icon", "{{Tooltip/Item|item=<#item#>|enchantment=<#enchantment#>|variant=<#variant#>|game=<#game#>}}"],
    ["rune-icon", "{{Tooltip/Rune|<#param#>|rune=<#rune#>|variant=<#variant#>|game=<#game#>}}"],
    ["spell-icon", "{{Tooltip/Spell|spell=<#spell#>|variant=<#variant#>|game=<#game#>}}"],
    [
      "pp-tooltip",
      "{{Tooltip/Pp|bot_values=<#bot-values#>|top_values=<#top-values#>|start=<#start#>|finish=<#finish#>|bot_label=<#bot-label#>|top_label=<#top-label#>|displayformula=<#displayformula#>|useformula=<#useformula#>|bot_key=<#bot-key#>|top_key=<#top-key#>|bot_round=<#bot-round#>|top_round=<#top-round#>|top_fill=<#top-fill#>}}",
    ],
  ];
  const SELECTOR = TOOLTIP_TYPES.map(([cls]) => "." + cls).join(",");
  const OFFSET = 20;
  const cache = new Map(); // wikitext -> Promise<html>

  const wrapper = document.createElement("div");
  wrapper.id = "tooltip-wrapper";
  wrapper.hidden = true;
  document.body.append(wrapper);

  let activeEl = null;
  let mouse = [0, 0];

  function wikitextFor(el) {
    const type = TOOLTIP_TYPES.find(([cls]) => el.classList.contains(cls));
    if (!type) return null;
    return type[1].replace(/<#\s*([a-z0-9_-]+?)\s*#>/gi, (_, name) =>
      (el.getAttribute("data-" + name) || "").replace(/[{}<>\[\]|]/g, ""),
    );
  }

  function fetchTooltip(text) {
    if (!cache.has(text)) {
      const p = fetch("/api/wiki/tooltip?text=" + encodeURIComponent(text))
        .then((r) => r.json())
        .then((body) => {
          if (!body.success) throw new Error(body.error || "Tooltip failed");
          return body.data.html;
        });
      p.catch(() => cache.delete(text));
      cache.set(text, p);
    }
    return cache.get(text);
  }

  function position() {
    const w = wrapper.offsetWidth;
    const h = wrapper.offsetHeight;
    const [x, y] = mouse;
    let left = x + OFFSET;
    let top = y + OFFSET;
    if (left + w > window.innerWidth) left = Math.max(4, x - w - OFFSET);
    if (top + h > window.innerHeight) top = Math.max(4, window.innerHeight - h - 4);
    wrapper.style.left = left + "px";
    wrapper.style.top = top + "px";
  }

  function show(el) {
    const text = wikitextFor(el);
    if (!text) return;
    activeEl = el;
    wrapper.innerHTML = '<div class="main-tooltip tt-basic-tooltip embed-tt-loading">Loading…</div>';
    wrapper.hidden = false;
    position();
    fetchTooltip(text)
      .then((html) => {
        if (activeEl !== el) return;
        const tip = document.createElement("div");
        tip.className = "main-tooltip";
        tip.innerHTML = html; // sanitized server-side; CSP blocks any script
        wrapper.replaceChildren(tip);
        tip.querySelectorAll("img").forEach((img) => img.addEventListener("load", position, { once: true }));
        position();
      })
      .catch(() => {
        if (activeEl === el) hide();
      });
  }

  function hide() {
    activeEl = null;
    wrapper.hidden = true;
    wrapper.replaceChildren();
  }

  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest(SELECTOR);
    if (el && el !== activeEl) show(el);
  });
  document.addEventListener("mouseout", (e) => {
    if (!activeEl) return;
    const to = e.relatedTarget;
    if (!to || !activeEl.contains(to)) {
      const next = to && to.closest ? to.closest(SELECTOR) : null;
      if (next !== activeEl) hide();
    }
  });
  document.addEventListener("mousemove", (e) => {
    mouse = [e.clientX, e.clientY];
    if (!wrapper.hidden) position();
  });
  document.addEventListener("scroll", hide, { passive: true });
  document.querySelectorAll(SELECTOR).forEach((el) => el.classList.add("tooltips-init-complete"));

  // ---------- Tabber (Notes / Hide) ----------
  document.querySelectorAll(".tabber").forEach((tabber) => {
    const tabs = Array.from(tabber.children).filter((c) => c.classList.contains("tabbertab"));
    if (!tabs.length) return;
    const nav = document.createElement("ul");
    nav.className = "tabbernav";
    const select = (i) => {
      tabs.forEach((t, j) => t.classList.toggle("tabbertabhide", i !== j));
      Array.from(nav.children).forEach((li, j) => li.classList.toggle("tabberactive", i === j));
    };
    tabs.forEach((tab, i) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = (tab.getAttribute("data-title") || "Tab " + (i + 1)).trim();
      a.addEventListener("click", (e) => {
        e.preventDefault();
        select(i);
      });
      li.append(a);
      nav.append(li);
    });
    tabber.prepend(nav);
    tabber.classList.add("tabberlive");
    select(0);
  });

  // ---------- flipText: click to swap 「a」「b」 variants ----------
  document.querySelectorAll(".flipText2").forEach((el) => (el.style.display = "none"));
  document.addEventListener("click", (e) => {
    const flip = e.target.closest(".flipText1, .flipText2");
    if (!flip) return;
    const container = flip.closest("span.container");
    if (!container) return;
    Array.from(container.children).forEach((child) => {
      child.style.display = child.style.display === "none" ? "" : "none";
    });
  });

  // ---------- skilltabs: ◄ ► cycling through leveling rows ----------
  document.querySelectorAll(".skill-tabs:not(.made-skill-tabs)").forEach((tabs) => {
    tabs.classList.add("made-skill-tabs");
    const dts = Array.from(tabs.children).filter((c) => c.tagName === "DT");
    if (dts.length === 2) tabs.classList.add("toggle-tabs");
    const showTab = (i) =>
      dts.forEach((dt, j) => {
        dt.classList.toggle("hidden-tab", i !== j);
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === "DD") dd.classList.toggle("hidden-tab", i !== j);
      });
    const arrow = (cls, label, target) => {
      const span = document.createElement("span");
      span.className = cls;
      span.title = "Click to cycle through the information.";
      span.textContent = label;
      span.addEventListener("mousedown", (e) => e.preventDefault());
      span.addEventListener("click", () => showTab(target));
      return span;
    };
    dts.forEach((dt, i) => {
      if (i > 0) dt.prepend(arrow("prev-tab", "◄", i - 1));
      if (i < dts.length - 1) dt.append(arrow("next-tab", "►", i + 1));
    });
    showTab(0);
  });
})();
