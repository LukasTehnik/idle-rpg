"use strict";
// Výpočet metrik z jednoho zmrazeného stavu běhu (checkpoint). Čistá funkce bez závislosti na hře: vstupem je JSON z lib/run.js.
const CYCLE_HOURS = 600000 / 3.6e6;
const LEVEL_MILESTONES = [10, 20, 40, 60, 80, 100];
const BANDS = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 60], [61, 70], [71, 80], [81, 90], [91, 100]];
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);
const sum = (obj) => Object.values(obj ?? {}).reduce((a, b) => a + Number(b || 0), 0);

// Tier suroviny z jejího id ("t7-ore" → 7); starší suroviny prvního tieru (iron-rivets …) → 1.
function materialTier(id) { const m = /^t(\d+)-/.exec(id); return m ? Number(m[1]) : 1; }

function cumulativeAt(cycles, hours) {
  let last = { kills: 0, deaths: 0 };
  for (const c of cycles) { if (c[0] <= hours + 1e-9) last = { kills: c[2], deaths: c[3] }; else break; }
  return last;
}

function bandStats(snapshot) {
  const { m, cycles, snap } = snapshot; const out = [];
  for (const [from, to] of BANDS) {
    const t0 = from === 1 ? 0 : m.levelAt[from];
    if (t0 === undefined) break; // pásmo ještě nezačalo
    const t1 = m.levelAt[to + 1] !== undefined ? m.levelAt[to + 1] : (snap.level === to || to === 100 ? m.levelAt[to] : undefined); // poslední pásmo končí dosažením svého horního levelu
    const partial = t1 === undefined; const end = partial ? snap.tHours : t1;
    if (partial && snap.level < from) break;
    const a = cumulativeAt(cycles, t0), b = cumulativeAt(cycles, end); const hours = end - t0;
    if (hours <= 0) continue;
    out.push({ from, to, partial, hours: r1(hours), kills: b.kills - a.kills, deaths: b.deaths - a.deaths, killsPerHour: Math.round((b.kills - a.kills) / hours), deathsPerHour: r1((b.deaths - a.deaths) / hours) });
  }
  return out;
}

function bossStats(snapshot, { spiralMinHours = 3, spiralDeathsPerKill = 0.5 } = {}) {
  const { m, cycles, targetTime } = snapshot; const boss = new Set(m.bossIds ?? []);
  const perBoss = {};
  for (const id of boss) {
    const kills = m.targetKills[id] ?? 0, deaths = m.deathsByTarget[id] ?? 0, hours = targetTime[id] ?? 0;
    if (!hours && !kills && !deaths) continue;
    perBoss[id] = { hours: r1(hours), kills, deaths, deathsPerKill: kills ? r3(deaths / kills) : (deaths ? null : 0) };
  }
  // souvislá období na jednom boss spotu; změna kills/smrtí mezi dvěma zásahy patří cíli z předchozího zásahu
  const spirals = []; let prev = { t: 0, kills: 0, deaths: 0, target: snapshot.series[0]?.target ?? null }; let run = null;
  const flush = () => {
    if (run && run.hours >= spiralMinHours && (run.kills ? run.deaths / run.kills >= spiralDeathsPerKill : run.deaths > 0)) {
      spirals.push({ target: run.target, fromHour: r1(run.from), toHour: r1(run.from + run.hours), hours: r1(run.hours), kills: run.kills, deaths: run.deaths, deathsPerKill: run.kills ? r3(run.deaths / run.kills) : null });
    }
    run = null;
  };
  for (const c of cycles) {
    const [t, , kills, deaths, target] = c; const dk = kills - prev.kills, dd = deaths - prev.deaths, owner = prev.target;
    if (owner && boss.has(owner)) {
      if (!run || run.target !== owner) { flush(); run = { target: owner, from: prev.t, hours: 0, kills: 0, deaths: 0 }; }
      run.hours += t - prev.t; run.kills += dk; run.deaths += dd;
    } else flush();
    prev = { t, kills, deaths, target };
  }
  flush();
  return { perBoss, spirals };
}

function targetStats(snapshot) {
  const { m, targetTime } = snapshot;
  const rows = Object.keys({ ...targetTime, ...m.targetKills }).filter((id) => id !== "null" && id !== "undefined").map((id) => ({
    id, hours: r1(targetTime[id] ?? 0), kills: m.targetKills[id] ?? 0, deaths: m.deathsByTarget[id] ?? 0,
  })).sort((a, b) => b.hours - a.hours);
  const reasons = {};
  for (const change of m.targetChanges) { const key = String(change.why).split(/[:×]/)[0].trim(); reasons[key] = (reasons[key] || 0) + 1; }
  return { changeCount: m.targetChangeCount, reasons, byTarget: rows, changes: m.targetChanges };
}


