"use strict";

// =============================================================================
// Prototype 0.6 — CENTRÁLNÍ REGISTR STATŮ (Stat Registry)
// =============================================================================
// Jediné místo, kde se definuje, co stat znamená. Výpočet, UI i porovnání
// rozpoznávají stat výhradně podle `id` — nikdy podle zobrazovaného názvu.
// Nový stat = nový řádek v STAT_DEFINITIONS (+ případně formatter), bez zásahu
// do inventáře, porovnání nebo savu (item ukládá jen { statId, value }).
//
// Pole definice statu:
//   id            stabilní identifikátor (snake_case, nikdy se nemění)
//   displayName   anglický název pro hráče
//   valueType     flat | range_flat | percent_additive | percent_multiplicative |
//                 time_flat | chance | conditional | triggered | typed_damage | resistance
//                 (záporná hodnota = "negative"; viz `polarity`)
//   operation     add | multiply | set_min | trigger   (jak se hodnota skládá)
//   format        klíč formatteru v STAT_FORMATTERS (flat, percent, seconds, …)
//   stackingRule  additive | multiplicative | strongest (unikátní trigger) | unique_equipped
//   cap           null | { type:"hard", max } | { type:"soft", softAfter, hardMax, factor }
//                       | { type:"floor", min, unit }   (minimální výsledný interval)
//   enabled       false = stat se ignoruje všude (výpočet, UI, validace)
//   version       verze definice statu
// Doplňková pole:
//   polarity      positive | negative (kterým směrem je hodnota "lepší": viz `comparison`)
//   comparison    higherIsBetter | lowerIsBetter
//   condition     null | id podmínky z STAT_CONDITIONS (podmíněný modifier)
//   calc          "active" = zapojeno do živého výpočtu postavy (liveKey),
//                 "prepared" = pouze data (systém, na kterém závisí, ještě neexistuje)
//   liveKey       klíč v item.stats (jen pro calc:"active")
//   unit          zobrazovaná jednotka
//   system        interní poznámka, na který budoucí systém se stat váže (jen vývojový nástroj)
// =============================================================================

const STAT_VALUE_TYPES = Object.freeze([
  "flat", "range_flat", "percent_additive", "percent_multiplicative", "time_flat",
  "chance", "conditional", "triggered", "typed_damage", "resistance",
]);
const STAT_OPERATIONS = Object.freeze(["add", "multiply", "trigger"]);
const STAT_STACKING_RULES = Object.freeze(["additive", "multiplicative", "strongest", "unique_equipped"]);

// Podmínky pro podmíněné staty. Definice sdílených triggerů viz balance katalog §6.
const STAT_CONDITIONS = Object.freeze({
  enemy_boss: { text: "against Bosses" },
  enemy_elite: { text: "against Elites" },
  enemy_family: { text: "against {family}" },
  low_hp: { text: "while at Low HP (≤30% max HP)" },
  full_hp: { text: "while at Full HP" },
  execution: { text: "against enemies at or below 30% HP" },
  continuous_run: { text: "during a continuous run" },
});

