"use strict";

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
