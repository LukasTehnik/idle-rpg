"use strict";
// Simulation Viewer: přehrává trace z CLI simulace. Nepočítá nic z herní logiky: jen zobrazuje data ze záznamu
// (události, snímky stavu, vysvětlení bota) a odvozuje z nich grafy a souhrny.
(function () {
  const $ = (id) => document.getElementById(id);
  const SLOT_CS = { weapon: "Zbraň", armor: "Brnění", helmet: "Helma", pants: "Kalhoty", gloves: "Rukavice", boots: "Boty", charm: "Amulet", wings: "Křídla" };
  const Q_CS = { common: "Běžný", rare: "Vzácný", epic: "Epický", legendary: "Legendární", mythic: "Mýtický" };
  const TYPE_CS = { kill: "zabití", death: "smrt", drop: "drop", equip: "výbava", forge: "kování", upgrade: "upgrade", repair: "oprava", smelt: "tavení", sale: "prodej", food: "jídlo", learn: "svitek", target: "cíl", location: "lokace", levelup: "level", materials: "materiály", warning: "varování" };
  const DEFAULT_OFF = new Set(["kill", "materials"]);
  const SPEEDS = { 1: 1, 10: 10, 100: 100, max: 225000 }; // virtuální ms za reálnou ms; max ≈ 1 virtuální hodina na snímek
  const nf = new Intl.NumberFormat("cs-CZ"); const n0 = (x) => (x === null || x === undefined ? "–" : nf.format(Math.round(x))); const n1 = (x) => (x === null || x === undefined ? "–" : nf.format(Math.round(x * 10) / 10));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clockText = (ms) => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; };

  const S = { trace: null, t: 0, playing: false, speed: "1", filters: new Set(), dirty: true, derived: null, report: null };

  // ---------- pomocné ----------
  function lowerBound(arr, t, get) { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (get(arr[mid]) <= t) lo = mid + 1; else hi = mid; } return lo; } // počet prvků s hodnotou ≤ t
  const frameAt = (t) => { const f = S.trace.frames; const i = lowerBound(f, t, (x) => x.t) - 1; return f[Math.max(0, i)]; };
  const tickAt = (t) => { const k = S.trace.ticks; if (!k.length) return null; const i = lowerBound(k, t, (x) => x[0]) - 1; return i >= 0 ? k[i] : null; };
  const itemText = (it) => (it ? `${esc(it.name)}${it.upgrade ? ` +${it.upgrade}` : ""}` : "–");
  const affixText = (it) => (it ? [it.prefix, it.suffix].filter(Boolean).map(esc).join(" · ") : "");
  const qSpan = (q) => `<span class="q q-${esc(q)}">${esc(Q_CS[q] ?? q)}</span>`;
  const enemyName = (id) => S.trace.dictionary.enemies[id]?.name ?? id ?? "–";
  const matName = (id) => S.trace.dictionary.materials[id]?.name ?? id;

  // ---------- načtení záznamu ----------
  function loadTrace(trace, source) {
    if (!trace || trace.kind !== "balance-sim-trace" || trace.schema !== 1) { alert("Tohle není trace nástroje balance-sim (schema 1)."); return; }
    S.trace = trace; S.t = 0; S.playing = false; S.report = null;
    S.endT = trace.frames[trace.frames.length - 1]?.t ?? 0;
    S.filters = new Set(Object.keys(TYPE_CS).filter((t) => !DEFAULT_OFF.has(t)));
    if (trace.detail === "full") S.filters.add("kill");
    derive(); buildFilters();
    $("timeSlider").max = String(S.endT); $("timeSlider").value = "0";
    $("empty").hidden = true; $("app").hidden = false; S.source = source;
    renderSummary(); markDirty(); loadReportFor(source);
  }

  function derive() {
    const tr = S.trace; const levelAt = { 1: 0 };
    for (const e of tr.events) if (e.type === "levelup" && !(e.level in levelAt)) levelAt[e.level] = e.t;
    const deathsByBand = Array.from({ length: 10 }, () => []);
    for (const e of tr.events) if (e.type === "death") deathsByBand[Math.min(9, Math.floor((e.level - 1) / 10))].push(e.t);
    // očekávaný tier výbavy podle levelu: z dat lokací (doporučený level → tier lokace)
    const locs = Object.values(tr.dictionary.locations).filter((l) => l.recommendedLevel !== null && l.itemTier !== null).sort((a, b) => a.recommendedLevel - b.recommendedLevel);
    const expectedTier = (level) => { let t = 0; for (const l of locs) if (l.recommendedLevel <= level) t = Math.max(t, l.itemTier); return t; };
    const gear = tr.frames.map((f) => { const tiers = f.equipment.map((s) => s.item?.tier ?? 0); return { t: f.t, level: f.level, avg: tiers.reduce((a, b) => a + b, 0) / tiers.length, expected: expectedTier(f.level) }; });
    S.derived = { levelAt, deathsByBand, gear, expectedTier };
  }

  // ---------- přehrávání ----------
  function setTime(t) { if (!S.trace) return; S.t = Math.max(0, Math.min(S.endT, t)); $("timeSlider").value = String(Math.round(S.t)); markDirty(); }
  let lastTs = null;
  function loop(ts) {
    if (S.playing && S.trace) { const dt = lastTs === null ? 16 : ts - lastTs; setTime(S.t + dt * SPEEDS[S.speed]); if (S.t >= S.endT) S.playing = false; }
    lastTs = S.playing ? ts : null;
    if (S.dirty && S.trace) { S.dirty = false; render(); }
    requestAnimationFrame(loop);
  }
  const markDirty = () => { S.dirty = true; };
  function stepEvent(dir) {
    if (!S.trace) return;
    const ev = S.trace.events.filter((e) => S.filters.has(e.type)); if (!ev.length) return;
    const i = lowerBound(ev, S.t, (x) => x.t);
    if (dir > 0) { const next = ev[i]; if (next) setTime(next.t); } else { let j = i - 1; while (j >= 0 && ev[j].t >= S.t) j -= 1; if (j >= 0) setTime(ev[j].t); else setTime(0); }
  }

  // ---------- vykreslení ----------
  function render() {
    const tr = S.trace, f = frameAt(S.t), tk = tickAt(S.t); $("clock").textContent = `${clockText(S.t)} · ${n1(S.t / 3.6e6)} h`;
    const live = tk && tk[0] >= f.t ? { level: tk[1], xp: tk[2], hp: tk[3], kills: tk[4], deaths: tk[5], earned: tk[6], balance: tk[7] } : { level: f.level, xp: f.xp, hp: f.hp, kills: f.kills, deaths: f.deaths, earned: f.gold.earned, balance: f.gold.balance };
    const sameLevel = live.level === f.level;
    $("charTiles").innerHTML = tile("Level", n0(live.level)) + tile("Zabití", n0(live.kills)) + tile("Smrtí", n0(live.deaths)) + tile("Jídlo", n0(f.food));
    $("xpText").textContent = f.xpNeeded && sameLevel ? `${n0(live.xp)} / ${n0(f.xpNeeded)}` : `${n0(live.xp)}`; $("xpBar").style.width = f.xpNeeded && sameLevel ? `${Math.min(100, (live.xp / f.xpNeeded) * 100)}%` : "0%";
    $("hpText").textContent = `${n0(live.hp)} / ${n0(f.maxHp)}`; $("hpBar").style.width = `${Math.max(0, Math.min(100, (live.hp / f.maxHp) * 100))}%`;
    const g = f.gold;
    $("goldKv").innerHTML = kv("Získáno celkem", n0(live.earned)) + kv("z toho prodejem", n0(g.fromSales)) + kv("Utraceno celkem", n0(g.spentTotal)) + kv("  kování / upgrady", `${n0(g.spent.forge)} / ${n0(g.spent.upgrade)}`) + kv("  opravy / jídlo", `${n0(g.spent.repair)} / ${n0(g.spent.food)}`) + kv("Ztraceno smrtí", n0(g.lostToDeath)) + kv("Aktuálně (u sebe + banka)", `${n0(live.balance)} (${n0(g.carried)} + ${n0(g.bank)})`);
    const mats = Object.entries(f.materials).sort((a, b) => b[1] - a[1]);
    $("materials").innerHTML = mats.length ? mats.slice(0, 10).map(([id, q]) => `<span class="chip">${esc(matName(id))} ${n0(q)}</span>`).join("") + (mats.length > 10 ? `<details><summary>dalších ${mats.length - 10}</summary>${mats.slice(10).map(([id, q]) => `<span class="chip">${esc(matName(id))} ${n0(q)}</span>`).join("")}</details>` : "") : '<span class="muted">žádné</span>';
    $("equipTable").innerHTML = "<tr><th>Slot</th><th>Item</th><th class='num'>Tier</th><th>Kvalita</th><th>Affixy</th></tr>" + f.equipment.map((s) => `<tr><td>${esc(SLOT_CS[s.slot] ?? s.slot)}</td><td>${itemText(s.item)}</td><td class="num">${s.item ? "T" + (s.item.tier ?? "?") : "–"}</td><td>${s.item ? qSpan(s.item.quality) : "–"}</td><td>${affixText(s.item) || '<span class="muted">–</span>'}</td></tr>`).join("");
    renderActivity(f); renderLog(); renderCharts(f);
    $("timeSlider").value = String(Math.round(S.t));
  }
  const tile = (label, value) => `<div class="tile"><b>${value}</b><span>${esc(label)}</span></div>`;
  const kv = (k, v) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;

  function renderActivity(f) {
    const d = f.decision;
    $("where").innerHTML = `<div>${esc(f.locationName ?? "–")} › ${esc(f.area ?? "–")}</div><div style="margin:4px 0"><b>${esc(f.targetName ?? "bez cíle")}</b> ${f.targetType === "boss" ? '<span class="chip boss">BOSS</span>' : ""}<span class="chip">lvl ${n0(f.targetLevel)}</span><span class="chip">fáze: ${esc(f.phase)}</span></div>`;
    $("decision").innerHTML = d ? `<b>Proč:</b> ${esc(d.summary)}${d.plan && d.plan.length ? `<div class="muted" style="margin-top:4px">Plán kování: ${esc(d.plan.join(", "))}${d.deficit.length ? ` · chybí: ${esc(d.deficit.map(matName).join(", "))}` : ""}</div>` : ""}` : "<span class='muted'>bez záznamu rozhodnutí</span>";
    const c = d?.current, m = f.measured;
    $("rateTiles").innerHTML = tile("očekávané XP/h", c ? n0(c.xpPerH) : "–") + tile("očekávaná zabití/h", c ? n0(c.killsPerH) : "–") + tile("očekávané smrti/h", c ? n1(c.deathsPerH) : "–") + tile("zabití na život (odhad)", c ? n1(c.killsPerLife) : "–") +
      tile("naměřeno: zabití/h (1 h)", m ? n0(m.killsPerH) : "–") + tile("naměřeno: smrti/h (1 h)", m ? n1(m.deathsPerH) : "–") + tile("naměřeno: XP/h (1 h)", m ? n0(m.xpPerH) : "–") + tile("naměřeno: zabití na život", m ? n1(m.killsPerLife) : "–");
    $("candTable").innerHTML = d ? "<tr><th>Cíl</th><th class='num'>Skóre</th><th class='num'>XP/h</th><th class='num'>zabití/h</th><th class='num'>smrti/h</th></tr>" + d.candidates.map((r) => `<tr><td>${esc(r.name)}${r.id === f.target ? " ◀" : ""}</td><td class="num">${r.score.toFixed(2)} <span class="muted">(${r.xpScore.toFixed(2)}+${r.matScore.toFixed(2)})</span></td><td class="num">${n0(r.xpPerH)}</td><td class="num">${n0(r.killsPerH)}</td><td class="num">${n1(r.deathsPerH)}</td></tr>`).join("") : "";
    const ev = S.trace.events; let i = lowerBound(ev, S.t, (x) => x.t) - 1; while (i >= 0 && ev[i].type !== "target") i -= 1;
    $("lastTarget").innerHTML = i >= 0 ? `${n1(ev[i].t / 3.6e6)} h: ${esc(ev[i].fromName ?? "–")} → <b>${esc(ev[i].toName)}</b><br>${esc(ev[i].why)}` : "zatím žádná";
    // upozornění na smrtící spirálu
    let w = null; { let j = lowerBound(ev, S.t, (x) => x.t) - 1; while (j >= 0 && S.t - ev[j].t <= 2 * S.trace.cycleMs) { if (ev[j].type === "warning") { w = ev[j]; break; } j -= 1; } }
    $("warnings").innerHTML = w ? (w.kind === "spiral" ? `<div class="banner bad" role="alert">⚠ Smrtící spirála: ${w.streak} zásahů bota po sobě s opakovanými smrtmi na „${esc(w.targetName)}“ (${w.deaths} smrtí / ${w.kills} zabití za poslední zásah).</div>` : `<div class="banner warn" role="alert">⚠ Opakované smrti na „${esc(w.targetName)}“: ${w.deaths} smrtí / ${w.kills} zabití za poslední zásah bota.</div>`) : "";
  }

  function describe(e) {
    const it = (x) => (x ? `${esc(x.name)} T${x.tier ?? "?"} ${qSpan(x.quality)}${x.upgrade ? " +" + x.upgrade : ""}${affixText(x) ? " [" + affixText(x) + "]" : ""}` : "–");
    switch (e.type) {
      case "kill": return `Zabit ${esc(enemyName(e.enemy))}`;
      case "death": return `Smrt na ${esc(enemyName(e.enemy))} (level ${e.level}), ztraceno ${n0(e.goldLost)} zlata`;
      case "drop": return `Drop: ${it(e.item)} od ${esc(enemyName(e.enemy))}`;
      case "equip": return `Nasazeno (${esc(SLOT_CS[e.slot] ?? e.slot)}): ${it(e.to)}${e.from ? ` místo ${esc(e.from.name)}` : ""}; skóre ${e.scoreFrom}→${e.scoreTo}`;
      case "forge": return e.ok ? `Vykováno ${it(e.item)} za ${n0(e.gold)} zlata (${esc(e.recipe)})` : `Kování selhalo (${esc(e.recipe)}, ${n0(e.gold)} zlata)`;
      case "upgrade": return `${e.ok ? "Upgrade" : "Upgrade SELHAL"}: ${esc(e.item?.name)} +${e.from} → +${e.to} za ${n0(e.gold)} zlata`;
      case "repair": return `Oprava (${esc(SLOT_CS[e.slot] ?? e.slot)}): chybělo ${n0(e.missing)}, ${n0(e.gold)} zlata`;
      case "smelt": return `Roztaveno ${esc(e.item?.name)} → ${esc(Object.entries(e.gained).map(([k, v]) => `${k.split(":")[0]} ×${v}`).join(", ") || "nic")}`;
      case "sale": return `Prodáno ${e.count} kusů za ${n0(e.gold)} zlata`;
      case "food": return `Koupeno jídlo ×${e.n} za ${n0(e.gold)} zlata`;
      case "learn": return `Naučen affix: ${esc(e.affix)}`;
      case "target": return `<b>Cíl:</b> ${esc(e.fromName ?? "–")} → <b>${esc(e.toName)}</b> · ${esc(e.why)}`;
      case "location": return `Přesun do lokace ${esc(e.name ?? e.location)}`;
      case "levelup": return `<b>Level ${e.level}</b>`;
      case "materials": return `Materiály: ${esc(Object.entries(e.gained).slice(0, 6).map(([k, v]) => `${matName(k)} +${v}`).join(", "))}`;
      case "warning": return `${e.kind === "spiral" ? "Smrtící spirála" : "Opakované smrti"} na ${esc(e.targetName)}: ${e.deaths} smrtí / ${e.kills} zabití (zásah č. ${e.streak})`;
      default: return esc(e.type);
    }
  }
  function renderLog() {
    const ev = S.trace.events; const end = lowerBound(ev, S.t, (x) => x.t); const rows = [];
    for (let i = end - 1; i >= 0 && rows.length < 120; i -= 1) if (S.filters.has(ev[i].type)) rows.push(ev[i]);
    $("log").innerHTML = rows.map((e) => `<li class="${e.type}"><time>${(e.t / 3.6e6).toFixed(2)} h</time><span class="tag">${esc(TYPE_CS[e.type] ?? e.type)}</span><span>${describe(e)}</span></li>`).join("") || '<li><span></span><span></span><span class="muted">zatím žádné události</span></li>';
    const drops = []; for (let i = end - 1; i >= 0 && drops.length < 8; i -= 1) if (ev[i].type === "drop" && ev[i].item.quality !== "common") drops.push(ev[i]);
    const commons = []; for (let i = end - 1; i >= 0 && commons.length < 3; i -= 1) if (ev[i].type === "drop" && ev[i].item.quality === "common") commons.push(ev[i]);
    $("recentDrops").innerHTML = [...drops, ...commons].slice(0, 10).map((e) => `<li>${(e.t / 3.6e6).toFixed(1)} h · ${describe(e)}</li>`).join("") || '<li class="muted">zatím žádné</li>';
  }
  function buildFilters() {
    $("filters").innerHTML = Object.keys(TYPE_CS).map((t) => `<label><input type="checkbox" data-type="${t}" ${S.filters.has(t) ? "checked" : ""}>${TYPE_CS[t]}</label>`).join("");
    for (const cb of $("filters").querySelectorAll("input")) cb.addEventListener("change", () => { if (cb.checked) S.filters.add(cb.dataset.type); else S.filters.delete(cb.dataset.type); markDirty(); });
  }

  // ---------- grafy (SVG, bez knihoven) ----------
  const W = 520, H = 230, M = { l: 46, r: 12, t: 10, b: 28 };
  function niceTicks(max, count = 4) { if (max <= 0) return [0, 1]; const raw = max / count, mag = 10 ** Math.floor(Math.log10(raw)); const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw); const out = []; for (let v = 0; v <= max + step * 0.999; v += step) out.push(v); return out; }
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function axes(svg, xMax, yMax, xFmt, yFmt) {
    const yt = niceTicks(yMax); const yTop = yt[yt.length - 1]; let out = "";
    for (const v of yt) { const y = H - M.b - (v / yTop) * (H - M.t - M.b); out += `<line class="grid-line" x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}"/><text x="${M.l - 6}" y="${y + 3}" text-anchor="end">${yFmt(v)}</text>`; }
    const xt = niceTicks(xMax, 5); for (const v of xt) { if (v > xMax * 1.001) continue; const x = M.l + (v / xMax) * (W - M.l - M.r); out += `<text x="${x}" y="${H - 10}" text-anchor="middle">${xFmt(v)}</text>`; }
    out += `<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/>`;
    return { html: out, yTop, sx: (v) => M.l + (v / xMax) * (W - M.l - M.r), sy: (v) => H - M.b - (v / yTop) * (H - M.t - M.b) };
  }
  // cfg: { xMax, yMax, xFmt, yFmt, series:[{name,color,pts:[[x,y]],dash,step}], cursor (x), tip:(x)=>html }
  function lineChart(svg, cfg) {
    const a = axes(svg, cfg.xMax, cfg.yMax, cfg.xFmt, cfg.yFmt); let out = a.html;
    for (const s of cfg.series) {
      const path = (pts) => pts.map((p, i) => (s.step && i ? `H${a.sx(p[0]).toFixed(1)}V${a.sy(p[1]).toFixed(1)}` : `${i ? "L" : "M"}${a.sx(p[0]).toFixed(1)},${a.sy(p[1]).toFixed(1)}`)).join("");
      if (!s.pts.length) continue;
      out += `<path d="${path(s.pts)}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ""} opacity="${s.faint ? 0.55 : 0.25}"/>`;
      const shown = s.pts.filter((p) => p[0] <= cfg.cursor); if (shown.length) { out += `<path d="${path(shown)}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round"/>`; const last = shown[shown.length - 1]; out += `<circle cx="${a.sx(last[0])}" cy="${a.sy(last[1])}" r="4" fill="${s.color}" stroke="${css("--surface")}" stroke-width="2"/>`; }
    }
    out += `<line x1="${a.sx(Math.min(cfg.cursor, cfg.xMax))}" x2="${a.sx(Math.min(cfg.cursor, cfg.xMax))}" y1="${M.t}" y2="${H - M.b}" stroke="${css("--ink-2")}" stroke-width="1" stroke-dasharray="2 3"/>`;
    out += `<rect class="hit" x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}" fill="transparent"/>`;
    svg.innerHTML = out; hover(svg, (px) => { const x = ((px - M.l) / (W - M.l - M.r)) * cfg.xMax; return x < 0 || x > cfg.xMax ? null : cfg.tip(x); });
  }
  function hover(svg, tipFor) {
    const rect = svg.querySelector(".hit"); if (!rect) return; const tip = $("tooltip");
    rect.addEventListener("mousemove", (ev) => { const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W; const html = tipFor(px); if (!html) { tip.style.display = "none"; return; } tip.innerHTML = html; tip.style.display = "block"; tip.style.left = `${ev.clientX + 12}px`; tip.style.top = `${ev.clientY + 12}px`; });
    rect.addEventListener("mouseleave", () => { tip.style.display = "none"; });
  }
  const nearest = (pts, x) => { let best = null; for (const p of pts) if (!best || Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; return best; };
  const legend = (id, items) => { $(id).innerHTML = items.map(([c, n, dash]) => `<span><i style="background:${dash ? "transparent;border-top:2px dashed " + c : c};${dash ? "height:0;border-radius:0" : ""}"></i>${esc(n)}</span>`).join(""); };

  function renderCharts(f) {
    const tr = S.trace, hrs = (ms) => ms / 3.6e6, xMax = Math.max(0.1, hrs(S.endT)), cur = hrs(S.t);
    const s1 = css("--s1"), s2 = css("--s2"), s3 = css("--s3"), ink = css("--ink-2");
    // level v čase
    const lv = tr.frames.map((x) => [hrs(x.t), x.level]); const lvMax = Math.max(10, ...lv.map((p) => p[1]));
    legend("lg-level", [[s1, "level"]]);
    lineChart($("chart-level"), { xMax, yMax: lvMax, xFmt: (v) => `${n1(v)} h`, yFmt: n0, series: [{ name: "level", color: s1, pts: lv }], cursor: cur, tip: (x) => { const p = nearest(lv, x); return `${n1(p[0])} h<br>level ${p[1]}`; } });
    // gold
    const earned = tr.frames.map((x) => [hrs(x.t), x.gold.earned]), spent = tr.frames.map((x) => [hrs(x.t), x.gold.spentTotal]), bal = tr.frames.map((x) => [hrs(x.t), x.gold.balance]);
    const gMax = Math.max(100, ...earned.map((p) => p[1]));
    legend("lg-gold", [[s1, "získáno"], [s2, "utraceno"], [s3, "zůstatek"]]);
    lineChart($("chart-gold"), { xMax, yMax: gMax, xFmt: (v) => `${n1(v)} h`, yFmt: (v) => (v >= 1000 ? `${nf.format(v / 1000)} tis.` : n0(v)), series: [{ name: "získáno", color: s1, pts: earned }, { name: "utraceno", color: s2, pts: spent }, { name: "zůstatek", color: s3, pts: bal }], cursor: cur, tip: (x) => { const i = earned.indexOf(nearest(earned, x)); return `${n1(earned[i][0])} h<br>získáno ${n0(earned[i][1])}<br>utraceno ${n0(spent[i][1])}<br>zůstatek ${n0(bal[i][1])}`; } });
    // tier výbavy vs level
    const g = S.derived.gear; const avg = g.map((p) => [p.level, p.avg]), exp = []; for (const p of g) if (!exp.length || exp[exp.length - 1][0] !== p.level) exp.push([p.level, p.expected]);
    const lvMaxG = Math.max(10, ...g.map((p) => p.level));
    legend("lg-gear", [[s1, "průměrný tier nasazené výbavy"], [ink, "tier lokace odpovídající levelu", true]]);
    lineChart($("chart-gear"), { xMax: lvMaxG, yMax: 10, xFmt: n0, yFmt: n0, series: [{ name: "tier", color: s1, pts: avg }, { name: "očekávaný", color: ink, pts: exp, dash: true, step: true, faint: true }], cursor: f.level, tip: (x) => { const p = nearest(avg, x), e = nearest(exp, x); return `level ${n0(p[0])}<br>průměrný tier ${n1(p[1])}<br>tier lokace ${n0(e[1])}`; } });
    // smrti/h podle pásma
    renderBands(cur, s1);
  }
  function renderBands(curHours, color) {
    const svg = $("chart-bands"), d = S.derived, t = S.t; const bars = [];
    for (let b = 0; b < 10; b += 1) {
      const from = b * 10 + 1, to = b * 10 + 10; const start = d.levelAt[from]; if (start === undefined || start > t) { bars.push({ from, to, v: null }); continue; }
      const end = Math.min(t, d.levelAt[to + 1] ?? Infinity); const hours = Math.max(0, (end - start) / 3.6e6); const deaths = lowerBound(d.deathsByBand[b], end, (x) => x) - lowerBound(d.deathsByBand[b], start - 1, (x) => x);
      bars.push({ from, to, v: hours > 0.05 ? deaths / hours : null, deaths, hours });
    }
    const max = Math.max(5, ...bars.map((x) => x.v ?? 0)); const a = axes(svg, 10, max, () => "", (v) => n0(v)); const bw = (W - M.l - M.r) / 10; let out = a.html;
    bars.forEach((bar, i) => { const x = M.l + i * bw + 3; out += `<text x="${x + (bw - 6) / 2}" y="${H - 10}" text-anchor="middle">${bar.from}–${bar.to}</text>`; if (bar.v === null) return; const y = a.sy(bar.v); out += `<path d="M${x},${H - M.b}V${y + 4}Q${x},${y} ${x + 4},${y}H${x + bw - 10}Q${x + bw - 6},${y} ${x + bw - 6},${y + 4}V${H - M.b}Z" fill="${color}"/>`; if (bar.v > 0) out += `<text x="${x + (bw - 6) / 2}" y="${y - 3}" text-anchor="middle" style="fill:var(--ink-2)">${n1(bar.v)}</text>`; });
    out += `<rect class="hit" x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}" fill="transparent"/>`; svg.innerHTML = out;
    hover(svg, (px) => { const i = Math.floor((px - M.l) / bw); const bar = bars[i]; return bar ? (bar.v === null ? `pásmo ${bar.from}–${bar.to}: zatím nehráno` : `pásmo ${bar.from}–${bar.to}<br>${n1(bar.v)} smrtí/h<br>${bar.deaths} smrtí za ${n1(bar.hours)} h`) : null; });
  }

  // ---------- souhrn a shoda s CLI ----------
  function renderSummary() {
    const sm = window.BalanceSimTraceSummary.summarize(S.trace); if (!sm) { $("summary").textContent = "prázdný záznam"; return; }
    const tl = Object.entries(sm.timeToLevel).filter(([, v]) => v !== null).map(([l, v]) => `L${l} ${n1(v)} h`).join(" · ") || "–";
    const q = Object.entries(sm.drops.byQuality).map(([k, v]) => `${Q_CS[k] ?? k} ${v}`).join(", ");
    const gd = sm.gold;
    $("summary").innerHTML = `<dl class="kv">${kv("Scénář / seed", `${esc(S.trace.scenario?.id)} / ${S.trace.seed}`)}${kv("Délka", `${n1(sm.hours)} h, level ${sm.level}`)}${kv("Zabití / smrtí", `${n0(sm.kills)} / ${n0(sm.deaths)} (${n0(sm.killsPerHour)}/h, ${n1(sm.deathsPerHour)}/h)`)}${kv("Čas do levelu", tl)}${kv("Gold získáno / utraceno / zůstatek", `${n0(gd.earned)} / ${n0(gd.spentTotal)} / ${n0(gd.balance)}`)}${kv("Dropy", `${n0(sm.drops.total)} (${q}), s affixem ${n0(sm.drops.withAffix)}`)}${kv("Kování / upgrady / opravy / tavení", `${sm.crafting.forged} / ${sm.crafting.upgrades} / ${sm.crafting.repairs} / ${sm.crafting.smelts}`)}${kv("Změn cíle", n0(sm.targetChanges))}${kv("Varování", Object.entries(sm.warnings).map(([k, v]) => `${k} ${v}`).join(", ") || "žádná")}${kv("Otisk hry", esc(S.trace.gameFingerprint))}</dl><div id="cliMatch" class="muted" style="margin-top:8px">Shoda s CLI reportem: hledám report.json…</div><label style="display:block;margin-top:6px" class="muted">nebo ručně: <input type="file" id="reportFile" accept=".json"></label>`;
    $("reportFile").addEventListener("change", async (e) => { const file = e.target.files[0]; if (file) { S.report = JSON.parse(await file.text()); showCliMatch(); } });
  }
  async function loadReportFor(source) {
    if (!source || !source.report) { showCliMatch(); return; }
    try { S.report = await (await fetch(source.report, { cache: "no-store" })).json(); } catch (_) { S.report = null; }
    showCliMatch();
  }
  function showCliMatch() {
    const el = $("cliMatch"); if (!el) return; const tr = S.trace;
    const sc = S.report?.scenarios?.find((s) => s.id === tr.scenario?.id); const run = sc?.runs?.find((r) => r.seed === tr.seed);
    if (!run) { el.innerHTML = "Shoda s CLI reportem: report.json pro tento scénář a seed není k dispozici."; return; }
    const diffs = window.BalanceSimTraceSummary.compareToMetrics(window.BalanceSimTraceSummary.summarize(tr), run.metrics);
    el.innerHTML = diffs.length ? `<span class="bad">Shoda s CLI reportem: ${diffs.length} rozdílů</span><br>${diffs.slice(0, 5).map((d) => `${esc(d.field)}: trace ${esc(JSON.stringify(d.trace))} ≠ CLI ${esc(JSON.stringify(d.cli))}`).join("<br>")}` : `<span class="ok">Shoda s CLI reportem: všechna porovnávaná pole jsou shodná</span> (hodiny, level, zabití, smrti, gold, dropy, craft, změny cíle, časy do levelů).`;
    el.dataset.status = diffs.length ? "diff" : "ok";
  }

  // ---------- seznam záznamů a nová simulace ----------
  async function refreshTraces(selectUrl) {
    let list = []; try { list = await (await fetch("/api/traces", { cache: "no-store" })).json(); } catch (_) { return; }
    S.list = list; const sel = $("traceSelect");
    sel.innerHTML = '<option value="">(vyberte)</option>' + list.map((t) => `<option value="${esc(t.url)}">${esc(t.scenario)} · seed ${t.seed} · ${t.detail} · ${n1(t.endHours)} h · level ${t.level}</option>`).join("");
    if (selectUrl) { sel.value = selectUrl; sel.dispatchEvent(new Event("change")); }
  }
  async function loadFromUrl(url) {
    $("runStatus").textContent = "načítám záznam…";
    const trace = await (await fetch(url, { cache: "no-store" })).json(); $("runStatus").textContent = "";
    loadTrace(trace, (S.list || []).find((t) => t.url === url) ?? null);
  }
  async function initCoverage() {
    try {
      const c = await (await fetch("/api/coverage")).json(); const el = $("coverageBanner"); if (!c.stale) return;
      el.hidden = false; el.innerHTML = `⛔ Simulátor je NEAKTUÁLNÍ – hra obsahuje systém, který bot nepoužívá nebo se neměří. Záznamy nejsou měřítkem balancu.<ul>${c.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    } catch (e) { /* bez serveru (soubor otevřený přímo) banner nezobrazujeme */ }
  }
  async function initScenarios() {
    try { const sc = await (await fetch("/api/scenarios")).json(); $("scenarioSelect").innerHTML = sc.map((s) => `<option value="${esc(s.id)}" title="${esc(s.description)}">${esc(s.id)}</option>`).join(""); } catch (_) { $("scenarioSelect").innerHTML = ""; $("runBtn").disabled = true; $("liveBtn").disabled = true; $("runStatus").textContent = "Server vieweru neběží (npm run balance:viewer): nová simulace a živý run nejsou dostupné, soubor trace lze načíst ručně."; }
  }
  async function runSimulation() {
    const body = { scenario: $("scenarioSelect").value, seed: Number($("seedInput").value), detail: $("detailSelect").value };
    $("runBtn").disabled = true; $("runStatus").textContent = "spouštím…";
    const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json(); if (!res.ok) { $("runStatus").textContent = data.error; $("runBtn").disabled = false; return; }
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500)); const job = await (await fetch(`/api/jobs/${data.id}`)).json();
      const last = job.log.trim().split("\n").pop(); $("runStatus").textContent = `běží ${job.seconds} s${last ? " · " + last.trim() : ""}`;
      if (job.status !== "running") { $("runBtn").disabled = false; if (job.status === "done") { $("runStatus").textContent = `hotovo za ${job.seconds} s`; await refreshTraces(); const hit = (S.list || []).find((t) => t.scenario === body.scenario && t.seed === body.seed && t.source.startsWith("viewer-runs")); if (hit) { $("traceSelect").value = hit.url; await loadFromUrl(hit.url); } } else $("runStatus").textContent = "simulace selhala: " + job.log.slice(-300); return; }
    }
  }

  // ---------- živý run ----------
  async function liveCheck() {
    if (!S.trace) return; $("liveBtn").disabled = true; $("liveResult").innerHTML = ""; $("liveStatus").textContent = "spouštím hru v rámečku…";
    try {
      const minutes = Number($("liveMinutes").value) || 20;
      const r = await window.BalanceSimLive.runLive({ trace: S.trace, minutes, container: $("liveFrame"), onProgress: (p) => { $("liveStatus").textContent = `odehráno ${p.minute} / ${p.of} virtuálních minut`; } });
      window.__liveResult = r;
      $("liveStatus").textContent = r.ok ? "hotovo: shoda" : "hotovo: ROZDÍL";
      $("liveResult").innerHTML = `<p class="${r.ok ? "ok" : "bad"}">${r.ok ? "✔ Vykreslená hra a simulace jsou shodné." : "✖ Vykreslená hra se liší od záznamu."}</p><table><tr><th>Co</th><th class="num">živě</th><th class="num">záznam</th><th class="num">shodných</th></tr>${["frames", "events", "ticks"].map((k) => `<tr><td>${{ frames: "snímky stavu", events: "události", ticks: "minisnímky" }[k]}</td><td class="num">${r[k].live}</td><td class="num">${r[k].trace}</td><td class="num">${r[k].identical}</td></tr>`).join("")}</table>${r.frames.firstDiff || r.events.firstDiff || r.ticks.firstDiff ? `<p class="bad">První rozdíl: ${esc(r.frames.firstDiff || r.events.firstDiff || r.ticks.firstDiff)}</p>` : ""}${r.errors.length ? `<p class="bad">Chyby ve hře: ${esc(r.errors.join(" | "))}</p>` : ""}`;
    } catch (e) { $("liveStatus").textContent = "chyba: " + e.message; window.__liveResult = { ok: false, error: e.message }; }
    $("liveBtn").disabled = false;
  }

  // ---------- události ovládání ----------
  function init() {
    $("playBtn").addEventListener("click", () => { if (!S.trace) return; if (S.t >= S.endT) setTime(0); S.playing = true; });
    $("pauseBtn").addEventListener("click", () => { S.playing = false; });
    $("resetBtn").addEventListener("click", () => { S.playing = false; setTime(0); });
    $("stepBtn").addEventListener("click", () => { S.playing = false; stepEvent(1); });
    $("stepBackBtn").addEventListener("click", () => { S.playing = false; stepEvent(-1); });
    $("timeSlider").addEventListener("input", (e) => setTime(Number(e.target.value)));
    for (const b of $("speedGroup").querySelectorAll("button")) b.addEventListener("click", () => { S.speed = b.dataset.speed; for (const o of $("speedGroup").querySelectorAll("button")) o.setAttribute("aria-pressed", String(o === b)); });
    $("traceSelect").addEventListener("change", (e) => { if (e.target.value) loadFromUrl(e.target.value); });
    $("fileInput").addEventListener("change", async (e) => { const file = e.target.files[0]; if (!file) return; try { loadTrace(JSON.parse(await file.text()), null); } catch (err) { alert("Soubor se nepodařilo přečíst: " + err.message); } });
    $("runBtn").addEventListener("click", runSimulation); $("liveBtn").addEventListener("click", liveCheck);
    $("themeBtn").addEventListener("click", () => { const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.dataset.theme = dark ? "light" : "dark"; markDirty(); });
    document.addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return; if (e.code === "Space") { e.preventDefault(); S.playing = !S.playing; } else if (e.code === "ArrowRight") stepEvent(1); else if (e.code === "ArrowLeft") stepEvent(-1); });
    initCoverage(); initScenarios().then(() => refreshTraces()); requestAnimationFrame(loop);
    const q = new URLSearchParams(location.search).get("trace"); if (q) refreshTraces().then(() => loadFromUrl(q));
    window.__viewer = { S, loadTrace, setTime, render, summarize: () => window.BalanceSimTraceSummary.summarize(S.trace) };
  }
  init();
})();
