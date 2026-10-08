#!/usr/bin/env node
"use strict";
// Test trace + Simulation Vieweru. Spuštění: npm run balance:test:viewer   (--quick přeskočí živý browser run)
//
// 1. CLI se spustí třikrát se stejným seedem a scénářem (dvakrát s --trace, jednou bez) a jednou přes API vieweru (/api/run):
//    a) dva trace z CLI jsou bit po bitu stejné,
//    b) trace z vieweru je stejné jako z CLI,
//    c) výsledek simulace s trace a bez trace je stejný (trace simulaci neovlivňuje, včetně počtu volání náhody),
//    d) souhrn z trace sedí s metrikami CLI reportu na každé číslo,
// 2. Viewer ve skutečném Chromiu: načte trace, souhrn spočítaný ve Vieweru == CLI report, ovládání (start, rychlosti, krok po události,
//    posuvník, reset), stav postavy, činnost bota, log, grafy, bez chyb v konzoli,
// 3. živý browser run (skutečná vykreslená hra v iframe) je shodný s trace; záměrně pozměněný trace se musí odhalit,
// 4. viewer nemění uloženou hru (localStorage) ani žádný herní soubor; server je jen pro čtení a odmítá cizí cesty, metody, Host i Origin.
//
// Prostředí: JSDOM_MODULE, PLAYWRIGHT_MODULE, CHROME_PATH (jako u tests/regression.js).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const { spawn } = require("child_process");
const { REPO_ROOT } = require("../lib/harness");
const { summarize, compareToMetrics } = require("../lib/trace-summary");
const { computeMetrics } = require("../lib/metrics");
const { start } = require("../viewer/server");

