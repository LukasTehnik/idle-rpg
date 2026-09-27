"use strict";

const CONFIG = Object.freeze({
  playerAttackMs: 1600,
  enemyAttackMs: 2200,
  enemyRespawnMs: 3000,
  playerRespawnMs: 5000,
  betweenFightHealPercent: 0.1,
  dropChance: 0.42,
  inventoryCapacity: 18,
  maxLogEntries: 80,
  saveKey: "idle-rpg-prototype-v02",
  enemy: { name: "Goblin", maxHp: 48, minDamage: 5, maxDamage: 8, xp: 18 },
});

// RARITIES, SLOT_META, ICONS, ITEM_TEMPLATES and renderItemIcon() now live in
// item-data.js (loaded before this file in index.html) so the item catalog
// (item-catalog.html) can share the exact same data instead of duplicating it.

const initialState = () => ({
  running: false,
  phase: "ready",
  level: 1,
  xp: 0,
  kills: 0,
  drops: 0,
  elapsedSeconds: 0,
  inventory: [],
  equipment: { weapon: null, armor: null, charm: null, helmet: null, gloves: null, boots: null, pants: null },
  activeDropId: null,
  player: { hp: 100, baseMaxHp: 100, baseMinDamage: 9, baseMaxDamage: 13, baseCritChance: 0.1 },
  enemy: { hp: CONFIG.enemy.maxHp, maxHp: CONFIG.enemy.maxHp },
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
  runTime: document.querySelector("#runTimeValue"), playerHp: document.querySelector("#playerHpValue"),
  playerMaxHp: document.querySelector("#playerMaxHp"), playerHpBar: document.querySelector("#playerHpBar"),
  damage: document.querySelector("#damageValue"), crit: document.querySelector("#critValue"),
  enemyHp: document.querySelector("#enemyHpValue"), enemyHpBar: document.querySelector("#enemyHpBar"),
  enemyPortrait: document.querySelector("#enemyPortrait"), encounterMessage: document.querySelector("#encounterMessage"),
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
  dropReveal: document.querySelector("#dropReveal"), dropCard: document.querySelector(".drop-card"),
  dropRarity: document.querySelector("#dropRarity"), dropIcon: document.querySelector("#dropIcon"),
  dropTitle: document.querySelector("#dropTitle"), dropType: document.querySelector("#dropType"),
  dropStats: document.querySelector("#dropStats"), dropComparison: document.querySelector("#dropComparison"),
  equipDropButton: document.querySelector("#equipDropButton"), keepDropButton: document.querySelector("#keepDropButton"),
};

function loadState() {
  const fresh = initialState();
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG.saveKey));
    if (!saved || saved.version !== 2) return fresh;
    return {
      ...fresh,
      level: saved.level ?? fresh.level, xp: saved.xp ?? fresh.xp,
      kills: saved.kills ?? fresh.kills, drops: saved.drops ?? fresh.drops,
      elapsedSeconds: saved.elapsedSeconds ?? fresh.elapsedSeconds,
      inventory: Array.isArray(saved.inventory) ? saved.inventory : [],
      equipment: { ...fresh.equipment, ...(saved.equipment ?? {}) },
      player: { ...fresh.player, ...(saved.player ?? {}) },
    };
  } catch { return fresh; }
}

