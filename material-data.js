"use strict";

// Centrální data materiálů (Prototype 0.4). Načítá se PO quality-data.js a item-data.js
// a PŘED world-data.js / app.js.
//
// Prototype 0.5.1: materiál má JEDNU základní definici. Kvalita (common … mythic) není
// vlastnost definice, ale hodnota konkrétního dropu / stacku (`quality`); stack se
// ukládá pod klíčem `templateId:quality` (viz stackKey v quality-data.js).
// `defaultQuality` se použije jen tehdy, když drop tabulka kvalitu neuvádí, a při migraci
// starých savů (stack bez kvality). Dřívější „uncommon“ materiálů nová škála nezná → common.
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

// Prototype 0.7: obecné craftingové materiály. Asset nemá v názvu quality —
// common/rare/epic… je vlastnost konkrétního stacku, nikoliv samostatný item.
// Většina je zatím pouze v katalogu a čeká na budoucí crafting/recepty. Materiály
// s uvedeným zdrojem jsou zapojené do cíleného farmení Odpadkových hor.
const GLOBAL_MATERIAL_META = Object.freeze([
  ["agate", "Agate", "common", "Layered stone used for simple inlays."],
  ["amber", "Amber", "rare", "Hardened resin with something trapped inside."],
  ["amethyst", "Amethyst", "rare", "A violet crystal cut for later enchantment work."],
  ["binding-glue", "Binding Glue", "common", "Industrial adhesive scraped from old packaging."],
  ["bone", "Bone", "common", "Clean, dense bone suitable for handles and charms."],
  ["chitin-plate", "Chitin Plate", "common", "A broad armored plate from a hardened shell."],
  ["chitin-shard", "Chitin Shard", "common", "A sharp broken piece of chitin."],
  ["cloth-padding", "Cloth Padding", "common", "Compressed layers used beneath armor."],
  ["coal", "Coal", "common", "Dry black fuel for a future forge."],
  ["copper-ingot", "Copper Ingot", "common", "A soft metal bar with many practical uses."],
  ["copper-wire", "Copper Wire", "common", "Coiled conductive wire, still flexible."],
  ["cyan-crystal-dust", "Cyan Crystal Dust", "rare", "Fine blue crystal powder."],
  ["dark-leather", "Dark Leather", "common", "Treated leather resistant to dirt and heat."],
  ["dark-log", "Dark Log", "common", "Heavy timber darkened from the inside."],
  ["diamond", "Diamond", "epic", "A hard clear stone reserved for exceptional work."],
  ["emerald", "Emerald", "rare", "A vivid green gemstone with deep internal fractures."],
  ["garnet", "Garnet", "rare", "A dark red stone with a warm glow."],
  ["iron-ingot", "Iron Ingot", "common", "A reliable bar of worked iron."],
  ["iron-ore", "Iron Ore", "common", "Unrefined ore carrying usable iron."],
  ["iron-plate", "Iron Plate", "common", "A flat plate for armor repairs and fittings."],
  ["iron-rivets", "Iron Rivets", "common", "A small bundle of heavy rivets."],
  ["jade", "Jade", "rare", "A smooth green stone used in precise ornament work."],
  ["leather-padding", "Leather Padding", "common", "Dense leather layers for durable protection."],
  ["leather-roll", "Leather Roll", "common", "A roll of usable leather."],
  ["light-log", "Light Log", "common", "Dry pale timber, easy to shape."],
  ["linen-cloth", "Linen Cloth", "common", "Plain woven cloth for bandages and linings."],
  ["metal-buckle", "Metal Buckle", "common", "A salvageable fastening from old equipment."],
  ["obsidian", "Obsidian", "rare", "Volcanic glass with an edge like a blade."],
  ["onyx", "Onyx", "rare", "A black polished stone with quiet depth."],
  ["opal", "Opal", "rare", "A milky gem that shifts color in the light."],
  ["pearl", "Pearl", "rare", "A pale sphere with a soft inner shine."],
  ["polishing-compound", "Polishing Compound", "common", "A gritty paste used to finish metal and glass."],
  ["quartz", "Quartz", "common", "A clear crystal for basic sockets and reagents."],
  ["raw-hide", "Raw Hide", "common", "Untreated hide awaiting preparation."],
  ["rope", "Rope", "common", "A strong coil of braided rope."],
  ["ruby", "Ruby", "rare", "A deep red gemstone used in high-value craft."],
  ["sapphire", "Sapphire", "rare", "A blue gemstone with a cold clear core."],
  ["sharpening-stone", "Sharpening Stone", "common", "A rough stone that restores a cutting edge."],
  ["silver-ingot", "Silver Ingot", "rare", "A bright metal bar for fine work."],
  ["sinew", "Sinew", "common", "Strong dried tendon for bindings."],
  ["steel-chain", "Steel Chain", "rare", "Interlocking steel links that survived the scrap heap."],
  ["steel-ingot", "Steel Ingot", "common", "A refined bar ready for forging."],
  ["steel-plate", "Steel Plate", "common", "A hardened plate for serious armor work."],
  ["thread-spool", "Thread Spool", "common", "A weathered spool of durable thread."],
  ["topaz", "Topaz", "rare", "A warm golden gemstone."],
  ["wooden-handle", "Wooden Handle", "common", "A shaped handle awaiting a tool head."],
]);