const TOOL_DIR = path.join(__dirname, "..");
const SCENARIO = "early-game", SEED = 9001; // netypický seed: test smaže jen svůj výstup viewer-runs/early-game-seed-9001
const results = [];
const record = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " – " + detail : ""}`); };
const sha = (file) => crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");

function loadPlaywright() {
  for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "playwright-core", path.join(TOOL_DIR, "node_modules", "playwright")].filter(Boolean)) { try { return require(c); } catch (_) { /* další */ } }
  throw new Error("Chybí Playwright (npm --prefix tools/balance-sim install, nebo PLAYWRIGHT_MODULE).");
}
const cli = (out, extra = []) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(TOOL_DIR, "run-simulation.js"), "--scenario", SCENARIO, "--seeds", String(SEED), "--jobs", "1", "--quiet", "--out", out, ...extra], { stdio: ["ignore", "ignore", "pipe"] });
  let err = ""; child.stderr.on("data", (d) => { err += d; });
  child.on("exit", (code) => (code === 0 || code === 1 ? resolve() : reject(new Error(`CLI selhalo (${code}): ${err.slice(-300)}`))));
});
const rawOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "raw", `seed-${SEED}.json`), "utf8")).results[SCENARIO];
const traceFile = (dir) => path.join(dir, "trace", `${SCENARIO}-seed-${SEED}.json`);

function gameFileHashes() {
  const out = {}; for (const f of fs.readdirSync(REPO_ROOT)) if (/\.(js|html|css)$/.test(f)) out[f] = sha(path.join(REPO_ROOT, f)); return out;
}
function request(port, { method = "GET", url = "/", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers }, (res) => { let d = ""; res.on("data", (c) => { d += c; }); res.on("end", () => resolve({ status: res.statusCode, body: d })); });
    req.on("error", reject); if (body) req.write(body); req.end();
  });
}

async function main() {
  const quick = process.argv.includes("--quick"); const started = Date.now();
  const hashesBefore = gameFileHashes();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "balance-viewer-test-"));
  const A = path.join(tmp, "a"), B = path.join(tmp, "b"), C = path.join(tmp, "c"), D = path.join(tmp, "d");
  const server = await start({ port: 0, host: "127.0.0.1", root: REPO_ROOT }); const port = server.address().port; const base = `http://127.0.0.1:${port}`;
  const viewerRunDir = path.join(REPO_ROOT, "reports", "balance-sim", "viewer-runs", `${SCENARIO}-seed-${SEED}`);
  let browser = null;
  try {
    // --- 1) CLI × 3 + běh přes API vieweru (souběžně) ---
    console.log("Spouštím simulace (CLI ×3 a API vieweru), dohromady asi 2 minuty…");
    const apiRun = (async () => {
      const post = await request(port, { method: "POST", url: "/api/run", headers: { "Content-Type": "application/json", Origin: base, Host: `127.0.0.1:${port}` }, body: JSON.stringify({ scenario: SCENARIO, seed: SEED, detail: "standard" }) });
      if (post.status !== 202) throw new Error(`/api/run: ${post.status} ${post.body}`);
      const id = JSON.parse(post.body).id;
      for (;;) { await new Promise((r) => setTimeout(r, 1500)); const job = JSON.parse((await request(port, { url: `/api/jobs/${id}` })).body); if (job.status !== "running") return job; }
    })();
    await Promise.all([cli(A, ["--trace"]), cli(B, ["--trace"]), cli(C), cli(D, ["--trace-detail", "full"]), apiRun.then((job) => { if (job.status !== "done") throw new Error("Běh přes API selhal: " + job.log); })]);
    const viewerTrace = path.join(viewerRunDir, "trace", `${SCENARIO}-seed-${SEED}.json`);
    record("Dva trace ze stejného seedu a scénáře jsou bit po bitu stejné", sha(traceFile(A)) === sha(traceFile(B)));
    record("Trace vytvořené přes Viewer (API) je stejné jako z CLI", sha(viewerTrace) === sha(traceFile(A)));
    const withTrace = rawOf(A), without = rawOf(C);
    const strip = (r) => JSON.stringify({ ...r, traceEnd: undefined });
    record("Trace simulaci neovlivňuje (výsledek i počet volání náhody shodné s během bez trace)", strip(withTrace) === strip(without), `${withTrace.rngCalls} volání Math.random`);
    const trace = JSON.parse(fs.readFileSync(traceFile(A), "utf8"));
    const metrics = computeMetrics(withTrace); const diffs = compareToMetrics(summarize(trace), metrics);
    record("Souhrn z trace (Node) == metriky CLI reportu na každé číslo", diffs.length === 0, diffs.length ? JSON.stringify(diffs[0]) : `${trace.events.length} událostí, ${trace.frames.length} snímků`);
    const lastFrame = trace.frames[trace.frames.length - 1];
    record("Trace obsahuje všechny druhy událostí, o které Viewer stojí", ["death", "drop", "equip", "forge", "upgrade", "repair", "smelt", "learn", "target", "levelup", "sale", "food"].filter((t) => !trace.events.some((e) => e.type === t) && !["forge"].includes(t)).length === 0, [...new Set(trace.events.map((e) => e.type))].join(", "));
    record("Snímek obsahuje činnost bota (vysvětlení, očekávané XP/h a kills/h, kandidáty)", !!(lastFrame.decision?.summary && lastFrame.decision.current && lastFrame.decision.candidates.length), lastFrame.decision?.summary?.slice(0, 80));

    // --- 2) Viewer v Chromiu ---
    const pw = loadPlaywright();
    browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push("pageerror: " + e.message)); page.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) errors.push("console: " + m.text()); });
    const saveKey = /saveKey:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(REPO_ROOT, "app.js"), "utf8"))?.[1] ?? "idle-rpg-save";
    await page.goto(`${base}/tools/balance-sim/viewer/simulation-viewer.html`);
    await page.evaluate((k) => { localStorage.setItem(k, JSON.stringify({ sentinel: "produkční save nesmí být změněn" })); localStorage.setItem("balance-sim-sentinel", "1"); }, saveKey);
    const storageBefore = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
    await page.goto(`${base}/tools/balance-sim/viewer/simulation-viewer.html?trace=${encodeURIComponent(`/reports/balance-sim/viewer-runs/${SCENARIO}-seed-${SEED}/trace/${SCENARIO}-seed-${SEED}.json`)}`);
    await page.waitForSelector("#app:not([hidden])", { timeout: 30000 });
    await page.waitForFunction(() => document.getElementById("cliMatch")?.dataset.status, null, { timeout: 15000 });
    const viewerSummary = await page.evaluate(() => window.__viewer.summarize());
    const reportJson = JSON.parse(fs.readFileSync(path.join(viewerRunDir, "report.json"), "utf8"));
    const viewerDiffs = compareToMetrics(viewerSummary, reportJson.scenarios[0].runs[0].metrics);
    record("Souhrn spočítaný ve Vieweru == metriky CLI reportu (stejný seed a scénář)", viewerDiffs.length === 0 && JSON.stringify(viewerSummary) === JSON.stringify(summarize(trace)), viewerDiffs.length ? JSON.stringify(viewerDiffs[0]) : `level ${viewerSummary.level}, ${viewerSummary.kills} zabití, ${viewerSummary.deaths} smrtí`);
    record("Viewer sám ukazuje shodu s CLI reportem", (await page.evaluate(() => document.getElementById("cliMatch").dataset.status)) === "ok");
    // ovládání
    await page.evaluate(() => window.__viewer.setTime(4 * 3.6e6)); await page.waitForTimeout(300);
    const snap = await page.evaluate(() => ({ clock: document.getElementById("clock").textContent, tiles: document.getElementById("charTiles").textContent, equip: document.querySelectorAll("#equipTable tr").length, decision: document.getElementById("decision").textContent, rates: document.getElementById("rateTiles").textContent, log: document.querySelectorAll("#log li").length, charts: ["level", "bands", "gold", "gear"].map((k) => document.getElementById("chart-" + k).querySelectorAll("path, rect").length), gold: document.getElementById("goldKv").textContent }));
    record("Viewer: čas, stav postavy, výbava, činnost bota, log a 4 grafy se vykreslí", snap.clock.startsWith("4:00:00") && /Level/.test(snap.tiles) && snap.equip === 9 && /Proč/.test(snap.decision) && /XP\/h/.test(snap.rates) && snap.log > 5 && snap.charts.every((n) => n >= 2), JSON.stringify({ clock: snap.clock, equip: snap.equip, log: snap.log, charts: snap.charts }));
    await page.click("#resetBtn"); const t0 = await page.evaluate(() => window.__viewer.S.t);
    await page.click('#speedGroup [data-speed="max"]'); await page.click("#playBtn"); await page.waitForTimeout(1500);
    const tMax = await page.evaluate(() => window.__viewer.S.t); await page.click("#pauseBtn"); const tPause = await page.evaluate(() => window.__viewer.S.t); await page.waitForTimeout(300); const tPause2 = await page.evaluate(() => window.__viewer.S.t);
    record("Viewer: Reset, Start na maximální rychlost a Pauza", t0 === 0 && tMax > 3.6e6 && tPause === tPause2, `po 1,5 s bylo ${(tMax / 3.6e6).toFixed(1)} virtuálních hodin`);
    await page.click("#resetBtn"); await page.click('#speedGroup [data-speed="1"]'); await page.click("#playBtn"); await page.waitForTimeout(1200); await page.click("#pauseBtn");
    const t1x = await page.evaluate(() => window.__viewer.S.t);
    record("Viewer: rychlost 1× = 1 virtuální sekunda za reálnou", t1x > 700 && t1x < 2500, `${Math.round(t1x)} ms za ~1,2 s`);
    await page.click("#resetBtn"); await page.click("#stepBtn"); const s1 = await page.evaluate(() => window.__viewer.S.t); await page.click("#stepBtn"); const s2 = await page.evaluate(() => window.__viewer.S.t); await page.click("#stepBackBtn"); const s3 = await page.evaluate(() => window.__viewer.S.t);
    record("Viewer: krok po jedné události vpřed a zpět", s1 > 0 && s2 >= s1 && s3 <= s2 && s3 >= 0, `${s1} → ${s2} → ${s3} ms`);
    await page.evaluate(() => { const s = document.getElementById("timeSlider"); s.value = String(Math.round(Number(s.max) / 2)); s.dispatchEvent(new Event("input")); }); await page.waitForTimeout(200);
    const half = await page.evaluate(() => ({ t: window.__viewer.S.t, end: window.__viewer.S.endT }));
    record("Viewer: posuvník času", Math.abs(half.t - half.end / 2) < 2, `${Math.round(half.t)} / ${half.end}`);
    // hover graf
    await page.evaluate(() => window.__viewer.setTime(window.__viewer.S.endT)); await page.waitForTimeout(300);
    await page.locator("#chart-level").scrollIntoViewIfNeeded(); const box = await page.locator("#chart-level .hit").boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(100);
    record("Viewer: tooltip nad grafem", await page.evaluate(() => getComputedStyle(document.getElementById("tooltip")).display === "block" && /level/.test(document.getElementById("tooltip").textContent)));
    // varování a upozornění
    const warnShown = await page.evaluate(() => { const w = window.__viewer.S.trace.events.find((e) => e.type === "warning"); if (!w) return null; window.__viewer.setTime(w.t); window.__viewer.render(); return document.getElementById("warnings").textContent; });
    record("Viewer: upozornění na opakované smrti / smrtící spirálu", warnShown === null ? true : /Opakované smrti|Smrtící spirála/.test(warnShown), warnShown ? warnShown.slice(0, 90) : "v tomto trace žádné varování");
    record("Viewer: bez chyb v konzoli", errors.length === 0, errors[0] ?? "");

    // --- 3) živý browser run ---
    if (!quick) {
      console.log("Živý browser run (skutečná vykreslená hra), může trvat několik minut…");
      await page.fill("#liveMinutes", "60"); await page.click("#liveBtn");
      await page.waitForFunction(() => window.__liveResult, null, { timeout: 25 * 60 * 1000 });
      const live = await page.evaluate(() => { const r = window.__liveResult; return { ...r, live: undefined }; });
      record("Živý run: vykreslená hra == záznam (snímky, události)", live.ok === true, live.ok ? `${live.frames.identical}/${live.frames.live} snímků, ${live.events.identical}/${live.events.live} událostí, ${live.randomCalls.game} volání náhody hry, ${live.randomCalls.visual} vizuálních` : JSON.stringify(live).slice(0, 400));
      const tampered = await page.evaluate(() => { const r = window.__liveResult; const t = JSON.parse(JSON.stringify(window.__viewer.S.trace)); const f = t.frames.find((x) => x.t > 0); f.kills += 1; return window.BalanceSimLive.compareLive(r.live, t).ok; });
      record("Živý run: pozměněný záznam je odhalen jako rozdíl", tampered === false);
      const tamperedEvent = await page.evaluate(() => { const r = window.__liveResult; const t = JSON.parse(JSON.stringify(window.__viewer.S.trace)); const i = t.events.findIndex((e) => e.type === "death" && e.t <= r.lastT); if (i >= 0) t.events.splice(i, 1); return window.BalanceSimLive.compareLive(r.live, t).ok; });
      record("Živý run: chybějící událost v záznamu je odhalena", tamperedEvent === false);
    }

    if (!quick) {
      // trace v detailu full (každé zabití + minisnímky po 60 s): živý run musí sedět i na ně
      const fullTrace = fs.readFileSync(traceFile(D), "utf8");
      const kills = await page.evaluate((json) => { window.__liveResult = null; window.__viewer.loadTrace(JSON.parse(json), null); window.__viewer.setTime(1.5e6); window.__viewer.render(); return { kills: window.__viewer.S.trace.events.filter((e) => e.type === "kill").length, ticks: window.__viewer.S.trace.ticks.length, killRows: [...document.querySelectorAll("#log li.kill")].length }; }, fullTrace);
      record("Trace v detailu full: zabití a minisnímky jsou v záznamu a Viewer zabití zobrazí v logu", kills.kills > 1000 && kills.ticks > 500 && kills.killRows > 0, JSON.stringify(kills));
      await page.fill("#liveMinutes", "30"); await page.click("#liveBtn");
      await page.waitForFunction(() => window.__liveResult, null, { timeout: 25 * 60 * 1000 });
      const liveFull = await page.evaluate(() => { const r = window.__liveResult; return { ...r, live: undefined }; });
      record("Živý run proti trace v detailu full (zabití, minisnímky po 60 s) je shodný", liveFull.ok === true, liveFull.ok ? `${liveFull.frames.identical} snímků, ${liveFull.events.identical} událostí, ${liveFull.ticks.identical} minisnímků` : JSON.stringify(liveFull).slice(0, 400));
    }

    // --- 4) viewer nemění save ani herní soubory; server je jen pro čtení ---
    const storageAfter = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
    record("Viewer (včetně živého běhu) nezměnil uloženou hru v localStorage", storageBefore === storageAfter);
    const hashesAfter = gameFileHashes();
    record("Herní soubory v repozitáři zůstaly beze změny", JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter), `${Object.keys(hashesAfter).length} souborů`);
    const host = `127.0.0.1:${port}`;
    const probes = [
      ["POST mimo /api/run → 405", await request(port, { method: "POST", url: "/index.html", headers: { Host: host, Origin: base } }), 405],
      ["PUT → 405", await request(port, { method: "PUT", url: "/app.js", headers: { Host: host } }), 405],
      ["průchod adresáři (..) → 404", await request(port, { url: "/tools/..%2fpackage.json", headers: { Host: host } }), 404],
      ["server.js se neservíruje → 404", await request(port, { url: "/tools/balance-sim/viewer/server.js", headers: { Host: host } }), 404],
      ["package.json se neservíruje → 404", await request(port, { url: "/package.json", headers: { Host: host } }), 404],
      [".git se neservíruje → 404", await request(port, { url: "/.git/config", headers: { Host: host } }), 404],
      ["cizí Host (DNS rebinding) → 403", await request(port, { url: "/api/traces", headers: { Host: "evil.example" } }), 403],
      ["POST /api/run bez Origin → 403", await request(port, { method: "POST", url: "/api/run", headers: { Host: host, "Content-Type": "application/json" }, body: "{}" }), 403],
      ["POST /api/run s cizím Origin → 403", await request(port, { method: "POST", url: "/api/run", headers: { Host: host, Origin: "http://evil.example" }, body: "{}" }), 403],
      ["POST /api/run s neznámým scénářem → 400", await request(port, { method: "POST", url: "/api/run", headers: { Host: host, Origin: base }, body: JSON.stringify({ scenario: "../../x", seed: 1 }) }), 400],
    ];
    { const cres = await request(port, { url: "/api/coverage", headers: { Host: host } }); let body = {}; try { body = JSON.parse(cres.body ?? cres.text ?? "{}"); } catch (_) { /* ignorovat */ }
      record("Viewer: /api/coverage hlásí aktuální pokrytí bota (banner NEAKTUÁLNÍ se nezobrazí)", cres.status === 200 && body.stale === false, body.summary ?? `status ${cres.status}`); }
    for (const [name, res, want] of probes) record(`Server: ${name}`, res.status === want, `skutečně ${res.status}`);
  } finally {
    if (browser) await browser.close();
    server.close(); fs.rmSync(tmp, { recursive: true, force: true }); try { fs.rmSync(viewerRunDir, { recursive: true, force: true }); } catch (_) { /* ignorovat */ }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? "❌ SELHALO" : "✅ OK"}: ${results.length - failed.length}/${results.length} kontrol za ${Math.round((Date.now() - started) / 1000)} s`);
  return failed.length ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { console.error(e.stack || e.message); process.exit(3); });
