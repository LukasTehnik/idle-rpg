"use strict";

// Wave economy assumptions are intentionally separate from live enemy loot.
// They power the internal Balance Lab and give content authors one shared
// conversion between a wave rhythm and rewards/hour.
const WAVE_BALANCE = Object.freeze({
  version: "0.9-wave",
  // Combat is sequential: one target receives an attack every `attackMs`.
  // A full wave therefore needs waveSize × hitsToKill attacks before the
  // cooldown starts. This replaces the earlier incorrect simultaneous-clear
  // model where 14 kills were assumed to happen in 14 seconds.
  defaults: Object.freeze({ waveSize: 14, bossWaveSize: 4, hitsToKill: 4, attackMs: 1600, cooldownMs: 8500 }),
  waveClearMs(waveSize, hitsToKill, attackMs) {
    return Math.max(1, Number(waveSize) || 0) * Math.max(1, Number(hitsToKill) || 0) * Math.max(1, Number(attackMs) || 0);
  },
  killsPerHour(waveSize, hitsToKill, attackMs, cooldownMs) {
    const size = Math.max(1, Number(waveSize) || 0);
    const cycleMs = WAVE_BALANCE.waveClearMs(size, hitsToKill, attackMs) + Math.max(0, Number(cooldownMs) || 0);
    return cycleMs > 0 ? (size * 3600000) / cycleMs : 0;
  },
  chanceForHours(killsPerHour, hours) {
    const rate = Math.max(0, Number(killsPerHour) || 0);
    const target = Math.max(0, Number(hours) || 0);
    return rate && target ? 1 / (rate * target) : 0;
  },
  hoursForChance(killsPerHour, chance) {
    const rate = Math.max(0, Number(killsPerHour) || 0);
    const p = Math.max(0, Number(chance) || 0);
    return rate && p ? 1 / (rate * p) : Infinity;
  },
  percentileHours(killsPerHour, chance, percentile) {
    const base = WAVE_BALANCE.hoursForChance(killsPerHour, chance);
    if (!Number.isFinite(base)) return Infinity;
    return -Math.log(1 - percentile) * base;
  },
});

// Prototype 0.7 — pracovní mantinely pro obsah. Nejde o finální balance;
// hodnoty dávají vývojářům jednotný jazyk, podle kterého se nové oblasti a
// nepřátelé navrhují a testují. Skutečný drop je stále výhradně v world-data.js.
const COMBAT_BALANCE = Object.freeze({
  version: "0.7",
  byType: Object.freeze({
    common: Object.freeze({ targetTtkSeconds: [5, 9], searchMs: 1600, materialBand: [0.45, 0.7] }),
    uncommon: Object.freeze({ targetTtkSeconds: [9, 15], searchMs: 2200, materialBand: [0.38, 0.62] }),
    rare: Object.freeze({ targetTtkSeconds: [15, 25], searchMs: 3200, materialBand: [0.28, 0.48] }),
    elite: Object.freeze({ targetTtkSeconds: [25, 45], searchMs: 4500, materialBand: [0.18, 0.36] }),
    boss: Object.freeze({ targetTtkSeconds: [45, 90], searchMs: 6500, materialBand: [0.08, 0.22] }),
  }),
  // HP se neurčuje izolovaně: playerDps × cílový čas boje. Milion HP dává
  // smysl až v bodě hry, kdy odpovídá cílovému času boje, ne jako univerzální boss číslo.
  hpFor: (playerDps, enemyType) => {
    const band = COMBAT_BALANCE.byType[enemyType] ?? COMBAT_BALANCE.byType.common;
    return [Math.round(playerDps * band.targetTtkSeconds[0]), Math.round(playerDps * band.targetTtkSeconds[1])];
  },
});

function enemySearchMs(enemy) {
  return COMBAT_BALANCE.byType[enemy?.type]?.searchMs ?? CONFIG.enemyRespawnMs;
}
