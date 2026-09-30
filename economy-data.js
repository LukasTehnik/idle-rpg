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

// --- Síla itemu (orientační skóre) ----------------------------------------
// Váha jednotlivých statů; slouží jen k řazení a k výpočtu prodejní hodnoty.
//   síla = 2·minPoškození + 2·maxPoškození + 0,5·maxHP + 5·(kritický zásah v %)
const POWER_WEIGHTS = Object.freeze({ damageMin: 2, damageMax: 2, maxHp: 0.5, critChance: 5 });

// --- Prodejní hodnota -------------------------------------------------------
//   prodejní hodnota = max(1, zaokrouhleno( síla · 0,5 · násobek rarity ))
// Síla už obsahuje vygenerované staty (ty vycházejí ze šablony a rarity),
// násobek rarity ještě zvedá cenu vzácných a epických kusů.
const SELL_GOLD_PER_POWER = 0.5;
const SELL_RARITY_FACTOR = Object.freeze({ common: 1, uncommon: 1.2, rare: 1.5, epic: 2.5 });

function itemPower(item) {
  const stats = item?.stats ?? {};
  let power = 0;
  for (const [key, weight] of Object.entries(POWER_WEIGHTS)) power += (Number(stats[key]) || 0) * weight;
  return Math.round(power * 10) / 10;
}

function itemSellValue(item) {
  const factor = SELL_RARITY_FACTOR[item?.rarity] ?? 1;
  return Math.max(1, Math.round(itemPower(item) * SELL_GOLD_PER_POWER * factor));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LOOT_CONFIG, POWER_WEIGHTS, SELL_GOLD_PER_POWER, SELL_RARITY_FACTOR, itemPower, itemSellValue };
}
