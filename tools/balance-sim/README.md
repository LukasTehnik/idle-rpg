# balance-sim: simulátor pro opakované balance testy

Interní vývojářský nástroj. **Není součástí hry ani dev-tools UI**, nic z něj se nenačítá v `index.html`.
Odehraje novou postavu bota od levelu 1 (až do levelu 100) a změří, jak balance vypadá: časy do levelů, kills a smrti za hodinu, gold, craft, dropy, výbavu a volbu cílů.
Dva běhy před a po změně balancu se dají porovnat číslo po čísle.

## Rychlý start

```bash
npm --prefix tools/balance-sim install     # jednou: jsdom + playwright (jen pro nástroj, ne pro hru)
npx --prefix tools/balance-sim playwright install chromium   # jednou: Chromium pro regresní test

npm run balance:sim                                   # všechny scénáře, seedy 1,2,3
npm run balance:sim -- --scenario level-1-100         # jen jeden scénář (víc oddělte čárkou)
npm run balance:sim -- --scenario early-game
npm run balance:sim -- --seeds 1,2,3,4,5,6            # vlastní seedy
npm run balance:report                                # znovu vypíše poslední report (a přepíše report.json/md)
```

Výstup (složka `reports/` je v `.gitignore`, reporty se necommitují):

| Soubor | Obsah |
|---|---|
| `reports/balance-sim/latest/report.json` | strojově čitelný report: agregace přes seedy, kontroly, plné metriky každého seedu |
| `reports/balance-sim/latest/report.md` | krátký čitelný report (mediány a rozsah přes seedy) |
| `reports/balance-sim/latest/raw/seed-N.json` | hrubá data běhu (hodinové snímky, změny cílů), z nich se report počítá |
| `reports/balance-sim/baseline/report.json` | uložená baseline pro porovnání |

Další přepínače `run-simulation.js`: `--jobs N` (paralelní procesy, výchozí počet jader − 1), `--out <složka>`, `--strict` (varování ⚠️ vrací chybový kód jako selhání), `--quiet`.
Návratový kód: `0` vše v pořádku (nebo jen varování), `1` selhala kontrola, `2` chyba nástroje. `balance:report -- --compare <report.json>` porovná poslední běh s libovolným reportem.

## Postup při změně balancu

```bash
npm run balance:baseline      # PŘED změnou: uloží referenční report (stejné seedy a scénáře jako později)
# ... uprav balance ...
npm run balance:verify        # PO změně: regresní test proti Chromiu + nový běh + porovnání s baseline
```

`balance:verify` = `balance:test` (shoda simulátoru se skutečnou hrou) a `balance:check` (nový běh nad stejnými seedy a scénáři jako baseline, vypíše report a tabulku změněných metrik).
Díky determinismu platí: **pokud se hra nezměnila, je porovnání bez jediného rozdílu**. Každý rozdíl je tedy skutečná změna balancu, ne šum.

## Scénáře (`scenarios.js`)

| id | co měří | konec |
|---|---|---|
| `early-game` | level 1–10: tvrdost začátku, smrti na zabití, čas do levelu 10 | level 10 |
| `level-1-100` | celá cesta: milníky, pásma, gold, craft, dropy, výbava | level 100 |
| `boss-safety` | smrtící spirála na boss spotech (≥ 3 h na jednom bossovi s ≥ 0,5 smrti na zabití) | level 60 |
| `endgame-t8-t10` | kdy má postava 4 kusy výbavy T8/T9/T10, vykovala recepty, padají suroviny | level 100 + 20 h |

Všechny scénáře jedou z **jednoho běhu na seed** (checkpointy), takže plný běh nestojí čtyřnásobek.
Každý scénář má kontroly se stavem ✅ pass / ⚠️ warn / ❌ fail. `fail` = porušená integrita nebo cíl scénáře (nedojde na level, zaseknutí, spirála, gold nesedí), `warn` = překročený orientační limit.
Limity jsou v objektu `GUARDRAILS` v `scenarios.js`. **Jsou to startovní odhady z prvního měření, ne designové cíle**; upravte je, až si cíle ujasníte.

