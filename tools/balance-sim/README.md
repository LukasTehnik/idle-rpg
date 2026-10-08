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

## Hlídač pokrytí: simulátor nesmí ignorovat nový systém (`npm run balance:coverage`)

Když hra dostane nový systém ovlivňující progres (nová měna, prestiž, nový typ craftu, nový drop…), bot o něm neví. Takový běh by vypadal věrohodně, ale měřil by hru bez tohoto systému. Proto `coverage.js` porovnává hru s ručně udržovaným `coverage-manifest.json`.

**Co se hlídá (statický sken zdrojáků):** skripty z `index.html` (včetně `app.js` načítaného přes `cloud-sync.js`), klíče uloženého stavu (`initialState`), klíče ekonomických konfigurací (`LOOT_CONFIG`, `PROGRESSION_ECONOMY`, `FOOD_CONFIG`, `WAVE_BALANCE`, `COMBAT_BALANCE`) a funkce, kterými hráč jedná (`doForge`, `buyFood`, `bankTransfer`, …; vzor `ACTION_FN` v `coverage.js`).

**Stavy záznamu v manifestu:**

| Stav | Význam | Kontroluje se |
|---|---|---|
| `covered` | bot systém používá a měří | `bot`: názvy musí existovat v `lib/bot-page.js`; `metric`: musí existovat v `lib/metrics.js` |
| `measured` | zatím nejde nic dělat (např. měna bez využití), ale měří se | `metric` + důvod (`reason`) |
| `ignored` | nemá vliv na progres (UI, transientní stav) | povinný `reason` |
| `gap` | vědomě nepokryto | povinný `reason`; scénáře jsou NEAKTUÁLNÍ |

**Co se stane při nové věci ve hře:**

- Signál bez záznamu v manifestu, neplatný záznam nebo nenalezená konfigurace → `npm run balance:coverage` **selže** (kód 1) a `npm run balance:verify` se zastaví.
- Report (`report.md`, `report.json`) má na začátku výrazný banner **NEAKTUÁLNÍ** s výpisem chybějících systémů, `report.json` má `stale: true` a každý scénář má kontrolu `bot-coverage` ve stavu ❌, takže `npm run balance:sim` skončí kódem 1. Simulation Viewer ukazuje stejný banner nahoře.
- Totéž platí pro `gap`: test projde (je to vědomý dluh), ale reporty zůstanou NEAKTUÁLNÍ, dokud gap nezmizí.
- Nápověda: `node tools/balance-sim/coverage.js --init` vypíše kostru pro nové signály.

**Jak to opravit:** 1) nauč bota systém používat v `lib/bot-page.js` (jen přes skutečné herní funkce), 2) přidej metriku do `lib/metrics.js` a report, 3) zapiš záznam `covered` do manifestu a spusť `npm run balance:coverage`. Pokud systém progres neovlivňuje, zapiš `ignored` s důvodem.

**Omezení (poctivě):** hlídač pozná *objevení* nového skriptu, klíče stavu, konfigurace nebo akce. Nepozná změnu pravidel uvnitř existující funkce ani nové chování schované pod známým klíčem (to zachytí jen regresní test shody a porovnání s baseline). Kontrola `covered` ověřuje, že odkazované názvy v botovi a metrikách existují, ne že je používají smysluplně. Funkce s netypickým názvem (mimo vzor `ACTION_FN`) hlídač přehlédne, ale nový klíč stavu nebo skript, který k ní patří, ho obvykle odhalí.

## Simulation Viewer (vizuální přehrávání běhu)

Interní browser UI, které ukazuje, co bot dělá, proč mění cíl a jak se vyvíjí postava. **Není součástí hry ani dev-tools pro hráče**: žije v `tools/balance-sim/viewer/` a hra o něm neví.

```bash
npm run balance:trace -- --scenario early-game --seeds 1        # CLI uloží trace (reports/balance-sim/latest/trace/)
npm run balance:viewer                                          # lokální server → http://127.0.0.1:8787/
```

Ve Vieweru lze vybrat existující záznam, nahrát soubor trace (funguje i bez serveru: otevřete `viewer/simulation-viewer.html`) nebo zadat scénář + seed a spustit novou simulaci (server spustí stejné CLI, výsledek se uloží do `reports/balance-sim/viewer-runs/`). Krátké scénáře (`early-game`) trvají asi minutu; `level-1-100` desítky minut.
Adresa s přednačteným záznamem: `http://127.0.0.1:8787/?trace=/reports/balance-sim/latest/trace/early-game-seed-1.json`.

