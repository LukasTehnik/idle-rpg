"use strict";

// =============================================================================
// Prototype 0.6 — KATALOG AFFIXŮ (30 prefixů + 34 suffixů)
// =============================================================================
// Zdroj: docs/idle-rpg-affix-balance-catalog-en.md (má přednost před původním katalogem názvů).
//
// DŮLEŽITÉ — oddělené osy, každá žije na vlastním místě definice:
//   síla (tier)         → `tier`                       (INTERNÍ)
//   ekonomická vzácnost → `scarcity.relativeDropWeight` (INTERNÍ)
//   zdroj               → `scarcity.sourcePools`        (INTERNÍ)
//   progresní pásmo     → `scarcity.progressionBand`    (INTERNÍ, zatím null)
//   obsah pro hráče     → `displayName`, `modifiers`, `drawbacks`, `allowedSlots`, `tradeable`
// Hráčské UI NIKDY nečte tier, design ani scarcity. Čte výhradně view model z
// buildAffixScrollViewModel() (affix-logic.js), který je allowlist.
//
// Žádný affix není v živých dropech: `enabledInLiveDrops: false` (výchozí).
// =============================================================================

const AFFIX_TIER_DEFAULTS = Object.freeze({
  1: { buildRole: "entry", requiredItemLevel: 1, relativeDropWeight: 100 },
  2: { buildRole: "core", requiredItemLevel: 10, relativeDropWeight: 30 },
  3: { buildRole: "specialization", requiredItemLevel: 25, relativeDropWeight: 8 },
  4: { buildRole: "build_defining", requiredItemLevel: 45, relativeDropWeight: 2 },
  5: { buildRole: "signature", requiredItemLevel: 70, relativeDropWeight: 1 },
});

// Interní zdrojové pooly. `approved:false` = zatím nikdo neschválil finální umístění
// (nic se tedy nesmí dostat do živých dropů). `compatibleDropSources` říká, odkud
// by pool jednou směl padat (normální/elitní/boss/lokace).
const SCROLL_SOURCE_POOLS = Object.freeze({
  general_scrolls: { label: "General", approved: false, compatibleDropSources: ["common", "uncommon", "rare", "elite", "boss"], maxTier: 2 },
  general_rare_scrolls: { label: "General rare", approved: false, compatibleDropSources: ["uncommon", "rare", "elite", "boss"], maxTier: 2 },
  material_hunter_scrolls: { label: "Material hunters", approved: false, compatibleDropSources: ["uncommon", "rare", "elite", "boss"], maxTier: 2 },
  elite_scrolls: { label: "Elite pool", approved: false, compatibleDropSources: ["elite", "boss"], maxTier: 3 },
  boss_hunter_scrolls: { label: "Boss-hunter pool", approved: false, compatibleDropSources: ["elite", "boss"], maxTier: 3 },
  defensive_scrolls: { label: "Defensive pool", approved: false, compatibleDropSources: ["elite", "boss"], maxTier: 3 },
  precision_scrolls: { label: "Precision pool", approved: false, compatibleDropSources: ["elite", "boss"], maxTier: 3 },
  risk_scrolls: { label: "Risk pool", approved: false, compatibleDropSources: ["elite", "boss"], maxTier: 3 },
  target_farming_scrolls: { label: "Target-farming pool", approved: false, compatibleDropSources: ["elite", "boss"], maxTier: 3 },
  restricted_farming_scrolls: { label: "Restricted farming pool", approved: false, compatibleDropSources: ["elite", "boss"], maxTier: 3 },
  restricted_risk_scrolls: { label: "Restricted risk pool", approved: false, compatibleDropSources: ["boss"], maxTier: 4 },
  electricity_elite_scrolls: { label: "Electricity elite pool", approved: false, compatibleDropSources: ["elite", "boss"], maxTier: 4, locationId: "elektrika" },
  loc_pustina_ticha: { label: "Wasteland of Silence", approved: false, compatibleDropSources: ["common", "uncommon", "rare", "elite", "boss"], maxTier: 2, locationId: "pustina-ticha" },
  loc_odpadkove_hory: { label: "Waste Mountains", approved: false, compatibleDropSources: ["common", "uncommon", "rare", "elite", "boss"], maxTier: 2, locationId: "odpadkove-hory" },
  loc_magma: { label: "Magma", approved: false, compatibleDropSources: ["uncommon", "elite", "boss"], maxTier: 3, locationId: "magma" },
  loc_elektrika: { label: "Electricity", approved: false, compatibleDropSources: ["uncommon", "elite", "boss"], maxTier: 3, locationId: "elektrika" },
  boss_mother_of_holes: { label: "Mother of Holes", approved: false, compatibleDropSources: ["boss"], maxTier: 4, bossEnemyIds: ["e06"], locationId: "pustina-ticha" },
  boss_collapsed_forge: { label: "Heart of the Collapsed Forge", approved: false, compatibleDropSources: ["boss"], maxTier: 4, bossEnemyIds: ["magma-e05"], locationId: "magma" },
  boss_core_mother: { label: "Core Mother", approved: false, compatibleDropSources: ["boss"], maxTier: 4, bossEnemyIds: ["elektrika-e05"], locationId: "elektrika" },
  signature_scrolls: { label: "Signature pool", approved: false, compatibleDropSources: ["boss"], maxTier: 5 },
  endgame_signature_scrolls: { label: "Endgame signature pool", approved: false, compatibleDropSources: ["boss"], maxTier: 5 },
  restricted_signature_scrolls: { label: "Restricted signature source", approved: false, compatibleDropSources: ["boss"], maxTier: 5 },
});

