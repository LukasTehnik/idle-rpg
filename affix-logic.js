"use strict";

// =============================================================================
// Prototype 0.6 — LOGIKA AFFIXŮ A SVITKŮ
// =============================================================================
// Načítá se PO stat-data.js a affix-data.js, PŘED app.js (a v affix-catalog.html).
// Žádné DOM, žádný stav hry — čisté funkce, takže jdou testovat i mimo prohlížeč.
//
// Co je tu:
//   • validace katalogu a validace "živého dropu" (výchozí = zakázáno)
//   • roll hodnot a uložení `rolledModifiers` na item (item nikdy nečte aktuální definici hodnot)
//   • pravidla pro item: max 1 prefix + 1 suffix, sloty, konflikty, capy
//   • součty statů (pozitivní nejdřív, nevýhody po nich), uplatnění capů
//   • entita svitku + hráčský view model (ALLOWLIST)
//   • datový model dropu svitků (dvoustupňový) + dev fixture
//   • sanitizace pro save/migraci
// =============================================================================

const AFFIX_SCHEMA_VERSION = 1;

const AFFIX_SLOT_LABELS = Object.freeze({
  weapon: "Weapon", armor: "Armor", helmet: "Helmet", gloves: "Gloves", pants: "Pants", boots: "Boots", charm: "Talisman", wings: "Wings",
});
const AFFIX_EQUIPMENT_SLOTS = Object.freeze(["weapon", "armor", "helmet", "gloves", "pants", "boots", "charm"]);

// Výchozí základ pro dev nástroj (sekundy); hra sama zatím nemá interval/hledání/revive ovlivnitelné affixy.
const AFFIX_DEFAULT_BASES = Object.freeze({ attackInterval: 1.6, searchTime: 3, reviveTime: 5 });

function getAffix(affixId) { return AFFIXES[affixId] ?? null; }
function listAffixes(type = null) { return AFFIX_DEFINITIONS.filter((definition) => !type || definition.type === type); }

// --- Validace katalogu -------------------------------------------------------
function validateAffixCatalog(definitions = AFFIX_DEFINITIONS) {
  const errors = [];
  const seen = new Set();
  for (const affix of definitions) {
    const where = affix.id ?? "(bez id)";
    if (!affix.id || seen.has(affix.id)) errors.push(`${where}: duplicitní nebo chybějící ID`);
    seen.add(affix.id);
    if (affix.type !== "prefix" && affix.type !== "suffix") errors.push(`${where}: neplatný typ`);
    if (!affix.id?.startsWith(`${affix.type}_`)) errors.push(`${where}: ID nezačíná typem`);
    if (!AFFIX_TIER_DEFAULTS[affix.tier]) errors.push(`${where}: neplatný tier`);
    if (!AFFIX_SCROLL_COLORS.includes(getAffixScrollColor(affix))) errors.push(`${where}: neplatná barva svitku`);
    if (affix.visualClass !== "affix_scroll" || affix.displayTier !== false || affix.displayRarity !== false) errors.push(`${where}: porušuje jednotný vzhled svitků`);
    if (typeof affix.enabledOnEquipmentDrops !== "boolean") errors.push(`${where}: chybí enabledOnEquipmentDrops`);
    if (typeof affix.enabledOnScrollDrops !== "boolean") errors.push(`${where}: chybí enabledOnScrollDrops`);
    if (typeof affix.enabledOnSmeltRecovery !== "boolean") errors.push(`${where}: chybí enabledOnSmeltRecovery`);
    if (affix.enabledInLiveDrops !== affix.enabledOnScrollDrops) errors.push(`${where}: historický enabledInLiveDrops musí kopírovat enabledOnScrollDrops`);
    if (!affix.allowedSlots?.length || affix.allowedSlots.some((slot) => !AFFIX_EQUIPMENT_SLOTS.includes(slot))) errors.push(`${where}: neplatné sloty`);
    if (affix.design?.visibility !== "internal" || affix.scarcity?.visibility !== "internal") errors.push(`${where}: design/scarcity musí být internal`);
    for (const pool of affix.scarcity?.sourcePools ?? []) {
      const poolDef = SCROLL_SOURCE_POOLS[pool];
      if (!poolDef) errors.push(`${where}: neznámý source pool ${pool}`);
      else if (affix.tier > poolDef.maxTier) errors.push(`${where}: tier ${affix.tier} je vyšší než povolí pool ${pool}`);
    }
    if (!affix.modifiers?.length) errors.push(`${where}: žádné modifiery`);
    [...(affix.modifiers ?? []), ...(affix.drawbacks ?? [])].forEach((modifier) => {
      if (!STATS[modifier.statId]) { errors.push(`${where}: neznámý stat ${modifier.statId}`); return; }
      if (!(modifier.minValue <= modifier.maxValue)) errors.push(`${where}: ${modifier.statId} má min > max`);
    });
    if (affix.boundFamily && !affix.modifiers.some((m) => m.params?.family === "bound")) errors.push(`${where}: boundFamily bez vázaného modifieru`);
    if (affix.modifiers?.some((m) => m.statId === "hunger_damage_per_kill" && m.params?.resetOn !== "run_end")) errors.push(`${where}: Hunger musí resetovat na konci výpravy`);
    if (affix.tier === 5 && !affix.signatureGroup) errors.push(`${where}: T5 vyžaduje signatureGroup`);
  }
  return { ok: errors.length === 0, errors };
}