const STAT_DEFINITIONS = Object.freeze([
  // --- Základní bojové staty (aktivní) -------------------------------------
  { id: "damage_min", displayName: "Minimum Damage", valueType: "range_flat", operation: "add", format: "flat", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "active", liveKey: "damageMin", unit: "" },
  { id: "damage_max", displayName: "Maximum Damage", valueType: "range_flat", operation: "add", format: "flat", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "active", liveKey: "damageMax", unit: "" },
  { id: "max_hp", displayName: "Maximum HP", valueType: "flat", operation: "add", format: "flat", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "active", liveKey: "maxHp", unit: "" },
  { id: "crit_chance", displayName: "Critical Chance", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: { type: "hard", max: 50 }, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "active", liveKey: "critChance", unit: "%" },

  // --- Základní staty bez zatím existujícího výpočtu (data připravena) --------
  { id: "defense", displayName: "Defense", valueType: "flat", operation: "add", format: "flat", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "", system: "combat-defense" },
  { id: "crit_damage", displayName: "Critical Damage", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "combat-crit-damage" },
  { id: "attack_speed", displayName: "Attack Speed", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: { type: "floor", min: 0.65, unit: "s", target: "attack_interval" }, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "combat-attack-interval" },
  { id: "defense_penetration", displayName: "Defense Penetration", valueType: "flat", operation: "add", format: "flat", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "", system: "combat-defense" },
  { id: "hp_regen", displayName: "Regeneration", valueType: "flat", operation: "add", format: "hpPerSecond", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "HP/s", system: "combat-regeneration" },
  { id: "heal_on_kill", displayName: "Heal on Kill", valueType: "flat", operation: "add", format: "hpFlat", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "HP", system: "combat-healing" },
  { id: "dodge_chance", displayName: "Dodge Chance", valueType: "chance", operation: "add", format: "percent", stackingRule: "additive", cap: { type: "hard", max: 35 }, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "combat-dodge" },
  { id: "revive_time", displayName: "Revive Time", valueType: "time_flat", operation: "add", format: "seconds", stackingRule: "additive", cap: { type: "floor", min: 2, unit: "s", target: "revive_time" }, enabled: true, version: 1, polarity: "positive", comparison: "lowerIsBetter", calc: "prepared", unit: "s", system: "revive-timer" },
  { id: "search_time", displayName: "Search Time", valueType: "time_flat", operation: "add", format: "seconds", stackingRule: "additive", cap: { type: "floor", min: 0.75, unit: "s", target: "search_time" }, enabled: true, version: 1, polarity: "positive", comparison: "lowerIsBetter", calc: "prepared", unit: "s", system: "search-timer" },

  // --- Farmicí a idle staty (zatím bez základu pro výpočet) -------------------
  { id: "magic_find", displayName: "Magic Find", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: { type: "soft", softAfter: 10, hardMax: 20, factor: 0.5 }, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "loot-quality" },
  { id: "gold_find", displayName: "Gold Find", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "loot-gold" },
  { id: "material_find", displayName: "Material Find", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "loot-materials" },
  { id: "xp_gain", displayName: "XP Gain", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "xp" },
  { id: "equipment_drop_chance", displayName: "Equipment Drop Chance", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "loot-equipment" },

  // --- Podmíněné staty ------------------------------------------------------
  { id: "boss_damage", displayName: "Damage", valueType: "conditional", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", condition: "enemy_boss", calc: "prepared", unit: "%", system: "enemy-class-boss" },
  { id: "boss_defense_penetration", displayName: "Defense Penetration", valueType: "conditional", operation: "add", format: "flat", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", condition: "enemy_boss", calc: "prepared", unit: "", system: "enemy-class-boss" },
  { id: "elite_damage", displayName: "Damage", valueType: "conditional", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", condition: "enemy_elite", calc: "prepared", unit: "%", system: "enemy-class-elite" },
  { id: "enemy_family_damage", displayName: "Damage", valueType: "conditional", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", condition: "enemy_family", calc: "prepared", unit: "%", system: "enemy-families", parametrized: "family" },
  { id: "low_hp_damage", displayName: "Damage", valueType: "conditional", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", condition: "low_hp", calc: "prepared", unit: "%", system: "combat-hp-conditions" },
  { id: "low_hp_defense", displayName: "Defense", valueType: "conditional", operation: "add", format: "flat", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", condition: "low_hp", calc: "prepared", unit: "", system: "combat-hp-conditions" },
  { id: "full_hp_damage", displayName: "Damage", valueType: "conditional", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", condition: "full_hp", calc: "prepared", unit: "%", system: "combat-hp-conditions" },
  { id: "execution_damage", displayName: "Damage", valueType: "conditional", operation: "add", format: "percent", stackingRule: "strongest", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", condition: "execution", calc: "prepared", unit: "%", system: "combat-execution" },
  { id: "hunger_damage_per_kill", displayName: "Damage per kill", valueType: "conditional", operation: "add", format: "percent", stackingRule: "strongest", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", condition: "continuous_run", calc: "prepared", unit: "%", system: "run-kill-streak" },
  { id: "hunger_damage_cap", displayName: "Damage bonus cap from kills", valueType: "conditional", operation: "add", format: "percent", stackingRule: "strongest", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", condition: null, calc: "prepared", unit: "%", system: "run-kill-streak" },

  // --- Typed damage / odolnosti (budoucí elementální systém; bez základu pro výpočet) ---
  { id: "fire_damage", displayName: "Fire Damage", valueType: "typed_damage", operation: "add", format: "flat", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "", system: "elemental-fire" },
  { id: "electric_damage", displayName: "Electric Damage", valueType: "typed_damage", operation: "add", format: "flat", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "", system: "elemental-electric" },
  { id: "fire_resistance", displayName: "Fire Resistance", valueType: "resistance", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "elemental-fire" },
  { id: "electric_resistance", displayName: "Electric Resistance", valueType: "resistance", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "elemental-electric" },

  // --- Rizikové / záporné modifikátory ----------------------------------------
  { id: "non_kill_healing", displayName: "Non-kill Healing", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "combat-healing" },
  { id: "all_healing", displayName: "All Healing", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "%", system: "combat-healing" },
  { id: "damage_taken", displayName: "Damage Taken", valueType: "percent_additive", operation: "add", format: "percent", stackingRule: "additive", cap: null, enabled: true, version: 1, polarity: "negative", comparison: "lowerIsBetter", calc: "prepared", unit: "%", system: "combat-defense" },

  // --- Násobitel (vzácný, výslovně označený; katalog zatím nepoužívá) ---------------
  { id: "damage_multiplier", displayName: "Damage Multiplier", valueType: "percent_multiplicative", operation: "multiply", format: "multiplier", stackingRule: "multiplicative", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "×", system: "combat-damage" },

  // --- Triggerované efekty ------------------------------------------------------
  // `value` = hlavní rolovaná hodnota; ostatní parametry (šance, cooldown, …) nese modifier v `params`.
  { id: "trigger_heal_on_damage", displayName: "Heal on dealing damage", valueType: "triggered", operation: "trigger", format: "triggerHeal", stackingRule: "strongest", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "HP", system: "combat-triggers" },
  { id: "trigger_true_damage_on_crit", displayName: "True damage on critical hit", valueType: "triggered", operation: "trigger", format: "triggerTrueDamage", stackingRule: "strongest", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "", system: "combat-triggers" },
  { id: "trigger_extra_attack_on_crit", displayName: "Extra attack on critical hit", valueType: "triggered", operation: "trigger", format: "triggerExtraAttack", stackingRule: "strongest", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "", system: "combat-triggers", cannotRetrigger: true },
  { id: "survive_lethal_once", displayName: "Survive lethal damage", valueType: "triggered", operation: "trigger", format: "triggerSurvive", stackingRule: "unique_equipped", cap: null, enabled: true, version: 1, polarity: "positive", comparison: "higherIsBetter", calc: "prepared", unit: "", system: "run-expedition-triggers" },
]);

const STATS = Object.freeze(Object.fromEntries(STAT_DEFINITIONS.map((definition) => [definition.id, definition])));

// --- Formátování --------------------------------------------------------------
function statNumber(value, digits = 2) {
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return String(rounded);
}

// Netriggerované formáty: znaménko + číslo + jednotka ("+4 HP", "−0.2 s", "+1.5%", "×1.05").
const STAT_FORMAT_PARTS = Object.freeze({
  flat: { unit: "" },
  hpFlat: { unit: " HP" },
  percent: { unit: "%" },
  seconds: { unit: " s" },
  hpPerSecond: { unit: " HP/s" },
  multiplier: { prefix: "×", unit: "", unsigned: true },
});

// Triggerované formáty dostanou hlavní hodnotu jako hotový text ("5" nebo "4–6").
const STAT_FORMATTERS = Object.freeze({
  ...Object.fromEntries(Object.keys(STAT_FORMAT_PARTS).map((key) => [key, null])),
  triggerHeal: (valueText, params = {}) => `After dealing damage: ${statNumber(params.chance ?? 0)}% chance to restore ${valueText} HP (cooldown ${statNumber(params.cooldown ?? 0)} s)`,
  triggerTrueDamage: (valueText, params = {}) => `After a critical hit: ${statNumber(params.chance ?? 0)}% chance to deal ${valueText} true damage (cooldown ${statNumber(params.cooldown ?? 0)} s)`,
  triggerExtraAttack: (valueText, params = {}) => `After a critical hit: ${statNumber(params.chance ?? 0)}% chance to perform one immediate extra attack (cooldown ${statNumber(params.cooldown ?? 0)} s)`,
  triggerSurvive: (valueText, params = {}) => `Once per expedition: lethal damage leaves you at ${valueText} HP and grants ${statNumber(params.invulnerableSeconds ?? 0)} s without incoming damage`,
});

function getStat(statId) { return STATS[statId] ?? null; }
function isStatEnabled(statId) { return Boolean(STATS[statId]?.enabled); }

// Podmínka modifieru jako text ("against Bosses", "against Moth enemies"…).
function formatStatCondition(statId, params = {}) {
  const stat = STATS[statId];
  if (!stat?.condition) return "";
  const family = params.family;
  const familyLabel = family === "bound" ? "the bound enemy family" : (family ? `${family.charAt(0).toUpperCase()}${family.slice(1)} enemies` : "the chosen enemy family");
  return STAT_CONDITIONS[stat.condition].text.replace("{family}", familyLabel);
}

// Číselná část modifieru. `value` = číslo (konkrétní roll) nebo { min, max } (rozsah z definice).
function formatStatValue(statId, value) {
  const stat = STATS[statId];
  const parts = STAT_FORMAT_PARTS[stat.format];
  if (!parts) return typeof value === "object" ? (value.min === value.max ? statNumber(value.min) : `${statNumber(value.min)}–${statNumber(value.max)}`) : statNumber(value);
  const prefix = parts.prefix ?? "";
  const sign = (number) => (parts.unsigned ? "" : number < 0 ? "−" : "+");
  const one = (number) => `${prefix}${sign(number)}${statNumber(Math.abs(number))}${parts.unit}`;
  if (value && typeof value === "object") {
    if (value.min === value.max) return one(value.min);
    const [near, far] = Math.abs(value.min) <= Math.abs(value.max) ? [value.min, value.max] : [value.max, value.min];
    if (near < 0 && far < 0) return `${prefix}${sign(near)}${statNumber(Math.abs(near))} to ${sign(far)}${statNumber(Math.abs(far))}${parts.unit}`;
    return `${prefix}${sign(near)}${statNumber(Math.abs(near))}–${statNumber(Math.abs(far))}${parts.unit}`;
  }
  return one(value);
}

// Jeden modifier → jeden řádek textu pro hráče.
//   "+4–6 Maximum HP"   "−2 Defense"   "+4–6% Damage against Bosses"
function formatModifier(statId, value, params = {}) {
  const stat = STATS[statId];
  if (!stat) return `Unknown stat (${statId})`;
  if (stat.valueType === "triggered") return STAT_FORMATTERS[stat.format](formatStatValue(statId, value), params);
  const condition = formatStatCondition(statId, params);
  const trailing = stat.suffixText ? ` ${stat.suffixText}` : "";
  return `${formatStatValue(statId, value)} ${stat.displayName}${trailing}${condition ? ` ${condition}` : ""}`;
}
