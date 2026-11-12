const messagesEl = document.getElementById("messages");

export function renderMarkdown(el, text) {
  el.innerHTML = window.DOMPurify.sanitize(window.marked.parse(text));
}

export function addBubble(role, text = "") {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  if (role === "assistant") renderMarkdown(div, text);
  else div.textContent = text;
  messagesEl.append(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

export function clearMessages() {
  messagesEl.replaceChildren();
}

/** Quick-pick follow-up topics. Clicking one only fills the input box. */
export function addChips(topics, onPick) {
  if (!topics.length) return;
  const wrap = document.createElement("div");
  wrap.className = "chips";
  for (const topic of topics) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = topic;
    btn.addEventListener("click", () => onPick(`Tell me more about: ${topic}`));
    wrap.append(btn);
  }
  messagesEl.append(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/** Parses the server-sent-event stream from POST /api/chat. */
async function* readSse(response) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = chunk.match(/^event: (.*)$/m)?.[1];
      const data = chunk.match(/^data: (.*)$/m)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) };
    }
  }
}

/**
 * Sends the conversation and streams the reply into a new assistant bubble.
 * Returns the full reply text, or null if it failed.
 */
export async function streamReply({ champion, role, messages, signal }) {
  const bubble = addBubble("assistant");
  bubble.classList.add("typing");
  let text = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ champion, role, messages }),
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    for await (const { event, data } of readSse(res)) {
      if (event === "delta") {
        text += data.text;
        renderMarkdown(bubble, text);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (event === "error") {
        throw new Error(data.error);
      }
    }
    if (!text) throw new Error("Claude returned an empty response.");
    return text;
  } catch (err) {
    if (err.name === "AbortError") {
      bubble.remove();
      return null;
    }
    bubble.className = "msg error";
    bubble.textContent = `⚠️ ${err.message}`;
    return null;
  } finally {
    bubble.classList.remove("typing");
  }
}
