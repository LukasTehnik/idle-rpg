# Idle RPG — Prototype 0.8 (Blacksmithing)

Sedmý hratelný prototyp prohlížečového idle RPG. **0.8** přidává první hratelný kovářský loop: cílené materiály → recept → vlastní item se sériovým číslem → upgrade, oprava nebo tavba. Vybraný nepřítel se po porážce vrací na stejný spot. Pracovní balance je popsán v [`docs/balance-framework.md`](docs/balance-framework.md); rozsah kovářství v [`docs/prototype-0.8-smithy.md`](docs/prototype-0.8-smithy.md).

## Spuštění

Projekt nemá žádné externí závislosti ani build krok.

```bash
python3 -m http.server 8080
```

Potom otevři `http://localhost:8080`.

## Vývojové nástroje

Rozcestník: otevři `dev-tools.html`. Obsahuje katalogy (`item-catalog.html`, `material-catalog.html`, `affix-catalog.html`), **Balance Lab** pro wave economy a dropy, testovací odkazy do hry (`?testitems`, `?testscrolls`) a příkazy pro testy (`node tests/affix-tests.js`, `node tests/ui-tests.js`). Podrobnosti: [`docs/dev-tools.md`](docs/dev-tools.md).

## Co prototyp obsahuje

- automatický souboj proti vybranému nepříteli,
- **(0.8)** Kovář: pět datových receptů, permanentní naučení svitků, volitelný prefix + suffix s existující validací konfliktů, jedinečné sériové číslo vyrobeného kusu, quality podle kvality použitých materiálů, riziko úspěchu, upgrade `+0` až `+15`, pomalá eventová odolnost/oprava a nevratná tavba přebytečné kořisti,
- mapu s lokacemi (Okraj starého lesa, Pustina ticha, Odpadkové hory, Magma a Elektrika) a výběrem konkrétního nepřítele k farmení — viz `world-data.js`,
- zahájení a pozastavení výpravy,
- rozdílnou rychlost útoku postavy a nepřítele, obranu nepřítele snižující příchozí poškození,
- náhodné poškození a 10% šanci na kritický zásah,
- HP, smrt a automatický návrat postavy,
- XP, gold a levelování s růstem základních statů,
- třísekundové hledání dalšího nepřítele stejného typu,
- živý combat log, počet vítězství a čas výpravy,
- **(UI shell)** aplikační shell: pevný levý sidebar, horní stavová lišta a samostatné stránky Postava / Inventář / Mapa / Boj (hash routing, boj běží na pozadí při přepínání),
- **(UI shell)** inventář jako paper-doll: 8 slotů kolem náhledu postavy, inventářový grid vedle něj a persistentní detail itemu s porovnáním,
- responzivní zobrazení pro desktop, tablet a telefon (na mobilu vysouvací menu a detail jako celoobrazovkový panel),
- náhodné dropy z 31 typů předmětů (běžná sada, tematická „andělská" sada se září a „chitinová" sada z Pustiny ticha),
- **(obsah)** lokace Okraj starého lesa, Pustina ticha, Magma, Elektrika (plně hratelné) a Odpadkové hory (náhled bez kořisti) s dodanými backgroundy, nepřáteli, itemy a materiály; statistiky nových lokací jsou pracovní,
- **(mapa)** skutečná obrazová mapa světa s body lokací z dat (`mapPosition` v %), rychlým tooltipem, detailem lokace (background, záložky Informace / Nepřátelé / Kořist) a potvrzeným vstupem do lokace; prohlížení mapy boj nezastaví,
- **(boj na pozadí)** živý combat widget v sidebaru (na mobilu stavový pruh) se statistikami současného farmení (poražení, XP, gold, čas) a pause/resume z jakékoli stránky,
- **(0.4)** šest nepřátel Pustiny ticha s finálními jmény (Prašná můra, Plastová můra, Slepá můra, Pamětnice, Můra z hlubiny, Matka děr) a typem COMMON / UNCOMMON / RARE / ELITE / BOSS,
- **(0.4)** sedm materiálů (`material-data.js`) se stabilními ID, cílené drop tabulky každého nepřítele (`world-data.js`) a sekce „Možná kořist“ v mapě,
- **(0.4)** inventář rozdělený na záložky VYBAVENÍ (18 míst) a MATERIÁLY (stackuje se, nezabírá místa), detail materiálu se zdroji, přehled posledních dropů u boje,
- šest kvalit (Common → God) s jednotným vzhledem, viz [`docs/item-visual-rarity-rules.md`](docs/item-visual-rarity-rules.md),
- náhodné hodnoty poškození, HP a kritického zásahu,
- **(0.5)** inventář s kapacitou 60, NOVÝ / oblíbené / zámek, filtry, řazení, hledání, hromadný výběr, nevyzvednutá kořist při plném inventáři,
- **(0.5)** porovnání itemu se stejným slotem podle výsledných statů postavy,
- **(0.5)** Obchodník (výkup, zpětný odkup 10 kusů, pravidla auto-prodeje, loot log), Banka a ztráta 5 % neseného zlata při smrti,
- **(0.5)** Bestiář, Sbírka a dlouhodobé statistiky,
- 8 slotů vybavení (zbraň, zbroj, helma, rukavice, boty, kalhoty, talisman, křídla),
- katalog předmětů (`item-catalog.html`) pro statický přehled všech ikon a efektů,
- detail předmětu na klik — výrazně zvětšená ikona (object-fit: contain, zachovaný poměr stran), plné staty, zdroj úlovku, čas získání a obchodovatelnost, dostupné z inventáře i z vybavených slotů,
- neblokující oznámení o dropu (log + automaticky mizející toast) namísto modálu vyžadujícího potvrzení,
- výměnu vybavení a okamžitý přepočet statů,
- lokální uložení postupu v prohlížeči (včetně vybrané lokace/nepřítele a goldu),
- kompaktní černobílé systémové UI s barevným zvýrazněním vzácné kořisti a statickým, slabším glow efektem signature předmětů.

