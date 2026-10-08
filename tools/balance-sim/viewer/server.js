#!/usr/bin/env node
"use strict";
// Lokální server Simulation Vieweru. Jen čte repozitář a spouští CLI simulaci; do herních souborů nikdy nezapisuje.
//   npm run balance:viewer            → http://127.0.0.1:8787/
//   npm run balance:viewer -- --port 9000
// Bezpečnost: poslouchá jen na 127.0.0.1, ověřuje hlavičku Host (ochrana proti DNS rebindingu), povoluje jen GET/HEAD
// a jediný POST (/api/run) s kontrolou Origin. Statické soubory jdou jen ze seznamu povolených cest (viz resolveStatic).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { SCENARIOS, getScenario } = require("../scenarios");

const TOOL_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
const LIB_FILES = new Set(["bot-page.js", "virtual-time.js", "trace-summary.js"]);

function parseArgs(argv) {
  const o = { port: 8787, root: REPO_ROOT, host: "127.0.0.1" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--port") o.port = Number(argv[++i]); else if (argv[i] === "--root") o.root = path.resolve(argv[++i]); else if (argv[i] === "--help") o.help = true;
    else throw new Error(`Neznámý přepínač: ${argv[i]}`);
  }
  if (!Number.isInteger(o.port) || o.port < 0 || o.port > 65535) throw new Error("--port čeká číslo 0–65535");
  return o;
}

// Povolené statické cesty. Vrací absolutní cestu nebo null.
function resolveStatic(root, urlPath) {
  let p; try { p = decodeURIComponent(urlPath); } catch (_) { return null; }
  if (p.includes("\0") || p.includes("\\") || p.split("/").some((seg) => seg === ".." || seg.startsWith(".") || seg === "node_modules")) return null;
  const rel = p.replace(/^\/+/, ""); const abs = path.join(root, rel);
  if (!abs.startsWith(root + path.sep)) return null;
  const parts = rel.split("/");
  const ext = path.extname(rel).toLowerCase();
  if (!TYPES[ext]) return null;
  if (parts[0] === "tools") {
    if (parts[1] === "balance-sim" && parts[2] === "viewer" && parts.length === 4 && parts[3] !== "server.js") return abs;
    if (parts[1] === "balance-sim" && parts[2] === "lib" && parts.length === 4 && LIB_FILES.has(parts[3])) return abs;
    return null;
  }
  if (parts[0] === "reports") return parts[1] === "balance-sim" && ext === ".json" ? abs : null;
  if (parts[0] === "assets") return abs;
  if (parts.length === 1 && !/^package(-lock)?\.json$/.test(parts[0])) return abs; // soubory hry v kořeni (index.html, app.js, data, styles)
  return null;
}

function listTraces(root) {
  const base = path.join(root, "reports", "balance-sim"); const dirs = [];
  if (fs.existsSync(path.join(base, "latest", "trace"))) dirs.push(["latest", path.join(base, "latest", "trace")]);
  const runs = path.join(base, "viewer-runs");
  if (fs.existsSync(runs)) for (const d of fs.readdirSync(runs)) if (fs.existsSync(path.join(runs, d, "trace"))) dirs.push([`viewer-runs/${d}`, path.join(runs, d, "trace")]);
  const out = [];
  for (const [id, dir] of dirs) for (const f of fs.readdirSync(dir)) if (f.endsWith(".meta.json")) {
    try { const meta = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); const name = f.replace(/\.meta\.json$/, ".json");
      out.push({ ...meta, url: `/reports/balance-sim/${id}/trace/${name}`, report: fs.existsSync(path.join(dir, "..", "report.json")) ? `/reports/balance-sim/${id}/report.json` : null, source: id }); } catch (_) { /* poškozený soubor přeskočíme */ }
  }
  return out.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.seed - b.seed);
}