// Zkratky slotů v tabulce níže. `ALL` = všech sedm slotů vybavení bez křídel
// (křídla jsou zvláštní třída; viz katalog §23).
const SLOT_SHORT = Object.freeze({ W: "weapon", A: "armor", H: "helmet", G: "gloves", P: "pants", B: "boots", T: "charm" });
const AFFIX_ALL_SLOTS = "WAHGPBT";

// Kompaktní zápis: [id, name, tier, category, primaryBuild, secondaryBuilds, slots, modifiers, drawbacks, pools, extras]
//   modifier: [statId, min, max, params?]
const M = (statId, min, max = min, params = null) => ({ statId, min, max, params });

const PREFIX_TABLE = [
  ["prefix_serrated", "Serrated", 1, "basic", "power", [], "W", [M("damage_min", 1), M("damage_max", 1)], [], ["general_scrolls"]],
  ["prefix_reinforced", "Reinforced", 1, "basic", "tank", [], "AHGPB", [M("defense", 1)], [], ["general_scrolls"]],
  ["prefix_vital", "Vital", 1, "basic", "tank", ["sustain"], "AHPT", [M("max_hp", 4, 6)], [], ["general_scrolls"]],
  ["prefix_swift", "Swift", 1, "basic", "speed", [], "WG", [M("attack_speed", 1, 1.5)], [], ["general_scrolls"]],
  ["prefix_piercing", "Piercing", 1, "basic", "power", ["boss_hunter"], "W", [M("defense_penetration", 1)], [], ["general_scrolls"]],
  ["prefix_brutal", "Brutal", 2, "basic", "power", ["critical"], "WG", [M("damage_min", 1), M("damage_max", 2), M("crit_damage", 3, 5)], [], ["general_scrolls"]],

  ["prefix_bloodforged", "Bloodforged", 2, "combined", "power", ["sustain"], "W", [M("damage_min", 1), M("damage_max", 2), M("heal_on_kill", 2, 3)], [], ["general_rare_scrolls"]],
  ["prefix_wardens", "Warden's", 2, "combined", "tank", [], "AHP", [M("defense", 2), M("max_hp", 5, 8)], [], ["general_rare_scrolls"]],
  ["prefix_ravagers", "Ravager's", 3, "combined", "power", [], "W", [M("damage_min", 2), M("damage_max", 2), M("defense_penetration", 1, 2)], [], ["elite_scrolls"]],
  ["prefix_duelists", "Duelist's", 3, "combined", "critical", ["speed"], "WGB", [M("attack_speed", 2, 3), M("crit_chance", 1, 1.5), M("dodge_chance", 0.5, 1)], [], ["elite_scrolls"]],
  ["prefix_undying", "Undying", 3, "combined", "tank", ["sustain"], "AHT", [M("max_hp", 10, 14), M("hp_regen", 0.2, 0.3), M("revive_time", -0.5, -0.3)], [], ["elite_scrolls"]],

  ["prefix_colossus_bane", "Colossus-Bane", 3, "specialized", "boss_hunter", [], "W", [M("boss_damage", 4, 6), M("boss_defense_penetration", 1, 2)], [], ["boss_hunter_scrolls"]],
  ["prefix_elitehunters", "Elitehunter's", 3, "specialized", "elite_hunter", ["critical"], "WGT", [M("elite_damage", 4, 6), M("crit_chance", 1, 1.5)], [], ["elite_scrolls"]],
  ["prefix_mothbane", "Mothbane", 2, "specialized", "specialist", ["moth_specialist"], "W", [M("enemy_family_damage", 4, 6, { family: "moth" }), M("crit_damage", 4, 6)], [], ["loc_pustina_ticha"]],
  ["prefix_lastward", "Lastward", 3, "specialized", "tank", ["low_hp"], "AHT", [M("defense", 2), M("max_hp", 8, 10), M("low_hp_defense", 2)], [], ["defensive_scrolls"]],

  ["prefix_reckless", "Reckless", 3, "risk", "power", ["speed"], "WG", [M("damage_min", 2), M("damage_max", 3), M("attack_speed", 2, 3)], [M("defense", -2)], ["risk_scrolls"]],
  ["prefix_glassbound", "Glassbound", 4, "risk", "critical", [], "WHT", [M("crit_chance", 2, 3), M("crit_damage", 10, 14)], [M("max_hp", -16, -12)], ["restricted_risk_scrolls"]],
  ["prefix_bloodthirsty", "Bloodthirsty", 4, "risk", "power", ["sustain"], "W", [M("damage_min", 2), M("damage_max", 3), M("heal_on_kill", 4, 6)], [M("non_kill_healing", -30)], ["restricted_risk_scrolls"]],
  ["prefix_overcharged", "Overcharged", 4, "risk", "speed", ["electric"], "WGT", [M("attack_speed", 5, 7), M("electric_damage", 2, 3)], [M("defense", -2)], ["electricity_elite_scrolls"]],

  ["prefix_dustborn", "Dustborn", 2, "location", "sustain", ["moth_specialist"], AFFIX_ALL_SLOTS, [M("max_hp", 6, 9), M("enemy_family_damage", 3, 5, { family: "moth" })], [], ["loc_pustina_ticha"], { locationIdentity: "pustina-ticha" }],
  ["prefix_chitinous", "Chitinous", 2, "location", "tank", [], "AHGPB", [M("defense", 2), M("max_hp", 5, 8)], [], ["loc_pustina_ticha"], { locationIdentity: "pustina-ticha" }],
  ["prefix_refuse_forged", "Refuse-Forged", 2, "location", "tank", ["material_farmer"], "WAG", [M("defense", 2), M("material_find", 1, 1.5)], [], ["loc_odpadkove_hory"], { locationIdentity: "odpadkove-hory" }],
  ["prefix_ashforged", "Ashforged", 3, "location", "power", ["fire"], "WA", [M("damage_min", 2), M("damage_max", 3), M("fire_damage", 2)], [], ["loc_magma"], { locationIdentity: "magma" }],
  ["prefix_arcbound", "Arcbound", 3, "location", "speed", ["electric"], "WGT", [M("attack_speed", 3, 4), M("electric_damage", 2)], [], ["loc_elektrika"], { locationIdentity: "elektrika" }],

  ["prefix_broodmothers", "Broodmother's", 4, "boss", "tank", ["sustain", "moth_specialist"], AFFIX_ALL_SLOTS, [M("max_hp", 16, 22), M("heal_on_kill", 4, 6), M("enemy_family_damage", 6, 8, { family: "moth" })], [], ["boss_mother_of_holes"], { uniqueEquipped: true }],
  ["prefix_furnace_hearted", "Furnace-Hearted", 4, "boss", "power", ["tank", "fire"], "WAT", [M("damage_min", 3), M("damage_max", 4), M("defense", 2), M("fire_damage", 3, 4)], [], ["boss_collapsed_forge"], { uniqueEquipped: true }],
  ["prefix_coremothers", "Coremother's", 4, "boss", "speed", ["critical", "electric"], "WGT", [M("attack_speed", 5, 7), M("crit_chance", 2, 3), M("electric_damage", 3)], [], ["boss_core_mother"], { uniqueEquipped: true }],

  ["prefix_sanctified", "Sanctified", 5, "signature", "sustain", ["balanced"], AFFIX_ALL_SLOTS, [M("damage_min", 1), M("damage_max", 2), M("defense", 2), M("trigger_heal_on_damage", 4, 6, { chance: 3, cooldown: 8, event: "on_damage_dealt" })], [], ["signature_scrolls"], { signatureGroup: "signature_sustain" }],
  ["prefix_worldscarred", "Worldscarred", 5, "signature", "power", ["boss_hunter"], "WA", [M("damage_min", 4), M("damage_max", 6), M("boss_damage", 8, 10)], [M("defense", -3)], ["endgame_signature_scrolls"], { signatureGroup: "signature_power" }],
  ["prefix_void_touched", "Void-Touched", 5, "signature", "critical", ["penetration"], "WHT", [M("crit_chance", 3), M("defense_penetration", 2), M("trigger_true_damage_on_crit", 5, 7, { chance: 3, cooldown: 5, event: "on_critical_hit" })], [], ["restricted_signature_scrolls"], { signatureGroup: "signature_critical" }],
];

