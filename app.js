"use strict";

const CONFIG = Object.freeze({
  playerAttackMs: 1600,
  enemyAttackMs: 2200,
  enemyRespawnMs: 3000,
  playerRespawnMs: 5000,
  betweenFightHealPercent: 0.1,
  dropChance: 0.42, // fallback only -- each enemy in ENEMIES sets its own dropChance
  inventoryCapacity: LOOT_CONFIG.inventoryCapacity, // Prototype 0.5: centrální konfigurace v economy-data.js
  maxLogEntries: 80,
  maxRecentDrops: 5,
  maxToasts: 3,
  saveKey: "idle-rpg-prototype-v02",
});

// ITEM_QUALITIES (quality-data.js), SLOT_META, ICONS, ITEM_TEMPLATES and renderItemIcon() live in
// item-data.js; LOOT_CONFIG, itemPower() and itemSellValue() in economy-data.js; MATERIALS in material-data.js; LOCATIONS, ENEMIES and
// DEFAULT_ENEMY_ID in world-data.js (all loaded before this file in index.html).

// Returns the data-config of whichever enemy is currently selected as the
// farming target (see world-data.js). Falls back to the default enemy if
// state.currentEnemyId is ever missing/invalid (e.g. a corrupted save).
function getCurrentEnemy() {
  return ENEMIES[state?.currentEnemyId] ?? ENEMIES[DEFAULT_ENEMY_ID];
}

// Aktuální farming run (statistiky současného farmení). `targetEnemyId: null`
// = hráč je v lokaci, ale zatím nevybral nepřítele. Run se zakládá výběrem
// nepřítele / vstupem do jiné lokace; pauza, navigace a změna vybavení ho
// neresetují. `elapsedSeconds` běží jen při běžícím boji.
function createRun(enemyId, locationId = ENEMIES[enemyId]?.locationId ?? null) {
  return { targetEnemyId: enemyId ?? null, locationId, startedAt: Date.now(), kills: 0, xpEarned: 0, goldEarned: 0, elapsedSeconds: 0 };
}

function sanitizeRun(raw, fallbackEnemyId, activeLocationId) {
  const count = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  if (!raw || typeof raw !== "object") return createRun(fallbackEnemyId, activeLocationId);
  // Výslovné `null` = v lokaci bez vybraného cíle; poškozená hodnota spadne na uloženého nepřítele.
  const valid = typeof raw.targetEnemyId === "string" && ENEMIES[raw.targetEnemyId]?.locationId === activeLocationId;
  const target = valid ? raw.targetEnemyId : raw.targetEnemyId === null ? null : (ENEMIES[fallbackEnemyId]?.locationId === activeLocationId ? fallbackEnemyId : null);
  return {
    targetEnemyId: target, locationId: activeLocationId,
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : Date.now(),
    kills: count(raw.kills), xpEarned: count(raw.xpEarned), goldEarned: count(raw.goldEarned), elapsedSeconds: count(raw.elapsedSeconds),
  };
}

function defaultLootRules() {
  return { autoSellCommon: false, slots: Object.fromEntries(Object.keys(SLOT_META).map((slot) => [slot, true])) };
}
function emptyStats() {
  return { itemsFound: 0, materialsFound: 0, goldEarned: 0, goldFromSales: 0, goldLostToDeath: 0, deaths: 0, highestCrit: 0 };
}

const initialState = () => ({
  running: false,
  phase: "ready",
  level: 1,
  xp: 0,
  kills: 0,
  drops: 0,
  // Prototype 0.5: zlato je rozdělené. `carriedGold` má postava u sebe (5 % se
  // ztrácí při smrti), `bankGold` je bezpečně uložené v bance. Dřívější jediné `gold` se
  // při migraci savu převádí do `carriedGold`.
  carriedGold: 0,
  bankGold: 0,
  // Úlomky jádra: nová měna (zatím bez zdroje — zobrazuje se, ale nezískává se).
  coreFragments: 0,
  elapsedSeconds: 0,
  inventory: [], // equipment only (capacity CONFIG.inventoryCapacity)
  // Prototype 0.5: kořist, která se nevešla do plného inventáře. Nikdy se tiše
  // neztratí -- čeká zde, dokud hráč neuvolní místo (viz claimUnclaimed).
  unclaimed: [],
  // Posledních N ručně prodaných itemů k odkoupení zpět: [{ item, price, soldAt }].
  buyback: [],
  // Pravidla kořisti (automatický prodej je ve výchozím stavu VYPNUTÝ).
  lootRules: defaultLootRules(),
  lootLog: [], // perzistentní záznam prodejů, auto-prodejů a zpětných odkupů
  // Dlouhodobé statistiky hráče (nikdy se neresetují změnou lokace/nepřítele ani reloadem).
  stats: emptyStats(),
  // Sbírka šablon itemů: { [templateId]: { count, firstAt, firstEnemyId, firstLocationId, best } }.
  collection: {},
  bestiary: {},
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
  // Aktivní lokace (potvrzený vstup) a farming run. Pouhý výběr bodu na mapě
  // je jen `ui.selectedMapLocationId` a tyto hodnoty nemění.
  activeLocationId: ENEMIES[DEFAULT_ENEMY_ID].locationId,
  run: createRun(DEFAULT_ENEMY_ID),
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
  "invTabs", "invSearch", "invType", "invTypeField", "invQuality", "invSort", "paperDoll",
  "invFlag", "invFlagField", "invOrigin", "invOriginField", "invActiveFilters",
  "unclaimedPanel", "unclaimedCount", "unclaimedList", "claimAllButton",
  "detailSecondary", "detailFavButton", "detailLockButton", "detailSellButton", "selectedValue", "sellSelectedButton", "selectSellableButton",
  "merchantSelectCommon", "merchantSlot", "merchantSelectAll", "merchantClear", "merchantProtected", "merchantList", "merchantEmpty",
  "merchantCount", "merchantBreakdown", "merchantTotal", "merchantSell", "buybackCount", "buybackList",
  "ruleAutoSell", "ruleSlots", "autoSellState", "lootLogList",
  "bankAmount", "bankDeposit", "bankWithdraw", "bankDepositAll", "bankWithdrawAll", "bankMessage",
  "bestiaryLocation", "bestiaryProgress", "bestiaryList", "collectionLocation", "collectionProgress", "collectionOverview", "collectionList",
  "sellDialog", "sellDialogEyebrow", "sellDialogTitle", "sellDialogSummary", "sellDialogTotal", "sellDialogWarnings", "sellCancel", "sellConfirm",
  "deleteModeButton", "bulkDeleteBar", "selectedCount", "confirmDeleteButton", "cancelDeleteButton",
  "itemDetail", "detailEmpty", "detailBody", "detailQuality", "detailIcon", "detailTitle", "detailType",
  "detailStats", "detailCompare", "detailFlavor", "detailMeta", "detailActionButton", "detailNote", "detailCloseButton", "detailBackdrop",
  "worldMap", "worldMapImg", "mapPins", "mapTooltip", "locDetail", "locBackdrop", "mapTempNote",
  "enterDialog", "enterDialogTarget", "enterCancel", "enterConfirm",
  "combatWidgetSidebar", "combatStripSlot", "combatStripToggle", "combatStripText", "combatStripPanel",
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
  search: "", type: "all", quality: "all", flag: "all", origin: "all", sort: "newest",
  selectedMapLocationId: null, // jen náhled na mapě; aktivní lokace je state.activeLocationId
  locTab: "info", // info | enemies | loot
  highlightEnemyId: null,
  merchantSelected: new Set(), // výběr na stránce Obchodník (jen UI, neukládá se)
};
// Pod 1440 px se detail itemu otevírá jako výsuvný panel (na mobilu přes celou obrazovku).
const mqSheet = window.matchMedia("(max-width: 1439px)");
const mqDrawer = window.matchMedia("(max-width: 899px)");
const SLOT_ORDER = Object.keys(SLOT_META);
const STAT_KEYS = ["damageMin", "damageMax", "maxHp", "critChance"];
const STAT_LABELS = Object.freeze({
  damageMin: "Minimální poškození", damageMax: "Maximální poškození", maxHp: "Maximální životy", critChance: "Kritický zásah",
});
function roundStat(value) { return Math.round(value * 10) / 10; }
// České formátování čísel (desetinná čárka): 1,5 místo 1.5.
function fmtNum(value) { return (Math.round(value * 10) / 10).toLocaleString("cs-CZ", { maximumFractionDigits: 1 }); }
function fmtSigned(value, unit = "") {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "beze změny";
  return `${rounded > 0 ? "+" : "−"}${fmtNum(Math.abs(rounded))}${unit}`;
}
function formatStat(key, value) { return key === "critChance" ? `${fmtNum(value)} %` : fmtNum(value); }

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

// Hromadný výběr v inventáři: stejný výběr slouží k prodeji i ke smazání.
function selectedInventoryItems() {
  return state.inventory.filter((item) => selectedForDeletion.has(item.id) && !item.isLocked);
}

function updateSelectedCount() {
  const items = selectedInventoryItems();
  elements.selectedCount.textContent = items.length;
  elements.selectedValue.textContent = items.reduce((sum, item) => sum + itemSellValue(item), 0);
  elements.confirmDeleteButton.disabled = items.length === 0;
  elements.sellSelectedButton.disabled = items.length === 0;
}

// „Vybrat prodejné“: zobrazené předměty kromě uzamčených a oblíbených (ty se nikdy nevybírají automaticky).
function selectSellableInView() {
  const visible = sortEntries(filterEntries(getInventoryEntries())).filter((entry) => entry.kind === "item" && !entry.flags.locked && !entry.flags.favorite);
  visible.forEach((entry) => selectedForDeletion.add(entry.id));
  updateSelectedCount();
  renderInventory();
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
  const found = findItemAnywhere(itemId);
  if (!found || found.where !== "inventory" || found.item.isLocked) return; // uzamčené itemy nelze vybrat
  if (selectedForDeletion.has(itemId)) selectedForDeletion.delete(itemId);
  else selectedForDeletion.add(itemId);
  updateSelectedCount();
  renderInventory();
}

function deleteSelectedItems() {
  const ids = selectedInventoryItems().map((item) => item.id);
  if (ids.length) openBulkDialog("delete", ids);
}

// Smazání natrvalo (bez zlata, bez zpětného odkupu). Item zůstává v historii sbírky.
function performDelete(ids) {
  const doomed = new Set(state.inventory.filter((item) => ids.includes(item.id) && !item.isLocked).map((item) => item.id));
  if (!doomed.size) return;
  state.inventory = state.inventory.filter((item) => !doomed.has(item.id));
  addLog(`Smazáno ${doomed.size} ${pluralizePredmet(doomed.size)} z inventáře.`, "system");
  if (deleteMode) setDeleteMode(false);
  render(); renderLoot(); saveState();
}

// Keeps only sane { "templateId:quality": positiveInteger } pairs (Prototype 0.5.1).
// Starý save (≤ 0.5) ukládal jen { id: množství } bez kvality — takový stack se přesune pod
// klíč `id:<defaultQuality>`. Neznámé ID se zachovají (odebraný materiál nesmí smazat
// zásobu hráče); neznámá nebo nepovolená kvalita (např. God) spadne na common a stacky
// se po normalizaci sloučí, nic se neztrácí.
function sanitizeMaterials(raw) {
  const result = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const [key, qty] of Object.entries(raw)) {
    const n = Math.floor(Number(qty));
    if (!(Number.isFinite(n) && n > 0)) continue;
    const { templateId, quality } = parseStackKey(key);
    const quality0 = quality ?? MATERIALS[templateId]?.defaultQuality ?? DEFAULT_QUALITY;
    const finalKey = stackKey(templateId, normalizeQuality(quality0, { stackable: true, where: `materials ${key}` }));
    result[finalKey] = (result[finalKey] ?? 0) + n;
  }
  return result;
}

function sanitizeRecentDrops(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry.key === "string" && (entry.type === "material" || entry.type === "item"))
    .map((entry) => ({
      type: entry.type, key: entry.key, name: String(entry.name ?? entry.key),
      quality: normalizeQuality(entry.quality ?? entry.rarity, { stackable: entry.type === "material", where: "recentDrops" }),
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
    if (id && MATERIALS[id]) {
      const stack = stackKey(id, MATERIALS[id].defaultQuality ?? DEFAULT_QUALITY);
      merged[stack] = (merged[stack] ?? 0) + Math.max(1, Math.floor(Number(item.quantity) || 1));
    }
    else kept.push(item);
  }
  return { inventory: kept, materials: merged };
}

// --- Prototype 0.5: sanitizace nových částí savu --------------------------------
function goldInt(value) { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? n : 0; }
function fmtGold(value) { return goldInt(value).toLocaleString("cs-CZ"); }

function sanitizeBuyback(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const item = sanitizeItem(entry?.item);
    if (!item || !SLOT_META[item.slot]) return null;
    return { item, price: goldInt(entry.price) || itemSellValue(item), soldAt: Number(entry.soldAt) || 0 };
  }).filter(Boolean).slice(0, LOOT_CONFIG.buybackLimit);
}

function sanitizeLootRules(raw) {
  const rules = defaultLootRules();
  if (!raw || typeof raw !== "object") return rules;
  rules.autoSellCommon = raw.autoSellCommon === true;
  if (raw.slots && typeof raw.slots === "object") for (const slot of Object.keys(rules.slots)) if (raw.slots[slot] === false) rules.slots[slot] = false;
  return rules;
}

function sanitizeLootLog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry.text === "string")
    .map((entry) => ({ at: Number(entry.at) || 0, type: ["sale", "auto", "buyback"].includes(entry.type) ? entry.type : "sale", text: entry.text, gold: Number.isFinite(entry.gold) ? Math.trunc(entry.gold) : 0 }))
    .slice(0, LOOT_CONFIG.lootLogLimit);
}

function sanitizeStats(raw) {
  const stats = emptyStats();
  if (!raw || typeof raw !== "object") return stats;
  for (const key of Object.keys(stats)) stats[key] = goldInt(raw[key]);
  return stats;
}

// Zapíše získání itemu do sbírky. Vrací true, pokud šlo o PRVNÍ získání šablony.
// (Sbírka je jen informační -- nemění drop-rate ani staty a prodaný/smazaný item z ní nemizí.)
function registerInCollection(collection, item) {
  const id = item?.templateId;
  if (!id) return false;
  const first = !collection[id];
  const entry = collection[id] ?? (collection[id] = {
    count: 0, firstAt: item.obtainedAt ?? Date.now(), firstEnemyId: item.sourceEnemyId ?? null, firstLocationId: item.sourceLocationId ?? null, best: null,
  });
  entry.count += 1;
  const power = itemPower(item);
  if (!entry.best || power > entry.best.power || (power === entry.best.power && qualityRank(item.quality) > qualityRank(entry.best.quality))) {
    entry.best = { power, quality: item.quality, stats: { ...(item.stats ?? {}) }, at: item.obtainedAt ?? Date.now() };
  }
  return first;
}

function sanitizeCollection(raw) {
  const result = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const best = entry.best && typeof entry.best === "object" && Number.isFinite(entry.best.power)
      ? { power: entry.best.power, quality: normalizeQuality(entry.best.quality ?? entry.best.rarity, { where: "collection" }), stats: entry.best.stats && typeof entry.best.stats === "object" ? { ...entry.best.stats } : {}, at: Number(entry.best.at) || 0 }
      : null;
    result[id] = {
      count: Math.max(1, goldInt(entry.count)), firstAt: Number(entry.firstAt) || 0,
      firstEnemyId: typeof entry.firstEnemyId === "string" ? entry.firstEnemyId : null,
      firstLocationId: typeof entry.firstLocationId === "string" ? entry.firstLocationId : null, best,
    };
  }
  return result;
}

// Starý save (0.4) nemá sbírku -- zpětně se sestaví z toho, co hráč právě vlastní.
function backfillCollection(items) {
  const collection = {};
  [...items].sort((a, b) => (a.obtainedAt ?? 0) - (b.obtainedAt ?? 0)).forEach((item) => registerInCollection(collection, item));
  return collection;
}

