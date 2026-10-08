#!/usr/bin/env node
"use strict";
// Spustí balance simulaci. Použití (z kořene repozitáře):
//   npm run balance:sim                                   všechny scénáře, výchozí seedy 1,2,3
//   npm run balance:sim -- --scenario level-1-100         jeden (nebo víc oddělených čárkou) scénář
//   npm run balance:sim -- --seeds 1,2,3,4,5,6            vlastní seedy
// Další přepínače: --jobs N (paralelní procesy), --out <složka>, --root <složka hry>, --strict (varování = chyba), --quiet
//   --save-baseline          po běhu uloží report jako baseline (reports/balance-sim/baseline/report.json)
//   --compare-baseline       po běhu porovná s baseline; bez --seeds/--scenario převezme seedy i scénáře z baseline
//   --baseline <soubor>      jiná cesta k baseline
//   --trace                  uloží i záznam událostí pro Simulation Viewer (<out>/trace/<scénář>-seed-N.json)
//   --trace-detail <druh>    standard (výchozí: bez jednotlivých zabití) | full (každé zabití + minisnímky po 60 s)
//   --sample-seconds N       perioda minisnímků v trace (výchozí 0, u full 60)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { SCENARIOS, DEFAULT_SEEDS, getScenario } = require("./scenarios");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_OUT = path.join(REPO_ROOT, "reports", "balance-sim", "latest");
const DEFAULT_BASELINE = path.join(REPO_ROOT, "reports", "balance-sim", "baseline", "report.json");

function parseArgs(argv) {
  const o = { scenarios: [], seeds: null, out: DEFAULT_OUT, root: REPO_ROOT, jobs: null, strict: false, quiet: false, trace: false, traceDetail: "standard", sampleSeconds: null, saveBaseline: false, compareBaseline: false, baseline: DEFAULT_BASELINE, worker: false, seed: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]; const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`Přepínač ${a} vyžaduje hodnotu.`); return v; };
    if (a === "--scenario" || a === "--scenarios") o.scenarios.push(...next().split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--seeds") o.seeds = next().split(",").map((s) => Number(s.trim()));
    else if (a === "--seed") o.seed = Number(next());
    else if (a === "--out") o.out = path.resolve(next());
    else if (a === "--root") o.root = path.resolve(next());
    else if (a === "--jobs") o.jobs = Number(next());
    else if (a === "--strict") o.strict = true;
    else if (a === "--trace") o.trace = true;
    else if (a === "--trace-detail") { o.traceDetail = next(); o.trace = true; if (!["standard", "full"].includes(o.traceDetail)) throw new Error("--trace-detail čeká standard nebo full."); }
    else if (a === "--sample-seconds") o.sampleSeconds = Number(next());
    else if (a === "--save-baseline") o.saveBaseline = true;
    else if (a === "--compare-baseline") o.compareBaseline = true;
    else if (a === "--baseline") o.baseline = path.resolve(next());
    else if (a === "--quiet") o.quiet = true;
    else if (a === "--worker") o.worker = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new Error(`Neznámý přepínač: ${a}`);
  }
  if (o.seeds && (!o.seeds.length || o.seeds.some((s) => !Number.isInteger(s)))) throw new Error("--seeds čeká celá čísla oddělená čárkou, např. 1,2,3");
  if (o.scenarios.includes("all")) o.scenarios = [];
  for (const id of o.scenarios) if (!getScenario(id)) throw new Error(`Neznámý scénář "${id}". Dostupné: ${SCENARIOS.map((s) => s.id).join(", ")}`);
  return o;
}

const HELP = `Balance simulace
  npm run balance:sim [-- --scenario <id>[,<id>]] [--seeds 1,2,3] [--jobs N] [--strict]
Scénáře: ${SCENARIOS.map((s) => s.id).join(", ")}
Výchozí seedy: ${DEFAULT_SEEDS.join(",")}
Výstup: ${path.relative(REPO_ROOT, DEFAULT_OUT)}/report.json + report.md (složka je ignorovaná gitem)`;

function plan(options) {
  const scenarios = options.scenarios.length ? [...new Set(options.scenarios)].map(getScenario) : SCENARIOS;
  return { scenarios, checkpoints: scenarios.map((s) => ({ id: s.id, ...s.checkpoint })), maxHours: Math.max(...scenarios.map((s) => s.maxHours)) };
}

async function runWorker(options) {
  const { simulateSeed } = require("./lib/run");
  const { checkpoints, maxHours } = plan(options);
  const trace = options.trace ? { detail: options.traceDetail, sampleSeconds: options.sampleSeconds ?? undefined } : null;
  const result = await simulateSeed({ root: options.root, seed: options.seed, checkpoints, maxHours, trace, onProgress: options.quiet ? null : (p) => process.stderr.write(`  seed ${p.seed}: ${p.hours} h, level ${p.level}, ${p.kills} zabití, ${p.deaths} smrtí\n`) });
  fs.mkdirSync(path.join(options.out, "raw"), { recursive: true });
  const { trace: traceData, ...raw } = result;
  fs.writeFileSync(path.join(options.out, "raw", `seed-${options.seed}.json`), JSON.stringify(raw));
  if (traceData) writeTraces(options, raw, traceData);
}