// --- Validace pro živé dropy -------------------------------------------------
// Affix smí do živých dropů JEN když projdou VŠECHNY podmínky. Výchozí stav = zakázáno.
//   source: { enemyId, enemyType: "common"|"uncommon"|"rare"|"elite"|"boss" }
function validateAffixForLiveDrop(affixId, { poolId, source, weight, definitions = AFFIXES } = {}) {
  const errors = [];
  const warnings = [];
  const affix = definitions[affixId];
  if (!affix) return { ok: false, errors: ["Neplatné affix ID"], warnings };
  if (!affix.enabled) errors.push("Affix je vypnutý (enabled:false)");
  if (affix.enabledOnScrollDrops !== true) errors.push("enabledOnScrollDrops není explicitně true");
  const unusableStat = [...affix.modifiers, ...affix.drawbacks].find((m) => !STATS[m.statId]?.enabled);
  if (unusableStat) errors.push(`Stat ${unusableStat.statId} není aktivní v registru`);
  const prepared = [...affix.modifiers, ...affix.drawbacks].filter((m) => STATS[m.statId]?.calc === "prepared").map((m) => m.statId);
  if (prepared.length) warnings.push(`Staty bez živého výpočtu (jen připravená data): ${[...new Set(prepared)].join(", ")}`);
  const pool = SCROLL_SOURCE_POOLS[poolId];
  if (!pool) errors.push("Chybí nebo neznámý source pool");
  else {
    if (pool.approved !== true) errors.push(`Source pool ${poolId} není schválený`);
    if (!affix.scarcity.sourcePools.includes(poolId)) errors.push(`Affix nepatří do poolu ${poolId}`);
    if (affix.tier > pool.maxTier) errors.push(`Tier ${affix.tier} je nad limitem poolu (T${pool.maxTier})`);
    if (!source || !pool.compatibleDropSources.includes(source.enemyType)) errors.push("Zdroj dropu (typ nepřítele) není s poolem kompatibilní");
    if (pool.bossEnemyIds && !pool.bossEnemyIds.includes(source?.enemyId)) errors.push("Bossový pool lze použít jen u svého bosse");
  }
  if (affix.scarcity.progressionBand == null) errors.push("Chybí progresní pásmo (progressionBand)");
  if (!(weight > 0)) errors.push("Chybí kladná váha v poolu");
  return { ok: errors.length === 0, errors, warnings };
}

// Dvoustupňový drop svitků: { scrollDropChance, scrollPool:[{affixId, weight}] }.
// specifická šance = scrollDropChance × weight / součet vah způsobilých položek.
function validateScrollDropConfig(config, { poolId, source } = {}) {
  const errors = [];
  if (!config || typeof config !== "object") return { ok: false, errors: ["Chybí konfigurace"] };
  if (!(config.scrollDropChance >= 0 && config.scrollDropChance <= 1)) errors.push("scrollDropChance musí být v rozsahu 0–1");
  if (!Array.isArray(config.scrollPool) || config.scrollPool.length === 0) errors.push("scrollPool je prázdný");
  const ids = new Set();
  for (const entry of config.scrollPool ?? []) {
    if (ids.has(entry.affixId)) errors.push(`Duplicitní affix ${entry.affixId}`);
    ids.add(entry.affixId);
    const result = validateAffixForLiveDrop(entry.affixId, { poolId, source, weight: entry.weight });
    result.errors.forEach((message) => errors.push(`${entry.affixId}: ${message}`));
  }
  return { ok: errors.length === 0, errors };
}