## Co report obsahuje

Minimálně: čas do levelu 10/20/40/60/80/100, kills/h a smrti/h po pásmech po 10 levelech, gold (získaný z toho z prodeje / utracený na kování, upgrady, opravy, jídlo / ztracený smrtí / zůstatek),
materiály, kování, upgrady, opravy, tavení, první drop Rare/Epic/Legendary (čas a level), počet affix dropů podle tieru, čas, kdy hráč poprvé nosí alespoň 4 kusy výbavy tieru T1–T10,
zvolené cíle s důvodem každé změny (v `targets.changes` každého seedu: čas, level, odkud kam, důvod a skóre).

## Jak simulátor funguje (a proč se nekopíruje herní logika)

1. `lib/harness.js` načte **skutečný `index.html` a `app.js`** včetně všech datových souborů repozitáře do jsdom. XP, dropy, recepty, craft a boj tedy jedou z toho samého kódu a dat jako hra.
2. Řídí se jen to, co hra sama nemůže ovlivnit: **čas** (`performance.now`, `Date.now`, `setInterval`, `setTimeout` jedou na virtuálních hodinách) a **`Math.random`** (seedovaný generátor mulberry32).
3. Funkce, které jen kreslí nebo ukládají (`render`, `addLog`, `saveState`, toasty …; seznam `UI_ONLY_FUNCTIONS` v `harness.js`), jsou prázdné, aby běh byl rychlý. Herní logika na nich nesmí záviset (hlídá to regresní test).
4. `lib/bot-page.js` je bot, který hraje přes **skutečné herní funkce** (`chooseTarget`, `enterLocation`, `equipItem`, `doForge`, `doUpgrade`, `doRepair`, `doSmelt`, `learnScroll`, `performSale`, `buyFood`, `bankTransfer`). Každých 10 virtuálních minut zasáhne.
5. `lib/run.js` řídí běh a odebírá checkpointy, `lib/metrics.js` z nich počítá metriky (čistá funkce bez znalosti hry), `report.js` skládá JSON a Markdown.

### Pravidla bota

- učí se svitky, nasazuje nejlepší kus podle skóre `√(dps · (maxHp + 25 · obrana))`,
- opraví výbavu, když chybí aspoň 24 odolnosti a zbude gold na jídlo; kupuje jídlo do zásoby 12 a nesahá na gold plánovaný na craft,
- kuje nejvyšší odemčený tier pro první dva sloty, kde ještě nenosí tento tier (jen běžné recepty `-1`/`-2`), upgraduje do +6 bez blokování plánu,
- taví kusy s affixem nebo kusy, jejichž materiál chybí, zbytek prodá a gold ukládá do banky,
- cíl volí podle skóre = XP za 5 h + pokrytí nedostatku materiálu; cíl, kde postava přežije méně než 1,2 zabití na život, je nezabitelný; cíl mění jen při zlepšení skóre o víc než 15 %. Důvod změny se zapisuje do reportu.

**Bot není člověk.** Měří, co zvládne jednoduchá, ale rozumná strategie, ne optimum ani průměrného hráče. Čísla porovnávejte *mezi běhy téhož bota* (před/po), ne jako předpověď reálného času hráče.
Chování bota se nesmí měnit současně se změnou balancu: změna bota je změna metodiky a má mít vlastní baseline.

## Determinismus

Při stejném kódu hry, stejném bote a stejném seedu je výsledek identický (shodný `report.json` kromě `meta`). Seed určuje všechna volání `Math.random`; čas je virtuální. `gameFingerprint` v reportu (sha1 z `index.html`, načtených skriptů a `app.js`) ukazuje, zda se mezi dvěma reporty změnila hra.
Dva reporty s různými seedy nejsou srovnatelné; porovnání na to upozorní.

