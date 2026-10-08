// Automatický hráč (běží uvnitř stránky hry, volá jen skutečné herní funkce). Žádné umělé staty/itemy/materiály.
// Pravidla bota jsou popsána v tools/balance-sim/README.md (sekce „Pravidla automatického hráče“).
(function () {
  const SLOTS = ["weapon", "armor", "helmet", "pants", "gloves", "boots", "charm", "wings"];
  const B = (window.__bot = {});
  const cfg = (B.cfg = { cycleMs: 600000, foodTarget: 12, planSlots: 2, horizonH: 5, switchGain: 1.15, maxUpgrade: 6 });
  const M = (B.m = { dropsByQ: {}, dropsByTier: {}, dropsAffixed: 0, dropsByQAffix: {}, dropsTotal: 0, dropLog: [], matGain: {}, matGainByQ: {}, smeltGain: {}, spend: { forge: 0, upgrade: 0, repair: 0, food: 0 }, income: { sales: 0 },
    forge: { ok: 0, fail: 0, byTier: {} }, upgrade: { ok: 0, fail: 0 }, repairs: 0, smelts: 0, scrollsLearned: 0, scrollsGot: 0, sold: 0, targetChanges: [], targetChangeCount: 0, firstDrop: {}, affixDropsByTier: {}, affixDropsByKind: { prefix: 0, suffix: 0 }, gearTier: {}, gearTierAny: {}, levelAt: {}, recipeFirst: {}, recipeLevelOk: {}, blocked: [], targetTime: {}, targetKills: {}, deathsByTarget: {}, notes: [] });
  const gold = () => state.carriedGold + state.bankGold;
  const rankOf = (q) => qualityRank(q);

  // --- trace: strukturovaný záznam pro Simulation Viewer. Jen čte stav hry, nevolá Math.random a nic nemění;
  //     výsledek simulace je s trace i bez něj bit po bitu stejný (hlídá tests/viewer.js). ---
  const WARN = { minDeaths: 5, deathsPerKill: 0.5, spiralCycles: 3 }; // opakované smrti: aspoň 5 smrtí za zásah bota a ≥ 0,5 smrti na zabití; 3 zásahy po sobě = smrtící spirála
  const T = (B.trace = { on: true, detail: "standard", events: [], ticks: [], frames: [], hist: [], streak: 0, lastKills: 0, lastDeaths: 0, lastMat: {}, lastWhy: null, lastDecision: null });
  B.setTrace = (o) => Object.assign(T, o);
  const nowMs = () => Math.round(performance.now());
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };
  const emit = (type, data) => { if (T.on) T.events.push(Object.assign({ t: nowMs(), type }, data)); };
  const affixName = (ref) => (ref ? safe(() => getAffix(ref.affixId)?.displayName ?? ref.affixId, ref.affixId) : null);
  const itemInfo = (it) => (it ? safe(() => ({ name: it.baseName || it.name, tier: it.itemTier ?? findTemplateById(it.templateId)?.itemTier ?? null, quality: it.quality, slot: it.slot, upgrade: it.upgradeLevel ?? 0, prefix: affixName(it.prefix), suffix: affixName(it.suffix), durability: it.durability ?? null })) : null);
  const enemyName = (id) => ENEMIES[id]?.name ?? id ?? null;

  // --- hooky pro statistiku (volají originál) ---
  const _rec = recordItemAcquired; window.recordItemAcquired = function (item) { if (!item.craftedAt) { emit("drop", { item: itemInfo(item), enemy: state.currentEnemyId, level: state.level }); M.dropsTotal++; { const qa = (M.dropsByQAffix[item.quality] = M.dropsByQAffix[item.quality] || { total: 0, affixed: 0, prefix: 0, suffix: 0 }); qa.total++; if (item.prefix || item.suffix) qa.affixed++; if (item.prefix) qa.prefix++; if (item.suffix) qa.suffix++; } M.dropsByQ[item.quality] = (M.dropsByQ[item.quality] || 0) + 1; const t = item.itemTier || 0; M.dropsByTier[t] = (M.dropsByTier[t] || 0) + 1; if (item.prefix || item.suffix) M.dropsAffixed++; for (const kind of ["prefix", "suffix"]) { const ref = item[kind]; if (!ref) continue; const tier = getAffix(ref.affixId)?.tier ?? 0; M.affixDropsByTier[tier] = (M.affixDropsByTier[tier] || 0) + 1; M.affixDropsByKind[kind]++; } if (!M.firstDrop[item.quality]) M.firstDrop[item.quality] = { tHours: +(performance.now() / 3.6e6).toFixed(3), level: state.level, tier: item.itemTier ?? null, name: item.baseName || item.name, enemy: state.currentEnemyId, affix: !!(item.prefix || item.suffix) }; if (rankOf(item.quality) >= 3) M.dropLog.push({ tHours: performance.now() / 3.6e6, quality: item.quality, tier: item.itemTier, name: item.baseName || item.name, affix: !!(item.prefix || item.suffix), enemy: state.currentEnemyId }); } return _rec.apply(this, arguments); };
  const _am = addMaterial; window.addMaterial = function (id, q, enemyId, quality) { const before = state.materials[stackKey(id, quality ?? (MATERIALS[id]?.defaultQuality ?? "common"))] ?? 0; const r = _am.apply(this, arguments); M.matGain[id] = (M.matGain[id] || 0) + Number(q || 0); return r; };


  const _lvl = applyLevelUps; window.applyLevelUps = function () { const l0 = state.level; const r = _lvl.apply(this, arguments); for (let l = l0 + 1; l <= state.level; l++) { M.levelAt[l] = +(performance.now() / 3.6e6).toFixed(3); emit("levelup", { level: l }); } return r; };
  const _ak = awardKill; window.awardKill = function (e) { M.targetKills[e.id] = (M.targetKills[e.id] || 0) + 1; if (T.detail === "full") emit("kill", { enemy: e.id }); return _ak.apply(this, arguments); };
  const _dp = defeatPlayer; window.defeatPlayer = function () { const was = state.phase; const gl0 = state.stats.goldLostToDeath; const r = _dp.apply(this, arguments); if (was !== "dead") { M.deathsByTarget[state.currentEnemyId] = (M.deathsByTarget[state.currentEnemyId] || 0) + 1; emit("death", { enemy: state.currentEnemyId, level: state.level, goldLost: state.stats.goldLostToDeath - gl0 }); } return r; };

  // --- hodnocení výbavy: použije skutečné getPlayerStats (affixy, sety) ---
  const combatScore = (s) => { const interval = Math.max(650, CONFIG.playerAttackMs / (1 + s.attackSpeed / 100)); const avg = (s.minDamage + s.maxDamage) / 2; const dps = avg * (1 + s.critChance * (1 + (s.affixTotals?.crit_damage ?? 0) / 100)) / interval; return Math.sqrt(dps * (s.maxHp + s.defense * 25)); };
  const scoreWith = (equipment) => combatScore(getPlayerStats(equipment));
  function equipBest() {
    let changed = true, n = 0;
    while (changed && n++ < 20) {
      changed = false;
      const cur = scoreWith(state.equipment);
      let best = null;
      for (const item of state.inventory) { if (!SLOT_META[item.slot] || (item.durability ?? 100) <= 0) continue; const alt = { ...state.equipment, [item.slot]: item }; const sc = scoreWith(alt); if (sc > cur * 1.002 && (!best || sc > best.sc)) best = { item, sc }; }
      if (best) { const prev = state.equipment[best.item.slot]; const info = itemInfo(best.item); equipItem(best.item.id); emit("equip", { slot: best.item.slot, from: itemInfo(prev), to: info, scoreFrom: +cur.toFixed(2), scoreTo: +best.sc.toFixed(2) }); changed = true; }
    }
  }

  // --- plán craftingu: nejvyšší odemčený tier, normální recepty -1/-2, první 2 neosazené sloty ---
  const normalRecipes = FORGE_RECIPES.filter((r) => /^forge-t\d+-[a-z]+-[12]$/.test(r.id));
  function bestRecipeFor(slot) {
    const c = normalRecipes.filter((r) => findTemplateById(r.templateId)?.slot === slot && state.level >= (r.requiredLevel ?? 1));
    if (!c.length) return null; const maxT = Math.max(...c.map((r) => r.tier)); return c.find((r) => r.tier === maxT);
  }
  const slotTier = (slot) => { const it = state.equipment[slot]; return it ? (it.itemTier ?? findTemplateById(it.templateId)?.itemTier ?? 0) : -1; };
  function plan() {
    const out = [];
    for (const slot of SLOTS) { const r = bestRecipeFor(slot); if (!r) continue; if (slotTier(slot) >= r.tier) continue; out.push(r); if (out.length >= cfg.planSlots) break; }
    return out;
  }
  function planNeeds(recipes) {
    const need = {}; let g = 0;
    for (const r of recipes) { g += r.gold; for (const m of r.materials) need[m.id] = (need[m.id] || 0) + m.qty; }
    const deficit = {}; for (const [id, q] of Object.entries(need)) { let have = 0; for (const qq of QUALITY_IDS) have += materialQuantity(id, qq); if (q > have) deficit[id] = q - have; }
    return { need, deficit, gold: g };
  }

  // --- odhad cíle (analytický; slouží jen k výběru, výsledky měří skutečný běh) ---
  function evalEnemy(e, s) {
    const avg = (s.minDamage + s.maxDamage) / 2, st = { ...s, hp: s.maxHp * 0.7 };
    const hit = content100Damage({ damage: avg, critical: false, stats: st, enemy: e, targetHp: e.maxHp, kills: 0 });
    const crit = content100Damage({ damage: avg, critical: true, stats: st, enemy: e, targetHp: e.maxHp, kills: 0 });
    const dmg = hit * (1 - s.critChance) + crit * s.critChance, t = s.affixTotals ?? {};
    const interval = Math.max(650, CONFIG.playerAttackMs / (1 + s.attackSpeed / 100));
    const ttk = Math.ceil(e.maxHp / Math.max(1, dmg)) * interval / 1000;
    const attackers = Math.min(e.type === "boss" ? CONFIG.waveSizeBoss : CONFIG.waveSize, CONFIG.waveMeleeCount);
    const resist = e.element ? t[`${e.element}_resistance`] ?? 0 : 0;
    const perHit = Math.max(1, Math.round((attackers * (e.minDamage + e.maxDamage) / 2 - s.defense) * Math.max(0, 1 + (t.damage_taken ?? 0) / 100) * Math.max(0, 1 - resist / 100))) * (1 - Math.min(.35, (t.dodge_chance ?? 0) / 100));
    const drain = ttk * perHit / (CONFIG.enemyAttackMs / 1000);
    const heal = s.maxHp * CONFIG.betweenFightHealPercent + (t.heal_on_kill ?? 0) + (t.hp_regen ?? 0) * ttk;
    const size = e.type === "boss" ? CONFIG.waveSizeBoss : CONFIG.waveSize;
    const cd = Math.max(0.75, CONFIG.waveRespawnMs / 1000 + (t.search_time ?? 0)) / size;
    const perKillSec = ttk + cd;
    let killsPerH, deathsPerH = 0;
    if (drain <= heal) killsPerH = 3600 / perKillSec;
    else if (s.maxHp / (drain - heal) < 1.2) { killsPerH = 0; deathsPerH = 3600 / (ttk + CONFIG.playerRespawnMs / 1000); }
    else { const n = s.maxHp / (drain - heal); const life = n * perKillSec + CONFIG.playerRespawnMs / 1000; killsPerH = 3600 * n / life; deathsPerH = 3600 / life; }
    return { killsPerH, deathsPerH, ttk, drain, heal };
  }
  function xpPerKill(e) { return Math.round(e.xp * (1 + (getPlayerStats().affixTotals?.xp_gain ?? 0) / 100)); }
  function matRates(e, killsPerH) { const r = {}; for (const d of e.materialDrops ?? []) { const q = Array.isArray(d.quantity) ? (d.quantity[0] + d.quantity[1]) / 2 : 1; r[d.templateId] = (r[d.templateId] || 0) + d.chance * q * killsPerH; } return r; }
  function pickTarget() {
    const s = getPlayerStats(); const p = plan(); const nd = planNeeds(p).deficit; const H = cfg.horizonH;
    const xpNeed = state.level >= 100 ? 1e12 : xpNeeded();
    const tierNow = Math.min(10, Math.ceil(state.level / 10));
    let best = null; const rows = [];
    for (const e of Object.values(ENEMIES)) {
      if ((e.itemTier ?? 1) > tierNow + 1) continue;
      const ev = evalEnemy(e, s); const xpk = xpPerKill(e); const xpScore = Math.min(1, ev.killsPerH * xpk * H / xpNeed);
      const rates = matRates(e, ev.killsPerH); const ids = Object.keys(nd); let matScore = 0;
      if (ids.length) { for (const id of ids) matScore += Math.min(1, (rates[id] || 0) * H / nd[id]); matScore /= ids.length; }
      const score = xpScore + matScore; rows.push({ id: e.id, score, xpScore, matScore, dph: ev.deathsPerH, kph: ev.killsPerH, xph: ev.killsPerH * xpk });
      if (!best || score > best.score) best = { id: e.id, score, ev };
    }
    return { best, rows, plan: p.map((r) => r.id), deficit: nd };
  }
  function setTarget(id, why, detail) {
    const e = ENEMIES[id]; if (!e || state.currentEnemyId === id && state.run.targetEnemyId === id && state.running) return;
    const from = state.run.targetEnemyId ?? null;
    if (state.activeLocationId !== e.locationId) { enterLocation(e.locationId); emit("location", { location: e.locationId, name: LOCATIONS[e.locationId]?.name ?? null }); }
    chooseTarget(id); M.targetChangeCount++; T.lastWhy = why;
    emit("target", { from, fromName: enemyName(from), to: id, toName: e.name, location: e.locationId, why, detail: detail ?? null });
    if (M.targetChanges.length < 400) M.targetChanges.push({ tHours: +(performance.now() / 3.6e6).toFixed(3), level: state.level, from, to: id, why, detail: detail ?? null });
  }

  // --- nákupy / kování / opravy ---
  function withdraw(n) { n = Math.floor(n); if (n <= 0 || state.bankGold <= 0) return; elements.bankAmount.value = String(Math.min(n, state.bankGold)); bankTransfer("withdraw"); }
  function ensureCarried(n) { if (state.carriedGold < n) withdraw(n - state.carriedGold); return state.carriedGold >= n; }
  function depositAll() { if (state.carriedGold > 0) bankTransfer("deposit", true); }
  function shop() {
    // 1) svitky
    for (const sc of [...state.affixScrolls]) { const before = state.knownAffixes.length; learnScroll(sc.instanceId); if (state.knownAffixes.length > before) { M.scrollsLearned++; const k = state.knownAffixes[state.knownAffixes.length - 1]; emit("learn", { affix: affixName({ affixId: typeof k === "string" ? k : (k.affixId ?? k.id) }) }); } }
    // 2) výbava
    equipBest();
    // 3) opravy (jen gold)
    for (const slot of SLOTS) { const it = state.equipment[slot]; if (!it) continue; const c = repairCost(it); if (c.missing >= 24 && gold() - c.gold >= cfg.foodTarget * FOOD_CONFIG.price) { ensureCarried(c.gold); const g0 = gold(); ui.smithItemId = it.id; doRepair(); if (gold() < g0) { M.spend.repair += g0 - gold(); M.repairs++; emit("repair", { slot, item: itemInfo(it), missing: c.missing, gold: g0 - gold() }); } } }
    // 4) jídlo
    const savingFor = planNeeds(plan()).gold; // zlato na plánované kování má přednost před jídlem
    if (state.food < cfg.foodTarget) { const n = Math.min(cfg.foodTarget - state.food, Math.floor(Math.max(0, gold() - savingFor) / FOOD_CONFIG.price)); if (n > 0) { ensureCarried(n * FOOD_CONFIG.price); const g0 = state.carriedGold; buyFood(n); M.spend.food += g0 - state.carriedGold; emit("food", { n, gold: g0 - state.carriedGold }); } }
    // 5) kování podle plánu
    for (let guard = 0; guard < 4; guard++) {
      const p = plan(); if (!p.length) break; let did = false;
      for (const r of p) {
        const reqs = requirementsFor(r); if (!hasRequirements(reqs) || gold() < r.gold || inventoryFreeSlots() === 0) continue;
        ensureCarried(r.gold); const inv0 = state.inventory.length, fs0 = state.smith.serial, g0 = state.carriedGold; ui.smithRecipeId = r.id; ui.smithPrefixId = ""; ui.smithSuffixId = ""; doForge();
        if (state.carriedGold < g0) { M.spend.forge += g0 - state.carriedGold; const ok = state.inventory.length > inv0; (ok ? M.forge.ok++ : M.forge.fail++); M.forge.byTier[r.tier] = (M.forge.byTier[r.tier] || 0) + (ok ? 1 : 0); emit("forge", { recipe: r.id, tier: r.tier, ok, gold: g0 - state.carriedGold, item: ok ? itemInfo(state.inventory[state.inventory.length - 1]) : null }); did = true; equipBest(); break; }
      }
      if (!did) break;
    }
    // 6) upgrady vybavy (po kování; nesmí zablokovat plán)
    const nd = planNeeds(plan()).deficit;
    const reserve = cfg.foodTarget * FOOD_CONFIG.price;
    for (let pass = 0; pass < 12; pass++) {
      const cands = SLOTS.map((s) => state.equipment[s]).filter(Boolean).filter((it) => (it.upgradeLevel ?? 0) < cfg.maxUpgrade).sort((a, b) => (a.upgradeLevel ?? 0) - (b.upgradeLevel ?? 0));
      let did = false;
      for (const it of cands) {
        const c = upgradeCost(it); const reqs = c.materials.map((m) => ({ ...m, quality: bestMaterialQuality(m.id, m.qty) }));
        if (!hasRequirements(reqs) || gold() - c.gold < reserve) continue;
        if (c.materials.some((m) => nd[m.id])) continue; // materiál je potřeba pro plán kování
        ensureCarried(c.gold); const g0 = state.carriedGold; ui.smithItemId = it.id; const lv0 = it.upgradeLevel ?? 0; doUpgrade();
        if (state.carriedGold < g0) { M.spend.upgrade += g0 - state.carriedGold; const now = Object.values(state.equipment).filter(Boolean).find((x) => x.id === it.id); ((now?.upgradeLevel ?? 0) > lv0 ? M.upgrade.ok++ : M.upgrade.fail++); emit("upgrade", { item: itemInfo(now ?? it), from: lv0, to: now?.upgradeLevel ?? lv0, ok: (now?.upgradeLevel ?? 0) > lv0, gold: g0 - state.carriedGold }); did = true; break; }
      }
      if (!did) break;
    }
    // 7) prodej / tavení nevybaveného (neuzamčeného)
    const deficit = planNeeds(plan()).deficit;
    const sellIds = [];
    for (const it of [...state.inventory]) {
      if (it.isLocked || it.isFavorite) continue;
      const hasAffix = !!(it.prefix || it.suffix); const sm = smeltYield(it);
      if (hasAffix || deficit[sm.materialId]) { const before = { ...state.materials }; const info = itemInfo(it); ui.smithItemId = it.id; doSmelt(); M.smelts++; const gained = {}; for (const k of Object.keys(state.materials)) { const d = state.materials[k] - (before[k] || 0); if (d > 0) { M.smeltGain[k] = (M.smeltGain[k] || 0) + d; gained[k] = d; } } emit("smelt", { item: info, gained }); }
      else sellIds.push(it.id);
    }
    if (sellIds.length) { const g0 = state.carriedGold; const sum = performSale(sellIds); if (sum) { M.sold += sum.count; M.income.sales += state.carriedGold - g0; emit("sale", { count: sum.count, gold: state.carriedGold - g0 }); } }
    // 8) banka (smrt bere jen 5 % neseného zlata)
    depositAll();
  }

  // --- veřejné API pro Node ---
  B.decide = function () {
    const t = pickTarget(); B.lastPick = t; const curId = state.run.targetEnemyId; const cur = t.rows.find((r) => r.id === curId); const bestRow = t.rows.find((r) => r.id === t.best.id);
    const d = (r) => r && { score: +r.score.toFixed(3), xpScore: +r.xpScore.toFixed(3), matScore: +r.matScore.toFixed(3), estKillsPerH: Math.round(r.kph), estDeathsPerH: +r.dph.toFixed(1) };
    const extra = { deficit: Object.keys(t.deficit).slice(0, 4), plan: t.plan };
    T.lastWhy = null;
    if (!curId) setTarget(t.best.id, "start: žádný cíl", { to: d(bestRow), ...extra });
    else if (!state.running) setTarget(t.best.id, "restart: boj byl zastaven", { to: d(bestRow), ...extra });
    else if (!cur) setTarget(t.best.id, "aktuální cíl už není povolený (tier gate)", { to: d(bestRow), ...extra });
    else if (t.best.score > cur.score * cfg.switchGain) setTarget(t.best.id, `lepší skóre ×${(t.best.score / Math.max(1e-9, cur.score)).toFixed(2)} (práh ×${cfg.switchGain})`, { from: d(cur), to: d(bestRow), ...extra });
    // vysvětlení rozhodnutí pro trace (jen čtení)
    if (T.on) safe(() => {
      const nowId = state.run.targetEnemyId, nowRow = t.rows.find((r) => r.id === nowId) ?? bestRow;
      const row = (r) => r && { id: r.id, name: enemyName(r.id), score: +r.score.toFixed(3), xpScore: +r.xpScore.toFixed(3), matScore: +r.matScore.toFixed(3), killsPerH: Math.round(r.kph), deathsPerH: +r.dph.toFixed(1), xpPerH: Math.round(r.xph), killsPerLife: r.dph > 0 ? +(r.kph / r.dph).toFixed(1) : null };
      let summary;
      if (T.lastWhy) summary = `Změna cíle na ${enemyName(nowId)}: ${T.lastWhy}.`;
      else if (cur && t.best.id === curId) summary = `Zůstává na ${enemyName(curId)}: je zároveň nejlepší volba (skóre ${cur.score.toFixed(2)}).`;
      else if (cur) summary = `Zůstává na ${enemyName(curId)} (skóre ${cur.score.toFixed(2)}). Nejlepší alternativa ${enemyName(t.best.id)} má skóre ${t.best.score.toFixed(2)}, tedy ×${(t.best.score / Math.max(1e-9, cur.score)).toFixed(2)}; ke změně je potřeba aspoň ×${cfg.switchGain}.`;
      else summary = `Bez cíle.`;
      summary += ` Skóre = podíl XP do dalšího levelu za ${cfg.horizonH} h (xp) + pokrytí chybějícího materiálu pro plánované kování (mat).`;
      B.lastChanged = !!T.lastWhy;
      T.lastDecision = { summary, changed: T.lastWhy, current: row(nowRow), best: row(bestRow), switchGain: cfg.switchGain, horizonH: cfg.horizonH, plan: t.plan, deficit: Object.keys(t.deficit).slice(0, 6), candidates: [...t.rows].sort((x, y) => y.score - x.score).slice(0, 5).map(row) };
    });
  };
  // první hodina, kdy má postava alespoň 4 (resp. 1) kusy výbavy tieru T nebo vyššího
  function trackGear() {
    const tiers = SLOTS.map((sl) => slotTier(sl)); const tH = +(performance.now() / 3.6e6).toFixed(3);
    for (let T = 1; T <= 10; T++) { const n = tiers.filter((x) => x >= T).length; if (n >= 1 && !M.gearTierAny[T]) M.gearTierAny[T] = { tHours: tH, level: state.level }; if (n >= 4 && !M.gearTier[T]) M.gearTier[T] = { tHours: tH, level: state.level }; }
  }
  // --- trace: stavový snímek po každém zásahu bota + volitelné minisnímky (ticks) ---
  function xpTotal() { let sum = state.xp; for (let l = 1; l < state.level; l++) sum += xpNeeded(l); return Math.round(sum); }
  function traceCycle() {
    if (!T.on) return;
    safe(() => {
      const gained = {}; for (const [id, q] of Object.entries(M.matGain)) { const d = q - (T.lastMat[id] || 0); if (d) gained[id] = d; T.lastMat[id] = q; }
      if (Object.keys(gained).length) emit("materials", { gained });
      const dk = state.kills - T.lastKills, dd = state.stats.deaths - T.lastDeaths; T.lastKills = state.kills; T.lastDeaths = state.stats.deaths;
      if (dd >= WARN.minDeaths && dd >= dk * WARN.deathsPerKill) { T.streak++; emit("warning", { kind: T.streak >= WARN.spiralCycles ? "spiral" : "death-streak", target: state.run.targetEnemyId, targetName: enemyName(state.run.targetEnemyId), deaths: dd, kills: dk, streak: T.streak }); } else T.streak = 0;
      const s = getPlayerStats(); const t = nowMs(); const target = state.run.targetEnemyId; const e = ENEMIES[target];
      const mats = {}; for (const id of Object.keys(M.matGain)) { let q = 0; for (const qq of QUALITY_IDS) q += materialQuantity(id, qq); if (q) mats[id] = q; }
      const spent = { forge: M.spend.forge, upgrade: M.spend.upgrade, repair: M.spend.repair, food: M.spend.food };
      const frame = {
        t, level: state.level, xp: Math.round(state.xp), xpNeeded: state.level >= 100 ? null : xpNeeded(), xpTotal: xpTotal(), hp: +state.player.hp.toFixed(1), maxHp: Math.round(s.maxHp),
        kills: state.kills, deaths: state.stats.deaths, food: state.food, phase: state.phase,
        stats: { dmgMin: Math.round(s.minDamage), dmgMax: Math.round(s.maxDamage), crit: +s.critChance.toFixed(3), attackSpeed: +s.attackSpeed.toFixed(1), defense: +s.defense.toFixed(1) },
        gold: { earned: state.stats.goldEarned, fromSales: state.stats.goldFromSales, spent, spentTotal: spent.forge + spent.upgrade + spent.repair + spent.food, lostToDeath: state.stats.goldLostToDeath, carried: state.carriedGold, bank: state.bankGold, balance: state.carriedGold + state.bankGold },
        materials: mats,
        equipment: SLOTS.map((sl) => ({ slot: sl, item: itemInfo(state.equipment[sl]) })),
        target, targetName: e?.name ?? null, targetType: e?.type ?? null, targetLevel: e?.level ?? null, location: state.activeLocationId, locationName: LOCATIONS[state.activeLocationId]?.name ?? null,
        area: safe(() => { const areas = CONTENT_100.areas; const list = Array.isArray(areas) ? areas : Object.values(areas); const a = list.find((x) => (x.enemyIds ?? []).includes(target)); return a ? (a.name ?? a.id) : null; }),
        decision: T.lastDecision,
      };
      // naměřené hodnoty za poslední hodinu herního času (6 zásahů bota zpět)
      const past = T.hist.length >= 6 ? T.hist[T.hist.length - 6] : T.hist[0] ?? null;
      frame.measured = past && t > past.t ? (() => { const h = (t - past.t) / 3.6e6; return { windowHours: +h.toFixed(2), killsPerH: Math.round((frame.kills - past.kills) / h), deathsPerH: +((frame.deaths - past.deaths) / h).toFixed(1), xpPerH: Math.round((frame.xpTotal - past.xpTotal) / h), killsPerLife: frame.deaths > past.deaths ? +((frame.kills - past.kills) / (frame.deaths - past.deaths)).toFixed(1) : null }; })() : null;
      T.hist.push({ t, kills: frame.kills, deaths: frame.deaths, xpTotal: frame.xpTotal }); if (T.hist.length > 12) T.hist.shift();
      T.frames.push(frame);
    });
  }
  B.tick = function () { if (!T.on) return; safe(() => T.ticks.push([nowMs(), state.level, Math.round(state.xp), +state.player.hp.toFixed(1), state.kills, state.stats.deaths, state.stats.goldEarned, state.carriedGold + state.bankGold, state.phase])); };
  B.drain = function () { const out = JSON.stringify({ events: T.events, ticks: T.ticks, frames: T.frames }); T.events = []; T.ticks = []; T.frames = []; return out; };
  B.dictionary = function () {
    const enemies = {}; for (const e of Object.values(ENEMIES)) enemies[e.id] = { name: e.name, level: e.level, type: e.type, locationId: e.locationId, itemTier: e.itemTier ?? null, family: e.family ?? null };
    const locations = {}; for (const l of Object.values(LOCATIONS)) locations[l.id] = { name: l.name, recommendedLevel: l.recommendedLevel ?? null, itemTier: l.itemTier ?? null };
    const materials = {}; for (const m of Object.values(MATERIALS)) materials[m.id] = { name: m.name ?? m.id };
    return { enemies, locations, materials, slots: SLOTS, qualities: QUALITY_IDS, warn: WARN };
  };
  B.cycle = function () { shop(); trackGear(); B.decide(); traceCycle(); };
  B.snap = function () { const s = getPlayerStats(); return { tHours: +(performance.now() / 3.6e6).toFixed(3), level: state.level, xp: state.xp, kills: state.kills, deaths: state.stats.deaths, carried: state.carriedGold, bank: state.bankGold, goldEarned: state.stats.goldEarned, goldFromSales: state.stats.goldFromSales, goldLostToDeath: state.stats.goldLostToDeath, food: state.food, target: state.run.targetEnemyId, hp: state.player.hp, maxHp: s.maxHp, dmg: [s.minDamage, s.maxDamage], crit: +s.critChance.toFixed(3), as: s.attackSpeed, def: s.defense, inv: state.inventory.length, core: state.coreFragments, unclaimed: state.unclaimed.length, equipped: SLOTS.map((sl) => { const it = state.equipment[sl]; return it ? `${it.itemTier ?? "?"}${it.quality[0]}+${it.upgradeLevel ?? 0}` : "-"; }).join(","), known: state.knownAffixes.length, scrolls: state.affixScrolls.length, drops: { total: M.dropsTotal, byQ: Object.assign({}, M.dropsByQ), affixed: M.dropsAffixed }, matsFound: Object.values(M.matGain).reduce((x, y) => x + Number(y || 0), 0), mats: Object.assign({}, state.materials) }; };
  B.recipeAvail = function () { const tH = +(performance.now() / 3.6e6).toFixed(3); const out = { levelOk: 0, matsOk: 0, goldOk: 0, craftable: 0 };
    for (const r of normalRecipes) { const lvOk = state.level >= (r.requiredLevel ?? 1); if (lvOk && !(r.id in M.recipeLevelOk)) M.recipeLevelOk[r.id] = tH; if (!lvOk) continue; out.levelOk++; const mats = hasRequirements(requirementsFor(r)); const g = gold() >= r.gold; if (mats) out.matsOk++; if (g) out.goldOk++; if (mats && g) { out.craftable++; if (!(r.id in M.recipeFirst)) M.recipeFirst[r.id] = tH; } }
    return out; };
})();
