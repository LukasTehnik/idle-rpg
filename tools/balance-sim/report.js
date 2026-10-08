#!/usr/bin/env node
"use strict";
// Z hrubých výsledků běhů (reports/balance-sim/latest/raw/seed-N.json) vyrobí strojově čitelný report.json
// a krátký čitelný report.md. Umí také porovnat dva reporty (před/po změně balancu): --compare baseline.json
const fs = require("fs");
const path = require("path");
const { computeMetrics, LEVEL_MILESTONES } = require("./lib/metrics");
const { SCENARIOS, getScenario } = require("./scenarios");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_DIR = path.join(REPO_ROOT, "reports", "balance-sim", "latest");
const RANK = { pass: 0, warn: 1, fail: 2 };
const ICON = { pass: "✅", warn: "⚠️", fail: "❌" };

function stat(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  const round = (x) => Math.round(x * 100) / 100;
  return { median: round(mid), min: round(v[0]), max: round(v[v.length - 1]), n: v.length, of: values.length };
}
const isStat = (x) => x && typeof x === "object" && "median" in x && "min" in x && "of" in x;
const pickAll = (list, fn) => list.map((item) => { try { const v = fn(item); return v === undefined ? null : v; } catch (_) { return null; } });
const keysOf = (list, fn) => [...new Set(list.flatMap((item) => Object.keys(fn(item) ?? {})))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

function aggregate(ms) {
  const a = {};
  a.hours = stat(pickAll(ms, (m) => m.hours)); a.level = stat(pickAll(ms, (m) => m.level));
  a.kills = stat(pickAll(ms, (m) => m.kills)); a.deaths = stat(pickAll(ms, (m) => m.deaths));
  a.killsPerHour = stat(pickAll(ms, (m) => m.killsPerHour)); a.deathsPerHour = stat(pickAll(ms, (m) => m.deathsPerHour));
  a.timeToLevel = {}; for (const level of LEVEL_MILESTONES) a.timeToLevel[level] = stat(pickAll(ms, (m) => m.timeToLevel[level]));
  a.bands = {};
  for (const band of ms.flatMap((m) => m.bands).map((b) => `${b.from}-${b.to}`).filter((v, i, arr) => arr.indexOf(v) === i)) {
    const rows = ms.map((m) => m.bands.find((b) => `${b.from}-${b.to}` === band && !b.partial) ?? null);
    a.bands[band] = { hours: stat(pickAll(rows, (b) => b.hours)), killsPerHour: stat(pickAll(rows, (b) => b.killsPerHour)), deathsPerHour: stat(pickAll(rows, (b) => b.deathsPerHour)) };
  }
  a.gold = { earned: stat(pickAll(ms, (m) => m.gold.earned)), fromSales: stat(pickAll(ms, (m) => m.gold.fromSales)), spentTotal: stat(pickAll(ms, (m) => m.gold.spentTotal)),
    forge: stat(pickAll(ms, (m) => m.gold.spent.forge)), upgrade: stat(pickAll(ms, (m) => m.gold.spent.upgrade)), repair: stat(pickAll(ms, (m) => m.gold.spent.repair)), food: stat(pickAll(ms, (m) => m.gold.spent.food)),
    lostToDeath: stat(pickAll(ms, (m) => m.gold.lostToDeath)), balance: stat(pickAll(ms, (m) => m.gold.balance)) };
  a.materials = { found: stat(pickAll(ms, (m) => m.materials.found)), smeltRecovered: stat(pickAll(ms, (m) => m.materials.smeltRecovered)), byTier: {} };
  for (const t of keysOf(ms, (m) => m.materials.byTier)) a.materials.byTier[t] = stat(pickAll(ms, (m) => m.materials.byTier[t] ?? 0));
  a.crafting = {}; for (const k of ["forged", "forgeFailed", "upgrades", "upgradeFailures", "repairs", "smelts", "itemsSold", "scrollsLearned"]) a.crafting[k] = stat(pickAll(ms, (m) => m.crafting[k]));
  a.crafting.forgedByTier = {}; for (const t of keysOf(ms, (m) => m.crafting.forgedByTier)) a.crafting.forgedByTier[t] = stat(pickAll(ms, (m) => m.crafting.forgedByTier[t] ?? 0));
  a.drops = { total: stat(pickAll(ms, (m) => m.drops.total)), withAffix: stat(pickAll(ms, (m) => m.drops.withAffix)), byQuality: {}, affixesByTier: {}, first: {} };
  for (const q of keysOf(ms, (m) => m.drops.byQuality)) a.drops.byQuality[q] = stat(pickAll(ms, (m) => m.drops.byQuality[q] ?? 0));
  for (const t of keysOf(ms, (m) => m.drops.affixesByTier)) a.drops.affixesByTier[t] = stat(pickAll(ms, (m) => m.drops.affixesByTier[t] ?? 0));
  for (const q of ["rare", "epic", "legendary"]) a.drops.first[q] = { tHours: stat(pickAll(ms, (m) => m.drops.first[q]?.tHours)), level: stat(pickAll(ms, (m) => m.drops.first[q]?.level)) };
  a.drops.byQualityAffix = {};
  for (const q of keysOf(ms, (m) => m.drops.byQualityAffix)) a.drops.byQualityAffix[q] = { total: stat(pickAll(ms, (m) => m.drops.byQualityAffix[q]?.total ?? 0)), affixed: stat(pickAll(ms, (m) => m.drops.byQualityAffix[q]?.affixed ?? 0)), prefix: stat(pickAll(ms, (m) => m.drops.byQualityAffix[q]?.prefix ?? 0)), suffix: stat(pickAll(ms, (m) => m.drops.byQualityAffix[q]?.suffix ?? 0)) };
  a.materials.byKind = {}; for (const k of keysOf(ms, (m) => m.materials.byKind)) a.materials.byKind[k] = stat(pickAll(ms, (m) => m.materials.byKind[k] ?? 0));
  a.timeline = {};
  for (const hour of [...new Set(ms.flatMap((m) => (m.timeline ?? []).map((r) => r.hour)))].sort((x, y) => x - y)) {
    const rows = ms.map((m) => (m.timeline ?? []).find((r) => r.hour === hour) ?? null);
    a.timeline[hour] = {}; for (const f of ["level", "kills", "deaths", "goldEarned", "goldFromSales", "drops", "rare", "epic", "legendary", "withAffix", "materials"]) a.timeline[hour][f] = stat(pickAll(rows, (r) => r[f]));
  }
  a.gearTier = {}; for (let t = 1; t <= 10; t += 1) a.gearTier[t] = { atLeast4: stat(pickAll(ms, (m) => m.gearTier[t].atLeast4?.tHours)), lagHours: stat(pickAll(ms, (m) => m.gearTier[t].lagHours)) };
  a.targets = { changeCount: stat(pickAll(ms, (m) => m.targets.changeCount)), reasons: {} };
  for (const r of keysOf(ms, (m) => m.targets.reasons)) a.targets.reasons[r] = stat(pickAll(ms, (m) => m.targets.reasons[r] ?? 0));
  a.boss = { spirals: stat(pickAll(ms, (m) => m.boss.spirals.length)) };
  return a;
}

const coverageMod = require("./coverage");
const coverageSummary = (c) => coverageMod.summaryLine(c);
function coverageCheck() { try { return coverageMod.evaluate(); } catch (e) { return { stale: true, ok: false, unclassified: [], invalid: [{ id: "coverage", why: e.message }], gaps: [], orphans: [], problems: [], total: 0, covered: 0, measured: 0, ignored: 0 }; } }

function buildReport(runs, meta = {}) {
  const sortedRuns = [...runs].sort((a, b) => a.seed - b.seed); const scenarios = [];
  const coverage = coverageCheck(); // hlídač: nový systém hry bez strategie bota a metrik = scénáře jsou neaktuální
  for (const sc of SCENARIOS) {
    const rows = sortedRuns.filter((r) => r.results?.[sc.id]).map((r) => {
      const metrics = computeMetrics(r.results[sc.id], sc.spiral); return { seed: r.seed, metrics, checks: sc.evaluate(metrics) };
    });
    if (!rows.length) continue;
    const checks = []; const ids = rows[0].checks.map((c) => c.id);
    for (const id of ids) {
      const per = rows.map((r) => ({ seed: r.seed, ...r.checks.find((c) => c.id === id) }));
      const worst = per.reduce((w, c) => (RANK[c.status] > RANK[w.status] ? c : w), per[0]);
      const bad = per.filter((c) => c.status !== "pass").map((c) => c.seed);
      checks.push({ id, label: worst.label, status: worst.status, detail: worst.detail + (bad.length && bad.length < per.length ? ` [seedy: ${bad.join(", ")}]` : ""), seeds: per.map((c) => ({ seed: c.seed, status: c.status, detail: c.detail })) });
    }
    checks.push({ id: "bot-coverage", label: "Bot pokrývá všechny systémy hry", status: coverage.stale ? "fail" : "pass", detail: coverage.stale ? coverageSummary(coverage)+" – viz banner na začátku reportu" : coverageSummary(coverage), seeds: [] });
    scenarios.push({ id: sc.id, title: sc.title, description: sc.description, seeds: rows.map((r) => r.seed), checks, aggregate: aggregate(rows.map((r) => r.metrics)), runs: rows.map((r) => ({ seed: r.seed, checks: r.checks.map(({ id, status, detail }) => ({ id, status, detail })), metrics: r.metrics })) });
  }
  const all = scenarios.flatMap((s) => s.checks);
  const summary = { pass: all.filter((c) => c.status === "pass").length, warn: all.filter((c) => c.status === "warn").length, fail: all.filter((c) => c.status === "fail").length };
  const fingerprints = [...new Set(sortedRuns.map((r) => r.gameFingerprint?.sha1))];
  return { schema: 1, tool: "balance-sim", stale: coverage.stale, coverage, gameFingerprint: fingerprints.length === 1 ? fingerprints[0] : fingerprints, seeds: sortedRuns.map((r) => r.seed), summary, scenarios, meta: { wallSeconds: sortedRuns.map((r) => r.wallSeconds), ...meta } };
}

// ---------- Markdown ----------
function fmt(s, digits = 1) {
  if (!isStat(s)) return "–";
  const f = (x) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString("cs-CZ").replace(/\s/g, " ") : String(Math.round(x * 10 ** digits) / 10 ** digits));
  const miss = s.n < s.of ? ` (${s.n}/${s.of})` : "";
  return s.min === s.max ? f(s.median) + miss : `${f(s.median)} (${f(s.min)}–${f(s.max)})${miss}`;
}
const table = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

