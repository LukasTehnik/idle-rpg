"use strict";
// Souhrn z trace. Používá ho Node (testy) i Simulation Viewer (stejný soubor, žádná kopie): proto musí být souhrn
// počítaný jen z dat trace, bez znalosti pravidel hry. Test tests/viewer.js ověřuje, že souhrn z trace
// sedí s metrikami CLI reportu (lib/metrics.js) na každé číslo.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BalanceSimTraceSummary = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const MILESTONES = [10, 20, 40, 60, 80, 100];
  const r1 = (x) => Math.round(x * 10) / 10;

  function summarize(trace) {
    const frames = trace.frames, last = frames[frames.length - 1];
    if (!last) return null;
    const timeToLevel = {}; for (const l of MILESTONES) timeToLevel[l] = null;
    const drops = { total: 0, byQuality: {}, withAffix: 0 };
    const crafting = { forged: 0, forgeFailed: 0, upgrades: 0, upgradeFailures: 0, repairs: 0, smelts: 0, itemsSold: 0, scrollsLearned: 0 };
    const warnings = {}; let targetChanges = 0;
    for (const e of trace.events) {
      switch (e.type) {
        case "levelup": if (MILESTONES.includes(e.level) && timeToLevel[e.level] === null) timeToLevel[e.level] = r1(e.t / 3.6e6); break;
        case "drop": drops.total++; drops.byQuality[e.item.quality] = (drops.byQuality[e.item.quality] || 0) + 1; if (e.item.prefix || e.item.suffix) drops.withAffix++; break;
        case "forge": if (e.ok) crafting.forged++; else crafting.forgeFailed++; break;
        case "upgrade": if (e.ok) crafting.upgrades++; else crafting.upgradeFailures++; break;
        case "repair": crafting.repairs++; break;
        case "smelt": crafting.smelts++; break;
        case "sale": crafting.itemsSold += e.count; break;
        case "learn": crafting.scrollsLearned++; break;
        case "target": targetChanges++; break;
        case "warning": warnings[e.kind] = (warnings[e.kind] || 0) + 1; break;
        default: break;
      }
    }
    const hours = last.t / 3.6e6;
    return {
      seed: trace.seed, hours: r1(hours), level: last.level, kills: last.kills, deaths: last.deaths,
      killsPerHour: Math.round(last.kills / Math.max(hours, 1e-9)), deathsPerHour: r1(last.deaths / Math.max(hours, 1e-9)),
      timeToLevel, gold: last.gold, drops, crafting, targetChanges, warnings,
    };
  }

  // Porovná souhrn z trace s metrikami CLI reportu (scenarios[].runs[].metrics). Vrací seznam rozdílů (prázdný = shoda).
  function compareToMetrics(summary, m) {
    const diffs = []; const eq = (name, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ field: name, trace: a, cli: b }); };
    eq("hours", summary.hours, m.hours); eq("level", summary.level, m.level); eq("kills", summary.kills, m.kills); eq("deaths", summary.deaths, m.deaths);
    eq("killsPerHour", summary.killsPerHour, m.killsPerHour); eq("deathsPerHour", summary.deathsPerHour, m.deathsPerHour);
    for (const l of MILESTONES) eq(`timeToLevel.${l}`, summary.timeToLevel[l], m.timeToLevel[l]);
    for (const k of ["earned", "fromSales", "spentTotal", "lostToDeath", "balance"]) eq(`gold.${k}`, summary.gold[k], m.gold[k]);
    for (const k of ["forge", "upgrade", "repair", "food"]) eq(`gold.spent.${k}`, summary.gold.spent[k], m.gold.spent[k]);
    eq("drops.total", summary.drops.total, m.drops.total); eq("drops.withAffix", summary.drops.withAffix, m.drops.withAffix);
    const sortKeys = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    eq("drops.byQuality", sortKeys(summary.drops.byQuality), sortKeys(m.drops.byQuality));
    for (const k of Object.keys(summary.crafting)) eq(`crafting.${k}`, summary.crafting[k], m.crafting[k]);
    eq("targetChanges", summary.targetChanges, m.targets.changeCount);
    return diffs;
  }

  return { summarize, compareToMetrics, MILESTONES };
});
