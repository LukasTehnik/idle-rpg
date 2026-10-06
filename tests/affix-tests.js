"use strict";
// Prototype 0.6 — logické testy (Node, bez závislostí): `node tests/affix-tests.js`
// Skripty hry se načtou do jednoho vm kontextu stejně jako v prohlížeči (sdílený globální scope).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = { console, Math, Date, JSON, Object, Array, Set, Map, Number, String };
vm.createContext(context);
const files = ["quality-data.js", "item-data.js", "economy-data.js", "material-data.js", "world-data.js", "stat-data.js", "affix-data.js", "affix-logic.js", "scroll-ui.js"];
const source = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n;\n");
// `const` deklarace nejsou vlastnosti kontextu → vyexportujeme je explicitně.
vm.runInContext(`${source}
;this.api = { STATS, STAT_DEFINITIONS, AFFIXES, AFFIX_DEFINITIONS, SCROLL_SOURCE_POOLS, ENEMIES, ITEM_TEMPLATES, SLOT_META,
  formatModifier, getAffix, listAffixes, validateAffixCatalog, validateAffixForLiveDrop, validateScrollDropConfig, scrollSpecificChance, pickScrollFromPool,
  SCROLL_DROP_TEST_FIXTURE, getLiveDropAffixIds, rollAffix, applyAffixToItem, removeAffixFromItem, checkAffixOnItem, computeAffixTotals, applyStatCap,
  computeEffectiveTimes, effectiveTargetDefense, effectivePlayerDefense, createAffixScroll, sanitizeAffixScroll, sanitizeAffixScrolls, sanitizeItemAffixes,
  buildAffixScrollViewModel, buildItemAffixLines, composeAffixedName, AFFIX_SCROLL_VIEW_KEYS, affixLiveBonus, AFFIX_EQUIPMENT_SLOTS, AFFIX_TIER_DEFAULTS,
  collectItemModifiers, compareAffixTotals, emptyAffixSlots, getAffixScrollColor, AFFIX_SCROLL_COLORS, AFFIX_SCROLL_IMAGES };`, context);
const api = context.api;

