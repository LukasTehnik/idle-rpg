"use strict";
// Scénáře balance simulátoru. Každý scénář říká, KDY zmrazit stav postavy (checkpoint) a JAK ho vyhodnotit.
// Herní data a pravidla se sem nekopírují: scénáře čtou jen výsledné metriky (lib/metrics.js).
//
// Stavy kontrol:
//   fail – porušená integrita nebo cíl scénáře (neprošel level, zaseknutí, smrtící spirála …)
//   warn – překročený orientační limit z GUARDRAILS níže
//   pass – v pořádku
// GUARDRAILS jsou startovní orientační hodnoty odvozené z prvního měření (6 seedů, 2026-10). Nejsou to designové cíle:
// uprav je, až si je ujasníš. Změna limitu nemění simulaci, jen to, co report označí jako varování.

const GUARDRAILS = {
  earlyGame: {
    maxHoursToLevel10: 15,      // naměřeno 10,2–12,0 h
    maxDeathsPerHour: 70,       // naměřeno ≈54 smrtí/h v pásmu 1–10
    maxFirstHourDeathsPerKill: 1.0, // naměřeno 0,7–0,97
  },
  fullRun: {
    maxHoursToLevel100: 150,    // referenční délka z docs/content-milestone-level-100.md
  },
  bossSafety: {
    spiralMinHours: 3,          // souvislé farmení jednoho bosse nejméně tak dlouho …
    spiralDeathsPerKill: 0.5,   // … s podílem smrtí na zabití alespoň tolik = smrtící spirála
    minKillsToJudge: 50,
    maxDeathsPerKill: 0.5,
  },
  endgame: {
    maxGearLagHours: 25,        // hodin mezi dosažením levelu tieru a 4 kusy výbavy tohoto tieru
    tiers: [8, 9, 10],
  },
};

const check = (id, label, status, detail) => ({ id, label, status, detail });
const lessOrEqual = (id, label, value, limit, unit) => value === null || value === undefined
  ? check(id, label, "fail", "hodnota není k dispozici")
  : check(id, label, value <= limit ? "pass" : "warn", `${value}${unit} (limit ${limit}${unit})`);

function integrity(m) {
  return [
    check("no-script-errors", "Hra běžela bez chyb ve skriptech", m.errors.length ? "fail" : "pass", m.errors.length ? m.errors[0] : "0 chyb"),
    check("no-stall", "Postava se nezasekla na levelu", m.stalled ? "fail" : "pass", m.stalled ? `bez nového levelu od ${m.stalled.atHour} h (level ${m.stalled.level}, cíl ${m.stalled.target})` : "bez zaseknutí"),
  ];
}

