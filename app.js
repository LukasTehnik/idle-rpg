"use strict";

const CONFIG = Object.freeze({
  playerAttackMs: 1600,
  enemyAttackMs: 2200,
  enemyRespawnMs: 3000,
  playerRespawnMs: 5000,
  betweenFightHealPercent: 0.1,
  dropChance: 0.42, // fallback only -- each enemy in ENEMIES sets its own dropChance
  inventoryCapacity: 18,
  maxLogEntries: 80,
  maxRecentDrops: 5,
  maxToasts: 3,
  saveKey: "idle-rpg-prototype-v02",
});

// RARITIES, SLOT_META, ICONS, ITEM_TEMPLATES and renderItemIcon() live in
// item-data.js; MATERIALS in material-data.js; LOCATIONS, ENEMIES and
// DEFAULT_ENEMY_ID in world-data.js (all loaded before this file in index.html).

// Returns the data-config of whichever enemy is currently selected as the
// farming target (see world-data.js). Falls back to the default enemy if
// state.currentEnemyId is ever missing/invalid (e.g. a corrupted save).
function getCurrentEnemy() {
  return ENEMIES[state?.currentEnemyId] ?? ENEMIES[DEFAULT_ENEMY_ID];
}

const initialState = () => ({
  running: false,
  phase: "ready",
  level: 1,
  xp: 0,
  kills: 0,
  drops: 0,
  gold: 0,
  elapsedSeconds: 0,
  inventory: [], // equipment only (capacity CONFIG.inventoryCapacity)
  // Prototype 0.4: stackable materials/scrolls, stored by stable material id
  // -> quantity (e.g. { "wing-dust": 14 }). They do NOT count against the
  // equipment capacity.
  materials: {},
  // Last few drops (materials + equipment) for the compact combat-screen list.
  recentDrops: [],
  equipment: { weapon: null, armor: null, charm: null, helmet: null, gloves: null, boots: null, pants: null, wings: null },
  // Which location/enemy the player has selected on the map as their
  // current farming target. Defaults to the original Goblin encounter so
  // existing saves (and a fresh game) behave exactly as before.
  currentEnemyId: DEFAULT_ENEMY_ID,
  player: { hp: 100, baseMaxHp: 100, baseMinDamage: 9, baseMaxDamage: 13, baseCritChance: 0.1 },
  enemy: { hp: ENEMIES[DEFAULT_ENEMY_ID].maxHp, maxHp: ENEMIES[DEFAULT_ENEMY_ID].maxHp },
  lastPlayerAttackAt: 0,
  lastEnemyAttackAt: 0,
  phaseEndsAt: 0,
});

let state = loadState();
let gameLoopId = null;
let timerLoopId = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Datové zásuvky UI: [data-bind="name"] dostane textContent, [data-bar="name"]
// šířku v %. Stejná hodnota se tak může zobrazit na víc místech (horní lišta,
// sidebar, stránka Postava, Boj) bez duplicitních id.
const binds = {};
$$("[data-bind]").forEach((node) => (binds[node.dataset.bind] ??= []).push(node));
const bars = {};
$$("[data-bar]").forEach((node) => (bars[node.dataset.bar] ??= []).push(node));
const statusDots = $$("[data-bind-dot]");

function setText(name, value) {
  const text = String(value);
  for (const node of binds[name] ?? []) if (node.textContent !== text) node.textContent = text;
}
function setBar(name, percent) {
  const width = `${percent}%`;
  for (const node of bars[name] ?? []) if (node.style.width !== width) node.style.width = width;
}

const ELEMENT_IDS = [
  "sidebar", "sidebarBackdrop", "menuButton", "pageTitle", "main",
  "arena", "enemyPortrait", "goblinFigure", "enemyImage", "enemyLevel", "currentLocationName", "encounterMessage",
  "fightButton", "fightButtonText", "fightButtonIcon", "resetButton", "clearLogButton", "combatLog",
  "recentDropsList", "dropToastStack", "equipmentOverview",
  "inventoryGrid", "inventoryEmpty", "inventoryEmptyTitle", "inventoryEmptyText", "inventoryCount", "inventoryCapacity", "equippedCount",
  "invTabs", "invSearch", "invType", "invTypeField", "invRarity", "invSort", "paperDoll",
  "deleteModeButton", "bulkDeleteBar", "selectedCount", "confirmDeleteButton", "cancelDeleteButton",
  "itemDetail", "detailEmpty", "detailBody", "detailRarity", "detailIcon", "detailTitle", "detailType",
  "detailStats", "detailCompare", "detailFlavor", "detailMeta", "detailActionButton", "detailNote", "detailCloseButton", "detailBackdrop",
  "mapLocations", "mapLocationTitle", "mapEnemyGrid",
];
const elements = Object.fromEntries(ELEMENT_IDS.map((id) => [id, document.getElementById(id)]));
for (const [id, node] of Object.entries(elements)) if (!node) console.warn(`[ui] chybí element #${id}`);

// Náhled postavy — JEDINÉ místo, kde se vyměňuje character asset. Paper-doll,
// profil, sidebar i bojová scéna berou obrázek z CSS proměnné --character-art,
// kterou tady nastavujeme. Až bude hotový plnohodnotný model postavy, stačí
// změnit `src` (PNG/SVG/WebP) — nic dalšího se nemusí upravovat.
const CHARACTER_PREVIEW = Object.freeze({ src: "assets/icons/wanderer.svg", label: "Poutník" });

function applyCharacterPreview() {
  document.documentElement.style.setProperty("--character-art", `url("${CHARACTER_PREVIEW.src}")`);
  $$("[data-character-preview]").forEach((node) => {
    node.setAttribute("aria-label", node.classList.contains("doll-figure") ? `Náhled postavy: ${CHARACTER_PREVIEW.label}` : CHARACTER_PREVIEW.label);
  });
}

// Stav rozhraní. Záměrně NENÍ součástí `state`, takže se nikdy neukládá do savu
// (výběr itemu, filtry, aktuální stránka — vše se po reloadu vrací do výchozího stavu).
const ui = {
  page: "boj",
  selection: null, // { kind: "item", id } | { kind: "equipped", slot } | { kind: "material", id }
  tab: "all", // all | equipment | materials | scrolls
  search: "", type: "all", rarity: "all", sort: "newest",
  mapLocationId: null,
};
// Pod 1440 px se detail itemu otevírá jako výsuvný panel (na mobilu přes celou obrazovku).
const mqSheet = window.matchMedia("(max-width: 1439px)");
const mqDrawer = window.matchMedia("(max-width: 899px)");
const RARITY_ORDER = ["epic", "rare", "uncommon", "common"];
const SLOT_ORDER = Object.keys(SLOT_META);
const STAT_KEYS = ["damageMin", "damageMax", "maxHp", "critChance"];
const STAT_LABELS = Object.freeze({
  damageMin: "Minimální poškození", damageMax: "Maximální poškození", maxHp: "Maximální životy", critChance: "Kritický zásah",
});
function roundStat(value) { return Math.round(value * 10) / 10; }
function formatStat(key, value) { return key === "critChance" ? `${Math.round(value * 10) / 10} %` : String(value); }

// Bulk-delete UI state. Transient/UI-only -- deliberately NOT part of
// `state` (so it never gets persisted or saved), reset whenever delete mode
// is turned off.
let deleteMode = false;
let selectedForDeletion = new Set();

function pluralizePredmet(count) {
  if (count === 1) return "předmět";
  if (count >= 2 && count <= 4) return "předměty";
  return "předmětů";
}

function updateSelectedCount() {
  elements.selectedCount.textContent = selectedForDeletion.size;
  elements.confirmDeleteButton.disabled = selectedForDeletion.size === 0;
}

function setDeleteMode(nextValue) {
  deleteMode = nextValue;
  selectedForDeletion.clear();
  elements.bulkDeleteBar.classList.toggle("hidden", !deleteMode);
  elements.deleteModeButton.classList.toggle("active", deleteMode);
  elements.deleteModeButton.setAttribute("aria-pressed", String(deleteMode));
  updateSelectedCount();
  renderInventory();
}

function toggleSelection(itemId) {
  if (selectedForDeletion.has(itemId)) selectedForDeletion.delete(itemId);
  else selectedForDeletion.add(itemId);
  updateSelectedCount();
  renderInventory();
}

function deleteSelectedItems() {
  if (selectedForDeletion.size === 0) return;
  const removedCount = selectedForDeletion.size;
  state.inventory = state.inventory.filter((item) => !selectedForDeletion.has(item.id));
  addLog(`Smazáno ${removedCount} ${pluralizePredmet(removedCount)} z inventáře.`, "system");
  setDeleteMode(false);
  render(); renderLoot(); saveState();
}