const GLOBAL_MATERIAL_SOURCES = Object.freeze({
  "cloth-padding": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e01"] },
  "thread-spool": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e01"] },
  "binding-glue": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e01"] },
  "leather-padding": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e02"] },
  "metal-buckle": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e02"] },
  "sharpening-stone": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e02"] },
  "iron-rivets": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e03"] },
  "steel-chain": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e03"] },
  "polishing-compound": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e03"] },
  "wooden-handle": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e03"] },
  "bone": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e02"] },
  "sinew": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e02"] },
  "quartz": { locationId: "odpadkove-hory", enemyIds: ["odpadky-e01"] },
  "chitin-plate": { locationId: "pustina-ticha", enemyIds: ["e05", "e06"] },
  "chitin-shard": { locationId: "pustina-ticha", enemyIds: ["e01", "e02", "e03"] },
  "steel-ingot": { locationId: "magma", enemyIds: ["magma-e02", "magma-e04"] },
});

const MATERIALS = Object.freeze({
  "wing-dust": {
    id: "wing-dust", name: "Prach z křídel", asset: "assets/materials/wing-dust.png",
    defaultQuality: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e01", "e02", "e03", "e04"],
    description: "Jemný prach z křídel můr, drolí se mezi prsty.",
  },
  "torn-membrane": {
    id: "torn-membrane", name: "Potrhaná blána", asset: "assets/materials/torn-membrane.png",
    defaultQuality: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e01", "e02", "e03"],
    description: "Kus popraskané blány z křídla, stále pružný.",
  },
  "underground-fiber": {
    id: "underground-fiber", name: "Podzemní vlákno", asset: "assets/materials/underground-fiber.png",
    defaultQuality: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e03", "e05"],
    description: "Pevné šedé vlákno z podzemních zámotků.",
  },
  "polymer-nest-piece": {
    id: "polymer-nest-piece", name: "Kus polymerového hnízda", asset: "assets/materials/polymer-nest-piece.png",
    defaultQuality: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e02", "e05"],
    description: "Slepenec plastu, drátu a trávy, ze kterého můry staví hnízda.",
  },
  "human-memory-fragment": {
    id: "human-memory-fragment", name: "Fragment lidské vzpomínky", asset: "assets/materials/human-memory-fragment.png",
    defaultQuality: "rare", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e04", "e05", "e06"],
    description: "Průsvitný střep, v němž se mihotá cizí vzpomínka.",
  },
  "mother-eye": {
    id: "mother-eye", name: "Oko Matky", asset: "assets/materials/mother-eye.png",
    defaultQuality: "epic", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e06"],
    description: "Zámotek s okem, které se občas pomalu otevře.",
  },
  "scroll-of-oblivion": {
    id: "scroll-of-oblivion", name: "Svitek zapomnění", asset: "assets/materials/scroll-of-oblivion.png",
    defaultQuality: "rare", category: "scroll", stackable: true, tradeable: true,
    sourceLocationId: "pustina-ticha", sourceEnemyIds: ["e04", "e06"],
    description: "Zavinutý svitek, jehož písmo se ztrácí při čtení.",
  },
  "ember-coal": {
    id: "ember-coal", name: "Žhavé uhlí", asset: "assets/materials/ember-coal.png",
    defaultQuality: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "magma", sourceEnemyIds: ["magma-e01", "magma-e02"],
    description: "Kus uhlí, který uvnitř pořád žhne.",
  },
  "slag-chunk": {
    id: "slag-chunk", name: "Kus strusky", asset: "assets/materials/slag-chunk.png",
    defaultQuality: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "magma", sourceEnemyIds: ["magma-e02", "magma-e04"],
    description: "Těžký zbytek po tavbě, plný bublin.",
  },
  "scorched-cloth-bundle": {
    id: "scorched-cloth-bundle", name: "Svazek spáleného sukna", asset: "assets/materials/scorched-cloth-bundle.png",
    defaultQuality: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "magma", sourceEnemyIds: ["magma-e03", "magma-e04"],
    description: "Ohořelé hadry svázané do uzlu.",
  },
  "magma-crystal": {
    id: "magma-crystal", name: "Magmový krystal", asset: "assets/materials/magma-crystal.png",
    defaultQuality: "rare", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "magma", sourceEnemyIds: ["magma-e03", "magma-e04", "magma-e05"],
    description: "Rudý krystal, který se za tmy slabě rozsvěcí.",
  },
  "furnace-core": {
    id: "furnace-core", name: "Jádro výhně", asset: "assets/materials/furnace-core.png",
    defaultQuality: "epic", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "magma", sourceEnemyIds: ["magma-e05"],
    description: "Klec z železa, v níž hoří malá výheň.",
  },
  "cracked-crt-membrane": {
    id: "cracked-crt-membrane", name: "Popraskaná CRT membrána", asset: "assets/materials/cracked-crt-membrane.png",
    defaultQuality: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "elektrika", sourceEnemyIds: ["elektrika-e01", "elektrika-e03"],
    description: "Zbytek obrazovky, kterou už nikdo nezapne.",
  },
  "nerve-cable-bundle": {
    id: "nerve-cable-bundle", name: "Svazek nervových kabelů", asset: "assets/materials/nerve-cable-bundle.png",
    defaultQuality: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "elektrika", sourceEnemyIds: ["elektrika-e01", "elektrika-e02"],
    description: "Kabely obrostlé něčím, co vypadá jako nervy.",
  },
  "overgrown-data-chip": {
    id: "overgrown-data-chip", name: "Zarostlý datový čip", asset: "assets/materials/overgrown-data-chip.png",
    defaultQuality: "common", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "elektrika", sourceEnemyIds: ["elektrika-e02", "elektrika-e04"],
    description: "Čip zarostlý blanitým pletivem.",
  },
  "bile-capacitor": {
    id: "bile-capacitor", name: "Žlučový kondenzátor", asset: "assets/materials/bile-capacitor.png",
    defaultQuality: "rare", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "elektrika", sourceEnemyIds: ["elektrika-e03", "elektrika-e04"],
    description: "Kondenzátor plný žlutého kalu.",
  },
  "kernel-fiber": {
    id: "kernel-fiber", name: "Vlákno jádra", asset: "assets/materials/kernel-fiber.png",
    defaultQuality: "epic", category: "material", stackable: true, tradeable: true,
    sourceLocationId: "elektrika", sourceEnemyIds: ["elektrika-e05"],
    description: "Pevné vlákno z útrob Matky jádra.",
  },
  ...Object.fromEntries(GLOBAL_MATERIAL_META.map(([id, name, defaultQuality, description]) => {
    const source = GLOBAL_MATERIAL_SOURCES[id] ?? { locationId: null, enemyIds: [] };
    return [id, Object.freeze({
      id, name, asset: `assets/materials/global/global_material_${id.replaceAll("-", "_")}.png`,
      defaultQuality, category: "material", stackable: true, tradeable: true,
      sourceLocationId: source.locationId, sourceEnemyIds: source.enemyIds,
      description,
    })];
  })),
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
  "ember-coal", "slag-chunk", "scorched-cloth-bundle", "magma-crystal", "furnace-core",
  "cracked-crt-membrane", "nerve-cable-bundle", "overgrown-data-chip", "bile-capacitor", "kernel-fiber",
  ...GLOBAL_MATERIAL_META.map(([id]) => id),
]);

