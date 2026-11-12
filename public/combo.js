/** Searchable dropdown. Calls onSelect(champion) when the user picks one. */
export function createCombo({ input, list, champions, onSelect }) {
  let matches = [];
  let active = -1;

  const score = (name, q) => {
    const n = name.toLowerCase().replace(/[^a-z]/g, "");
    if (n.startsWith(q)) return 0;
    if (n.includes(q)) return 1;
    return -1;
  };

  function filter(query) {
    const q = query.toLowerCase().replace(/[^a-z]/g, "");
    if (!q) return champions;
    return champions
      .map((c) => ({ c, s: score(c.name, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.c.name.localeCompare(b.c.name))
      .map((x) => x.c);
  }

  function render() {
    list.replaceChildren(
      ...matches.map((c, i) => {
        const li = document.createElement("li");
        li.role = "option";
        li.setAttribute("aria-selected", String(i === active));
        const img = Object.assign(document.createElement("img"), { src: c.icon, alt: "" });
        const label = document.createElement("span");
        label.append(c.name, " ");
        const title = document.createElement("small");
        title.textContent = c.title;
        label.append(title);
        li.append(img, label);
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          choose(c);
        });
        return li;
      }),
    );
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }

  function open() {
    matches = filter(input.value);
    active = matches.length ? 0 : -1;
    list.hidden = matches.length === 0;
    input.setAttribute("aria-expanded", String(!list.hidden));
    render();
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }

  function choose(c) {
    input.value = c.name;
    close();
    input.blur();
    onSelect(c);
  }

  input.addEventListener("input", open);
  input.addEventListener("focus", () => {
    input.select();
    open();
  });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    if (list.hidden && e.key === "ArrowDown") return open();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      active = (active + step + matches.length) % matches.length;
      render();
    } else if (e.key === "Enter" && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      close();
    }
  });
}