// Keeps only sane { id: positiveInteger } pairs. Unknown ids are preserved
// (a future/removed material must never wipe a player's stash).
function sanitizeMaterials(raw) {
  const result = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const [id, qty] of Object.entries(raw)) {
    const n = Math.floor(Number(qty));
    if (Number.isFinite(n) && n > 0) result[id] = n;
  }
  return result;
}

function sanitizeRecentDrops(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry.key === "string" && (entry.type === "material" || entry.type === "item"))
    .map((entry) => ({
      type: entry.type, key: entry.key, name: String(entry.name ?? entry.key),
      rarity: RARITIES[entry.rarity] ? entry.rarity : "common",
      qty: Math.max(1, Math.floor(Number(entry.qty) || 1)), at: Number(entry.at) || Date.now(),
    }))
    .slice(0, CONFIG.maxRecentDrops);
}

// Prototype 0.3 had a generic stacking mechanism (`quantity` on non-equippable
// inventory entries) but no real material. If such an entry matches a known
// material id (by `materialId` or `icon`) it is merged into `materials`;
// anything unrecognised is left untouched in the inventory.
function migrateLegacyInventory(inventory, materials) {
  const kept = [];
  const merged = { ...materials };
  for (const item of inventory) {
    const key = item && !SLOT_META[item.slot] ? (item.materialId ?? item.icon) : null;
    const id = key && (MATERIALS[key] ? key : LEGACY_MATERIAL_ALIASES[key]);
    if (id && MATERIALS[id]) merged[id] = (merged[id] ?? 0) + Math.max(1, Math.floor(Number(item.quantity) || 1));
    else kept.push(item);
  }
  return { inventory: kept, materials: merged };
}

function loadState() {
  const fresh = initialState();
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG.saveKey));
    if (!saved || saved.version !== 2) return fresh;
    // currentEnemyId is new -- only trust it if it names a real, still-valid
    // enemy (protects against a corrupted save or a future removed enemy id
    // crashing the app on load).
    const currentEnemyId = typeof saved.currentEnemyId === "string" && ENEMIES[saved.currentEnemyId]
      ? saved.currentEnemyId : fresh.currentEnemyId;
    // Prototype 0.3 saves have no `materials` / `recentDrops` -- both default
    // to empty. Any legacy generic material stacks that sit in the inventory
    // are moved into `materials` when their id is known (see migrate...).
    const { inventory, materials } = migrateLegacyInventory(
      Array.isArray(saved.inventory) ? saved.inventory : [],
      sanitizeMaterials(saved.materials),
    );
    return {
      ...fresh,
      level: saved.level ?? fresh.level, xp: saved.xp ?? fresh.xp,
      kills: saved.kills ?? fresh.kills, drops: saved.drops ?? fresh.drops,
      gold: saved.gold ?? fresh.gold,
      elapsedSeconds: saved.elapsedSeconds ?? fresh.elapsedSeconds,
      inventory, materials,
      recentDrops: sanitizeRecentDrops(saved.recentDrops),
      equipment: { ...fresh.equipment, ...(saved.equipment ?? {}) },
      player: { ...fresh.player, ...(saved.player ?? {}) },
      currentEnemyId,
      enemy: { hp: ENEMIES[currentEnemyId].maxHp, maxHp: ENEMIES[currentEnemyId].maxHp },
    };
  } catch { return fresh; }
}

function saveState() {
  const payload = {
    version: 2, level: state.level, xp: state.xp, kills: state.kills, drops: state.drops,
    gold: state.gold, currentEnemyId: state.currentEnemyId,
    elapsedSeconds: state.elapsedSeconds, inventory: state.inventory, equipment: state.equipment,
    materials: state.materials, recentDrops: state.recentDrops,
    player: {
      hp: state.player.hp, baseMaxHp: state.player.baseMaxHp,
      baseMinDamage: state.player.baseMinDamage, baseMaxDamage: state.player.baseMaxDamage,
      baseCritChance: state.player.baseCritChance,
    },
  };
  localStorage.setItem(CONFIG.saveKey, JSON.stringify(payload));
}

function xpNeeded(level = state.level) { return Math.round(50 * Math.pow(level, 1.35)); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomDecimal(min, max) { return Math.round((min + Math.random() * (max - min)) * 10) / 10; }
function clampPercent(value, max) { return Math.max(0, Math.min(100, (value / max) * 100)); }
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}
function getItemBonus(item, stat) { return item?.stats?.[stat] ?? 0; }

function getPlayerStats() {
  return Object.values(state.equipment).filter(Boolean).reduce(
    (stats, item) => ({
      maxHp: stats.maxHp + getItemBonus(item, "maxHp"),
      minDamage: stats.minDamage + getItemBonus(item, "damageMin"),
      maxDamage: stats.maxDamage + getItemBonus(item, "damageMax"),
      critChance: stats.critChance + getItemBonus(item, "critChance") / 100,
    }),
    { maxHp: state.player.baseMaxHp, minDamage: state.player.baseMinDamage, maxDamage: state.player.baseMaxDamage, critChance: state.player.baseCritChance },
  );
}

function render() {
  const stats = getPlayerStats();
  const goal = xpNeeded();
  state.player.hp = Math.min(state.player.hp, stats.maxHp);
  setText("level", state.level);
  setText("xp", state.xp);
  setText("xpGoal", goal);
  setBar("xp", clampPercent(state.xp, goal));
  setText("kills", state.kills);
  setText("drops", state.drops);
  setText("gold", state.gold);
  setText("runTime", formatTime(state.elapsedSeconds));
  setText("playerHp", Math.ceil(state.player.hp));
  setText("playerMaxHp", roundStat(stats.maxHp));
  setBar("playerHp", clampPercent(state.player.hp, stats.maxHp));
  setText("damage", `${roundStat(stats.minDamage)}–${roundStat(stats.maxDamage)}`);
  setText("crit", `${Math.round(stats.critChance * 1000) / 10} %`);
  setText("enemyHp", Math.max(0, Math.ceil(state.enemy.hp)));
  setText("enemyMaxHp", state.enemy.maxHp);
  setBar("enemyHp", clampPercent(state.enemy.hp, state.enemy.maxHp));
  elements.enemyPortrait.classList.toggle("defeated", state.phase === "searching");
  elements.fightButton.classList.toggle("running", state.running);
  elements.fightButtonIcon.textContent = state.running ? "Ⅱ" : "▶";
  elements.fightButtonText.textContent = state.running ? "Pozastavit boj" : "Pokračovat v boji";
  if (state.phase === "ready") { elements.fightButtonText.textContent = "Zahájit boj"; setStatus("Připraveno", "idle"); }
  else if (!state.running) setStatus("Pozastaveno", "idle");
  else if (state.phase === "fighting") setStatus("Probíhá boj", "active");
  else if (state.phase === "searching") setStatus("Hledá se nepřítel", "active");
  else if (state.phase === "dead") setStatus("Postava padla", "danger");
}

function setStatus(label, mode) {
  setText("status", label);
  statusDots.forEach((dot) => {
    dot.classList.toggle("active", mode === "active");
    dot.classList.toggle("danger", mode === "danger");
  });
}

function addLog(message, type = "system") {
  if (elements.combatLog.children.length === 1 && elements.combatLog.firstElementChild?.querySelector("time")?.textContent === "—") elements.combatLog.innerHTML = "";
  const entry = document.createElement("li");
  entry.className = `log-entry ${type}`;
  const timeElement = document.createElement("time");
  timeElement.dateTime = new Date().toISOString();
  timeElement.textContent = new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const messageElement = document.createElement("span");
  messageElement.textContent = message;
  entry.append(timeElement, messageElement);
  elements.combatLog.append(entry);
  while (elements.combatLog.children.length > CONFIG.maxLogEntries) elements.combatLog.firstElementChild.remove();
  elements.combatLog.scrollTop = elements.combatLog.scrollHeight;
}

function animateHit(target) {
  const className = target === "enemy" ? "enemy-hit" : "player-hit";
  elements.arena.classList.remove(className);
  void elements.arena.offsetWidth;
  elements.arena.classList.add(className);
  window.setTimeout(() => elements.arena.classList.remove(className), 260);
}

// Refreshes every bit of UI that names/shows the currently selected enemy:
// the arena heading, its portrait (raster image for the new location
// enemies, or the original hand-drawn figure for Goblin), the location
// eyebrow above the arena, the status bar target and the combat-log legend.
// Called once at startup and again whenever the target changes via the map.
function updateArenaHeader() {
  const enemyCfg = getCurrentEnemy();
  const location = LOCATIONS[enemyCfg.locationId];
  setText("enemyName", enemyCfg.name);
  elements.enemyLevel.textContent = `Úroveň ${enemyCfg.level}${enemyCfg.type ? ` · ${ENEMY_TYPE_LABELS[enemyCfg.type] ?? ""}` : ""}`;
  elements.currentLocationName.textContent = (location?.name ?? "").toUpperCase();
  elements.enemyPortrait.setAttribute("aria-label", enemyCfg.name);
  if (enemyCfg.image) {
    elements.enemyImage.src = enemyCfg.image;
    elements.enemyImage.alt = enemyCfg.name;
    elements.enemyImage.classList.remove("hidden");
    elements.goblinFigure.classList.add("hidden");
  } else {
    elements.enemyImage.classList.add("hidden");
    elements.enemyImage.removeAttribute("src");
    elements.goblinFigure.classList.remove("hidden");
  }
}

