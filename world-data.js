"use strict";

// Shared world data: locations and the enemies that live in them, used by
// app.js to drive the map → location → enemy-selection → farming flow.
// Load this AFTER item-data.js (it references ITEM_TEMPLATES icon keys via
// dropPool) and BEFORE app.js in index.html.
//
// This is deliberately a single, plain data table (no unlockable state, no
// per-enemy story text) so balance can be retuned in one place later. Enemy
// display names are TEMPORARY placeholders ("Nepřítel N") per the current
// brief -- final names/lore are meant to be added afterwards.

// Icon keys of the "chitinová" item set (see item-data.js). All six enemies
// of Pustina ticha currently share this single drop pool -- there are only
// six items for the whole location, so splitting them further per-enemy
// would be arbitrary. Retune per-enemy pools here once more loot exists.
const PUSTINA_TICHA_DROP_POOL = [
  "chitin-weapon",
  "chitin-armor",
  "chitin-helmet",
  "chitin-gloves",
  "chitin-boots",
  "chitin-pants",
];

// The original prototype's full item set (base + signature "andělská" gear)
// stays exactly as Goblin's drop pool, unchanged from before this update.
const OKRAJ_STAREHO_LESA_DROP_POOL = [
  "iron-sword", "goblin-cleaver", "leather-vest", "quilted-coat", "bone-talisman", "copper-ring",
  "greatsword-angels", "angel-armor", "angel-helmet", "angel-gloves", "angel-boots", "angel-charm",
];

const LOCATIONS = Object.freeze({
  "okraj-stareho-lesa": {
    id: "okraj-stareho-lesa",
    name: "Okraj starého lesa",
    enemies: ["goblin"],
  },
  "pustina-ticha": {
    id: "pustina-ticha",
    name: "Pustina ticha",
    enemies: ["e01", "e02", "e03", "e04", "e05", "e06"],
  },
});

// Per-enemy combat + drop configuration. `image: null` keeps the existing
// hand-drawn CSS/SVG figure (Goblin) instead of a raster portrait. `defense`
// is a flat reduction applied to incoming player damage; `gold` is granted
// alongside `xp` on defeat. `dropChance` is the odds of ANY drop per kill
// (which specific item/rarity drops is still resolved the same way as
// before, via ITEM_TEMPLATES + RARITIES).
const ENEMIES = Object.freeze({
  goblin: {
    id: "goblin", locationId: "okraj-stareho-lesa", name: "Goblin", level: 1, image: null,
    maxHp: 48, minDamage: 5, maxDamage: 8, defense: 0, xp: 18, gold: 4,
    dropChance: 0.42, dropPool: OKRAJ_STAREHO_LESA_DROP_POOL,
  },
  e01: {
    id: "e01", locationId: "pustina-ticha", name: "Nepřítel 1", level: 2,
    image: "assets/icons/enemies/pustina-ticha-e01-prasna-mura.png",
    maxHp: 40, minDamage: 4, maxDamage: 7, defense: 1, xp: 14, gold: 3,
    dropChance: 0.40, dropPool: PUSTINA_TICHA_DROP_POOL,
  },
  e02: {
    id: "e02", locationId: "pustina-ticha", name: "Nepřítel 2", level: 3,
    image: "assets/icons/enemies/pustina-ticha-e02-plastova-mura.png",
    maxHp: 58, minDamage: 6, maxDamage: 10, defense: 2, xp: 20, gold: 5,
    dropChance: 0.40, dropPool: PUSTINA_TICHA_DROP_POOL,
  },
  e03: {
    id: "e03", locationId: "pustina-ticha", name: "Nepřítel 3", level: 4,
    image: "assets/icons/enemies/pustina-ticha-e03-slepa-mura.png",
    maxHp: 78, minDamage: 8, maxDamage: 13, defense: 3, xp: 27, gold: 7,
    dropChance: 0.42, dropPool: PUSTINA_TICHA_DROP_POOL,
  },
  e04: {
    id: "e04", locationId: "pustina-ticha", name: "Nepřítel 4", level: 5,
    image: "assets/icons/enemies/pustina-ticha-e04-pametnice.png",
    maxHp: 100, minDamage: 10, maxDamage: 16, defense: 4, xp: 35, gold: 9,
    dropChance: 0.44, dropPool: PUSTINA_TICHA_DROP_POOL,
  },
  e05: {
    id: "e05", locationId: "pustina-ticha", name: "Nepřítel 5", level: 6,
    image: "assets/icons/enemies/pustina-ticha-e05-mura-z-hlubiny.png",
    maxHp: 128, minDamage: 13, maxDamage: 20, defense: 5, xp: 45, gold: 12,
    dropChance: 0.46, dropPool: PUSTINA_TICHA_DROP_POOL,
  },
  e06: {
    id: "e06", locationId: "pustina-ticha", name: "Nepřítel 6", level: 7,
    image: "assets/icons/enemies/pustina-ticha-e06-matka-der.png",
    maxHp: 165, minDamage: 16, maxDamage: 25, defense: 7, xp: 60, gold: 16,
    dropChance: 0.50, dropPool: PUSTINA_TICHA_DROP_POOL,
  },
});

const DEFAULT_ENEMY_ID = "goblin";

function pluralizeNepritel(count) {
  if (count === 1) return "nepřítel";
  if (count >= 2 && count <= 4) return "nepřátelé";
  return "nepřátel";
}