let passed = 0; const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.log(`  FAIL ${name}\n       ${error.message}`); }
}
function assert(condition, message = "assertion failed") { if (!condition) throw new Error(message); }
function eq(actual, expected, message = "") { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message} očekáváno ${JSON.stringify(expected)}, je ${JSON.stringify(actual)}`); }
const item = (slot, extra = {}) => ({ slot, prefix: null, suffix: null, tags: [], ...extra });

console.log("Katalog");
test("načte 30 prefixů + 34 suffixů = 64 unikátních ID", () => {
  eq(api.listAffixes("prefix").length, 30); eq(api.listAffixes("suffix").length, 34);
  eq(api.AFFIX_DEFINITIONS.length, 64); eq(new Set(api.AFFIX_DEFINITIONS.map((a) => a.id)).size, 64);
});
test("validace katalogu bez chyb", () => { const r = api.validateAffixCatalog(); assert(r.ok, r.errors.join("; ")); });
test("každý modifier odkazuje na existující a povolený stat", () => {
  for (const a of api.AFFIX_DEFINITIONS) for (const m of [...a.modifiers, ...a.drawbacks]) assert(api.STATS[m.statId]?.enabled, `${a.id}: ${m.statId}`);
});
test("interní data jsou oddělená a označená internal", () => {
  for (const a of api.AFFIX_DEFINITIONS) {
    eq(a.design.visibility, "internal"); eq(a.scarcity.visibility, "internal"); eq(a.scarcity.progressionBand, null);
    assert(Array.isArray(a.scarcity.sourcePools) && a.scarcity.sourcePools.length > 0, a.id);
    eq(a.enabledInLiveDrops, false); eq(a.definitionVersion, 1); eq(a.visualClass, "affix_scroll"); eq(a.displayTier, false); eq(a.displayRarity, false);
  }
});
test("tier výchozí váhy 100/30/8/2/1 a úrovně 1/10/25/45/70", () => {
  const weights = { 1: 100, 2: 30, 3: 8, 4: 2, 5: 1 }; const levels = { 1: 1, 2: 10, 3: 25, 4: 45, 5: 70 };
  for (const a of api.AFFIX_DEFINITIONS) { eq(a.scarcity.relativeDropWeight, weights[a.tier], a.id); eq(a.requiredItemLevel, levels[a.tier], a.id); }
});
test("T5 není v žádném pooly pro časnou ani střední hru", () => {
  for (const a of api.AFFIX_DEFINITIONS.filter((x) => x.tier === 5)) for (const pool of a.scarcity.sourcePools) eq(api.SCROLL_SOURCE_POOLS[pool].maxTier, 5, `${a.id}/${pool}`);
});
test("hodnoty z katalogu (vzorek)", () => {
  const m = (id, stat) => api.AFFIXES[id].modifiers.find((x) => x.statId === stat);
  eq([m("prefix_vital", "max_hp").minValue, m("prefix_vital", "max_hp").maxValue], [4, 6]);
  eq([m("suffix_of_pursuit", "search_time").minValue, m("suffix_of_pursuit", "search_time").maxValue], [-0.15, -0.1]);
  eq(api.AFFIXES.prefix_glassbound.drawbacks[0].statId, "max_hp");
  eq(api.AFFIXES.prefix_worldscarred.drawbacks[0].minValue, -3);
  eq(api.AFFIXES.suffix_of_overload.drawbacks[0].statId, "damage_taken");
  eq(api.AFFIXES.prefix_serrated.allowedSlots, ["weapon"]);
  eq(api.AFFIXES.suffix_of_learning.allowedSlots, ["helmet", "charm"]);
});
test("T4 boss affixy jsou uniqueEquipped, T5 mají signatureGroup", () => {
  const bossIds = ["prefix_broodmothers", "prefix_furnace_hearted", "prefix_coremothers", "suffix_of_the_hole_mother", "suffix_of_the_collapsed_forge"];
  bossIds.forEach((id) => eq(api.AFFIXES[id].uniqueEquipped, true, id));
  api.AFFIX_DEFINITIONS.filter((a) => a.tier === 5).forEach((a) => assert(a.signatureGroup, a.id));
});

console.log("Registr statů");
test("registr má povinná pole a stabilní ID", () => {
  for (const s of api.STAT_DEFINITIONS) for (const key of ["id", "displayName", "valueType", "operation", "format", "stackingRule", "enabled", "version"]) assert(s[key] !== undefined, `${s.id}.${key}`);
  eq(new Set(api.STAT_DEFINITIONS.map((s) => s.id)).size, api.STAT_DEFINITIONS.length);
});
test("registr pokrývá všechny typy hodnot", () => {
  const types = new Set(api.STAT_DEFINITIONS.map((s) => s.valueType));
  for (const t of ["flat", "range_flat", "percent_additive", "percent_multiplicative", "time_flat", "chance", "conditional", "triggered", "typed_damage", "resistance"]) assert(types.has(t), t);
});
test("formátování: flat, percent, time, chance, conditional, triggered, negative", () => {
  const f = api.formatModifier;
  eq(f("max_hp", { min: 4, max: 6 }), "+4–6 Maximum HP");
  eq(f("defense", -2), "−2 Defense");
  eq(f("attack_speed", { min: 1, max: 1.5 }), "+1–1.5% Attack Speed");
  eq(f("search_time", { min: -0.15, max: -0.1 }), "−0.1 to −0.15 s Search Time");
  eq(f("dodge_chance", { min: 0.5, max: 1 }), "+0.5–1% Dodge Chance");
  eq(f("hp_regen", { min: 0.15, max: 0.25 }), "+0.15–0.25 HP/s Regeneration");
  eq(f("boss_damage", { min: 4, max: 6 }), "+4–6% Damage against Bosses");
  eq(f("enemy_family_damage", { min: 4, max: 6 }, { family: "moth" }), "+4–6% Damage against Moth enemies");
  eq(f("low_hp_defense", 2), "+2 Defense while at Low HP (≤30% max HP)");
  eq(f("max_hp", { min: -16, max: -12 }), "−12 to −16 Maximum HP");
  eq(f("trigger_heal_on_damage", { min: 4, max: 6 }, { chance: 3, cooldown: 8 }), "After dealing damage: 3% chance to restore 4–6 HP (cooldown 8 s)");
  eq(f("trigger_true_damage_on_crit", { min: 5, max: 7 }, { chance: 3, cooldown: 5 }), "After a critical hit: 3% chance to deal 5–7 true damage (cooldown 5 s)");
  eq(f("damage_multiplier", 1.05), "×1.05 Damage Multiplier");
  eq(f("nope", 1), "Unknown stat (nope)");
});
test("výpočet nerozpoznává stat podle textu (změna názvu nic nerozbije)", () => {
  const witem = api.applyAffixToItem(item("weapon"), "prefix_serrated", { fraction: 1 }).item;
  const before = api.computeAffixTotals([witem]).totals;
  eq(before.damage_min, 1);
  // živý bonus se čte přes liveKey z registru
  eq(api.affixLiveBonus(witem, "damageMin"), 1);
  eq(api.affixLiveBonus(witem, "defense"), 0);
});

console.log("Svitky a vzhled");
test("entita svitku nemá quality ani rarity", () => {
  const s = api.createAffixScroll("suffix_of_vigor");
  eq(Object.keys(s).sort(), ["affixId", "affixType", "instanceId", "itemType", "tradeable", "visualClass"]);
  eq(s.itemType, "affix_scroll"); eq(s.visualClass, "affix_scroll");
  assert(!("quality" in s) && !("rarity" in s));
});
test("instanceId jsou unikátní", () => {
  const ids = new Set(Array.from({ length: 500 }, () => api.createAffixScroll("prefix_serrated").instanceId)); eq(ids.size, 500);
});
test("barva svitku: jen 4 povolené, všechny se používají a nekorelují s tierem", () => {
  const byColor = {};
  for (const a of api.AFFIX_DEFINITIONS) {
    const c = api.getAffixScrollColor(a); assert(api.AFFIX_SCROLL_COLORS.includes(c), `${a.id}: ${c}`);
    (byColor[c] ??= new Set()).add(a.tier);
    eq(api.buildAffixScrollViewModel({ affixId: a.id, tradeable: true }).scrollColor, c);
  }
  for (const c of api.AFFIX_SCROLL_COLORS) assert(byColor[c] && byColor[c].size >= 3, `barva ${c} prozrazuje tier: ${[...(byColor[c] ?? [])]}`);
  eq(Object.keys(api.AFFIX_SCROLL_IMAGES).sort(), [...api.AFFIX_SCROLL_COLORS].sort());
});
test("view model má přesně 8 povolených polí a žádná interní data", () => {
  const banned = /\b(T[1-5]|tier|rarity|quality|common|rare|epic|legendary|mythic|god|weight|scarcity|design|buildRole|primaryBuild|recommended|best for|boss hunter|farming build)\b/i;
  for (const a of api.AFFIX_DEFINITIONS) {
    const vm_ = api.buildAffixScrollViewModel({ affixId: a.id, tradeable: true });
    eq(Object.keys(vm_), api.AFFIX_SCROLL_VIEW_KEYS.slice());
    const text = JSON.stringify([vm_.formattedModifiers, vm_.formattedConditions, vm_.allowedSlots]);
    const hit = text.match(banned);
    assert(!hit, `${a.id}: "${hit?.[0]}" v textu pro hráče`);
    for (const forbidden of ["tier", "design", "scarcity", "relativeDropWeight", "sourcePools", "enabledInLiveDrops", "primaryBuild"]) assert(!(forbidden in vm_), `${a.id}: ${forbidden}`);
  }
});
test("view model obsahuje jen názvy, rozsahy, podmínky, sloty, obchodovatelnost", () => {
  const vm_ = api.buildAffixScrollViewModel(api.createAffixScroll("prefix_reckless"));
  eq(vm_.displayName, "Reckless"); eq(vm_.affixType, "prefix");
  eq(vm_.formattedModifiers.map((m) => m.text), ["+2 Minimum Damage", "+3 Maximum Damage", "+2–3% Attack Speed", "−2 Defense"]);
  eq(vm_.formattedModifiers.map((m) => m.negative), [false, false, false, true]);
  eq(vm_.allowedSlots, ["Weapon", "Gloves"]); eq(vm_.requiredLevel, null); eq(vm_.tradeable, true);
});
test("−0,2 s hledání je bonus, ne nevýhoda", () => {
  const line = api.buildAffixScrollViewModel({ affixId: "suffix_of_pursuit", tradeable: true }).formattedModifiers[0];
  eq(line.negative, false);
});

console.log("Itemy, sloty, konflikty");
test("slotová validace", () => {
  assert(api.checkAffixOnItem(item("weapon"), "prefix_serrated").ok);
  assert(!api.checkAffixOnItem(item("armor"), "prefix_serrated").ok);
  assert(!api.checkAffixOnItem(item("wings"), "prefix_vital").ok);
  for (const a of api.AFFIX_DEFINITIONS) for (const slot of a.allowedSlots) assert(api.AFFIX_EQUIPMENT_SLOTS.includes(slot), `${a.id}:${slot}`);
});
test("prefix + suffix na jednom itemu, nejvýše po jednom", () => {
  let r = api.applyAffixToItem(item("weapon"), "prefix_serrated"); assert(r.ok);
  r = api.applyAffixToItem(r.item, "suffix_of_precision"); assert(r.ok);
  assert(r.item.prefix && r.item.suffix);
  // nový prefix nahradí starý (dvě affixové pozice, ne tři)
  const r2 = api.applyAffixToItem(api.removeAffixFromItem(r.item, "prefix"), "prefix_swift"); assert(r2.ok);
  eq(r2.item.prefix.affixId, "prefix_swift"); eq(r2.item.suffix.affixId, "suffix_of_precision");
  assert(Object.keys(r2.item).filter((k) => k === "prefix" || k === "suffix").length === 2);
});
test("suffix nejde použít jako prefix a naopak (typ je daný definicí)", () => {
  const r = api.applyAffixToItem(item("weapon"), "suffix_of_precision");
  eq(Object.keys(r.item).includes("suffix"), true); eq(r.item.prefix, null);
});
test("rolled values se uloží do itemu a hodnoty leží v rozsahu", () => {
  for (let i = 0; i < 200; i += 1) {
    const rolled = api.rollAffix("prefix_vital");
    const v = rolled.rolledModifiers[0].value; assert(v >= 4 && v <= 6 && Number.isInteger(v), String(v));
    const r = api.rollAffix("suffix_of_mending").rolledModifiers[0].value; assert(r >= 0.15 && r <= 0.25, String(r));
  }
  const rolled = api.rollAffix("prefix_vital", { fraction: 1 });
  eq(rolled, { affixId: "prefix_vital", definitionVersion: 1, rolledModifiers: [{ statId: "max_hp", value: 6 }] });
  eq(api.rollAffix("prefix_glassbound", { fraction: 0 }).rolledModifiers[2], { statId: "max_hp", value: -16, drawback: true });
});
test("starý item se nezmění při změně definice", () => {
  const armor = api.applyAffixToItem(item("armor"), "suffix_of_vigor", { fraction: 1 }).item;
  const before = JSON.stringify(api.computeAffixTotals([armor]).totals);
  const changed = JSON.parse(JSON.stringify(api.AFFIXES)); changed.suffix_of_vigor.modifiers[0].maxValue = 99; changed.suffix_of_vigor.definitionVersion = 2;
  eq(JSON.stringify(api.computeAffixTotals([armor], { definitions: changed }).totals), before);
  eq(armor.suffix.definitionVersion, 1); eq(armor.suffix.rolledModifiers[0].value, 6);
});
test("blokované kombinace: zrušení nevýhody", () => {
  const r = api.checkAffixOnItem(api.applyAffixToItem(item("armor"), "prefix_wardens").item, "suffix_of_the_bulwark");
  assert(r.ok); // není rizikový → jen duplicitní bonus je povolen
  const reckless = api.applyAffixToItem(item("gloves"), "prefix_reckless").item;
  assert(!api.checkAffixOnItem({ ...reckless, slot: "armor" }, "suffix_of_the_bulwark").ok);
  const wp = api.applyAffixToItem(item("armor"), "prefix_wardens").item;
  assert(api.checkAffixOnItem(wp, "suffix_of_the_bulwark").ok);
  const glass = api.applyAffixToItem(item("helmet"), "prefix_glassbound").item;
  assert(api.checkAffixOnItem(glass, "suffix_of_vigor").ok, "Vigor +4–6 HP nevymaže −12…−16 HP");
});
test("blokované kombinace: lokační identity", () => {
  const dust = api.applyAffixToItem(item("armor"), "prefix_dustborn").item;
  assert(!api.checkAffixOnItem(dust, "suffix_of_the_waste_heap").ok);
  assert(api.checkAffixOnItem(dust, "suffix_of_silent_dust").ok);
});
test("blokované kombinace: signature skupina", () => {
  const s = api.applyAffixToItem(item("armor"), "prefix_sanctified").item;
  assert(!api.checkAffixOnItem(s, "suffix_of_final_memory").ok);
  assert(api.checkAffixOnItem(s, "suffix_of_transcendence").ok);
});
test("unique triggery: duplicitní uniqueEquipped neplatí dvakrát", () => {
  const a = api.applyAffixToItem(item("weapon"), "prefix_broodmothers", { fraction: 1 }).item;
  const b = api.applyAffixToItem(item("armor"), "prefix_broodmothers", { fraction: 1 }).item;
  const totals = api.computeAffixTotals([a, b]);
  eq(totals.totals.max_hp, 22); eq(totals.ignored.length, 1); eq(totals.ignored[0].reason, "uniqueEquipped");
});
test("signatureGroup: jen jeden aktivní affix ze skupiny", () => {
  const a = api.applyAffixToItem(item("armor"), "prefix_sanctified").item;
  const b = api.applyAffixToItem(item("charm"), "suffix_of_final_memory").item;
  const t = api.computeAffixTotals([a, b]); eq(t.ignored.length, 1); assert(t.ignored[0].reason.startsWith("signatureGroup"));
});
test("nevýhody se vyhodnocují po bonusech a započítají se", () => {
  const w = api.applyAffixToItem(item("gloves"), "prefix_reckless", { fraction: 0 }).item;
  const t = api.computeAffixTotals([w]); eq(t.totals.defense, -2); eq(t.totals.damage_min, 2);
  eq(t.modifiers[t.modifiers.length - 1].statId, "defense");
});
test("záporná efektivní obrana se ořízne na 0", () => { eq(api.effectivePlayerDefense(-2), 0); eq(api.effectiveTargetDefense(3, 5), 0); eq(api.effectiveTargetDefense(8, 3), 5); });
test("každý affix lze rollnout a aplikovat na každý svůj slot", () => {
  for (const a of api.AFFIX_DEFINITIONS) for (const slot of a.allowedSlots) {
    const r = api.applyAffixToItem(item(slot), a.id, { boundFamily: "moth" });
    assert(r.ok, `${a.id}@${slot}: ${r.errors.join("; ")}`);
  }
});
test("Hunger a Final Memory si drží resetovací/expediční pravidla", () => {
  eq(api.AFFIXES.suffix_of_hunger.modifiers[0].params.resetOn, "run_end");
  eq(api.AFFIXES.suffix_of_final_memory.modifiers[3].params.perExpedition, 1);
  eq(api.AFFIXES.suffix_of_perfect_resonance.modifiers[2].params.canRetrigger, false);
});
test("vázaná rodina nepřítele se uloží na item", () => {
  const r = api.applyAffixToItem(item("boots"), "suffix_of_the_tracker", { boundFamily: "moth", fraction: 0.5 });
  eq(r.item.suffix.rolledModifiers.find((m) => m.statId === "enemy_family_damage").params.family, "moth");
});

console.log("Capy a minimální časy");
test("capy z registru", () => {
  eq(api.applyStatCap("crit_chance", 60).effective, 50); eq(api.applyStatCap("dodge_chance", 40).effective, 35);
  eq(api.applyStatCap("magic_find", 8).effective, 8); eq(api.applyStatCap("magic_find", 12).effective, 11); eq(api.applyStatCap("magic_find", 100).effective, 20);
});
test("minimální intervaly 0,65 / 0,75 / 2 s", () => {
  const t = api.computeEffectiveTimes({ attack_speed: 90, search_time: -5, revive_time: -9 });
  eq(t.attackInterval.effective, 0.65); eq(t.searchTime.effective, 0.75); eq(t.reviveTime.effective, 2);
  assert(t.attackInterval.floored && t.searchTime.floored && t.reviveTime.floored);
  const n = api.computeEffectiveTimes({ attack_speed: 10, search_time: -0.2, revive_time: -1 });
  assert(!n.attackInterval.floored && !n.searchTime.floored && !n.reviveTime.floored);
});
test("součet statů v itemu respektuje cap crit chance při živém výpočtu", () => {
  const items = Array.from({ length: 7 }, (_, i) => api.applyAffixToItem(item(api.AFFIX_EQUIPMENT_SLOTS[i]), "prefix_glassbound", { fraction: 1 }).item).filter((x) => x.prefix);
  const raw = api.computeAffixTotals(items).totals.crit_chance; assert(raw <= 3 * 3);
  eq(api.applyStatCap("crit_chance", 200).effective, 50);
});

console.log("Drop readiness");
test("žádný affix není v živých dropech", () => { eq(api.getLiveDropAffixIds(), []); });
test("žádný nepřítel nemá scrollPool ani scrollDropChance", () => {
  for (const e of Object.values(api.ENEMIES)) assert(e.scrollPool === undefined && e.scrollDropChance === undefined, e.id);
});
test("živý drop vyžaduje všechny podmínky (výchozí = odmítnuto)", () => {
  const r = api.validateAffixForLiveDrop("prefix_serrated", { poolId: "general_scrolls", source: { enemyId: "e01", enemyType: "common" }, weight: 100 });
  assert(!r.ok); assert(r.errors.some((e) => /enabledOnScrollDrops/.test(e))); assert(r.errors.some((e) => /schválený/.test(e))); assert(r.errors.some((e) => /progres/i.test(e)));
  assert(!api.validateAffixForLiveDrop("nope", {}).ok);
});
test("validace projde, jen když jsou splněny všechny podmínky (testovací kopie)", () => {
  const defs = JSON.parse(JSON.stringify(api.AFFIXES));
  const d = defs.prefix_serrated; d.enabledInLiveDrops = true; d.enabledOnScrollDrops = true; d.scarcity.progressionBand = "early";
  const approved = api.SCROLL_SOURCE_POOLS.general_scrolls;
  const original = approved.approved;
  const pools = api.SCROLL_SOURCE_POOLS;
  // pool je zmrazený objekt – ověříme kopií přes validátor s přepsaným poolem
  const frozen = Object.isFrozen(pools);
  assert(frozen, "pooly jsou zmrazené, nelze je za běhu schválit omylem");
  eq(original, false);
  const r = api.validateAffixForLiveDrop("prefix_serrated", { poolId: "general_scrolls", source: { enemyId: "e01", enemyType: "common" }, weight: 100, definitions: defs });
  assert(!r.ok && r.errors.length === 1 && /schválený/.test(r.errors[0]), r.errors.join("; "));
});
test("T5 nelze zařadit do poolu časné/střední hry ani při schválení", () => {
  const defs = JSON.parse(JSON.stringify(api.AFFIXES)); defs.prefix_sanctified.enabledInLiveDrops = true; defs.prefix_sanctified.enabledOnScrollDrops = true; defs.prefix_sanctified.scarcity.progressionBand = "early";
  defs.prefix_sanctified.scarcity.sourcePools = ["general_scrolls"];
  const r = api.validateAffixForLiveDrop("prefix_sanctified", { poolId: "general_scrolls", source: { enemyId: "e01", enemyType: "common" }, weight: 1, definitions: defs });
  assert(r.errors.some((e) => /Tier 5/.test(e)));
});
test("bossový pool lze použít jen u svého bosse", () => {
  const r = api.validateAffixForLiveDrop("prefix_broodmothers", { poolId: "boss_mother_of_holes", source: { enemyId: "magma-e05", enemyType: "boss" }, weight: 2 });
  assert(r.errors.some((e) => /svého bosse/.test(e)));
});
test("dvoustupňový model: specifická šance = chance × váha / součet vah", () => {
  const f = api.SCROLL_DROP_TEST_FIXTURE; const total = 260;
  assert(Math.abs(api.scrollSpecificChance(f, "prefix_serrated") - 0.03 * 100 / total) < 1e-12);
  const sum = f.scrollPool.reduce((s, e) => s + api.scrollSpecificChance(f, e.affixId), 0); assert(Math.abs(sum - 0.03) < 1e-12);
  let hits = 0; const rng = () => 0.5; // 0.5 ≥ 0.03 → nic nepadne
  hits += api.pickScrollFromPool(f, rng) ? 1 : 0; eq(hits, 0);
  let n = 0; const seq = [0.01, 0]; const rng2 = () => seq[n++ % 2];
  eq(api.pickScrollFromPool(f, rng2), "prefix_serrated");
});
test("validace konfigurace dropu odmítne neplatné hodnoty", () => {
  assert(!api.validateScrollDropConfig({ scrollDropChance: 2, scrollPool: [] }).ok);
  assert(!api.validateScrollDropConfig(api.SCROLL_DROP_TEST_FIXTURE, { poolId: "general_scrolls", source: { enemyType: "common" } }).ok);
});

console.log("Save / migrace");
test("starý item (≤0.5.1) dostane prázdné affix sloty", () => { eq(api.sanitizeItemAffixes({ id: "x", slot: "weapon", quality: "rare" }), { prefix: null, suffix: null }); });
test("item z v5 zachová rolled modifiers beze změny", () => {
  const saved = { prefix: { affixId: "prefix_serrated", definitionVersion: 1, rolledModifiers: [{ statId: "damage_min", value: 1 }, { statId: "damage_max", value: 1 }] }, suffix: null };
  eq(api.sanitizeItemAffixes(saved), saved);
});
test("affix odstraněný z katalogu se na itemu zachová (žádná tichá ztráta)", () => {
  const r = api.sanitizeItemAffixes({ prefix: { affixId: "prefix_gone", definitionVersion: 1, rolledModifiers: [{ statId: "defense", value: 2 }] } });
  eq(r.prefix.affixId, "prefix_gone"); eq(r.prefix.rolledModifiers.length, 1);
});
test("poškozená data se bezpečně vyčistí", () => {
  eq(api.sanitizeItemAffixes({ prefix: "x", suffix: { affixId: 5 } }), { prefix: null, suffix: null });
  eq(api.sanitizeAffixScrolls("nope"), []);
  eq(api.sanitizeAffixScrolls([{ instanceId: "a", affixId: "suffix_of_vigor", quality: "god", rarity: "god", tier: 5 }]),
    [{ instanceId: "a", itemType: "affix_scroll", affixType: "suffix", affixId: "suffix_of_vigor", visualClass: "affix_scroll", tradeable: true }]);
  eq(api.sanitizeAffixScrolls([{ instanceId: "a", affixId: "nope" }]), []);
  eq(api.sanitizeAffixScrolls([{ instanceId: "a", affixId: "prefix_vital" }, { instanceId: "a", affixId: "prefix_vital" }]).length, 1);
});
test("živé staty (max_hp, damage, crit) se přičítají; ostatní jsou jen data", () => {
  const w = api.applyAffixToItem(item("weapon"), "prefix_brutal", { fraction: 1 }).item; // dmg +1/+2, crit_damage (prepared)
  eq(api.affixLiveBonus(w, "damageMin"), 1); eq(api.affixLiveBonus(w, "damageMax"), 2);
  eq(api.STATS.crit_damage.calc, "prepared"); eq(api.STATS.max_hp.calc, "active");
  const lines = api.buildItemAffixLines(w); eq(lines[0].label, "PREFIX"); assert(lines[0].lines.some((l) => l.inactive));
});
test("porovnání podle statId zohledňuje comparison lowerIsBetter", () => {
  const a = api.applyAffixToItem(item("boots"), "suffix_of_pursuit", { fraction: 1 }).item; // −0.1 s
  const cmp = api.compareAffixTotals([item("boots")], [a]).find((c) => c.statId === "search_time");
  eq(cmp.better, true); assert(cmp.delta < 0);
});
test("pojmenování: prefix + základ + suffix", () => {
  const w = api.applyAffixToItem(api.applyAffixToItem(item("weapon"), "prefix_serrated").item, "suffix_of_precision").item;
  eq(api.composeAffixedName("Chitin Sword", w), "Serrated Chitin Sword of Precision");
});

console.log(`\n${passed} OK, ${failures.length} selhalo`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
