"use strict";

// Prototype 0.5 — centrální konfigurace kořisti a ekonomiky.
// Všechna „pracovní čísla“ (kapacita, ceny, ztráta zlata) jsou na jednom místě,
// aby šla snadno doladit. Načítá se PO item-data.js a PŘED app.js.
// Nejde o finální balancing — viz docs/prototype-0.5.md.

const LOOT_CONFIG = Object.freeze({
  inventoryCapacity: 60,   // počet vybavitelných itemů v inventáři (materiály se stackují a nezabírají místo)
  buybackLimit: 10,        // kolik posledních ručně prodaných itemů lze odkoupit zpět
  lootLogLimit: 40,        // délka perzistentního loot logu (prodeje, auto-prodeje, zpětné odkupy…)
  deathGoldLossRate: 0.05, // podíl NESENÉHO zlata, který postava ztratí při smrti (banka je chráněná)
  unclaimedListPreview: 24, // kolik řádků nevyzvednuté kořisti se ukáže najednou
});

// Prototype 0.10 — první schválené pásmo ekonomiky.  Čísla jsou uložená
// odděleně od UI, aby se dala později měnit bez přepisování soubojové logiky.
// Svitky z tavení zde ZÁMĚRNĚ nejsou: jejich návratnost ještě není schválená.
const PROGRESSION_ECONOMY = Object.freeze({
  expectedKillsPerHour: 500,
  equipmentDropChance: 0.03, // 15 kusů / h při 500 killech
  affixComposition: Object.freeze({ none: 0.76, prefix: 0.11, suffix: 0.11, both: 0.02 }),
  materialQualityProfiles: Object.freeze({
    start: Object.freeze({ common: 0.90, rare: 0.09, epic: 0.01 }),
  }),
  equipmentQualityProfiles: Object.freeze({
    start: Object.freeze({ common: 0.935, rare: 0.058, epic: 0.0065, legendary: 0.0005 }),
  }),
  // T1 je záměrně jediný povolený tier pro první živé dropy. Vyšší tiery,
  // Legendary i šance na získání svitku z tavení zůstávají uzamčené v datech.
  liveEquipmentAffixTier: 1,
  smeltScrollRecoveryChance: 0.10,
});

function rollEconomyWeighted(weights, rng = Math.random) {
  let remaining = rng();
  for (const [id, weight] of Object.entries(weights ?? {})) {
    remaining -= Number(weight) || 0;
    if (remaining < 0) return id;
  }
  return Object.keys(weights ?? {})[0] ?? DEFAULT_QUALITY;
}

function rollMaterialQuality(profileId = "start", rng = Math.random) {
  return rollEconomyWeighted(PROGRESSION_ECONOMY.materialQualityProfiles[profileId], rng);
}

function rollEquipmentQuality(profileId = "start", rng = Math.random) {
  return rollEconomyWeighted(PROGRESSION_ECONOMY.equipmentQualityProfiles[profileId], rng);
}

function rollAffixComposition(rng = Math.random) {
  return rollEconomyWeighted(PROGRESSION_ECONOMY.affixComposition, rng);
}

// --- Jídlo (0.9): koupíš u obchodníka, v boji se automaticky sní při nízkém HP ---
const FOOD_CONFIG = Object.freeze({
  id: "food_ration",
  name: "Sušené maso",
  price: 6,            // gold za jeden kus
  healPercent: 0.4,    // doplní 40 % maximálních životů
  autoEatBelow: 0.4,   // sní se, jakmile životy klesnou pod 40 %
});

// --- Síla itemu (orientační skóre) ----------------------------------------
// Váha jednotlivých statů; slouží jen k řazení a k výpočtu prodejní hodnoty.
//   síla = 2·minPoškození + 2·maxPoškození + 0,5·maxHP + 5·(kritický zásah v %)
const POWER_WEIGHTS = Object.freeze({ damageMin: 2, damageMax: 2, maxHp: 0.5, critChance: 5 });

// --- Prodejní hodnota -------------------------------------------------------
//   prodejní hodnota = max(1, zaokrouhleno( síla · 0,5 · násobek kvality ))
// Síla už obsahuje vygenerované staty (ty vycházejí ze šablony a rarity),
// násobek kvality ještě zvedá cenu vzácných a epických kusů.
const SELL_GOLD_PER_POWER = 0.5;
// Kvality bez uvedeného násobku (legendary, mythic, god) se zatím počítají s 1 — ceny pro ně
// nejsou součástí 0.5.1 (viz docs/item-visual-rarity-rules.md, „Out of Scope“).
const SELL_QUALITY_FACTOR = Object.freeze({ common: 1, rare: 1.5, epic: 2.5 });

function itemPower(item) {
  const stats = item?.stats ?? {};
  let power = 0;
  for (const [key, weight] of Object.entries(POWER_WEIGHTS)) power += (Number(stats[key]) || 0) * weight;
  return Math.round(power * 10) / 10;
}

function itemSellValue(item) {
  const factor = SELL_QUALITY_FACTOR[item?.quality] ?? 1;
  return Math.max(1, Math.round(itemPower(item) * SELL_GOLD_PER_POWER * factor));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LOOT_CONFIG, FOOD_CONFIG, POWER_WEIGHTS, SELL_GOLD_PER_POWER, SELL_QUALITY_FACTOR, PROGRESSION_ECONOMY, rollEconomyWeighted, rollMaterialQuality, rollEquipmentQuality, rollAffixComposition, itemPower, itemSellValue };
}