### Co Viewer ukazuje

1. **Ovládání:** výběr záznamu / scénáře a seedu, Start, Pauza, Reset, rychlosti 1× (1 virtuální sekunda za reálnou), 10×, 100× a Maximum (asi 1 virtuální hodina na snímek), posuvník času a krok po jedné události (tlačítka, šipky ←/→; mezerník = Start/Pauza).
2. **Stav postavy:** virtuální čas, level, XP, HP, zabití, smrti, gold získaný / utracený (kování, upgrady, opravy, jídlo) / ztracený smrtí / aktuální, materiály, nasazené itemy (tier, kvalita, upgrade, affixy).
3. **Aktuální činnost:** lokace › oblast › cíl, **vysvětlení rozhodnutí bota** (proč zůstává / proč mění cíl, skóre a práh), očekávané XP/h, zabití/h, smrti/h a zabití na jeden život podle odhadu bota a **naměřené** hodnoty za poslední hodinu, tabulka pěti nejlepších kandidátů.
4. **Události:** živý log (zabití, smrt, drop, výbava, kování, upgrade, oprava, tavení, svitek, prodej, jídlo, změna cíle, lokace, level, materiály, varování) s filtry, poslední dropy s raritou, červené upozornění na **opakované smrti** (≥ 5 smrtí za zásah bota a ≥ 0,5 smrti na zabití) a **smrtící spirálu** (3 takové zásahy po sobě).
5. **Grafy** (s tooltipy): level v čase, smrti za hodinu podle levelového pásma, gold v čase, tier výbavy podle levelu (s tierem lokace odpovídajícím levelu). Rostou s kurzorem času.
6. **Souhrn záznamu** a automatická kontrola, že odpovídá CLI reportu (`report.json` vedle trace).

### Architektura: jeden zdroj pravdy

```
hra (index.html + app.js)  ←  stejný bot (lib/bot-page.js)  ←  stejný seed a virtuální čas (lib/virtual-time.js)
        │                              │ emituje trace (události + snímky)
        ▼                              ▼
   CLI simulace (jsdom) ─────► reports/…/trace/<scénář>-seed-N.json ─────► Viewer jen přehrává
                                                                   ╰────► živý browser run: skutečná vykreslená hra se porovná s trace
```

- **Bot emituje trace.** Zápis do trace jen čte stav hry a nevolá `Math.random`; výsledek simulace je s trace i bez něj bit po bitu stejný (test to ověřuje, včetně počtu volání náhody).
- **Viewer neobsahuje herní logiku.** Zobrazuje jen data z trace (události, snímky, vysvětlení bota) a z nich odvozuje grafy a souhrny. Souhrn se počítá v `lib/trace-summary.js`, který používá Node (testy) i Viewer; porovnání s metrikami CLI je tamtéž.
- **Trace je deterministický:** stejný seed a scénář dá stejný soubor (id itemů se do trace neukládají, protože je hra generuje náhodně).

### Formát trace (`schema: 1`)

`{ kind: "balance-sim-trace", schema, seed, gameFingerprint, detail, cycleMs, sampleMs, scenario, dictionary, events, frames, ticks }`

- `events`: `{ t (virtuální ms), type, … }`. Typy: `levelup`, `death`, `drop`, `equip`, `forge`, `upgrade`, `repair`, `smelt`, `sale`, `food`, `learn`, `target` (s důvodem a skóre), `location`, `materials` (souhrn za zásah), `warning`, a jen v `full` i `kill`.
- `frames`: stavový snímek po každém zásahu bota (každých 10 virtuálních minut): level, XP, HP, zabití, smrti, gold, materiály, výbava, cíl, lokace, oblast, rozhodnutí bota (`decision`) a naměřené hodnoty za poslední hodinu (`measured`).
- `ticks`: minisnímky `[t, level, xp, hp, kills, deaths, goldEarned, balance, phase]` po `sampleMs` (jen u `--trace-detail full`, výchozí 60 s). Bot zasahuje dál jen každých 10 minut, minisnímky jen čtou stav, takže simulaci neovlivňují.
- `dictionary`: názvy nepřátel, lokací a materiálů načtené ze hry (Viewer je jen zobrazuje).