// Bestiář: záznam existuje = nepřítel je objevený (první souboj už začal).
function sanitizeBestiary(raw) {
  const result = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  const ids = (list, valid) => [...new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === "string" && valid(id)))];
  for (const [enemyId, entry] of Object.entries(raw)) {
    if (!ENEMIES[enemyId] || !entry || typeof entry !== "object") continue;
    result[enemyId] = {
      firstSeenAt: Number(entry.firstSeenAt) || 0, kills: goldInt(entry.kills), deaths: goldInt(entry.deaths),
      items: ids(entry.items, (id) => Boolean(findTemplateById(id))), materials: ids(entry.materials, (id) => Boolean(MATERIALS[id])),
    };
  }
  return result;
}


function discoverEnemy(enemyId, bestiary = state.bestiary) {
  if (!ENEMIES[enemyId]) return null;
  return bestiary[enemyId] ?? (bestiary[enemyId] = { firstSeenAt: Date.now(), kills: 0, deaths: 0, items: [], materials: [] });
}

function noteEnemyDrop(enemyId, kind, id, bestiary = state.bestiary) {
  const entry = discoverEnemy(enemyId, bestiary);
  if (!entry || !id) return;
  const list = kind === "item" ? entry.items : entry.materials;
  if (!list.includes(id)) list.push(id);
}

// Starý save (0.4) nemá per-enemy historii: odvodí se z toho, co jde spolehlivě zjistit
// (aktuální nepřítel s výhrami, původ vlastněných itemů, jednozdrojové materiály).
function backfillBestiary(saved, owned, materials, currentEnemyId, run) {
  const bestiary = {};
  if ((saved.kills ?? 0) > 0 || (run?.kills ?? 0) > 0) {
    const entry = discoverEnemy(currentEnemyId, bestiary);
    if (run?.targetEnemyId === currentEnemyId) entry.kills = goldInt(run.kills);
  }
  owned.forEach((item) => { if (item.sourceEnemyId) noteEnemyDrop(item.sourceEnemyId, "item", item.templateId, bestiary); });
  for (const key of Object.keys(materials)) {
    const id = parseStackKey(key).templateId;
    const sources = MATERIALS[id]?.sourceEnemyIds ?? [];
    if (sources.length === 1) noteEnemyDrop(sources[0], "material", id, bestiary);
  }
  return bestiary;
}

function loadState() {
  const fresh = initialState();
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG.saveKey));
    if (!saved || (saved.version !== 2 && saved.version !== 3 && saved.version !== 4)) return fresh;
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
    // activeLocationId / run jsou nové -- starší savy je nemají, odvodí se
    // z uloženého nepřítele, takže postup ani cíl farmení se neztratí.
    const activeLocationId = LOCATIONS[saved.activeLocationId] ? saved.activeLocationId : ENEMIES[currentEnemyId].locationId;
    // Prototype 0.5: staré instance vybavení dostanou nová pole (templateId, isNew, …).
    const cleanInventory = inventory.map((item) => (SLOT_META[item?.slot] ? sanitizeItem(item) : item)).filter(Boolean);
    const equipment = { ...fresh.equipment, ...(saved.equipment ?? {}) };
    for (const slot of Object.keys(equipment)) equipment[slot] = equipment[slot] ? sanitizeItem(equipment[slot]) : null;
    const unclaimed = Array.isArray(saved.unclaimed) ? saved.unclaimed.map(sanitizeItem).filter((item) => item && SLOT_META[item.slot]) : [];
    // Vlastněné vybavení slouží ke zpětnému doplnění sbírky/statistik ze savu 0.4.
    const owned = [...cleanInventory.filter((item) => SLOT_META[item?.slot]), ...Object.values(equipment).filter(Boolean), ...unclaimed];
    const carriedGold = goldInt(saved.carriedGold ?? saved.gold); // 0.4 ukládalo jediné `gold` -> nesené zlato, nic se neztrácí
    const stats = saved.stats
      ? sanitizeStats(saved.stats)
      : { ...emptyStats(), itemsFound: owned.length, materialsFound: Object.values(materials).reduce((sum, qty) => sum + qty, 0), goldEarned: carriedGold };
    const run = sanitizeRun(saved.run, currentEnemyId, activeLocationId);
    return {
      ...fresh,
      level: saved.level ?? fresh.level, xp: saved.xp ?? fresh.xp,
      kills: saved.kills ?? fresh.kills, drops: saved.drops ?? fresh.drops,
      carriedGold, bankGold: goldInt(saved.bankGold), coreFragments: goldInt(saved.coreFragments),
      buyback: sanitizeBuyback(saved.buyback), lootRules: sanitizeLootRules(saved.lootRules), lootLog: sanitizeLootLog(saved.lootLog),
      stats, collection: saved.collection ? sanitizeCollection(saved.collection) : backfillCollection(owned),
      bestiary: saved.bestiary ? sanitizeBestiary(saved.bestiary) : backfillBestiary(saved, owned, materials, currentEnemyId, run),
      elapsedSeconds: saved.elapsedSeconds ?? fresh.elapsedSeconds,
      inventory: cleanInventory, materials, unclaimed,
      recentDrops: sanitizeRecentDrops(saved.recentDrops),
      equipment,
      player: { ...fresh.player, ...(saved.player ?? {}) },
      currentEnemyId, activeLocationId, run,
      enemy: { hp: ENEMIES[currentEnemyId].maxHp, maxHp: ENEMIES[currentEnemyId].maxHp },
    };
  } catch { return fresh; }
}

