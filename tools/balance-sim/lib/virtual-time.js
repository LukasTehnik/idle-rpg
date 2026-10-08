"use strict";
// Virtuální čas a seedovaný Math.random pro hru. Jediný zdroj pro jsdom (lib/harness.js) i pro živý běh v prohlížeči (viewer).
// Řídí se jen to, co hra sama nemůže ovlivnit: čas (performance.now, Date.now, setInterval, setTimeout, requestAnimationFrame) a Math.random.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BalanceSimVirtualTime = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function mulberry32(seed) {
    let a = seed | 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Volání z vykreslovacího kódu (částice, efekty) nesmí spotřebovat náhodu herní logiky: v živém běhu mají vlastní proud.
  const VISUAL_STACK = /combat-field|spawnCombatBurst|animateHit|spawnSpark/;

  // opts: seed, stubUi (requestAnimationFrame se nevolá), visualSplit (oddělený proud náhody pro vykreslování),
  //       memoryStorage (localStorage/sessionStorage hry jen v paměti, nikdy se nezapíše do skutečného úložiště),
  //       startMs (počáteční hodnota virtuálních hodin), errors (pole pro chyby časovačů)
  function install(w, opts = {}) {
    const { seed = 1, stubUi = true, visualSplit = false, memoryStorage = false, startMs = 0, errors = [] } = opts;
    const clock = { now: startMs, epoch: 1.8e12, timers: [], seq: 1, rngCalls: 0, visualCalls: 0 };
    const main = mulberry32(seed), visual = mulberry32(seed + 7919);
    w.confirm = () => true;
    w.Math.random = visualSplit
      ? () => { const s = new Error().stack || ""; if (VISUAL_STACK.test(s)) { clock.visualCalls++; return visual(); } clock.rngCalls++; return main(); }
      : () => { clock.rngCalls++; return main(); };
    Object.defineProperty(w.performance, "now", { value: () => clock.now, configurable: true });
    w.Date.now = () => clock.epoch + clock.now;
    const add = (fn, ms, repeat) => { const id = clock.seq++; const delay = Math.max(1, ms | 0); clock.timers.push({ id, fn, ms: delay, due: clock.now + delay, repeat, seq: id }); return id; };
    w.setInterval = (fn, ms) => add(fn, ms, true);
    w.setTimeout = (fn, ms) => add(fn, ms ?? 0, false);
    w.clearInterval = w.clearTimeout = (id) => { clock.timers = clock.timers.filter((t) => t.id !== id); };
    w.requestAnimationFrame = (fn) => (stubUi ? 0 : add(() => fn(clock.now), 16, false));
    w.cancelAnimationFrame = w.clearTimeout;
    if (memoryStorage && w.Storage) {
      // Hra se v živém běhu nesmí dotknout skutečného localStorage (ani uložené hry): metody Storage jedou nad Mapou v paměti.
      const stores = new WeakMap(); const of = (s) => { if (!stores.has(s)) stores.set(s, new Map()); return stores.get(s); };
      const P = w.Storage.prototype;
      P.getItem = function (k) { const m = of(this); return m.has(String(k)) ? m.get(String(k)) : null; };
      P.setItem = function (k, v) { of(this).set(String(k), String(v)); };
      P.removeItem = function (k) { of(this).delete(String(k)); };
      P.clear = function () { of(this).clear(); };
      P.key = function (i) { return [...of(this).keys()][i] ?? null; };
      Object.defineProperty(P, "length", { get() { return of(this).size; }, configurable: true });
    }
    // Posune virtuální čas a vykoná všechny timery, které za tu dobu uplynou (deterministicky: podle času a pořadí vzniku).
    const advance = (ms) => {
      const target = clock.now + ms;
      for (;;) {
        let best = null;
        for (const t of clock.timers) if (t.due <= target && (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq))) best = t;
        if (!best) break;
        clock.now = best.due;
        if (best.repeat) { best.due += best.ms; best.seq = clock.seq++; } else clock.timers = clock.timers.filter((t) => t !== best);
        try { best.fn(); } catch (e) { errors.push("timer: " + (e.stack || e.message)); }
      }
      clock.now = target;
    };
    return { clock, advance, errors, rng: main };
  }

  return { install, mulberry32, VISUAL_STACK };
});