function scrollSpecificChance(config, affixId) {
  const total = config.scrollPool.reduce((sum, entry) => sum + entry.weight, 0);
  const entry = config.scrollPool.find((candidate) => candidate.affixId === affixId);
  return entry && total > 0 ? config.scrollDropChance * entry.weight / total : 0;
}

function pickScrollFromPool(config, rng = Math.random) {
  if (rng() >= config.scrollDropChance) return null;
  const total = config.scrollPool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of config.scrollPool) { roll -= entry.weight; if (roll < 0) return entry.affixId; }
  return config.scrollPool[config.scrollPool.length - 1]?.affixId ?? null;
}

// Pouze vývojová fixture pro ověření modelu — NENÍ napojená na žádného nepřítele ani na dropy.
// (Hodnoty jsou ilustrativní, nejsou to finální drop tabulky.)
const SCROLL_DROP_TEST_FIXTURE = Object.freeze({
  scrollDropChance: 0.03,
  scrollPool: Object.freeze([
    Object.freeze({ affixId: "prefix_serrated", weight: 100 }),
    Object.freeze({ affixId: "suffix_of_precision", weight: 100 }),
    Object.freeze({ affixId: "prefix_brutal", weight: 30 }),
    Object.freeze({ affixId: "suffix_of_discovery", weight: 30 }),
  ]),
});

// Živě povolené affixy (musí být prázdná množina). Test i dev nástroj to hlídají.
function getLiveDropAffixIds() { return AFFIX_DEFINITIONS.filter((affix) => affix.enabledOnScrollDrops === true).map((affix) => affix.id); }
function getEquipmentDropAffixIds() { return AFFIX_DEFINITIONS.filter((affix) => affix.enabledOnEquipmentDrops === true).map((affix) => affix.id); }
function getSmeltRecoverableAffixIds() { return AFFIX_DEFINITIONS.filter((affix) => affix.enabledOnSmeltRecovery === true).map((affix) => affix.id); }

// --- Roll hodnot -------------------------------------------------------------
function roundRoll(value, min, max) {
  if (Number.isInteger(min) && Number.isInteger(max)) return Math.round(value);
  return Math.round(value * 100) / 100;
}

function rollModifier(modifier, { rng = Math.random, fraction = null, boundFamily = null, drawback = false } = {}) {
  const t = fraction == null ? rng() : Math.max(0, Math.min(1, fraction));
  const value = roundRoll(modifier.minValue + (modifier.maxValue - modifier.minValue) * t, modifier.minValue, modifier.maxValue);
  const rolled = { statId: modifier.statId, value: Math.min(modifier.maxValue, Math.max(modifier.minValue, value)) };
  if (modifier.params) {
    rolled.params = { ...modifier.params };
    if (rolled.params.family === "bound") rolled.params.family = boundFamily ?? "moth";
  }
  if (drawback) rolled.drawback = true;
  return rolled;
}

// Vrací instanci affixu pro item: { affixId, definitionVersion, rolledModifiers }.
// Hodnoty se ZAPEČETÍ — pozdější změna definice item nemění.
// options.values = { [statId]: číslo } přepíše roll (dev nástroj), options.fraction 0–1 pro všechny.
function rollAffix(affixId, options = {}) {
  const affix = getAffix(affixId);
  if (!affix) return null;
  const rolled = [];
  const push = (modifier, drawback) => {
    const mod = rollModifier(modifier, { ...options, drawback });
    const override = options.values?.[`${modifier.statId}${drawback ? ":drawback" : ""}`] ?? options.values?.[modifier.statId];
    if (Number.isFinite(override)) mod.value = Math.min(modifier.maxValue, Math.max(modifier.minValue, override));
    rolled.push(mod);
  };
  affix.modifiers.forEach((modifier) => push(modifier, false));
  affix.drawbacks.forEach((modifier) => push(modifier, true));
  return { affixId, definitionVersion: affix.definitionVersion, rolledModifiers: rolled };
}

// --- Itemy a affixy ------------------------------------------------------------
function emptyAffixSlots() { return { prefix: null, suffix: null }; }
function getItemAffixes(item) {
  return ["prefix", "suffix"].filter((slot) => item?.[slot]?.affixId).map((slot) => ({ slot, instance: item[slot] }));
}

