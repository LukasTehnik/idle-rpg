#!/usr/bin/env node
"use strict";
// Regresní test balance simulátoru. Spuštění: npm run balance:test
//
// 1. kopie dat: ve zdrojácích nástroje se nesmí objevit žádné id nepřátel / receptů z hry,
// 2. determinismus: stejný seed dá bit po bitu stejný průběh, jiný seed jiný,
// 3. shoda se skutečnou hrou: krátký kontrolní scénář běží ve skutečném Chromiu (plné vykreslování, Playwright fake clock)
//    a v simulátoru (jsdom, virtuální čas). Stav postavy se po každém kroku musí shodovat do posledního čísla,
// 4. samotest detektoru (mutace herního kódu v dočasné kopii repozitáře):
//      a) změna jen čísla v balancu na obou stranách → pořád shoda (simulátor čte data hry),
//      b) stejná změna jen na straně Chromia → rozdíl MUSÍ být odhalen (test umí selhat),
//      c) herní logika svázaná s vykreslením (v simulátoru vypnutém) na obou stranách → rozdíl MUSÍ být odhalen.
// Pokud (3) selže po vaší změně hry, simulátor už neodpovídá skutečné hře: oprav simulátor (viz README, sekce Když test selže).
//
// Prostředí: JSDOM_MODULE (cesta k jsdom), PLAYWRIGHT_MODULE (cesta k playwright / playwright-core), CHROME_PATH (spustitelný Chromium).
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { loadGame, REPO_ROOT } = require("../lib/harness");

const TOOL_DIR = path.join(__dirname, "..");
const BOT_SRC = fs.readFileSync(path.join(TOOL_DIR, "lib", "bot-page.js"), "utf8");
const SNAP = `JSON.stringify({k:state.kills,xp:state.xp,l:state.level,hp:Math.round(state.player.hp*100)/100,d:state.stats.deaths,g:state.stats.goldEarned,ph:state.phase,inv:state.inventory.length,food:state.food,carried:state.carriedGold,bank:state.bankGold})`;
const rngInit = (seed) => `(()=>{const mk=(s)=>{let a=s;return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}};const f=mk(${seed}),fb=mk(${seed}+7919);window.__rc=0;window.__rcVis=0;Math.random=()=>{const s=new Error().stack||'';if(/combat-field|spawnCombatBurst|animateHit|spawnSpark/.test(s)){window.__rcVis++;return fb()}window.__rc++;return f()};})();`;