function renderMarkdown(report) {
  const out = []; const seeds = report.seeds.join(", ");
  const cov = report.coverage; const banner = [];
  if (report.stale) banner.push("> ⛔ **NEAKTUÁLNÍ – výsledky nelze brát jako měřítko balancu.** Hra obsahuje systémy, které bot nepoužívá nebo simulátor neměří:", ...coverageMod.describe(cov).map((l) => "> - " + l), "> Doplň strategii bota (`lib/bot-page.js`), metriky (`lib/metrics.js`) a záznam v `coverage-manifest.json`, pak simulaci spusť znovu.", "");
  else banner.push(`_Pokrytí bota: ${coverageSummary(cov)}._`, "");
  out.push("# Balance simulace", "", ...banner, `Otisk hry: \`${Array.isArray(report.gameFingerprint) ? report.gameFingerprint.join(", ") : report.gameFingerprint}\` · seedy: ${seeds} · hodnoty = medián (min–max) přes seedy · časy v hodinách herního času`, "",
    `Kontroly: ✅ ${report.summary.pass} · ⚠️ ${report.summary.warn} · ❌ ${report.summary.fail}`, "");
  for (const sc of report.scenarios) {
    const a = sc.aggregate; out.push(`## ${sc.title} (\`${sc.id}\`)`, "", `_${sc.description}_`, "");
    out.push(table(["", "Kontrola", "Výsledek"], sc.checks.map((c) => [ICON[c.status], c.label, c.detail])), "");
    out.push(`**Čas do levelu:** ` + LEVEL_MILESTONES.filter((l) => a.timeToLevel[l]).map((l) => `L${l} ${fmt(a.timeToLevel[l])} h`).join(" · ") || "–", "");
    out.push(`**Celkem:** ${fmt(a.hours)} h, level ${fmt(a.level)}, ${fmt(a.kills)} zabití (${fmt(a.killsPerHour)}/h), ${fmt(a.deaths)} smrtí (${fmt(a.deathsPerHour)}/h)`, "");
    if (Object.keys(a.bands).length) out.push("**Kills a smrti za hodinu podle levelových pásem**", "", table(["Pásmo", "Hodin", "Kills/h", "Smrtí/h"], Object.entries(a.bands).map(([b, v]) => [b.replace("-", "–"), fmt(v.hours), fmt(v.killsPerHour, 0), fmt(v.deathsPerHour)])), "");
    out.push("**Gold**", "", table(["Získáno", "z toho prodej", "Kování", "Upgrady", "Opravy", "Jídlo", "Ztraceno smrtí", "Zůstatek"],
      [[fmt(a.gold.earned, 0), fmt(a.gold.fromSales, 0), fmt(a.gold.forge, 0), fmt(a.gold.upgrade, 0), fmt(a.gold.repair, 0), fmt(a.gold.food, 0), fmt(a.gold.lostToDeath, 0), fmt(a.gold.balance, 0)]]), "");
    out.push("**Materiály, craft, upgrady, opravy**", "", table(["Materiálů", "z recyklace", "Vykováno", "Neúspěšně", "Upgradů", "Selhalo", "Oprav", "Tavení", "Prodáno", "Svitků"],
      [[fmt(a.materials.found, 0), fmt(a.materials.smeltRecovered, 0), fmt(a.crafting.forged, 0), fmt(a.crafting.forgeFailed, 0), fmt(a.crafting.upgrades, 0), fmt(a.crafting.upgradeFailures, 0), fmt(a.crafting.repairs, 0), fmt(a.crafting.smelts, 0), fmt(a.crafting.itemsSold, 0), fmt(a.crafting.scrollsLearned, 0)]]), "");
    const firsts = ["rare", "epic", "legendary"].filter((q) => a.drops.first[q].tHours);
    out.push("**První drop:** " + (["rare", "epic", "legendary"].map((q) => a.drops.first[q].tHours ? `${q} ${fmt(a.drops.first[q].tHours)} h (level ${fmt(a.drops.first[q].level, 0)})` : `${q} –`).join(" · ")), "");
    const qa = Object.entries(a.drops.byQualityAffix);
    if (qa.length) out.push("**Dropy podle kvality a affixu**", "", table(["Kvalita", "Dropů", "s affixem", "prefix", "suffix"], qa.map(([q, v]) => [q, fmt(v.total, 0), fmt(v.affixed, 0), fmt(v.prefix, 0), fmt(v.suffix, 0)])), "");
    if (Object.keys(a.materials.byKind).length) out.push("**Materiály podle druhu (nasbíráno)**", "", table(Object.keys(a.materials.byKind), [Object.values(a.materials.byKind).map((v) => fmt(v, 0))]), "");
    if (Object.keys(a.timeline).length) out.push("**Průběh po 10 hodinách (kumulativně)**", "", table(["Hodina", "Level", "Zabití", "Smrtí", "Gold získáno", "Rare", "Epic", "Legendary", "S affixem", "Materiály"], Object.entries(a.timeline).map(([h, v]) => [h, fmt(v.level, 0), fmt(v.kills, 0), fmt(v.deaths, 0), fmt(v.goldEarned, 0), fmt(v.rare, 0), fmt(v.epic, 0), fmt(v.legendary, 0), fmt(v.withAffix, 0), fmt(v.materials, 0)])), "");
    const tiers = Object.keys(a.drops.affixesByTier);
    out.push(`**Affix dropy:** ${fmt(a.drops.withAffix, 0)} kusů s affixem z ${fmt(a.drops.total, 0)} dropů` + (tiers.length ? " · podle tieru: " + tiers.map((t) => `T${t} ${fmt(a.drops.affixesByTier[t], 0)}`).join(", ") : ""), "");
    const gears = Object.entries(a.gearTier).filter(([, v]) => v.atLeast4);
    if (gears.length) out.push("**Kdy má hráč aspoň 4 kusy výbavy tieru (h)**", "", table(["Tier", ...gears.map(([t]) => `T${t}`)], [["Čas", ...gears.map(([, v]) => fmt(v.atLeast4))], ["Zpoždění za levelem", ...gears.map(([, v]) => fmt(v.lagHours))]]), "");
    const first = sc.runs[0].metrics.targets;
    out.push(`**Cíle:** ${fmt(a.targets.changeCount, 0)} změn cíle` + (Object.keys(a.targets.reasons).length ? " · důvody: " + Object.entries(a.targets.reasons).map(([r, v]) => `${r} ${fmt(v, 0)}×`).join(", ") : ""), "");
    out.push(`Nejdéle zvolené cíle (seed ${sc.runs[0].seed}): ` + first.byTarget.slice(0, 5).map((t) => `${t.id} ${t.hours} h`).join(", "), "");
    const shown = first.changes.slice(-3).map((c) => `h ${c.tHours} L${c.level}: ${c.from ?? "–"} → ${c.to} (${c.why})`);
    if (shown.length) out.push("Poslední změny cíle: " + shown.join("; "), "");
  }
  out.push("_Plná čísla včetně všech seedů, pásem a změn cíle jsou v report.json._");
  return out.join("\n") + "\n";
}