// Modifiery konkrétního itemu — vždy z uložených `rolledModifiers`, nikdy z definice.
function collectItemModifiers(item) {
  const list = [];
  for (const { slot, instance } of getItemAffixes(item)) {
    for (const rolled of instance.rolledModifiers ?? []) {
      list.push({ ...rolled, params: rolled.params ?? null, affixSlot: slot, affixId: instance.affixId });
    }
  }
  return list;
}

// Zkontroluje, zda affix smí na item. Vrací { ok, errors[], warnings[] }.
//   errors = blokující (kombinace se nesmí vytvořit), warnings = jen upozornění.
function checkAffixOnItem(item, affixId, { definitions = AFFIXES, boundFamily = null } = {}) {
  const errors = [];
  const warnings = [];
  const affix = definitions[affixId];
  if (!affix) return { ok: false, errors: ["Neznámý affix"], warnings };
  if (!affix.enabled) errors.push("Affix je vypnutý");
  if (!item || !item.slot) return { ok: false, errors: ["Neplatný base item"], warnings };
  if (!affix.allowedSlots.includes(item.slot)) errors.push(`Slot ${AFFIX_SLOT_LABELS[item.slot] ?? item.slot} není pro tento affix povolen`);
  const tags = item.tags ?? [];
  if (affix.excludedBaseTags.some((tag) => tags.includes(tag))) errors.push("Base item má vyloučený tag");

  // Další affix na druhém slotu
  const other = affix.type === "prefix" ? item.suffix : item.prefix;
  const otherDef = other?.affixId ? definitions[other.affixId] : null;
  if (otherDef) {
    if (affix.conflictsWith.includes(otherDef.id) || otherDef.conflictsWith.includes(affix.id)) errors.push(`Konflikt s ${otherDef.displayName}`);
    if (affix.signatureGroup && affix.signatureGroup === otherDef.signatureGroup) errors.push("Dva affixy ze stejné signature skupiny nejdou použít společně");
    if (affix.locationIdentity && otherDef.locationIdentity && affix.locationIdentity !== otherDef.locationIdentity) errors.push("Protichůdné lokační identity na jednom itemu");
    for (const mine of affix.modifiers) {
      const theirs = otherDef.modifiers.find((m) => m.statId === mine.statId);
      const stat = STATS[mine.statId];
      if (theirs && stat?.stackingRule === "strongest") errors.push(`Dva stejné unikátní efekty (${stat.displayName}) se nesčítají — kombinace blokována`);
      if (theirs && stat?.stackingRule === "unique_equipped") errors.push(`Efekt „${stat.displayName}“ může být aktivní jen jednou`);
    }
    // Žádný affix nesmí zcela vymazat nevýhodu rizikového affixu (nevýhody se počítají po bonusech).
    const checkCancel = (risky, helper) => {
      for (const drawback of risky.drawbacks) {
        const gain = helper.modifiers.filter((m) => m.statId === drawback.statId).reduce((sum, m) => sum + m.maxValue, 0);
        if (gain > 0 && drawback.minValue < 0 && gain >= Math.abs(drawback.maxValue)) errors.push(`${helper.displayName} by zcela zrušil nevýhodu affixu ${risky.displayName} (${STATS[drawback.statId].displayName})`);
        if (drawback.minValue > 0) {
          // záporný stat typu damage_taken: nelze vynulovat pozitivním protějškem
          const negate = helper.modifiers.filter((m) => m.statId === drawback.statId && m.maxValue < 0).reduce((sum, m) => sum + Math.abs(m.minValue), 0);
          if (negate >= drawback.maxValue) errors.push(`${helper.displayName} by zcela zrušil nevýhodu affixu ${risky.displayName}`);
        }
      }
    };
    checkCancel(affix, otherDef);
    checkCancel(otherDef, affix);
  }

  // Pravidla jednoho affixu samotného
  const family = affix.modifiers.find((m) => m.params?.family === "bound");
  if (family && !(boundFamily ?? "moth")) errors.push("Chybí vázaná rodina nepřátel");
  const hunger = affix.modifiers.find((m) => m.statId === "hunger_damage_per_kill");
  if (hunger && hunger.params?.resetOn !== "run_end") errors.push("Hunger musí zůstat vázaný na reset na konci výpravy");
  for (const modifier of affix.modifiers) {
    const stat = STATS[modifier.statId];
    if (stat?.cannotRetrigger && modifier.params?.canRetrigger !== false) errors.push("Extra útok nesmí spouštět další extra útok");
    if (stat?.id === "survive_lethal_once" && modifier.params?.perExpedition !== 1) errors.push("Final Memory smí zabránit smrti nejvýše jednou za výpravu");
  }

  // Capy a minimální intervaly pro item samotný (nejhorší případ = maximální rolly)
  const worst = {};
  [...affix.modifiers, ...(otherDef?.modifiers ?? [])].forEach((m) => { if (!m.params?.family) worst[m.statId] = (worst[m.statId] ?? 0) + m.maxValue; });
  for (const [statId, sum] of Object.entries(worst)) {
    const cap = STATS[statId]?.cap;
    if (cap?.type === "hard" && sum > cap.max) errors.push(`${STATS[statId].displayName} by na jediném itemu překročil cap ${cap.max}%`);
  }
  const speed = worst.attack_speed ?? 0;
  if (AFFIX_DEFAULT_BASES.attackInterval * (1 - speed / 100) < STATS.attack_speed.cap.min) errors.push("Útočný interval by klesl pod 0,65 s");
  const search = worst.search_time ?? 0;
  if (search < 0 && AFFIX_DEFAULT_BASES.searchTime + search < STATS.search_time.cap.min) errors.push("Čas hledání by klesl pod 0,75 s");
  const revive = worst.revive_time ?? 0;
  if (revive < 0 && AFFIX_DEFAULT_BASES.reviveTime + revive < STATS.revive_time.cap.min) errors.push("Čas návratu by klesl pod 2 s");

  const level = affix.requiredItemLevel;
  if (item.itemLevel != null && item.itemLevel < level) warnings.push(`Požadovaná úroveň itemu ${level} (item ${item.itemLevel}) — zatím se nevynucuje`);
  return { ok: errors.length === 0, errors, warnings };
}