const SUFFIX_TABLE = [
  ["suffix_of_precision", "of Precision", 1, "basic", "critical", [], "WGHT", [M("crit_chance", 0.5, 1)], [], ["general_scrolls"]],
  ["suffix_of_impact", "of Impact", 1, "basic", "critical", [], "WG", [M("crit_damage", 4, 6)], [], ["general_scrolls"]],
  ["suffix_of_mending", "of Mending", 1, "basic", "sustain", [], "AHPT", [M("hp_regen", 0.15, 0.25)], [], ["general_scrolls"]],
  ["suffix_of_evasion", "of Evasion", 1, "basic", "evasion", ["tank"], "BPT", [M("dodge_chance", 0.5, 1)], [], ["general_scrolls"]],
  ["suffix_of_vigor", "of Vigor", 1, "basic", "tank", [], "AHPT", [M("max_hp", 4, 6)], [], ["general_scrolls"]],
  ["suffix_of_pursuit", "of Pursuit", 1, "basic", "speed_farmer", [], "BGT", [M("search_time", -0.15, -0.1)], [], ["general_scrolls"]],

  ["suffix_of_the_duelist", "of the Duelist", 2, "combined", "critical", ["evasion"], "WGB", [M("crit_chance", 1, 1.5), M("dodge_chance", 0.5, 1)], [], ["general_rare_scrolls"]],
  ["suffix_of_the_reaper", "of the Reaper", 3, "combined", "critical", ["sustain"], "WGT", [M("crit_damage", 8, 12), M("heal_on_kill", 2, 4)], [], ["elite_scrolls"]],
  ["suffix_of_the_bulwark", "of the Bulwark", 2, "combined", "tank", [], "AHP", [M("defense", 2), M("max_hp", 5, 8)], [], ["general_rare_scrolls"]],
  ["suffix_of_momentum", "of Momentum", 3, "combined", "speed_farmer", [], "WGB", [M("attack_speed", 3, 4), M("search_time", -0.25, -0.15)], [], ["elite_scrolls"]],
  ["suffix_of_survival", "of Survival", 3, "combined", "sustain", [], "AHT", [M("hp_regen", 0.3, 0.4), M("heal_on_kill", 2, 3), M("revive_time", -0.6, -0.4)], [], ["elite_scrolls"]],

  ["suffix_of_discovery", "of Discovery", 2, "farming", "treasure_hunter", [], "HGBT", [M("magic_find", 0.5, 1)], [], ["general_rare_scrolls"]],
  ["suffix_of_fortune", "of Fortune", 2, "farming", "gold_farmer", [], "GPBT", [M("gold_find", 2, 3)], [], ["general_rare_scrolls"]],
  ["suffix_of_salvage", "of Salvage", 2, "farming", "material_farmer", [], "GPBT", [M("material_find", 1, 1.5)], [], ["material_hunter_scrolls"]],
  ["suffix_of_learning", "of Learning", 2, "farming", "xp_farmer", [], "HT", [M("xp_gain", 2, 3)], [], ["general_rare_scrolls"]],
  ["suffix_of_the_tracker", "of the Tracker", 3, "farming", "target_farmer", [], "BGT", [M("search_time", -0.3, -0.2), M("enemy_family_damage", 4, 6, { family: "bound" })], [], ["target_farming_scrolls"], { boundFamily: true }],
  ["suffix_of_abundance", "of Abundance", 3, "farming", "gold_farmer", ["material_farmer"], "GPT", [M("gold_find", 2, 3), M("material_find", 1, 1.5)], [], ["restricted_farming_scrolls"]],

  ["suffix_of_giant_slaying", "of Giant-Slaying", 3, "specialized", "boss_hunter", [], "WGT", [M("boss_damage", 5, 7)], [], ["boss_hunter_scrolls"]],
  ["suffix_of_execution", "of Execution", 3, "specialized", "power", [], "W", [M("execution_damage", 6, 8)], [], ["elite_scrolls"]],
  ["suffix_of_the_last_stand", "of the Last Stand", 3, "specialized", "power", ["tank", "low_hp"], "AWT", [M("low_hp_damage", 5, 7), M("low_hp_defense", 2)], [], ["risk_scrolls"]],
  ["suffix_of_the_untouched", "of the Untouched", 3, "specialized", "power", ["evasion", "full_hp"], "WBT", [M("full_hp_damage", 4, 6), M("dodge_chance", 1)], [], ["precision_scrolls"]],

  ["suffix_of_blood_price", "of Blood Price", 4, "risk", "critical", ["sustain"], "WT", [M("crit_damage", 12, 16), M("heal_on_kill", 4, 5)], [M("max_hp", -16, -12)], ["restricted_risk_scrolls"]],
  ["suffix_of_fragility", "of Fragility", 3, "risk", "treasure_hunter", [], "HAT", [M("magic_find", 1.5, 2), M("equipment_drop_chance", 0.5, 0.75)], [M("defense", -2)], ["restricted_farming_scrolls"]],
  ["suffix_of_hunger", "of Hunger", 4, "risk", "power", ["continuous_run"], "WG", [M("hunger_damage_per_kill", 0.6, 0.8, { resetOn: "run_end" }), M("hunger_damage_cap", 6, 8, { resetOn: "run_end" })], [M("all_healing", -25)], ["restricted_risk_scrolls"]],
  ["suffix_of_overload", "of Overload", 4, "risk", "speed", ["electric"], "WGT", [M("attack_speed", 5, 7), M("electric_damage", 2, 3)], [M("damage_taken", 5)], ["electricity_elite_scrolls"]],

  ["suffix_of_silent_dust", "of Silent Dust", 2, "location", "treasure_hunter", ["moth_specialist"], AFFIX_ALL_SLOTS, [M("magic_find", 0.5, 1), M("enemy_family_damage", 3, 5, { family: "moth" })], [], ["loc_pustina_ticha"], { locationIdentity: "pustina-ticha" }],
  ["suffix_of_the_waste_heap", "of the Waste Heap", 2, "location", "material_farmer", ["tank"], "AGPB", [M("material_find", 1, 1.5), M("defense", 1)], [], ["loc_odpadkove_hory"], { locationIdentity: "odpadkove-hory" }],
  ["suffix_of_black_magma", "of Black Magma", 3, "location", "critical", ["fire"], "WAT", [M("crit_damage", 8, 12), M("fire_damage", 2)], [], ["loc_magma"], { locationIdentity: "magma" }],
  ["suffix_of_the_dead_grid", "of the Dead Grid", 3, "location", "speed", ["electric"], "WGBT", [M("attack_speed", 3, 4), M("electric_damage", 2)], [], ["loc_elektrika"], { locationIdentity: "elektrika" }],

  ["suffix_of_the_hole_mother", "of the Hole Mother", 4, "boss", "sustain", ["moth_specialist"], AFFIX_ALL_SLOTS, [M("heal_on_kill", 4, 6), M("max_hp", 14, 20), M("enemy_family_damage", 5, 7, { family: "moth" })], [], ["boss_mother_of_holes"], { uniqueEquipped: true }],
  ["suffix_of_the_collapsed_forge", "of the Collapsed Forge", 4, "boss", "power", ["critical", "fire"], "WGT", [M("defense_penetration", 2), M("crit_damage", 10, 14), M("fire_damage", 3)], [], ["boss_collapsed_forge"], { uniqueEquipped: true }],

  ["suffix_of_transcendence", "of Transcendence", 5, "signature", "balanced", [], AFFIX_ALL_SLOTS, [M("damage_min", 1), M("damage_max", 1), M("defense", 2), M("max_hp", 8), M("crit_chance", 1)], [], ["signature_scrolls"], { signatureGroup: "signature_balanced" }],
  ["suffix_of_final_memory", "of Final Memory", 5, "signature", "treasure_hunter", ["survival"], "HAT", [M("magic_find", 2, 2.5), M("equipment_drop_chance", 0.75, 1), M("gold_find", 2), M("survive_lethal_once", 1, 1, { perExpedition: 1, invulnerableSeconds: 2, event: "on_lethal_damage" })], [], ["restricted_signature_scrolls"], { signatureGroup: "signature_sustain" }],
  ["suffix_of_perfect_resonance", "of Perfect Resonance", 5, "signature", "speed", ["critical"], "WGT", [M("attack_speed", 4, 5), M("crit_chance", 2, 2.5), M("trigger_extra_attack_on_crit", 1, 1, { chance: 2, cooldown: 3, event: "on_critical_hit", canRetrigger: false })], [], ["endgame_signature_scrolls"], { signatureGroup: "signature_critical" }],
];

