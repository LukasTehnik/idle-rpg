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
    backgroundAsset: null,
    shortDescription: "Šedá pustina plná můr, po které se nese jen šepot křídel.",
    status: "available",
    enemyIds: ["e01", "e02", "e03", "e04", "e05", "e06"],
    itemIds: PUSTINA_TICHA_DROP_POOL,
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
