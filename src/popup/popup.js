/* GENERATED from shared/popup/popup.js by tools/sync-shared.mjs — edit the original. */
const { icons: ICONS, groups: GROUPS } = BYTM_POPUP;
const HOST = globalThis.bytmHost; // set by the desktop app's settings window

if (HOST?.desktopGroups) GROUPS.push(...HOST.desktopGroups);

let settings = { ...BYTM.DEFAULTS };
const switches = new Map();

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  if (ICONS[name]) path.setAttribute("d", ICONS[name]); // unknown name: empty icon, not an error
  svg.append(path);
  return svg;
}

function save(patch) {
  Object.assign(settings, patch);
  BYTM.ext().storage.sync.set(patch);
  refresh();
}

// Rows with `options: [{ value, label }]` become an M3 connected button group.
const choices = new Map();
function buildChoiceRow({ key, title, sub, options }) {
  const group = el("div", { className: "segmented", role: "radiogroup" });
  group.setAttribute("aria-label", title);
  for (const { value, label } of options) {
    const b = el("button", { type: "button", className: "segment", textContent: label });
    b.setAttribute("role", "radio");
    b.dataset.value = value;
    b.addEventListener("click", () => save({ [key]: value }));
    group.append(b);
  }
  choices.set(key, group);
  return el(
    "div",
    { className: "row choice-row" },
    el("span", { className: "row-text" }, el("span", { className: "row-title", textContent: title }), el("span", { className: "row-sub", textContent: sub })),
    group
  );
}

function buildRow(row) {
  if (row.options) return buildChoiceRow(row);
  const { key, title, sub } = row;
  const input = el("input", { type: "checkbox", className: "switch", checked: !!settings[key] });
  input.setAttribute("role", "switch");
  input.addEventListener("change", () => save({ [key]: input.checked }));
  switches.set(key, input);
  return el(
    "label",
    { className: "row" },
    el("span", { className: "row-text" }, el("span", { className: "row-title", textContent: title }), el("span", { className: "row-sub", textContent: sub })),
    input
  );
}

function buildAccentRow() {
  const wrap = el("div", { className: "accents", role: "radiogroup" });
  wrap.setAttribute("aria-label", "Accent color");
  for (const { name, hue } of BYTM.ACCENTS) {
    const radio = el("input", { type: "radio", name: "accent", className: "accent", title: name, checked: settings.accentHue === hue });
    radio.setAttribute("aria-label", name);
    radio.style.setProperty("--hue", hue);
    radio.addEventListener("change", () => save({ accentHue: hue }));
    wrap.append(radio);
  }
  return el(
    "div",
    { className: "row accent-row", id: "accent-row" },
    el(
      "span",
      { className: "row-text" },
      el("span", { className: "row-title", textContent: "Accent color" }),
      el("span", { className: "row-sub", textContent: BYTM_POPUP.accentSub || "Used when dynamic color is off or the artwork is greyscale" })
    ),
    wrap
  );
}

function buildGroups() {
  const main = document.getElementById("groups");
  for (const group of GROUPS) {
    const list = el("div", { className: "list" });
    for (const row of group.rows) list.append(buildRow(row));
    if (group.accent) list.append(buildAccentRow());
    const h2 = el("h2", {}, icon(group.icon), group.title);
    main.append(el("section", { className: "group" }, h2, list));
  }
}

function refresh() {
  for (const group of GROUPS) {
    for (const row of group.rows) {
      const control = switches.get(row.key) || choices.get(row.key);
      if (row.options) {
        for (const b of control.children) b.setAttribute("aria-checked", String(b.dataset.value === String(settings[row.key])));
      } else {
        control.checked = !!settings[row.key];
      }
      const off = (row.needsTheme && !settings.theme) || (row.needs && !settings[row.needs]);
      control.closest(".row").classList.toggle("disabled", !!off);
    }
  }
  document.getElementById("accent-row").classList.toggle("disabled", !settings.theme);
  paintPalette();
}

let lastPalette = null;
function paintPalette() {
  const style = document.documentElement.style;
  const label = document.getElementById("palette-label");
  if (settings.dynamicColor && lastPalette) {
    style.setProperty("--bytm-hue", lastPalette.hue);
    style.setProperty("--bytm-chroma", lastPalette.chroma);
    label.textContent = BYTM_POPUP.paletteFromLast;
  } else {
    style.setProperty("--bytm-hue", settings.accentHue);
    style.setProperty("--bytm-chroma", 0.13);
    label.textContent = settings.dynamicColor ? BYTM_POPUP.paletteWaiting : "Using your accent color";
  }
}

// Scalloped "cookie" from the M3 Expressive shape set.
function cookiePath(lobes = 9, depth = 0.075, radius = 46) {
  const pts = [];
  for (let i = 0; i < 360; i += 2) {
    const t = (i * Math.PI) / 180;
    const r = radius * (1 - depth + depth * Math.cos(lobes * t));
    pts.push(`${(r * Math.cos(t)).toFixed(2)} ${(r * Math.sin(t)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

// Rounded regular polygon (point up), as an SVG path.
function polygonPath(sides, radius = 48, round = 14) {
  const corner = (radius * Math.cos(Math.PI / sides) - round) / Math.cos(Math.PI / sides);
  const pts = Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    return [corner * Math.cos(a), corner * Math.sin(a)];
  });
  // Offset each corner outward by `round` with an arc between the edge normals.
  let d = "";
  pts.forEach(([x, y], i) => {
    const a0 = -Math.PI / 2 + ((i - 0.5) * 2 * Math.PI) / sides;
    const a1 = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / sides;
    const p0 = [x + round * Math.cos(a0), y + round * Math.sin(a0)];
    const p1 = [x + round * Math.cos(a1), y + round * Math.sin(a1)];
    d += `${i ? "L" : "M"}${p0[0].toFixed(2)} ${p0[1].toFixed(2)}A${round} ${round} 0 0 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
  });
  return `${d}Z`;
}

// The logo's shape (each extension's groups.js describes its own).
const HERO = BYTM_POPUP.hero || { lobes: 9, depth: 0.075 };
const heroShape = document.getElementById("hero-cookie");
heroShape.setAttribute("d", HERO.sides ? polygonPath(HERO.sides, HERO.radius, HERO.round) : cookiePath(HERO.lobes, HERO.depth));
if (HERO.color) document.querySelector(".hero-shape").style.setProperty("--hero-color", HERO.color);
document.getElementById("open-ytm").textContent = HOST?.desktop ? "Back to music" : BYTM_POPUP.openLabel;
document.getElementById("open-ytm").addEventListener("click", () => {
  BYTM.ext().tabs.create({ url: BYTM_POPUP.appUrl });
  window.close();
});

Promise.all([BYTM.loadSettings(), BYTM.ext().storage.local.get("lastPalette")]).then(([loaded, local]) => {
  settings = loaded;
  lastPalette = local.lastPalette || null;
  buildGroups();
  refresh();
});

BYTM.ext().storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lastPalette) {
    lastPalette = changes.lastPalette.newValue;
    paintPalette();
  }
});
