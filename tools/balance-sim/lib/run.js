"use strict";
// Jeden deterministický běh nové postavy (jeden seed). Z jednoho běhu se odebírá víc "checkpointů":
// každý scénář říká, kdy se má stav zmrazit (např. po dosažení levelu 10 nebo 20 h po levelu 100).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadGame, REPO_ROOT } = require("./harness");

const CYCLE_MS = 600000; // bot zasahuje každých 10 virtuálních minut

// Otisk herního kódu a dat: pozná, že reporty vznikly nad jinou verzí hry (porovnání před/po změně balancu).
function gameFingerprint(root = REPO_ROOT) {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
  const files = [...new Set(["index.html", ...scripts, "app.js"])].sort();
  const hash = crypto.createHash("sha1");
  for (const file of files) { const full = path.join(root, file); if (fs.existsSync(full)) { hash.update(file); hash.update(fs.readFileSync(full)); } }
  return { sha1: hash.digest("hex").slice(0, 12), files: files.length };
}

function pageJson(game, code) { return JSON.parse(game.ev(`JSON.stringify(${code})`)); }

// checkpoints: [{ id, level, extraHours? }]; id je id scénáře. maxHours = tvrdý strop virtuálního času.
// trace: null | { detail: "standard" | "full", sampleSeconds? } – záznam událostí a snímků pro Simulation Viewer (výsledky simulace neovlivní).
async function simulateSeed({ root = REPO_ROOT, seed = 1, checkpoints, maxHours = 400, stallHours = 60, onProgress = null, trace = null }) {
  const started = Date.now();
  const game = await loadGame({ root, seed, stubUi: true });
  game.ev(fs.readFileSync(path.join(__dirname, "bot-page.js"), "utf8"));
  game.ev("window.__bot.m.bossIds = Object.values(ENEMIES).filter((e) => e.type === 'boss').map((e) => e.id);");
  const detail = trace?.detail ?? "standard"; const sampleMs = trace ? Math.round((trace.sampleSeconds ?? (detail === "full" ? 60 : 0)) * 1000) : 0;
  game.ev(`__bot.setTrace(${JSON.stringify({ on: !!trace, detail })})`);
  const traceData = trace ? { events: [], ticks: [], frames: [] } : null;
  const drain = () => { if (!traceData) return; const d = JSON.parse(game.ev("__bot.drain()")); for (const k of ["events", "ticks", "frames"]) for (const x of d[k]) traceData[k].push(x); };
  const cycles = []; // [tHours, level, kills, deaths, targetId] po každém zásahu bota
  const series = []; // hodinové snímky celého stavu
  const targetTime = {};
  const results = {};
  const pending = new Map(checkpoints.map((c) => [c.id, { ...c, reachedAt: null }]));
  let lastLevel = 1, lastLevelHour = 0, stalled = null, reason = "cap";

  const snapshot = (cp, reached) => {
    const data = pageJson(game, "({ snap: __bot.snap(), m: __bot.m, stats: state.stats })");
    delete data.snap.mats; // zůstane v data.m.matGain; kopie by jen nafukovala JSON
    return {
      scenarioId: cp.id, seed, reached, reason: reached ? "checkpoint" : reason, virtualHours: +(game.clock.now / 3.6e6).toFixed(3),
      snap: data.snap, m: data.m, stats: data.stats, series: JSON.parse(JSON.stringify(series)), cycles: JSON.parse(JSON.stringify(cycles)), targetTime: { ...targetTime },
      rngCalls: game.clock.rngCalls, errors: game.errors.slice(0, 5), stalled,
      traceEnd: traceData ? { events: traceData.events.length, ticks: traceData.ticks.length, frames: traceData.frames.length } : null,
    };
  };

  game.ev("__bot.cycle()"); drain();
  while (pending.size && game.clock.now < maxHours * 3.6e6) {
    const target = game.ev("state.run.targetEnemyId");
    targetTime[target] = (targetTime[target] || 0) + CYCLE_MS / 3.6e6;
    if (sampleMs > 0) for (let sub = 0; sub < CYCLE_MS / sampleMs; sub += 1) { game.advance(sampleMs); game.ev("__bot.tick()"); } else game.advance(CYCLE_MS);
    game.ev("__bot.cycle()"); drain();
    const hours = game.clock.now / 3.6e6;
    const level = game.ev("state.level");
    cycles.push([+hours.toFixed(3), level, game.ev("state.kills"), game.ev("state.stats.deaths"), game.ev("state.run.targetEnemyId")]);
    if (Math.round(game.clock.now / CYCLE_MS) % 6 === 0) {
      const s = pageJson(game, "__bot.snap()"); delete s.mats; series.push(s);
      if (onProgress && series.length % 10 === 0) onProgress({ seed, hours: +hours.toFixed(1), level, kills: s.kills, deaths: s.deaths });
    }
    if (level > lastLevel) { lastLevel = level; lastLevelHour = hours; }
    // závěr checkpointů
    for (const [id, cp] of pending) {
      if (cp.reachedAt === null && level >= cp.level) cp.reachedAt = hours;
      if (cp.reachedAt !== null && hours >= cp.reachedAt + (cp.extraHours ?? 0)) { results[id] = snapshot(cp, true); pending.delete(id); }
    }
    if (level < 100 && hours - lastLevelHour >= stallHours) { stalled = { atHour: +hours.toFixed(2), level, target: game.ev("state.run.targetEnemyId") }; reason = "stalled"; break; }
  }
  if (pending.size && reason === "cap") reason = "max-hours";
  for (const [id, cp] of pending) results[id] = snapshot(cp, false);
  const fingerprint = gameFingerprint(root);
  const out = { seed, results, wallSeconds: +((Date.now() - started) / 1000).toFixed(1), gameFingerprint: fingerprint };
  if (traceData) out.trace = { schema: 1, kind: "balance-sim-trace", seed, gameFingerprint: fingerprint.sha1, detail, cycleMs: CYCLE_MS, sampleMs, dictionary: JSON.parse(game.ev("JSON.stringify(__bot.dictionary())")), ...traceData };
  game.close();
  return out;
}

module.exports = { simulateSeed, gameFingerprint, CYCLE_MS };
