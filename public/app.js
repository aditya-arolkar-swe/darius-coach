import { createCombo } from "./combo.js";
import { addBubble, addChips, clearMessages, streamReply } from "./chat.js";
import { renderAbilities } from "./abilities.js";
import { initPlaybook } from "./playbook.js";

const $ = (id) => document.getElementById(id);
const abilitiesEl = $("abilities");
const chatInput = $("chat-input");
const sendBtn = $("send-btn");

let state = { champion: null, role: "top", messages: [], provider: null, busy: false, topics: {} };
let inflight = null;

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
  if (reply && messages.length === 1) addChips(state.topics[state.role] ?? [], prefill);
}

function resetChat() {
  inflight?.abort();
  clearMessages();
  setState({ messages: [], busy: false });
  if (!state.provider) {
    addBubble("error", "Connect Claude first (see setup above).");
    return;
  }
  addBubble("hint", `Matchup: Darius vs ${state.champion}. Click Send to get 3 quick tips.`);
  prefill(openingQuestion(state.champion, state.role));
}

async function loadAbilities(champion) {
  abilitiesEl.innerHTML = `<div class="loading">Loading ${champion.name}'s abilities from the wiki…</div>`;
  try {
    const data = await getJson(`/api/abilities/${encodeURIComponent(champion.name)}`);
    if (state.champion === champion.name) renderAbilities(abilitiesEl, data);
  } catch (err) {
    showError(abilitiesEl, `Couldn't load abilities: ${err.message}`);
  }
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
    const { provider, model, followUpTopics } = await getJson("/api/status");
    setState({ provider, topics: followUpTopics ?? {} });
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
