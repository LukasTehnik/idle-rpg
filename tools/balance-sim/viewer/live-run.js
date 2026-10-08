"use strict";
// Živý browser run: SKUTEČNÁ vykreslená hra (index.html v iframe, s plným renderem) běží se stejným botem, stejným seedem a stejnými
// virtuálními hodinami jako CLI simulace. Výsledné události a snímky se porovnají s trace. Shoda dokazuje, že simulace (jsdom bez UI)
// a vykreslená hra dělají totéž. Nic z herní logiky tu není: skript jen posouvá hodiny a volá __bot.cycle()/tick().
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // První rozdíl mezi dvěma JSON hodnotami jako cesta ("[2].gold.earned: 10 ≠ 11")
  function firstDiff(a, b, path = "") {
    if (a === b) return null;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return `${path || "(kořen)"}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) { const d = firstDiff(a[k], b[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`); if (d) return d; }
    return null;
  }

  // trace: načtený trace; minutes: kolik virtuálních minut odehrát; container: element pro iframe; onProgress({minute, of})
  async function runLive({ trace, minutes, container, onProgress }) {
    const iframe = document.createElement("iframe");
    iframe.className = "live-frame"; iframe.title = "Vykreslená hra (živý běh)";
    iframe.src = `/index.html?nologin&bsim=${trace.seed}`;
    container.replaceChildren(iframe);
    await new Promise((resolve) => iframe.addEventListener("load", resolve, { once: true }));
    const w = iframe.contentWindow;
    for (let i = 0; i < 400; i += 1) { if (w.eval("typeof state!=='undefined'&&typeof startLoops==='function'")) break; await sleep(50); }
    if (!w.eval("typeof state!=='undefined'&&typeof startLoops==='function'")) throw new Error("Hra se v iframe nenačetla.");
    const botSrc = await (await fetch("/tools/balance-sim/lib/bot-page.js", { cache: "no-store" })).text();
    w.eval(botSrc);
    w.eval(`__bot.setTrace(${JSON.stringify({ on: true, detail: trace.detail })}); __bot.m.bossIds = Object.values(ENEMIES).filter((e) => e.type === 'boss').map((e) => e.id);`);
    const live = { events: [], ticks: [], frames: [] };
    const drain = () => { const d = JSON.parse(w.eval("__bot.drain()")); for (const k of Object.keys(live)) live[k].push(...d[k]); };
    const cycleMs = trace.cycleMs, sampleMs = trace.sampleMs || 0;
    const cycles = Math.floor((minutes * 60000) / cycleMs);
    w.eval("__bot.cycle()"); drain();
    for (let c = 1; c <= cycles; c += 1) {
      if (sampleMs > 0) for (let sub = 0; sub < cycleMs / sampleMs; sub += 1) { w.__bsim.advance(sampleMs); w.eval("__bot.tick()"); await sleep(0); }
      else { // po 10 s virtuálního času, ať prohlížeč stíhá vykreslovat a stránka nezamrzne
        for (let left = cycleMs; left > 0; left -= 10000) { w.__bsim.advance(Math.min(10000, left)); await sleep(0); }
      }
      w.eval("__bot.cycle()"); drain();
      if (onProgress) onProgress({ minute: Math.round((c * cycleMs) / 60000), of: minutes });
    }
    const result = compareLive(live, trace, { errors: [...(w.__bsimErrors || [])].slice(0, 3), randomCalls: { game: w.__bsim.clock.rngCalls, visual: w.__bsim.clock.visualCalls }, minutes });
    result.live = live;
    return result;
  }

  // Porovná živý záznam s trace (do času posledního živého snímku). Samostatná funkce, aby šla otestovat i na záměrně pozměněném trace.
  function compareLive(live, trace, extra = {}) {
    const lastT = live.frames[live.frames.length - 1].t;
    const expected = { events: trace.events.filter((e) => e.t <= lastT), ticks: trace.ticks.filter((t) => t[0] <= lastT), frames: trace.frames.filter((f) => f.t <= lastT) };
    const result = { seed: trace.seed, lastT, errors: [], ...extra };
    for (const k of ["frames", "events", "ticks"]) {
      const a = live[k], b = expected[k]; let same = 0; const n = Math.max(a.length, b.length);
      let diff = null; for (let i = 0; i < n; i += 1) { if (JSON.stringify(a[i]) === JSON.stringify(b[i])) same += 1; else if (!diff) { const d = firstDiff(a[i], b[i], ""); diff = `${k}[${i}]${d ? " " + d : ""}`; } }
      result[k] = { live: a.length, trace: b.length, identical: same, firstDiff: diff };
    }
    result.ok = ["frames", "events", "ticks"].every((k) => result[k].identical === Math.max(result[k].live, result[k].trace)) && result.frames.live > 0 && !result.errors.length;
    return result;
  }

  window.BalanceSimLive = { runLive, compareLive, firstDiff };
})();
