"use strict";
// Hlídač pokrytí: simulátor nesmí potichu ignorovat nový systém, který ovlivňuje progres.
//
// Jak to funguje
//   1. scan(): statický sken zdrojáků hry vyrobí seznam „signálů“ = věcí, které mohou měnit progres:
//        script:<soubor>        každý skript načtený z index.html
//        state:<klíč>           klíče uložitelného stavu postavy (initialState v app.js)
//        cfg:<OBJEKT>.<klíč>    klíče ekonomických / balančních konfigurací (LOOT_CONFIG, PROGRESSION_ECONOMY, …)
//        fn:<název>             funkce, které hráč používá k akci (doForge, buyFood, bankTransfer, …)
//   2. coverage-manifest.json u každého signálu říká, jak s ním simulátor nakládá:
//        covered   bot systém používá (`bot`: názvy v lib/bot-page.js) A měří (`metric`: cesty v lib/metrics.js)
//        measured  nic z něj nelze udělat (zatím bez využití), ale simulátor ho měří (`metric`)
//        ignored   nemá vliv na progres (povinný `reason`)
//        gap       VĚDOMĚ nepokryto: bot ho nepoužívá / neměří (povinný `reason`) → scénáře jsou NEAKTUÁLNÍ
//   3. evaluate() porovná sken s manifestem. Výsledek:
//        unclassified  nový signál bez záznamu v manifestu          → test SELŽE, report je NEAKTUÁLNÍ
//        invalid       záznam nesedí (covered bez odkazu v botovi, metrika chybí, odkaz je mrtvý, …) → totéž
//        gap           otevřený dluh                                → report je NEAKTUÁLNÍ (test projde, ale nahlásí to)
//        orphan        záznam v manifestu už ve hře není            → upozornění k úklidu
//   Report (report.md / report.json) a CLI použijí `evaluate()`; dokud není `stale === false`, každý scénář má
//   kontrolu „bot-coverage“ ve stavu fail a `npm run balance:sim` skončí s kódem 1.
//
// Co to NEUMÍ (viz README): nepozná změnu pravidel uvnitř existující funkce ani nové chování schované pod známým klíčem.
// Hlídá objevení nového systému (nový skript, klíč stavu, konfigurace nebo akce), ne správnost bota.
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_PATH = path.join(__dirname, "coverage-manifest.json");
const BOT_PATH = path.join(__dirname, "lib", "bot-page.js");
const METRICS_PATH = path.join(__dirname, "lib", "metrics.js");

// Konfigurace, jejichž nové klíče znamenají nové pravidlo ekonomiky / dropu.
const CONFIG_OBJECTS = ["LOOT_CONFIG", "PROGRESSION_ECONOMY", "FOOD_CONFIG", "WAVE_BALANCE", "COMBAT_BALANCE"];
// Funkce, které hráč volá jako akci s důsledkem pro progres.
const ACTION_FN = /^(do[A-Z]|buy[A-Z]|learn[A-Z]|claim[A-Z]|equip[A-Z]|unequip[A-Z]|enter[A-Z]|bank[A-Z]|autoSell|trade[A-Z]|unlock[A-Z]|craft[A-Z]|enchant[A-Z]|salvage|dismantle|prestige|ascend|rebirth|reroll|socket|allocate|train[A-Z]|redeem|exchange[A-Z]|convert[A-Z]|transmute|refine[A-Z]|quest[A-Z]|collect[A-Z]|deposit|withdraw|revive[A-Z]|eat[A-Z]|drink[A-Z])/;
// Pomocné funkce téhož jména, které nic nemění (výpočty, kreslení).
const ACTION_FN_EXCLUDE = /(Cost|Chance|Yield|Preview|Html|Card|Filter|Dialog|Message|Visuals|Overview|Detail)$|^render|^apply(Test|Affix|Character|Combat)|^enterWave/;