function saveState() {
  const payload = {
    version: 4, level: state.level, xp: state.xp, kills: state.kills, drops: state.drops,
    carriedGold: state.carriedGold, bankGold: state.bankGold, coreFragments: state.coreFragments, currentEnemyId: state.currentEnemyId,
    buyback: state.buyback, lootRules: state.lootRules, lootLog: state.lootLog, stats: state.stats, collection: state.collection, bestiary: state.bestiary,
    activeLocationId: state.activeLocationId, run: state.run,
    elapsedSeconds: state.elapsedSeconds, inventory: state.inventory, equipment: state.equipment,
    materials: state.materials, recentDrops: state.recentDrops, unclaimed: state.unclaimed,
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

// --- Instance vybavení (Prototype 0.5) --------------------------------------
// Každá instance nese: id, templateId, quality, stats, obtainedAt, sourceEnemyId,
// sourceLocationId, isNew, isFavorite, isLocked (+ původní pole 0.4: name, slot,
// icon, image, source, acquiredAt, tradeable, flavorText).
function inventoryFreeSlots() { return Math.max(0, CONFIG.inventoryCapacity - state.inventory.length); }

// Doplní nová pole do itemu ze starého savu (0.4 → 0.5), nic nemaže.
function sanitizeItem(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const template = findItemTemplate(raw);
  const enemy = ENEMIES[raw.sourceEnemyId] ?? Object.values(ENEMIES).find((candidate) => candidate.name === raw.source) ?? null;
  const time = Number.isFinite(raw.obtainedAt) ? raw.obtainedAt : (Number.isFinite(raw.acquiredAt) ? raw.acquiredAt : 0);
  const { rarity: legacyRarity, ...rest } = raw; // `rarity` ≤ 0.5 → `quality` (jediný kanonický název)
  return {
    ...rest,
    quality: normalizeQuality(raw.quality ?? legacyRarity, { where: `item ${raw.name ?? raw.icon ?? "?"}` }),
    templateId: typeof raw.templateId === "string" ? raw.templateId : (template?.templateId ?? raw.icon ?? null),
    obtainedAt: time,
    acquiredAt: Number.isFinite(raw.acquiredAt) ? raw.acquiredAt : time,
    sourceEnemyId: enemy?.id ?? null,
    sourceLocationId: LOCATIONS[raw.sourceLocationId] ? raw.sourceLocationId : (enemy?.locationId ?? null),
    isNew: raw.isNew === true, isFavorite: raw.isFavorite === true, isLocked: raw.isLocked === true,
  };
}

// Vizuální vstup pro applyQualityVisuals (quality-data.js): kvalita z instance, typ a
// wingGlow ze šablony (instance může wingGlow přepsat), upgrade z instance.
function itemVisual(item) {
  const template = findItemTemplate(item);
  return {
    quality: item.quality, slot: item.slot ?? template?.slot ?? null, wingGlow: item.wingGlow ?? template?.wingGlow ?? null,
    upgradeLevel: item.upgradeLevel, maxUpgradeLevel: item.maxUpgradeLevel, isMaxUpgraded: item.isMaxUpgraded,
  };
}
function materialVisual(quality) { return { quality, stackable: true }; }
// Třídy pro název předmětu (barva = rám kvality; křídla zlatě), bez glow/MAX tříd.
function qTextClass(visual) {
  return ["q-text", ...qualityClasses(visual).filter((name) => !name.startsWith("q-glow-") && name !== "q-max" && name !== "q-wings-glow")].join(" ");
}

// Najde item v inventáři, na postavě nebo v nevyzvednuté kořisti.
function findItemAnywhere(id) {
  let item = state.inventory.find((entry) => entry.id === id);
  if (item) return { item, where: "inventory" };
  for (const [slot, equipped] of Object.entries(state.equipment)) if (equipped?.id === id) return { item: equipped, where: "equipped", slot };
  item = state.unclaimed.find((entry) => entry.id === id);
  return item ? { item, where: "unclaimed" } : null;
}

// `equipment` lze přepsat, aby šlo spočítat výsledné staty postavy PO výměně
// itemu (porovnání v detailu) -- bez jakékoli změny skutečného stavu.
function getPlayerStats(equipment = state.equipment) {
  return Object.values(equipment).filter(Boolean).reduce(
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
  setText("gold", fmtGold(state.carriedGold));
  setText("bankGold", fmtGold(state.bankGold));
  setText("coreFragments", fmtGold(state.coreFragments));
  setText("totalGold", fmtGold(state.carriedGold + state.bankGold));
  setText("deathLoss", fmtGold(deathGoldLoss()));
  setText("runTime", formatTime(state.elapsedSeconds));
  setText("ltItemsFound", fmtNum(state.stats.itemsFound));
  setText("ltMaterialsFound", fmtNum(state.stats.materialsFound));
  setText("ltGoldEarned", fmtGold(state.stats.goldEarned));
  setText("ltGoldFromSales", fmtGold(state.stats.goldFromSales));
  setText("ltGoldLost", fmtGold(state.stats.goldLostToDeath));
  setText("ltDeaths", fmtNum(state.stats.deaths));
  setText("ltEnemiesDiscovered", `${Object.keys(state.bestiary).length} / ${Object.keys(ENEMIES).length}`);
  setText("ltItemsDiscovered", `${Object.keys(state.collection).length} / ${collectionTemplates().length}`);
  setText("ltHighestCrit", fmtNum(state.stats.highestCrit));
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
  if (!state.run.targetEnemyId) { elements.fightButtonText.textContent = "Vybrat nepřítele"; elements.fightButtonIcon.textContent = "▶"; setStatus("Bez cíle", "idle"); }
  renderCombatWidgets();
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
  if (!state.bestiary[enemyCfg.id]) { discoverEnemy(enemyCfg.id); addLog(`Bestiář: objeven nový nepřítel — ${enemyCfg.name}.`, "system"); }
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
  if (critical) state.stats.highestCrit = Math.max(state.stats.highestCrit, damage);
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
  discoverEnemy(enemyCfg.id).kills += 1;
  state.xp += enemyCfg.xp;
  addCarriedGold(enemyCfg.gold ?? 0);
  state.run.kills += 1;
  state.run.xpEarned += enemyCfg.xp;
  state.run.goldEarned += enemyCfg.gold ?? 0;
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
  rollEquipmentDrops(enemyCfg);
  rollMaterialDrops(enemyCfg);
  if (ui.page === "obchodnik") renderMerchant(); // dostupnost zpětného odkupu závisí na zlatě
  if (ui.page === "bestiar") renderBestiary();
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
  if (state.phase === "dead") return;
  state.phase = "dead";
  state.phaseEndsAt = performance.now() + CONFIG.playerRespawnMs;
  elements.encounterMessage.textContent = "Návrat k výpravě za 5 s";
  state.stats.deaths += 1;
  discoverEnemy(state.currentEnemyId).deaths += 1;
  // Prototype 0.5: smrt stojí 5 % ZLATA U SEBE. Zlato v bance je chráněné.
  const lostGold = deathGoldLoss();
  if (lostGold > 0) {
    state.carriedGold -= lostGold;
    state.stats.goldLostToDeath += lostGold;
    addLog(`Poutník padl a ztrácí ${fmtGold(lostGold)} gold (5 % neseného zlata). Za 5 sekund se vrátí do boje.`, "enemy");
    showNoticeToast("Ztráta zlata", `−${fmtGold(lostGold)} gold · v bance je bezpečně ${fmtGold(state.bankGold)}`, "danger");
  } else {
    addLog("Poutník padl. Za 5 sekund se vrátí do boje.", "enemy");
  }
  saveState();
}

// Zděděný náhodný hod kvality pro drop z `dropPool` (váhy: ITEM_QUALITY_ROLL v item-data.js).
function rollLegacyQuality() {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const [key, entry] of Object.entries(ITEM_QUALITY_ROLL)) {
    cumulative += entry.weight;
    if (roll < cumulative) return key;
  }
  return DEFAULT_QUALITY;
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

// `fixed` = { templateId, quality } z `equipmentDrops` (pevná šablona i kvalita). Bez něj se
// šablona losuje z dropPool a kvalita zděděným hodem (chování 0.4/0.5 beze změny).
// Kvalita sama staty NEMĚNÍ: násobič statů (ITEM_QUALITY_ROLL) patří jen zděděnému hodu,
// pevná kvalita (např. legendary) používá základní rozsah šablony × 1 — balance je mimo rozsah 0.5.1.
function createItem(enemyCfg, fixed = null) {
  const template = fixed ? findTemplateById(fixed.templateId) : (() => { const pool = resolveDropPool(enemyCfg); return pool[randomInt(0, pool.length - 1)]; })();
  const quality = fixed ? normalizeQuality(fixed.quality, { where: `drop ${fixed.templateId}` }) : rollLegacyQuality();
  const multiplier = fixed ? 1 : (ITEM_QUALITY_ROLL[quality]?.statMultiplier ?? 1);
  const stats = {};
  for (const [stat, range] of Object.entries(template.rolls ?? {})) {
    const raw = stat === "critChance" ? randomDecimal(range[0], range[1]) : randomInt(range[0], range[1]);
    stats[stat] = stat === "critChance" ? Math.round(raw * multiplier * 10) / 10 : Math.max(stat === "damageMin" ? 0 : 1, Math.round(raw * multiplier));
  }
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: template.name, slot: template.slot ?? null, icon: template.icon, quality, stats,
    upgradeLevel: 0, maxUpgradeLevel: null, isMaxUpgraded: false,
    ...(template.wingGlow ? { wingGlow: template.wingGlow } : {}),
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
    // Prototype 0.5: stabilní odkaz na šablonu, původ a stav itemu.
    templateId: template.templateId,
    obtainedAt: Date.now(),
    sourceEnemyId: enemyCfg?.id ?? null,
    sourceLocationId: enemyCfg?.locationId ?? null,
    isNew: true, isFavorite: false, isLocked: false,
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
function generateDrop(enemyCfg = getCurrentEnemy(), fixed = null) {
  const item = createItem(enemyCfg, fixed);
  state.drops += 1;
  // Nejdřív se item zapíše do sbírky (ať se pak prodá nebo ne) -- první získání šablony se nikdy neprodá automaticky.
  const firstOfTemplate = recordItemAcquired(item);
  pushRecentDrop({ type: "item", key: item.icon, name: item.name, quality: item.quality, qty: 1 });
  if (ruleAllowsAutoSell(item, firstOfTemplate)) { autoSellDrop(item); return; }
  if (state.inventory.length >= CONFIG.inventoryCapacity) {
    // Plný inventář: item nikdy tiše nezmizí, uloží se do nevyzvednuté kořisti.
    state.unclaimed.push(item);
    addLog(`${qualityLabel(item.quality)} ${item.name} — inventář je plný, kořist čeká na vyzvednutí (${state.unclaimed.length}).`, "level-up");
    renderLoot();
    showDropToast(item, "Inventář plný — čeká na vyzvednutí");
    return;
  }
  state.inventory.unshift(item);
  addLog(`${qualityLabel(item.quality)}: ${item.name}.`, item.quality === "common" ? "system" : "level-up");
  renderLoot();
  showDropToast(item);
}

// Materials: each `materialDrops` entry of the enemy is an independent roll
// (data lives in world-data.js). Stacks live in state.materials by stable id
// and never touch the equipment capacity.
function rollMaterialDrops(enemyCfg) {
  for (const raw of enemyCfg?.materialDrops ?? []) {
    const drop = normalizeMaterialDrop(raw, enemyCfg.id);
    if (!drop) continue;
    const material = MATERIALS[drop.templateId];
    // Safety net: a material may only drop from an enemy that is listed as a
    // source of it (guards e.g. "Oko Matky" = Matka děr only).
    if (!material.sourceEnemyIds.includes(enemyCfg.id)) continue;
    if (Math.random() >= drop.chance) continue;
    addMaterial(drop.templateId, randomInt(drop.quantity[0], drop.quantity[1]), enemyCfg.id, drop.quality);
  }
}

// Pevné vybavení z `equipmentDrops` (nezávislý hod za každý záznam; stejná šablona v dané kvalitě).
function rollEquipmentDrops(enemyCfg) {
  for (const raw of enemyCfg?.equipmentDrops ?? []) {
    const drop = normalizeEquipmentDrop(raw, enemyCfg.id);
    if (drop && Math.random() < drop.chance) generateDrop(enemyCfg, drop);
  }
}

function addMaterial(materialId, quantity, enemyId = null, quality = null) {
  const material = MATERIALS[materialId];
  if (!material || !(quantity > 0)) return;
  const q = normalizeQuality(quality ?? material.defaultQuality, { stackable: true, where: `addMaterial ${materialId}` });
  const key = stackKey(materialId, q);
  state.materials[key] = (state.materials[key] ?? 0) + quantity;
  state.drops += 1;
  state.stats.materialsFound += quantity;
  if (enemyId) noteEnemyDrop(enemyId, "material", materialId);
  const total = state.materials[key];
  addLog(`Získáno: ${material.name} (${qualityLabel(q)}) ×${quantity} (celkem ${total}).`, q === "common" ? "system" : "level-up");
  pushRecentDrop({ type: "material", key: materialId, name: material.name, quality: q, qty: quantity });
  renderLoot();
  showMaterialToast(material, quantity, total, q);
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
    row.className = "recent-drop";
    const dropTemplate = drop.type === "item" ? findTemplateById(drop.key) ?? ITEM_TEMPLATES.find((template) => template.icon === drop.key) : null;
    const dropVisual = drop.type === "material" ? materialVisual(drop.quality) : { quality: drop.quality, slot: dropTemplate?.slot ?? null, wingGlow: dropTemplate?.wingGlow ?? null };
    applyQualityVisuals(row, dropVisual, { surface: false });
    row.innerHTML = `<span class="recent-drop-icon" aria-hidden="true"></span><span class="recent-drop-name"></span><span class="recent-drop-qty"></span><time class="recent-drop-time"></time>`;
    const iconSource = drop.type === "material"
      ? { image: MATERIALS[drop.key]?.asset }
      : (ITEM_TEMPLATES.find((template) => template.icon === drop.key) ?? { icon: drop.key });
    renderItemIcon(row.querySelector(".recent-drop-icon"), iconSource);
    applyQualityVisuals(row.querySelector(".recent-drop-icon"), dropVisual);
    row.querySelector(".recent-drop-icon").classList.add("recent-drop-icon");
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
  if (item.stats?.critChance) rows.push(["Kritický zásah", `+${fmtNum(item.stats.critChance)} %`]);
  return rows;
}

function statSummary(item) { return statRows(item).map(([label, value]) => `${label}: ${value}`).join(" · "); }

// Non-blocking drop notification (Oprava 1). Stacks visually in the corner,
// requires no click, auto-dismisses, and never overlaps the fight controls
// or log panel (see .drop-toast-stack / .drop-toast in styles.css).
function showDropToast(item, note = null) {
  const toast = document.createElement("div");
  toast.className = "drop-toast";
  const visual = itemVisual(item);
  applyQualityVisuals(toast, visual, { surface: false });
  toast.innerHTML = `<span class="drop-toast-icon" aria-hidden="true"></span><div class="drop-toast-copy"><strong></strong><span></span></div>`;
  const icon = toast.querySelector(".drop-toast-icon");
  renderItemIcon(icon, item);
  applyQualityVisuals(icon, visual);
  icon.classList.add("drop-toast-icon");
  const nameEl = toast.querySelector("strong");
  nameEl.textContent = item.name;
  nameEl.className = "q-text";
  toast.querySelector(".drop-toast-copy span").textContent = note ?? `${qualityLabel(item.quality)} · ${SLOT_META[item.slot]?.label ?? ""}`;
  presentToast(toast);
}

// Toast for a material/scroll drop: "Získáno: Prach z křídel ×2".
function showMaterialToast(material, quantity, total, quality) {
  const toast = document.createElement("div");
  toast.className = "drop-toast";
  const visual = materialVisual(quality);
  applyQualityVisuals(toast, visual, { surface: false });
  toast.innerHTML = `<span class="drop-toast-icon" aria-hidden="true"></span><div class="drop-toast-copy"><strong></strong><span></span></div>`;
  const icon = toast.querySelector(".drop-toast-icon");
  renderItemIcon(icon, { image: material.asset });
  applyQualityVisuals(icon, visual);
  icon.classList.add("drop-toast-icon");
  const nameEl = toast.querySelector("strong");
  nameEl.textContent = `Získáno: ${material.name} ×${quantity}`;
  nameEl.className = "q-text";
  toast.querySelector(".drop-toast-copy span").textContent = `${qualityLabel(quality)} · ${MATERIAL_CATEGORY_LABELS[material.category] ?? "Materiál"} · celkem ${total}×`;
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
  const replaced = state.equipment[item.slot];
  state.inventory.splice(index, 1);
  if (replaced) state.inventory.unshift(replaced);
  item.isNew = false;
  state.equipment[item.slot] = item;
  const newMaxHp = getPlayerStats().maxHp;
  // Změna vybavení nikdy neléčí (jinak by šlo léčit přehazováním itemů) -- HP se jen ořízne na nové maximum.
  state.player.hp = Math.min(newMaxHp, state.player.hp);
  addLog(`${item.name} byl vybaven.`, item.quality === "common" ? "system" : "level-up");
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

// Stacky materiálů: jedna položka na kombinaci templateId + quality (klíč `id:quality`).
// Řazení: pořadí materiálů, uvnitř materiálu od nejvyšší kvality.
function getOwnedMaterialStacks() {
  const stacks = Object.entries(state.materials)
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => ({ key, qty, ...parseStackKey(key) }))
    .filter((stack) => MATERIALS[stack.templateId]);
  const order = (id) => { const i = MATERIAL_ORDER.indexOf(id); return i < 0 ? MATERIAL_ORDER.length : i; };
  return stacks.sort((a, b) => order(a.templateId) - order(b.templateId) || qualityRank(b.quality) - qualityRank(a.quality));
}

// Jednotný seznam pro grid: vybavení (state.inventory, omezená kapacita) a
// materiály/svitky (state.materials, stackují se, kapacitu nezabírají).
function getInventoryEntries() {
  const entries = state.inventory.map((item, index) => ({
    kind: "item", key: `item:${item.id}`, id: item.id, name: item.name, quality: item.quality, slot: item.slot,
    category: "equipment", qty: 1, order: index, iconSource: item, item, visual: itemVisual(item),
    time: item.obtainedAt ?? 0, originLocationId: item.sourceLocationId ?? null,
    value: itemSellValue(item), power: itemPower(item),
    flags: { new: item.isNew === true, favorite: item.isFavorite === true, locked: item.isLocked === true },
  }));
  getOwnedMaterialStacks().forEach((stack, index) => {
    const material = MATERIALS[stack.templateId];
    entries.push({
      kind: "material", key: `mat:${stack.key}`, id: stack.key, templateId: stack.templateId, name: material.name,
      quality: normalizeQuality(stack.quality, { stackable: true, where: "inventory" }), slot: null,
      category: material.category === "scroll" ? "scrolls" : "materials",
      qty: stack.qty, order: 1000 + index, iconSource: { image: material.asset }, visual: materialVisual(normalizeQuality(stack.quality, { stackable: true })),
      time: -1, originLocationId: material.sourceLocationId ?? null, value: 0, power: 0, flags: {},
    });
  });
  return entries;
}

function entryAriaLabel(entry) {
  const quality = qualityLabel(entry.quality);
  const slot = SLOT_META[entry.slot]?.label;
  const qty = entry.kind === "material" ? `, ${entry.qty} ks` : "";
  const flags = [entry.flags?.new ? "nové" : null, entry.flags?.favorite ? "oblíbené" : null, entry.flags?.locked ? "uzamčené" : null].filter(Boolean);
  return `${entry.name}, ${quality}${slot ? `, ${slot}` : ""}${qty}${flags.length ? `, ${flags.join(", ")}` : ""}`;
}

// Filtry typu slotu a stavu (nové / oblíbené / uzamčené) se týkají jen vybavení;
// záložky Materiály a Svitky si drží vlastní členění.
function gearFiltersApply() { return ui.tab === "all" || ui.tab === "equipment"; }

function filterEntries(entries) {
  const query = ui.search.trim().toLowerCase();
  const gear = gearFiltersApply();
  return entries.filter((entry) => {
    if (ui.tab !== "all" && entry.category !== ui.tab) return false;
    if (ui.quality !== "all" && entry.quality !== ui.quality) return false;
    if (gear && ui.type !== "all" && entry.slot !== ui.type) return false;
    if (gear && ui.flag !== "all" && !entry.flags?.[ui.flag]) return false;
    if (ui.origin !== "all" && entry.originLocationId !== ui.origin) return false;
    if (query) {
      const haystack = `${entry.name} ${SLOT_META[entry.slot]?.label ?? ""} ${qualityLabel(entry.quality)}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function sortEntries(entries) {
  const byName = (a, b) => a.name.localeCompare(b.name, "cs");
  const rank = (list, value) => { const i = list.indexOf(value); return i < 0 ? list.length : i; };
  // Materiály nemají čas získání ani prodejní hodnotu -- vždy se řadí za vybavení.
  const itemsFirst = (a, b) => (a.kind === b.kind ? 0 : a.kind === "item" ? -1 : 1);
  const sorters = {
    newest: (a, b) => itemsFirst(a, b) || (a.kind === "item" ? b.time - a.time || a.order - b.order : a.order - b.order),
    oldest: (a, b) => itemsFirst(a, b) || (a.kind === "item" ? a.time - b.time || b.order - a.order : a.order - b.order),
    quality: (a, b) => rank(QUALITY_ORDER, a.quality) - rank(QUALITY_ORDER, b.quality) || byName(a, b),
    name: byName,
    value: (a, b) => itemsFirst(a, b) || b.value - a.value || byName(a, b),
    power: (a, b) => itemsFirst(a, b) || b.power - a.power || byName(a, b),
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
    const { templateId, quality } = parseStackKey(s.id);
    const material = MATERIALS[templateId];
    if (material && state.materials[s.id] > 0) resolved = { kind: "material", id: s.id, templateId, quality: normalizeQuality(quality, { stackable: true }), material };
  }
  if (!resolved) ui.selection = null;
  return resolved;
}

const LOCK_ICON = "<svg class='px-icon' viewBox='0 0 8 8' aria-hidden='true' focusable='false'><path fill-rule='evenodd' d='M2 0h4v1H2zM2 1h1v3H2zM5 1h1v3H5zM1 4h6v4H1zM3 5h2v2H3z'/></svg>";

// Odznak s počtem neprohlédnutých itemů v navigaci (+ varování o nevyzvednuté kořisti).
function updateNavBadges() {
  const fresh = state.inventory.filter((item) => item.isNew).length;
  const waiting = state.unclaimed.length;
  $$("[data-nav-badge]").forEach((badge) => {
    const value = badge.dataset.navBadge === "new" ? fresh : waiting;
    badge.hidden = value === 0;
    const text = badge.dataset.navBadge === "new" ? String(value) : `!${value}`;
    if (badge.textContent !== text) badge.textContent = text;
    badge.title = badge.dataset.navBadge === "new" ? `${value} neprohlédnutých předmětů` : `${value} předmětů čeká na vyzvednutí`;
  });
}

function activeFilterList() {
  const list = [];
  const gear = gearFiltersApply();
  if (ui.search.trim()) list.push(["search", `Hledání: „${ui.search.trim()}“`]);
  if (gear && ui.type !== "all") list.push(["type", `Slot: ${SLOT_META[ui.type]?.label ?? ui.type}`]);
  if (ui.quality !== "all") list.push(["quality", `Quality: ${qualityLabel(ui.quality)}`]);
  if (gear && ui.flag !== "all") list.push(["flag", `Stav: ${{ new: "Nové", favorite: "Oblíbené", locked: "Uzamčené" }[ui.flag] ?? ui.flag}`]);
  if (ui.origin !== "all") list.push(["origin", `Lokace: ${LOCATIONS[ui.origin]?.name ?? ui.origin}`]);
  return list;
}

function renderActiveFilters() {
  const box = elements.invActiveFilters;
  const list = activeFilterList();
  box.classList.toggle("hidden", list.length === 0);
  box.replaceChildren();
  if (!list.length) return;
  box.append(mk("span", { class: "active-filters-label", text: "Aktivní filtry:" }));
  list.forEach(([key, label]) => box.append(mk("button", { class: "chip", type: "button", "data-clear-filter": key, "aria-label": `Zrušit filtr — ${label}`, text: `${label}  ✕` })));
  if (list.length > 1) box.append(mk("button", { class: "chip chip-clear", type: "button", "data-clear-filter": "all", text: "Zrušit všechny filtry" }));
}

function clearFilter(key) {
  if (key === "all" || key === "search") ui.search = "";
  if (key === "all" || key === "type") ui.type = "all";
  if (key === "all" || key === "quality") ui.quality = "all";
  if (key === "all" || key === "flag") ui.flag = "all";
  if (key === "all" || key === "origin") ui.origin = "all";
  syncInventoryControls();
  renderInventory();
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
  elements.inventoryCount.closest(".capacity")?.classList.toggle("full", state.inventory.length >= CONFIG.inventoryCapacity);

  const visible = sortEntries(filterEntries(entries));
  const selectedKeyValue = selectionKey();
  grid.classList.toggle("delete-mode", deleteMode);
  grid.innerHTML = "";

  visible.forEach((entry) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "inv-cell";
    applyQualityVisuals(cell, entry.visual, { surface: false });
    cell.dataset.key = entry.key;
    const marked = deleteMode && entry.kind === "item" && selectedForDeletion.has(entry.id);
    const selected = !deleteMode && entry.key === selectedKeyValue;
    const locked = deleteMode && entry.flags?.locked;
    cell.classList.toggle("selected", selected);
    cell.classList.toggle("marked", marked);
    cell.classList.toggle("protected", Boolean(locked));
    cell.setAttribute("aria-pressed", String(deleteMode ? marked : selected));
    if (locked) cell.setAttribute("aria-disabled", "true");
    cell.setAttribute("aria-label", deleteMode ? `${locked ? "Uzamčeno, nelze vybrat" : "Vybrat"}: ${entryAriaLabel(entry)}` : `${entryAriaLabel(entry)} — zobrazit detail`);
    cell.title = entry.kind === "item" ? `${entry.name} · ${qualityLabel(entry.quality)} · ${entry.value} gold` : `${entry.name} · ${qualityLabel(entry.quality)}`;
    const flags = [
      entry.flags?.new ? "<span class='flag flag-new'>NOVÉ</span>" : "",
      entry.flags?.favorite ? "<span class='flag flag-fav' title='Oblíbené'>★</span>" : "",
      entry.flags?.locked ? `<span class='flag flag-lock' title='Uzamčeno'>${LOCK_ICON}</span>` : "",
    ].join("");
    cell.innerHTML = `<span class="cell-check" aria-hidden="true"></span><span class="cell-icon" aria-hidden="true"></span>${entry.kind === "material" ? `<span class="cell-qty">×${entry.qty}</span>` : (flags ? `<span class="cell-flags" aria-hidden="true">${flags}</span>` : "")}<span class="cell-name"></span>`;
    renderItemIcon(cell.querySelector(".cell-icon"), entry.iconSource);
    applyQualityVisuals(cell.querySelector(".cell-icon"), entry.visual);
    cell.querySelector(".cell-name").textContent = entry.name;
    grid.append(cell);
  });

  // Prázdné buňky ukazují volné místo (jen na záložce VYBAVENÍ bez filtrů; s kapacitou 60 jen ukázka).
  const unfiltered = activeFilterList().length === 0;
  if (ui.tab === "equipment" && unfiltered) {
    const preview = Math.min(inventoryFreeSlots(), 8);
    for (let i = 0; i < preview; i += 1) {
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
    const filtered = activeFilterList().length > 0;
    const texts = {
      all: ["Inventář je prázdný", "Porážej nepřátele. Každý může zanechat vybavení nebo materiál."],
      equipment: ["Žádné vybavení", "Porážej nepřátele. Každý může zanechat vybavení s náhodnými vlastnostmi."],
      materials: ["Žádné materiály", "Materiály padají z nepřátel v Pustině ticha. Na mapě si u každého nepřítele otevři „Možná kořist“."],
      scrolls: ["Žádné svitky", "Svitky padají velmi vzácně z vybraných nepřátel — mrkni na „Možná kořist“ na mapě."],
    };
    const [title, text] = filtered ? ["Nic neodpovídá filtru", "Zkus upravit hledání nebo zrušit filtry."] : texts[ui.tab];
    elements.inventoryEmptyTitle.textContent = title;
    elements.inventoryEmptyText.textContent = text;
  }

  renderActiveFilters();
  renderUnclaimed();
  updateNavBadges();
  if (focusKey) grid.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

// --- Nevyzvednutá kořist (plný inventář) -------------------------------------
function renderUnclaimed() {
  const count = state.unclaimed.length;
  elements.unclaimedPanel.classList.toggle("hidden", count === 0);
  elements.unclaimedCount.textContent = count;
  if (!count) { elements.unclaimedList.replaceChildren(); return; }
  const full = inventoryFreeSlots() === 0;
  elements.claimAllButton.disabled = full;
  elements.claimAllButton.title = full ? "Inventář je plný — nejdřív uvolni místo." : "";
  const focusId = elements.unclaimedList.contains(document.activeElement) ? document.activeElement.dataset.claimId : null;
  const rows = state.unclaimed.slice(0, LOOT_CONFIG.unclaimedListPreview).map((item) => {
    const icon = mk("span", { class: "unclaimed-icon", "aria-hidden": "true" });
    renderItemIcon(icon, item);
    applyQualityVisuals(icon, itemVisual(item));
    const copy = mk("span", { class: "unclaimed-copy" },
      mk("strong", { class: qTextClass(itemVisual(item)), text: item.name }),
      mk("span", { text: `${qualityLabel(item.quality)} · ${SLOT_META[item.slot]?.label ?? ""} · síla ${fmtNum(itemPower(item))}` }));
    const row = mk("li", { class: "unclaimed-row" }, icon, copy,
      mk("button", { class: "btn", type: "button", "data-claim-id": item.id, disabled: full, text: "Přesunout" }));
    applyQualityVisuals(row, itemVisual(item), { surface: false });
    return row;
  });
  if (count > rows.length) rows.push(mk("li", { class: "unclaimed-more", text: `… a dalších ${count - rows.length} předmětů` }));
  elements.unclaimedList.replaceChildren(...rows);
  if (focusId) $(`[data-claim-id="${CSS.escape(focusId)}"]`, elements.unclaimedList)?.focus({ preventScroll: true });
}

// Přesune čekající kořist do inventáře, dokud je místo. `itemId = null` = vše, co se vejde.
function claimUnclaimed(itemId = null) {
  let moved = 0;
  const remaining = [];
  for (const item of state.unclaimed) {
    const wanted = itemId === null || item.id === itemId;
    if (wanted && state.inventory.length < CONFIG.inventoryCapacity) { state.inventory.unshift(item); moved += 1; }
    else remaining.push(item);
  }
  state.unclaimed = remaining;
  if (moved) addLog(`Z nevyzvednuté kořisti přesunuto do inventáře: ${moved} ${pluralizePredmet(moved)}.`, "system");
  else addLog("Inventář je plný — nejdřív uvolni místo.", "system");
  renderLoot(); saveState();
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
    button.className = `pd-slot${item ? " filled" : ""}`;
    if (item) applyQualityVisuals(button, itemVisual(item));
    button.classList.toggle("selected", selected);
    button.classList.toggle("compatible", compatible);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", item
      ? `${meta.label}: ${item.name}, ${qualityLabel(item.quality)} — zobrazit detail`
      : `${meta.label}: prázdný slot${compatible ? " — sem lze vybavit vybraný předmět" : ""}`);
    button.title = item ? `${item.name} · ${qualityLabel(item.quality)}` : `${meta.label} — prázdný slot`;
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

// Porovnání vybraného předmětu s předmětem nasazeným ve stejném slotu. Rozdíly se
// počítají z VÝSLEDNÝCH statů postavy po výměně (getPlayerStats s přepsaným
// vybavením), ne z textů na itemech. Nic se přitom nemění ani neléčí.
const COMPARE_ROWS = Object.freeze([
  ["Minimální poškození", "minDamage", 1, ""],
  ["Maximální poškození", "maxDamage", 1, ""],
  ["Maximální životy", "maxHp", 1, ""],
  ["Kritický zásah", "critChance", 100, " %"],
]);

function compareCard(label, item) {
  const card = mk("div", { class: `cmp-card${item ? "" : " empty"}` }, mk("span", { class: "cmp-card-label", text: label }));
  if (item) applyQualityVisuals(card, itemVisual(item), { surface: false });
  if (!item) {
    card.append(mk("strong", { class: "cmp-card-name", text: "Prázdný slot" }), mk("span", { class: "cmp-card-sub", text: "Nic není nasazeno" }));
    return card;
  }
  const icon = mk("span", { class: "cmp-card-icon", "aria-hidden": "true" });
  renderItemIcon(icon, item);
  applyQualityVisuals(icon, itemVisual(item));
  const stats = mk("ul", { class: "cmp-stats" });
  statRows(item).forEach(([name, value]) => stats.append(mk("li", {}, mk("span", { text: name }), mk("b", { text: value }))));
  card.append(
    icon,
    mk("strong", { class: `cmp-card-name ${qTextClass(itemVisual(item))}`, text: item.name }),
    mk("span", { class: "cmp-card-sub", text: `${qualityLabel(item.quality)} · síla ${fmtNum(itemPower(item))}` }),
    stats,
  );
  return card;
}

function renderCompare(item) {
  const box = elements.detailCompare;
  box.replaceChildren();
  if (!SLOT_META[item.slot]) { box.classList.add("hidden"); return; }
  const equipped = state.equipment[item.slot];
  const now = getPlayerStats();
  const next = getPlayerStats({ ...state.equipment, [item.slot]: item });
  box.append(
    mk("p", { class: "detail-compare-title", text: `Porovnání · slot ${SLOT_META[item.slot].label}` }),
    mk("div", { class: "cmp-cards" }, compareCard("Vybraný předmět", item), compareCard("Nasazeno", equipped)),
    mk("p", { class: "detail-compare-title", text: "Změna statů postavy po nasazení" }),
  );
  COMPARE_ROWS.forEach(([label, key, scale, unit]) => {
    const before = roundStat(now[key] * scale);
    const after = roundStat(next[key] * scale);
    const diff = Math.round((after - before) * 10) / 10;
    box.append(mk("div", { class: "cmp-row" },
      mk("span", { class: "cmp-label", text: label }),
      mk("span", { class: "cmp-values", text: `${fmtNum(before)}${unit} → ${fmtNum(after)}${unit}` }),
      mk("span", { class: `cmp-delta ${diff > 0 ? "up" : diff < 0 ? "down" : "same"}`, text: fmtSigned(diff, unit) })));
  });
  if (next.maxHp < now.maxHp && state.player.hp > next.maxHp) {
    box.append(mk("p", { class: "cmp-note", text: `Aktuální životy se ořežou na nové maximum (${fmtNum(next.maxHp)}). Změna vybavení nikdy neléčí.` }));
  }
  box.classList.remove("hidden");
}

function renderDetail() {
  const resolved = resolveSelection();
  const panel = elements.itemDetail;
  elements.detailEmpty.classList.toggle("hidden", Boolean(resolved));
  elements.detailBody.classList.toggle("hidden", !resolved);
  if (!resolved) { closeSheet({ restoreFocus: false }); return; }

  const isMaterial = resolved.kind === "material";
  const source = isMaterial ? resolved.material : resolved.item;
  const visual = isMaterial ? materialVisual(resolved.quality) : itemVisual(resolved.item);
  applyQualityVisuals(panel, visual, { surface: false });
  elements.detailIcon.classList.remove("material-art");
  elements.detailTitle.textContent = source.name;
  elements.detailTitle.className = `detail-title ${qTextClass(visual)}`;
  elements.detailStats.innerHTML = "";
  elements.detailMeta.innerHTML = "";
  elements.detailCompare.classList.add("hidden");
  elements.detailSecondary.classList.add("hidden");
  const action = elements.detailActionButton;
  const note = elements.detailNote;
  note.classList.add("hidden");
  action.disabled = false;

  if (isMaterial) {
    const material = resolved.material;
    const categoryLabel = MATERIAL_CATEGORY_LABELS[material.category] ?? "Materiál";
    elements.detailQuality.textContent = `${qualityLabel(resolved.quality)} · ${categoryLabel}`;
    renderItemIcon(elements.detailIcon, { image: material.asset });
    applyQualityVisuals(elements.detailIcon, visual);
    elements.detailType.textContent = categoryLabel;
    elements.detailFlavor.textContent = material.description ?? "";
    elements.detailFlavor.classList.toggle("hidden", !material.description);
    const enemyNames = material.sourceEnemyIds.map((id) => ENEMIES[id]?.name ?? id).join(", ");
    [
      ["Quality", qualityLabel(resolved.quality)],
      ["Vlastněno", `${state.materials[resolved.id] ?? 0}×`],
      ["Stackovatelné", material.stackable === false ? "Ne" : "Ano (každá quality zvlášť)"],
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
  elements.detailQuality.textContent = `${qualityLabel(item.quality)} · předmět`;
  renderItemIcon(elements.detailIcon, item);
  applyQualityVisuals(elements.detailIcon, visual);
  elements.detailType.textContent = `${SLOT_META[item.slot]?.label ?? "Ostatní"}${equippedNow ? " · právě vybaveno" : ""}`;
  statRows(item).forEach(([label, value]) => elements.detailStats.append(kvRow(label, value)));
  if (!equippedNow) renderCompare(item);

  const flavorText = item.flavorText ?? template?.flavorText ?? null;
  elements.detailFlavor.textContent = flavorText ?? "";
  elements.detailFlavor.classList.toggle("hidden", !flavorText);

  const tradeable = item.tradeable ?? template?.tradeable ?? true;
  const acquiredAt = formatAcquiredAt(item.acquiredAt);
  const metaRows = [
    ["Quality", qualityLabel(item.quality)],
    ["Slot", SLOT_META[item.slot]?.label ?? "—"],
    ["Síla itemu", fmtNum(itemPower(item))],
    ["Prodejní hodnota", `${itemSellValue(item)} gold`],
    ["Zdroj", item.source ?? "Neznámo (starší nález)"],
    ["Lokace původu", LOCATIONS[item.sourceLocationId]?.name ?? "Neznámo"],
    ["Obchodovatelné", tradeable ? "Ano" : "Ne · jedinečný nález"],
  ];
  if (item.quantity > 1) metaRows.push(["Počet kusů", `${item.quantity}×`]);
  if (acquiredAt) metaRows.push(["Získáno", acquiredAt]);
  metaRows.forEach(([label, value]) => elements.detailMeta.append(kvRow(label, value)));

  elements.detailSecondary.classList.remove("hidden");
  elements.detailFavButton.textContent = item.isFavorite ? "ODEBRAT Z OBLÍBENÝCH" : "PŘIDAT K OBLÍBENÝM";
  elements.detailFavButton.setAttribute("aria-pressed", String(Boolean(item.isFavorite)));
  elements.detailLockButton.textContent = item.isLocked ? "ODEMKNOUT" : "ZAMKNOUT";
  elements.detailLockButton.setAttribute("aria-pressed", String(Boolean(item.isLocked)));
  action.classList.remove("hidden");
  if (equippedNow) {
    action.textContent = "SUNDAT";
    if (state.inventory.length >= CONFIG.inventoryCapacity) {
      action.disabled = true;
      note.textContent = "Inventář je plný — uvolni místo, aby šel předmět sundat.";
      note.classList.remove("hidden");
    }
  } else if (SLOT_META[item.slot]) {
    action.textContent = "NASADIT";
  } else {
    action.classList.add("hidden");
  }

  // Prodej: nasazené a uzamčené předměty jsou vždy chráněné.
  const sell = elements.detailSellButton;
  const notes = note.classList.contains("hidden") ? [] : [note.textContent];
  sell.disabled = false;
  sell.textContent = `PRODAT · ${itemSellValue(item)} gold`;
  if (equippedNow) { sell.disabled = true; sell.textContent = "PRODAT"; notes.push("Nasazený předmět nelze prodat — nejdřív ho sundej."); }
  else if (item.isLocked) { sell.disabled = true; sell.textContent = "PRODAT"; notes.push("Uzamčený předmět nelze prodat — nejdřív ho odemkni."); }
  if (notes.length) { note.textContent = notes.join(" "); note.classList.remove("hidden"); }
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
    button.className = `ov-item${item ? " filled" : ""}`;
    if (item) applyQualityVisuals(button, itemVisual(item), { surface: false });
    button.dataset.slot = slot;
    button.setAttribute("aria-label", item ? `${meta.label}: ${item.name} — otevřít v inventáři` : `${meta.label}: prázdný slot`);
    button.innerHTML = `<span class="ov-icon" aria-hidden="true"></span><span class="ov-copy"><span class="ov-slot"></span><span class="ov-name"></span><span class="ov-rar"></span></span>`;
    button.querySelector(".ov-slot").textContent = meta.label;
    button.querySelector(".ov-name").textContent = item ? item.name : "Prázdný slot";
    button.querySelector(".ov-rar").textContent = item ? qualityLabel(item.quality) : "—";
    const icon = button.querySelector(".ov-icon");
    if (item) { renderItemIcon(icon, item); applyQualityVisuals(icon, itemVisual(item)); }
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
  if (ui.page === "obchodnik") renderMerchant();
  if (ui.page === "sbirka") renderCollection();
  if (ui.page === "bestiar") renderBestiary();
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
  if (kind === "item") {
    // Otevření detailu = item je prohlédnutý (zmizí značka NOVÉ).
    const item = state.inventory.find((entry) => entry.id === id);
    if (item?.isNew) { item.isNew = false; saveState(); }
  }
  selectEntity(kind === "item" ? { kind: "item", id } : { kind: "material", id }); // id materiálu = klíč stacku `templateId:quality`
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

function toggleItemFlag(flag) {
  const resolved = resolveSelection();
  if (!resolved || resolved.kind === "material") return;
  resolved.item[flag] = !resolved.item[flag];
  renderLoot(); saveState();
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
function populateOriginFilter() {
  const origins = Object.values(LOCATIONS).filter((location) => location.itemIds.length > 0 || location.materialIds.length > 0);
  elements.invOrigin.innerHTML = `<option value="all">Všechny lokace</option>${origins.map((location) => `<option value="${location.id}">${location.name}</option>`).join("")}`;
}

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
  elements.invQuality.value = ui.quality;
  elements.invFlag.value = ui.flag;
  elements.invOrigin.value = ui.origin;
  elements.invSort.value = ui.sort;
  elements.invTypeField.classList.toggle("hidden", !gearFiltersApply());
  elements.invFlagField.classList.toggle("hidden", !gearFiltersApply());
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
    if (state.running) { state.elapsedSeconds += 1; if (state.run.targetEnemyId) state.run.elapsedSeconds += 1; if (state.elapsedSeconds % 5 === 0) saveState(); render(); }
  }, 1000);
}

function toggleFight() {
  // Bez vybraného nepřítele (po vstupu do nové lokace) nelze boj spustit --
  // nejdřív se vybírá cíl.
  if (!state.run.targetEnemyId) { openEnemyPicker(); return; }
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
  ui.selectedMapLocationId = null; ui.locTab = "info"; ui.highlightEnemyId = null;
  ui.tab = "all"; ui.search = ""; ui.type = "all"; ui.quality = "all"; ui.flag = "all"; ui.origin = "all"; ui.sort = "newest";
  closeSheet({ restoreFocus: false });
  ui.merchantSelected.clear();
  setBankMessage("", "");
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
  else updateMapPins();
}

// ---------------------------------------------------------------------
// Prototype 0.5: zlato, prodej, obchodník, banka, pravidla kořisti
// ---------------------------------------------------------------------

function addCarriedGold(amount, { sale = false } = {}) {
  const gain = goldInt(amount);
  if (!gain) return 0;
  state.carriedGold += gain;
  state.stats.goldEarned += gain;
  if (sale) state.stats.goldFromSales += gain;
  return gain;
}

// Ztráta při smrti: floor(nesené zlato × 5 %). Banka se nedotýká.
function deathGoldLoss() { return Math.floor(state.carriedGold * LOOT_CONFIG.deathGoldLossRate); }

function recordItemAcquired(item) {
  state.stats.itemsFound += 1;
  if (item.sourceEnemyId) noteEnemyDrop(item.sourceEnemyId, "item", item.templateId);
  return registerInCollection(state.collection, item);
}

function pushLootLog(type, text, gold = 0) {
  state.lootLog.unshift({ at: Date.now(), type, text, gold });
  state.lootLog.length = Math.min(state.lootLog.length, LOOT_CONFIG.lootLogLimit);
}

const COIN_ICON = "<svg class='px-icon' viewBox='0 0 8 8' aria-hidden='true' focusable='false'><path d='M2 0h4v1H2zM1 1h6v6H1zM2 7h4v1H2zM3 2h2v4H3z'/></svg>";

// Neblokující oznámení bez itemu (prodej, ztráta zlata…).
function showNoticeToast(title, text, tone = "gold") {
  const toast = document.createElement("div");
  toast.className = `drop-toast notice notice-${tone}`;
  toast.innerHTML = `<span class="drop-toast-icon notice-icon" aria-hidden="true">${COIN_ICON}</span><div class="drop-toast-copy"><strong></strong><span></span></div>`;
  toast.querySelector("strong").textContent = title;
  toast.querySelector(".drop-toast-copy span").textContent = text;
  presentToast(toast);
}

// ---------------------------------------------------------------------
// Prototype 0.5: bestiář a sbírka (čistě přehled, nic se tu neodměňuje)
// ---------------------------------------------------------------------

function enemyArt(enemy, known) {
  const art = mk("span", { class: `bestiary-art${known ? "" : " unknown"}`, "aria-hidden": "true" });
  if (enemy.image) art.append(mk("img", { src: enemy.image, alt: "", loading: "lazy" }));
  else art.append(mk("span", { class: "goblin-figure" }));
  return art;
}

// Možná kořist nepřítele se bere z world-data (materialDrops + dropPool lokace), žádný druhý seznam.
function enemyLootSlots(enemy) {
  const materials = (enemy.materialDrops ?? []).map((drop) => normalizeMaterialDrop(drop, enemy.id)).filter(Boolean);
  const poolIds = enemy.dropChance > 0 ? [...(enemy.dropPool ?? [])] : [];
  const fixed = (enemy.equipmentDrops ?? []).map((drop) => normalizeEquipmentDrop(drop, enemy.id)).filter(Boolean);
  const items = [...new Set([...poolIds, ...fixed.map((drop) => drop.templateId)])].map(findTemplateById).filter(Boolean);
  return { materials, items, fixed };
}

function lootChip(known, label, { icon = null, image = null, tier = null, visual = null } = {}) {
  const chip = mk("li", { class: `loot-chip${known ? "" : " unknown"}` });
  if (known) {
    const slot = mk("span", { class: "loot-chip-icon", "aria-hidden": "true" });
    renderItemIcon(slot, image ? { image } : icon);
    if (visual) applyQualityVisuals(slot, visual);
    chip.append(slot, mk("span", { class: "loot-chip-name", text: label }));
    if (tier) chip.append(mk("span", { class: "loot-chip-tier", text: DROP_TIER_LABELS[tier] ?? "" }));
  } else {
    chip.append(mk("span", { class: "loot-chip-icon", "aria-hidden": "true", text: "?" }), mk("span", { class: "loot-chip-name", text: "???" }));
  }
  return chip;
}

function bestiaryCard(enemy) {
  const entry = state.bestiary[enemy.id];
  const known = Boolean(entry);
  const location = LOCATIONS[enemy.locationId];
  const card = mk("li", { class: `bestiary-card${known ? "" : " unknown"}`, "data-enemy-id": enemy.id });
  const head = mk("div", { class: "bestiary-head" }, enemyArt(enemy, known),
    mk("div", { class: "bestiary-title" },
      mk("strong", { text: known ? enemy.name : "???" }),
      mk("span", { text: known ? `${location?.name ?? ""} · úroveň ${enemy.level}` : `${location?.name ?? "Neznámá lokace"} · nepřítel zatím neobjeven` })));
  if (known) head.append(mk("span", { class: `tag${enemy.type === "boss" ? " danger" : ""}`, text: ENEMY_TYPE_LABELS[enemy.type] ?? "" }));
  card.append(head);
  if (!known) { card.append(mk("p", { class: "bestiary-hint", text: "Začni s tímto nepřítelem souboj a bestiář se doplní." })); return card; }

  const dl = mk("dl", { class: "bestiary-stats" });
  [["Životy", enemy.maxHp], ["Poškození", `${enemy.minDamage}–${enemy.maxDamage}`], ["Obrana", enemy.defense],
   ["Poražen", `${fmtNum(entry.kills)}×`], ["Smrtí s ním", `${fmtNum(entry.deaths)}×`]]
    .forEach(([label, value]) => dl.append(mk("div", {}, mk("dt", { text: label }), mk("dd", { text: String(value) }))));
  card.append(dl);

  if (location?.status === "preview") {
    card.append(mk("p", { class: "bestiary-hint", text: "Kořist z této lokace zatím není k dispozici (lokace je jen ukázka)." }));
    return card;
  }
  const { materials, items, fixed } = enemyLootSlots(enemy);
  const chips = mk("ul", { class: "loot-chips" });
  materials.forEach((drop) => {
    const material = MATERIALS[drop.templateId];
    const found = entry.materials.includes(drop.templateId);
    chips.append(lootChip(found, `${material.name} · ${qualityLabel(drop.quality)}`, { image: material.asset, tier: drop.tier, visual: materialVisual(drop.quality) }));
  });
  items.forEach((template) => {
    const found = entry.items.includes(template.templateId);
    const fixedQualities = fixed.filter((drop) => drop.templateId === template.templateId).map((drop) => drop.quality);
    chips.append(lootChip(found, fixedQualities.length ? `${template.name} · ${fixedQualities.map(qualityLabel).join("/")}` : template.name,
      { icon: template, visual: fixedQualities.length === 1 ? itemVisual({ quality: fixedQualities[0], slot: template.slot, icon: template.icon }) : null }));
  });
  if (chips.children.length) {
    const total = materials.length + items.length;
    const foundCount = materials.filter((d) => entry.materials.includes(d.templateId)).length + items.filter((t) => entry.items.includes(t.templateId)).length;
    card.append(mk("p", { class: "bestiary-loot-title", text: `Kořist · objeveno ${foundCount} / ${total}` }), chips);
  } else card.append(mk("p", { class: "bestiary-hint", text: "Tento nepřítel nenese žádnou kořist." }));
  return card;
}

function populateLocationSelect(select) {
  if (select.dataset.ready) return;
  Object.values(LOCATIONS).forEach((location) => select.append(mk("option", { value: location.id, text: location.name })));
  select.dataset.ready = "1";
}

function renderBestiary() {
  populateLocationSelect(elements.bestiaryLocation);
  const filter = elements.bestiaryLocation.value;
  const all = Object.values(ENEMIES);
  const shown = all.filter((enemy) => !filter || enemy.locationId === filter);
  const discovered = shown.filter((enemy) => state.bestiary[enemy.id]).length;
  elements.bestiaryProgress.textContent = `Objeveno ${discovered} / ${shown.length} nepřátel${filter ? "" : ` (celkem ${Object.keys(state.bestiary).length} / ${all.length})`}`;
  const order = Object.keys(LOCATIONS);
  shown.sort((a, b) => order.indexOf(a.locationId) - order.indexOf(b.locationId));
  elements.bestiaryList.replaceChildren(...shown.map(bestiaryCard));
}

// Šablony sbírky se berou z itemIds lokací (žádný druhý seznam); zbylé šablony patří do „Ostatní“.
function collectionTemplates() {
  const seen = new Set();
  const list = [];
  Object.values(LOCATIONS).forEach((location) => (location.itemIds ?? []).forEach((id) => {
    const template = findTemplateById(id);
    if (template && !seen.has(id)) { seen.add(id); list.push({ template, locationId: location.id }); }
  }));
  ITEM_TEMPLATES.forEach((template) => { if (!seen.has(template.templateId)) list.push({ template, locationId: null }); });
  return list;
}

function progressBar(label, done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const bar = mk("span", { class: "collect-bar-track", "aria-hidden": "true" }, mk("span", { class: "collect-bar-fill", style: `width:${pct}%` }));
  return mk("div", { class: "collect-bar", role: "group", "aria-label": `${label}: ${done} z ${total}` },
    mk("span", { class: "collect-bar-label", text: label }), bar, mk("span", { class: "collect-bar-value", text: `${done} / ${total}` }));
}

function collectionCard({ template, locationId }) {
  const entry = state.collection[template.templateId];
  const card = mk("li", { class: `collection-card${entry ? "" : " unknown"}` });
  const iconBox = mk("span", { class: "collection-icon", "aria-hidden": "true" });
  if (entry) {
    renderItemIcon(iconBox, template);
    // Ikona nese kvalitu nejlepšího získaného kusu (jedna šablona, jakákoli kvalita).
    applyQualityVisuals(iconBox, { quality: entry.best?.quality ?? DEFAULT_QUALITY, slot: template.slot, wingGlow: template.wingGlow ?? null });
  } else iconBox.append(mk("span", { class: "collection-q", text: "?" }));
  const rows = mk("dl", { class: "collection-meta" });
  const add = (label, value) => rows.append(mk("div", {}, mk("dt", { text: label }), mk("dd", { text: value })));
  if (entry) {
    add("Získáno", `${fmtNum(entry.count)}×`);
    if (entry.best) add("Nejlepší kus", `${qualityLabel(entry.best.quality)} · síla ${fmtNum(entry.best.power)}`);
    add("Poprvé", `${LOCATIONS[entry.firstLocationId]?.name ?? "Neznámo"} · ${ENEMIES[entry.firstEnemyId]?.name ?? "Neznámý nepřítel"}`);
    const when = formatAcquiredAt(entry.firstAt);
    if (when) add("Kdy", when);
  } else add("Stav", "Zatím nezískáno");
  card.append(iconBox, mk("div", { class: "collection-copy" },
    mk("strong", { text: entry ? template.name : "???" }),
    mk("span", { text: `${SLOT_META[template.slot]?.label ?? ""} · ${locationId ? LOCATIONS[locationId].name : "Ostatní"}` }), rows));
  return card;
}

function renderCollection() {
  populateLocationSelect(elements.collectionLocation);
  const all = collectionTemplates();
  const owned = (entry) => Boolean(state.collection[entry.template.templateId]);
  const overview = [progressBar("Předměty celkem", all.filter(owned).length, all.length),
    progressBar("Nepřátelé objeveni", Object.keys(state.bestiary).length, Object.keys(ENEMIES).length)];
  Object.values(LOCATIONS).forEach((location) => {
    const items = all.filter((entry) => entry.locationId === location.id);
    const enemies = location.enemyIds.filter((id) => ENEMIES[id]);
    overview.push(mk("div", { class: "collect-loc" }, mk("h3", { text: location.name }),
      progressBar("Předměty", items.filter(owned).length, items.length),
      progressBar("Nepřátelé", enemies.filter((id) => state.bestiary[id]).length, enemies.length)));
  });
  const other = all.filter((entry) => !entry.locationId);
  if (other.length) overview.push(mk("div", { class: "collect-loc" }, mk("h3", { text: "Ostatní" }), progressBar("Předměty", other.filter(owned).length, other.length)));
  elements.collectionOverview.replaceChildren(...overview);

  const filter = elements.collectionLocation.value;
  const shown = all.filter((entry) => !filter || entry.locationId === filter);
  elements.collectionProgress.textContent = `Získáno ${shown.filter(owned).length} / ${shown.length} druhů předmětů`;
  elements.collectionList.replaceChildren(...(shown.length ? shown.map(collectionCard)
    : [mk("li", { class: "bestiary-hint", text: "V této lokaci zatím žádná kořist neexistuje." })]));
}

// --- Prodej ---------------------------------------------------------------
function saleSummary(ids) {
  const wanted = new Set(ids);
  const items = state.inventory.filter((item) => wanted.has(item.id) && !item.isLocked);
  const byQuality = {};
  let total = 0;
  items.forEach((item) => { byQuality[item.quality] = (byQuality[item.quality] ?? 0) + 1; total += itemSellValue(item); });
  return {
    items, count: items.length, total, byQuality,
    hasFavorite: items.some((item) => item.isFavorite),
    hasRareOrEpic: items.some((item) => qualityRank(item.quality) >= qualityRank("rare")),
  };
}

function qualityBreakdown(byQuality) {
  const parts = QUALITY_ORDER.filter((key) => byQuality[key]).map((key) => `${qualityLabel(key)} ×${byQuality[key]}`);
  return parts.length ? parts.join(" · ") : "—";
}

// Ruční prodej. Uzamčené a nenalezené itemy se tiše přeskočí; nasazené v inventáři vůbec nejsou.
function performSale(ids) {
  const summary = saleSummary(ids);
  if (!summary.count) return null;
  const doomed = new Set(summary.items.map((item) => item.id));
  state.inventory = state.inventory.filter((item) => !doomed.has(item.id));
  addCarriedGold(summary.total, { sale: true });
  const now = Date.now();
  summary.items.forEach((item) => state.buyback.unshift({ item, price: itemSellValue(item), soldAt: now }));
  state.buyback.length = Math.min(state.buyback.length, LOOT_CONFIG.buybackLimit);
  const text = summary.count === 1
    ? `Prodáno: ${summary.items[0].name} za ${fmtGold(summary.total)} gold.`
    : `Prodáno ${summary.count} ${pluralizePredmet(summary.count)} za ${fmtGold(summary.total)} gold.`;
  addLog(text, "victory");
  pushLootLog("sale", text, summary.total);
  showNoticeToast(summary.count === 1 ? `Prodáno: ${summary.items[0].name}` : `Prodáno ${summary.count} ${pluralizePredmet(summary.count)}`, `+${fmtGold(summary.total)} gold`, "gold");
  doomed.forEach((id) => { selectedForDeletion.delete(id); ui.merchantSelected.delete(id); });
  if (deleteMode) setDeleteMode(false);
  render(); renderLoot(); saveState();
  return summary;
}

// Jeden běžný předmět se prodá hned (jde ho odkoupit zpět); víc kusů, vzácný/epický
// nebo oblíbený item vždy projde potvrzením s celkovou cenou.
function requestSale(ids) {
  const summary = saleSummary(ids);
  if (!summary.count) return;
  if (summary.count === 1 && !summary.hasFavorite && !summary.hasRareOrEpic) { performSale(ids); return; }
  openBulkDialog("sell", ids);
}

let pendingBulk = null;
function openBulkDialog(mode, ids) {
  const summary = saleSummary(ids);
  if (!summary.count) return;
  const isSell = mode === "sell";
  pendingBulk = { mode, ids: summary.items.map((item) => item.id) };
  elements.sellDialogEyebrow.textContent = isSell ? "Potvrzení prodeje" : "Potvrzení smazání";
  elements.sellDialogTitle.textContent = `${isSell ? "Prodat" : "Smazat"} ${summary.count} ${pluralizePredmet(summary.count)}?`;
  elements.sellDialogSummary.textContent = qualityBreakdown(summary.byQuality);
  elements.sellDialogTotal.textContent = isSell
    ? `Výkup celkem: ${fmtGold(summary.total)} gold`
    : "Za smazané předměty nedostaneš zlato a nelze je odkoupit zpět.";
  const warnings = [];
  if (summary.hasRareOrEpic) warnings.push(`Výběr obsahuje předměty kvality RARE nebo vyšší (${summary.items.filter((item) => qualityRank(item.quality) >= qualityRank("rare")).length}×).`);
  if (summary.hasFavorite) warnings.push(`Výběr obsahuje oblíbený předmět (${summary.items.filter((item) => item.isFavorite).length}×).`);
  elements.sellDialogWarnings.replaceChildren(...warnings.map((text) => mk("li", { text })));
  elements.sellConfirm.textContent = isSell ? "Prodat" : "Smazat";
  elements.sellConfirm.className = `btn ${isSell ? "btn-primary" : "btn-danger"}`;
  elements.sellDialog.showModal();
}

function confirmBulkDialog() {
  const pending = pendingBulk;
  pendingBulk = null;
  elements.sellDialog.close();
  if (!pending) return;
  if (pending.mode === "sell") { performSale(pending.ids); if (mqSheet.matches) closeSheet(); }
  else performDelete(pending.ids);
}

// --- Automatický prodej -------------------------------------------------------
// Bezpečnostní pravidla: jen BĚŽNÉ vybavení, nikdy první získání šablony, nikdy
// oblíbené/uzamčené. Nasazené itemy se do tohoto toku nikdy nedostanou (jde o čerstvý drop).
function ruleAllowsAutoSell(item, firstOfTemplate) {
  const rules = state.lootRules;
  return rules.autoSellCommon && item.quality === "common" && rules.slots[item.slot] !== false
    && !firstOfTemplate && !item.isFavorite && !item.isLocked;
}

function autoSellDrop(item) {
  const price = itemSellValue(item);
  addCarriedGold(price, { sale: true });
  const text = `Automaticky prodáno: ${item.name} za ${fmtGold(price)} gold.`;
  addLog(text, "system");
  pushLootLog("auto", text, price);
  showNoticeToast("Automatický prodej", `${item.name} · +${fmtGold(price)} gold`, "gold");
  if (ui.page === "obchodnik") renderMerchant();
}

// --- Zpětný odkup ----------------------------------------------------------
function buyBack(itemId) {
  const index = state.buyback.findIndex((entry) => entry.item.id === itemId);
  if (index < 0) return;
  const entry = state.buyback[index];
  if (inventoryFreeSlots() === 0) { addLog("Inventář je plný — na zpětný odkup není místo.", "system"); renderMerchant(); return; }
  if (state.carriedGold < entry.price) { addLog(`Na zpětný odkup chybí zlato (potřebuješ ${fmtGold(entry.price)}).`, "system"); renderMerchant(); return; }
  state.carriedGold -= entry.price;
  state.buyback.splice(index, 1);
  entry.item.isNew = false;
  state.inventory.unshift(entry.item);
  const text = `Odkoupeno zpět: ${entry.item.name} za ${fmtGold(entry.price)} gold.`;
  addLog(text, "system");
  pushLootLog("buyback", text, -entry.price);
  showNoticeToast(`Odkoupeno: ${entry.item.name}`, `−${fmtGold(entry.price)} gold`, "gold");
  render(); renderLoot(); saveState();
}

// --- Stránka Obchodník --------------------------------------------------------
function merchantSellable() {
  const rank = (item) => QUALITY_ORDER.indexOf(item.quality);
  return state.inventory.filter((item) => !item.isLocked).sort((a, b) =>
    rank(a) - rank(b) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.name.localeCompare(b.name, "cs") || (b.obtainedAt ?? 0) - (a.obtainedAt ?? 0));
}

function updateMerchantSummary() {
  const summary = saleSummary([...ui.merchantSelected]);
  elements.merchantCount.textContent = summary.count;
  elements.merchantBreakdown.textContent = qualityBreakdown(summary.byQuality);
  elements.merchantTotal.textContent = fmtGold(summary.total);
  elements.merchantSell.disabled = summary.count === 0;
  $$(".merchant-row", elements.merchantList).forEach((row) => row.classList.toggle("selected", ui.merchantSelected.has(row.dataset.id)));
}

function renderMerchantSell() {
  const sellable = merchantSellable();
  const valid = new Set(sellable.map((item) => item.id));
  [...ui.merchantSelected].forEach((id) => { if (!valid.has(id)) ui.merchantSelected.delete(id); });
  const list = elements.merchantList;
  const focusId = list.contains(document.activeElement) ? document.activeElement.dataset.sellId : null;
  list.replaceChildren(...sellable.map((item) => {
    const icon = mk("span", { class: "merchant-icon", "aria-hidden": "true" });
    renderItemIcon(icon, item);
    applyQualityVisuals(icon, itemVisual(item));
    const flags = [item.isNew ? "NOVÉ" : null, item.isFavorite ? "★ oblíbené" : null].filter(Boolean).join(" · ");
    const box = mk("input", { type: "checkbox", "data-sell-id": item.id, "aria-label": `Označit k prodeji: ${item.name}, ${itemSellValue(item)} gold` });
    box.checked = ui.merchantSelected.has(item.id);
    const sellRow = mk("li", { class: "merchant-row", "data-id": item.id },
      mk("label", {}, box, icon,
        mk("span", { class: "merchant-copy" },
          mk("strong", { class: qTextClass(itemVisual(item)), text: item.name }),
          mk("span", { text: `${qualityLabel(item.quality)} · ${SLOT_META[item.slot]?.label ?? ""} · síla ${fmtNum(itemPower(item))}${flags ? ` · ${flags}` : ""}` })),
        mk("span", { class: "merchant-price", text: `${fmtGold(itemSellValue(item))} gold` })));
    applyQualityVisuals(sellRow, itemVisual(item), { surface: false });
    return sellRow;
  }));
  if (focusId) $(`[data-sell-id="${CSS.escape(focusId)}"]`, list)?.focus({ preventScroll: true });
  elements.merchantEmpty.classList.toggle("hidden", sellable.length > 0);
  const locked = state.inventory.filter((item) => item.isLocked).length;
  const favorites = sellable.filter((item) => item.isFavorite).length;
  const equipped = Object.values(state.equipment).filter(Boolean).length;
  elements.merchantProtected.textContent = `Chráněno před prodejem: ${equipped} nasazených, ${locked} uzamčených. Oblíbené (${favorites}) se nikdy nevybírají automaticky.`;
  updateMerchantSummary();
}

function renderBuyback() {
  const list = elements.buybackList;
  elements.buybackCount.textContent = state.buyback.length;
  if (!state.buyback.length) { list.replaceChildren(mk("li", { class: "buyback-empty", text: "Zatím jsi nic neprodal." })); return; }
  const full = inventoryFreeSlots() === 0;
  list.replaceChildren(...state.buyback.map((entry) => {
    const icon = mk("span", { class: "merchant-icon", "aria-hidden": "true" });
    renderItemIcon(icon, entry.item);
    applyQualityVisuals(icon, itemVisual(entry.item));
    const poor = state.carriedGold < entry.price;
    const reason = full ? "Inventář je plný" : poor ? "Nedostatek zlata" : "";
    const backRow = mk("li", { class: "merchant-row buyback-row" }, icon,
      mk("span", { class: "merchant-copy" },
        mk("strong", { class: qTextClass(itemVisual(entry.item)), text: entry.item.name }),
        mk("span", { text: `${qualityLabel(entry.item.quality)} · ${SLOT_META[entry.item.slot]?.label ?? ""}${reason ? ` · ${reason}` : ""}` })),
      mk("button", { class: "btn", type: "button", "data-buyback-id": entry.item.id, disabled: full || poor, title: reason, text: `Odkoupit · ${fmtGold(entry.price)}` }));
    applyQualityVisuals(backRow, itemVisual(entry.item), { surface: false });
    return backRow;
  }));
}

function buildRuleSlots() {
  const fieldset = elements.ruleSlots;
  SLOT_ORDER.forEach((slot) => {
    const box = mk("input", { type: "checkbox", "data-rule-slot": slot });
    fieldset.append(mk("label", { class: "rule-slot" }, box, mk("span", { text: SLOT_META[slot].label })));
  });
  elements.merchantSlot.innerHTML = `<option value="">Vyber slot…</option>${SLOT_ORDER.map((slot) => `<option value="${slot}">${SLOT_META[slot].label}</option>`).join("")}`;
}

function renderRules() {
  const rules = state.lootRules;
  elements.ruleAutoSell.checked = rules.autoSellCommon;
  elements.autoSellState.textContent = rules.autoSellCommon ? "ZAPNUTO" : "VYPNUTO";
  elements.autoSellState.classList.toggle("on", rules.autoSellCommon);
  elements.ruleSlots.disabled = !rules.autoSellCommon;
  $$("[data-rule-slot]", elements.ruleSlots).forEach((box) => { box.checked = rules.slots[box.dataset.ruleSlot] !== false; });
}

function renderLootLog() {
  const list = elements.lootLogList;
  if (!state.lootLog.length) { list.replaceChildren(mk("li", { class: "loot-log-empty", text: "Zatím žádné prodeje ani odkupy." })); return; }
  list.replaceChildren(...state.lootLog.map((entry) => {
    const time = mk("time", { text: new Date(entry.at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
    const gold = entry.gold ? mk("b", { class: entry.gold > 0 ? "up" : "down", text: `${entry.gold > 0 ? "+" : "−"}${fmtGold(Math.abs(entry.gold))}` }) : null;
    return mk("li", { class: `loot-log-entry ${entry.type}` }, time, mk("span", { text: entry.text }), gold);
  }));
}

function renderMerchant() {
  renderMerchantSell();
  renderBuyback();
  renderRules();
  renderLootLog();
}

// --- Banka ---------------------------------------------------------------------
function parseGoldAmount(text) {
  const raw = String(text ?? "").trim().replace(/\s+/g, "");
  if (!raw) return { ok: false, message: "Zadej částku." };
  if (/^-/.test(raw)) return { ok: false, message: "Částka nemůže být záporná." };
  if (/^\d*[.,]\d*$/.test(raw) && /\d/.test(raw)) return { ok: false, message: "Zadej celé číslo — desetinné částky nejsou povolené." };
  if (!/^\d+$/.test(raw)) return { ok: false, message: "Zadej celé kladné číslo." };
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return { ok: false, message: "Částka je příliš vysoká." };
  if (value === 0) return { ok: false, message: "Částka musí být větší než nula." };
  return { ok: true, value };
}

function setBankMessage(text, kind) {
  elements.bankMessage.textContent = text;
  elements.bankMessage.dataset.kind = kind;
}

function bankTransfer(direction, all = false) {
  const deposit = direction === "deposit";
  const source = deposit ? state.carriedGold : state.bankGold;
  let amount;
  if (all) {
    if (source <= 0) { setBankMessage(deposit ? "Nemáš u sebe žádné zlato." : "V bance nemáš žádné zlato.", "error"); return; }
    amount = source;
  } else {
    const parsed = parseGoldAmount(elements.bankAmount.value);
    if (!parsed.ok) { setBankMessage(parsed.message, "error"); return; }
    if (parsed.value > source) { setBankMessage(deposit ? `U sebe máš jen ${fmtGold(source)} gold.` : `V bance je jen ${fmtGold(source)} gold.`, "error"); return; }
    amount = parsed.value;
  }
  if (deposit) { state.carriedGold -= amount; state.bankGold += amount; }
  else { state.bankGold -= amount; state.carriedGold += amount; }
  const text = deposit ? `Do banky uloženo ${fmtGold(amount)} gold.` : `Z banky vybráno ${fmtGold(amount)} gold.`;
  setBankMessage(text, "ok");
  addLog(text, "system");
  elements.bankAmount.value = "";
  render(); saveState(); // boj se tím nezastavuje ani nerestartuje
}

// --- Mapa světa, detail lokace a vstup do lokace -----------------------
//
// Dvě oddělené věci: `ui.selectedMapLocationId` = jen prohlížená lokace
// (náhled) a `state.activeLocationId` = lokace, kde hráč skutečně farmí.
// Výběr bodu na mapě, otevření detailu, záložky ani zvýraznění nepřítele
// nesahají na `state` ani na boj. Změna nastane až v enterLocation() /
// chooseTarget() po explicitním potvrzení. Herní smyčka (startLoops) je pořád
// jediná, takže tu nevzniká žádný další interval.

const mqLocSheet = window.matchMedia("(max-width: 1099px)");
const LOC_TABS = Object.freeze([["info", "Informace"], ["enemies", "Nepřátelé"], ["loot", "Kořist"]]);
let mapStageReady = false;
let pendingEnterId = null;

function mk(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

function canEnterLocation(location) { return location.status === "available" && location.enemyIds.length > 0; }
function hasActiveFarming() {
  const run = state.run;
  return Boolean(run.targetEnemyId) && (state.running || run.kills > 0 || run.elapsedSeconds > 0 || state.phase !== "ready");
}
function locationStatusText(location) { return LOCATION_STATUS_LABELS[location.status] ?? ""; }

function ensureMapStage() {
  if (mapStageReady) return;
  mapStageReady = true;
  elements.worldMapImg.src = WORLD_MAP.src;
  elements.worldMapImg.alt = WORLD_MAP.alt;
  elements.worldMapImg.width = WORLD_MAP.width;
  elements.worldMapImg.height = WORLD_MAP.height;
  elements.worldMap.style.aspectRatio = `${WORLD_MAP.width} / ${WORLD_MAP.height}`;
  elements.mapTempNote.hidden = !WORLD_MAP.temporary;
  // Body se generují z dat; pozice jsou v % vůči mapě, takže zůstanou na místě při každé velikosti.
  Object.values(LOCATIONS).forEach((location) => {
    const pin = mk("button", { class: "map-pin", type: "button", "data-location-id": location.id });
    pin.style.left = `${location.mapPosition.x}%`;
    pin.style.top = `${location.mapPosition.y}%`;
    pin.dataset.side = location.mapPosition.x > 68 ? "left" : "right";
    pin.append(
      mk("span", { class: "pin-mark", "aria-hidden": "true" }),
      mk("span", { class: "pin-label", "aria-hidden": "true" },
        mk("span", { class: "pin-name", text: location.name }),
        mk("span", { class: "pin-meta", text: `Lv ${location.recommendedLevel}` }),
        mk("span", { class: "pin-active" })),
    );
    elements.mapPins.append(pin);
  });
}

function updateMapPins() {
  if (!mapStageReady) return;
  $$(".map-pin", elements.mapPins).forEach((pin) => {
    const location = LOCATIONS[pin.dataset.locationId];
    const selected = ui.selectedMapLocationId === location.id;
    const active = state.activeLocationId === location.id;
    pin.classList.toggle("selected", selected);
    pin.classList.toggle("active", active);
    pin.classList.toggle("soon", location.status !== "available");
    pin.setAttribute("aria-pressed", String(selected));
    pin.setAttribute("aria-label", `${location.name}, doporučený level ${location.recommendedLevel}, ${locationStatusText(location)}${active ? ", aktuální lokace" : ""}`);
    $(".pin-active", pin).textContent = active ? "AKTUÁLNÍ LOKACE" : "";
  });
}

function showMapTooltip(pin) {
  const location = LOCATIONS[pin.dataset.locationId];
  const tip = elements.mapTooltip;
  tip.replaceChildren(
    mk("strong", { text: location.name }),
    mk("span", { text: `Doporučený level ${location.recommendedLevel}` }),
    mk("span", { class: "tip-status", text: locationStatusText(location) }),
  );
  const { x, y } = location.mapPosition;
  tip.style.left = `${x}%`;
  tip.style.top = `${y}%`;
  tip.dataset.edge = x < 16 ? "left" : x > 84 ? "right" : "";
  tip.dataset.below = y < 22 ? "true" : "false";
  tip.hidden = false;
}
function hideMapTooltip() { elements.mapTooltip.hidden = true; }

let mapCentered = false;
function renderMapPage() {
  ensureMapStage();
  updateMapPins();
  renderLocationDetail();
  // Na úzkém displeji je mapa posuvná uvnitř viewportu -- poprvé ji vycentrujeme na aktivní lokaci.
  if (!mapCentered) {
    mapCentered = true;
    const scroller = elements.worldMap.parentElement;
    const position = LOCATIONS[state.activeLocationId]?.mapPosition;
    if (position && scroller.scrollWidth > scroller.clientWidth) {
      scroller.scrollLeft = (position.x / 100) * scroller.scrollWidth - scroller.clientWidth / 2;
    }
  }
}

function getLocationEnemies(location) { return location.enemyIds.map((id) => ENEMIES[id]).filter(Boolean); }

// Kořist lokace rozdělená do skupin. Bez procent a vah -- jen co v lokaci padat může.
function getLocationLootGroups(location) {
  const bossIds = new Set(location.bossIds);
  const enemies = location.enemyIds.map((id) => ENEMIES[id]).filter(Boolean);
  const materials = location.materialIds.map((id) => MATERIALS[id]).filter(Boolean);
  const bossOnly = (material) => material.sourceEnemyIds.length > 0 && material.sourceEnemyIds.every((id) => bossIds.has(id));
  // Jeden řádek na kombinaci materiál + kvalita, ve které v lokaci padá (z drop tabulek).
  const materialRows = (material, type) => {
    const qualities = [...new Set(enemies.flatMap((enemy) => (enemy.materialDrops ?? [])
      .map((drop) => normalizeMaterialDrop(drop, enemy.id)).filter((drop) => drop?.templateId === material.id).map((drop) => drop.quality)))];
    return (qualities.length ? qualities : [normalizeQuality(material.defaultQuality, { stackable: true })])
      .sort((a, b) => qualityRank(b) - qualityRank(a))
      .map((quality) => ({ icon: { image: material.asset }, name: material.name, quality, visual: materialVisual(quality), type }));
  };
  const equipment = location.itemIds
    .map((iconKey) => ITEM_TEMPLATES.find((template) => template.icon === iconKey))
    .filter(Boolean)
    .map((template) => ({ icon: template, name: template.name, quality: null, visual: null, type: `Vybavení · ${SLOT_META[template.slot]?.label ?? ""}` }));
  // Pevné dropy z `equipmentDrops` (šablona v konkrétní kvalitě).
  const seenFixed = new Set();
  enemies.forEach((enemy) => (enemy.equipmentDrops ?? []).forEach((raw) => {
    const drop = normalizeEquipmentDrop(raw, enemy.id);
    const key = drop && `${drop.templateId}:${drop.quality}`;
    if (!drop || seenFixed.has(key)) return;
    seenFixed.add(key);
    const template = findTemplateById(drop.templateId);
    equipment.push({ icon: template, name: template.name, quality: drop.quality, visual: itemVisual({ quality: drop.quality, slot: template.slot, icon: template.icon }), type: `Vybavení · ${SLOT_META[template.slot]?.label ?? ""}` });
  }));
  const rowsOf = (list, type) => list.flatMap((material) => materialRows(material, typeFor(material, type)));
  const typeFor = (material, type) => (typeof type === "function" ? type(material) : type);
  return [
    ["Vybavení", equipment],
    ["Materiály", rowsOf(materials.filter((m) => m.category === "material" && !bossOnly(m)), "Materiál")],
    ["Svitky", rowsOf(materials.filter((m) => m.category === "scroll" && !bossOnly(m)), "Svitek")],
    ["Unikátní boss itemy", rowsOf(materials.filter(bossOnly), (m) => (m.category === "scroll" ? "Svitek" : "Boss materiál"))],
  ].filter(([, rows]) => rows.length);
}

function renderInfoPanel(location, isActive) {
  const enemies = getLocationEnemies(location);
  const bosses = location.bossIds.map((id) => ENEMIES[id]?.name).filter(Boolean);
  const list = mk("div", { class: "kv-list" });
  list.append(
    kvRow("Doporučený level", String(location.recommendedLevel)),
    kvRow("Stav", locationStatusText(location)),
    kvRow("Nepřátelé", String(enemies.length)),
  );
  if (bosses.length) list.append(kvRow(bosses.length > 1 ? "Bossové" : "Boss", bosses.join(", ")));
  return [
    isActive ? mk("p", { class: "ld-current", text: "AKTUÁLNÍ LOKACE" }) : null,
    mk("p", { class: "ld-desc", text: location.shortDescription }),
    list,
  ];
}

function renderEnemiesPanel(location, isActive) {
  const enemies = getLocationEnemies(location);
  const canPick = isActive && canEnterLocation(location);
  const nodes = [];
  if (canPick && !state.run.targetEnemyId) nodes.push(mk("p", { class: "ld-banner", text: "VYBER NEPŘÍTELE — automatický boj začne až po výběru cíle." }));
  else if (canPick) nodes.push(mk("p", { class: "ld-hint", text: "Výběrem jiného nepřítele začneš nové farmení." }));
  else if (canEnterLocation(location)) nodes.push(mk("p", { class: "ld-hint", text: "Nepřítele si vybereš po vstupu do lokace." }));
  if (!enemies.length) { nodes.push(mk("p", { class: "ld-hint", text: "V lokaci zatím nejsou žádní nepřátelé." })); return nodes; }
  const list = mk("ul", { class: "ld-enemies" });
  enemies.forEach((enemy) => {
    const art = mk("span", { class: "ld-enemy-art", "aria-hidden": "true" });
    if (enemy.image) art.append(mk("img", { src: enemy.image, alt: "", loading: "lazy" }));
    else art.append(mk("span", { class: "goblin-figure" }));
    const copy = mk("span", { class: "ld-enemy-copy" },
      mk("strong", { text: enemy.name }),
      mk("span", { text: `Úroveň ${enemy.level}` }));
    const row = mk("li", { class: "ld-enemy-row" });
    const inspect = mk("button", {
      class: "ld-enemy", type: "button", "data-enemy-id": enemy.id, "data-focus-key": `enemy-${enemy.id}`,
      "aria-pressed": String(ui.highlightEnemyId === enemy.id),
    }, art, copy, enemy.type === "boss" ? mk("span", { class: "tag danger", text: "BOSS" }) : null);
    row.append(inspect);
    if (canPick) {
      if (state.run.targetEnemyId === enemy.id) row.append(mk("span", { class: "tag ld-target-tag", text: "AKTIVNÍ CÍL" }));
      else row.append(mk("button", { class: "btn btn-primary ld-pick", type: "button", "data-enemy-id": enemy.id, "data-focus-key": `pick-${enemy.id}`, text: "Vybrat cíl" }));
    }
    list.append(row);
  });
  nodes.push(list);
  return nodes;
}

function renderLootPanel(location) {
  const groups = getLocationLootGroups(location);
  if (!groups.length) return [mk("p", { class: "ld-hint", text: "Zatím není evidovaná žádná kořist." })];
  const nodes = [mk("p", { class: "ld-hint", text: "Možná kořist lokace. Přesné šance na drop zatím nejsou určené." })];
  groups.forEach(([title, rows]) => {
    nodes.push(mk("h3", { class: "ld-group", text: `${title} (${rows.length})` }));
    const list = mk("ul", { class: "ld-loot" });
    rows.forEach((row) => {
      const icon = mk("span", { class: "map-loot-icon", "aria-hidden": "true" });
      renderItemIcon(icon, row.icon);
      if (row.visual) applyQualityVisuals(icon, row.visual);
      const name = mk("strong", { text: row.name, class: row.visual ? qTextClass(row.visual) : "" });
      const type = mk("span", { text: row.quality ? `${qualityLabel(row.quality)} · ${row.type}` : row.type });
      const li = mk("li", { class: "map-loot-row" }, icon, mk("span", { class: "map-loot-copy" }, name, type));
      if (row.visual) applyQualityVisuals(li, row.visual, { surface: false });
      list.append(li);
    });
    nodes.push(list);
  });
  return nodes;
}

function renderLocationDetail() {
  const root = elements.locDetail;
  const focusKey = root.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
  const location = LOCATIONS[ui.selectedMapLocationId];
  root.replaceChildren();
  root.classList.toggle("has-selection", Boolean(location));
  if (!location) {
    root.append(mk("div", { class: "ld-empty" },
      mk("p", { class: "eyebrow", text: "Náhled lokace" }),
      mk("p", { text: "Vyber bod na mapě. Zobrazí se náhled lokace, její nepřátelé a možná kořist." }),
      mk("p", { class: "muted", text: "Prohlížení mapy současný boj nezastaví." })));
    syncLocationSheet();
    return;
  }
  const isActive = state.activeLocationId === location.id;
  const hero = mk("div", { class: "ld-hero" });
  if (location.backgroundAsset) {
    const image = mk("img", { class: "ld-hero-img", src: location.backgroundAsset, alt: "", decoding: "async" });
    image.addEventListener("error", () => { image.remove(); hero.classList.add("missing"); });
    hero.append(image);
  } else hero.classList.add("missing");
  hero.append(
    mk("span", { class: "ld-hero-note", text: "Background lokace zatím není dodán" }),
    mk("div", { class: "ld-hero-shade" }),
    mk("h2", { class: "ld-title", id: "ldTitle", tabindex: "-1", text: location.name }),
  );
  root.append(
    mk("div", { class: "ld-topbar" }, mk("button", { class: "btn ld-close", type: "button", "data-focus-key": "close", text: "✕ Zavřít" })),
    hero,
  );
  const tabs = mk("div", { class: "ld-tabs", role: "tablist", "aria-label": "Detail lokace" });
  LOC_TABS.forEach(([key, label]) => {
    tabs.append(mk("button", {
      class: "ld-tab", type: "button", role: "tab", id: `ld-tab-${key}`, "data-tab": key, "data-focus-key": `tab-${key}`,
      "aria-selected": String(ui.locTab === key), "aria-controls": "ld-tabpanel", tabindex: ui.locTab === key ? "0" : "-1", text: label,
    }));
  });
  const panelNodes = ui.locTab === "enemies" ? renderEnemiesPanel(location, isActive)
    : ui.locTab === "loot" ? renderLootPanel(location) : renderInfoPanel(location, isActive);
  const panel = mk("div", { class: "ld-tabpanel", role: "tabpanel", id: "ld-tabpanel", "aria-labelledby": `ld-tab-${ui.locTab}`, tabindex: "0" }, ...panelNodes);
  const footer = mk("div", { class: "ld-footer" });
  if (canEnterLocation(location)) {
    footer.append(mk("button", {
      class: "btn btn-primary btn-lg ld-enter", type: "button", "data-focus-key": "enter",
      text: isActive ? "Vrátit se do lokace" : "Vstoupit do lokace",
    }));
  } else {
    footer.append(
      mk("p", { class: "ld-note", id: "ldNote", text: "PŘIPRAVUJE SE — do lokace zatím nelze vstoupit, chybí herní obsah." }),
      mk("button", { class: "btn btn-lg ld-enter", type: "button", disabled: true, "aria-describedby": "ldNote", text: "Vstoupit do lokace" }),
    );
  }
  root.append(tabs, panel, footer);
  syncLocationSheet();
  if (focusKey) $(`[data-focus-key="${focusKey}"]`, root)?.focus({ preventScroll: true });
}

function syncLocationSheet() {
  const open = mqLocSheet.matches && Boolean(ui.selectedMapLocationId);
  elements.locDetail.classList.toggle("sheet-open", open);
  document.body.classList.toggle("loc-open", open);
}

function selectMapLocation(locationId, { moveFocus = true } = {}) {
  if (!LOCATIONS[locationId]) return;
  const changed = ui.selectedMapLocationId !== locationId;
  ui.selectedMapLocationId = locationId;
  if (changed) { ui.locTab = "info"; ui.highlightEnemyId = null; }
  hideMapTooltip();
  updateMapPins();
  renderLocationDetail();
  if (moveFocus) $("#ldTitle", elements.locDetail)?.focus({ preventScroll: true });
}

function closeLocationDetail({ restoreFocus = true } = {}) {
  const previous = ui.selectedMapLocationId;
  if (!previous) return;
  ui.selectedMapLocationId = null;
  ui.highlightEnemyId = null;
  updateMapPins();
  renderLocationDetail();
  if (restoreFocus) $(`.map-pin[data-location-id="${previous}"]`, elements.mapPins)?.focus({ preventScroll: true });
}

function setLocationTab(tab, { focusTab = true } = {}) {
  if (!LOC_TABS.some(([key]) => key === tab)) return;
  ui.locTab = tab;
  renderLocationDetail();
  if (focusTab) $(`#ld-tab-${tab}`, elements.locDetail)?.focus({ preventScroll: true });
}

// Otevře výběr nepřítele v aktivní lokaci (např. tlačítko Boj bez cíle).
function openEnemyPicker() {
  ui.selectedMapLocationId = state.activeLocationId;
  ui.locTab = "enemies";
  navigate("mapa");
  if (ui.page === "mapa") renderMapPage();
}

function requestEnterLocation(locationId) {
  const location = LOCATIONS[locationId];
  if (!location || !canEnterLocation(location)) return;
  // Stejná lokace: nic se neresetuje, jen se vrátíme k boji (nebo k výběru cíle).
  if (locationId === state.activeLocationId || !hasActiveFarming()) { enterLocation(locationId); return; }
  pendingEnterId = locationId;
  elements.enterDialogTarget.textContent = `Nová lokace: ${location.name}`;
  elements.enterDialog.showModal();
}

function enterLocation(locationId) {
  const location = LOCATIONS[locationId];
  if (!location || !canEnterLocation(location)) return;
  if (locationId === state.activeLocationId) {
    if (state.run.targetEnemyId) { navigate("boj"); return; }
    ui.locTab = "enemies";
    renderLocationDetail();
    $(".ld-pick", elements.locDetail)?.focus({ preventScroll: true });
    return;
  }
  // Bezpečné ukončení současného cyklu: boj se zastaví dřív, než se změní cíl,
  // takže starý nepřítel už nezaútočí a nic se dodatečně neodmění (tick i
  // defeatEnemy se řídí running/phase). Nový boj začne až výběrem nepřítele.
  state.running = false;
  state.phase = "ready";
  state.phaseEndsAt = 0;
  state.activeLocationId = locationId;
  const preview = ENEMIES[location.enemyIds[0]];
  state.currentEnemyId = preview.id;
  state.enemy = { hp: preview.maxHp, maxHp: preview.maxHp };
  state.run = createRun(null, locationId);
  elements.encounterMessage.textContent = "Vyber nepřítele v nové lokaci";
  addLog(`Vstoupil jsi do lokace: ${location.name}. Předchozí farmení skončilo, vyber nepřítele.`, "system");
  ui.selectedMapLocationId = locationId;
  ui.locTab = "enemies";
  ui.highlightEnemyId = null;
  updateArenaHeader();
  render();
  saveState();
  renderMapPage();
  $(".ld-pick", elements.locDetail)?.focus({ preventScroll: true });
}

// Nastaví cíl farmení a začne NOVÝ run (jiný nepřítel = nové statistiky).
function chooseTarget(enemyId) {
  const enemyCfg = ENEMIES[enemyId];
  if (!enemyCfg) return;
  if (state.run.targetEnemyId === enemyId) { navigate("boj"); return; }
  state.activeLocationId = enemyCfg.locationId;
  state.currentEnemyId = enemyId;
  state.enemy = { hp: enemyCfg.maxHp, maxHp: enemyCfg.maxHp };
  state.run = createRun(enemyId);
  state.running = true;
  updateArenaHeader();
  addLog(`Cíl farmení nastaven na: ${enemyCfg.name}.`, "system");
  beginFight(performance.now()); // jediná smyčka běží dál, jen dostane nový cíl
  saveState();
  navigate("boj");
}

// --- Živý combat widget (sidebar + mobilní stavový pruh) ----------------
//
// Čistě zobrazení globálního stavu: nic tu boj neřídí. Tlačítko používá
// stejné toggleFight() jako stránka Boj. Bez vybraného nepřítele nabízí mapu.

function buildCombatWidget(root, variant) {
  root.innerHTML = `
    <div class="cw" data-variant="${variant}" data-mode="none">
      <a class="cw-main" href="#/boj">
        <span class="cw-status"><i class="status-dot"></i><b data-cw="status">ŽÁDNÝ AKTIVNÍ BOJ</b></span>
        <span class="cw-none" data-cw-part="none">Vyber lokaci a nepřítele.</span>
        <span class="cw-enemy" data-cw-part="live"><span class="cw-art" data-cw="art" aria-hidden="true"></span><span class="cw-enemy-name" data-cw="name"></span></span>
        <span class="cw-hp" data-cw-part="live">
          <span class="cw-hp-text" data-cw="hpText"></span>
          <span class="bar enemy-bar cw-bar"><span class="bar-fill" data-cw="hpBar"></span></span>
        </span>
        <span class="cw-stats" data-cw-part="live">
          <span><small>Poraženo</small><b data-cw="kills">0</b></span>
          <span class="cw-xp"><small>XP</small><b data-cw="xp">+0</b></span>
          <span class="cw-gold"><small>Gold</small><b data-cw="gold">+0</b></span>
          <span><small>Čas</small><b data-cw="time">00:00</b></span>
        </span>
      </a>
      <button class="btn cw-toggle" type="button" data-cw="toggle" data-cw-part="live">Pozastavit</button>
      <a class="btn btn-primary cw-map" href="#/mapa" data-cw-part="none">Otevřít mapu</a>
    </div>`;
  $(".cw-toggle", root).addEventListener("click", toggleFight);
}

function combatWidgetView() {
  const run = state.run;
  const enemyCfg = run.targetEnemyId ? ENEMIES[run.targetEnemyId] : null;
  if (!enemyCfg) return { mode: "none", status: "ŽÁDNÝ AKTIVNÍ BOJ", short: "ŽÁDNÝ AKTIVNÍ BOJ" };
  const now = performance.now();
  const searching = state.phase === "searching" || state.phase === "dead";
  const total = state.phase === "dead" ? CONFIG.playerRespawnMs : CONFIG.enemyRespawnMs;
  const reference = state.running ? now : (state.pausedAt ?? now);
  const msLeft = Math.max(0, state.phaseEndsAt - reference);
  const secondsLeft = Math.ceil(msLeft / 1000);
  let mode; let status;
  if (!state.running) {
    const started = state.phase !== "ready" || run.elapsedSeconds > 0 || run.kills > 0;
    mode = started ? "paused" : "ready";
    status = started ? "BOJ POZASTAVEN" : "PŘIPRAVEN K BOJI";
  } else if (state.phase === "fighting") { mode = "fighting"; status = "V BOJI"; }
  else if (state.phase === "searching") { mode = "searching"; status = `DALŠÍ NEPŘÍTEL ZA ${formatTime(secondsLeft)}`; }
  else { mode = "dead"; status = `POSTAVA PADLA · NÁVRAT ZA ${formatTime(secondsLeft)}`; }
  const hp = Math.max(0, Math.ceil(state.enemy.hp));
  const hpPercent = searching ? (state.running || state.phaseEndsAt ? 100 - clampPercent(msLeft, total) : 0) : clampPercent(state.enemy.hp, state.enemy.maxHp);
  const hpText = searching ? (state.phase === "dead" ? "Poutník se zotavuje" : "Hledání nepřítele") : `${hp} / ${state.enemy.maxHp} HP`;
  const short = mode === "fighting" ? `V BOJI · ${enemyCfg.name} · ${hp}/${state.enemy.maxHp} HP`
    : mode === "searching" ? `${status} · ${enemyCfg.name}` : mode === "paused" ? `BOJ POZASTAVEN · ${enemyCfg.name}` : mode === "dead" ? status : `PŘIPRAVEN · ${enemyCfg.name}`;
  return {
    mode, status, short, enemyCfg, hpText, hpPercent, searching,
    toggleLabel: state.running ? "Pozastavit" : mode === "ready" ? "Zahájit boj" : "Pokračovat",
  };
}

function applyCombatWidget(root, view) {
  const cw = $(".cw", root);
  const setIf = (name, value) => { const node = $(`[data-cw="${name}"]`, cw); if (node && node.textContent !== value) node.textContent = value; };
  cw.dataset.mode = view.mode;
  $$("[data-cw-part]", cw).forEach((node) => { node.hidden = node.dataset.cwPart === "none" ? view.mode !== "none" : view.mode === "none"; });
  setIf("status", view.status);
  const dot = $(".status-dot", cw);
  dot.classList.toggle("active", view.mode === "fighting" || view.mode === "searching");
  dot.classList.toggle("danger", view.mode === "dead");
  if (view.mode === "none") return;
  const run = state.run;
  if (cw.dataset.enemy !== view.enemyCfg.id) {
    cw.dataset.enemy = view.enemyCfg.id;
    const art = $('[data-cw="art"]', cw);
    art.replaceChildren(view.enemyCfg.image ? mk("img", { src: view.enemyCfg.image, alt: "" }) : mk("span", { class: "goblin-figure" }));
  }
  setIf("name", view.enemyCfg.name);
  setIf("hpText", view.hpText);
  const bar = $('[data-cw="hpBar"]', cw);
  const width = `${view.hpPercent}%`;
  if (bar.style.width !== width) bar.style.width = width;
  setIf("kills", String(run.kills));
  setIf("xp", `+${run.xpEarned}`);
  setIf("gold", `+${run.goldEarned}`);
  setIf("time", formatTime(run.elapsedSeconds));
  const toggle = $('[data-cw="toggle"]', cw);
  if (toggle.textContent !== view.toggleLabel) toggle.textContent = view.toggleLabel;
  toggle.classList.toggle("running", state.running);
}

const combatWidgetRoots = [];
function renderCombatWidgets() {
  if (!combatWidgetRoots.length) return;
  const view = combatWidgetView();
  combatWidgetRoots.forEach((root) => applyCombatWidget(root, view));
  const text = elements.combatStripText;
  if (text.textContent !== view.short) text.textContent = view.short;
}

function initCombatWidgets() {
  buildCombatWidget(elements.combatWidgetSidebar, "sidebar");
  buildCombatWidget(elements.combatStripPanel, "strip");
  combatWidgetRoots.push(elements.combatWidgetSidebar, elements.combatStripPanel);
  elements.combatStripToggle.addEventListener("click", () => {
    const open = elements.combatStripToggle.getAttribute("aria-expanded") !== "true";
    elements.combatStripToggle.setAttribute("aria-expanded", String(open));
    elements.combatStripPanel.hidden = !open;
  });
  // Odkaz na Boj/Mapu ve widgetu sbalí panel (jinak by zůstal viset přes stránku).
  elements.combatStripPanel.addEventListener("click", (event) => {
    if (event.target.closest("a")) { elements.combatStripToggle.setAttribute("aria-expanded", "false"); elements.combatStripPanel.hidden = true; }
  });
}



// --- Stránky, navigace a sidebar ---------------------------------------
//
// Všechny stránky zůstávají v DOM (jen se přepíná atribut hidden) a herní
// smyčka běží mimo ně — přepnutí stránky proto boj nikdy nerestartuje.

const PAGE_TITLES = Object.freeze({ postava: "Postava", inventar: "Inventář", obchodnik: "Obchodník", banka: "Banka", bestiar: "Bestiář", sbirka: "Sbírka", mapa: "Mapa", boj: "Boj" });

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
  document.body.classList.toggle("loc-open", page === "mapa" && elements.locDetail.classList.contains("sheet-open"));
  if (page === "mapa") renderMapPage();
  else if (page === "inventar") renderInventoryView();
  else if (page === "obchodnik") renderMerchant();
  else if (page === "bestiar") renderBestiary();
  else if (page === "sbirka") renderCollection();
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
elements.invQuality.addEventListener("change", () => { ui.quality = elements.invQuality.value; renderInventory(); });
elements.invFlag.addEventListener("change", () => { ui.flag = elements.invFlag.value; renderInventory(); });
elements.invOrigin.addEventListener("change", () => { ui.origin = elements.invOrigin.value; renderInventory(); });
elements.invSort.addEventListener("change", () => { ui.sort = elements.invSort.value; renderInventory(); });
elements.invActiveFilters.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-clear-filter]");
  if (chip) clearFilter(chip.dataset.clearFilter);
});
elements.bestiaryLocation.addEventListener("change", renderBestiary);
elements.collectionLocation.addEventListener("change", renderCollection);
elements.detailSellButton.addEventListener("click", () => {
  const resolved = resolveSelection();
  if (resolved?.kind === "item") requestSale([resolved.item.id]);
});
elements.sellSelectedButton.addEventListener("click", () => {
  const ids = selectedInventoryItems().map((item) => item.id);
  if (ids.length) openBulkDialog("sell", ids);
});
elements.selectSellableButton.addEventListener("click", selectSellableInView);
elements.sellConfirm.addEventListener("click", confirmBulkDialog);
elements.sellCancel.addEventListener("click", () => { pendingBulk = null; elements.sellDialog.close(); });
elements.sellDialog.addEventListener("close", () => { pendingBulk = null; });

// Obchodník
elements.merchantList.addEventListener("change", (event) => {
  const box = event.target.closest("[data-sell-id]");
  if (!box) return;
  if (box.checked) ui.merchantSelected.add(box.dataset.sellId); else ui.merchantSelected.delete(box.dataset.sellId);
  updateMerchantSummary();
});
function merchantSelectWhere(predicate) {
  merchantSellable().filter((item) => !item.isFavorite && predicate(item)).forEach((item) => ui.merchantSelected.add(item.id));
  renderMerchantSell();
}
elements.merchantSelectCommon.addEventListener("click", () => merchantSelectWhere((item) => item.quality === "common"));
elements.merchantSelectAll.addEventListener("click", () => merchantSelectWhere(() => true));
elements.merchantClear.addEventListener("click", () => { ui.merchantSelected.clear(); renderMerchantSell(); });
elements.merchantSlot.addEventListener("change", () => {
  const slot = elements.merchantSlot.value;
  elements.merchantSlot.value = "";
  if (slot) merchantSelectWhere((item) => item.quality === "common" && item.slot === slot);
});
elements.merchantSell.addEventListener("click", () => requestSale([...ui.merchantSelected]));
elements.buybackList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-buyback-id]");
  if (button && !button.disabled) buyBack(button.dataset.buybackId);
});
elements.ruleAutoSell.addEventListener("change", () => { state.lootRules.autoSellCommon = elements.ruleAutoSell.checked; renderRules(); saveState(); });
elements.ruleSlots.addEventListener("change", (event) => {
  const box = event.target.closest("[data-rule-slot]");
  if (!box) return;
  state.lootRules.slots[box.dataset.ruleSlot] = box.checked;
  saveState();
});

// Banka
elements.bankDeposit.addEventListener("click", () => bankTransfer("deposit"));
elements.bankWithdraw.addEventListener("click", () => bankTransfer("withdraw"));
elements.bankDepositAll.addEventListener("click", () => bankTransfer("deposit", true));
elements.bankWithdrawAll.addEventListener("click", () => bankTransfer("withdraw", true));
elements.bankAmount.addEventListener("input", () => setBankMessage("", ""));
elements.detailFavButton.addEventListener("click", () => toggleItemFlag("isFavorite"));
elements.detailLockButton.addEventListener("click", () => toggleItemFlag("isLocked"));
elements.claimAllButton.addEventListener("click", () => claimUnclaimed());
elements.unclaimedList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-claim-id]");
  if (button && !button.disabled) claimUnclaimed(button.dataset.claimId);
});

