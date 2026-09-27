"use strict";

const CONFIG = Object.freeze({
  playerAttackMs: 1600,
  enemyAttackMs: 2200,
  enemyRespawnMs: 3000,
  playerRespawnMs: 5000,
  betweenFightHealPercent: 0.1,
  maxLogEntries: 80,
  enemy: {
    name: "Goblin",
    maxHp: 48,
    minDamage: 5,
    maxDamage: 8,
    xp: 18,
  },
});

const initialState = () => ({
  running: false,
  phase: "ready",
  level: 1,
  xp: 0,
  kills: 0,
  elapsedSeconds: 0,
  player: {
    hp: 100,
    maxHp: 100,
    minDamage: 9,
    maxDamage: 13,
    critChance: 0.1,
  },
  enemy: {
    hp: CONFIG.enemy.maxHp,
    maxHp: CONFIG.enemy.maxHp,
  },
  lastPlayerAttackAt: 0,
  lastEnemyAttackAt: 0,
  phaseEndsAt: 0,
});

let state = initialState();
let gameLoopId = null;
let timerLoopId = null;

const elements = {
  level: document.querySelector("#levelValue"),
  xp: document.querySelector("#xpValue"),
  xpGoal: document.querySelector("#xpGoal"),
  xpBar: document.querySelector("#xpBar"),
  kills: document.querySelector("#killsValue"),
  runTime: document.querySelector("#runTimeValue"),
  playerHp: document.querySelector("#playerHpValue"),
  playerMaxHp: document.querySelector("#playerMaxHp"),
  playerHpBar: document.querySelector("#playerHpBar"),
  damage: document.querySelector("#damageValue"),
  enemyHp: document.querySelector("#enemyHpValue"),
  enemyHpBar: document.querySelector("#enemyHpBar"),
  enemyPortrait: document.querySelector("#enemyPortrait"),
  encounterMessage: document.querySelector("#encounterMessage"),
  fightButton: document.querySelector("#fightButton"),
  fightButtonText: document.querySelector("#fightButtonText"),
  fightButtonIcon: document.querySelector("#fightButtonIcon"),
  resetButton: document.querySelector("#resetButton"),
  clearLogButton: document.querySelector("#clearLogButton"),
  combatLog: document.querySelector("#combatLog"),
  sessionStatus: document.querySelector("#sessionStatus"),
  statusDot: document.querySelector("#statusDot"),
  arena: document.querySelector("#arena"),
};