CLI přepínače: `--trace` (standard: bez jednotlivých zabití, malé soubory, stačí na grafy a log), `--trace-detail full` (každé zabití a minisnímky po 60 s; `level-1-100` má řádově desítky MB), `--sample-seconds N`.

### Živý browser run (kontrola ekvivalence)

Tlačítko „Spustit živý run“ otevře **skutečnou vykreslenou hru** (`index.html` s plným renderem a canvasem) v rámečku. Server do ní před herní skripty vloží `lib/virtual-time.js` (viz `viewer/live-boot.js`), takže běží na stejných virtuálních hodinách a se stejným seedem. Do rámečku se vloží stejný bot a odehraje se prvních N virtuálních minut (výchozí 20). Výsledné snímky a události se porovnají s trace: musí být shodné do posledního čísla. Rozdíl ukáže první odlišné pole.
To je rychlá kontrola „simulace (jsdom bez UI) = vykreslená hra“ přímo ve Vieweru; důkladná kontrola proti Chromiu s Playwrightem je v `tests/regression.js`.
Uložená hra se nemění: úložiště hry (`localStorage`, `sessionStorage`) je v rámečku jen v paměti. Živý běh vyžaduje server (`npm run balance:viewer`).

### Bezpečnost a nemodifikace

Server poslouchá jen na `127.0.0.1`, kontroluje hlavičku `Host`, povoluje jen `GET`/`HEAD` a jeden `POST /api/run` (s kontrolou `Origin`, scénář musí být ze seznamu, seed 1–9999). Statické soubory servíruje jen ze seznamu povolených cest (viewer, tři soubory z `lib/`, soubory hry v kořeni, `assets/`, `reports/**/*.json`), ne `package.json`, `.git` ani `node_modules`. Nikdy nezapisuje do herních souborů; zapisuje jen CLI do `reports/balance-sim/`.

### Test Vieweru (`npm run balance:test:viewer`)

Spustí stejný scénář a seed čtyřikrát (CLI ×3, jednou s `--trace` dvakrát a jednou bez, a jednou přes API Vieweru) a ověří:
- oba trace z CLI jsou bit po bitu stejné a stejný je i trace vytvořený přes Viewer,
- trace nezměnil výsledek simulace (včetně počtu volání náhody),
- souhrn z trace sedí s metrikami CLI reportu na každé číslo, a to jak v Node, tak spočítaný přímo ve Vieweru v Chromiu,
- ovládání (Start, Pauza, Reset, rychlosti, krok po události, posuvník), vykreslení stavu, činnosti bota, logu a čtyř grafů, tooltipy a bez chyb v konzoli,
- živý browser run je shodný s trace a záměrně pozměněný trace nebo trace s chybějící událostí je odhalen (`--quick` živý run přeskočí),
- Viewer nezměnil uloženou hru v `localStorage` ani žádný herní soubor v repozitáři, server odmítá cizí cesty, metody, `Host` i `Origin`.

## Struktura

```
tools/balance-sim/
  README.md           tento soubor
  scenarios.js        scénáře, kontroly a GUARDRAILS
  run-simulation.js   CLI: běhy po seedech (paralelně), uložení surových dat, report, baseline
  coverage.js         hlídač pokrytí: nový systém hry bez bota/metrik = NEAKTUÁLNÍ
  coverage-manifest.json  klasifikace systémů hry (covered/measured/ignored/gap)
  report.js           JSON + Markdown report, porovnání dvou reportů
  lib/virtual-time.js virtuální čas + seedovaný Math.random (sdílené jsdom i prohlížečem)
  lib/harness.js      jsdom + volání virtual-time.js
  lib/trace-summary.js souhrn z trace a porovnání s metrikami CLI (sdílí Node i Viewer)
  lib/bot-page.js     bot (běží uvnitř hry, volá jen herní funkce)
  lib/run.js          jeden běh seedu s checkpointy
  lib/metrics.js      výpočet metrik z checkpointu
  tests/regression.js regresní test proti Chromiu
  tests/coverage.js   rychlý test hlídače pokrytí (bez prohlížeče)
  tests/viewer.js     test trace a Simulation Vieweru
  viewer/             Simulation Viewer: simulation-viewer.html, viewer.js/css, live-run.js, live-boot.js, server.js
  package.json        závislosti nástroje (jsdom, playwright)
```
