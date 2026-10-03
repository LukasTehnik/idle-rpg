"use strict";
// Prototype 0.6 — UI testy (Playwright): `node tests/ui-tests.js`
// Předpoklady: lokální server na http://localhost:8765 (python3 -m http.server 8765),
// nainstalovaný `playwright` (cesta/spouštěč lze přepsat proměnnými PLAYWRIGHT_MODULE a CHROME_PATH).
const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE || "/home/claude/.npm-global/lib/node_modules/playwright";
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8765";
const { chromium } = require(PLAYWRIGHT);

let passed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.log(`  FAIL ${name}\n       ${error.message}`); }
}
const assert = (condition, message = "assertion failed") => { if (!condition) throw new Error(message); };
const BANNED = /\b(T[1-5]|tier|rarity|common|rare|epic|legendary|mythic|god|recommended|best for|build|farming build|boss hunter build)\b/i;
const SAVE_KEY = "idle-rpg-prototype-v02";

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const newPage = async (viewport = { width: 1440, height: 900 }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.errors = [];
    page.on("pageerror", (error) => page.errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && !/404/.test(message.text())) page.errors.push(message.text()); });
    return page;
  };

  console.log("Hra: svitky v inventáři");
  await test("64 svitků má identický vzhled a žádné quality třídy", async () => {
    const page = await newPage();
    await page.goto(`${BASE}/index.html?testscrolls#/inventar`); await page.waitForTimeout(500);
    await page.click('[data-tab="scrolls"]'); await page.waitForTimeout(200);
    const result = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.inv-cell[data-key^="scr:"]')];
      const sig = (cell) => {
        const cs = getComputedStyle(cell); const icon = cell.querySelector(".cell-icon"); const ics = getComputedStyle(icon); const name = getComputedStyle(cell.querySelector(".cell-name"));
        return [cs.backgroundColor, cs.borderTopColor, cs.borderTopWidth, cs.boxShadow, cs.outlineStyle, name.color, ics.boxShadow, ics.backgroundImage, ics.filter].join("|");
      };
      const signatures = new Set(cells.map(sig));
      const qClasses = cells.filter((c) => /(^|\s)q-/.test(c.className) || /(^|\s)q-/.test(c.querySelector(".cell-icon").className) || c.dataset.quality).length;
      const shine = cells.filter((c) => c.querySelector(".q-shine")).length;
      const text = cells.map((c) => c.textContent).join(" ");
      const prefix = cells.filter((c) => c.querySelector(".scroll-mark").textContent === "P").length;
      return { count: cells.length, unique: signatures.size, qClasses, shine, text, prefix, suffix: cells.length - prefix };
    });
    assert(result.count === 64, `počet ${result.count}`);
    assert(result.unique === 1, `vzhledů ${result.unique}`);
    assert(result.qClasses === 0 && result.shine === 0, "quality třídy/glow na svitku");
    assert(!BANNED.test(result.text), `zakázaný text v mřížce: ${result.text.match(BANNED)?.[0]}`);
    assert(result.prefix === 30 && result.suffix === 34, `P/S ${result.prefix}/${result.suffix}`);
    const hidden = await page.evaluate(() => ({ quality: document.getElementById("invQualityField").classList.contains("hidden"), legend: document.getElementById("qualityLegend").classList.contains("hidden"), sortQuality: document.querySelector('#invSort option[value="quality"]').disabled, sortPower: document.querySelector('#invSort option[value="power"]').disabled }));
    assert(hidden.quality && hidden.legend && hidden.sortQuality && hidden.sortPower, `na záložce svitků se nabízí filtr/řazení podle síly: ${JSON.stringify(hidden)}`);
    assert(page.errors.length === 0, page.errors.join("; "));
  });

  await test("detail všech 64 svitků: jen povolený obsah, bez tieru/quality/build", async () => {
    const page = await newPage();
    await page.goto(`${BASE}/index.html?testscrolls#/inventar`); await page.waitForTimeout(500);
    await page.click('[data-tab="scrolls"]');
    const keys = await page.$$eval('.inv-cell[data-key^="scr:"]', (cells) => cells.map((c) => c.dataset.key));
    const signatures = new Set(); const problems = [];
    for (const key of keys) {
      await page.click(`.inv-cell[data-key="${key}"]`);
      const data = await page.evaluate(() => {
        const panel = document.getElementById("itemDetail"); const badge = document.getElementById("detailQuality"); const icon = document.getElementById("detailIcon");
        const ps = getComputedStyle(panel); const is = getComputedStyle(icon); const bs = getComputedStyle(badge);
        return {
          text: document.getElementById("detailBody").innerText, badge: badge.textContent, type: document.getElementById("detailType").textContent,
          sig: [is.backgroundColor, is.borderTopColor, bs.backgroundColor, bs.color, getComputedStyle(document.getElementById("detailTitle")).color, is.boxShadow].join("|"),
          qClass: /(^|\s)q-/.test(panel.className) || /(^|\s)q-/.test(icon.className), buttons: [...document.querySelectorAll("#detailBody .btn")].filter((b) => b.offsetParent).map((b) => b.textContent),
        };
      });
      signatures.add(data.sig);
      if (data.badge !== "AFFIX SCROLL") problems.push(`${key}: badge ${data.badge}`);
      if (!/^(PREFIX|SUFFIX) SCROLL$/.test(data.type)) problems.push(`${key}: typ ${data.type}`);
      if (data.qClass) problems.push(`${key}: q-třída`);
      const hit = data.text.match(BANNED); if (hit) problems.push(`${key}: zakázaný text "${hit[0]}"`);
      if (!/Compatible slots/.test(data.text) || !/Tradeable/.test(data.text)) problems.push(`${key}: chybí sloty/obchodovatelnost`);
      if (data.buttons.length) problems.push(`${key}: akční tlačítka ${data.buttons}`);
    }
    assert(problems.length === 0, problems.slice(0, 5).join(" | "));
    assert(signatures.size === 1, `detail vzhledů ${signatures.size}`);
  });

  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["tablet", { width: 820, height: 1100 }], ["mobil", { width: 390, height: 844 }]]) {
    await test(`detail svitku se vejde na ${name} (${viewport.width}×${viewport.height})`, async () => {
      const page = await newPage(viewport);
      await page.goto(`${BASE}/index.html?testscrolls#/inventar`); await page.waitForTimeout(500);
      await page.click('[data-tab="scrolls"]');
      await page.click('.inv-cell[data-key^="scr:"]:nth-child(60)'); await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const body = document.getElementById("detailBody"); const box = body.getBoundingClientRect();
        return { docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, visible: body.offsetParent !== null, width: box.width, right: box.right, vw: window.innerWidth, title: document.getElementById("detailTitle").textContent };
      });
      assert(m.visible && m.title.length > 0, "detail není vidět");
      assert(m.docOverflow <= 0, `horizontální přetečení ${m.docOverflow}px`);
      assert(m.right <= m.vw + 1, `detail přesahuje viewport (${m.right} > ${m.vw})`);
      await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/scroll-${name}.png` : undefined });
      assert(page.errors.length === 0, page.errors.join("; "));
    });
  }

  console.log("Hra: itemy s affixy a save");
  await test("itemy s prefixem/suffixem ukazují oddělené řádky a po reloadu zachovají rolly", async () => {
    const page = await newPage();
    await page.goto(`${BASE}/index.html?testscrolls#/inventar`); await page.waitForTimeout(500);
    const before = await page.evaluate(() => state.inventory.filter((i) => i.prefix || i.suffix).map((i) => ({ id: i.id, prefix: i.prefix, suffix: i.suffix })));
    assert(before.length === 3, `itemů s affixem ${before.length}`);
    await page.reload(); await page.waitForTimeout(500);
    const after = await page.evaluate(() => state.inventory.filter((i) => i.prefix || i.suffix).map((i) => ({ id: i.id, prefix: i.prefix, suffix: i.suffix })));
    assert(JSON.stringify(before) === JSON.stringify(after), "rolly se po reloadu změnily");
    const saved = await page.evaluate((key) => { const s = JSON.parse(localStorage.getItem(key)); return { version: s.version, scrolls: s.affixScrolls.length, keys: Object.keys(s.affixScrolls[0]).sort().join(",") }; }, SAVE_KEY);
    assert(saved.version === 8 && saved.scrolls === 64, JSON.stringify(saved));
    assert(saved.keys === "affixId,affixType,instanceId,itemType,tradeable,visualClass", saved.keys);
    await page.click('[data-tab="equipment"]');
    const id = before[0].id;
    await page.click(`.inv-cell[data-key="item:${id}"]`); await page.waitForTimeout(200);
    const text = await page.innerText("#detailBody");
    assert(/PREFIX: /.test(text) && /SUFFIX: |PREFIX: /.test(text), "chybí řádky PREFIX/SUFFIX");
    assert(!/\bT[1-5]\b/.test(text), "tier v detailu itemu");
    assert(page.errors.length === 0, page.errors.join("; "));
  });

  await test("živé staty z affixu se promítnou do postavy po nasazení", async () => {
    const page = await newPage();
    await page.goto(`${BASE}/index.html?testscrolls#/inventar`); await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const weapon = state.inventory.find((i) => i.prefix?.affixId === "prefix_serrated");
      const plain = { ...weapon, prefix: null, suffix: null };
      const a = getPlayerStats({ ...state.equipment, weapon }); const b = getPlayerStats({ ...state.equipment, weapon: plain });
      return { dMin: a.minDamage - b.minDamage, dMax: a.maxDamage - b.maxDamage, dCrit: a.critChance - b.critChance };
    });
    assert(r.dMin === 1 && r.dMax === 1, JSON.stringify(r));
    assert(r.dCrit > 0, "crit z Precision se nepromítl");
  });

  await test("save 0.5.1 (v4, bez affixových polí) se načte; itemy dostanou prázdné sloty", async () => {
    const page = await newPage();
    await page.goto(`${BASE}/README.md`); // stejný origin, hra se nespustí a nepřepíše uložený stav
    await page.evaluate((key) => {
      const legacyItem = { id: "legacy-1", name: "Starý meč", slot: "weapon", icon: "iron-sword", quality: "rare", stats: { damageMin: 2, damageMax: 4 }, upgradeLevel: 0, source: "Goblin", acquiredAt: 1, templateId: "iron-sword", obtainedAt: 1, sourceEnemyId: "goblin", isNew: false, isFavorite: true, isLocked: false };
      localStorage.setItem(key, JSON.stringify({ version: 4, level: 3, xp: 5, kills: 7, drops: 1, carriedGold: 10, bankGold: 0, coreFragments: 2, currentEnemyId: "goblin", inventory: [legacyItem], equipment: { weapon: { ...legacyItem, id: "legacy-eq" } }, materials: {}, player: { hp: 50, baseMaxHp: 100, baseMinDamage: 9, baseMaxDamage: 13, baseCritChance: 0.1 } }));
    }, SAVE_KEY);
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ level: state.level, inv: state.inventory.map((i) => [i.id, i.prefix, i.suffix, i.isFavorite]), eq: [state.equipment.weapon.prefix, state.equipment.weapon.suffix], scrolls: state.affixScrolls }));
    assert(r.level === 3 && r.inv.length === 1, "save se nenačetl");
    assert(JSON.stringify(r.inv[0]) === JSON.stringify(["legacy-1", null, null, true]), JSON.stringify(r.inv));
    assert(r.eq[0] === null && r.eq[1] === null && r.scrolls.length === 0, "nasazený item/svitky");
    await page.evaluate(() => saveState());
    const version = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).version, SAVE_KEY);
    assert(version === 8, `verze ${version}`);
    assert(page.errors.length === 0, page.errors.join("; "));
  });

  await test("běžné dropy nevytvářejí svitky ani affixy (500 dropů)", async () => {
    const page = await newPage();
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      let withAffix = 0; const enemies = Object.values(ENEMIES);
      for (let i = 0; i < 500; i += 1) { const item = createItem(enemies[i % enemies.length]); if (item.prefix || item.suffix) withAffix += 1; }
      return { withAffix, scrolls: state.affixScrolls.length, live: getLiveDropAffixIds().length };
    });
    assert(r.withAffix === 0 && r.scrolls === 0 && r.live === 0, JSON.stringify(r));
  });

  console.log("Interní affix katalog (desktop)");
  await test("katalog: banner, 64 affixů, filtry, sandbox, konflikty, porovnání", async () => {
    const page = await newPage({ width: 1440, height: 900 });
    await page.goto(`${BASE}/affix-catalog.html`); await page.waitForTimeout(500);
    assert(/DEVELOPMENT TOOL — NOT PLAYER-FACING/.test(await page.innerText(".dev-banner")), "chybí banner");
    assert(await page.textContent("#fCount") === "64 / 64", "počet");
    await page.selectOption("#fType", "suffix"); assert(await page.textContent("#fCount") === "34 / 64", "suffix filtr");
    await page.selectOption("#fType", ""); await page.selectOption("#fType", "prefix"); assert(await page.textContent("#fCount") === "30 / 64", "prefix filtr");
    await page.selectOption("#fType", ""); await page.selectOption("#fTier", "5"); assert(await page.textContent("#fCount") === "6 / 64", "tier filtr");
    await page.selectOption("#fTier", ""); await page.selectOption("#fStat", "search_time"); assert(await page.textContent("#fCount") === "3 / 64", "stat filtr");
    await page.selectOption("#fStat", ""); await page.selectOption("#fSlot", "boots"); const boots = await page.textContent("#fCount"); assert(parseInt(boots, 10) > 0 && parseInt(boots, 10) < 64, `slot filtr ${boots}`);
    await page.click("#fReset"); assert(await page.textContent("#fCount") === "64 / 64", "reset");
    // sandbox: weapon + prefix + suffix
    await page.selectOption("#sbA-prefix", "prefix_serrated"); await page.selectOption("#sbA-suffix", "suffix_of_precision");
    let name = await page.innerText("#sbA .sb-name"); assert(name.startsWith("Serrated ") && name.endsWith(" of Precision"), `název ${name}`);
    // roll
    await page.fill("#sbA .sb-roll input[type=number] >> nth=2", "0.9"); await page.dispatchEvent("#sbA .sb-roll input[type=number] >> nth=2", "change");
    assert(/\+0.9% Critical Chance/.test(await page.innerText("#sbA .sb-result")), "roll se nepromítl");
    // konflikt: zbroj + Reckless je nepovolen (slot), použijeme rukavice → Reckless + Bulwark blokováno na zbroji přes negativní předvolbu
    await page.click("#negPresets .btn >> nth=0");
    assert(/BLOKOVÁNO|nevýhodu|slot/i.test(await page.innerText("#negOut")), "konflikt nebyl hlášen");
    // slotová chyba v sandboxu
    await page.selectOption("#sbA-base", await page.$eval("#sbA-base option:nth-child(1)", (o) => o.value));
    const options = await page.$$eval("#sbA-prefix option", (os) => os.filter((o) => o.disabled).length); assert(options > 0, "nekompatibilní affixy nejsou označené");
    // porovnání
    assert(/Změna|Kandidát/.test(await page.innerText("#compareBox")), "chybí porovnání");
    assert((await page.$$("#compareBox tbody tr")).length > 0, "porovnání bez řádků");
    // scan + caps + save test
    await page.click("#scanBtn"); assert(/blokováno/.test(await page.innerText("#scanOut")), "scan");
    await page.click("#capBtn"); assert(/OMEZENO/.test(await page.innerText("#capOut")), "capy");
    await page.click("#saveBtn"); assert(/prefix_serrated/.test(await page.innerText("#saveOut")), "test migrace");
    await page.click("#uniformCheck"); assert(/64 karet · 1 unikátní/.test(await page.innerText("#uniformResult")), await page.innerText("#uniformResult"));
    const live = await page.innerText("#liveStatus"); assert(/enabledInLiveDrops: true: 0/.test(live.replace(/\s+/g, " ")) || /: 0/.test(live), "live status");
    assert((await page.$$("#statTable tbody tr")).length === 40, "registr statů");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert(overflow <= 0, `horizontální přetečení ${overflow}`);
    assert(page.errors.length === 0, page.errors.join("; "));
  });

  await browser.close();
  console.log(`\n${passed} OK, ${failures.length} selhalo`);
  if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
})();