const SCENARIOS = [
  {
    id: "early-game",
    title: "Začátek hry (level 1 až 10)",
    description: "Nová postava bez výbavy až do dosažení levelu 10. Měří tvrdost začátku: smrti na zabití, čas do levelu 10, příjem goldu.",
    checkpoint: { level: 10 },
    maxHours: 60,
    evaluate(m) {
      const g = GUARDRAILS.earlyGame; const deathsPerKill = m.firstHour && m.firstHour.kills ? Math.round((m.firstHour.deaths / m.firstHour.kills) * 100) / 100 : null;
      return [
        check("reached-level-10", "Postava dosáhla levelu 10", m.reached && m.level >= 10 ? "pass" : "fail", `level ${m.level} po ${m.hours} h`),
        ...integrity(m),
        lessOrEqual("time-to-level-10", "Čas do levelu 10", m.timeToLevel[10], g.maxHoursToLevel10, " h"),
        lessOrEqual("deaths-per-hour", "Smrtí za hodinu (celý scénář)", m.deathsPerHour, g.maxDeathsPerHour, ""),
        lessOrEqual("first-hour-deaths-per-kill", "Smrtí na zabití v první hodině", deathsPerKill, g.maxFirstHourDeathsPerKill, ""),
      ];
    },
  },
  {
    id: "level-1-100",
    title: "Celá cesta (level 1 až 100)",
    description: "Nová postava až na level 100: časy do milníků, kills/h a smrti po pásmech, příjem a výdaje goldu, craft, upgrady, opravy, dropy.",
    checkpoint: { level: 100 },
    maxHours: 400,
    evaluate(m) {
      const g = GUARDRAILS.fullRun;
      return [
        check("reached-level-100", "Postava dosáhla levelu 100", m.reached && m.level >= 100 ? "pass" : "fail", `level ${m.level} po ${m.hours} h`),
        ...integrity(m),
        check("gold-reconciles", "Gold sedí (získáno = utraceno + ztraceno smrtí + zůstatek)", Math.abs(m.gold.unreconciled) <= 1 ? "pass" : "fail", `rozdíl ${m.gold.unreconciled}`),
        lessOrEqual("hours-to-level-100", "Čas do levelu 100", m.timeToLevel[100], g.maxHoursToLevel100, " h"),
      ];
    },
  },
  {
    id: "boss-safety",
    title: "Bezpečnost boss spotů",
    description: "Hraje do levelu 60 a hledá smrtící spirály: souvislé farmení bosse, kde postava umírá skoro při každém zabití.",
    checkpoint: { level: 60 },
    maxHours: 250,
    spiral: { spiralMinHours: GUARDRAILS.bossSafety.spiralMinHours, spiralDeathsPerKill: GUARDRAILS.bossSafety.spiralDeathsPerKill },
    evaluate(m) {
      const g = GUARDRAILS.bossSafety; const checks = [
        check("reached-level-60", "Postava dosáhla levelu 60", m.reached && m.level >= 60 ? "pass" : "fail", `level ${m.level} po ${m.hours} h`),
        ...integrity(m),
        check("no-boss-spiral", `Žádná smrtící spirála (≥ ${g.spiralMinHours} h na bossovi, ≥ ${g.spiralDeathsPerKill} smrti na zabití)`, m.boss.spirals.length ? "fail" : "pass",
          m.boss.spirals.length ? m.boss.spirals.map((s) => `${s.target}: ${s.hours} h od ${s.fromHour} h, ${s.deaths} smrtí / ${s.kills} zabití`).join("; ") : "bez spirály"),
      ];
      const worst = Object.entries(m.boss.perBoss).filter(([, b]) => b.kills >= g.minKillsToJudge).sort((a, b) => (b[1].deathsPerKill ?? 9) - (a[1].deathsPerKill ?? 9))[0];
      checks.push(worst ? check("boss-deaths-per-kill", `Smrtí na zabití u každého bosse s ≥ ${g.minKillsToJudge} zabitími`, (worst[1].deathsPerKill ?? 9) <= g.maxDeathsPerKill ? "pass" : "warn", `nejhorší ${worst[0]}: ${worst[1].deathsPerKill} (limit ${g.maxDeathsPerKill})`)
        : check("boss-deaths-per-kill", `Smrtí na zabití u každého bosse s ≥ ${g.minKillsToJudge} zabitími`, "pass", "žádný boss nebyl farmen dost dlouho"));
      return checks;
    },
  },
  {
    id: "endgame-t8-t10",
    title: "Endgame T8–T10: dostupnost výbavy a materiálů",
    description: "Celá cesta na level 100 a dalších 20 h farmení. Ověřuje, kdy má postava 4 kusy výbavy T8, T9 a T10, zda se vykovaly recepty těchto tierů a zda padají jejich suroviny.",
    checkpoint: { level: 100, extraHours: 20 },
    maxHours: 450,
    evaluate(m) {
      const g = GUARDRAILS.endgame; const checks = [
        check("reached-level-100", "Postava dosáhla levelu 100 a odehrála dalších 20 h", m.reached ? "pass" : "fail", `level ${m.level} po ${m.hours} h`),
        ...integrity(m),
      ];
      for (const tier of g.tiers) {
        const gear = m.gearTier[tier];
        checks.push(check(`gear-t${tier}-available`, `T${tier}: postava získala 4 kusy výbavy`, gear.atLeast4 ? "pass" : "fail", gear.atLeast4 ? `v ${gear.atLeast4.tHours} h (level ${gear.atLeast4.level})` : "nikdy do konce scénáře"));
        checks.push(lessOrEqual(`gear-t${tier}-lag`, `T${tier}: zpoždění výbavy za levelem`, gear.lagHours, g.maxGearLagHours, " h"));
        checks.push(check(`forged-t${tier}`, `T${tier}: aspoň jeden recept byl vykován`, (m.crafting.forgedByTier[tier] ?? 0) > 0 ? "pass" : "warn", `${m.crafting.forgedByTier[tier] ?? 0}× vykováno`));
        checks.push(check(`materials-t${tier}`, `T${tier}: padají suroviny tieru`, (m.materials.byTier[tier] ?? 0) > 0 ? "pass" : "fail", `${m.materials.byTier[tier] ?? 0} ks nasbíráno`));
      }
      return checks;
    },
  },
];

const DEFAULT_SEEDS = [1, 2, 3];
const getScenario = (id) => SCENARIOS.find((s) => s.id === id) ?? null;

module.exports = { SCENARIOS, GUARDRAILS, DEFAULT_SEEDS, getScenario };
