"use strict";

// Prototype 0.5.1 — centrální systém kvalit předmětů a materiálů.
// Načítá se PŘED item-data.js (hra i oba katalogy). Pravidla vzhledu: docs/item-visual-rarity-rules.md.
//
// Zásady:
//  • Item/materiál nese jen sémantickou hodnotu `quality: "legendary"`. Barvy a CSS třídy
//    se NIKDY nezapisují do dat — vše odvozuje applyQualityVisuals() z této konfigurace.
//  • `quality` je jediný kanonický název (dřívější `rarity` se při načtení savu migruje).
//  • Kvalita zatím nemění staty, ceny ani drop rate (to je mimo rozsah, viz dokument).

const ITEM_QUALITIES = Object.freeze({
  common:    Object.freeze({ id: "common",    label: "COMMON",    rank: 0, css: "common",    glow: "none",      allowedForStackables: true }),
  rare:      Object.freeze({ id: "rare",      label: "RARE",      rank: 1, css: "rare",      glow: "none",      allowedForStackables: true }),
  epic:      Object.freeze({ id: "epic",      label: "EPIC",      rank: 2, css: "epic",      glow: "none",      allowedForStackables: true }),
  legendary: Object.freeze({ id: "legendary", label: "LEGENDARY", rank: 3, css: "legendary", glow: "legendary", allowedForStackables: true }),
  mythic:    Object.freeze({ id: "mythic",    label: "MYTHIC",    rank: 4, css: "mythic",    glow: "mythic",    allowedForStackables: true }),
  god:       Object.freeze({ id: "god",       label: "GOD",       rank: 5, css: "god",       glow: "god",       allowedForStackables: false }),
});

const DEFAULT_QUALITY = "common";
// Od nejnižší po nejvyšší a od nejvyšší po nejnižší (třídění, sbírka, souhrny prodeje).
const QUALITY_IDS = Object.freeze(Object.values(ITEM_QUALITIES).sort((a, b) => a.rank - b.rank).map((q) => q.id));
const QUALITY_ORDER = Object.freeze([...QUALITY_IDS].reverse());

// Vývojový režim: localhost, file:// nebo ?dev. Jen tam se vypisují varování; produkce se potichu vrací na `common`.
const QUALITY_DEV = (() => {
  try {
    const host = globalThis.location?.hostname ?? "";
    return host === "" || host === "localhost" || host === "127.0.0.1" || /[?&]dev\b/.test(globalThis.location?.search ?? "");
  } catch { return false; }
})();
const qualityWarnings = [];
function qualityWarn(message) {
  qualityWarnings.push(message);
  if (QUALITY_DEV) console.warn(`[quality] ${message}`);
}

function isKnownQuality(quality) { return typeof quality === "string" && Object.prototype.hasOwnProperty.call(ITEM_QUALITIES, quality); }
function qualityRank(quality) { return ITEM_QUALITIES[quality]?.rank ?? 0; }
function qualityLabel(quality) { return (ITEM_QUALITIES[quality] ?? ITEM_QUALITIES[DEFAULT_QUALITY]).label; }

// Bezpečný výběr kvality. Neznámá hodnota, chybějící hodnota nebo kvalita nepovolená
// pro stackovatelné předměty (God) spadne na `common` — aplikace se nikdy nerozbije.
function normalizeQuality(quality, { stackable = false, where = "" } = {}) {
  const at = where ? ` (${where})` : "";
  if (quality == null) return DEFAULT_QUALITY; // starý save bez kvality — beze varování
  if (!isKnownQuality(quality)) { qualityWarn(`Neznámá quality "${quality}"${at} → ${DEFAULT_QUALITY}.`); return DEFAULT_QUALITY; }
  if (stackable && !ITEM_QUALITIES[quality].allowedForStackables) {
    qualityWarn(`Quality "${quality}" není povolená pro stackovatelné předměty${at} → ${DEFAULT_QUALITY}.`);
    return DEFAULT_QUALITY;
  }
  return quality;
}

