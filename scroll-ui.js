"use strict";

// =============================================================================
// Prototype 0.6 — JEDNOTNÁ VIZUÁLNÍ KOMPONENTA SVITKU (player-facing)
// =============================================================================
// Všechny prefix/suffix svitky (64 z 64) používají PRÁVĚ TENTO kód: stejné pozadí,
// stejný rám, stejnou barvu názvu, žádný glow (liší se jen barva obrázku svitku podle tématu), generický typ "AFFIX SCROLL".
// Prefix a suffix se liší jen malým písmenem na ikoně a textem PREFIX/SUFFIX SCROLL —
// to označuje druh svitku, nikdy sílu.
//
// Renderer je ALLOWLIST: čte výhradně view model z buildAffixScrollViewModel()
// (affix-logic.js). Interní objekt (tier, design, scarcity) se sem nikdy nepředává.
// =============================================================================

const AFFIX_SCROLL_TYPE_LABEL = "AFFIX SCROLL";
const AFFIX_SCROLL_SUBTYPE_LABEL = Object.freeze({ prefix: "PREFIX SCROLL", suffix: "SUFFIX SCROLL" });
// Čtyři barevné varianty téhož svitku (modrá/zelená/fialová/duha). Barva = téma affixu
// (viz getAffixScrollColor v affix-logic.js), NIKDY síla ani vzácnost. Rám, pozadí a název jsou stejné.
const AFFIX_SCROLL_IMAGES = Object.freeze({
  blue: "assets/scrolls/affix_scroll_blue.png",
  green: "assets/scrolls/affix_scroll_green.png",
  purple: "assets/scrolls/affix_scroll_purple.png",
  rainbow: "assets/scrolls/affix_scroll_rainbow.png",
});
function affixScrollIconHtml(color) {
  const key = AFFIX_SCROLL_IMAGES[color] ? color : "blue";
  return `<img class="scroll-art" data-scroll-color="${key}" src="${AFFIX_SCROLL_IMAGES[key]}" alt="" draggable="false" />`;
}

// Odstraní z prvku jakoukoli kvalitu a označí ho jednotným vzhledem svitku.
function applyAffixScrollVisuals(element) {
  if (!element) return element;
  element.className = element.className.replace(/(^|\s)q-[\w-]+/g, " ").replace(/\s+/g, " ").trim();
  element.querySelectorAll(":scope > .q-upg, :scope > .q-max-corners, :scope > .q-shine").forEach((node) => node.remove());
  delete element.dataset.quality;
  element.classList.add("scroll-surface");
  element.dataset.visual = "affix_scroll";
  return element;
}

// Ikona svitku: společné SVG + malé písmeno P/S.
function renderAffixScrollIcon(container, affixType, color) {
  container.innerHTML = `${affixScrollIconHtml(color)}<span class="scroll-mark" aria-hidden="true">${affixType === "prefix" ? "P" : "S"}</span>`;
  container.classList.add("scroll-icon");
  container.classList.remove("item-glow");
  container.style.removeProperty("--glow-color");
  return container;
}

// Detail svitku — jediné místo, které z view modelu skládá obsah. Pole mimo allowlist
// (viz AFFIX_SCROLL_VIEW_KEYS) sem nemají jak proniknout.
// targets: { badge, icon, title, type, stats, meta, note }
function renderAffixScrollDetail(model, targets) {
  const { badge, icon, title, type, stats, meta } = targets;
  if (badge) badge.textContent = AFFIX_SCROLL_TYPE_LABEL;
  if (icon) renderAffixScrollIcon(icon, model.affixType, model.scrollColor);
  if (title) { title.textContent = model.displayName; title.className = "detail-title scroll-title"; }
  if (type) type.textContent = AFFIX_SCROLL_SUBTYPE_LABEL[model.affixType];
  if (stats) {
    stats.replaceChildren();
    model.formattedModifiers.forEach((line) => {
      const row = document.createElement("div");
      row.className = `kv-row scroll-mod${line.negative ? " negative" : ""}`;
      const text = document.createElement("span"); text.textContent = line.text;
      row.append(text);
      stats.append(row);
    });
    model.formattedConditions.forEach((line) => {
      const row = document.createElement("div");
      row.className = "kv-row scroll-condition";
      const text = document.createElement("span"); text.textContent = line;
      row.append(text);
      stats.append(row);
    });
  }
  if (meta) {
    meta.replaceChildren();
    const rows = [["Compatible slots", model.allowedSlots.join(", ")]];
    if (model.requiredLevel != null) rows.push(["Required level", String(model.requiredLevel)]);
    rows.push(["Tradeable", model.tradeable ? "Yes" : "No"]);
    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "kv-row";
      const name = document.createElement("span"); name.textContent = label;
      const amount = document.createElement("strong"); amount.textContent = value;
      row.append(name, amount);
      meta.append(row);
    });
  }
}

// Karta svitku pro samostatné zobrazení (dev katalog — náhled "co uvidí hráč").
function buildAffixScrollCard(model) {
  const card = document.createElement("article");
  card.className = "scroll-card scroll-surface";
  card.dataset.visual = "affix_scroll";
  const icon = document.createElement("div"); icon.className = "scroll-card-icon";
  renderAffixScrollIcon(icon, model.affixType, model.scrollColor);
  const body = document.createElement("div"); body.className = "scroll-card-body";
  const type = document.createElement("p"); type.className = "scroll-card-type"; type.textContent = `${AFFIX_SCROLL_TYPE_LABEL} · ${AFFIX_SCROLL_SUBTYPE_LABEL[model.affixType]}`;
  const name = document.createElement("h3"); name.className = "scroll-title"; name.textContent = model.displayName;
  const list = document.createElement("ul"); list.className = "scroll-card-mods";
  model.formattedModifiers.forEach((line) => { const li = document.createElement("li"); li.textContent = line.text; if (line.negative) li.className = "negative"; list.append(li); });
  const conditions = document.createElement("ul"); conditions.className = "scroll-card-conditions";
  model.formattedConditions.forEach((line) => { const li = document.createElement("li"); li.textContent = line; conditions.append(li); });
  const meta = document.createElement("p"); meta.className = "scroll-card-meta";
  meta.textContent = `Slots: ${model.allowedSlots.join(", ")}${model.requiredLevel != null ? ` · Required level ${model.requiredLevel}` : ""} · ${model.tradeable ? "Tradeable" : "Not tradeable"}`;
  body.append(type, name, list, conditions, meta);
  card.append(icon, body);
  return card;
}