// Pro každý scénář uloží trace zkrácený na jeho checkpoint + malý soubor *.meta.json pro seznam ve Vieweru.
function writeTraces(options, raw, trace) {
  const dir = path.join(options.out, "trace"); fs.mkdirSync(dir, { recursive: true });
  for (const [scenarioId, snap] of Object.entries(raw.results)) {
    const end = snap.traceEnd; const sc = getScenario(scenarioId);
    const meta = { scenario: scenarioId, title: sc?.title ?? scenarioId, seed: trace.seed, reached: snap.reached, detail: trace.detail, sampleMs: trace.sampleMs, gameFingerprint: trace.gameFingerprint, endHours: snap.virtualHours, level: snap.snap.level, events: end.events, frames: end.frames, ticks: end.ticks };
    const file = `${scenarioId}-seed-${trace.seed}`;
    const body = { schema: trace.schema, kind: trace.kind, meta, seed: trace.seed, gameFingerprint: trace.gameFingerprint, detail: trace.detail, cycleMs: trace.cycleMs, sampleMs: trace.sampleMs, scenario: { id: scenarioId, title: meta.title, checkpoint: sc?.checkpoint ?? null }, dictionary: trace.dictionary,
      events: trace.events.slice(0, end.events), ticks: trace.ticks.slice(0, end.ticks), frames: trace.frames.slice(0, end.frames) };
    fs.writeFileSync(path.join(dir, `${file}.json`), JSON.stringify(body)); fs.writeFileSync(path.join(dir, `${file}.meta.json`), JSON.stringify(meta));
  }
}

function spawnWorker(options, seed) {
  const args = [__filename, "--worker", "--seed", String(seed), "--out", options.out, "--root", options.root, "--scenario", plan(options).scenarios.map((s) => s.id).join(",")];
  if (options.quiet) args.push("--quiet");
  if (options.trace) args.push("--trace-detail", options.traceDetail);
  if (options.sampleSeconds !== null) args.push("--sample-seconds", String(options.sampleSeconds));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Běh se seedem ${seed} selhal (kód ${code}).`))));
    child.on("error", reject);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return 0; }
  if (options.worker) { await runWorker(options); return 0; }
  let base = null;
  if (options.compareBaseline) {
    if (!fs.existsSync(options.baseline)) { console.error(`Baseline neexistuje (${options.baseline}). Nejdřív před změnou balancu spusť: npm run balance:baseline`); return 2; }
    base = JSON.parse(fs.readFileSync(options.baseline, "utf8"));
    if (!options.seeds) options.seeds = base.seeds; if (!options.scenarios.length) options.scenarios = base.scenarios.map((s) => s.id);
  }
  const seeds = options.seeds ?? DEFAULT_SEEDS; const { scenarios } = plan(options);
  const jobs = Math.max(1, Math.min(seeds.length, options.jobs ?? Math.max(1, os.cpus().length - 1)));
  const rawDir = path.join(options.out, "raw"); fs.mkdirSync(rawDir, { recursive: true });
  for (const f of fs.readdirSync(rawDir)) if (/^seed-\d+\.json$/.test(f)) fs.unlinkSync(path.join(rawDir, f));
  const started = Date.now(); console.error(`Simuluji scénáře: ${scenarios.map((s) => s.id).join(", ")} · seedy: ${seeds.join(",")} · paralelně: ${jobs}`);
  const queue = [...seeds]; let failure = null;
  await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length && !failure) { const seed = queue.shift(); try { await spawnWorker(options, seed); } catch (e) { failure = e; } } }));
  if (failure) { console.error(failure.message); return 2; }
  const { generate } = require("./report");
  const { report, md } = generate(options.out, { generatedAt: new Date().toISOString(), wallSecondsTotal: +((Date.now() - started) / 1000).toFixed(1), command: process.argv.slice(2).join(" ") });
  console.log(md);
  if (options.saveBaseline) { fs.mkdirSync(path.dirname(options.baseline), { recursive: true }); fs.copyFileSync(path.join(options.out, "report.json"), options.baseline); console.error(`Baseline uložena: ${path.relative(process.cwd(), options.baseline)}`); }
  if (base) { const { compareReports, renderComparison } = require("./report"); console.log(renderComparison(compareReports(base, report))); }
  console.error(`Hotovo za ${((Date.now() - started) / 1000).toFixed(0)} s. Reporty: ${path.relative(process.cwd(), path.join(options.out, "report.json"))}, report.md`);
  return report.summary.fail > 0 || (options.strict && report.summary.warn > 0) ? 1 : 0;
}

if (require.main === module) main().then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(2); });
module.exports = { parseArgs, plan };
