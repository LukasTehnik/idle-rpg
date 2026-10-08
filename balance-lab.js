"use strict";

const TELEMETRY_KEY = "idle-rpg-wave-telemetry-v1";
const TELEMETRY_COMMAND_KEY = "idle-rpg-wave-telemetry-command-v1";
const TELEMETRY_HISTORY_KEY = "idle-rpg-wave-telemetry-history-v1";
const $ = (selector) => document.querySelector(selector);
const fmt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });
const fmtHours = (hours) => !Number.isFinite(hours) ? "—" : hours < 1 ? `${fmt.format(hours * 60)} min` : `${fmt.format(hours)} h`;
const pct = (value) => `${fmt.format(value * 100)} %`;
const positive = (value) => Math.max(0, Number(value) || 0);

const chainDefaults = [
  ["Padne vůbec equipment", 0.5], ["Je to správný base item", 12.5], ["Padne správná kvalita", 5],
  ["Item má potřebný affix", 15], ["Je to konkrétní affix", 10], ["Tavba vrátí jeho scroll", 15],
];

function waveInputs() { return { size: positive($("#waveSize").value), hits: positive($("#hitsToKill").value), attackMs: positive($("#attackMs").value), cooldownMs: positive($("#cooldownMs").value) }; }
function currentKillsPerHour() { const { size, hits, attackMs, cooldownMs } = waveInputs(); return WAVE_BALANCE.killsPerHour(size, hits, attackMs, cooldownMs); }
function renderWave() {
  const { size, hits, attackMs, cooldownMs } = waveInputs(); const clearMs = WAVE_BALANCE.waveClearMs(size, hits, attackMs); const cycleMs = clearMs + cooldownMs; const kills = WAVE_BALANCE.killsPerHour(size, hits, attackMs, cooldownMs);
  $("#waveClear").textContent = `${fmt.format(clearMs / 1000)} s`;
  $("#waveCycle").textContent = `${fmt.format(cycleMs / 1000)} s`;
  $("#wavesPerHour").textContent = cycleMs ? fmt.format(3600000 / cycleMs) : "—";
  $("#killsPerHour").textContent = fmt.format(kills);
  $("#hardCap").textContent = fmt.format(WAVE_BALANCE.killsPerHour(size, 1, attackMs, cooldownMs));
  $("#cooldownPerKill").textContent = `${fmt.format(cooldownMs / size)} ms`;
  $("#enemyKillsPerHour").value = Math.round(kills);
  renderTarget(); renderChain(); renderEnemyReport();
}
function renderTarget() {
  const kills = currentKillsPerHour(); const direct = positive($("#directChance").value) / 100;
  const requestedHours = positive($("#targetValue").value) / ($("#targetUnit").value === "minutes" ? 60 : 1);
  const chance = direct || WAVE_BALANCE.chanceForHours(kills, requestedHours);
  const expected = WAVE_BALANCE.hoursForChance(kills, chance);
  $("#targetChance").textContent = pct(chance); $("#targetKills").textContent = Number.isFinite(expected) ? fmt.format(kills * expected) : "—";
  $("#targetP50").textContent = fmtHours(WAVE_BALANCE.percentileHours(kills, chance, 0.5));
  $("#targetP90").textContent = fmtHours(WAVE_BALANCE.percentileHours(kills, chance, 0.9));
}
function buildChain() {
  $("#chainRows").innerHTML = chainDefaults.map(([name, value], index) => `<label><span>${name}</span><span class="balance-input-wrap"><input data-chain="${index}" type="number" min="0" max="100" step="0.000001" value="${value}" /><b>%</b></span></label>`).join("");
  $("#chainRows").addEventListener("input", renderChain);
}
function renderChain() {
  const chance = [...document.querySelectorAll("[data-chain]")].reduce((total, input) => total * (positive(input.value) / 100), 1);
  const kills = currentKillsPerHour(); const expected = WAVE_BALANCE.hoursForChance(kills, chance);
  $("#chainChance").textContent = pct(chance); $("#chainExpected").textContent = fmtHours(expected);
  $("#chainPercentiles").textContent = `${fmtHours(WAVE_BALANCE.percentileHours(kills, chance, 0.5))} / ${fmtHours(WAVE_BALANCE.percentileHours(kills, chance, 0.9))}`;
}
function readTelemetry() {
  try {
    const data = JSON.parse(localStorage.getItem(TELEMETRY_KEY) || "null");
    if (data && !["idle", "recording", "completed"].includes(data.mode)) data.mode = data.kills || data.activeMs ? "recording" : "idle";
    return data;
  } catch { return null; }
}
function telemetryRate(value, data) { return data?.activeMs > 0 ? value * 3600000 / data.activeMs : 0; }
function median(values) { if (!values?.length) return 0; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; }
function formatActiveTime(ms) { const seconds = Math.floor((ms || 0) / 1000); return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`; }
function setMeasurementState(mode, title, text) {
  const root = $("#measurementState"); root.className = `measurement-state ${mode}`;
  $("#measurementTitle").textContent = title; $("#telemetryStatus").textContent = text;
}
function renderTelemetry() {
  const data = readTelemetry(); const metrics = $("#telemetryMetrics"); const drops = $("#telemetryDrops");
  const mode = data?.mode ?? "idle";
  $("#captureTelemetry").disabled = mode !== "recording";
  if (!data || mode === "idle") { setMeasurementState("idle", "MĚŘENÍ NENÍ SPUŠTĚNÉ", "Klikni START NEW MEASUREMENT. Potom se vrať do hry a spusť boj."); metrics.innerHTML = ""; drops.innerHTML = ""; return; }
  if (!data.activeMs) {
    const title = mode === "recording" ? "MĚŘENÍ ČEKÁ NA BOJ" : "RUN BYL UKONČEN";
    const copy = mode === "recording" ? "Záznam je zapnutý. Teď se vrať do hry, vyber enemy a spusť automatický boj." : "Run byl ukončen před prvními daty.";
    setMeasurementState(mode === "recording" ? "recording" : "completed", title, copy); metrics.innerHTML = ""; drops.innerHTML = ""; return;
  }
  const active = data.activeMs / 1000; const killRate = telemetryRate(data.kills, data); const clear = median(data.clearTimesMs || []) / 1000;
  const isRecording = mode === "recording";
  setMeasurementState(isRecording ? "recording" : "completed", isRecording ? "MĚŘENÍ BĚŽÍ" : "RUN JE ULOŽENÝ", `${isRecording ? "Záznam aktivního boje" : "Ukončený záznam"} · ${formatActiveTime(data.activeMs)} aktivního času · ${data.kills || 0} killů`);
  metrics.innerHTML = [["Dokončené vlny", data.waves], ["Killy za hodinu", fmt.format(killRate)], ["Medián clearu vlny", `${fmt.format(clear)} s`], ["Cooldown celkem", `${fmt.format((data.cooldownMs || 0) / 1000)} s`], ["XP za hodinu", fmt.format(telemetryRate(data.xp, data))], ["Gold za hodinu", fmt.format(telemetryRate(data.gold, data))], ["Úmrtí", data.deaths || 0]].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  const materialRows = Object.entries(data.materials || {}).map(([key, qty]) => `<li>${key.replace("|", " · ")} <b>${fmt.format(telemetryRate(qty, data))}/h</b></li>`);
  const itemRows = Object.entries(data.equipment || {}).map(([quality, qty]) => `<li>${quality} equipment <b>${fmt.format(telemetryRate(qty, data))}/h</b></li>`);
  drops.innerHTML = materialRows.length || itemRows.length ? `<h3 class="balance-subtitle">Observed rewards / hour</h3><ul>${[...materialRows, ...itemRows].join("")}</ul>` : "";
}
function readTelemetryHistory() { try { return JSON.parse(localStorage.getItem(TELEMETRY_HISTORY_KEY) || "[]"); } catch { return []; } }
function renderHistory() { $("#telemetryHistory").innerHTML = readTelemetryHistory().map((entry) => `<li><b>${new Date(entry.at).toLocaleString("cs-CZ")}</b> · ${fmt.format(entry.killsPerHour)} kills/h · ${fmt.format(entry.xpPerHour)} XP/h · ${fmt.format(entry.goldPerHour)} gold/h</li>`).join("") || "<li>Žádný snapshot.</li>"; }
function captureTelemetry() {
  const data = readTelemetry(); if (!data?.activeMs || data.mode !== "recording") return;
  const entries = readTelemetryHistory(); entries.unshift({ at: Date.now(), killsPerHour: telemetryRate(data.kills, data), xpPerHour: telemetryRate(data.xp, data), goldPerHour: telemetryRate(data.gold, data), waves: data.waves, activeMs: data.activeMs }); localStorage.setItem(TELEMETRY_HISTORY_KEY, JSON.stringify(entries.slice(0, 20)));
  const completed = { ...data, mode: "completed", completedAt: Date.now(), lastActiveAt: 0, pausedAt: 0 }; localStorage.setItem(TELEMETRY_KEY, JSON.stringify(completed)); localStorage.setItem(TELEMETRY_COMMAND_KEY, JSON.stringify({ action: "stop", at: Date.now() }));
  $("#measurementFeedback").textContent = "Run byl ukončen a uložen mezi snapshoty. Pro další test klikni START NEW MEASUREMENT."; renderTelemetry(); renderHistory();
}
function startTelemetry() {
  const fresh = { version: 1, mode: "recording", startedAt: Date.now(), activeMs: 0, lastActiveAt: 0, pausedAt: 0, waveStartedAt: 0, cooldownStartedAt: 0, deathStartedAt: 0, waves: 0, kills: 0, xp: 0, gold: 0, deaths: 0, deathMs: 0, cooldownMs: 0, clearTimesMs: [], materials: {}, equipment: {}, affixedItems: 0, scrolls: 0 };
  localStorage.setItem(TELEMETRY_KEY, JSON.stringify(fresh)); localStorage.setItem(TELEMETRY_COMMAND_KEY, JSON.stringify({ action: "start", at: Date.now() }));
  $("#measurementFeedback").textContent = "Nové měření je připravené a záznam je zapnutý. Teď se vrať do hry a spusť farmení."; renderTelemetry();
}
function populationEnemySelect() { const select = $("#enemySelect"); select.innerHTML = Object.values(ENEMIES).map((enemy) => `<option value="${enemy.id}">${enemy.name}</option>`).join(""); select.value = DEFAULT_ENEMY_ID in ENEMIES ? DEFAULT_ENEMY_ID : select.options[0]?.value; }
function itemName(id) { return ITEM_TEMPLATES.find((item) => item.templateId === id)?.name || id; }
function renderEnemyReport() {
  const enemy = ENEMIES[$("#enemySelect").value]; if (!enemy) return;
  const kills = positive($("#enemyKillsPerHour").value); const rows = [];
  rows.push(`<div class="balance-report-core"><div><small>XP / hour</small><b>${fmt.format((enemy.xp || 0) * kills)}</b></div><div><small>Gold / hour</small><b>${fmt.format((enemy.gold || 0) * kills)}</b></div><div><small>Legacy equipment / hour</small><b>${fmt.format((enemy.dropChance || 0) * kills)}</b></div></div>`);
  const drops = [];
  for (const drop of enemy.materialDrops || []) { const material = MATERIALS[drop.templateId]; const averageQty = ((drop.quantity?.[0] || 1) + (drop.quantity?.[1] || 1)) / 2; drops.push(`<li><span>${material?.name || drop.templateId} · ${drop.quality || "common"}</span><b>${fmt.format(kills * (drop.chance || 0) * averageQty)}/h</b></li>`); }
  for (const drop of enemy.equipmentDrops || []) drops.push(`<li><span>${itemName(drop.templateId)} · ${drop.quality || "common"}</span><b>${fmt.format(kills * (drop.chance || 0))}/h</b></li>`);
  rows.push(`<div><h3 class="balance-subtitle">Configured direct drops / hour</h3>${drops.length ? `<ul class="balance-report-drops">${drops.join("")}</ul>` : "<p class=\"muted\">No direct material or equipment entries.</p>"}</div>`);
  $("#enemyReport").innerHTML = rows.join("");
}

for (const node of document.querySelectorAll("#waveSize,#hitsToKill,#attackMs,#cooldownMs")) node.addEventListener("input", renderWave);
for (const node of document.querySelectorAll("#targetValue,#targetUnit,#directChance")) node.addEventListener("input", renderTarget);
$("#enemySelect").addEventListener("change", renderEnemyReport); $("#enemyKillsPerHour").addEventListener("input", renderEnemyReport);
$("#captureTelemetry").addEventListener("click", captureTelemetry); $("#startTelemetry").addEventListener("click", startTelemetry);
buildChain(); populationEnemySelect(); renderWave(); renderTelemetry(); renderHistory();
