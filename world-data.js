"use strict";

// Shared world data: locations and the enemies that live in them, used by
// app.js to drive the map → location → enemy-selection → farming flow.
// Load this AFTER item-data.js (it references ITEM_TEMPLATES icon keys via
// dropPool) and BEFORE app.js in index.html.
//
// This is deliberately a single, plain data table (no unlockable state, no
// per-enemy story text) so balance can be retuned in one place later.
//
// Prototype 0.4: každý nepřítel má vlastní drop identitu -- `materialDrops`
// (viz material-data.js) + `dropChance`/`dropPool` pro vybavení. Load this
// AFTER item-data.js and material-data.js.

// Icon keys of the "chitinová" item set (see item-data.js). Only the enemies
// that list this pool (see `dropChance` per enemy below) can drop chitin gear.
const PUSTINA_TICHA_DROP_POOL = [
  "chitin-weapon",
  "chitin-armor",
  "chitin-helmet",
  "chitin-gloves",
  "chitin-boots",
  "chitin-pants",
  "moth-wings",
];

// The original prototype's full item set (base + signature "andělská" gear)
// stays exactly as Goblin's drop pool, unchanged from before this update.
const OKRAJ_STAREHO_LESA_DROP_POOL = [
  "iron-sword", "goblin-cleaver", "leather-vest", "quilted-coat", "bone-talisman", "copper-ring",
  "greatsword-angels", "angel-armor", "angel-helmet", "angel-gloves", "angel-boots", "angel-charm",
];

// Prozatímní pooly kořisti nových lokací (content-first fáze, bez finální balance).
const MAGMA_DROP_POOL = ["molten-armor", "molten-axe", "molten-boots", "molten-hammer"];
const ELEKTRIKA_DROP_POOL = [
  "interrupted-armor", "interrupted-helmet", "interrupted-gloves", "interrupted-boots", "interrupted-pants",
  "debug-port-needle", "stack-cleaner", "core-ring",
];

// Dočasný mapový podklad. Finální mapu světa stačí uložit jako jeden obrázek
// (PNG/WebP/SVG) a změnit `src` + rozměry -- body lokací se počítají z
// procentuálních `mapPosition` a poměr stran se bere z width/height.
const WORLD_MAP = Object.freeze({
  src: "assets/map/world-map-temporary.svg", // DOČASNÝ asset, nahradit finální mapou
  width: 1600,
  height: 900,
  temporary: true,
  alt: "Mapa světa (dočasný podklad)",
});

// Stavy lokace: "available" = plně hratelná, "preview" = má background/data,
// ale obsah je nekompletní, "comingSoon" = jen oznámená. Vstup je možný jen do
// "available" lokace s aspoň jedním nepřítelem.
const LOCATION_STATUS_LABELS = Object.freeze({
  available: "DOSTUPNÁ", preview: "PŘIPRAVUJE SE", comingSoon: "PŘIPRAVUJE SE",
});