const results = [];
const record = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " – " + detail : ""}`); };

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", "playwright-core", path.join(TOOL_DIR, "node_modules", "playwright"), path.join(TOOL_DIR, "node_modules", "playwright-core")].filter(Boolean);
  for (const c of candidates) { try { return require(c); } catch (_) { /* další */ } }
  throw new Error("Chybí Playwright. Nainstaluj ho mimo produkční hru (npm --prefix tools/balance-sim install) nebo nastav PLAYWRIGHT_MODULE na cestu k playwright.\nSkutečný Chromium je pro regresní test nutný: bez něj nelze ověřit shodu s hrou.");
}

function serve(root) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html"; const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }); fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

// Dočasná kopie herních souborů (jen kód a data v kořeni; obrázky logiku neovlivňují) s volitelnou textovou mutací.
function copyGame(mutations = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "balance-sim-"));
  for (const f of fs.readdirSync(REPO_ROOT)) if (/\.(js|html|css)$/.test(f)) fs.copyFileSync(path.join(REPO_ROOT, f), path.join(dir, f));
  for (const [file, from, to] of mutations) {
    const p = path.join(dir, file); const text = fs.readFileSync(p, "utf8");
    if (!text.includes(from)) throw new Error(`Mutace: v ${file} nenalezeno "${from}". Aktualizuj tests/regression.js podle změny hry.`);
    fs.writeFileSync(p, text.replace(from, to));
  }
  return dir;
}

async function compare({ pw, browser, liveRoot, simRoot, seed, minutes, bot }) {
  const server = await serve(liveRoot);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await context.newPage();
  const pageErrors = []; page.on("pageerror", (e) => pageErrors.push(e.message)); page.on("dialog", (d) => d.accept()); // sim: window.confirm = () => true
  await page.addInitScript(rngInit(seed)); await context.clock.install({ time: 0 }); await context.clock.pauseAt(1000);
  await page.goto(`${server.url}/index.html?nologin`); await page.waitForFunction("typeof state!=='undefined'&&typeof startLoops==='function'");
  const g = await loadGame({ root: simRoot, seed, stubUi: true });
  g.clock.now = 1000; for (const t of g.clock.timers) t.due = 1000 + t.ms; // stejná fáze časovačů: hodiny živé stránky stojí na 1000 ms
  const both = async (code) => { await page.evaluate(code); g.ev(code); };
  if (bot) await both(BOT_SRC);
  await both(bot ? "__bot.cycle()" : "(state.run.targetEnemyId ? toggleFight() : chooseTarget('goblin'))");
  const step = bot ? 600000 : 60000; const rows = []; let firstDiff = null;
  for (let t = 0; t < minutes * 60000; t += step) {
    await page.clock.runFor(step); g.advance(step);
    if (bot) await both("__bot.cycle()");
    const live = await page.evaluate(SNAP), sim = g.ev(SNAP); const same = live === sim;
    rows.push(same); if (!same && !firstDiff) firstDiff = { minute: (t + step) / 60000, live: JSON.parse(live), sim: JSON.parse(sim) };
  }
  const out = { steps: rows.length, identical: rows.filter(Boolean).length, firstDiff, pageErrors: pageErrors.slice(0, 3), simErrors: g.errors.slice(0, 3), last: JSON.parse(g.ev(SNAP)) };
  await context.close(); g.close(); server.close();
  return out;
}

async function simSnapshots(seed, cycles) {
  const g = await loadGame({ root: REPO_ROOT, seed, stubUi: true }); g.ev(BOT_SRC); g.ev("__bot.cycle()"); const out = [];
  for (let i = 0; i < cycles; i += 1) { g.advance(600000); g.ev("__bot.cycle()"); out.push(g.ev(SNAP)); }
  const calls = g.clock.rngCalls; g.close(); return { out, calls };
}

const describeDiff = (r) => r.firstDiff ? `první rozdíl po ${r.firstDiff.minute} min: živě ${JSON.stringify(r.firstDiff.live)} × simulace ${JSON.stringify(r.firstDiff.sim)}` : "";

async function main() {
  const full = process.argv.includes("--full"); const quick = process.argv.includes("--quick"); const started = Date.now();
  // 1) žádné kopie herních dat
  {
    const g = await loadGame({ root: REPO_ROOT, seed: 1, stubUi: true });
    const ids = JSON.parse(g.ev("JSON.stringify([...Object.keys(ENEMIES), ...FORGE_RECIPES.map((r) => r.id)])")); g.close();
    const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (f === "node_modules" || f === "tests") continue; if (fs.statSync(p).isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } }; walk(TOOL_DIR);
    const hits = []; for (const f of files) { const text = fs.readFileSync(f, "utf8"); for (const id of ids) if (id.length >= 6 && new RegExp(`["'\`]${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).test(text)) hits.push(`${path.relative(TOOL_DIR, f)}: ${id}`); }
    record("Simulátor nekopíruje herní data (id nepřátel a receptů ve zdrojácích)", !hits.length, hits.length ? hits.slice(0, 5).join("; ") : `${ids.length} id zkontrolováno ve ${files.length} souborech`);
  }
  // 2) determinismus
  {
    const a = await simSnapshots(7, 12), b = await simSnapshots(7, 12), c = await simSnapshots(8, 12);
    record("Stejný seed dává stejný průběh (12 zásahů bota, 2 h)", JSON.stringify(a) === JSON.stringify(b), `${a.calls} volání Math.random`);
    record("Jiný seed dává jiný průběh", JSON.stringify(a.out) !== JSON.stringify(c.out));
  }
  // 3) + 4) Chromium
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const temps = [];
  try {
    for (const c of [{ seed: 1, minutes: 20, bot: false, label: "ruční boj, 20 min" }, { seed: 1, minutes: 60, bot: true, label: "bot, 60 min" }, ...(full ? [{ seed: 2, minutes: 120, bot: true, label: "bot, seed 2, 120 min" }] : [])]) {
      const r = await compare({ browser, liveRoot: REPO_ROOT, simRoot: REPO_ROOT, ...c });
      record(`Shoda se skutečným Chromiem (${c.label}): ${r.identical}/${r.steps} kroků identických`, r.identical === r.steps && !r.pageErrors.length && !r.simErrors.length, describeDiff(r) || (r.pageErrors[0] ?? r.simErrors[0] ?? `kills ${r.last.k}, level ${r.last.l}, smrtí ${r.last.d}`));
    }
    if (!quick) {
      const balance = ["app.js", "playerAttackMs: 1600", "playerAttackMs: 1500"];
      const uiCoupled = ["app.js", "contentEffects.lastRegen=now;\n  if (state.phase === \"fighting\")", "contentEffects.lastRegen=now;\n  if (document.querySelectorAll('.log-entry').length > 2) state.xp += 1;\n  if (state.phase === \"fighting\")"];
      const mutated = copyGame([balance]); const coupled = copyGame([uiCoupled]); temps.push(mutated, coupled);
      const m1 = await compare({ browser, liveRoot: mutated, simRoot: mutated, seed: 1, minutes: 10, bot: false });
      record("Samotest a) změna čísla v balancu na obou stranách: pořád shoda", m1.identical === m1.steps, `${m1.identical}/${m1.steps}`);
      const m2 = await compare({ browser, liveRoot: mutated, simRoot: REPO_ROOT, seed: 1, minutes: 10, bot: false });
      record("Samotest b) rozdíl v herní logice je odhalen (změna jen u Chromia)", m2.identical < m2.steps, describeDiff(m2) || "rozdíl NEBYL odhalen");
      const m3 = await compare({ browser, liveRoot: coupled, simRoot: coupled, seed: 1, minutes: 10, bot: false });
      record("Samotest c) logika svázaná s vykreslením je odhalena", m3.identical < m3.steps, describeDiff(m3) || "rozdíl NEBYL odhalen");
    }
  } finally { await browser.close(); for (const t of temps) fs.rmSync(t, { recursive: true, force: true }); }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? "❌ SELHALO" : "✅ OK"}: ${results.length - failed.length}/${results.length} kontrol za ${Math.round((Date.now() - started) / 1000)} s`);
  if (failed.length) console.log("Simulátor se nemusí shodovat s hrou. Co dělat: tools/balance-sim/README.md, sekce „Když regresní test selže“.");
  return failed.length ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(3); });