// ---------- Porovnání ----------
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) { const key = prefix ? `${prefix}.${k}` : k; if (isStat(v)) out[key] = v.median; else if (v && typeof v === "object") flatten(v, key, out); }
  return out;
}
function compareReports(base, now) {
  const rows = []; const notes = [];
  const sameGame = JSON.stringify(base.gameFingerprint) === JSON.stringify(now.gameFingerprint);
  notes.push(sameGame ? "Otisk hry je stejný jako v baseline: výsledky se musí shodovat přesně (determinismus)." : `Hra se změnila: baseline \`${base.gameFingerprint}\` → nyní \`${now.gameFingerprint}\`.`);
  if (JSON.stringify(base.seeds) !== JSON.stringify(now.seeds)) notes.push(`Pozor: jiné seedy (baseline ${base.seeds.join(",")}, nyní ${now.seeds.join(",")}) – rozdíly nemusí vyjadřovat změnu balancu.`);
  const statusChanges = [];
  for (const sc of now.scenarios) {
    const old = base.scenarios.find((s) => s.id === sc.id); if (!old) { notes.push(`Scénář ${sc.id} v baseline chybí.`); continue; }
    const a = flatten(old.aggregate), b = flatten(sc.aggregate);
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[key], y = b[key]; if (x === y) continue;
      rows.push({ scenario: sc.id, key, before: x ?? null, after: y ?? null, delta: x !== undefined && y !== undefined ? Math.round((y - x) * 100) / 100 : null, pct: x ? Math.round(((y ?? 0) - x) / Math.abs(x) * 1000) / 10 : null });
    }
    for (const c of sc.checks) { const o = old.checks.find((q) => q.id === c.id); if (!o || o.status !== c.status) statusChanges.push({ scenario: sc.id, check: c.id, before: o?.status ?? "–", after: c.status, detail: c.detail }); }
  }
  rows.sort((p, q) => Math.abs(q.pct ?? 1e9) - Math.abs(p.pct ?? 1e9));
  return { sameGame, notes, rows, statusChanges, identical: !rows.length && !statusChanges.length };
}
function renderComparison(cmp, limit = 40) {
  const out = ["# Porovnání s baseline", "", ...cmp.notes.map((n) => `- ${n}`), ""];
  if (cmp.identical) { out.push("**Žádný rozdíl v žádné metrice.**", ""); return out.join("\n"); }
  if (cmp.statusChanges.length) out.push("**Změny kontrol**", "", table(["Scénář", "Kontrola", "Před", "Nyní", "Detail"], cmp.statusChanges.map((c) => [c.scenario, c.check, c.before, c.after, c.detail])), "");
  out.push(`**Změněné metriky (mediány, seřazeno podle relativní změny; ${Math.min(limit, cmp.rows.length)} z ${cmp.rows.length})**`, "", table(["Scénář", "Metrika", "Před", "Nyní", "Δ", "Δ %"], cmp.rows.slice(0, limit).map((r) => [r.scenario, r.key, r.before ?? "–", r.after ?? "–", r.delta ?? "–", r.pct === null ? "–" : `${r.pct} %`])), "");
  return out.join("\n");
}