function beginFight(now = performance.now()) {
  const enemyCfg = getCurrentEnemy();
  state.phase = "fighting";
  state.enemy.maxHp = enemyCfg.maxHp;
  state.enemy.hp = enemyCfg.maxHp;
  state.lastPlayerAttackAt = now;
  state.lastEnemyAttackAt = now;
  elements.encounterMessage.textContent = "Souboj začal";
  addLog(`Objevil se nepřítel: ${enemyCfg.name}. Souboj začíná.`, "system");
  render();
}

function playerAttack() {
  const enemyCfg = getCurrentEnemy();
  const stats = getPlayerStats();
  const critical = Math.random() < stats.critChance;
  let damage = randomInt(stats.minDamage, stats.maxDamage);
  if (critical) damage *= 2;
  damage = Math.max(1, damage - (enemyCfg.defense ?? 0));
  state.enemy.hp = Math.max(0, state.enemy.hp - damage);
  addLog(critical ? `Kritický zásah! Poutník zasáhl nepřítele (${enemyCfg.name}) za ${damage}.` : `Poutník zasáhl nepřítele (${enemyCfg.name}) za ${damage}.`, critical ? "critical" : "player");
  animateHit("enemy");
  if (state.enemy.hp <= 0) defeatEnemy();
}

function enemyAttack() {
  const enemyCfg = getCurrentEnemy();
  const damage = randomInt(enemyCfg.minDamage, enemyCfg.maxDamage);
  state.player.hp = Math.max(0, state.player.hp - damage);
  addLog(`${enemyCfg.name} zasáhl Poutníka za ${damage}.`, "enemy");
  animateHit("player");
  if (state.player.hp <= 0) defeatPlayer();
}

function defeatEnemy() {
  // Guard against double-awarding: rewards are granted only for the fight
  // that is actually in progress.
  if (state.phase !== "fighting") return;
  const enemyCfg = getCurrentEnemy();
  state.kills += 1;
  state.xp += enemyCfg.xp;
  state.gold += enemyCfg.gold ?? 0;
  state.phase = "searching";
  state.phaseEndsAt = performance.now() + CONFIG.enemyRespawnMs;
  elements.encounterMessage.textContent = `Hledám dalšího nepřítele (${enemyCfg.name})… 3 s`;
  addLog(`${enemyCfg.name} padl. Získáváš ${enemyCfg.xp} XP a ${enemyCfg.gold ?? 0} gold.`, "victory");
  applyLevelUps();
  const stats = getPlayerStats();
  const healing = Math.max(1, Math.round(stats.maxHp * CONFIG.betweenFightHealPercent));
  const before = state.player.hp;
  state.player.hp = Math.min(stats.maxHp, state.player.hp + healing);
  if (state.player.hp > before) addLog(`Krátký oddech obnovil ${state.player.hp - before} životů.`, "system");
  if (Math.random() < (enemyCfg.dropChance ?? CONFIG.dropChance)) generateDrop(enemyCfg);
  rollMaterialDrops(enemyCfg);
  saveState();
}

function applyLevelUps() {
  while (state.xp >= xpNeeded()) {
    state.xp -= xpNeeded();
    state.level += 1;
    state.player.baseMaxHp += 15;
    state.player.baseMinDamage += 2;
    state.player.baseMaxDamage += 2;
    state.player.hp = getPlayerStats().maxHp;
    addLog(`Dosáhl jsi úrovně ${state.level}. Životy i poškození rostou.`, "level-up");
  }
}

function defeatPlayer() {
  state.phase = "dead";
  state.phaseEndsAt = performance.now() + CONFIG.playerRespawnMs;
  elements.encounterMessage.textContent = "Návrat k výpravě za 5 s";
  addLog("Poutník padl. Za 5 sekund se vrátí do boje.", "enemy");
  saveState();
}

function chooseRarity() {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const [key, rarity] of Object.entries(RARITIES)) {
    cumulative += rarity.weight;
    if (roll < cumulative) return key;
  }
  return "common";
}

// Resolves an enemy's dropPool (icon keys, see world-data.js) into actual
// ITEM_TEMPLATES entries. Falls back to the full template list if a pool is
// missing/empty so a misconfigured enemy still can't hard-crash a drop.
function resolveDropPool(enemyCfg) {
  const pool = (enemyCfg?.dropPool ?? [])
    .map((icon) => ITEM_TEMPLATES.find((template) => template.icon === icon))
    .filter(Boolean);
  return pool.length ? pool : ITEM_TEMPLATES;
}

function createItem(enemyCfg) {
  const pool = resolveDropPool(enemyCfg);
  const template = pool[randomInt(0, pool.length - 1)];
  const rarityKey = chooseRarity();
  const rarity = RARITIES[rarityKey];
  const stats = {};
  for (const [stat, range] of Object.entries(template.rolls ?? {})) {
    const raw = stat === "critChance" ? randomDecimal(range[0], range[1]) : randomInt(range[0], range[1]);
    stats[stat] = stat === "critChance" ? Math.round(raw * rarity.multiplier * 10) / 10 : Math.max(stat === "damageMin" ? 0 : 1, Math.round(raw * rarity.multiplier));
  }
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: template.name, slot: template.slot ?? null, icon: template.icon, rarity: rarityKey, stats,
    // Carry over the template's own artwork/glow (if any) — without this,
    // signature items with unique art (item.image/item.glowColor) render as
    // a blank icon once dropped, even though they look correct wherever the
    // template itself is read directly (e.g. the item catalog page).
    image: template.image, glowColor: template.glowColor,
    // Metadata for the item detail view: where it came from and when, and
    // whether it could ever be traded (signature "andělská" gear is unique
    // and marked untradeable via the template; everything else defaults to
    // tradeable since there's no market yet to actually restrict).
    source: enemyCfg?.name ?? "Neznámo",
    acquiredAt: Date.now(),
    tradeable: template.tradeable ?? true,
    flavorText: template.flavorText ?? null,
  };
}

// Oprava 1: drops no longer open a blocking confirmation modal. The item (or
// material) is saved immediately, combat keeps running uninterrupted, and the
// only feedback is the combat log, the recent-drops list and a small
// non-blocking toast (see showDropToast) -- nothing here requires a click.
//
// Equipment: every drop is its own inventory entry (capacity-limited).
function generateDrop(enemyCfg = getCurrentEnemy()) {
  const item = createItem(enemyCfg);
  if (state.inventory.length >= CONFIG.inventoryCapacity) {
    addLog(`${enemyCfg.name} zanechal předmět, ale inventář je plný.`, "system");
    return;
  }
  state.inventory.unshift(item);
  state.drops += 1;
  const rarity = RARITIES[item.rarity];
  addLog(`${rarity.label} předmět: ${item.name}.`, item.rarity === "common" ? "system" : "level-up");
  pushRecentDrop({ type: "item", key: item.icon, name: item.name, rarity: item.rarity, qty: 1 });
  renderLoot();
  showDropToast(item);
}

// Materials: each `materialDrops` entry of the enemy is an independent roll
// (data lives in world-data.js). Stacks live in state.materials by stable id
// and never touch the equipment capacity.
function rollMaterialDrops(enemyCfg) {
  for (const drop of enemyCfg?.materialDrops ?? []) {
    const material = MATERIALS[drop.id];
    if (!material) continue;
    // Safety net: a material may only drop from an enemy that is listed as a
    // source of it (guards e.g. "Oko Matky" = Matka děr only).
    if (!material.sourceEnemyIds.includes(enemyCfg.id)) continue;
    if (Math.random() >= drop.chance) continue;
    addMaterial(drop.id, randomInt(drop.min ?? 1, drop.max ?? drop.min ?? 1));
  }
}

function addMaterial(materialId, quantity) {
  const material = MATERIALS[materialId];
  if (!material || !(quantity > 0)) return;
  state.materials[materialId] = (state.materials[materialId] ?? 0) + quantity;
  state.drops += 1;
  const total = state.materials[materialId];
  addLog(`Získáno: ${material.name} ×${quantity} (celkem ${total}).`, material.rarity === "common" ? "system" : "level-up");
  pushRecentDrop({ type: "material", key: materialId, name: material.name, rarity: material.rarity, qty: quantity });
  renderLoot();
  showMaterialToast(material, quantity, total);
}

