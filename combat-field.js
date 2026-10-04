"use strict";

/* ==========================================================================
   Prototype 0.9 — Vlnové bojiště (vykreslení)
   Čistě vizuální vrstva nad vlnovým bojem v app.js. Nepočítá nic z herní
   logiky — jen kreslí geometrické tvary, efekty a HUD podle událostí, které
   mu app.js posílá (beginWave / hit / kill / playerStruck / hud / setLoot).
   Pohyb hráče a efekty jsou kosmetické; o tom, kdo dostane zásah, rozhoduje
   výhradně app.js. Běží rAF jen když je stránka Boj vidět.
   ========================================================================== */
const CombatField = (() => {
  // Tvar + barva + velikost nepřítele podle jeho typu (víc hran = silnější).
  const TYPE_VIS = {
    common:   { sides: 3, col: "#2aa38f", r: 12 },
    uncommon: { sides: 4, col: "#3b74c9", r: 13 },
    rare:     { sides: 5, col: "#8a4fd0", r: 14 },
    elite:    { sides: 6, col: "#c2791f", r: 15 },
    boss:     { sides: 6, col: "#d6403a", r: 24 },
  };
  const COL = { you: "#b8542f", xp: "#3f7d4e", gold: "#c79a3a", rare: "#3b74c9", t1: "#2b2620", t2: "#6b6258", t3: "#9a9086", crit: "#c7860f" };

  let cv, ctx, reduce = false, mounted = false, visible = false, rafId = null;
  let W = 0, H = 0, dpr = 1, spot = { x: 0, y: 0, r: 0 };
  let vis = TYPE_VIS.common;          // aktuální vzhled nepřítele
  let dots = new Map();               // id -> dot
  let you = { x: 0, y: 0, r: 9, px: 0, py: 0, hit: 0 };
  let targetId = null;
  let parts = [], dmgs = [], floats = [], rings = [], shards = [], trail = [];
  let hudState = { playerHpPct: 100, mode: "ready", waveKilled: 0, waveTotal: 0, respawnLeftMs: 0, respawnTotalMs: 1, enemyName: "" };
  let rewardLog = [], lootTable = [];
  let last = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const $ = (id) => document.getElementById(id);

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    if (W === 0 || H === 0) return;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spot = { x: W / 2, y: H / 2, r: Math.min(W, H) * 0.4 };
    if (you.x === 0 && you.y === 0) { you.x = W / 2; you.y = H / 2; }
  }
  function spotPoint() { const a = rnd(0, 6.28), d = Math.sqrt(Math.random()) * spot.r * 0.92; return { x: spot.x + Math.cos(a) * d, y: spot.y + Math.sin(a) * d }; }

  function mount() {
    if (mounted) return;
    cv = $("combatCanvas"); if (!cv) return;
    ctx = cv.getContext("2d");
    reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mounted = true;
    try { new ResizeObserver(resize).observe(cv); } catch (_) { window.addEventListener("resize", resize); }
    resize();
    // info panel (drop a šance)
    const info = $("cfInfo"), drawer = $("cfDrawer"), drClose = $("cfDrClose");
    if (info && drawer) {
      info.addEventListener("click", () => { const open = drawer.classList.toggle("open"); info.setAttribute("aria-pressed", String(open)); if (open) renderDrawer(); });
      if (drClose) drClose.addEventListener("click", closeDrawer);
      cv.addEventListener("pointerdown", () => { if (drawer.classList.contains("open")) closeDrawer(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
    }
  }
  function closeDrawer() { const d = $("cfDrawer"), i = $("cfInfo"); if (d) d.classList.remove("open"); if (i) i.setAttribute("aria-pressed", "false"); }

  function setVisible(on) {
    visible = on;
    if (on) { mount(); resize(); if (rafId === null) { last = performance.now(); rafId = requestAnimationFrame(loop); } }
    else if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ---- události z app.js -----------------------------------------------
  function beginWave(enemyType, ids) {
    vis = TYPE_VIS[enemyType] || TYPE_VIS.common;
    dots = new Map(); shards = []; parts = [];
    // Pozice se přiřadí líně v update() až je plátno změřené (boj může začít i mimo stránku Boj).
    (ids || []).forEach((id, k) => { dots.set(id, { x: null, y: null, born: -k * 0.04, hit: 0, rot: rnd(0, 6.28), jx: rnd(0, 6.28), dying: 0 }); });
    targetId = null;
    if ($("cfDrawer") && $("cfDrawer").classList.contains("open")) renderDrawer();
  }
  function clearWave() { dots.forEach((d) => { if (d.dying <= 0) d.dying = 0.001; }); }
  function hit(id, crit, dmg) {
    const d = dots.get(id); if (!d) return;
    targetId = id;
    if (!visible || d.x == null) return;        // mimo stránku Boj se efekty nekreslí (a nehromadí)
    d.hit = 0.2; boom(d.x, d.y); dmgPop(d.x, d.y - vis.r, dmg, crit);
  }
  function kill(id, loot) {
    const d = dots.get(id);
    if (d && visible && d.x != null) {
      shatter(d); boom(d.x, d.y); rings.push({ x: d.x, y: d.y, life: 0, max: 0.4, r: vis.r + 16, col: vis.col });
      if (loot && loot.xp) floatTxt(d.x, d.y - vis.r, "+" + loot.xp, COL.xp);
      if (loot && loot.gold) lootPop(d.x - 7, d.y, "gold", COL.gold);
      if (loot && loot.item) lootPop(d.x + 7, d.y, "item", COL.rare);
    }
    if (loot) pushReward(loot);                 // log odměn se drží i mimo stránku
    dots.delete(id);
    if (targetId === id) targetId = null;
  }
  function playerStruck() { if (visible) you.hit = 0.22; }
  function hud(vm) { hudState = Object.assign(hudState, vm); }
  function setLoot(list) { lootTable = list || []; if ($("cfDrawer") && $("cfDrawer").classList.contains("open")) renderDrawer(); }

  // ---- efekty ----------------------------------------------------------
  function lootPop(x, y, kind, col) { parts.push({ x, y, vx: rnd(-14, 14), vy: rnd(-52, -34), life: 0, max: 1.1, kind, col }); }
  function floatTxt(x, y, txt, col) { floats.push({ x, y, vy: -40, life: 0, max: 0.85, txt, col }); }
  function boom(x, y) { const n = reduce ? 3 : 6; for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), s = rnd(45, 120); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.32, kind: "spark", col: vis.col }); } }
  function dmgPop(x, y, val, crit) { dmgs.push({ x: x + rnd(-5, 5), y: y - 6, vy: -42, life: 0, max: crit ? 1.05 : 0.8, val, crit }); }
  function shatter(d) {
    const sides = vis.sides, r = vis.r;
    for (let i = 0; i < sides; i++) {
      const a1 = d.rot - Math.PI / 2 + i * 2 * Math.PI / sides, a2 = d.rot - Math.PI / 2 + (i + 1) * 2 * Math.PI / sides;
      const x1 = d.x + Math.cos(a1) * r, y1 = d.y + Math.sin(a1) * r, x2 = d.x + Math.cos(a2) * r, y2 = d.y + Math.sin(a2) * r;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dir = Math.atan2(my - d.y, mx - d.x);
      shards.push({ x: mx, y: my, ang: dir, sp: rnd(55, 120), len: Math.hypot(x2 - x1, y2 - y1), rot: Math.atan2(y2 - y1, x2 - x1), vr: rnd(-7, 7), life: 0, max: 0.55, col: vis.col });
    }
  }

  // ---- reward log + drop drawer ---------------------------------------
  function pushReward(loot) {
    const bits = []; if (loot.xp) bits.push("+" + loot.xp + " XP"); if (loot.gold) bits.push("+" + loot.gold + " zl"); if (loot.item) bits.push("předmět");
    if (!bits.length) return;
    rewardLog.unshift({ txt: bits.join(" · "), col: loot.item ? COL.rare : (loot.gold ? COL.gold : COL.xp) });
    if (rewardLog.length > 5) rewardLog.pop();
    const el = $("cfLogRows"); if (el) el.innerHTML = rewardLog.map((r) => `<div class="cf-rl-row"><span class="sq" style="background:${r.col}"></span>${r.txt}</div>`).join("");
  }
  function ico(col, shape) {
    if (shape === "coin") return `<span style="width:17px;height:17px;border-radius:50%;background:${col}"></span>`;
    if (shape === "sq") return `<span style="width:15px;height:15px;border-radius:3px;background:${col}"></span>`;
    return `<span style="width:13px;height:13px;background:${col};transform:rotate(45deg);border-radius:2px"></span>`;
  }
  function renderDrawer() {
    const body = $("cfDrawerBody"); if (!body) return;
    body.innerHTML = `<p class="cf-dr-title">${ico(vis.col, "dia")} Drop — ${hudState.enemyName || "nepřítel"}</p>`
      + `<p class="cf-dr-sub">Co z tohoto nepřítele padá a jaká je šance.</p>`
      + (lootTable.length ? lootTable.map((l) => `<div class="cf-dr-row"><span class="cf-dr-ic">${ico(l.col || COL.t3, l.shape || "sq")}</span><span class="cf-dr-nm">${l.name}</span><span class="cf-dr-pct">${l.val}</span></div>`).join("")
        : `<p class="cf-dr-sub">Žádná data.</p>`);
  }

  // ---- smyčka ----------------------------------------------------------
  function loop(now) {
    if (!visible) { rafId = null; return; }
    let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05;
    update(dt); draw(); updateHudDom();
    rafId = requestAnimationFrame(loop);
  }
  function update(dt) {
    dots.forEach((d) => {
      if (d.x == null) { if (spot.r > 0) { const p = spotPoint(); d.x = p.x; d.y = p.y; } else return; }
      d.born = Math.min(1, d.born + dt * 6); d.hit = Math.max(0, d.hit - dt); d.rot += dt * 0.3;
      d.jx += dt * 2; d.x += Math.cos(d.jx) * 4 * dt; d.y += Math.sin(d.jx * 1.3) * 4 * dt;
    });
    // hráč: dojde k cílovému tvaru (poslední zasažený), jinak drží spot
    you.px = you.x; you.py = you.y; you.hit = Math.max(0, you.hit - dt);
    let tgt = targetId !== null ? dots.get(targetId) : null;
    if (!tgt) { let bd = 1e9; dots.forEach((d) => { if (d.x == null) return; const dd = Math.hypot(d.x - you.x, d.y - you.y); if (dd < bd) { bd = dd; tgt = d; } }); }
    if (tgt) { const dx = tgt.x - you.x, dy = tgt.y - you.y, d = Math.hypot(dx, dy) || 1, reach = you.r + vis.r + 6; if (d > reach) { const sp = 165; you.x += dx / d * sp * dt; you.y += dy / d * sp * dt; } }
    else { const dx = spot.x - you.x, dy = spot.y - you.y, d = Math.hypot(dx, dy) || 1; if (d > 4) { you.x += dx / d * 40 * dt; you.y += dy / d * 40 * dt; } }
    if (Math.hypot(you.x - you.px, you.y - you.py) > 1.5) trail.push({ x: you.x, y: you.y, life: 0 });
    for (let i = trail.length - 1; i >= 0; i--) { trail[i].life += dt; if (trail[i].life > 0.4) trail.splice(i, 1); }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind !== "spark") p.vy += 46 * dt; if (p.life >= p.max) parts.splice(i, 1); }
    for (let i = dmgs.length - 1; i >= 0; i--) { const p = dmgs[i]; p.life += dt; p.y += p.vy * dt; p.vy += 34 * dt; if (p.life >= p.max) dmgs.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) { const p = floats[i]; p.life += dt; p.y += p.vy * dt; p.vy += 20 * dt; if (p.life >= p.max) floats.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].life += dt; if (rings[i].life >= rings[i].max) rings.splice(i, 1); }
    for (let i = shards.length - 1; i >= 0; i--) { const s = shards[i]; s.life += dt; s.x += Math.cos(s.ang) * s.sp * dt; s.y += Math.sin(s.ang) * s.sp * dt; s.sp *= (1 - dt * 2.4); s.rot += s.vr * dt; if (s.life >= s.max) shards.splice(i, 1); }
  }
  function polyPath(x, y, r, sides, rot) { ctx.beginPath(); for (let i = 0; i < sides; i++) { const a = rot - Math.PI / 2 + i * 2 * Math.PI / sides; ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
  function rrect(x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function draw() {
    if (!ctx || W === 0) return;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(spot.x, spot.y, spot.r, 0, 6.28); ctx.fillStyle = "rgba(184,84,47,.035)"; ctx.fill();
    ctx.setLineDash([4, 7]); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(184,84,47,.14)"; ctx.stroke(); ctx.setLineDash([]);
    rings.forEach((r) => { const t = r.life / r.max; ctx.globalAlpha = (1 - t) * 0.9; ctx.lineWidth = 3; ctx.strokeStyle = r.col; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * t, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; });
    shards.forEach((s) => { const t = 1 - s.life / s.max; ctx.globalAlpha = t; ctx.strokeStyle = s.col; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.beginPath(); ctx.moveTo(-s.len / 2, 0); ctx.lineTo(s.len / 2, 0); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; });
    dots.forEach((d) => {
      if (d.x == null) return;
      const r = vis.r * Math.max(0, d.born);
      ctx.save(); ctx.lineJoin = "round"; ctx.shadowColor = vis.col; ctx.shadowBlur = reduce ? 0 : 7;
      polyPath(d.x, d.y, r, vis.sides, d.rot);
      if (d.hit > 0) { ctx.globalAlpha = 0.22 * (d.hit / 0.2); ctx.fillStyle = vis.col; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.lineWidth = 2.6; ctx.strokeStyle = d.hit > 0 ? "#fff" : vis.col; ctx.stroke(); ctx.restore();
    });
    // cílový kroužek
    const tgt = targetId !== null ? dots.get(targetId) : null;
    if (tgt && tgt.x != null) { ctx.lineWidth = 2; ctx.strokeStyle = "rgba(184,84,47,.5)"; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(tgt.x, tgt.y, vis.r + 8, 0, 6.28); ctx.stroke(); ctx.setLineDash([]); }
    trail.forEach((t) => { ctx.globalAlpha = (1 - t.life / 0.4) * 0.4; ctx.fillStyle = COL.you; ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; });
    ctx.save(); ctx.shadowColor = COL.you; ctx.shadowBlur = reduce ? 0 : 8;
    if (you.hit > 0) { ctx.beginPath(); ctx.arc(you.x, you.y, you.r + 3 + you.hit * 8, 0, 6.28); ctx.fillStyle = "rgba(176,64,64,.18)"; ctx.fill(); }
    ctx.beginPath(); ctx.arc(you.x, you.y, you.r, 0, 6.28); ctx.fillStyle = COL.you; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.restore();
    parts.forEach((p) => { const t = 1 - p.life / p.max; if (p.kind === "spark") { ctx.globalAlpha = t; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 2.8 * t + 0.7, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; } else { ctx.globalAlpha = Math.min(1, t * 1.7); drawLoot(p); ctx.globalAlpha = 1; } });
    floats.forEach((p) => { const t = 1 - p.life / p.max; ctx.globalAlpha = Math.min(1, t * 1.8); ctx.textAlign = "center"; ctx.fillStyle = p.col; ctx.font = "700 13px Inter,sans-serif"; ctx.fillText(p.txt, p.x, p.y); ctx.globalAlpha = 1; });
    dmgs.forEach((p) => { const t = 1 - p.life / p.max; ctx.globalAlpha = Math.min(1, t * 1.8); ctx.textAlign = "center"; if (p.crit) { ctx.fillStyle = COL.crit; ctx.font = "800 22px Inter,sans-serif"; ctx.fillText(p.val + "!", p.x, p.y); } else { ctx.fillStyle = COL.t1; ctx.font = "700 16px Inter,sans-serif"; ctx.fillText(p.val, p.x, p.y); } ctx.globalAlpha = 1; });
  }
  function drawLoot(p) { ctx.fillStyle = p.col; if (p.kind === "gold") { ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 6.28); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(p.x - 2, p.y - 2, 2.2, 0, 6.28); ctx.fill(); } else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(0.78); ctx.fillRect(-5.5, -5.5, 11, 11); ctx.restore(); } }

  function updateHudDom() {
    const wave = $("cfWave"); if (wave) wave.textContent = hudState.mode === "dead" ? "Postava padla" : (hudState.mode === "searching" ? "Respawn…" : (hudState.mode === "fighting" ? `Vlna · ${Math.max(0, hudState.waveTotal - hudState.waveKilled)}` : "Připraveno"));
    const lab = $("cfRbLabel"), right = $("cfRbRight"), fill = $("cfRbFill"); if (!lab || !fill) return;
    let pct = 0, col = COL.you;
    if (hudState.mode === "searching" || hudState.mode === "dead") { lab.textContent = hudState.mode === "dead" ? "Návrat za" : "Další vlna za"; const s = Math.max(0, hudState.respawnLeftMs / 1000); if (right) right.textContent = s.toFixed(1) + " s"; pct = hudState.respawnTotalMs ? 1 - hudState.respawnLeftMs / hudState.respawnTotalMs : 0; col = "#c79a3a"; }
    else if (hudState.mode === "fighting") { lab.textContent = "Vlna — zabito"; if (right) right.textContent = hudState.waveKilled + " / " + hudState.waveTotal; pct = hudState.waveTotal ? hudState.waveKilled / hudState.waveTotal : 0; col = COL.you; }
    else { lab.textContent = "Připraveno"; if (right) right.textContent = ""; pct = 0; }
    fill.style.width = Math.max(0, Math.min(1, pct)) * 100 + "%"; fill.style.background = col;
  }

  return { mount, setVisible, beginWave, clearWave, hit, kill, playerStruck, hud, setLoot };
})();
if (typeof window !== "undefined") window.CombatField = CombatField;