// `mapPosition` je v PROCENTECH vůči mapě (x zleva, y shora). `backgroundAsset`
// je cesta k náhledu prostředí -- zatím žádné dodané backgrounds neexistují,
// proto `null` (detail zobrazí označený zástupný blok). `itemIds` jsou icon
// klíče ITEM_TEMPLATES, `materialIds`/`bossIds` se dopočítají z tabulek
// nepřátel níže (finalizeLocations), aby nemohly rozejít.
const LOCATION_DEFS = [
  {
    id: "okraj-stareho-lesa",
    name: "Okraj starého lesa",
    mapPosition: { x: 27, y: 64 },
    recommendedLevel: 1,
    backgroundAsset: null,
    shortDescription: "Zarostlý okraj lesa, kde se potulují goblini.",
    status: "available",
    enemyIds: ["goblin"],
    itemIds: OKRAJ_STAREHO_LESA_DROP_POOL,
  },
  {
    id: "pustina-ticha",
    name: "Pustina ticha",
    mapPosition: { x: 67, y: 35 },
    recommendedLevel: 2,
    backgroundAsset: "assets/backgrounds/pustina-ticha.webp",
    shortDescription: "Šedá pustina plná můr, po které se nese jen šepot křídel.",
    status: "available",
    enemyIds: ["e01", "e02", "e03", "e04", "e05", "e06"],
    itemIds: PUSTINA_TICHA_DROP_POOL,
  },
  {
    id: "odpadkove-hory",
    name: "Odpadkové hory",
    mapPosition: { x: 50, y: 80 },
    recommendedLevel: 8,
    backgroundAsset: "assets/backgrounds/odpadkove-hory.webp",
    shortDescription: "Nekonečné haldy odpadu, ve kterých se něco hýbe.",
    status: "preview", // má nepřátele, ale zatím žádnou kořist -- po doplnění drop tabulek přepnout na "available"
    enemyIds: ["odpadky-e01", "odpadky-e02", "odpadky-e03"],
    itemIds: [],
  },
  {
    id: "magma",
    name: "Magma",
    mapPosition: { x: 84, y: 62 },
    recommendedLevel: 12,
    backgroundAsset: "assets/backgrounds/magma.webp",
    shortDescription: "Rozpálená pustina zhrouceného hutního komplexu.",
    status: "available",
    enemyIds: ["magma-e01", "magma-e02", "magma-e03", "magma-e04", "magma-e05"],
    itemIds: MAGMA_DROP_POOL,
  },
  {
    id: "elektrika",
    name: "Elektrika",
    mapPosition: { x: 39, y: 28 },
    recommendedLevel: 16,
    backgroundAsset: "assets/backgrounds/elektrika.webp",
    shortDescription: "Odpojený server, kde kabely rostou jako nervy.",
    status: "available",
    enemyIds: ["elektrika-e01", "elektrika-e02", "elektrika-e03", "elektrika-e04", "elektrika-e05"],
    itemIds: ELEKTRIKA_DROP_POOL,
  },
];

// Per-enemy combat + drop configuration. `image: null` keeps the existing
// hand-drawn CSS/SVG figure (Goblin) instead of a raster portrait. `defense`
// is a flat reduction applied to incoming player damage; `gold` is granted
// alongside `xp` on defeat. `dropChance` is the odds of an EQUIPMENT drop per
// kill (which item/rarity is resolved via ITEM_TEMPLATES + RARITIES); materials
// are rolled separately from `materialDrops`.
// Enemy `type` is display-only (COMMON / UNCOMMON / RARE / ELITE / BOSS).
//
// `materialDrops` = per-kill INDEPENDENT rolls: { id, chance, min, max, tier }.
//   id     -> key in MATERIALS (material-data.js)
//   chance -> 0..1 probability per kill (working balance, easy to retune)
//   min/max-> quantity range when it drops
//   tier   -> label shown to the player instead of a raw percentage:
//             "common" = Běžný drop, "uncommon" = Neobvyklý drop,
//             "rare" = Vzácný drop, "veryRare" = Velmi vzácný drop
// `dropChance` + `dropPool` = separate roll for an equipment item (0 = none).
const DROP_TIER_LABELS = Object.freeze({
  common: "Běžný drop",
  uncommon: "Neobvyklý drop",
  rare: "Vzácný drop",
  veryRare: "Velmi vzácný drop",
});
const DROP_TIER_ORDER = Object.freeze(["common", "uncommon", "rare", "veryRare"]);
const ENEMY_TYPE_LABELS = Object.freeze({
  common: "COMMON", uncommon: "UNCOMMON", rare: "RARE", elite: "ELITE", boss: "BOSS",
});