## Regresní test (`npm run balance:test`)

Hlídá, že simulátor pořád odpovídá skutečné hře:

1. ve zdrojácích nástroje nejsou id nepřátel ani receptů (žádná kopie dat),
2. determinismus (stejný seed = stejný průběh, jiný seed = jiný),
3. **shoda se skutečným Chromiem**: ruční boj 20 min a bot 60 min (seed 1) běží v Chromiu (plné vykreslování, Playwright fake clock) i v simulátoru; stav postavy (kills, XP, level, HP, smrti, gold, fáze, inventář, jídlo, banka) se musí po každém kroku shodovat,
4. samotest detektoru na dočasné kopii hry: změna čísla v balancu na obou stranách zůstane shodná, stejná změna jen u Chromia **musí** rozdíl odhalit, logika svázaná s vykreslením **musí** rozdíl odhalit.

`--quick` přeskočí samotest detektoru, `--full` přidá bota na 120 min se seedem 2 (několikanásobně pomalejší). Plné vykreslování v Chromiu je pomalé: na 2jádrovém cloudovém stroji trval celý test asi 40 minut, na běžném počítači bývá výrazně rychlejší. Stačí ho pustit při změně herní logiky, ne po každém ladění čísel. Test je nutné spouštět s dostupným Chromiem; bez něj končí chybou (kód 3), protože jinak by shodu nešlo ověřit.

### Když regresní test selže

- Rozdíl hned po prvním kroku: změnila se logika, která závisí na vykreslení nebo na čase mimo `performance.now`/`Date.now` (např. nová `requestAnimationFrame`, čtení DOM, nový zdroj náhody mimo `Math.random`). Výstup ukáže první minutu a obě stavy. Oddělte logiku od vykreslení, nebo přidejte funkci do `UI_ONLY_FUNCTIONS` jen tehdy, když opravdu jen kreslí.
- Chyba „Mutace: nenalezeno …“: změnil se řádek, který samotest mutuje; uprav příslušnou mutaci v `tests/regression.js`.
- Bot volá funkci, která se přejmenovala: oprav `lib/bot-page.js` (chyba se objeví v `errors` reportu a kontrola „bez chyb ve skriptech“ selže).

## Závislosti

Nástroj nemá vliv na produkční hru: závislosti jsou v `tools/balance-sim/package.json` a instalují se jen tam. `jsdom` je potřeba pro simulaci, `playwright` + Chromium jen pro regresní test.
Jiné umístění modulů lze zadat proměnnými `JSDOM_MODULE`, `PLAYWRIGHT_MODULE` a `CHROME_PATH` (cesta ke spustitelnému Chromiu).

## Přidání scénáře

V `scenarios.js` přidejte objekt do `SCENARIOS`: `id`, `title`, `description`, `checkpoint: { level, extraHours? }`, `maxHours` a `evaluate(metrics)` vracející pole kontrol `{ id, label, status, detail }`.
Běh se pro scénář nespouští zvlášť, jen se přidá checkpoint do existujícího běhu seedu. Metriky se počítají v `lib/metrics.js`; nové číslo přidejte tam a do `aggregate()` v `report.js`.

## Struktura

```
tools/balance-sim/
  README.md           tento soubor
  scenarios.js        scénáře, kontroly a GUARDRAILS
  run-simulation.js   CLI: běhy po seedech (paralelně), uložení surových dat, report, baseline
  report.js           JSON + Markdown report, porovnání dvou reportů
  lib/harness.js      jsdom + virtuální čas + seedovaný Math.random
  lib/bot-page.js     bot (běží uvnitř hry, volá jen herní funkce)
  lib/run.js          jeden běh seedu s checkpointy
  lib/metrics.js      výpočet metrik z checkpointu
  tests/regression.js regresní test proti Chromiu
  package.json        závislosti nástroje (jsdom, playwright)
```