// Mapa
elements.mapPins.addEventListener("click", (event) => {
  const pin = event.target.closest(".map-pin[data-location-id]");
  if (pin) selectMapLocation(pin.dataset.locationId);
});
elements.mapPins.addEventListener("pointerover", (event) => {
  if (event.pointerType === "touch") return;
  const pin = event.target.closest(".map-pin");
  if (pin) showMapTooltip(pin);
});
elements.mapPins.addEventListener("pointerout", (event) => { if (event.target.closest(".map-pin")) hideMapTooltip(); });
elements.mapPins.addEventListener("focusin", (event) => {
  const pin = event.target.closest(".map-pin");
  if (pin?.matches(":focus-visible")) showMapTooltip(pin);
});
elements.mapPins.addEventListener("focusout", hideMapTooltip);
elements.locDetail.addEventListener("click", (event) => {
  if (event.target.closest(".ld-close")) { closeLocationDetail(); return; }
  const tab = event.target.closest("[role=tab][data-tab]");
  if (tab) { setLocationTab(tab.dataset.tab); return; }
  const pick = event.target.closest(".ld-pick[data-enemy-id]");
  if (pick) { chooseTarget(pick.dataset.enemyId); return; }
  const enemy = event.target.closest(".ld-enemy[data-enemy-id]");
  if (enemy) {
    ui.highlightEnemyId = ui.highlightEnemyId === enemy.dataset.enemyId ? null : enemy.dataset.enemyId;
    renderLocationDetail();
    return;
  }
  const enter = event.target.closest(".ld-enter");
  if (enter && !enter.disabled) requestEnterLocation(ui.selectedMapLocationId);
});
elements.locDetail.addEventListener("keydown", (event) => {
  const tab = event.target.closest("[role=tab]");
  if (!tab) return;
  const keys = LOC_TABS.map(([key]) => key);
  const index = keys.indexOf(tab.dataset.tab);
  const next = { ArrowRight: (index + 1) % keys.length, ArrowLeft: (index + keys.length - 1) % keys.length, Home: 0, End: keys.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  setLocationTab(keys[next]);
});
elements.locBackdrop.addEventListener("click", () => closeLocationDetail());
mqLocSheet.addEventListener("change", syncLocationSheet);
elements.enterCancel.addEventListener("click", () => { pendingEnterId = null; elements.enterDialog.close(); });
elements.enterConfirm.addEventListener("click", () => {
  const id = pendingEnterId;
  pendingEnterId = null;
  elements.enterDialog.close();
  if (id) enterLocation(id);
});
elements.enterDialog.addEventListener("close", () => { pendingEnterId = null; });



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
  else if (ui.page === "mapa" && ui.selectedMapLocationId && !elements.enterDialog.open) closeLocationDetail();
  else if (deleteMode) setDeleteMode(false);
});
window.addEventListener("beforeunload", saveState);