// Přidá affix na item (nemění původní objekt). Vrací { ok, item, errors, warnings }.
function applyAffixToItem(item, affixId, options = {}) {
  const affix = getAffix(affixId);
  if (!affix) return { ok: false, item, errors: ["Neznámý affix"], warnings: [] };
  const check = checkAffixOnItem(item, affixId, options);
  if (!check.ok) return { ...check, item };
  const rolled = rollAffix(affixId, options);
  const next = { ...item, [affix.type]: rolled };
  return { ok: true, item: next, errors: [], warnings: check.warnings };
}
function removeAffixFromItem(item, type) { return { ...item, [type]: null }; }

// Jméno pro dev nástroj: "Serrated Chitin Sword of Precision".
function composeAffixedName(baseName, item) {
  const prefix = item?.prefix?.affixId ? getAffix(item.prefix.affixId)?.displayName : null;
  const suffix = item?.suffix?.affixId ? getAffix(item.suffix.affixId)?.displayName : null;
  return [prefix, baseName, suffix].filter(Boolean).join(" ");
}

// --- Součty statů a capy -------------------------------------------------------
// Pozitivní modifiery se sečtou první; záporné (drawback) až po nich.
// Unikátní affixy: uniqueEquipped (jeden aktivní) a signatureGroup (jeden na skupinu).
// Stackingové pravidlo "strongest" → ze stejného statu platí jen nejsilnější.
// Vrací { totals, active: [...], ignored: [{affixId, reason}], modifiers }.
function computeAffixTotals(items, { definitions = AFFIXES } = {}) {
  const seenUnique = new Set();
  const seenGroups = new Map();
  const ignored = [];
  const active = [];
  for (const item of items.filter(Boolean)) {
    for (const { instance } of getItemAffixes(item)) {
      const affix = definitions[instance.affixId];
      if (affix?.uniqueEquipped) {
        if (seenUnique.has(affix.id)) { ignored.push({ affixId: affix.id, reason: "uniqueEquipped" }); continue; }
        seenUnique.add(affix.id);
      }
      if (affix?.signatureGroup) {
        if (seenGroups.has(affix.signatureGroup)) { ignored.push({ affixId: affix.id, reason: `signatureGroup:${affix.signatureGroup}` }); continue; }
        seenGroups.set(affix.signatureGroup, affix.id);
      }
      active.push({ item, instance });
    }
  }
  const positives = []; const negatives = [];
  for (const { instance } of active) {
    for (const rolled of instance.rolledModifiers ?? []) {
      const stat = STATS[rolled.statId];
      if (!stat?.enabled) continue;
      const entry = { ...rolled, affixId: instance.affixId };
      (rolled.drawback ? negatives : positives).push(entry);
    }
  }
  const totals = {};
  const strongest = {};
  const apply = (entry) => {
    const stat = STATS[entry.statId];
    const key = entry.params?.family ? `${entry.statId}:${entry.params.family}` : entry.statId;
    if (stat.stackingRule === "strongest" || stat.stackingRule === "unique_equipped") {
      if (!(key in strongest) || Math.abs(entry.value) > Math.abs(strongest[key])) strongest[key] = entry.value;
      totals[key] = strongest[key];
    } else if (stat.stackingRule === "multiplicative") totals[key] = (totals[key] ?? 1) * entry.value;
    else totals[key] = (totals[key] ?? 0) + entry.value;
  };
  positives.forEach(apply);
  negatives.forEach(apply); // nevýhody se vyhodnocují až po pozitivních bonusech
  return { totals, active, ignored, modifiers: [...positives, ...negatives] };
}