## Struktura souborů

```text
index.html          shell, stránky (Postava, Inventář, Obchodník, Banka, Bestiář, Sbírka, Mapa, Boj)
app.js              stav, boj, inventář, obchod, banka, bestiář, sbírka, router, uložení
economy-data.js     (0.5) kapacita, síla itemu, prodejní vzorec, ztráta při smrti
quality-data.js     (0.5.1) centrální kvality, normalizace, odvození vizuálních tříd
item-data.js        šablony vybavení (templateId), ikony, composeItem()
material-data.js    materiály (jedna definice, kvalita je hodnota dropu/stacku)
item-catalog.html / material-catalog.html   katalogy + QUALITY PREVIEW
stat-data.js        (0.6) centrální registr statů
affix-data.js       (0.6) 64 affixů, zdrojové pooly
affix-logic.js      (0.6) rolly, pravidla, capy, view model, validace, migrace affixů
scroll-ui.js        (0.6) jednotná komponenta svitku
affix-catalog.html  (0.6) DEV nástroj (není pro hráče)
tests/              (0.6) node tests/affix-tests.js, node tests/ui-tests.js
world-data.js       lokace a nepřátelé (zdroj pravdy i pro bestiář a sbírku)
styles.css          styly
docs/               prototype-0.2 … 0.5, navrh-hry.md, UI reference
assets/             ikony, materiály, backgroundy, mapa, fonty
```

## Pracovní balance

Hodnoty jsou nastavení pro první pocitový test. Nejsou schválenými pravidly finální hry. **Tabulka je zděděná z 0.3** a nezahrnuje nové ekonomické hodnoty 0.5 (kapacita 60, ceny, 5% ztráta) — ty jsou v `economy-data.js` a [`docs/prototype-0.5.md`](docs/prototype-0.5.md).

| Pravidlo | Prototyp 0.3 |
| --- | ---: |
| Životy hráče | 100 |
| Poškození hráče | 9–13 |
| Útok hráče | každých 1,6 s |
| Kritický zásah | 10 %, dvojnásobné poškození |
| Životy Goblina | 48 |
| Poškození Goblina | 5–8 |
| Útok Goblina | každých 2,2 s |
| XP za Goblina | 18 |
| Hledání dalšího nepřítele | 3 s |
| Návrat po smrti | 5 s |
| Léčení po vítězství | 10 % maximálních HP |
| Růst při levelu | +15 HP, +2 min/max damage |
| Šance na předmět (Goblin) | 42 % za vítězství |
| Rarity | 74 % běžná, 22 % vzácná, 4 % epická |
| Kapacita inventáře (0.3, nyní 60) | 18 předmětů |

## Hranice této verze

Prototype 0.5 zatím neobsahuje crafting, recepty, hráčský market, offline postup, účty, questy ani finální balanci dropů. Tyto systémy patří do dalších testovacích verzí. Drop rate je záměrně vysoký, aby šel materiálový systém během krátkého testu vyhodnotit. Staty nepřátel a drop tabulky jsou pracovní balance — vše je centrálně v `world-data.js` a `material-data.js` pro snadné pozdější doladění. Kompletní dosavadní návrh je v souboru [`docs/navrh-hry.md`](docs/navrh-hry.md).