function read(file, root = REPO_ROOT) { return fs.readFileSync(path.join(root, file), "utf8"); }
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function scriptFiles(indexHtml) {
  // app.js se načítá přes cloud-sync.js (atribut data-app), proto se bere i ten.
  const list = [...indexHtml.matchAll(/<script[^>]*\ssrc="([^"?#]+)"[^>]*>/g)].flatMap((m) => [m[1], ...(/data-app="([^"]+)"/.exec(m[0]) ? [/data-app="([^"]+)"/.exec(m[0])[1]] : [])]);
  return [...new Set(list)].filter((f) => !/^https?:/.test(f));
}

// Vrátí těla `{ ... }` začínající na pozici `open` (index znaku '{'); ignoruje řetězce a komentáře.
function balanced(src, open) {
  let depth = 0, quote = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{" ) depth++;
    else if (c === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}
// Klíče nejvyšší úrovně objektového literálu: `key:`, `"key":`, `key,` (zkratka), `...spread` se ignoruje.
function topLevelKeys(body) {
  const keys = []; let depth = 0, quote = null, start = 0;
  const flush = (end) => {
    const part = body.slice(start, end).trim();
    const m = /^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*(?::|,|$|\()/.exec(part);
    if (m) keys.push(m[1] ?? m[2] ?? m[3]);
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === "," && depth === 0) { flush(i); start = i + 1; }
  }
  flush(body.length);
  return keys;
}
function objectLiteralKeys(src, declRegex) {
  const m = declRegex.exec(src); if (!m) return null;
  const open = src.indexOf("{", m.index + m[0].length - 1); if (open < 0) return null;
  const body = balanced(src, open); return body === null ? null : topLevelKeys(body);
}

function scan(root = REPO_ROOT) {
  const signals = {}; const problems = [];
  const add = (id, info) => { signals[id] = info; };
  const index = read("index.html", root); const files = scriptFiles(index);
  for (const f of files) add(`script:${f}`, { kind: "script", where: "index.html" });
  const sources = {}; for (const f of files) { if (fs.existsSync(path.join(root, f))) sources[f] = stripComments(read(f, root)); else problems.push(`index.html odkazuje na neexistující skript ${f}`); }
  const app = sources["app.js"] ?? "";
  const stateKeys = objectLiteralKeys(app, /const initialState = \(\) => \(\{/);
  if (!stateKeys || stateKeys.length < 10) problems.push("Nepodařilo se načíst klíče initialState z app.js (změnil se zápis?). Uprav coverage.js.");
  else for (const k of stateKeys) add(`state:${k}`, { kind: "state", where: "app.js initialState" });
  for (const name of CONFIG_OBJECTS) {
    let found = false;
    for (const [f, src] of Object.entries(sources)) {
      const keys = objectLiteralKeys(src, new RegExp(`const ${name} = (?:Object\\.freeze\\()?\\{`));
      if (keys) { found = true; for (const k of keys) add(`cfg:${name}.${k}`, { kind: "cfg", where: f }); break; }
    }
    if (!found) problems.push(`Konfigurace ${name} nenalezena (přejmenována nebo smazána?). Uprav CONFIG_OBJECTS v coverage.js.`);
  }
  for (const [f, src] of Object.entries(sources)) {
    for (const m of src.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)/gm)) {
      if (ACTION_FN.test(m[1]) && !ACTION_FN_EXCLUDE.test(m[1])) add(`fn:${m[1]}`, { kind: "fn", where: f });
    }
  }
  return { signals, problems, files };
}

const loadManifest = () => JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

// Hledá `needle` jako celé slovo / cestu. `metric` je cesta typu "materials.coreFragments" – stačí, aby v metrics.js
// (nebo v bot-page.js, kde se metrika sbírá) existoval poslední člen cesty jako identifikátor.
const hasIdent = (src, ident) => new RegExp(`(^|[^\\w$])${ident.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w$]|$)`).test(src);

function evaluate(opts = {}) {
  const sc = opts.scan ?? scan(); const manifest = opts.manifest ?? loadManifest();
  const botSrc = opts.botSrc ?? fs.readFileSync(BOT_PATH, "utf8"); const metricsSrc = opts.metricsSrc ?? fs.readFileSync(METRICS_PATH, "utf8");
  const entries = manifest.signals ?? {}; const out = { unclassified: [], invalid: [], gaps: [], orphans: [], covered: 0, measured: 0, ignored: 0, problems: [...sc.problems] };
  for (const [id, info] of Object.entries(sc.signals)) {
    const e = entries[id];
    if (!e) { out.unclassified.push({ id, kind: info.kind, where: info.where }); continue; }
    const bad = (why) => out.invalid.push({ id, why });
    if (!["covered", "measured", "ignored", "gap"].includes(e.status)) { bad(`neznámý status „${e.status}“`); continue; }
    if (e.status === "ignored") { if (!e.reason) bad("ignored bez důvodu (reason)"); else out.ignored++; continue; }
    if (e.status === "gap") { if (!e.reason) bad("gap bez popisu, co chybí (reason)"); else out.gaps.push({ id, reason: e.reason }); continue; }
    const metrics = e.metric ?? []; const bots = e.bot ?? [];
    if (!metrics.length) { bad(`${e.status} bez metriky (metric)`); continue; }
    const missingMetric = metrics.filter((m) => !hasIdent(metricsSrc, m.split(".").pop()) && !hasIdent(botSrc, m.split(".").pop()));
    if (missingMetric.length) { bad(`metrika neexistuje v lib/metrics.js ani v botovi: ${missingMetric.join(", ")}`); continue; }
    if (e.status === "covered") {
      if (!bots.length) { bad("covered bez odkazu na strategii bota (bot)"); continue; }
      const missingBot = bots.filter((b) => !hasIdent(botSrc, b));
      if (missingBot.length) { bad(`bot v lib/bot-page.js tyto názvy nepoužívá: ${missingBot.join(", ")}`); continue; }
      out.covered++;
    } else { if (!e.reason) { bad("measured bez důvodu, proč bot nic nedělá (reason)"); continue; } out.measured++; }
  }
  for (const id of Object.keys(entries)) if (!sc.signals[id]) out.orphans.push(id);
  out.total = Object.keys(sc.signals).length;
  out.stale = out.unclassified.length + out.invalid.length + out.gaps.length + out.problems.length > 0;
  out.ok = out.unclassified.length + out.invalid.length + out.problems.length === 0; // gap nechává test zelený, report ne
  return out;
}

function describe(res) {
  const lines = [];
  for (const p of res.problems) lines.push(`Sken: ${p}`);
  for (const u of res.unclassified) lines.push(`NOVÝ systém bez záznamu: ${u.id} (${u.where}) – doplň strategii bota + metriku a zapiš do coverage-manifest.json`);
  for (const i of res.invalid) lines.push(`Neplatný záznam ${i.id}: ${i.why}`);
  for (const g of res.gaps) lines.push(`Nepokryto (gap): ${g.id} – ${g.reason}`);
  for (const o of res.orphans) lines.push(`Záznam už nemá protějšek ve hře: ${o} (smaž z manifestu)`);
  return lines;
}
function summaryLine(res) {
  return res.stale ? `NEAKTUÁLNÍ – ${res.unclassified.length} nových bez záznamu, ${res.invalid.length} neplatných, ${res.gaps.length} nepokrytých (z ${res.total} signálů)` : `aktuální – ${res.total} signálů: ${res.covered} pokryto, ${res.measured} jen měřeno, ${res.ignored} bez vlivu`;
}

module.exports = { scan, evaluate, describe, summaryLine, loadManifest, MANIFEST_PATH, REPO_ROOT, CONFIG_OBJECTS, scriptFiles, topLevelKeys, objectLiteralKeys };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--init")) { // vypíše kostru manifestu pro nové signály (vše jako chybějící; status si doplň ručně)
    const sc = scan(); const cur = fs.existsSync(MANIFEST_PATH) ? loadManifest() : { signals: {} };
    const missing = Object.keys(sc.signals).filter((id) => !cur.signals[id]);
    console.log(JSON.stringify(Object.fromEntries(missing.map((id) => [id, { status: "TODO" }])), null, 1)); process.exit(0);
  }
  const res = evaluate();
  if (args.includes("--json")) console.log(JSON.stringify(res, null, 1));
  else { console.log(`Pokrytí bota: ${summaryLine(res)}`); for (const l of describe(res)) console.log(" - " + l); }
  process.exit(res.ok ? 0 : 1);
}
