"use strict";

// Prototype 0.8 — Kovářství. Všechna čísla níže jsou pracovní testovací
// hodnoty; herní logika na ně odkazuje přes stabilní ID, ne přes názvy/asset.
// Recept lze později vydat jako loot, kontrakt nebo odměnu bez změny UI.
const SMITH_CONFIG = Object.freeze({
  maxUpgradeLevel: 15,
  maxHistory: 20,
  durabilityMax: 100,
  upgradeStatPerLevel: 0.06,
  // Vyšší quality materiálů zvyšuje kvalitu výsledku, neviditelně však nemění
  // význam svitků; výsledné staty se losují samostatně ze šablony.
  qualityCaps: Object.freeze(["common", "rare", "epic", "legendary"]),
});

const FORGE_RECIPES = Object.freeze([
  ...(typeof CONTENT_100 !== "undefined" ? CONTENT_100.recipes : []),
  Object.freeze({
    id: "forge-iron-sword", templateId: "iron-sword", label: "Železný meč", tier: 1,
    gold: 200, materials: [{ id: "iron-rivets", qty: 24 }, { id: "wooden-handle", qty: 4 }, { id: "sharpening-stone", qty: 4 }],
  }),
  Object.freeze({
    id: "forge-leather-vest", templateId: "leather-vest", label: "Kožená vesta", tier: 1,
    gold: 200, materials: [{ id: "leather-padding", qty: 24 }, { id: "cloth-padding", qty: 8 }, { id: "metal-buckle", qty: 4 }],
  }),
  Object.freeze({
    id: "forge-bone-talisman", templateId: "bone-talisman", label: "Kostěný talisman", tier: 2,
    gold: 35, materials: [{ id: "bone", qty: 2 }, { id: "sinew", qty: 1 }, { id: "quartz", qty: 1 }],
  }),
  Object.freeze({
    id: "forge-chitin-blade", templateId: "chitin-weapon", label: "Můří čepel", tier: 2,
    gold: 50, materials: [{ id: "chitin-plate", qty: 3 }, { id: "chitin-shard", qty: 2 }, { id: "underground-fiber", qty: 2 }],
  }),
  Object.freeze({
    id: "forge-molten-axe", templateId: "molten-axe", label: "Roztavená sekera", tier: 3,
    gold: 90, materials: [{ id: "steel-ingot", qty: 3 }, { id: "ember-coal", qty: 3 }, { id: "magma-crystal", qty: 1 }],
  }),
]);

function getForgeRecipe(id) { return FORGE_RECIPES.find((recipe) => recipe.id === id) ?? null; }

function forgeChance({ prefixId = null, suffixId = null } = {}) {
  if (prefixId && suffixId) return 0.7;
  if (prefixId || suffixId) return 0.85;
  return 1;
}

function upgradeChance(nextLevel) {
  if (nextLevel <= 3) return 1;
  if (nextLevel <= 6) return 0.85;
  if (nextLevel <= 9) return 0.7;
  if (nextLevel <= 12) return 0.55;
  return 0.4;
}

function upgradeCost(item) {
  const nextLevel = Math.min(SMITH_CONFIG.maxUpgradeLevel, (Number(item?.upgradeLevel) || 0) + 1);
  const template=findTemplateById(item?.templateId ?? item?.icon);
  if(template?.itemTier && typeof CONTENT_100!=="undefined"){
    const tier=template.itemTier, materials=[{id:template.smeltMaterialId,qty:2+Math.floor(nextLevel/3)}];
    if(nextLevel>=4){const essence=materials.find(m=>m.id===`t${tier}-essence`);if(essence)essence.qty+=Math.ceil(nextLevel/3);else materials.push({id:`t${tier}-essence`,qty:Math.ceil(nextLevel/3)});}
    if(nextLevel>=10)materials.push({id:`t${tier}-core`,qty:1});
    return {gold:Math.round(50*nextLevel*Math.pow(1.55,tier-1)),materials,nextLevel,chance:upgradeChance(nextLevel)};
  }
  if (nextLevel <= 3) return { gold: nextLevel * 50, materials: [{ id: "iron-rivets", qty: 2 }, { id: "sharpening-stone", qty: 1 }], nextLevel, chance: 1 };
  const scale = Math.max(1, Math.ceil(nextLevel / 3));
  const materials = [{ id: "iron-rivets", qty: scale }];
  if (nextLevel >= 4) materials.push({ id: "sharpening-stone", qty: Math.ceil(scale / 2) });
  if (nextLevel >= 8) materials.push({ id: "steel-chain", qty: 1 });
  if (nextLevel >= 12) materials.push({ id: "polishing-compound", qty: 1 });
  return { gold: 8 * nextLevel + 4 * scale, materials, nextLevel, chance: upgradeChance(nextLevel) };
}

function repairCost(item) {
  const max = Math.max(1, Number(item?.maxDurability) || SMITH_CONFIG.durabilityMax);
  const current = Math.max(0, Math.min(max, Number(item?.durability) ?? max));
  const missing = max - current;
  // V prvním pásmu stojí oprava jen gold; pozdější materiálové opravy se
  // přidají spolu s vyššími recepty, aby start nepůsobil jako slepá ulička.
  const tier=findTemplateById(item?.templateId ?? item?.icon)?.itemTier ?? 1;
  return { missing, gold: Math.max(1, Math.ceil(missing / 5*Math.pow(1.55,tier-1))), materials: [] };
}

function smeltYield(item) {
  const baseBySlot = { weapon: "iron-rivets", armor: "metal-buckle", helmet: "metal-buckle", gloves: "thread-spool", boots: "leather-padding", pants: "cloth-padding", charm: "quartz", wings: "wing-dust" };
  const materialId = findTemplateById(item?.templateId ?? item?.icon)?.smeltMaterialId ?? baseBySlot[item?.slot] ?? "iron-rivets";
  const rank = qualityRank(item?.quality);
  const amount = Math.max(1, 1 + Math.floor(rank / 2) + Math.floor((Number(item?.upgradeLevel) || 0) / 5));
  const quality = QUALITY_IDS[Math.min(rank, QUALITY_IDS.length - 2)] ?? "common";
  return { materialId, amount, quality };
}