// Klíč stacku: templateId + quality. Common a Epic varianta stejného materiálu se nikdy neslučují.
function stackKey(templateId, quality) { return `${templateId}:${quality}`; }
function parseStackKey(key) {
  const index = String(key).lastIndexOf(":");
  if (index <= 0) return { templateId: String(key), quality: null };
  return { templateId: key.slice(0, index), quality: key.slice(index + 1) };
}

// Odvodí CSS třídy ze sémantických dat. Priorita vrstev (viz dokument):
// 1) typ itemu (křídla = zlato), 2) kvalita, 3) zvláštní glow, 4) MAX upgrade.
function qualityClasses({ quality, stackable = false, slot = null, wingGlow = null, isMaxUpgraded = false } = {}) {
  const q = ITEM_QUALITIES[normalizeQuality(quality, { stackable })];
  const classes = [`q-${q.css}`];
  if (stackable) classes.push("q-stack");
  if (slot === "wings") {
    classes.push("q-wings");
    if (wingGlow === "gold") classes.push("q-wings-glow"); // jen explicitně označená nejvzácnější křídla
  } else if (q.glow !== "none") {
    classes.push(`q-glow-${q.glow}`);
  }
  if (isMaxUpgraded) classes.push("q-max");
  return classes;
}

// Čitelný text kvality do detailů a tooltipů (barva nikdy není jediný údaj).
function qualityText(source) { return qualityLabel(source?.quality); }

function isMaxUpgraded(source) {
  if (source?.isMaxUpgraded === true) return true;
  return Number(source?.maxUpgradeLevel) > 0 && Number(source?.upgradeLevel) >= Number(source.maxUpgradeLevel);
}

const QUALITY_COMPACT_SELECTOR = ".recent-drop-icon, .loot-chip-icon, .map-loot-icon, .collection-icon, .merchant-icon";

// Nastaví kvalitu na prvku, který představuje slot/ikonu. `source` = item (instance + šablona)
// nebo { quality, stackable }. `surface:true` přidá třídu .q-slot (plné pozadí, rám, glow).
function applyQualityVisuals(element, source, { surface = true } = {}) {
  if (!element) return element;
  element.className = element.className.replace(/(^|\s)q-[\w-]+/g, " ").replace(/\s+/g, " ").trim();
  const max = isMaxUpgraded(source);
  const classes = qualityClasses({
    quality: source?.quality, stackable: source?.stackable === true, slot: source?.slot ?? null,
    wingGlow: source?.wingGlow ?? null, isMaxUpgraded: max,
  });
  if (surface) classes.push("q-slot");
  element.classList.add(...classes);
  // Drobné ikony ve výpisech zůstávají ploché (rámeček s popiskem by tam nebyl čitelný).
  if (surface && element.matches?.(QUALITY_COMPACT_SELECTOR)) element.classList.add("q-compact");
  element.dataset.quality = normalizeQuality(source?.quality, { stackable: source?.stackable === true });
  element.querySelectorAll(":scope > .q-upg, :scope > .q-max-corners").forEach((node) => node.remove());
  const level = Math.floor(Number(source?.upgradeLevel) || 0);
  if (surface && (level > 0 || max)) {
    const mark = document.createElement("span");
    mark.className = max ? "q-upg q-upg-max" : "q-upg";
    mark.textContent = max ? "MAX" : `+${level}`;
    element.append(mark);
    if (max) {
      const corners = document.createElement("span");
      corners.className = "q-max-corners";
      corners.setAttribute("aria-hidden", "true");
      element.append(corners);
    }
  }
  return element;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ITEM_QUALITIES, QUALITY_IDS, QUALITY_ORDER, DEFAULT_QUALITY, normalizeQuality, stackKey, parseStackKey, qualityClasses, qualityRank, qualityLabel, isKnownQuality, isMaxUpgraded };
}