// Průběh po 10 hodinách herního času (z hodinových snímků): level, zabití, smrti, gold, dropy podle kvality, dropy s affixem, materiály
function timelineStats(snapshot, every = 10) {
  const rows = [];
  for (const s of snapshot.series) {
    if (Math.round(s.tHours) % every !== 0) continue;
    rows.push({ hour: Math.round(s.tHours), level: s.level, kills: s.kills, deaths: s.deaths, goldEarned: s.goldEarned, goldFromSales: s.goldFromSales, bank: s.bank, carried: s.carried,
      drops: s.drops?.total ?? null, rare: s.drops?.byQ?.rare ?? 0, epic: s.drops?.byQ?.epic ?? 0, legendary: s.drops?.byQ?.legendary ?? 0, withAffix: s.drops?.affixed ?? null, materials: s.matsFound ?? null });
  }
  return rows.filter((r, i, a) => a.findIndex((q) => q.hour === r.hour) === i);
}

function computeMetrics(snapshot, options = {}) {
  const { m, snap, stats } = snapshot; const hours = snapshot.virtualHours;
  const timeToLevel = {}; for (const level of LEVEL_MILESTONES) timeToLevel[level] = m.levelAt[level] ?? null;
  const spent = { forge: m.spend.forge, upgrade: m.spend.upgrade, repair: m.spend.repair, food: m.spend.food };
  const spentTotal = sum(spent), balance = snap.carried + snap.bank;
  const gold = { earned: snap.goldEarned, fromSales: snap.goldFromSales, spent, spentTotal, lostToDeath: snap.goldLostToDeath, balance, unreconciled: snap.goldEarned - spentTotal - snap.goldLostToDeath - balance };
  const matByTier = {}; for (const [id, qty] of Object.entries(m.matGain)) { const t = materialTier(id); matByTier[t] = (matByTier[t] || 0) + qty; }
  const matByKind = {}; for (const [id, qty] of Object.entries(m.matGain)) { const kind = id.replace(/^t\d+-/, ''); matByKind[kind] = (matByKind[kind] || 0) + qty; }
  const gear = {};
  for (let tier = 1; tier <= 10; tier += 1) {
    const four = m.gearTier[tier] ?? null, one = m.gearTierAny[tier] ?? null, levelOk = tier === 1 ? 1 : (m.levelAt[10 * (tier - 1) + 1] ?? null);
    const reachedLevelAtHour = tier === 1 ? 0 : levelOk;
    gear[tier] = { atLeast4: four ? { tHours: r1(four.tHours), level: four.level } : null, atLeast1: one ? { tHours: r1(one.tHours), level: one.level } : null, levelReachedHour: r1(reachedLevelAtHour), lagHours: four && reachedLevelAtHour !== null ? r1(four.tHours - reachedLevelAtHour) : null };
  }
  const first = {}; for (const q of ["rare", "epic", "legendary", "mythic"]) first[q] = m.firstDrop[q] ? { tHours: r1(m.firstDrop[q].tHours), level: m.firstDrop[q].level, tier: m.firstDrop[q].tier, name: m.firstDrop[q].name, enemy: m.firstDrop[q].enemy } : null;
  const bands = bandStats(snapshot);
  return {
    seed: snapshot.seed, reached: snapshot.reached, stopReason: snapshot.reason, hours: r1(hours), level: snap.level,
    kills: snap.kills, deaths: snap.deaths, killsPerHour: Math.round(snap.kills / Math.max(hours, 1e-9)), deathsPerHour: r1(snap.deaths / Math.max(hours, 1e-9)),
    timeToLevel: Object.fromEntries(Object.entries(timeToLevel).map(([k, v]) => [k, r1(v)])),
    bands, gold,
    materials: { found: sum(m.matGain), byTier: matByTier, byKind: matByKind, smeltRecovered: sum(m.smeltGain) },
    crafting: { forged: m.forge.ok, forgeFailed: m.forge.fail, forgedByTier: m.forge.byTier, upgrades: m.upgrade.ok, upgradeFailures: m.upgrade.fail, repairs: m.repairs, smelts: m.smelts, itemsSold: m.sold, scrollsLearned: m.scrollsLearned, repairGold: m.spend.repair },
    drops: { total: m.dropsTotal, byQuality: m.dropsByQ, byTier: m.dropsByTier, withAffix: m.dropsAffixed, affixesByTier: m.affixDropsByTier, affixesByKind: m.affixDropsByKind, byQualityAffix: m.dropsByQAffix ?? {}, first },
    gearTier: gear, timeline: timelineStats(snapshot),
    targets: targetStats(snapshot), boss: bossStats(snapshot, options),
    firstHour: snapshot.series[0] ? { kills: snapshot.series[0].kills, deaths: snapshot.series[0].deaths } : null,
    errors: snapshot.errors, stalled: snapshot.stalled, rngCalls: snapshot.rngCalls,
    itemsFound: stats.itemsFound, materialsFound: stats.materialsFound,
    coreFragments: snap.core ?? 0, unclaimedAtEnd: snap.unclaimed ?? 0,
  };
}

module.exports = { computeMetrics, LEVEL_MILESTONES, BANDS, materialTier };
