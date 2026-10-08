#!/usr/bin/env node
"use strict";
// Rychlý test hlídače pokrytí (bez prohlížeče, ~1 s). Spuštění: npm run balance:coverage
//  1. skutečná hra odpovídá manifestu (žádný nový ani neplatný systém),
//  2. hlídač umí selhat: do dočasné kopie hry se přidá nový klíč stavu / akce / skript / konfigurace → musí být nalezen,
//  3. validace manifestu: covered bez strategie bota, mrtvé odkazy, gap, orphan,
//  4. report: u neaktuálního pokrytí je výrazný banner a příznak stale.
const fs = require("fs");
const os = require("os");
const path = require("path");
const cov = require("../coverage");
const { renderMarkdown } = require("../report");

let failed = 0; const ok = (cond, msg) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failed++; };
const clone = (o) => JSON.parse(JSON.stringify(o));

// 1) skutečná hra
const real = cov.evaluate();
ok(real.ok && !real.stale, `Manifest odpovídá hře: ${cov.summaryLine(real)}`);
if (!real.ok || real.stale) for (const l of cov.describe(real)) console.log("   - " + l);
ok(real.orphans.length === 0, "Manifest neobsahuje záznamy bez protějšku ve hře" + (real.orphans.length ? `: ${real.orphans.join(", ")}` : ""));
ok(real.total >= 80, `Sken našel dost signálů (${real.total}) – ne prázdný`);

// 2) mutace dočasné kopie hry
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bsim-cov-"));
try {
  const scripts = cov.scriptFiles(fs.readFileSync(path.join(cov.REPO_ROOT, "index.html"), "utf8"));
  for (const f of ["index.html", ...scripts]) fs.copyFileSync(path.join(cov.REPO_ROOT, f), path.join(tmp, f));
  const edit = (file, fn) => { const p = path.join(tmp, file); fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8"))); };
  const expectNew = (title, id, mutate) => {
    for (const f of ["index.html", ...scripts]) fs.copyFileSync(path.join(cov.REPO_ROOT, f), path.join(tmp, f));
    mutate();
    const res = cov.evaluate({ scan: cov.scan(tmp) });
    ok(!res.ok && res.stale && res.unclassified.some((u) => u.id === id), `${title} → ${id} je označen jako nový, test selže`);
  };
  expectNew("Nový klíč stavu (např. prestiž)", "state:prestigePoints", () => edit("app.js", (s) => s.replace("coreFragments: 0,", "coreFragments: 0,\n  prestigePoints: 0,")));
  expectNew("Nová akce hráče", "fn:doEnchant", () => edit("app.js", (s) => s + "\nfunction doEnchant() { state.carriedGold -= 1; }\n"));
  expectNew("Nový klíč ekonomiky", "cfg:LOOT_CONFIG.bonusDropRate", () => edit("economy-data.js", (s) => s.replace("const LOOT_CONFIG = Object.freeze({", "const LOOT_CONFIG = Object.freeze({\n  bonusDropRate: 0.5,")));
  expectNew("Nový skript", "script:pets-data.js", () => { fs.writeFileSync(path.join(tmp, "pets-data.js"), "const PETS = [];\n"); edit("index.html", (s) => s.replace('<script src="combat-field.js"></script>', '<script src="combat-field.js"></script>\n    <script src="pets-data.js"></script>')); });
  // komentář se systémem nesmí způsobit falešný poplach
  for (const f of ["index.html", ...scripts]) fs.copyFileSync(path.join(cov.REPO_ROOT, f), path.join(tmp, f));
  edit("app.js", (s) => s.replace("coreFragments: 0,", "coreFragments: 0,\n  // petLevel: 0,"));
  ok(cov.evaluate({ scan: cov.scan(tmp) }).ok, "Zakomentovaný klíč nevyvolá falešný poplach");
  // přejmenování / smazání konfigurace se nesmí tiše přehlédnout
  edit("economy-data.js", (s) => s.replace("const FOOD_CONFIG", "const FOOD_CFG"));
  const renamed = cov.evaluate({ scan: cov.scan(tmp) });
  ok(!renamed.ok && renamed.problems.some((p) => /FOOD_CONFIG/.test(p)), "Přejmenovaná konfigurace (FOOD_CONFIG) je ohlášena, ne tiše přeskočena");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// 3) validace manifestu (syntetické)
const manifest = cov.loadManifest(); const scan = cov.scan();
const withEntry = (id, entry) => { const m = clone(manifest); if (entry === undefined) delete m.signals[id]; else m.signals[id] = entry; return cov.evaluate({ scan, manifest: m }); };
let r = withEntry("state:coreFragments", undefined);
ok(!r.ok && r.unclassified.some((u) => u.id === "state:coreFragments"), "Smazaný záznam v manifestu = neklasifikovaný systém = selhání");
r = withEntry("fn:doForge", { status: "covered", bot: ["neexistujiciFunkceBota"], metric: ["forged"] });
ok(!r.ok && r.invalid.some((i) => i.id === "fn:doForge" && /bot/.test(i.why)), "covered s odkazem, který bot nepoužívá, je neplatný");
r = withEntry("fn:doForge", { status: "covered", bot: ["doForge"], metric: ["neexistujiciMetrika"] });
ok(!r.ok && r.invalid.some((i) => /metrika/.test(i.why)), "covered s neexistující metrikou je neplatný");
r = withEntry("fn:doForge", { status: "covered", bot: ["doForge"] });
ok(!r.ok && r.invalid.some((i) => /metriky/.test(i.why)), "covered bez metriky je neplatný");
r = withEntry("fn:doForge", { status: "ignored" });
ok(!r.ok && r.invalid.some((i) => /reason/.test(i.why)), "ignored bez důvodu je neplatný");
r = withEntry("fn:doForge", { status: "gap", reason: "bot zatím nekove" });
ok(r.ok && r.stale && r.gaps.length === 1, "gap: test projde, ale pokrytí je NEAKTUÁLNÍ (report to ukáže)");
{ const m = clone(manifest); m.signals["state:zrusenyKlic"] = { status: "ignored", reason: "x" }; const o = cov.evaluate({ scan, manifest: m });
  ok(o.orphans.includes("state:zrusenyKlic"), "Záznam bez protějšku ve hře je hlášen jako orphan"); }

// 4) report
const staleRes = withEntry("state:coreFragments", undefined);
const md = renderMarkdown({ seeds: [1], gameFingerprint: "test", summary: { pass: 0, warn: 0, fail: 1 }, scenarios: [], stale: true, coverage: staleRes, meta: {} });
ok(/NEAKTUÁLNÍ/.test(md) && /state:coreFragments/.test(md), "Markdown report začíná bannerem NEAKTUÁLNÍ a jmenuje chybějící systém");
const okMd = renderMarkdown({ seeds: [1], gameFingerprint: "test", summary: { pass: 1, warn: 0, fail: 0 }, scenarios: [], stale: false, coverage: real, meta: {} });
ok(!/NEAKTUÁLNÍ/.test(okMd), "Při úplném pokrytí banner není");

console.log(failed ? `\n❌ Selhalo ${failed} kontrol.` : "\n✅ Hlídač pokrytí je v pořádku.");
process.exit(failed ? 1 : 0);
