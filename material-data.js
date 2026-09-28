"use strict";

// Centrální data materiálů (Prototype 0.4). Načítá se PO item-data.js (kvůli
// RARITIES) a PŘED world-data.js / app.js.
//
// Materiály mají stabilní `id` nezávislé na zobrazovaném názvu -- podle něj se
// ukládají do savu (`state.materials`) i odkazují z drop tabulek ve
// world-data.js. Název, popis a asset lze kdykoliv změnit bez migrace savu.
//
// `category`: "material" | "scroll". Svitek je samostatná kategorie (do
// budoucna vlastní záložka), zatím se zobrazuje mezi materiály se štítkem.
//
// Pole `sourceEnemyIds` je ZÁMĚRNĚ zdvojená informace k drop tabulkám ve
// world-data.js -- používá se v detailu materiálu a při startu se kontroluje
// proti drop tabulkám (viz validateMaterialSources v app.js). Do budoucna
// (crafting) slouží materiály jako vstupy receptů přes stabilní `id`.

const MATERIALS = Object.freeze({
  "wing-dust": {
    id: "wing-dust", name: "Prach z křídel", asset: "assets/materials/wing-dust.png",
    rarity: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e01", "e02", "e03", "e04"],
    description: "Jemný prach z křídel můr, drolí se mezi prsty.",
  },
  "torn-membrane": {
    id: "torn-membrane", name: "Potrhaná blána", asset: "assets/materials/torn-membrane.png",
    rarity: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e01", "e02", "e03"],
    description: "Kus popraskané blány z křídla, stále pružný.",
  },
  "underground-fiber": {
    id: "underground-fiber", name: "Podzemní vlákno", asset: "assets/materials/underground-fiber.png",
    rarity: "uncommon", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e03", "e05"],
    description: "Pevné šedé vlákno z podzemních zámotků.",
  },
  "polymer-nest-piece": {
    id: "polymer-nest-piece", name: "Kus polymerového hnízda", asset: "assets/materials/polymer-nest-piece.png",
    rarity: "uncommon", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e02", "e05"],
    description: "Slepenec plastu, drátu a trávy, ze kterého můry staví hnízda.",
  },
  "human-memory-fragment": {
    id: "human-memory-fragment", name: "Fragment lidské vzpomínky", asset: "assets/materials/human-memory-fragment.png",
    rarity: "rare", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e04", "e05", "e06"],
    description: "Průsvitný střep, v němž se mihotá cizí vzpomínka.",
  },
  "mother-eye": {
    id: "mother-eye", name: "Oko Matky", asset: "assets/materials/mother-eye.png",
    rarity: "epic", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e06"],
    description: "Zámotek s okem, které se občas pomalu otevře.",
  },
  "scroll-of-oblivion": {
    id: "scroll-of-oblivion", name: "Svitek zapomnění", asset: "assets/materials/scroll-of-oblivion.png",
    rarity: "rare", category: "scroll", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e04", "e06"],
    description: "Zavinutý svitek, jehož písmo se ztrácí při čtení.",
  },
});

const MATERIAL_CATEGORY_LABELS = Object.freeze({
  material: "Materiál",
  scroll: "Svitek",
});

// Pořadí zobrazení v záložce MATERIÁLY: nejdřív běžné materiály podle
// vzácnosti, svitky nakonec.
const MATERIAL_ORDER = Object.freeze([
  "wing-dust", "torn-membrane", "underground-fiber", "polymer-nest-piece",
  "human-memory-fragment", "mother-eye", "scroll-of-oblivion",
]);

// Historické/generické ikony materiálů (Prototype 0.3 měl jen stackovací
// mechanismus bez konkrétního materiálu) -- pro bezpečnou migraci starých savů.
const LEGACY_MATERIAL_ALIASES = Object.freeze({});