// Cap pro jeden stat: vrací { raw, effective, capped }.
function applyStatCap(statId, raw) {
  const cap = STATS[statId]?.cap;
  if (!cap) return { raw, effective: raw, capped: false };
  if (cap.type === "hard") { const effective = Math.min(raw, cap.max); return { raw, effective, capped: effective !== raw }; }
  if (cap.type === "soft") {
    const effective = raw <= cap.softAfter ? raw : Math.min(cap.hardMax, cap.softAfter + (raw - cap.softAfter) * cap.factor);
    return { raw, effective, capped: effective !== raw };
  }
  return { raw, effective: raw, capped: false };
}

// Výsledné časy po uplatnění minimálních hodnot (útok 0,65 s, hledání 0,75 s, návrat 2 s).
function computeEffectiveTimes(totals, bases = AFFIX_DEFAULT_BASES) {
  const attackRaw = typeof CONTENT_100!=="undefined" ? bases.attackInterval/(1+Math.max(-90,totals.attack_speed ?? 0)/100) : bases.attackInterval * (1 - (totals.attack_speed ?? 0) / 100);
  const searchRaw = bases.searchTime + (totals.search_time ?? 0);
  const reviveRaw = bases.reviveTime + (totals.revive_time ?? 0);
  const floor = (value, id) => Math.max(STATS[id].cap.min, Math.round(value * 1000) / 1000);
  return {
    attackInterval: { raw: attackRaw, effective: floor(attackRaw, "attack_speed"), floored: attackRaw < STATS.attack_speed.cap.min },
    searchTime: { raw: searchRaw, effective: floor(searchRaw, "search_time"), floored: searchRaw < STATS.search_time.cap.min },
    reviveTime: { raw: reviveRaw, effective: floor(reviveRaw, "revive_time"), floored: reviveRaw < STATS.revive_time.cap.min },
  };
}

// Obrana cíle po průrazu nesmí být záporná.
function effectiveTargetDefense(targetDefense, penetration) { return Math.max(0, targetDefense - Math.max(0, penetration)); }

// Efektivní obrana postavy nesmí klesnout pod 0 (nevýhody typu "defense −2").
function effectivePlayerDefense(total) { return Math.max(0, total); }

// Bonus affixů pro stat zapojený do živého výpočtu (calc:"active"): vrací součet pro `liveKey`.
// Používá app.js v getPlayerStats(); pro staty jen "prepared" vrací vždy 0.
function affixLiveBonus(item, liveKey) {
  if (!item || (!item.prefix && !item.suffix)) return 0;
  let sum = 0;
  for (const modifier of collectItemModifiers(item)) {
    const stat = STATS[modifier.statId];
    if (stat?.enabled && stat.calc === "active" && stat.liveKey === liveKey && !stat.condition) sum += modifier.value;
  }
  return sum;
}

// --- Entita svitku ---------------------------------------------------------------
// Barva svitku = TÉMA affixu (obrana / užitek / útok / hybrid), nikdy síla ani vzácnost.
// Tier ani drop weight do výpočtu nevstupují. Modrá = přežití, zelená = užitek/farming,
// fialová = útok, duha = hybrid (statistiky z více témat bez jasné většiny).
const AFFIX_SCROLL_COLORS = Object.freeze(["blue", "green", "purple", "rainbow"]);
const AFFIX_SCROLL_STAT_THEME = Object.freeze({
  defense: ["defense", "max_hp", "hp_regen", "dodge_chance", "heal_on_kill", "revive_time", "low_hp_defense", "survive_lethal_once", "trigger_heal_on_damage"],
  utility: ["magic_find", "gold_find", "material_find", "xp_gain", "search_time", "equipment_drop_chance"],
  offense: ["damage_min", "damage_max", "crit_chance", "crit_damage", "attack_speed", "defense_penetration", "boss_damage", "boss_defense_penetration", "elite_damage", "enemy_family_damage", "fire_damage", "electric_damage", "execution_damage", "low_hp_damage", "full_hp_damage", "hunger_damage_per_kill", "hunger_damage_cap", "trigger_true_damage_on_crit", "trigger_extra_attack_on_crit"],
});
const AFFIX_THEME_COLOR = Object.freeze({ defense: "blue", utility: "green", offense: "purple" });