// ---------- IO ----------
function readRaw(dir) {
  const rawDir = path.join(dir, "raw"); if (!fs.existsSync(rawDir)) throw new Error(`Žádná data v ${rawDir}. Nejdřív spusť: npm run balance:sim`);
  return fs.readdirSync(rawDir).filter((f) => /^seed-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), "utf8")));
}
function generate(dir = DEFAULT_DIR, meta = {}) {
  const runs = readRaw(dir); if (!runs.length) throw new Error(`V ${dir}/raw nejsou žádné běhy.`);
  const report = buildReport(runs, meta); const md = renderMarkdown(report);
  fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 1)); fs.writeFileSync(path.join(dir, "report.md"), md);
  return { report, md };
}

module.exports = { buildReport, renderMarkdown, compareReports, renderComparison, generate, readRaw, flatten, stat, DEFAULT_DIR, REPO_ROOT };

if (require.main === module) {
  const args = process.argv.slice(2); const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (args.includes("--help")) { console.log("Použití: npm run balance:report [-- --dir <složka>] [--compare <baseline report.json>] [--json]"); process.exit(0); }
  const dir = path.resolve(get("--dir") ?? DEFAULT_DIR);
  try {
    const { report, md } = generate(dir);
    if (args.includes("--json")) console.log(JSON.stringify(report, null, 1)); else console.log(md);
    const base = get("--compare");
    if (base) { const cmp = compareReports(JSON.parse(fs.readFileSync(path.resolve(base), "utf8")), report); console.log(renderComparison(cmp)); }
    console.log(`Soubory: ${path.join(dir, "report.json")}, ${path.join(dir, "report.md")}`);
  } catch (e) { console.error(e.message); process.exit(2); }
}
