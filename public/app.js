import { createCombo } from "./combo.js";
import { addBubble, clearMessages, streamReply } from "./chat.js";
import { initPlaybook } from "./playbook.js";

const $ = (id) => document.getElementById(id);
const abilitiesEl = $("abilities");
const chatInput = $("chat-input");
const sendBtn = $("send-btn");

let state = { champion: null, role: "top", messages: [], provider: null, busy: false };
let inflight = null;

let suggestionsAbort = null;

/** Shown before the first reply, and as a fallback if Claude can't suggest questions. */
const STARTER_SUGGESTIONS = Object.freeze([
  (champ) => `What CC does ${champ} have?`,
  (champ) => `What items should I build into ${champ}?`,
  (champ) => `What runes should I take into ${champ}?`,
]);
const starterSuggestions = (champ) => STARTER_SUGGESTIONS.map((make) => make(champ));

/** Suggested questions above the input. Clicking one only fills the box; it never sends. */
function renderSuggestions(questions, { label = "", loading = false } = {}) {
  const wrap = $("suggestions");
  wrap.hidden = !state.champion;
  if (!state.champion) return;
  const heading = label ? [Object.assign(document.createElement("div"), { className: "suggestions-label", textContent: label })] : [];
  if (loading) {
    const note = Object.assign(document.createElement("span"), { className: "suggestions-loading", textContent: "Coach is thinking of follow-up questions…" });
    wrap.replaceChildren(...heading, note);
    return;
  }
  wrap.replaceChildren(
    ...heading,
    ...questions.map((text) => {
      const btn = Object.assign(document.createElement("button"), { type: "button", className: "chip", textContent: text });
      btn.addEventListener("click", () => prefill(text));
      return btn;
    }),
  );
}

/** After each reply, asks Claude what the player is likely to ask next and shows 3 of those. */
async function refreshSuggestions(messages) {
  suggestionsAbort?.abort();
  suggestionsAbort = new AbortController();
  const { signal } = suggestionsAbort;
  renderSuggestions([], { label: "Suggested by your coach", loading: true });
  try {
    const res = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ champion: state.champion, role: state.role, messages }),
      signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
    if (state.messages !== messages) return; // conversation moved on
    const questions = body.data.questions;
    if (questions.length) renderSuggestions(questions, { label: "Suggested by your coach" });
    else renderSuggestions(starterSuggestions(state.champion));
  } catch (err) {
    if (err.name === "AbortError" || state.messages !== messages) return;
    renderSuggestions(starterSuggestions(state.champion));
  }
}

const setState = (patch) => {
  state = { ...state, ...patch };
  const canChat = Boolean(state.champion && state.provider && !state.busy);
  chatInput.disabled = !canChat;
  sendBtn.disabled = !canChat;
};

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  if (!body.success) throw new Error(body.error ?? "Request failed");
  return body.data;
}

function showError(container, message) {
  const div = document.createElement("div");
  div.className = "msg error";
  div.textContent = message;
  container.replaceChildren(div);
}

function openingQuestion(champion, role) {
  const where = role === "jungle" ? "in the jungle" : "in top lane";
  return `How should I play Darius into ${champion} ${where}? What items should I build?`;
}

/** Puts text in the box for the user to send; never calls the AI itself. */
function prefill(text) {
  chatInput.value = text;
  if (!chatInput.disabled) chatInput.focus();
}

async function send(content) {
  inflight?.abort();
  suggestionsAbort?.abort();
  inflight = new AbortController();
  const messages = [...state.messages, { role: "user", content }];
  addBubble("user", content);
  setState({ messages, busy: true });

  const reply = await streamReply({ champion: state.champion, role: state.role, messages, signal: inflight.signal });
  if (state.messages !== messages) return; // conversation was reset mid-stream
  setState({
    busy: false,
    // Drop a failed question so user/assistant turns keep alternating.
    messages: reply ? [...messages, { role: "assistant", content: reply }] : messages.slice(0, -1),
  });
  if (reply) refreshSuggestions(state.messages);
}

function resetChat() {
  inflight?.abort();
  suggestionsAbort?.abort();
  clearMessages();
  setState({ messages: [], busy: false });
  renderSuggestions(starterSuggestions(state.champion));
  if (!state.provider) {
    addBubble("error", "Connect Claude first (see setup above).");
    return;
  }
  addBubble("hint", `Matchup: Darius vs ${state.champion}. Click Send to get 3 quick tips.`);
  prefill(openingQuestion(state.champion, state.role));
}

/** Shows the wiki's own Abilities section (wiki styling + hover tooltips) in an isolated frame. */
function loadAbilities(champion) {
  const loading = Object.assign(document.createElement("div"), {
    className: "loading",
    textContent: `Loading ${champion.name}'s abilities from the wiki…`,
  });
  const frame = Object.assign(document.createElement("iframe"), {
    className: "wiki-frame",
    title: `${champion.name} abilities`,
    src: `/embed/abilities/${encodeURIComponent(champion.name)}`,
  });
  frame.hidden = true;
  frame.addEventListener("load", () => {
    loading.remove();
    frame.hidden = false;
  });
  abilitiesEl.replaceChildren(loading, frame);
}

function showSetup() {
  const setup = $("setup");
  setup.hidden = false;
  setup.innerHTML = `
    <strong>Connect Claude</strong>. Pick one, then restart the server (<code>pnpm start</code>):
    <ol>
      <li><b>Use your Claude Pro/Max account (no API key):</b> install Claude Code
        (<code>npm i -g @anthropic-ai/claude-code</code>) and run <code>claude</code> once to log in.</li>
      <li><b>Use an API key (pay-per-use):</b> create one at
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>,
        then put <code>ANTHROPIC_API_KEY=sk-ant-…</code> in <code>darius-coach/.env</code>.</li>
    </ol>`;
}

async function checkStatus() {
  const badge = $("provider-badge");
  try {
    const { provider, model } = await getJson("/api/status");
    setState({ provider });
    if (provider) {
      badge.className = "badge ok";
      badge.textContent = provider === "cli" ? "Claude account" : `API · ${model}`;
      $("setup").hidden = true;
    } else {
      badge.className = "badge bad";
      badge.textContent = "not connected";
      showSetup();
    }
  } catch {
    badge.className = "badge bad";
    badge.textContent = "server error";
  }
}

function wireChat() {
  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || chatInput.disabled) return;
    chatInput.value = "";
    send(text);
  });
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("chat-form").requestSubmit();
    }
  });

  // Role only changes context for the next message; it never sends anything.
  document.querySelectorAll('input[name="role"]').forEach((r) =>
    r.addEventListener("change", () => {
      const before = state.champion && openingQuestion(state.champion, state.role);
      setState({ role: r.value });
      if (state.champion && chatInput.value.trim() === before) prefill(openingQuestion(state.champion, state.role));
    }),
  );
}

async function init() {
  wireChat();
  initPlaybook();
  await checkStatus();
  try {
    const { champions } = await getJson("/api/champions");
    createCombo({
      input: $("champ-input"),
      list: $("champ-list"),
      champions,
      onSelect: (champion) => {
        setState({ champion: champion.name });
        loadAbilities(champion);
        resetChat();
      },
    });
  } catch (err) {
    showError(abilitiesEl, `Couldn't load the champion list: ${err.message}`);
  }
}

init();