function xpNeeded(level = state.level) {
  return Math.round(50 * Math.pow(level, 1.35));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clampPercent(value, max) {
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function render() {
  const goal = xpNeeded();
  elements.level.textContent = state.level;
  elements.xp.textContent = state.xp;
  elements.xpGoal.textContent = goal;
  elements.xpBar.style.width = `${clampPercent(state.xp, goal)}%`;
  elements.kills.textContent = state.kills;
  elements.runTime.textContent = formatTime(state.elapsedSeconds);
  elements.playerHp.textContent = Math.ceil(state.player.hp);
  elements.playerMaxHp.textContent = state.player.maxHp;
  elements.playerHpBar.style.width = `${clampPercent(state.player.hp, state.player.maxHp)}%`;
  elements.damage.textContent = `${state.player.minDamage}–${state.player.maxDamage}`;
  elements.enemyHp.textContent = Math.max(0, Math.ceil(state.enemy.hp));
  elements.enemyHpBar.style.width = `${clampPercent(state.enemy.hp, state.enemy.maxHp)}%`;
  elements.enemyPortrait.classList.toggle("defeated", state.phase === "searching");

  elements.fightButton.classList.toggle("running", state.running);
  elements.fightButtonIcon.textContent = state.running ? "Ⅱ" : "▶";
  elements.fightButtonText.textContent = state.running ? "Pozastavit boj" : "Pokračovat v boji";

  if (state.phase === "ready") {
    elements.fightButtonText.textContent = "Zahájit boj";
    setStatus("Připraveno", "idle");
  } else if (!state.running) {
    setStatus("Pozastaveno", "idle");
  } else if (state.phase === "fighting") {
    setStatus("Probíhá boj", "active");
  } else if (state.phase === "searching") {
    setStatus("Hledá se nepřítel", "active");
  } else if (state.phase === "dead") {
    setStatus("Postava padla", "danger");
  }
}

function setStatus(label, mode) {
  elements.sessionStatus.textContent = label;
  elements.statusDot.classList.toggle("active", mode === "active");
  elements.statusDot.classList.toggle("danger", mode === "danger");
}

function addLog(message, type = "system") {
  if (elements.combatLog.children.length === 1 && elements.combatLog.firstElementChild?.querySelector("time")?.textContent === "—") {
    elements.combatLog.innerHTML = "";
  }

  const entry = document.createElement("li");
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  entry.innerHTML = `<time datetime="${new Date().toISOString()}">${time}</time><span>${message}</span>`;
  elements.combatLog.append(entry);

  while (elements.combatLog.children.length > CONFIG.maxLogEntries) {
    elements.combatLog.firstElementChild.remove();
  }
  elements.combatLog.scrollTop = elements.combatLog.scrollHeight;
}

function animateHit(target) {
  const className = target === "enemy" ? "enemy-hit" : "player-hit";
  elements.arena.classList.remove(className);
  void elements.arena.offsetWidth;
  elements.arena.classList.add(className);
  window.setTimeout(() => elements.arena.classList.remove(className), 260);
}

function beginFight(now = performance.now()) {
  state.phase = "fighting";
  state.enemy.hp = state.enemy.maxHp;
  state.lastPlayerAttackAt = now;
  state.lastEnemyAttackAt = now;
  elements.encounterMessage.textContent = "Souboj začal";
  addLog("Objevil se Goblin. Souboj začíná.", "system");
  render();
}

function playerAttack() {
  const critical = Math.random() < state.player.critChance;
  let damage = randomInt(state.player.minDamage, state.player.maxDamage);
  if (critical) damage *= 2;
  state.enemy.hp = Math.max(0, state.enemy.hp - damage);
  addLog(
    critical
      ? `Kritický zásah! Poutník zasáhl Goblina za ${damage}.`
      : `Poutník zasáhl Goblina za ${damage}.`,
    critical ? "critical" : "player",
  );
  animateHit("enemy");

  if (state.enemy.hp <= 0) {
    defeatEnemy();
  }
}

function enemyAttack() {
  const damage = randomInt(CONFIG.enemy.minDamage, CONFIG.enemy.maxDamage);
  state.player.hp = Math.max(0, state.player.hp - damage);
  addLog(`Goblin zasáhl Poutníka za ${damage}.`, "enemy");
  animateHit("player");

  if (state.player.hp <= 0) {
    defeatPlayer();
  }
}

function defeatEnemy() {
  state.kills += 1;
  state.xp += CONFIG.enemy.xp;
  state.phase = "searching";
  state.phaseEndsAt = performance.now() + CONFIG.enemyRespawnMs;
  elements.encounterMessage.textContent = "Hledám dalšího Goblina… 3 s";
  addLog(`Goblin padl. Získáváš ${CONFIG.enemy.xp} XP.`, "victory");
  applyLevelUps();

  const healing = Math.max(1, Math.round(state.player.maxHp * CONFIG.betweenFightHealPercent));
  const before = state.player.hp;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + healing);
  const restored = state.player.hp - before;
  if (restored > 0) addLog(`Krátký oddech obnovil ${restored} životů.`, "system");
}

function applyLevelUps() {
  while (state.xp >= xpNeeded()) {
    state.xp -= xpNeeded();
    state.level += 1;
    state.player.maxHp += 15;
    state.player.hp = state.player.maxHp;
    state.player.minDamage += 2;
    state.player.maxDamage += 2;
    addLog(`Dosáhl jsi úrovně ${state.level}. Životy i poškození rostou.`, "level-up");
  }
}

function defeatPlayer() {
  state.phase = "dead";
  state.phaseEndsAt = performance.now() + CONFIG.playerRespawnMs;
  elements.encounterMessage.textContent = "Návrat k výpravě za 5 s";
  addLog("Poutník padl. Za 5 sekund se vrátí do boje.", "enemy");
}

function updateCountdown(now) {
  const secondsLeft = Math.max(0, Math.ceil((state.phaseEndsAt - now) / 1000));
  if (state.phase === "searching") {
    elements.encounterMessage.textContent = `Hledám dalšího Goblina… ${secondsLeft} s`;
    if (now >= state.phaseEndsAt) beginFight(now);
  } else if (state.phase === "dead") {
    elements.encounterMessage.textContent = `Návrat k výpravě za ${secondsLeft} s`;
    if (now >= state.phaseEndsAt) {
      state.player.hp = state.player.maxHp;
      addLog("Poutník se zotavil a vrací se na výpravu.", "system");
      beginFight(now);
    }
  }
}

function tick(now) {
  if (!state.running) return;

  if (state.phase === "fighting") {
    if (now - state.lastPlayerAttackAt >= CONFIG.playerAttackMs) {
      state.lastPlayerAttackAt = now;
      playerAttack();
    }
    if (state.phase === "fighting" && now - state.lastEnemyAttackAt >= CONFIG.enemyAttackMs) {
      state.lastEnemyAttackAt = now;
      enemyAttack();
    }
  } else if (state.phase === "searching" || state.phase === "dead") {
    updateCountdown(now);
  }
  render();
}

function startLoops() {
  if (gameLoopId === null) {
    gameLoopId = window.setInterval(() => tick(performance.now()), 100);
  }
  if (timerLoopId === null) {
    timerLoopId = window.setInterval(() => {
      if (state.running) {
        state.elapsedSeconds += 1;
        render();
      }
    }, 1000);
  }
}

function toggleFight() {
  state.running = !state.running;

  if (state.running) {
    const now = performance.now();
    if (state.phase === "ready") {
      beginFight(now);
    } else if (state.phase === "fighting") {
      state.lastPlayerAttackAt = now;
      state.lastEnemyAttackAt = now;
      elements.encounterMessage.textContent = "Souboj pokračuje";
      addLog("Boj pokračuje.", "system");
    } else {
      const remaining = Math.max(0, state.phaseEndsAt - state.pausedAt);
      state.phaseEndsAt = now + remaining;
      addLog("Výprava pokračuje.", "system");
    }
  } else {
    state.pausedAt = performance.now();
    elements.encounterMessage.textContent = "Výprava pozastavena";
    addLog("Výprava byla pozastavena.", "system");
  }
  render();
}

function resetGame() {
  state = initialState();
  elements.combatLog.innerHTML = "";
  addLog("Prototyp byl resetován.", "system");
  elements.encounterMessage.textContent = "Připraven k boji";
  render();
}

elements.fightButton.addEventListener("click", toggleFight);
elements.resetButton.addEventListener("click", resetGame);
elements.clearLogButton.addEventListener("click", () => {
  elements.combatLog.innerHTML = "";
  addLog("Záznam byl vyčištěn.", "system");
});

startLoops();
render();
