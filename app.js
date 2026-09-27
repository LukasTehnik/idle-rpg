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
  saveKey: "idle-rpg-prototype-v02",
});

// RARITIES, SLOT_META, ICONS, ITEM_TEMPLATES and renderItemIcon() now live in
// item-data.js; LOCATIONS, ENEMIES and DEFAULT_ENEMY_ID live in world-data.js
// (both loaded before this file in index.html).

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
  inventory: [],
  equipment: { weapon: null, armor: null, charm: null, helmet: null, gloves: null, boots: null, pants: null },
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

const elements = {
  level: document.querySelector("#levelValue"), xp: document.querySelector("#xpValue"),
  xpGoal: document.querySelector("#xpGoal"), xpBar: document.querySelector("#xpBar"),
  kills: document.querySelector("#killsValue"), drops: document.querySelector("#dropsValue"),
  gold: document.querySelector("#goldValue"),
  runTime: document.querySelector("#runTimeValue"), playerHp: document.querySelector("#playerHpValue"),
  playerMaxHp: document.querySelector("#playerMaxHp"), playerHpBar: document.querySelector("#playerHpBar"),
  damage: document.querySelector("#damageValue"), crit: document.querySelector("#critValue"),
  enemyHp: document.querySelector("#enemyHpValue"), enemyMaxHp: document.querySelector("#enemyMaxHpValue"), enemyHpBar: document.querySelector("#enemyHpBar"),
  enemyPortrait: document.querySelector("#enemyPortrait"), encounterMessage: document.querySelector("#encounterMessage"),
  enemyName: document.querySelector("#enemyName"), enemyLevel: document.querySelector("#enemyLevel"),
  goblinFigure: document.querySelector("#goblinFigure"), enemyImage: document.querySelector("#enemyImage"),
  currentLocationName: document.querySelector("#currentLocationName"), legendEnemyLabel: document.querySelector("#legendEnemyLabel"),
  fightButton: document.querySelector("#fightButton"), fightButtonText: document.querySelector("#fightButtonText"),
  fightButtonIcon: document.querySelector("#fightButtonIcon"), resetButton: document.querySelector("#resetButton"),
  clearLogButton: document.querySelector("#clearLogButton"), combatLog: document.querySelector("#combatLog"),
  sessionStatus: document.querySelector("#sessionStatus"), statusDot: document.querySelector("#statusDot"),
  arena: document.querySelector("#arena"), inventoryGrid: document.querySelector("#inventoryGrid"),
  inventoryEmpty: document.querySelector("#inventoryEmpty"), inventoryCount: document.querySelector("#inventoryCount"),
  inventoryCapacity: document.querySelector("#inventoryCapacity"), weaponSlot: document.querySelector("#weaponSlot"),
  armorSlot: document.querySelector("#armorSlot"), charmSlot: document.querySelector("#charmSlot"),
  helmetSlot: document.querySelector("#helmetSlot"), glovesSlot: document.querySelector("#glovesSlot"),
  bootsSlot: document.querySelector("#bootsSlot"), pantsSlot: document.querySelector("#pantsSlot"),
  dropToastStack: document.querySelector("#dropToastStack"),
  itemDetailModal: document.querySelector("#itemDetailModal"), detailCard: document.querySelector(".item-detail-card"),
  detailRarity: document.querySelector("#detailRarity"), detailIcon: document.querySelector("#detailIcon"),
  detailTitle: document.querySelector("#detailTitle"), detailType: document.querySelector("#detailType"),
  detailStats: document.querySelector("#detailStats"), detailMeta: document.querySelector("#detailMeta"),
  detailFlavor: document.querySelector("#detailFlavor"), detailActionButton: document.querySelector("#detailActionButton"),
  detailCloseButton: document.querySelector("#detailCloseButton"),
  deleteModeButton: document.querySelector("#deleteModeButton"), bulkDeleteBar: document.querySelector("#bulkDeleteBar"),
  selectedCount: document.querySelector("#selectedCount"), confirmDeleteButton: document.querySelector("#confirmDeleteButton"),
  cancelDeleteButton: document.querySelector("#cancelDeleteButton"),
  mapButton: document.querySelector("#mapButton"), mapModal: document.querySelector("#mapModal"),
  mapLocationsView: document.querySelector("#mapLocationsView"), mapEnemiesView: document.querySelector("#mapEnemiesView"),
  mapLocationsGrid: document.querySelector("#mapLocationsGrid"), mapEnemyGrid: document.querySelector("#mapEnemyGrid"),
  mapLocationTitle: document.querySelector("#mapLocationTitle"), mapBackButton: document.querySelector("#mapBackButton"),
  mapCloseButton: document.querySelector("#mapCloseButton"), mapCloseButton2: document.querySelector("#mapCloseButton2"),
};

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
    return {
      ...fresh,
      level: saved.level ?? fresh.level, xp: saved.xp ?? fresh.xp,
      kills: saved.kills ?? fresh.kills, drops: saved.drops ?? fresh.drops,
      gold: saved.gold ?? fresh.gold,
      elapsedSeconds: saved.elapsedSeconds ?? fresh.elapsedSeconds,
      inventory: Array.isArray(saved.inventory) ? saved.inventory : [],
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
  elements.level.textContent = state.level;
  elements.xp.textContent = state.xp;
  elements.xpGoal.textContent = goal;
  elements.xpBar.style.width = `${clampPercent(state.xp, goal)}%`;
  elements.kills.textContent = state.kills;
  elements.drops.textContent = state.drops;
  elements.gold.textContent = state.gold;
  elements.runTime.textContent = formatTime(state.elapsedSeconds);
  elements.playerHp.textContent = Math.ceil(state.player.hp);
  elements.playerMaxHp.textContent = stats.maxHp;
  elements.playerHpBar.style.width = `${clampPercent(state.player.hp, stats.maxHp)}%`;
  elements.damage.textContent = `${stats.minDamage}–${stats.maxDamage}`;
  elements.crit.textContent = `${Math.round(stats.critChance * 1000) / 10} %`;
  elements.enemyHp.textContent = Math.max(0, Math.ceil(state.enemy.hp));
  elements.enemyMaxHp.textContent = state.enemy.maxHp;
  elements.enemyHpBar.style.width = `${clampPercent(state.enemy.hp, state.enemy.maxHp)}%`;
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
  elements.sessionStatus.textContent = label;
  elements.statusDot.classList.toggle("active", mode === "active");
  elements.statusDot.classList.toggle("danger", mode === "danger");
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
// eyebrow above the arena, and the combat-log legend. Called once at
// startup and again whenever the target changes via the map.
function updateArenaHeader() {
  const enemyCfg = getCurrentEnemy();
  const location = LOCATIONS[enemyCfg.locationId];
  elements.enemyName.textContent = enemyCfg.name;
  elements.enemyLevel.textContent = `Úroveň ${enemyCfg.level}`;
  elements.currentLocationName.textContent = (location?.name ?? "").toUpperCase();
  elements.legendEnemyLabel.textContent = enemyCfg.name;
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
// stacked material) is saved into the existing inventory immediately, combat
// keeps running uninterrupted, and the only feedback is the combat log plus
// a small non-blocking toast (see showDropToast) -- nothing here requires a
// click and nothing covers the fight controls.
//
// Materials: a template marked `stackable: true` merges into an existing
// inventory entry with the same icon (incrementing `quantity`) instead of
// creating a new slot -- this is the generic mechanism the brief asks for.
// No delivered asset this round is actually a material (only six equip-slot
// items came with the location), so no template currently sets `stackable`;
// the moment one does, it stacks correctly with zero further changes here.
function generateDrop(enemyCfg = getCurrentEnemy()) {
  const item = createItem(enemyCfg);
  const template = findItemTemplate(item);
  if (template?.stackable) {
    const existing = state.inventory.find((invItem) => invItem.icon === item.icon);
    if (existing) {
      existing.quantity = (existing.quantity ?? 1) + 1;
      state.drops += 1;
      addLog(`Materiál: ${item.name} (celkem ${existing.quantity}×).`, "system");
      renderLoot();
      showDropToast(existing);
      return;
    }
    item.quantity = 1;
  }
  if (state.inventory.length >= CONFIG.inventoryCapacity) {
    addLog(`${enemyCfg.name} zanechal předmět, ale inventář je plný.`, "system");
    return;
  }
  state.inventory.unshift(item);
  state.drops += 1;
  const rarity = RARITIES[item.rarity];
  addLog(`${rarity.label} předmět: ${item.name}.`, item.rarity === "common" ? "system" : "level-up");
  renderLoot();
  showDropToast(item);
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
  const isMaterial = !SLOT_META[item.slot];
  const toast = document.createElement("div");
  toast.className = `drop-toast rarity-${item.rarity}`;
  toast.style.setProperty("--drop-color", rarity.color);
  toast.innerHTML = `<span class="drop-toast-icon" aria-hidden="true"></span><div class="drop-toast-copy"><strong></strong><span></span></div>`;
  renderItemIcon(toast.querySelector(".drop-toast-icon"), item);
  const nameEl = toast.querySelector("strong");
  nameEl.textContent = item.name;
  nameEl.className = `rarity-text rarity-${item.rarity}`;
  toast.querySelector(".drop-toast-copy span").textContent = isMaterial
    ? `Materiál${item.quantity ? ` · celkem ${item.quantity}×` : ""}`
    : `${rarity.label} · ${SLOT_META[item.slot]?.label ?? ""}`;
  elements.dropToastStack.append(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
  // Keep at most a handful of toasts on screen during a fast farming streak.
  while (elements.dropToastStack.children.length > 4) elements.dropToastStack.firstElementChild.remove();
}

function equipItem(itemId) {
  const index = state.inventory.findIndex((item) => item.id === itemId);
  if (index < 0) return;
  const item = state.inventory[index];
  const previousMaxHp = getPlayerStats().maxHp;
  const replaced = state.equipment[item.slot];
  state.inventory.splice(index, 1);
  if (replaced) state.inventory.unshift(replaced);
  state.equipment[item.slot] = item;
  const newMaxHp = getPlayerStats().maxHp;
  state.player.hp = Math.min(newMaxHp, state.player.hp + Math.max(0, newMaxHp - previousMaxHp));
  addLog(`${item.name} byl vybaven.`, item.rarity === "common" ? "system" : "level-up");
  render(); renderLoot(); saveState();
}

function unequipItem(slot) {
  const item = state.equipment[slot];
  if (!item || state.inventory.length >= CONFIG.inventoryCapacity) return;
  state.equipment[slot] = null;
  state.inventory.unshift(item);
  state.player.hp = Math.min(state.player.hp, getPlayerStats().maxHp);
  addLog(`${item.name} byl vrácen do inventáře.`, "system");
  render(); renderLoot(); saveState();
}

function renderInventory() {
  elements.inventoryCapacity.textContent = CONFIG.inventoryCapacity;
  elements.inventoryCount.textContent = state.inventory.length;
  elements.inventoryEmpty.classList.toggle("hidden", state.inventory.length > 0);
  elements.inventoryGrid.classList.toggle("delete-mode", deleteMode);
  elements.inventoryGrid.innerHTML = "";
  state.inventory.forEach((item) => {
    const rarity = RARITIES[item.rarity];
    const selected = selectedForDeletion.has(item.id);
    const isEquippable = Boolean(SLOT_META[item.slot]);
    const card = document.createElement("article");
    card.className = `inventory-item rarity-${item.rarity}`;
    card.classList.toggle("selected-for-deletion", selected);
    card.style.setProperty("--item-color", rarity.color);
    card.innerHTML = `<div class="inventory-item-top"><input type="checkbox" class="inventory-item-checkbox" tabindex="-1" aria-hidden="true" /><span class="item-icon-small" aria-hidden="true"></span><span class="inventory-item-type"></span>${item.quantity > 1 ? `<span class="inventory-item-quantity">×${item.quantity}</span>` : ""}</div><strong class="inventory-item-name"></strong><p class="inventory-item-stats"></p>${isEquippable ? `<button type="button">Vybavit</button>` : ""}`;
    renderItemIcon(card.querySelector(".item-icon-small"), item);
    card.querySelector(".inventory-item-checkbox").checked = selected;
    card.querySelector(".inventory-item-type").textContent = isEquippable ? `${rarity.label} · ${SLOT_META[item.slot].label}` : `${rarity.label} · Materiál`;
    card.querySelector(".inventory-item-name").textContent = item.name;
    card.querySelector(".inventory-item-stats").textContent = statSummary(item);
    card.querySelector("button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      equipItem(item.id);
    });
    // Clicking the card itself (but not the Vybavit button) opens the full
    // item detail view; the button keeps its own direct equip shortcut. In
    // delete mode the same click instead toggles this item's checkbox --
    // preventDefault stops the checkbox's own native toggle so the visible
    // "selectedForDeletion" Set stays the single source of truth.
    card.tabIndex = 0;
    card.setAttribute("aria-label", deleteMode ? `Vybrat ke smazání: ${item.name}` : `Zobrazit detail předmětu: ${item.name}`);
    card.addEventListener("click", (event) => {
      if (deleteMode) { event.preventDefault(); toggleSelection(item.id); return; }
      openItemDetail(item, "inventory");
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (deleteMode) toggleSelection(item.id);
      else openItemDetail(item, "inventory");
    });
    elements.inventoryGrid.append(card);
  });
}

function renderEquipment() {
  for (const [slot, meta] of Object.entries(SLOT_META)) {
    const container = elements[`${slot}Slot`];
    const item = state.equipment[slot];
    container.classList.remove("rarity-common", "rarity-rare", "rarity-epic");
    container.classList.toggle("filled", Boolean(item));
    container.innerHTML = "";
    container.onclick = null;
    if (!item) {
      container.innerHTML = `<div class="slot-empty"><span class="slot-symbol" aria-hidden="true">${ICONS[meta.icon] ?? ""}</span><div><span>${meta.label}</span><strong>Prázdný slot</strong></div></div>`;
      continue;
    }
    const rarity = RARITIES[item.rarity];
    container.classList.add(`rarity-${item.rarity}`);
    const wrapper = document.createElement("div");
    wrapper.className = "equipped-item";
    wrapper.innerHTML = `<span class="item-icon-small" aria-hidden="true"></span><div class="equipped-copy"><span></span><strong></strong></div><div class="equipped-stats"></div>`;
    renderItemIcon(wrapper.querySelector(".item-icon-small"), item);
    wrapper.querySelector(".item-icon-small").style.color = rarity.color;
    wrapper.querySelector(".equipped-copy span").textContent = `${rarity.label} · ${meta.label}`;
    wrapper.querySelector("strong").textContent = item.name;
    wrapper.querySelector("strong").classList.add("rarity-text", `rarity-${item.rarity}`);
    wrapper.querySelector(".equipped-stats").textContent = statSummary(item);
    container.append(wrapper);
    // Clicking an equipped item now opens its detail view (with an "Sundat"
    // button inside) rather than unequipping immediately on click.
    container.tabIndex = 0;
    container.setAttribute("aria-label", `Zobrazit detail vybaveného předmětu: ${item.name}`);
    container.onclick = () => openItemDetail(item, "equipped");
    container.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openItemDetail(item, "equipped"); }
    };
  }
}