## Grafika

Portréty Poutníka a Goblina používají upravené SVG ikony z open-source balíčku
[game-icons.net](https://game-icons.net) (licence CC BY 3.0). Zdroje a autoři jsou uvedeni
v [`assets/icons/CREDITS.md`](assets/icons/CREDITS.md).

Materiály Pustiny ticha (`assets/materials/*.png`) jsou dodané ilustrace v původní velikosti a barevnosti; prohlížeč je zmenšuje přes CSS (`object-fit: contain`).

Nepřátelé a itemy lokace Pustina ticha (`assets/icons/enemies/pustina-ticha-*.png`,
`assets/icons/items/chitin-*.png`) jsou dodané hotové assety, beze změny obsahu — pouze
proporcionálně zmenšené (LANCZOS, zachovaný poměr stran a průhlednost) na velikost
odpovídající zbytku sady ikon.

## Vzhled

Od verze 0.5 používá rozhraní teplé retro RPG téma (hnědé povrchy, zlatý akcent, pixelový display font). Popis palety, kontrastu, typografie a stavů komponent je v [`docs/ui-direction.md`](docs/ui-direction.md), fonty a licence v [`assets/fonts/README.md`](assets/fonts/README.md).

## Struktura

- `index.html` — aplikační shell a čtyři stránky (Postava, Inventář, Mapa, Boj),
- `styles.css` — responzivní vizuální vrstva (retro RPG téma, centrální design tokeny v `:root`),
- `assets/fonts/` — lokální fonty (Jersey 10) a jejich licence OFL,
- `app.js` — stav hry, souboj, mapa světa/detail lokace/vstup, combat widget a postup,
- `item-data.js` — sdílená data předmětů (sloty, ikony, šablony předmětů),
- `material-data.js` — centrální data materiálů a svitků (stabilní ID, výchozí kvalita, zdroje, popis),
- `world-data.js` — lokace (pozice na mapě, level, background, stav) a nepřátelé (staty, cílené drop tabulky) pro tok mapa → lokace → nepřítel → farmení; `WORLD_MAP` = cesta k mapovému assetu,
- `assets/map/` — **dočasný** mapový podklad (`world-map-temporary.svg`); finální mapu stačí uložit jako jeden soubor a změnit `WORLD_MAP` ve `world-data.js`,
- `quality-data.js` — jediný zdroj pravdy o kvalitách (id, label, rank, glow, povolení pro stackovatelné) a validace,
- `item-catalog.html`, `material-catalog.html` — statické přehledy předmětů a materiálů včetně QUALITY PREVIEW,
- `docs/navrh-hry.md` — dosavadní návrhový dokument,
- `docs/prototype-0.2.md` — cíle, pracovní balance a scénář testování Prototype 0.2.
- `docs/prototype-0.3.md` — cíle, pracovní balance a scénář testování Prototype 0.3 (historický dokument).
- `docs/prototype-0.4.md` — cíle, materiály, drop tabulky, migrace a scénář testování aktuální verze.
- `docs/ui-direction.md` — pravidla vizuálního směru pro další verze.
- `docs/visual-language-reference.md` — rozbor referencí a plán převodu jejich vizuálního jazyka do hry.

## Kvality (0.5.1)

Item i materiál nese jen sémantickou hodnotu `quality` (`common`, `rare`, `epic`, `legendary`, `mythic`, `god`). Barvy, rámy a glow odvozuje výhradně `applyQualityVisuals()` ze `quality-data.js`; v datech nejsou žádné CSS třídy. God je zakázaný u materiálů a dalších stackovatelných předmětů (spadne na common s varováním v dev režimu). Kvalita zatím **nemění staty, ceny ani drop rate**. Křídla jsou vždy zlatá; zlatá aura jen s explicitním `wingGlow: "gold"`. Maximálně vylepšený item (`isMaxUpgraded`) má neutrální MAX vrstvu, která nemění barvu kvality.

Podrobný popis a návody jak přidat dropy je v [`docs/prototype-0.5.1.md`](docs/prototype-0.5.1.md).

## Cloudové ukládání
Supabase (anonymní účet + tabulka `saves` s RLS). Podrobnosti: `docs/cloud-save.md`. Vypnutí: `?nocloud`.