function pushRecentDrop(entry) {
  state.recentDrops.unshift({ ...entry, at: Date.now() });
  state.recentDrops.length = Math.min(state.recentDrops.length, CONFIG.maxRecentDrops);
}

// Compact "last drops" list on the combat page. Purely informative:
// no modal, no interaction, never blocks combat.
function renderRecentDrops() {
  const list = elements.recentDropsList;
  list.innerHTML = "";
  if (!state.recentDrops.length) {
    const empty = document.createElement("li");
    empty.className = "recent-drop-empty";
    empty.textContent = "Zatím nic — porážej nepřátele.";
    list.append(empty);
    return;
  }
  state.recentDrops.forEach((drop) => {
    const row = document.createElement("li");
    row.className = `recent-drop rarity-${drop.rarity}`;
    row.innerHTML = `<span class="recent-drop-icon" aria-hidden="true"></span><span class="recent-drop-name"></span><span class="recent-drop-qty"></span><time class="recent-drop-time"></time>`;
    const iconSource = drop.type === "material"
      ? { image: MATERIALS[drop.key]?.asset }
      : (ITEM_TEMPLATES.find((template) => template.icon === drop.key) ?? { icon: drop.key });
    renderItemIcon(row.querySelector(".recent-drop-icon"), iconSource);
    row.querySelector(".recent-drop-name").textContent = drop.name;
    row.querySelector(".recent-drop-qty").textContent = `×${drop.qty}`;
    const time = row.querySelector("time");
    time.dateTime = new Date(drop.at).toISOString();
    time.textContent = new Date(drop.at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    list.append(row);
  });
}

function statRows(item) {
  const rows = [];
  if (item.stats?.damageMin) rows.push(["Minimální poškození", `+${item.stats.damageMin}`]);
  if (item.stats?.damageMax) rows.push(["Maximální poškození", `+${item.stats.damageMax}`]);
  if (item.stats?.maxHp) rows.push(["Maximální životy", `+${item.stats.maxHp}`]);
  if (item.stats?.critChance) rows.push(["Kritický zásah", `+${item.stats.critChance} %`]);
  return rows;
}

function statSummary(item) { return statRows(item).map(([label, value]) => `${label}: ${value}`).join(" · "); }

// Non-blocking drop notification (Oprava 1). Stacks visually in the corner,
// requires no click, auto-dismisses, and never overlaps the fight controls
// or log panel (see .drop-toast-stack / .drop-toast in styles.css).
function showDropToast(item) {
  const rarity = RARITIES[item.rarity];
  const toast = document.createElement("div");
  toast.className = `drop-toast rarity-${item.rarity}`;
  toast.style.setProperty("--drop-color", rarity.color);
  toast.innerHTML = `<span class="drop-toast-icon" aria-hidden="true"></span><div class="drop-toast-copy"><strong></strong><span></span></div>`;
  renderItemIcon(toast.querySelector(".drop-toast-icon"), item);
  const nameEl = toast.querySelector("strong");
  nameEl.textContent = item.name;
  nameEl.className = `rarity-text rarity-${item.rarity}`;
  toast.querySelector(".drop-toast-copy span").textContent = `${rarity.label} · ${SLOT_META[item.slot]?.label ?? ""}`;
  presentToast(toast);
}

// Toast for a material/scroll drop: "Získáno: Prach z křídel ×2".
function showMaterialToast(material, quantity, total) {
  const rarity = RARITIES[material.rarity];
  const toast = document.createElement("div");
  toast.className = `drop-toast rarity-${material.rarity}`;
  toast.style.setProperty("--drop-color", rarity.color);
  toast.innerHTML = `<span class="drop-toast-icon" aria-hidden="true"></span><div class="drop-toast-copy"><strong></strong><span></span></div>`;
  renderItemIcon(toast.querySelector(".drop-toast-icon"), { image: material.asset });
  const nameEl = toast.querySelector("strong");
  nameEl.textContent = `Získáno: ${material.name} ×${quantity}`;
  nameEl.className = `rarity-text rarity-${material.rarity}`;
  toast.querySelector(".drop-toast-copy span").textContent = `${MATERIAL_CATEGORY_LABELS[material.category] ?? "Materiál"} · celkem ${total}×`;
  presentToast(toast);
}

// Shows a toast that dismisses itself. The stack is capped (oldest removed
// first), so a fast farming streak can never fill the screen; nothing here
// waits for input or pauses combat.
function presentToast(toast) {
  elements.dropToastStack.append(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
  while (elements.dropToastStack.children.length > CONFIG.maxToasts) elements.dropToastStack.firstElementChild.remove();
}

function equipItem(itemId) {
  const index = state.inventory.findIndex((item) => item.id === itemId);
  if (index < 0) return;
  const item = state.inventory[index];
  if (!SLOT_META[item.slot]) return;
  const previousMaxHp = getPlayerStats().maxHp;
  const replaced = state.equipment[item.slot];
  state.inventory.splice(index, 1);
  if (replaced) state.inventory.unshift(replaced);
  state.equipment[item.slot] = item;
  const newMaxHp = getPlayerStats().maxHp;
  state.player.hp = Math.min(newMaxHp, state.player.hp + Math.max(0, newMaxHp - previousMaxHp));
  addLog(`${item.name} byl vybaven.`, item.rarity === "common" ? "system" : "level-up");
  // Výběr sleduje předmět: z inventáře přechází na jeho slot, kde nabídne SUNDAT.
  ui.selection = { kind: "equipped", slot: item.slot };
  render(); renderLoot(); saveState();
}

function unequipItem(slot) {
  const item = state.equipment[slot];
  if (!item) return;
  if (state.inventory.length >= CONFIG.inventoryCapacity) {
    addLog(`Inventář je plný — ${item.name} nelze sundat.`, "system");
    renderInventoryView();
    return;
  }
  state.equipment[slot] = null;
  state.inventory.unshift(item);
  state.player.hp = Math.min(state.player.hp, getPlayerStats().maxHp);
  addLog(`${item.name} byl vrácen do inventáře.`, "system");
  ui.selection = { kind: "item", id: item.id };
  render(); renderLoot(); saveState();
}

// ---------------------------------------------------------------------
// Inventář, paper-doll a persistentní detail
// ---------------------------------------------------------------------

function getOwnedMaterialIds() {
  const known = MATERIAL_ORDER.filter((id) => state.materials[id] > 0);
  const unknown = Object.keys(state.materials).filter((id) => !MATERIALS[id] && state.materials[id] > 0);
  return [...known, ...unknown];
}

// Jednotný seznam pro grid: vybavení (state.inventory, omezená kapacita) a
// materiály/svitky (state.materials, stackují se, kapacitu nezabírají).
function getInventoryEntries() {
  const entries = state.inventory.map((item, index) => ({
    kind: "item", key: `item:${item.id}`, id: item.id, name: item.name, rarity: item.rarity, slot: item.slot,
    category: "equipment", qty: 1, order: index, iconSource: item,
  }));
  getOwnedMaterialIds().filter((id) => MATERIALS[id]).forEach((id, index) => {
    const material = MATERIALS[id];
    entries.push({
      kind: "material", key: `mat:${id}`, id, name: material.name, rarity: material.rarity, slot: null,
      category: material.category === "scroll" ? "scrolls" : "materials",
      qty: state.materials[id], order: 1000 + index, iconSource: { image: material.asset },
    });
  });
  return entries;
}

function entryAriaLabel(entry) {
  const rarity = RARITIES[entry.rarity]?.label ?? "";
  const slot = SLOT_META[entry.slot]?.label;
  const qty = entry.kind === "material" ? `, ${entry.qty} ks` : "";
  return `${entry.name}, ${rarity}${slot ? `, ${slot}` : ""}${qty}`;
}

function filterEntries(entries) {
  const query = ui.search.trim().toLowerCase();
  const slotFilterApplies = ui.tab === "all" || ui.tab === "equipment";
  return entries.filter((entry) => {
    if (ui.tab !== "all" && entry.category !== ui.tab) return false;
    if (ui.rarity !== "all" && entry.rarity !== ui.rarity) return false;
    if (slotFilterApplies && ui.type !== "all" && entry.slot !== ui.type) return false;
    if (query) {
      const haystack = `${entry.name} ${SLOT_META[entry.slot]?.label ?? ""} ${RARITIES[entry.rarity]?.label ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function sortEntries(entries) {
  const byName = (a, b) => a.name.localeCompare(b.name, "cs");
  const rank = (list, value) => { const i = list.indexOf(value); return i < 0 ? list.length : i; };
  const sorters = {
    newest: (a, b) => a.order - b.order,
    rarity: (a, b) => rank(RARITY_ORDER, a.rarity) - rank(RARITY_ORDER, b.rarity) || byName(a, b),
    name: byName,
    slot: (a, b) => rank(SLOT_ORDER, a.slot) - rank(SLOT_ORDER, b.slot) || byName(a, b),
  };
  return [...entries].sort(sorters[ui.sort] ?? sorters.newest);
}

function selectionKey() {
  const s = ui.selection;
  if (!s) return null;
  if (s.kind === "item") return `item:${s.id}`;
  if (s.kind === "material") return `mat:${s.id}`;
  return null;
}

// Převede uložený výběr na skutečná data; zastaralý výběr (item byl smazán,
// vybaven jinam…) se tiše zruší.
function resolveSelection() {
  const s = ui.selection;
  if (!s) return null;
  let resolved = null;
  if (s.kind === "item") {
    const item = state.inventory.find((entry) => entry.id === s.id);
    if (item) resolved = { kind: "item", item };
  } else if (s.kind === "equipped") {
    const item = state.equipment[s.slot];
    if (item) resolved = { kind: "equipped", slot: s.slot, item };
  } else if (s.kind === "material") {
    const material = MATERIALS[s.id];
    if (material && state.materials[s.id] > 0) resolved = { kind: "material", id: s.id, material };
  }
  if (!resolved) ui.selection = null;
  return resolved;
}

function renderInventory() {
  const grid = elements.inventoryGrid;
  const focusKey = grid.contains(document.activeElement) ? document.activeElement.dataset?.key : null;
  const entries = getInventoryEntries();
  const counts = {
    all: entries.length,
    equipment: entries.filter((e) => e.category === "equipment").length,
    materials: entries.filter((e) => e.category === "materials").length,
    scrolls: entries.filter((e) => e.category === "scrolls").length,
  };
  $$("[data-tab-count]").forEach((node) => { node.textContent = counts[node.dataset.tabCount] ?? 0; });
  elements.inventoryCapacity.textContent = CONFIG.inventoryCapacity;
  elements.inventoryCount.textContent = state.inventory.length;

  const visible = sortEntries(filterEntries(entries));
  const selectedKeyValue = selectionKey();
  grid.classList.toggle("delete-mode", deleteMode);
  grid.innerHTML = "";

  visible.forEach((entry) => {
    const rarity = RARITIES[entry.rarity] ?? RARITIES.common;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `inv-cell rarity-${entry.rarity}`;
    cell.dataset.key = entry.key;
    const marked = deleteMode && entry.kind === "item" && selectedForDeletion.has(entry.id);
    const selected = !deleteMode && entry.key === selectedKeyValue;
    cell.classList.toggle("selected", selected);
    cell.classList.toggle("marked", marked);
    cell.setAttribute("aria-pressed", String(deleteMode ? marked : selected));
    cell.setAttribute("aria-label", deleteMode ? `Vybrat ke smazání: ${entryAriaLabel(entry)}` : `${entryAriaLabel(entry)} — zobrazit detail`);
    cell.title = `${entry.name} · ${rarity.label}`;
    cell.innerHTML = `<span class="cell-check" aria-hidden="true"></span><span class="cell-icon" aria-hidden="true"></span>${entry.kind === "material" ? `<span class="cell-qty">×${entry.qty}</span>` : ""}<span class="cell-name"></span>`;
    renderItemIcon(cell.querySelector(".cell-icon"), entry.iconSource);
    cell.querySelector(".cell-name").textContent = entry.name;
    grid.append(cell);
  });

  // Prázdné buňky ukazují kapacitu vybavení (jen na záložce VYBAVENÍ bez filtrů).
  const unfiltered = !ui.search.trim() && ui.rarity === "all" && ui.type === "all";
  if (ui.tab === "equipment" && unfiltered) {
    for (let i = counts.equipment; i < CONFIG.inventoryCapacity; i += 1) {
      const empty = document.createElement("div");
      empty.className = "inv-cell empty";
      empty.setAttribute("aria-hidden", "true");
      empty.textContent = "Prázdné";
      grid.append(empty);
    }
  }

  const nothing = visible.length === 0;
  elements.inventoryEmpty.classList.toggle("hidden", !nothing);
  if (nothing) {
    const filtered = Boolean(ui.search.trim()) || ui.rarity !== "all" || (ui.type !== "all" && (ui.tab === "all" || ui.tab === "equipment"));
    const texts = {
      all: ["Inventář je prázdný", "Porážej nepřátele. Každý může zanechat vybavení nebo materiál."],
      equipment: ["Žádné vybavení", "Porážej nepřátele. Každý může zanechat vybavení s náhodnými vlastnostmi."],
      materials: ["Žádné materiály", "Materiály padají z nepřátel v Pustině ticha. Na mapě si u každého nepřítele otevři „Možná kořist“."],
      scrolls: ["Žádné svitky", "Svitky padají velmi vzácně z vybraných nepřátel — mrkni na „Možná kořist“ na mapě."],
    };
    const [title, text] = filtered ? ["Nic neodpovídá filtru", "Zkus upravit hledání nebo vyčistit filtry."] : texts[ui.tab];
    elements.inventoryEmptyTitle.textContent = title;
    elements.inventoryEmptyText.textContent = text;
  }

  if (focusKey) grid.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function renderPaperDoll() {
  const resolved = resolveSelection();
  const compatibleSlot = resolved?.kind === "item" ? resolved.item.slot : null;
  let equippedCount = 0;
  $$(".pd-slot", elements.paperDoll).forEach((button) => {
    const slot = button.dataset.slot;
    const meta = SLOT_META[slot];
    const item = state.equipment[slot];
    if (item) equippedCount += 1;
    const selected = resolved?.kind === "equipped" && resolved.slot === slot;
    const compatible = compatibleSlot === slot;
    button.className = `pd-slot${item ? ` filled rarity-${item.rarity}` : ""}`;
    button.classList.toggle("selected", selected);
    button.classList.toggle("compatible", compatible);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", item
      ? `${meta.label}: ${item.name}, ${RARITIES[item.rarity].label} — zobrazit detail`
      : `${meta.label}: prázdný slot${compatible ? " — sem lze vybavit vybraný předmět" : ""}`);
    button.title = item ? `${item.name} · ${RARITIES[item.rarity].label}` : `${meta.label} — prázdný slot`;
    button.innerHTML = `<span class="pd-type"></span><span class="pd-icon" aria-hidden="true"></span>${compatible ? `<span class="pd-badge">${item ? "Vyměnit" : "Vybavit"}</span>` : ""}`;
    button.querySelector(".pd-type").textContent = meta.label;
    const icon = button.querySelector(".pd-icon");
    if (item) renderItemIcon(icon, item);
    else icon.innerHTML = ICONS[meta.icon] ?? "";
  });
  elements.equippedCount.textContent = equippedCount;
}

function kvRow(label, value) {
  const row = document.createElement("div");
  row.className = "kv-row";
  const name = document.createElement("span"); name.textContent = label;
  const amount = document.createElement("strong"); amount.textContent = value;
  row.append(name, amount);
  return row;
}

function formatAcquiredAt(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Porovnání vybraného předmětu z inventáře s tím, co je nasazené ve stejném slotu.
function renderCompare(item) {
  const box = elements.detailCompare;
  box.innerHTML = "";
  const equipped = state.equipment[item.slot];
  if (!SLOT_META[item.slot]) { box.classList.add("hidden"); return; }
  const title = document.createElement("p");
  title.className = "detail-compare-title";
  if (!equipped) {
    title.textContent = `Slot ${SLOT_META[item.slot].label} je prázdný — předmět je čistý zisk.`;
    box.append(title);
    box.classList.remove("hidden");
    return;
  }
  title.innerHTML = "Oproti vybavenému: <strong></strong>";
  title.querySelector("strong").textContent = equipped.name;
  box.append(title);
  STAT_KEYS.forEach((key) => {
    const next = item.stats?.[key] ?? 0;
    const prev = equipped.stats?.[key] ?? 0;
    if (!next && !prev) return;
    const diff = Math.round((next - prev) * 10) / 10;
    const row = document.createElement("div");
    row.className = "cmp-row";
    const label = document.createElement("span"); label.textContent = STAT_LABELS[key];
    const value = document.createElement("span");
    value.className = diff > 0 ? "up" : diff < 0 ? "down" : "same";
    value.textContent = diff === 0 ? "beze změny" : `${diff > 0 ? "+" : "−"}${formatStat(key, Math.abs(diff))}`;
    row.append(label, value);
    box.append(row);
  });
  box.classList.remove("hidden");
}

function renderDetail() {
  const resolved = resolveSelection();
  const panel = elements.itemDetail;
  ["common", "uncommon", "rare", "epic"].forEach((key) => panel.classList.remove(`rarity-${key}`));
  elements.detailEmpty.classList.toggle("hidden", Boolean(resolved));
  elements.detailBody.classList.toggle("hidden", !resolved);
  if (!resolved) { closeSheet({ restoreFocus: false }); return; }

  const isMaterial = resolved.kind === "material";
  const source = isMaterial ? resolved.material : resolved.item;
  const rarity = RARITIES[source.rarity] ?? RARITIES.common;
  panel.classList.add(`rarity-${source.rarity}`);
  elements.detailIcon.classList.remove("material-art");
  elements.detailTitle.textContent = source.name;
  elements.detailTitle.className = `detail-title rarity-text rarity-${source.rarity}`;
  elements.detailStats.innerHTML = "";
  elements.detailMeta.innerHTML = "";
  elements.detailCompare.classList.add("hidden");
  const action = elements.detailActionButton;
  const note = elements.detailNote;
  note.classList.add("hidden");
  action.disabled = false;

  if (isMaterial) {
    const material = resolved.material;
    const categoryLabel = MATERIAL_CATEGORY_LABELS[material.category] ?? "Materiál";
    elements.detailRarity.textContent = `${rarity.label} ${categoryLabel.toLowerCase()}`;
    renderItemIcon(elements.detailIcon, { image: material.asset });
    elements.detailType.textContent = categoryLabel;
    elements.detailFlavor.textContent = material.description ?? "";
    elements.detailFlavor.classList.toggle("hidden", !material.description);
    const enemyNames = material.sourceEnemyIds.map((id) => ENEMIES[id]?.name ?? id).join(", ");
    [
      ["Vlastněno", `${state.materials[resolved.id] ?? 0}×`],
      ["Kategorie", categoryLabel],
      ["Lokace původu", LOCATIONS[material.sourceLocationId]?.name ?? "Neznámo"],
      ["Získatelné z", enemyNames],
      ["Obchodovatelné", material.tradeable ? "Ano" : "Ne"],
    ].forEach(([label, value]) => elements.detailMeta.append(kvRow(label, value)));
    action.classList.add("hidden");
    return;
  }

  const item = resolved.item;
  const template = findItemTemplate(item);
  const equippedNow = resolved.kind === "equipped";
  elements.detailRarity.textContent = `${rarity.label} předmět`;
  renderItemIcon(elements.detailIcon, item);
  elements.detailType.textContent = `${SLOT_META[item.slot]?.label ?? "Ostatní"}${equippedNow ? " · právě vybaveno" : ""}`;
  statRows(item).forEach(([label, value]) => elements.detailStats.append(kvRow(label, value)));
  if (!equippedNow) renderCompare(item);

  const flavorText = item.flavorText ?? template?.flavorText ?? null;
  elements.detailFlavor.textContent = flavorText ?? "";
  elements.detailFlavor.classList.toggle("hidden", !flavorText);

  const tradeable = item.tradeable ?? template?.tradeable ?? true;
  const acquiredAt = formatAcquiredAt(item.acquiredAt);
  const metaRows = [
    ["Slot", SLOT_META[item.slot]?.label ?? "—"],
    ["Zdroj", item.source ?? "Neznámo (starší nález)"],
    ["Obchodovatelné", tradeable ? "Ano" : "Ne · jedinečný nález"],
  ];
  if (item.quantity > 1) metaRows.push(["Počet kusů", `${item.quantity}×`]);
  if (acquiredAt) metaRows.push(["Získáno", acquiredAt]);
  metaRows.forEach(([label, value]) => elements.detailMeta.append(kvRow(label, value)));

  action.classList.remove("hidden");
  if (equippedNow) {
    action.textContent = "SUNDAT";
    if (state.inventory.length >= CONFIG.inventoryCapacity) {
      action.disabled = true;
      note.textContent = "Inventář je plný — uvolni místo, aby šel předmět sundat.";
      note.classList.remove("hidden");
    }
  } else if (SLOT_META[item.slot]) {
    action.textContent = state.equipment[item.slot] ? "VYMĚNIT" : "VYBAVIT";
  } else {
    action.classList.add("hidden");
  }
}

function renderEquipmentOverview() {
  const list = elements.equipmentOverview;
  list.innerHTML = "";
  ["helmet", "armor", "gloves", "pants", "boots", "weapon", "charm", "wings"].forEach((slot) => {
    const meta = SLOT_META[slot];
    const item = state.equipment[slot];
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ov-item${item ? ` filled rarity-${item.rarity}` : ""}`;
    button.dataset.slot = slot;
    button.setAttribute("aria-label", item ? `${meta.label}: ${item.name} — otevřít v inventáři` : `${meta.label}: prázdný slot`);
    button.innerHTML = `<span class="ov-icon" aria-hidden="true"></span><span class="ov-copy"><span class="ov-slot"></span><span class="ov-name"></span><span class="ov-rar"></span></span>`;
    button.querySelector(".ov-slot").textContent = meta.label;
    button.querySelector(".ov-name").textContent = item ? item.name : "Prázdný slot";
    button.querySelector(".ov-rar").textContent = item ? RARITIES[item.rarity].label : "—";
    const icon = button.querySelector(".ov-icon");
    if (item) renderItemIcon(icon, item);
    else icon.innerHTML = ICONS[meta.icon] ?? "";
    li.append(button);
    list.append(li);
  });
}

// Celý pohled inventáře najednou (grid + paper-doll + detail). Volá se po každé
// změně vybavení, výběru nebo filtru; boj tím není nijak dotčen.
function renderInventoryView() {
  renderInventory();
  renderPaperDoll();
  renderDetail();
}

function renderLoot() {
  renderInventoryView();
  renderEquipmentOverview();
  renderRecentDrops();
}

// --- Výběr ------------------------------------------------------------
let sheetReturnFocus = null;

function isSheetOpen() { return elements.itemDetail.classList.contains("sheet-open"); }

// Na mobilu se detail otevírá jako celoobrazovkový panel (bottom sheet).
function openSheet() {
  if (!mqSheet.matches || isSheetOpen()) return;
  sheetReturnFocus = document.activeElement;
  elements.itemDetail.classList.add("sheet-open");
  document.body.classList.add("detail-open", "no-scroll");
  elements.itemDetail.scrollTop = 0;
  elements.detailCloseButton.focus({ preventScroll: true });
}

function closeSheet({ restoreFocus = true } = {}) {
  if (!isSheetOpen()) return;
  elements.itemDetail.classList.remove("sheet-open");
  document.body.classList.remove("detail-open", "no-scroll");
  const target = sheetReturnFocus;
  sheetReturnFocus = null;
  if (restoreFocus && target?.isConnected) target.focus({ preventScroll: true });
}

function selectEntity(selection, { reveal = true } = {}) {
  ui.selection = selection;
  renderInventoryView();
  if (!reveal || !ui.selection) return;
  if (mqSheet.matches) openSheet();
}

function onInventoryCell(key) {
  const separator = key.indexOf(":");
  const kind = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (deleteMode) { if (kind === "item") toggleSelection(id); return; }
  selectEntity(kind === "item" ? { kind: "item", id } : { kind: "material", id });
}

function onDollSlot(slot) {
  if (state.equipment[slot]) { selectEntity({ kind: "equipped", slot }); return; }
  // Prázdný slot: nic se nevybavuje — jen se inventář přefiltruje na vhodné předměty
  // (druhý klik filtr zruší).
  ui.type = ui.type === slot ? "all" : slot;
  if (ui.tab === "materials" || ui.tab === "scrolls") ui.tab = "equipment";
  syncInventoryControls();
  renderInventory();
}

function runDetailAction() {
  const resolved = resolveSelection();
  if (!resolved) return;
  if (resolved.kind === "item") equipItem(resolved.item.id);
  else if (resolved.kind === "equipped") unequipItem(resolved.slot);
  else return;
  if (mqSheet.matches) closeSheet(); // na mobilu chceme hned vidět aktualizované vybavení
}

// --- Filtry a záložky -------------------------------------------------
function populateTypeFilter() {
  elements.invType.innerHTML = `<option value="all">Všechny sloty</option>${SLOT_ORDER.map((slot) => `<option value="${slot}">${SLOT_META[slot].label}</option>`).join("")}`;
}

function syncInventoryControls() {
  $$("[data-tab]", elements.invTabs).forEach((button) => {
    const active = button.dataset.tab === ui.tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.invSearch.value = ui.search;
  elements.invType.value = ui.type;
  elements.invRarity.value = ui.rarity;
  elements.invSort.value = ui.sort;
  elements.invTypeField.classList.toggle("hidden", ui.tab === "materials" || ui.tab === "scrolls");
}

function setInventoryTab(tab) {
  ui.tab = ["all", "equipment", "materials", "scrolls"].includes(tab) ? tab : "all";
  if ((ui.tab === "materials" || ui.tab === "scrolls") && deleteMode) setDeleteMode(false);
  syncInventoryControls();
  renderInventory();
}

function updateCountdown(now) {
  const secondsLeft = Math.max(0, Math.ceil((state.phaseEndsAt - now) / 1000));
  if (state.phase === "searching") {
    elements.encounterMessage.textContent = `Hledám dalšího nepřítele (${getCurrentEnemy().name})… ${secondsLeft} s`;
    if (now >= state.phaseEndsAt) beginFight(now);
  } else if (state.phase === "dead") {
    elements.encounterMessage.textContent = `Návrat k výpravě za ${secondsLeft} s`;
    if (now >= state.phaseEndsAt) {
      state.player.hp = getPlayerStats().maxHp;
      addLog("Poutník se zotavil a vrací se na výpravu.", "system");
      beginFight(now);
    }
  }
}

function tick(now) {
  if (!state.running) return;
  if (state.phase === "fighting") {
    if (now - state.lastPlayerAttackAt >= CONFIG.playerAttackMs) { state.lastPlayerAttackAt = now; playerAttack(); }
    if (state.phase === "fighting" && now - state.lastEnemyAttackAt >= CONFIG.enemyAttackMs) { state.lastEnemyAttackAt = now; enemyAttack(); }
  } else if (state.phase === "searching" || state.phase === "dead") updateCountdown(now);
  render();
}

function startLoops() {
  if (gameLoopId === null) gameLoopId = window.setInterval(() => tick(performance.now()), 100);
  if (timerLoopId === null) timerLoopId = window.setInterval(() => {
    if (state.running) { state.elapsedSeconds += 1; if (state.elapsedSeconds % 5 === 0) saveState(); render(); }
  }, 1000);
}

function toggleFight() {
  state.running = !state.running;
  if (state.running) {
    const now = performance.now();
    if (state.phase === "ready") beginFight(now);
    else if (state.phase === "fighting") {
      state.lastPlayerAttackAt = now; state.lastEnemyAttackAt = now;
      elements.encounterMessage.textContent = "Souboj pokračuje"; addLog("Boj pokračuje.", "system");
    } else {
      state.phaseEndsAt = now + Math.max(0, state.phaseEndsAt - state.pausedAt);
      addLog("Výprava pokračuje.", "system");
    }
  } else {
    state.pausedAt = performance.now();
    elements.encounterMessage.textContent = "Výprava pozastavena";
    addLog("Výprava byla pozastavena.", "system"); saveState();
  }
  render();
}

function resetGame() {
  localStorage.removeItem(CONFIG.saveKey);
  state = initialState();
  elements.combatLog.innerHTML = "";
  ui.selection = null;
  ui.tab = "all"; ui.search = ""; ui.type = "all"; ui.rarity = "all"; ui.sort = "newest";
  closeSheet({ restoreFocus: false });
  deleteMode = false;
  selectedForDeletion.clear();
  elements.bulkDeleteBar.classList.add("hidden");
  elements.deleteModeButton.setAttribute("aria-pressed", "false");
  updateSelectedCount();
  syncInventoryControls();
  addLog("Prototyp byl resetován včetně inventáře a materiálů.", "system");
  elements.encounterMessage.textContent = "Připraven k boji";
  updateArenaHeader();
  render();
  renderLoot();
  if (ui.page === "mapa") renderMapPage();
}

// --- Mapa → lokace → výběr nepřítele -----------------------------------
//
// Samostatná stránka: nahoře karty lokací, pod nimi nepřátelé vybrané lokace.
// Všichni nepřátelé lokace jsou vidět a vybratelní hned od začátku -- žádné
// postupné odemykání. Výběr nepřítele jen nastaví nová data cíle a bezpečně
// (znovu)spustí boj -- existující smyčka (startLoops/tick) běží od startu
// stránky pořád stejná, žádný další interval/timer se nikdy nezakládá, takže
// tu není nic, co by šlo zdvojit.

function renderMapPage() {
  const currentLocationId = ENEMIES[state.currentEnemyId]?.locationId;
  if (!LOCATIONS[ui.mapLocationId]) ui.mapLocationId = LOCATIONS[currentLocationId] ? currentLocationId : Object.keys(LOCATIONS)[0];
  renderMapLocations(currentLocationId);
  renderMapEnemies();
}

function renderMapLocations(currentLocationId) {
  elements.mapLocations.innerHTML = "";
  Object.values(LOCATIONS).forEach((location) => {
    const isViewed = ui.mapLocationId === location.id;
    const isActiveTarget = currentLocationId === location.id;
    const previewEnemy = ENEMIES[location.enemies[0]];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "loc-card";
    card.classList.toggle("selected", isViewed);
    card.setAttribute("aria-pressed", String(isViewed));
    card.dataset.locationId = location.id;
    card.innerHTML = `<span class="loc-thumb" aria-hidden="true"></span><span class="loc-copy"><span class="loc-name"></span><span class="loc-meta"></span><span class="loc-active"></span></span>`;
    card.querySelector(".loc-thumb").innerHTML = previewEnemy?.image
      ? `<img src="${previewEnemy.image}" alt="" />` : `<span class="goblin-figure"></span>`;
    card.querySelector(".loc-name").textContent = location.name;
    card.querySelector(".loc-meta").textContent = `${location.enemies.length} ${pluralizeNepritel(location.enemies.length)}`;
    card.querySelector(".loc-active").textContent = isActiveTarget ? "◆ aktivní cíl zde" : "";
    elements.mapLocations.append(card);
  });
}

function renderMapEnemies() {
  const location = LOCATIONS[ui.mapLocationId];
  elements.mapLocationTitle.textContent = location.name;
  elements.mapEnemyGrid.innerHTML = "";
  location.enemies.forEach((enemyId) => {
    const enemyCfg = ENEMIES[enemyId];
    const isActive = state.currentEnemyId === enemyId;
    const card = document.createElement("article");
    card.className = "map-enemy-card";
    card.classList.toggle("active", isActive);
    card.innerHTML = `
      <div class="map-enemy-portrait" aria-hidden="true"></div>
      <div class="map-enemy-info">
        <strong class="map-enemy-name"></strong>
        <span class="map-enemy-level"></span>
        <dl class="map-enemy-stats">
          <div><dt>Život</dt><dd class="map-stat-hp"></dd></div>
          <div><dt>Útok</dt><dd class="map-stat-dmg"></dd></div>
          <div><dt>Obrana</dt><dd class="map-stat-def"></dd></div>
          <div><dt>XP</dt><dd class="map-stat-xp"></dd></div>
          <div><dt>Gold</dt><dd class="map-stat-gold"></dd></div>
        </dl>
        <details class="map-loot" open>
          <summary>MOŽNÁ KOŘIST</summary>
          <ul class="map-loot-list"></ul>
        </details>
      </div>
      <button type="button" class="btn map-select-button"></button>`;
    const portrait = card.querySelector(".map-enemy-portrait");
    portrait.innerHTML = enemyCfg.image ? `<img src="${enemyCfg.image}" alt="" />` : `<div class="goblin-figure"></div>`;
    card.querySelector(".map-enemy-name").textContent = enemyCfg.name;
    card.querySelector(".map-enemy-level").textContent = `Úroveň ${enemyCfg.level}${enemyCfg.type ? ` · ${ENEMY_TYPE_LABELS[enemyCfg.type] ?? ""}` : ""}`;
    renderEnemyLoot(card.querySelector(".map-loot-list"), enemyCfg);
    card.querySelector(".map-stat-hp").textContent = enemyCfg.maxHp;
    card.querySelector(".map-stat-dmg").textContent = `${enemyCfg.minDamage}–${enemyCfg.maxDamage}`;
    card.querySelector(".map-stat-def").textContent = enemyCfg.defense ?? 0;
    card.querySelector(".map-stat-xp").textContent = enemyCfg.xp;
    card.querySelector(".map-stat-gold").textContent = enemyCfg.gold ?? 0;
    const button = card.querySelector(".map-select-button");
    button.dataset.enemyId = enemyId;
    if (isActive) {
      button.textContent = "Aktivní cíl";
      button.disabled = true;
    } else {
      button.textContent = "Vybrat cíl";
      button.classList.add("btn-primary");
    }
    elements.mapEnemyGrid.append(card);
  });
}

// Builds the "MOŽNÁ KOŘIST" list of an enemy from its data-driven drop table.
// Shows a qualitative tier ("Běžný drop" ... "Velmi vzácný drop") rather than
// an exact percentage.
function getEnemyLootRows(enemyCfg) {
  const rows = (enemyCfg.materialDrops ?? []).map((drop) => {
    const material = MATERIALS[drop.id];
    return material && {
      icon: { image: material.asset }, name: material.name, rarity: material.rarity,
      type: material.category === "scroll" ? "Svitek" : "Materiál", tier: drop.tier,
    };
  }).filter(Boolean);
  if (enemyCfg.equipmentLoot && (enemyCfg.dropChance ?? 0) > 0) {
    const loot = enemyCfg.equipmentLoot;
    rows.push({
      icon: ITEM_TEMPLATES.find((template) => template.icon === loot.icon) ?? { icon: loot.icon },
      name: loot.name, rarity: null, type: "Vybavení", tier: loot.tier,
    });
  }
  // Most common first, so the "main" drop of an enemy is always on top.
  return rows.sort((a, b) => DROP_TIER_ORDER.indexOf(a.tier) - DROP_TIER_ORDER.indexOf(b.tier));
}

function renderEnemyLoot(list, enemyCfg) {
  list.innerHTML = "";
  const rows = getEnemyLootRows(enemyCfg);
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "map-loot-empty";
    empty.textContent = "Bez cílené kořisti";
    list.append(empty);
    return;
  }
  rows.forEach((row) => {
    const rarity = row.rarity ? RARITIES[row.rarity] : null;
    const li = document.createElement("li");
    li.className = `map-loot-row${row.rarity ? ` rarity-${row.rarity}` : ""}`;
    li.innerHTML = `<span class="map-loot-icon" aria-hidden="true"></span><span class="map-loot-copy"><strong></strong><span></span></span><span class="map-loot-tier"></span>`;
    renderItemIcon(li.querySelector(".map-loot-icon"), row.icon);
    const name = li.querySelector("strong");
    name.textContent = row.name;
    if (row.rarity) name.className = `rarity-text rarity-${row.rarity}`;
    li.querySelector(".map-loot-copy > span").textContent = rarity ? `${rarity.label} · ${row.type}` : row.type;
    const tier = li.querySelector(".map-loot-tier");
    tier.textContent = DROP_TIER_LABELS[row.tier] ?? "";
    tier.dataset.tier = row.tier;
    list.append(li);
  });
}

// Sets a new farming target. Safe against duplicate combat timers: there is
// only ever one global tick loop (started once in startLoops()), so
// switching targets never spawns a second one -- it only resets what that
// one loop is currently fighting against.
function switchEnemy(enemyId) {
  const enemyCfg = ENEMIES[enemyId];
  if (!enemyCfg) return;
  state.currentEnemyId = enemyId;
  state.enemy = { hp: enemyCfg.maxHp, maxHp: enemyCfg.maxHp };
  updateArenaHeader();
  if (state.running) {
    // End the current cycle and start exactly one new fight against the
    // freshly selected enemy right away ("pokračovat v automatickém boji").
    beginFight(performance.now());
  } else {
    state.phase = "ready";
    elements.encounterMessage.textContent = "Připraven k boji";
  }
  addLog(`Cíl farmení nastaven na: ${enemyCfg.name}.`, "system");
  render();
  saveState();
}

function selectEnemyTarget(enemyId) {
  switchEnemy(enemyId);
  navigate("boj");
}

// --- Stránky, navigace a sidebar ---------------------------------------
//
// Všechny stránky zůstávají v DOM (jen se přepíná atribut hidden) a herní
// smyčka běží mimo ně — přepnutí stránky proto boj nikdy nerestartuje.

const PAGE_TITLES = Object.freeze({ postava: "Postava", inventar: "Inventář", mapa: "Mapa", boj: "Boj" });

function pageFromHash() {
  const match = /^#\/?([a-z]+)/.exec(location.hash);
  return match && PAGE_TITLES[match[1]] ? match[1] : "boj";
}

function navigate(page) {
  if (location.hash === `#/${page}`) showPage(page);
  else location.hash = `#/${page}`; // hashchange zavolá showPage
}

function showPage(page) {
  ui.page = page;
  $$(".page").forEach((section) => { section.hidden = section.dataset.page !== page; });
  $$("[data-page-link]").forEach((link) => {
    if (link.dataset.pageLink === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  elements.pageTitle.textContent = PAGE_TITLES[page];
  document.title = `${PAGE_TITLES[page]} — Idle RPG`;
  closeSidebar({ restoreFocus: false });
  closeSheet({ restoreFocus: false });
  if (page === "mapa") renderMapPage();
  else if (page === "inventar") renderInventoryView();
  else if (page === "postava") renderEquipmentOverview();
  window.scrollTo(0, 0);
}

function openSidebar() {
  document.body.classList.add("nav-open");
  elements.menuButton.setAttribute("aria-expanded", "true");
  $(".nav-link", elements.sidebar)?.focus({ preventScroll: true });
}

function closeSidebar({ restoreFocus = true } = {}) {
  if (!document.body.classList.contains("nav-open")) return;
  document.body.classList.remove("nav-open");
  elements.menuButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.menuButton.focus({ preventScroll: true });
}

elements.fightButton.addEventListener("click", toggleFight);
elements.resetButton.addEventListener("click", () => {
  if (window.confirm("Opravdu resetovat prototyp? Smaže se postup, inventář i materiály.")) resetGame();
});
elements.clearLogButton.addEventListener("click", () => { elements.combatLog.innerHTML = ""; addLog("Záznam byl vyčištěn.", "system"); });

// Inventář: delegované události (grid se překresluje, listenery se tedy nikdy nezdvojují).
elements.inventoryGrid.addEventListener("click", (event) => {
  const cell = event.target.closest(".inv-cell[data-key]");
  if (cell) onInventoryCell(cell.dataset.key);
});
elements.paperDoll.addEventListener("click", (event) => {
  const slotButton = event.target.closest(".pd-slot[data-slot]");
  if (slotButton) onDollSlot(slotButton.dataset.slot);
});
elements.equipmentOverview.addEventListener("click", (event) => {
  const button = event.target.closest(".ov-item[data-slot]");
  if (!button) return;
  const slot = button.dataset.slot;
  if (state.equipment[slot]) ui.selection = { kind: "equipped", slot };
  navigate("inventar");
});
elements.detailActionButton.addEventListener("click", runDetailAction);
elements.detailCloseButton.addEventListener("click", () => closeSheet());
elements.detailBackdrop.addEventListener("click", () => closeSheet());
elements.deleteModeButton.addEventListener("click", () => setDeleteMode(!deleteMode));
elements.cancelDeleteButton.addEventListener("click", () => setDeleteMode(false));
elements.confirmDeleteButton.addEventListener("click", deleteSelectedItems);
elements.invTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (button) setInventoryTab(button.dataset.tab);
});
elements.invSearch.addEventListener("input", () => { ui.search = elements.invSearch.value; renderInventory(); });
elements.invType.addEventListener("change", () => { ui.type = elements.invType.value; renderInventory(); });
elements.invRarity.addEventListener("change", () => { ui.rarity = elements.invRarity.value; renderInventory(); });
elements.invSort.addEventListener("change", () => { ui.sort = elements.invSort.value; renderInventory(); });

// Mapa
elements.mapLocations.addEventListener("click", (event) => {
  const card = event.target.closest(".loc-card[data-location-id]");
  if (!card) return;
  ui.mapLocationId = card.dataset.locationId;
  renderMapPage();
});
elements.mapEnemyGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".map-select-button[data-enemy-id]");
  if (button && !button.disabled) selectEnemyTarget(button.dataset.enemyId);
});

// Navigace
elements.menuButton.addEventListener("click", () => (document.body.classList.contains("nav-open") ? closeSidebar() : openSidebar()));
elements.sidebarBackdrop.addEventListener("click", () => closeSidebar());
$$(".nav-link", elements.sidebar).forEach((link) => link.addEventListener("click", () => closeSidebar({ restoreFocus: false })));
window.addEventListener("hashchange", () => showPage(pageFromHash()));
mqDrawer.addEventListener("change", (event) => { if (!event.matches) closeSidebar({ restoreFocus: false }); });
mqSheet.addEventListener("change", (event) => { if (!event.matches) closeSheet({ restoreFocus: false }); });

// Escape zavírá (v tomto pořadí): mobilní menu, mobilní detail, režim mazání.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.body.classList.contains("nav-open")) closeSidebar();
  else if (isSheetOpen()) closeSheet();
  else if (deleteMode) setDeleteMode(false);
});
window.addEventListener("beforeunload", saveState);

// Dev sanity check: material `sourceEnemyIds` (material-data.js) must match
// the drop tables in world-data.js. Only warns -- never blocks the game.
function validateMaterialSources() {
  const fromTables = {};
  for (const enemy of Object.values(ENEMIES)) {
    for (const drop of enemy.materialDrops ?? []) (fromTables[drop.id] ??= new Set()).add(enemy.id);
  }
  for (const material of Object.values(MATERIALS)) {
    const declared = [...material.sourceEnemyIds].sort().join(",");
    const actual = [...(fromTables[material.id] ?? [])].sort().join(",");
    if (declared !== actual) console.warn(`[material-data] ${material.id}: sourceEnemyIds (${declared}) != drop tables (${actual})`);
  }
}
validateMaterialSources();

applyCharacterPreview();
populateTypeFilter();
syncInventoryControls();
startLoops();
updateArenaHeader();
render();
renderLoot();
showPage(pageFromHash());
