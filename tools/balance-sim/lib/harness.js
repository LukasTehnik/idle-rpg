"use strict";
// Harness s virtuálním časem: spustí SKUTEČNÝ index.html + app.js (a všechny datové soubory hry) v jsdom.
// Řídí se jen tím, co hra nemůže ovlivnit: čas (performance.now / Date.now / timery) a Math.random (seed).
// Herní pravidla, data, dropy, XP, recepty a boj se nikde nekopírují – jedou z kódu v repozitáři.
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function requireJsdom() {
  const wanted = process.env.JSDOM_MODULE || "jsdom";
  try { return require(wanted); } catch (error) {
    // zkusíme i lokální instalaci nástroje: npm --prefix tools/balance-sim install
    try { return require(path.join(__dirname, "..", "node_modules", "jsdom")); } catch (_) { /* fallthrough */ }
    throw new Error(`Chybí balíček jsdom (${error.message.split("\n")[0]}).\n` +
      "Nainstaluj ho mimo produkční hru:  npm --prefix tools/balance-sim install\n" +
      "nebo nastav JSDOM_MODULE na cestu k nainstalovanému jsdom.");
  }
}

function mulberry32(seed) {
  let a = seed | 0;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Seznam funkcí, které jen kreslí / ukládají. V simulaci jsou prázdné, aby běh nebyl pomalý. Logiku hry nemění;
// regresní test (tests/regression.js) proti Chromiu hlídá, že na těchto funkcích herní logika nezávisí.
const UI_ONLY_FUNCTIONS = [
  "render", "renderLoot", "renderSmith", "renderMerchant", "renderBestiary", "renderMapPage", "renderRecentDrops",
  "showNoticeToast", "showDropToast", "showMaterialToast", "presentToast", "addLog", "navigate", "updateArenaHeader",
  "saveState", "saveWaveTelemetry", "renderCombatWidgets", "updateNavBadges", "pushLootLog",
];

async function loadGame({ root = REPO_ROOT, seed = 1, stubUi = true, file = "index.html" } = {}) {
  const { JSDOM, ResourceLoader, VirtualConsole } = requireJsdom();
  class LocalResources extends ResourceLoader {
    fetch(url) {
      const rel = new URL(url).pathname.slice(1);
      if (!rel || !fs.existsSync(path.join(root, rel))) return null;
      return Promise.resolve(fs.readFileSync(path.join(root, rel)));
    }
  }
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => { if (!/canvas|Not implemented:.*scroll/i.test(e.message)) errors.push(e.message); });
  const clock = { now: 0, epoch: 1.8e12, timers: [], seq: 1, rngCalls: 0 };
  const rng = mulberry32(seed);
  const dom = new JSDOM(fs.readFileSync(path.join(root, file), "utf8"), {
    url: `http://localhost/${file}?nologin`, runScripts: "dangerously", resources: new LocalResources(), pretendToBeVisual: true, virtualConsole,
    beforeParse(w) {
      Object.defineProperty(w.navigator, "webdriver", { value: true });
      w.fetch = () => Promise.reject(Error("Network disabled"));
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.ResizeObserver = class { observe() {} disconnect() {} };
      w.CSS = { escape: (s) => s }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: () => ({ width: 10 }) }, { get: (t, p) => t[p] ?? (() => {}) });
      if (w.HTMLDialogElement) { w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; }; }
      w.confirm = () => true;
      w.Math.random = () => { clock.rngCalls++; return rng(); };
      Object.defineProperty(w.performance, "now", { value: () => clock.now, configurable: true });
      w.Date.now = () => clock.epoch + clock.now;
      const add = (fn, ms, repeat) => { const id = clock.seq++; const delay = Math.max(1, ms | 0); clock.timers.push({ id, fn, ms: delay, due: clock.now + delay, repeat, seq: id }); return id; };
      w.setInterval = (fn, ms) => add(fn, ms, true);
      w.setTimeout = (fn, ms) => add(fn, ms ?? 0, false);
      w.clearInterval = w.clearTimeout = (id) => { clock.timers = clock.timers.filter((t) => t.id !== id); };
      w.requestAnimationFrame = (fn) => (stubUi ? 0 : add(() => fn(clock.now), 16, false));
      w.cancelAnimationFrame = w.clearTimeout;
    },
  });
  const w = dom.window;
  await new Promise((resolve) => setImmediate(resolve));
  // app.js se do stránky vkládá dynamicky (cloud-sync.js) – počkáme na `state` a `startLoops`
  for (let i = 0; i < 100; i += 1) {
    if (w.eval("typeof state!=='undefined' && typeof startLoops==='function'")) break;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  if (!w.eval("typeof state!=='undefined' && typeof startLoops==='function'")) throw new Error("Hra se nenačetla: " + errors.slice(0, 3).join(" | "));
  // Posune virtuální čas a vykoná všechny timery, které za tu dobu uplynou (deterministicky, podle času a pořadí vzniku).
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
  const ev = (code) => w.eval(code);
  if (stubUi) ev(`(()=>{const noop=()=>{};for(const n of ${JSON.stringify(UI_ONLY_FUNCTIONS)}) if(typeof globalThis[n]==="function") globalThis[n]=noop; window.CombatField=null;})()`);
  return { dom, w, ev, clock, advance, errors, rng, close: () => w.close() };
}

module.exports = { loadGame, mulberry32, requireJsdom, REPO_ROOT, UI_ONLY_FUNCTIONS };