// Historické/generické ikony materiálů (Prototype 0.3 měl jen stackovací
// mechanismus bez konkrétního materiálu) -- pro bezpečnou migraci starých savů.
const LEGACY_MATERIAL_ALIASES = Object.freeze({});

// Záznam drop tabulky pro materiál: { templateId, quality, chance, quantity: [min, max] }.
// Vrací ověřený tvar (nebo null při chybějícím materiálu). God a neznámá kvalita → common.
function normalizeMaterialDrop(drop, where = "") {
  const material = MATERIALS[drop?.templateId];
  if (!material) { qualityWarn(`materialDrops${where ? ` (${where})` : ""}: chybějící materiál "${drop?.templateId}".`); return null; }
  const quantity = Array.isArray(drop.quantity) ? drop.quantity : [1, 1];
  const min = Math.max(1, Math.floor(Number(quantity[0]) || 1));
  const max = Math.max(min, Math.floor(Number(quantity[1]) || min));
  return {
    templateId: drop.templateId, chance: Number(drop.chance) || 0, quantity: [min, max], tier: drop.tier ?? null,
    quality: normalizeQuality(drop.quality ?? material.defaultQuality, { stackable: true, where: `materialDrops ${drop.templateId}` }),
  };
}

// Znovupoužitelná inline ikona materiálu (Prototype 0.8.1). JEDINÉ místo, které z definice
// materiálu skládá malou ikonu vedle názvu (kovář: požadavky, upgrade, oprava, výsledek tavby).
// Vrací HTML řetězec: <span class="mat-inline"> ikona 22×22 (asset ~18×18) + text </span>.
// Cesta k assetu se bere výhradně z MATERIALS[id].asset. Když materiál asset nemá, vrátí se
// jen text (viz docs/item-visual-rarity-rules.md). `text` přepíše zobrazený název (např.
// "Rare Iron Rivets" nebo "Iron Rivets ×3"); jinak se použije název materiálu.
function materialInlineHtml(materialId, { text = null } = {}) {
  const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const material = MATERIALS[materialId];
  const label = esc(text ?? material?.name ?? materialId);
  if (!material?.asset) return `<span class="mat-inline"><span class="mat-name">${label}</span></span>`;
  return `<span class="mat-inline"><span class="mat-icon" aria-hidden="true"><img src="${esc(material.asset)}" alt="" /></span><span class="mat-name">${label}</span></span>`;
}