function buildAffixDefinition(type, row) {
  const [id, displayName, tier, category, primaryBuild, secondaryBuilds, slots, modifiers, drawbacks, pools, extras = {}] = row;
  const defaults = AFFIX_TIER_DEFAULTS[tier];
  const toModifier = (m, drawback) => {
    const stat = STATS[m.statId];
    const modifier = { statId: m.statId, operation: stat.operation, valueType: drawback && stat.valueType !== "triggered" ? "negative" : stat.valueType, minValue: m.min, maxValue: m.max };
    if (m.params) modifier.params = { ...m.params };
    return modifier;
  };
  return {
    id, type, displayName, tier, category,
    visualClass: "affix_scroll", displayTier: false, displayRarity: false,
    // INTERNÍ — hráčské UI tyto bloky nikdy nečte (viz affix-logic.js, buildAffixScrollViewModel).
    design: { visibility: "internal", primaryBuild, secondaryBuilds: [...secondaryBuilds], buildRole: defaults.buildRole },
    scarcity: { visibility: "internal", relativeDropWeight: defaults.relativeDropWeight, progressionBand: null, sourcePools: [...pools] },
    requiredItemLevel: defaults.requiredItemLevel,
    allowedSlots: [...slots].map((letter) => SLOT_SHORT[letter]),
    excludedBaseTags: [],
    modifiers: modifiers.map((m) => toModifier(m, false)),
    drawbacks: drawbacks.map((m) => toModifier(m, true)),
    conflictsWith: [],
    locationIdentity: extras.locationIdentity ?? null,
    uniqueEquipped: extras.uniqueEquipped === true,
    signatureGroup: extras.signatureGroup ?? null,
    boundFamily: extras.boundFamily === true,
    tradeable: true, learnable: true, enabled: true,
    enabledInLiveDrops: false,
    definitionVersion: 1,
  };
}

const AFFIX_DEFINITIONS = Object.freeze([
  ...PREFIX_TABLE.map((row) => buildAffixDefinition("prefix", row)),
  ...SUFFIX_TABLE.map((row) => buildAffixDefinition("suffix", row)),
].map((definition) => Object.freeze(definition)));

const AFFIXES = Object.freeze(Object.fromEntries(AFFIX_DEFINITIONS.map((definition) => [definition.id, definition])));
const AFFIX_CATEGORIES = Object.freeze(["basic", "combined", "specialized", "farming", "risk", "location", "boss", "signature"]);