// Dev sanity check: material `sourceEnemyIds` (material-data.js) must match
// the drop tables in world-data.js. Only warns -- never blocks the game.
function validateMaterialSources() {
  const fromTables = {};
  for (const enemy of Object.values(ENEMIES)) {
    for (const drop of enemy.materialDrops ?? []) (fromTables[drop.templateId] ??= new Set()).add(enemy.id);
  }
  for (const material of Object.values(MATERIALS)) {
    const declared = [...material.sourceEnemyIds].sort().join(",");
    const actual = [...(fromTables[material.id] ?? [])].sort().join(",");
    if (declared !== actual) console.warn(`[material-data] ${material.id}: sourceEnemyIds (${declared}) != drop tables (${actual})`);
  }
}
validateMaterialSources();

// Dev kontrola drop tabulek: chybějící šablona/materiál, neznámá quality, God materiál.
// normalize* funkce při chybě zapíšou varování (jen v dev režimu) a vrací bezpečný tvar.
function validateDropTables() {
  for (const enemy of Object.values(ENEMIES)) {
    (enemy.materialDrops ?? []).forEach((drop) => normalizeMaterialDrop(drop, enemy.id));
    (enemy.equipmentDrops ?? []).forEach((drop) => normalizeEquipmentDrop(drop, enemy.id));
  }
}
validateDropTables();