function getAffixScrollColor(affixOrId) {
  const affix = typeof affixOrId === "string" ? getAffix(affixOrId) : affixOrId;
  if (!affix) return "blue";
  const counts = { defense: 0, utility: 0, offense: 0 };
  (affix.modifiers ?? []).forEach((m) => {
    const theme = Object.keys(AFFIX_SCROLL_STAT_THEME).find((t) => AFFIX_SCROLL_STAT_THEME[t].includes(m.statId));
    if (theme) counts[theme] += 1;
  });
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] === 0) return "blue";
  if (ranked[1][1] === ranked[0][1]) return "rainbow";
  return AFFIX_THEME_COLOR[ranked[0][0]];
}

let affixScrollCounter = 0;
function createAffixScroll(affixId) {
  const affix = getAffix(affixId);
  if (!affix) return null;
  affixScrollCounter += 1;
  return {
    instanceId: `scr_${Date.now().toString(36)}_${affixScrollCounter.toString(36)}_${Math.floor(Math.random() * 1296).toString(36)}`,
    itemType: "affix_scroll",
    affixType: affix.type,
    affixId,
    visualClass: "affix_scroll",
    tradeable: affix.tradeable,
  };
}

function smeltRecoveryCandidates(item) {
  if (!item || item.craftedAt) return [];
  return getItemAffixes(item).map(({ instance }) => instance.affixId).filter((affixId) => getAffix(affixId)?.enabledOnSmeltRecovery === true);
}

// Nezávislý hod za každý affix: u dvou affixů 81 % nic, 18 % jeden, 1 % oba.
function rollSmeltRecoveredScrolls(item, { rng = Math.random, chance = PROGRESSION_ECONOMY.smeltScrollRecoveryChance } = {}) {
  const validChance = Math.max(0, Math.min(1, Number(chance) || 0));
  return smeltRecoveryCandidates(item).filter(() => rng() < validChance).map((affixId) => createAffixScroll(affixId)).filter(Boolean);
}

// Sanitizace ze savu: jen povolená pole; `quality`/`rarity` a jiné cizí pole se zahodí.
function sanitizeAffixScroll(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.instanceId !== "string" || typeof raw.affixId !== "string") return null;
  const affix = getAffix(raw.affixId);
  if (!affix) return null;
  return { instanceId: raw.instanceId, itemType: "affix_scroll", affixType: affix.type, affixId: affix.id, visualClass: "affix_scroll", tradeable: raw.tradeable !== false };
}

function sanitizeAffixScrolls(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.map(sanitizeAffixScroll).filter((scroll) => scroll && !seen.has(scroll.instanceId) && seen.add(scroll.instanceId));
}

// Sanitizace affixů na itemu ze savu. Starší itemy (0.5/0.5.1) → prázdné sloty.
function sanitizeItemAffix(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.affixId !== "string") return null;
  const rolledModifiers = (Array.isArray(raw.rolledModifiers) ? raw.rolledModifiers : [])
    .filter((m) => m && typeof m.statId === "string" && Number.isFinite(m.value))
    .map((m) => {
      const clean = { statId: m.statId, value: m.value };
      if (m.params && typeof m.params === "object") clean.params = { ...m.params };
      if (m.drawback === true) clean.drawback = true;
      return clean;
    });
  return { affixId: raw.affixId, definitionVersion: Number.isFinite(raw.definitionVersion) ? raw.definitionVersion : 1, rolledModifiers };
}
function sanitizeItemAffixes(raw) {
  const prefix = sanitizeItemAffix(raw?.prefix);
  const suffix = sanitizeItemAffix(raw?.suffix);
  return {
    prefix: prefix && getAffix(prefix.affixId)?.type === "prefix" ? prefix : (prefix && !getAffix(prefix.affixId) ? prefix : null),
    suffix: suffix && getAffix(suffix.affixId)?.type === "suffix" ? suffix : (suffix && !getAffix(suffix.affixId) ? suffix : null),
  };
}

