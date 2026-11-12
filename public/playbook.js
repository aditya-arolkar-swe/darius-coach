const $ = (id) => document.getElementById(id);

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

/** The Playbook panel: lists, adds, edits and deletes knowledge entries. */
export function initPlaybook() {
  const panel = $("playbook");
  const toggle = $("playbook-btn");
  const list = $("playbook-list");
  const form = $("playbook-form");
  const titleIn = $("pb-title");
  const textIn = $("pb-text");
  const saveBtn = $("pb-save");
  const cancelBtn = $("pb-cancel");
  const errorEl = $("pb-error");

  let entries = [];
  let editingId = null;

  const showError = (msg) => {
    errorEl.hidden = !msg;
    errorEl.textContent = msg ?? "";
  };

  const setCount = () => {
    toggle.textContent = `📘 Playbook (${entries.length})`;
  };

  function resetForm() {
    editingId = null;
    form.reset();
    saveBtn.textContent = "Add to playbook";
    cancelBtn.hidden = true;
    showError(null);
  }

  function startEdit(entry) {
    editingId = entry.id;
    titleIn.value = entry.title;
    textIn.value = entry.text;
    saveBtn.textContent = "Save changes";
    cancelBtn.hidden = false;
    titleIn.focus();
  }

  function renderEntry(entry) {
    const card = document.createElement("article");
    card.className = "pb-entry";
    const h = document.createElement("h4");
    h.textContent = entry.title;
    const p = document.createElement("p");
    p.textContent = entry.text;
    const actions = document.createElement("div");
    actions.className = "pb-entry-actions";
    const edit = Object.assign(document.createElement("button"), { type: "button", className: "ghost-btn", textContent: "Edit" });
    const del = Object.assign(document.createElement("button"), { type: "button", className: "ghost-btn", textContent: "Delete" });
    edit.addEventListener("click", () => startEdit(entry));
    del.addEventListener("click", async () => {
      if (!confirm(`Delete "${entry.title}" from your playbook?`)) return;
      await apply(() => request("DELETE", `/api/knowledge/${encodeURIComponent(entry.id)}`));
      if (editingId === entry.id) resetForm();
    });
    actions.append(edit, del);
    card.append(h, p, actions);
    return card;
  }

  function render() {
    setCount();
    list.replaceChildren(
      ...(entries.length
        ? entries.map(renderEntry)
        : [Object.assign(document.createElement("div"), { className: "empty", textContent: "No entries yet." })]),
    );
  }

  async function apply(action) {
    try {
      entries = await action();
      render();
      showError(null);
      return true;
    } catch (err) {
      showError(err.message);
      return false;
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { title: titleIn.value.trim(), text: textIn.value.trim() };
    if (!body.title || !body.text) return showError("Title and description are both required.");
    saveBtn.disabled = true;
    const url = editingId ? `/api/knowledge/${encodeURIComponent(editingId)}` : "/api/knowledge";
    const saved = await apply(() => request(editingId ? "PUT" : "POST", url, body));
    saveBtn.disabled = false;
    if (saved) resetForm();
  });
  cancelBtn.addEventListener("click", resetForm);

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });

  apply(() => request("GET", "/api/knowledge"));
}