function saveState() {
  const payload = {
    version: 2, level: state.level, xp: state.xp, kills: state.kills, drops: state.drops,
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
  elements.runTime.textContent = formatTime(state.elapsedSeconds);
  elements.playerHp.textContent = Math.ceil(state.player.hp);
  elements.playerMaxHp.textContent = stats.maxHp;
  elements.playerHpBar.style.width = `${clampPercent(state.player.hp, stats.maxHp)}%`;
  elements.damage.textContent = `${stats.minDamage}–${stats.maxDamage}`;
  elements.crit.textContent = `${Math.round(stats.critChance * 1000) / 10} %`;
  elements.enemyHp.textContent = Math.max(0, Math.ceil(state.enemy.hp));
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

function beginFight(now = performance.now()) {
  state.phase = "fighting";
  state.enemy.hp = state.enemy.maxHp;
  state.lastPlayerAttackAt = now;
  state.lastEnemyAttackAt = now;
  elements.encounterMessage.textContent = "Souboj začal";
  addLog("Objevil se Goblin. Souboj začíná.", "system");
  render();
}

function playerAttack() {
  const stats = getPlayerStats();
  const critical = Math.random() < stats.critChance;
  let damage = randomInt(stats.minDamage, stats.maxDamage);
  if (critical) damage *= 2;
  state.enemy.hp = Math.max(0, state.enemy.hp - damage);
  addLog(critical ? `Kritický zásah! Poutník zasáhl Goblina za ${damage}.` : `Poutník zasáhl Goblina za ${damage}.`, critical ? "critical" : "player");
  animateHit("enemy");
  if (state.enemy.hp <= 0) defeatEnemy();
}

function enemyAttack() {
  const damage = randomInt(CONFIG.enemy.minDamage, CONFIG.enemy.maxDamage);
  state.player.hp = Math.max(0, state.player.hp - damage);
  addLog(`Goblin zasáhl Poutníka za ${damage}.`, "enemy");
  animateHit("player");
  if (state.player.hp <= 0) defeatPlayer();
}

function defeatEnemy() {
  state.kills += 1;
  state.xp += CONFIG.enemy.xp;
  state.phase = "searching";
  state.phaseEndsAt = performance.now() + CONFIG.enemyRespawnMs;
  elements.encounterMessage.textContent = "Hledám dalšího Goblina… 3 s";
  addLog(`Goblin padl. Získáváš ${CONFIG.enemy.xp} XP.`, "victory");
  applyLevelUps();
  const stats = getPlayerStats();
  const healing = Math.max(1, Math.round(stats.maxHp * CONFIG.betweenFightHealPercent));
  const before = state.player.hp;
  state.player.hp = Math.min(stats.maxHp, state.player.hp + healing);
  if (state.player.hp > before) addLog(`Krátký oddech obnovil ${state.player.hp - before} životů.`, "system");
  if (Math.random() < CONFIG.dropChance) generateDrop();
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

function createItem() {
  const template = ITEM_TEMPLATES[randomInt(0, ITEM_TEMPLATES.length - 1)];
  const rarityKey = chooseRarity();
  const rarity = RARITIES[rarityKey];
  const stats = {};
  for (const [stat, range] of Object.entries(template.rolls)) {
    const raw = stat === "critChance" ? randomDecimal(range[0], range[1]) : randomInt(range[0], range[1]);
    stats[stat] = stat === "critChance" ? Math.round(raw * rarity.multiplier * 10) / 10 : Math.max(stat === "damageMin" ? 0 : 1, Math.round(raw * rarity.multiplier));
  }
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: template.name, slot: template.slot, icon: template.icon, rarity: rarityKey, stats,
    // Carry over the template's own artwork/glow (if any) — without this,
    // signature items with unique art (item.image/item.glowColor) render as
    // a blank icon once dropped, even though they look correct wherever the
    // template itself is read directly (e.g. the item catalog page).
    image: template.image, glowColor: template.glowColor,
  };
}

function generateDrop() {
  if (state.inventory.length >= CONFIG.inventoryCapacity) {
    addLog("Goblin zanechal předmět, ale inventář je plný.", "system");
    return;
  }
  const item = createItem();
  state.inventory.unshift(item);
  state.drops += 1;
  state.activeDropId = item.id;
  const rarity = RARITIES[item.rarity];
  addLog(`${rarity.label} předmět: ${item.name}.`, item.rarity === "common" ? "system" : "level-up");
  renderLoot();
  showDrop(item);
}

function statRows(item) {
  const rows = [];
  if (item.stats.damageMin) rows.push(["Minimální poškození", `+${item.stats.damageMin}`]);
  if (item.stats.damageMax) rows.push(["Maximální poškození", `+${item.stats.damageMax}`]);
  if (item.stats.maxHp) rows.push(["Maximální životy", `+${item.stats.maxHp}`]);
  if (item.stats.critChance) rows.push(["Kritický zásah", `+${item.stats.critChance} %`]);
  return rows;
}

function statSummary(item) { return statRows(item).map(([label, value]) => `${label}: ${value}`).join(" · "); }
function itemPower(item) {
  return getItemBonus(item, "damageMin") * 1.3 + getItemBonus(item, "damageMax") + getItemBonus(item, "maxHp") * 0.18 + getItemBonus(item, "critChance") * 1.8;
}

function comparisonText(item) {
  const equipped = state.equipment[item.slot];
  if (!equipped) return { text: `Volný slot: ${SLOT_META[item.slot].label}`, worse: false };
  const difference = Math.round((itemPower(item) - itemPower(equipped)) * 10) / 10;
  if (difference > 0) return { text: `Přibližně +${difference} síly proti vybavenému předmětu`, worse: false };
  if (difference < 0) return { text: `Přibližně ${difference} síly proti vybavenému předmětu`, worse: true };
  return { text: "Přibližně stejná síla jako vybavený předmět", worse: false };
}

function showDrop(item) {
  const rarity = RARITIES[item.rarity];
  const comparison = comparisonText(item);
  elements.dropCard.classList.remove("rarity-common", "rarity-rare", "rarity-epic");
  elements.dropCard.classList.add(`rarity-${item.rarity}`);
  elements.dropCard.style.setProperty("--drop-color", rarity.color);
  elements.dropRarity.textContent = `${rarity.label} předmět`;
  renderItemIcon(elements.dropIcon, item);
  elements.dropTitle.textContent = item.name;
  elements.dropType.textContent = SLOT_META[item.slot].label;
  elements.dropStats.innerHTML = "";
  statRows(item).forEach(([label, value]) => {
    const row = document.createElement("div"); row.className = "drop-stat";
    const name = document.createElement("span"); name.textContent = label;
    const amount = document.createElement("strong"); amount.textContent = value;
    row.append(name, amount); elements.dropStats.append(row);
  });
  elements.dropComparison.textContent = comparison.text;
  elements.dropComparison.classList.toggle("worse", comparison.worse);
  elements.dropReveal.classList.add("visible");
  elements.dropReveal.setAttribute("aria-hidden", "false");
}

function closeDrop() {
  state.activeDropId = null;
  elements.dropReveal.classList.remove("visible");
  elements.dropReveal.setAttribute("aria-hidden", "true");
  saveState();
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
  closeDrop(); render(); renderLoot(); saveState();
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
  elements.inventoryGrid.innerHTML = "";
  state.inventory.forEach((item) => {
    const rarity = RARITIES[item.rarity];
    const card = document.createElement("article");
    card.className = `inventory-item rarity-${item.rarity}`;
    card.style.setProperty("--item-color", rarity.color);
    card.innerHTML = `<div class="inventory-item-top"><span class="item-icon-small" aria-hidden="true"></span><span class="inventory-item-type"></span></div><strong class="inventory-item-name"></strong><p class="inventory-item-stats"></p><button type="button">Vybavit</button>`;
    renderItemIcon(card.querySelector(".item-icon-small"), item);
    card.querySelector(".inventory-item-type").textContent = `${rarity.label} · ${SLOT_META[item.slot].label}`;
    card.querySelector(".inventory-item-name").textContent = item.name;
    card.querySelector(".inventory-item-stats").textContent = statSummary(item);
    card.querySelector("button").addEventListener("click", () => equipItem(item.id));
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
    container.onclick = () => unequipItem(slot);
  }
}

function renderLoot() {
  renderInventory();
  renderEquipment();
}

function updateCountdown(now) {
  const secondsLeft = Math.max(0, Math.ceil((state.phaseEndsAt - now) / 1000));
  if (state.phase === "searching") {
    elements.encounterMessage.textContent = `Hledám dalšího Goblina… ${secondsLeft} s`;
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
  closeDrop();
  addLog("Prototyp byl resetován včetně inventáře.", "system");
  elements.encounterMessage.textContent = "Připraven k boji";
  render();
  renderLoot();
}

elements.fightButton.addEventListener("click", toggleFight);
elements.resetButton.addEventListener("click", resetGame);
elements.clearLogButton.addEventListener("click", () => { elements.combatLog.innerHTML = ""; addLog("Záznam byl vyčištěn.", "system"); });
elements.keepDropButton.addEventListener("click", closeDrop);
elements.equipDropButton.addEventListener("click", () => { if (state.activeDropId) equipItem(state.activeDropId); });
elements.dropReveal.querySelector(".drop-backdrop").addEventListener("click", closeDrop);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.activeDropId) closeDrop(); });
window.addEventListener("beforeunload", saveState);

startLoops();
render();
renderLoot();