// --- Hráčský view model (ALLOWLIST) -----------------------------------------------
// Renderer svitku smí číst POUZE tento objekt. Interní definice (tier, design,
// scarcity, váhy, zdroje) se do něj nikdy nekopírují — a UI je neskrývá pomocí CSS,
// prostě tam nejsou.
const AFFIX_SCROLL_VIEW_KEYS = Object.freeze(["displayName", "affixType", "formattedModifiers", "formattedConditions", "allowedSlots", "requiredLevel", "tradeable", "scrollColor"]);
// Požadovaná úroveň se zatím nevynucuje (item level ve hře není) → null = nezobrazuje se.
const AFFIX_REQUIRED_LEVEL_ENABLED = false;

// Záporná hodnota není automaticky nevýhoda (např. −0,2 s hledání je bonus): rozhoduje registr (`comparison`).
function isHarmfulModifier(statId, value, flaggedDrawback = false) {
  if (flaggedDrawback) return true;
  const stat = STATS[statId];
  if (!stat) return false;
  return stat.comparison === "lowerIsBetter" ? value > 0 : value < 0;
}

function formatAffixModifierLine(modifier, drawback = false) {
  const value = { min: modifier.minValue, max: modifier.maxValue };
  return { text: formatModifier(modifier.statId, value, modifier.params ?? {}), negative: isHarmfulModifier(modifier.statId, (modifier.minValue + modifier.maxValue) / 2, drawback) };
}

function buildAffixScrollViewModel(scroll) {
  const affix = scroll ? getAffix(scroll.affixId) : null;
  if (!affix) return null;
  const formattedModifiers = [
    ...affix.modifiers.map((modifier) => formatAffixModifierLine(modifier, false)),
    ...affix.drawbacks.map((modifier) => formatAffixModifierLine(modifier, true)),
  ];
  const formattedConditions = [];
  if (affix.uniqueEquipped) formattedConditions.push("Only one copy of this affix can be active at a time.");
  if (affix.signatureGroup) formattedConditions.push("Only one affix of its group can be active at a time.");
  if (affix.locationIdentity) formattedConditions.push("Cannot share an item with an affix tied to a different location.");
  if (affix.boundFamily) formattedConditions.push("The enemy family is chosen when the affix is applied and stays bound to the item.");
  const model = {
    displayName: affix.displayName,
    affixType: affix.type,
    formattedModifiers,
    formattedConditions,
    allowedSlots: affix.allowedSlots.map((slot) => AFFIX_SLOT_LABELS[slot] ?? slot),
    requiredLevel: AFFIX_REQUIRED_LEVEL_ENABLED ? affix.requiredItemLevel : null,
    tradeable: Boolean(scroll.tradeable && affix.tradeable),
    scrollColor: getAffixScrollColor(affix),
  };
  return Object.freeze(Object.fromEntries(AFFIX_SCROLL_VIEW_KEYS.map((key) => [key, model[key]])));
}

// Řádky affixu na itemu (konkrétní rolly). Vrací pole { label, name, lines:[{text, negative}] }.
function buildItemAffixLines(item) {
  const result = [];
  for (const { slot, instance } of getItemAffixes(item)) {
    const affix = getAffix(instance.affixId);
    const lines = (instance.rolledModifiers ?? []).map((rolled) => {
      const stat = STATS[rolled.statId];
      return { text: formatModifier(rolled.statId, rolled.value, rolled.params ?? {}), negative: isHarmfulModifier(rolled.statId, rolled.value, rolled.drawback === true), inactive: stat?.calc === "prepared" };
    });
    result.push({ slot, label: slot === "prefix" ? "PREFIX" : "SUFFIX", name: affix?.displayName ?? "Unknown affix", lines });
  }
  return result;
}

// --- Porovnání (dev i hra) -------------------------------------------------------
// Rozdíl součtů affixových modifierů dvou sad itemů podle statId (ne podle textu).
function compareAffixTotals(itemsBefore, itemsAfter) {
  const before = computeAffixTotals(itemsBefore).totals;
  const after = computeAffixTotals(itemsAfter).totals;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.map((key) => {
    const statId = key.split(":")[0];
    const stat = STATS[statId];
    const delta = Math.round(((after[key] ?? 0) - (before[key] ?? 0)) * 100) / 100;
    const better = stat?.comparison === "lowerIsBetter" ? delta < 0 : delta > 0;
    return { key, statId, before: before[key] ?? 0, after: after[key] ?? 0, delta, better: delta === 0 ? null : better };
  });
}