// Testovací sada do inventáře: otevři hru s `?testitems` (např. index.html?testitems#/inventar).
// Přidá po 2 itemech od každé kvality + Můří křídla, uloží a parametr z adresy odstraní
// (neopakuje se při dalším načtení). Jen pro ladění vzhledu; kvalita zatím nemění staty.
function applyTestItems() {
  if (!/[?&]testitems\b/.test(location.search)) return;
  const enemy = getCurrentEnemy();
  const withArt = ITEM_TEMPLATES.filter((t) => t.slot !== "wings" && t.image);
  const picks = [];
  QUALITY_IDS.forEach((quality, qi) => [0, 1].forEach((k) => picks.push({ templateId: withArt[(qi * 2 + k * 5) % withArt.length].templateId, quality })));
  picks.push({ templateId: "moth-wings", quality: "legendary" }, { templateId: "moth-wings", quality: "epic" });
  for (const fixed of picks) {
    if (!findTemplateById(fixed.templateId) || state.inventory.length >= CONFIG.inventoryCapacity) continue;
    const item = createItem(enemy, fixed);
    recordItemAcquired(item);
    state.inventory.unshift(item);
  }
  saveState();
  history.replaceState(null, "", location.pathname + (location.hash || "#/inventar"));
}
applyTestItems();

initCombatWidgets();
applyCharacterPreview();
populateTypeFilter();
populateOriginFilter();
buildRuleSlots();
syncInventoryControls();
startLoops();
updateArenaHeader();
render();
renderLoot();
showPage(pageFromHash());
