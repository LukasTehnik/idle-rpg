"use strict";

// Item tier = síla obsahu; quality = výjimečnost konkrétního kusu.
const ITEMIZATION_VERSION = 1;
const ITEM_QUALITY_RULES = Object.freeze({
  common: Object.freeze({ primaryMultiplier: 1, secondaryCount: 0 }),
  rare: Object.freeze({ primaryMultiplier: 1.18, secondaryCount: 1 }),
  epic: Object.freeze({ primaryMultiplier: 1.45, secondaryCount: 2 }),
  legendary: Object.freeze({ primaryMultiplier: 1.85, secondaryCount: 3 }),
  mythic: Object.freeze({ primaryMultiplier: 2.35, secondaryCount: 4 }),
  god: Object.freeze({ primaryMultiplier: 3, secondaryCount: 5 }),
});
const ITEM_TIER_RULES = Object.freeze({
  1: Object.freeze({ primaryMultiplier: 1, secondaryMultiplier: 1 }),
  2: Object.freeze({ primaryMultiplier: 1.75, secondaryMultiplier: 1.65 }),
  3: Object.freeze({ primaryMultiplier: 2.85, secondaryMultiplier: 2.55 }),
  4: Object.freeze({ primaryMultiplier: 4.35, secondaryMultiplier: 3.9 }),
  5: Object.freeze({ primaryMultiplier: 6.4, secondaryMultiplier: 5.9 }),
  6: Object.freeze({ primaryMultiplier: 9.2, secondaryMultiplier: 8.7 }),
  7: Object.freeze({ primaryMultiplier: 13, secondaryMultiplier: 10 }),
  8: Object.freeze({ primaryMultiplier: 18, secondaryMultiplier: 11 }),
  9: Object.freeze({ primaryMultiplier: 25, secondaryMultiplier: 12 }),
  10: Object.freeze({ primaryMultiplier: 34, secondaryMultiplier: 13 }),
});
const SLOT_PRIMARY_STAT_KEYS = Object.freeze({
  weapon: ["damageMin", "damageMax"], gloves: ["damageMin", "damageMax"],
  armor: ["maxHp"], helmet: ["maxHp"], boots: ["maxHp"], pants: ["maxHp"], wings: ["maxHp"], charm: ["maxHp", "damageMax"],
});
// Pouze staty s funkční bojovou logikou. Pokročilé/farmicí staty zůstávají uzamčené.
const ITEM_SECONDARY_POOL = Object.freeze([
  Object.freeze({ id: "critical-strike", stats: Object.freeze({ critChance: [0.3, 1.2] }) }),
  Object.freeze({ id: "vitality", stats: Object.freeze({ maxHp: [2, 8] }) }),
  Object.freeze({ id: "offense", stats: Object.freeze({ damageMin: [1, 1], damageMax: [1, 3] }) }),
  Object.freeze({ id: "defense", stats: Object.freeze({ defense: [1, 3] }) }),
  Object.freeze({ id: "attack-speed", stats: Object.freeze({ attackSpeed: [1, 3] }) }),
]);
function normalizeItemTier(value) { const tier = Math.floor(Number(value) || 1); return ITEM_TIER_RULES[tier] ? tier : 1; }
function itemPrimaryRolls(template) {
  const source = template?.primaryRolls ?? template?.rolls ?? {}; const keys = SLOT_PRIMARY_STAT_KEYS[template?.slot] ?? Object.keys(source);
  const selected = Object.fromEntries(Object.entries(source).filter(([key]) => keys.includes(key)));
  return Object.keys(selected).length ? selected : Object.fromEntries(Object.entries(source).slice(0, 1));
}
function itemRound(key, value) { return key === "critChance" || key === "attackSpeed" ? Math.round(value * 10) / 10 : Math.max(key === "damageMin" ? 0 : 1, Math.round(value)); }
function rollRange(key, range, multiplier, rng) { const min = Number(range?.[0]) || 0; const max = Number(range?.[1]) || min; return itemRound(key, (min + (max - min) * rng()) * multiplier); }
function rollItemStats(template, { quality = DEFAULT_QUALITY, itemTier = 1, rng = Math.random } = {}) {
  const q = ITEM_QUALITY_RULES[normalizeQuality(quality)] ?? ITEM_QUALITY_RULES.common; const tier = ITEM_TIER_RULES[normalizeItemTier(itemTier)];
  const baseStats = {}; Object.entries(itemPrimaryRolls(template)).forEach(([key, range]) => { baseStats[key] = rollRange(key, range, q.primaryMultiplier * tier.primaryMultiplier, rng); });
  const stats = { ...baseStats }; const candidates = [...ITEM_SECONDARY_POOL]; const secondaryStats = [];
  for (let i = 0; i < q.secondaryCount; i += 1) { const def = candidates.splice(Math.min(candidates.length-1,Math.floor(rng() * candidates.length)), 1)[0]; const rolled = {}; Object.entries(def.stats).forEach(([key, range]) => { const multiplier=key === "critChance" || key === "attackSpeed" ? Math.min(4,tier.secondaryMultiplier) : tier.secondaryMultiplier; const value = rollRange(key, range, multiplier, rng); rolled[key] = value; stats[key] = itemRound(key, (stats[key] ?? 0) + value); }); secondaryStats.push({ id: def.id, stats: rolled }); }
  return { baseStats, secondaryStats, stats, itemTier: normalizeItemTier(itemTier), version: ITEMIZATION_VERSION };
}
function rollAffixTierFromPool(pool, rng = Math.random) { const entries = Object.entries(pool ?? {}).filter(([tier, weight]) => ITEM_TIER_RULES[tier] && Number(weight) > 0); if (!entries.length) return null; let roll = rng() * entries.reduce((sum, [, weight]) => sum + Number(weight), 0); for (const [tier, weight] of entries) { roll -= Number(weight); if (roll < 0) return Number(tier); } return Number(entries.at(-1)[0]); }