function createServer(options) {
  const root = options.root; const jobs = new Map(); let jobSeq = 0; let origin = null;
  const send = (res, code, body, type = "application/json; charset=utf-8", extra = {}) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra }); res.end(body); };
  const json = (res, code, obj) => send(res, code, JSON.stringify(obj));

  function startJob({ scenario, seed, detail }) {
    const id = String(++jobSeq); const out = path.join(root, "reports", "balance-sim", "viewer-runs", `${scenario}-seed-${seed}`);
    const job = { id, scenario, seed, detail, status: "running", log: "", startedAt: Date.now(), out };
    const args = [path.join(TOOL_DIR, "run-simulation.js"), "--scenario", scenario, "--seeds", String(seed), "--jobs", "1", "--trace", "--trace-detail", detail, "--out", out, "--root", root];
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    const add = (d) => { job.log = (job.log + d.toString()).slice(-4000); };
    child.stdout.on("data", () => {}); child.stderr.on("data", add);
    child.on("exit", (code) => { job.status = code === 0 || code === 1 ? "done" : "failed"; job.exitCode = code; job.finishedAt = Date.now(); });
    child.on("error", (e) => { job.status = "failed"; job.log += String(e); });
    jobs.set(id, job); return job;
  }

  return http.createServer((req, res) => {
    const host = (req.headers.host || "").toLowerCase();
    const allowedHosts = [`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`];
    if (!allowedHosts.includes(host)) return send(res, 403, "Forbidden", "text/plain");
    origin = `http://${host}`;
    const url = new URL(req.url, origin);
    if (req.method === "POST" && url.pathname === "/api/run") {
      if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: "Neplatný Origin" });
      if (!req.headers.origin) return json(res, 403, { error: "Chybí Origin" });
      if ([...jobs.values()].some((j) => j.status === "running")) return json(res, 409, { error: "Jiná simulace už běží." });
      let body = ""; req.on("data", (c) => { body += c; if (body.length > 2000) req.destroy(); });
      req.on("end", () => {
        let o; try { o = JSON.parse(body); } catch (_) { return json(res, 400, { error: "Neplatný JSON" }); }
        const seed = Number(o.seed), detail = o.detail === "full" ? "full" : "standard";
        if (!getScenario(o.scenario) || !Number.isInteger(seed) || seed < 1 || seed > 9999) return json(res, 400, { error: "Neznámý scénář nebo seed (1–9999)." });
        const job = startJob({ scenario: o.scenario, seed, detail }); json(res, 202, { id: job.id });
      });
      return undefined;
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method Not Allowed", "text/plain");
    if (url.pathname === "/") { res.writeHead(302, { Location: "/tools/balance-sim/viewer/simulation-viewer.html" + url.search }); return res.end(); }
    if (url.pathname === "/api/coverage") { const c = require("../coverage"); const r = c.evaluate(); return json(res, 200, { stale: r.stale, summary: c.summaryLine(r), lines: c.describe(r) }); }
    if (url.pathname === "/api/scenarios") return json(res, 200, SCENARIOS.map((s) => ({ id: s.id, title: s.title, description: s.description, maxHours: s.maxHours, checkpoint: s.checkpoint })));
    if (url.pathname === "/api/traces") return json(res, 200, listTraces(root));
    const jm = /^\/api\/jobs\/(\d+)$/.exec(url.pathname);
    if (jm) { const j = jobs.get(jm[1]); return j ? json(res, 200, { id: j.id, scenario: j.scenario, seed: j.seed, status: j.status, log: j.log, seconds: Math.round(((j.finishedAt ?? Date.now()) - j.startedAt) / 1000) }) : json(res, 404, { error: "Neznámá úloha" }); }
    const file = resolveStatic(root, url.pathname);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, "Not found", "text/plain");
    const type = TYPES[path.extname(file).toLowerCase()];
    // Živý běh: index.html s parametrem bsim=<seed> dostane před herní skripty virtuální čas a seedovaný Math.random.
    if (url.pathname === "/index.html" && url.searchParams.has("bsim")) {
      const html = fs.readFileSync(file, "utf8").replace(/<head[^>]*>/i, (m) => `${m}<script src="/tools/balance-sim/lib/virtual-time.js"></script><script src="/tools/balance-sim/viewer/live-boot.js"></script>`);
      return send(res, 200, html, type);
    }
    return send(res, 200, req.method === "HEAD" ? "" : fs.readFileSync(file), type);
  });
}

let server;
function start(options) {
  server = createServer(options);
  return new Promise((resolve) => server.listen(options.port, options.host, () => resolve(server)));
}

if (require.main === module) {
  let options; try { options = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (options.help) { console.log("Použití: npm run balance:viewer [-- --port 8787]"); process.exit(0); }
  start(options).then((s) => console.log(`Simulation Viewer: http://127.0.0.1:${s.address().port}/  (Ctrl+C ukončí)\nServer jen čte repozitář; reporty a trace se ukládají do reports/balance-sim/ (ignorováno gitem).`));
}

module.exports = { start, resolveStatic, parseArgs, listTraces };
