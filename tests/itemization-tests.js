"use strict";
// Itemization foundation — logické testy (Node, bez závislostí): `node tests/itemization-tests.js`
// Skripty hry se načtou do jednoho vm kontextu stejně jako v prohlížeči (sdílený globální scope).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = { console, Math, Date, JSON, Object, Array, Set, Map, Number, String };
vm.createContext(context);
const files = ["quality-data.js", "itemization-data.js", "item-data.js"];
const source = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n;\n");
// `const` deklarace nejsou vlastnosti kontextu → vyexportujeme je explicitně.
vm.runInContext(`${source}
;this.api = { rollItemStats, rollAffixTierFromPool, findTemplateById, ITEM_QUALITY_RULES, ITEM_TIER_RULES };`, context);
const api = context.api;

let passed = 0; const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.log(`  FAIL ${name}\n       ${error.message}`); }
}
function assert(condition, message = "assertion failed") { if (!condition) throw new Error(message); }
function eq(actual, expected, message = "") { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message} očekáváno ${JSON.stringify(expected)}, je ${JSON.stringify(actual)}`); }

const sword = api.findTemplateById("iron-sword");
const QUALITIES = ["common", "rare", "epic", "legendary"];
const fixedRng = (value) => () => value;
const mainSum = (rolled) => (rolled.baseStats.damageMin ?? 0) + (rolled.baseStats.damageMax ?? 0);
const ROLLS = 2000;

console.log("Šablona");
test("Iron Sword existuje a je zbraň s damageMin/damageMax", () => {
  assert(sword, "šablona iron-sword nenalezena");
  eq(sword.slot, "weapon"); eq(Object.keys(sword.rolls).sort(), ["damageMax", "damageMin"]);
});

console.log("Sekundární staty podle kvality");
test("Common / Rare / Epic / Legendary mají přesně 0 / 1 / 2 / 3 sekundární staty", () => {
  const expected = { common: 0, rare: 1, epic: 2, legendary: 3 };
  for (const quality of QUALITIES) {
    for (let i = 0; i < 200; i += 1) {
      const rolled = api.rollItemStats(sword, { quality, itemTier: 1 });
      eq(rolled.secondaryStats.length, expected[quality], `${quality}:`);
    }
  }
});
test("sekundární staty se v jednom itemu neopakují", () => {
  for (let i = 0; i < 200; i += 1) {
    const ids = api.rollItemStats(sword, { quality: "legendary", itemTier: 1 }).secondaryStats.map((entry) => entry.id);
    eq(new Set(ids).size, ids.length, "duplicitní sekundár:");
  }
});

console.log("Hlavní staty");
test("Common Iron Sword má pouze hlavní staty damageMin a damageMax", () => {
  for (let i = 0; i < 200; i += 1) {
    const rolled = api.rollItemStats(sword, { quality: "common", itemTier: 1 });
    eq(Object.keys(rolled.baseStats).sort(), ["damageMax", "damageMin"], "baseStats:");
    eq(Object.keys(rolled.stats).sort(), ["damageMax", "damageMin"], "stats:");
    eq(rolled.secondaryStats, [], "secondaryStats:");
  }
});
test("vyšší kvalita zvyšuje hlavní stat (stejný roll: maximum rozsahu)", () => {
  const sums = QUALITIES.map((quality) => mainSum(api.rollItemStats(sword, { quality, itemTier: 1, rng: fixedRng(0.999999) })));
  for (let i = 1; i < sums.length; i += 1) assert(sums[i] > sums[i - 1], `${QUALITIES[i]} (${sums[i]}) není větší než ${QUALITIES[i - 1]} (${sums[i - 1]})`);
});
test("vyšší kvalita zvyšuje hlavní stat i v průměru náhodných rollů", () => {
  const means = QUALITIES.map((quality) => {
    let total = 0; for (let i = 0; i < ROLLS; i += 1) total += mainSum(api.rollItemStats(sword, { quality, itemTier: 1 }));
    return total / ROLLS;
  });
  for (let i = 1; i < means.length; i += 1) assert(means[i] > means[i - 1], `průměr ${QUALITIES[i]} (${means[i].toFixed(2)}) není větší než ${QUALITIES[i - 1]} (${means[i - 1].toFixed(2)})`);
});

console.log("Item tier");
test("T2 Rare Iron Sword má vyšší základní damage než T1 Legendary Iron Sword (stejný roll)", () => {
  const t2Rare = api.rollItemStats(sword, { quality: "rare", itemTier: 2, rng: fixedRng(0.5) });
  const t1Legendary = api.rollItemStats(sword, { quality: "legendary", itemTier: 1, rng: fixedRng(0.5) });
  assert(t2Rare.baseStats.damageMax > t1Legendary.baseStats.damageMax, `damageMax ${t2Rare.baseStats.damageMax} vs ${t1Legendary.baseStats.damageMax}`);
  assert(t2Rare.baseStats.damageMin >= t1Legendary.baseStats.damageMin, `damageMin ${t2Rare.baseStats.damageMin} vs ${t1Legendary.baseStats.damageMin}`);
  assert(mainSum(t2Rare) > mainSum(t1Legendary), `součet ${mainSum(t2Rare)} vs ${mainSum(t1Legendary)}`);
});
test("T2 Rare má vyšší základní damage než T1 Legendary i v průměru náhodných rollů", () => {
  const mean = (quality, itemTier) => { let total = 0; for (let i = 0; i < ROLLS; i += 1) total += mainSum(api.rollItemStats(sword, { quality, itemTier })); return total / ROLLS; };
  const t2Rare = mean("rare", 2); const t1Legendary = mean("legendary", 1);
  assert(t2Rare > t1Legendary, `průměr ${t2Rare.toFixed(2)} vs ${t1Legendary.toFixed(2)}`);
});

console.log("Affix tier pool");
test("affixTierPool { 1: 75, 2: 25 } vrací tier 1 při nízkém rollu a tier 2 při vysokém", () => {
  const pool = { 1: 75, 2: 25 };
  eq(api.rollAffixTierFromPool(pool, fixedRng(0)), 1, "roll 0:");
  eq(api.rollAffixTierFromPool(pool, fixedRng(0.1)), 1, "roll 0,1:");
  eq(api.rollAffixTierFromPool(pool, fixedRng(0.74)), 1, "roll 0,74:");
  eq(api.rollAffixTierFromPool(pool, fixedRng(0.76)), 2, "roll 0,76:");
  eq(api.rollAffixTierFromPool(pool, fixedRng(0.99)), 2, "roll 0,99:");
});

console.log(failures.length ? `\n${passed} OK, ${failures.length} selhalo` : `\n${passed} OK, 0 selhalo`);
if (failures.length) { failures.forEach((failure) => console.log(`  - ${failure}`)); process.exit(1); }