// Renders the shared stat-row list into a target container (used by both
// the drop-reveal card and the item detail view).
function renderStatRows(container, item) {
  container.innerHTML = "";
  statRows(item).forEach(([label, value]) => {
    const row = document.createElement("div"); row.className = "drop-stat";
    const name = document.createElement("span"); name.textContent = label;
    const amount = document.createElement("strong"); amount.textContent = value;
    row.append(name, amount); container.append(row);
  });
}

function formatAcquiredAt(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

let detailView = null; // { itemId, context: "inventory" | "equipped" }

function openItemDetail(item, context) {
  detailView = { itemId: item.id, context };
  const rarity = RARITIES[item.rarity];
  const template = findItemTemplate(item);
  elements.detailCard.classList.remove("rarity-common", "rarity-rare", "rarity-epic");
  elements.detailCard.classList.add(`rarity-${item.rarity}`);
  elements.detailCard.style.setProperty("--drop-color", rarity.color);
  elements.detailRarity.textContent = `${rarity.label} předmět`;
  renderItemIcon(elements.detailIcon, item);
  const isEquippable = Boolean(SLOT_META[item.slot]);
  elements.detailTitle.textContent = item.name;
  elements.detailTitle.className = `rarity-text rarity-${item.rarity}`;
  elements.detailType.textContent = `${isEquippable ? SLOT_META[item.slot].label : "Materiál"}${context === "equipped" ? " · právě vybaveno" : ""}`;
  renderStatRows(elements.detailStats, item);

  const flavorText = item.flavorText ?? template?.flavorText ?? null;
  elements.detailFlavor.textContent = flavorText ?? "";
  elements.detailFlavor.classList.toggle("hidden", !flavorText);

  const tradeable = item.tradeable ?? template?.tradeable ?? true;
  const source = item.source ?? "Neznámo (starší nález)";
  const acquiredAt = formatAcquiredAt(item.acquiredAt);
  elements.detailMeta.innerHTML = "";
  const metaRows = [["Zdroj", source], ["Obchodovatelné", tradeable ? "Ano" : "Ne · jedinečný nález"]];
  if (item.quantity > 1) metaRows.push(["Počet kusů", `${item.quantity}×`]);
  if (acquiredAt) metaRows.push(["Získáno", acquiredAt]);
  metaRows.forEach(([label, value]) => {
    const row = document.createElement("div"); row.className = "detail-meta-row";
    const name = document.createElement("span"); name.textContent = label;
    const amount = document.createElement("strong"); amount.textContent = value;
    row.append(name, amount); elements.detailMeta.append(row);
  });

  if (context === "inventory" && isEquippable) { elements.detailActionButton.textContent = "Vybavit"; elements.detailActionButton.classList.remove("hidden"); }
  else if (context === "equipped") { elements.detailActionButton.textContent = "Sundat"; elements.detailActionButton.classList.remove("hidden"); }
  else elements.detailActionButton.classList.add("hidden");

  elements.itemDetailModal.classList.add("visible");
  elements.itemDetailModal.setAttribute("aria-hidden", "false");
}

function closeItemDetail() {
  detailView = null;
  elements.itemDetailModal.classList.remove("visible");
  elements.itemDetailModal.setAttribute("aria-hidden", "true");
}

function runDetailAction() {
  if (!detailView) return;
  if (detailView.context === "inventory") equipItem(detailView.itemId);
  else if (detailView.context === "equipped") {
    const slot = Object.entries(state.equipment).find(([, equipped]) => equipped?.id === detailView.itemId)?.[0];
    if (slot) unequipItem(slot);
  }
  closeItemDetail();
}

function renderLoot() {
  renderInventory();
  renderEquipment();
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
  closeItemDetail();
  closeMap();
  deleteMode = false;
  selectedForDeletion.clear();
  elements.bulkDeleteBar.classList.add("hidden");
  elements.deleteModeButton.classList.remove("active");
  addLog("Prototyp byl resetován včetně inventáře.", "system");
  elements.encounterMessage.textContent = "Připraven k boji";
  updateArenaHeader();
  render();
  renderLoot();
}

// --- Mapa → lokace → výběr nepřítele -----------------------------------
//
// Jeden modal, dva pohledy: seznam lokací a seznam nepřátel dané lokace.
// Všichni nepřátelé lokace jsou vidět a vybratelní hned od začátku -- žádné
// postupné odemykání. Výběr nepřítele jen nastaví nová data cíle a bezpečně
// (znovu)spustí boj -- existující smyčka (startLoops/tick) běží od startu
// stránky pořád stejná, žádný další interval/timer se nikdy nezakládá, takže
// tu není nic, co by šlo zdvojit.

function renderMapLocations() {
  elements.mapLocationsGrid.innerHTML = "";
  Object.values(LOCATIONS).forEach((location) => {
    const isCurrentLocation = ENEMIES[state.currentEnemyId]?.locationId === location.id;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "map-location-card";
    card.classList.toggle("active", isCurrentLocation);
    card.innerHTML = `<span class="map-location-name"></span><span class="map-location-meta"></span>`;
    card.querySelector(".map-location-name").textContent = location.name;
    card.querySelector(".map-location-meta").textContent =
      `${location.enemies.length} ${pluralizeNepritel(location.enemies.length)}${isCurrentLocation ? " · aktivní cíl zde" : ""}`;
    card.addEventListener("click", () => openMapLocation(location.id));
    elements.mapLocationsGrid.append(card);
  });
}

function openMapLocation(locationId) {
  const location = LOCATIONS[locationId];
  if (!location) return;
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
      </div>
      <button type="button" class="map-select-button secondary-button"></button>`;
    const portrait = card.querySelector(".map-enemy-portrait");
    portrait.innerHTML = enemyCfg.image ? `<img src="${enemyCfg.image}" alt="" />` : `<div class="figure goblin-figure" aria-hidden="true"></div>`;
    card.querySelector(".map-enemy-name").textContent = enemyCfg.name;
    card.querySelector(".map-enemy-level").textContent = `Úroveň ${enemyCfg.level}`;
    card.querySelector(".map-stat-hp").textContent = enemyCfg.maxHp;
    card.querySelector(".map-stat-dmg").textContent = `${enemyCfg.minDamage}–${enemyCfg.maxDamage}`;
    card.querySelector(".map-stat-def").textContent = enemyCfg.defense ?? 0;
    card.querySelector(".map-stat-xp").textContent = enemyCfg.xp;
    card.querySelector(".map-stat-gold").textContent = enemyCfg.gold ?? 0;
    const button = card.querySelector(".map-select-button");
    if (isActive) {
      button.textContent = "Aktivní cíl";
      button.disabled = true;
      button.classList.add("active");
    } else {
      button.textContent = "Vybrat cíl";
      button.addEventListener("click", () => selectEnemyTarget(enemyId));
    }
    elements.mapEnemyGrid.append(card);
  });
  elements.mapLocationsView.classList.add("hidden");
  elements.mapEnemiesView.classList.remove("hidden");
}

function backToMapLocations() {
  elements.mapEnemiesView.classList.add("hidden");
  elements.mapLocationsView.classList.remove("hidden");
  renderMapLocations();
}

function openMap() {
  renderMapLocations();
  elements.mapEnemiesView.classList.add("hidden");
  elements.mapLocationsView.classList.remove("hidden");
  elements.mapModal.classList.add("visible");
  elements.mapModal.setAttribute("aria-hidden", "false");
}

function closeMap() {
  elements.mapModal.classList.remove("visible");
  elements.mapModal.setAttribute("aria-hidden", "true");
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
  closeMap();
}

elements.fightButton.addEventListener("click", toggleFight);
elements.resetButton.addEventListener("click", resetGame);
elements.clearLogButton.addEventListener("click", () => { elements.combatLog.innerHTML = ""; addLog("Záznam byl vyčištěn.", "system"); });
elements.detailCloseButton.addEventListener("click", closeItemDetail);
elements.detailActionButton.addEventListener("click", runDetailAction);
elements.itemDetailModal.querySelector(".drop-backdrop").addEventListener("click", closeItemDetail);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && detailView) closeItemDetail(); });
elements.deleteModeButton.addEventListener("click", () => setDeleteMode(!deleteMode));
elements.cancelDeleteButton.addEventListener("click", () => setDeleteMode(false));
elements.confirmDeleteButton.addEventListener("click", deleteSelectedItems);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && deleteMode) setDeleteMode(false); });
elements.mapButton.addEventListener("click", openMap);
elements.mapCloseButton.addEventListener("click", closeMap);
elements.mapCloseButton2.addEventListener("click", closeMap);
elements.mapBackButton.addEventListener("click", backToMapLocations);
elements.mapModal.querySelector(".drop-backdrop").addEventListener("click", closeMap);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && elements.mapModal.classList.contains("visible")) closeMap(); });
window.addEventListener("beforeunload", saveState);

startLoops();
updateArenaHeader();
render();
renderLoot();