const ENEMIES = Object.freeze({
  goblin: {
    id: "goblin", locationId: "okraj-stareho-lesa", name: "Goblin", level: 1, type: "common", image: null,
    maxHp: 48, minDamage: 5, maxDamage: 8, defense: 0, xp: 18, gold: 4,
    dropChance: 0.42, dropPool: OKRAJ_STAREHO_LESA_DROP_POOL, materialDrops: [],
    equipmentLoot: { name: "Vybavení z lesa", icon: "iron-sword", tier: "uncommon" },
  },
  e01: {
    id: "e01", locationId: "pustina-ticha", name: "Prašná můra", level: 2, type: "common",
    image: "assets/icons/enemies/pustina-ticha-e01-prasna-mura.png",
    maxHp: 40, minDamage: 4, maxDamage: 7, defense: 1, xp: 14, gold: 3,
    dropChance: 0.02, dropPool: PUSTINA_TICHA_DROP_POOL,
    equipmentLoot: { name: "Chitinové vybavení", icon: "chitin-armor", tier: "veryRare" },
    materialDrops: [
      { id: "wing-dust", chance: 0.80, min: 1, max: 3, tier: "common" },
      { id: "torn-membrane", chance: 0.25, min: 1, max: 1, tier: "uncommon" },
    ],
  },
  e02: {
    id: "e02", locationId: "pustina-ticha", name: "Plastová můra", level: 3, type: "common",
    image: "assets/icons/enemies/pustina-ticha-e02-plastova-mura.png",
    maxHp: 58, minDamage: 6, maxDamage: 10, defense: 2, xp: 20, gold: 5,
    dropChance: 0.02, dropPool: PUSTINA_TICHA_DROP_POOL,
    equipmentLoot: { name: "Chitinové vybavení", icon: "chitin-armor", tier: "veryRare" },
    materialDrops: [
      { id: "polymer-nest-piece", chance: 0.55, min: 1, max: 2, tier: "common" },
      { id: "torn-membrane", chance: 0.30, min: 1, max: 1, tier: "uncommon" },
      { id: "wing-dust", chance: 0.20, min: 1, max: 2, tier: "uncommon" },
    ],
  },
  e03: {
    id: "e03", locationId: "pustina-ticha", name: "Slepá můra", level: 4, type: "uncommon",
    image: "assets/icons/enemies/pustina-ticha-e03-slepa-mura.png",
    maxHp: 78, minDamage: 8, maxDamage: 13, defense: 3, xp: 27, gold: 7,
    dropChance: 0.03, dropPool: PUSTINA_TICHA_DROP_POOL,
    equipmentLoot: { name: "Chitinové vybavení", icon: "chitin-armor", tier: "veryRare" },
    materialDrops: [
      { id: "underground-fiber", chance: 0.50, min: 1, max: 2, tier: "common" },
      { id: "wing-dust", chance: 0.25, min: 1, max: 2, tier: "uncommon" },
      { id: "torn-membrane", chance: 0.25, min: 1, max: 1, tier: "uncommon" },
    ],
  },
  e04: {
    id: "e04", locationId: "pustina-ticha", name: "Pamětnice", level: 5, type: "rare",
    image: "assets/icons/enemies/pustina-ticha-e04-pametnice.png",
    maxHp: 100, minDamage: 10, maxDamage: 16, defense: 4, xp: 35, gold: 9,
    dropChance: 0.04, dropPool: PUSTINA_TICHA_DROP_POOL,
    equipmentLoot: { name: "Chitinové vybavení", icon: "chitin-armor", tier: "veryRare" },
    materialDrops: [
      { id: "human-memory-fragment", chance: 0.35, min: 1, max: 1, tier: "common" },
      { id: "wing-dust", chance: 0.20, min: 1, max: 2, tier: "uncommon" },
      { id: "scroll-of-oblivion", chance: 0.05, min: 1, max: 1, tier: "rare" },
    ],
  },
  e05: {
    id: "e05", locationId: "pustina-ticha", name: "Můra z hlubiny", level: 6, type: "elite",
    image: "assets/icons/enemies/pustina-ticha-e05-mura-z-hlubiny.png",
    maxHp: 128, minDamage: 13, maxDamage: 20, defense: 5, xp: 45, gold: 12,
    // Vyšší šance na tematické chitinové vybavení než u ostatních nepřátel.
    dropChance: 0.14, dropPool: PUSTINA_TICHA_DROP_POOL,
    equipmentLoot: { name: "Chitinové vybavení", icon: "chitin-armor", tier: "rare" },
    materialDrops: [
      { id: "underground-fiber", chance: 0.45, min: 1, max: 3, tier: "common" },
      { id: "polymer-nest-piece", chance: 0.20, min: 1, max: 2, tier: "uncommon" },
      { id: "human-memory-fragment", chance: 0.12, min: 1, max: 1, tier: "rare" },
    ],
  },
  e06: {
    id: "e06", locationId: "pustina-ticha", name: "Matka děr", level: 7, type: "boss",
    image: "assets/icons/enemies/pustina-ticha-e06-matka-der.png",
    maxHp: 165, minDamage: 16, maxDamage: 25, defense: 7, xp: 60, gold: 16,
    dropChance: 0.45, dropPool: PUSTINA_TICHA_DROP_POOL,
    equipmentLoot: { name: "Chitinové vybavení", icon: "chitin-armor", tier: "uncommon" },
    materialDrops: [
      { id: "human-memory-fragment", chance: 0.60, min: 1, max: 2, tier: "common" },
      { id: "scroll-of-oblivion", chance: 0.10, min: 1, max: 1, tier: "rare" },
      // Oko Matky padá VÝHRADNĚ z Matky děr.
      { id: "mother-eye", chance: 0.05, min: 1, max: 1, tier: "veryRare" },
    ],
  },

  // Prozatímní statistiky nových lokací -- content-first fáze, žádná finální balance.
  "odpadky-e01": {
    id: "odpadky-e01", locationId: "odpadkove-hory", name: "Odpadkový duch", level: 8, type: "common",
    image: "assets/icons/enemies/odpadkove-hory-e01-odpadkovy-duch.png",
    maxHp: 184, minDamage: 17, maxDamage: 28, defense: 8, xp: 68, gold: 18,
    dropChance: 0, dropPool: [],
    materialDrops: [],
  },
  "odpadky-e02": {
    id: "odpadky-e02", locationId: "odpadkove-hory", name: "Sběračský krtek", level: 9, type: "uncommon",
    image: "assets/icons/enemies/odpadkove-hory-e02-sberacsky-krtek.png",
    maxHp: 207, minDamage: 19, maxDamage: 32, defense: 9, xp: 76, gold: 21,
    dropChance: 0, dropPool: [],
    materialDrops: [],
  },
  "odpadky-e03": {
    id: "odpadky-e03", locationId: "odpadkove-hory", name: "Vězeň v kleci", level: 10, type: "rare",
    image: "assets/icons/enemies/odpadkove-hory-e03-vezen-v-kleci.png",
    maxHp: 230, minDamage: 21, maxDamage: 35, defense: 10, xp: 85, gold: 23,
    dropChance: 0, dropPool: [],
    materialDrops: [],
  },
  "magma-e01": {
    id: "magma-e01", locationId: "magma", name: "Uhelný lezec", level: 12, type: "common",
    image: "assets/icons/enemies/magma-e01-uhelny-lezec.png",
    maxHp: 276, minDamage: 25, maxDamage: 42, defense: 12, xp: 102, gold: 28,
    dropChance: 0.03, dropPool: MAGMA_DROP_POOL,
    equipmentLoot: { name: "Roztavené vybavení", icon: "molten-armor", tier: "veryRare" },
    materialDrops: [
      { id: "ember-coal", chance: 0.8, min: 1, max: 3, tier: "common" },
    ],
  },
  "magma-e02": {
    id: "magma-e02", locationId: "magma", name: "Nosič strusky", level: 13, type: "common",
    image: "assets/icons/enemies/magma-e02-nosic-strusky.png",
    maxHp: 299, minDamage: 27, maxDamage: 46, defense: 13, xp: 110, gold: 30,
    dropChance: 0.03, dropPool: MAGMA_DROP_POOL,
    equipmentLoot: { name: "Roztavené vybavení", icon: "molten-armor", tier: "veryRare" },
    materialDrops: [
      { id: "ember-coal", chance: 0.5, min: 1, max: 2, tier: "common" },
      { id: "slag-chunk", chance: 0.45, min: 1, max: 2, tier: "common" },
    ],
  },
  "magma-e03": {
    id: "magma-e03", locationId: "magma", name: "Zvoník kouře", level: 14, type: "uncommon",
    image: "assets/icons/enemies/magma-e03-zvonik-koure.png",
    maxHp: 322, minDamage: 29, maxDamage: 49, defense: 14, xp: 119, gold: 32,
    dropChance: 0.04, dropPool: MAGMA_DROP_POOL,
    equipmentLoot: { name: "Roztavené vybavení", icon: "molten-armor", tier: "veryRare" },
    materialDrops: [
      { id: "scorched-cloth-bundle", chance: 0.45, min: 1, max: 2, tier: "uncommon" },
      { id: "magma-crystal", chance: 0.12, min: 1, max: 1, tier: "rare" },
    ],
  },
  "magma-e04": {
    id: "magma-e04", locationId: "magma", name: "Spálený kat", level: 15, type: "elite",
    image: "assets/icons/enemies/magma-e04-spaleny-kat.png",
    maxHp: 345, minDamage: 32, maxDamage: 52, defense: 15, xp: 128, gold: 34,
    dropChance: 0.14, dropPool: MAGMA_DROP_POOL,
    equipmentLoot: { name: "Roztavené vybavení", icon: "molten-armor", tier: "rare" },
    materialDrops: [
      { id: "slag-chunk", chance: 0.4, min: 1, max: 3, tier: "common" },
      { id: "scorched-cloth-bundle", chance: 0.3, min: 1, max: 2, tier: "uncommon" },
      { id: "magma-crystal", chance: 0.15, min: 1, max: 1, tier: "rare" },
    ],
  },
  "magma-e05": {
    id: "magma-e05", locationId: "magma", name: "Srdce zhroucené výhně", level: 16, type: "boss",
    image: "assets/icons/enemies/magma-e05-srdce-zhrouceneho-vyhne.png",
    maxHp: 736, minDamage: 47, maxDamage: 78, defense: 19, xp: 136, gold: 37,
    dropChance: 0.45, dropPool: MAGMA_DROP_POOL,
    equipmentLoot: { name: "Roztavené vybavení", icon: "molten-armor", tier: "uncommon" },
    materialDrops: [
      { id: "magma-crystal", chance: 0.55, min: 1, max: 2, tier: "rare" },
      { id: "furnace-core", chance: 0.05, min: 1, max: 1, tier: "veryRare" },
    ],
  },
  "elektrika-e01": {
    id: "elektrika-e01", locationId: "elektrika", name: "Cache roztoč", level: 16, type: "common",
    image: "assets/icons/enemies/elektrika-e01-cache-roztoc.png",
    maxHp: 368, minDamage: 34, maxDamage: 56, defense: 16, xp: 136, gold: 37,
    dropChance: 0.03, dropPool: ELEKTRIKA_DROP_POOL,
    equipmentLoot: { name: "Přerušené vybavení", icon: "interrupted-armor", tier: "veryRare" },
    materialDrops: [
      { id: "cracked-crt-membrane", chance: 0.7, min: 1, max: 3, tier: "common" },
      { id: "nerve-cable-bundle", chance: 0.3, min: 1, max: 2, tier: "uncommon" },
    ],
  },
  "elektrika-e02": {
    id: "elektrika-e02", locationId: "elektrika", name: "Paketové zrození", level: 17, type: "common",
    image: "assets/icons/enemies/elektrika-e02-paketove-zrozeni.png",
    maxHp: 391, minDamage: 36, maxDamage: 60, defense: 17, xp: 144, gold: 39,
    dropChance: 0.03, dropPool: ELEKTRIKA_DROP_POOL,
    equipmentLoot: { name: "Přerušené vybavení", icon: "interrupted-armor", tier: "veryRare" },
    materialDrops: [
      { id: "nerve-cable-bundle", chance: 0.55, min: 1, max: 2, tier: "common" },
      { id: "overgrown-data-chip", chance: 0.25, min: 1, max: 1, tier: "uncommon" },
    ],
  },
  "elektrika-e03": {
    id: "elektrika-e03", locationId: "elektrika", name: "Zastavený démon", level: 18, type: "uncommon",
    image: "assets/icons/enemies/elektrika-e03-zastaveny-demon.png",
    maxHp: 414, minDamage: 38, maxDamage: 63, defense: 18, xp: 153, gold: 41,
    dropChance: 0.04, dropPool: ELEKTRIKA_DROP_POOL,
    equipmentLoot: { name: "Přerušené vybavení", icon: "interrupted-armor", tier: "veryRare" },
    materialDrops: [
      { id: "cracked-crt-membrane", chance: 0.45, min: 1, max: 2, tier: "common" },
      { id: "bile-capacitor", chance: 0.12, min: 1, max: 1, tier: "rare" },
    ],
  },
  "elektrika-e04": {
    id: "elektrika-e04", locationId: "elektrika", name: "Sběrač odpadu", level: 19, type: "elite",
    image: "assets/icons/enemies/elektrika-e04-sberac-odpadu.png",
    maxHp: 437, minDamage: 40, maxDamage: 66, defense: 19, xp: 162, gold: 44,
    dropChance: 0.14, dropPool: ELEKTRIKA_DROP_POOL,
    equipmentLoot: { name: "Přerušené vybavení", icon: "interrupted-armor", tier: "rare" },
    materialDrops: [
      { id: "overgrown-data-chip", chance: 0.4, min: 1, max: 2, tier: "uncommon" },
      { id: "bile-capacitor", chance: 0.18, min: 1, max: 1, tier: "rare" },
    ],
  },
  "elektrika-e05": {
    id: "elektrika-e05", locationId: "elektrika", name: "Matka jádra", level: 20, type: "boss",
    image: "assets/icons/enemies/elektrika-e05-matka-jadra.png",
    maxHp: 920, minDamage: 59, maxDamage: 98, defense: 24, xp: 170, gold: 46,
    dropChance: 0.45, dropPool: ELEKTRIKA_DROP_POOL,
    equipmentLoot: { name: "Přerušené vybavení", icon: "interrupted-armor", tier: "uncommon" },
    materialDrops: [
      { id: "kernel-fiber", chance: 0.3, min: 1, max: 1, tier: "veryRare" },
    ],
  },
});

const DEFAULT_ENEMY_ID = "goblin";

// Dopočítá materialIds a bossIds z tabulek nepřátel a zmrazí lokace.
function finalizeLocations(defs) {
  const result = {};
  for (const def of defs) {
    const enemies = def.enemyIds.map((id) => ENEMIES[id]).filter(Boolean);
    const materialIds = [];
    for (const enemy of enemies) {
      for (const drop of enemy.materialDrops ?? []) if (!materialIds.includes(drop.id)) materialIds.push(drop.id);
    }
    result[def.id] = Object.freeze({
      ...def,
      materialIds,
      bossIds: enemies.filter((enemy) => enemy.type === "boss").map((enemy) => enemy.id),
    });
  }
  return Object.freeze(result);
}
const LOCATIONS = finalizeLocations(LOCATION_DEFS);

function pluralizeNepritel(count) {
  if (count === 1) return "nepřítel";
  if (count >= 2 && count <= 4) return "nepřátelé";
  return "nepřátel";
}
