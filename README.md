# Idle RPG — Prototype 0.2

Druhý hratelný prototyp prohlížečového idle RPG. Ověřuje otázku: **je získávání a porovnávání náhodné kořisti dostatečně zajímavé, aby podporovalo další farmení?**

## Spuštění

Projekt nemá žádné externí závislosti ani build krok.

```bash
python3 -m http.server 8080
```

Potom otevři `http://localhost:8080`.

## Co prototyp obsahuje

- automatický souboj proti vybranému nepříteli,
- mapu s lokacemi (Okraj starého lesa, Pustina ticha) a výběrem konkrétního nepřítele k farmení — viz `world-data.js`,
- zahájení a pozastavení výpravy,
- rozdílnou rychlost útoku postavy a nepřítele, obranu nepřítele snižující příchozí poškození,
- náhodné poškození a 10% šanci na kritický zásah,
- HP, smrt a automatický návrat postavy,
- XP, gold a levelování s růstem základních statů,
- třísekundové hledání dalšího nepřítele stejného typu,
- živý combat log, počet vítězství a čas výpravy,
- responzivní zobrazení pro desktop, tablet a telefon,
- náhodné dropy z osmnácti typů předmětů (běžná sada, tematická „andělská" sada se září a „chitinová" sada z Pustiny ticha),
- generický mechanismus stackování materiálů v inventáři (zatím bez konkrétního materiálového assetu),
- běžnou, vzácnou a epickou raritu,
- náhodné hodnoty poškození, HP a kritického zásahu,
- inventář pro 18 předmětů,
- 7 slotů vybavení (zbraň, zbroj, helma, rukavice, boty, kalhoty, talisman),
- katalog předmětů (`item-catalog.html`) pro statický přehled všech ikon a efektů,
- detail předmětu na klik — výrazně zvětšená ikona (object-fit: contain, zachovaný poměr stran), plné staty, zdroj úlovku, čas získání a obchodovatelnost, dostupné z inventáře i z vybavených slotů,
- neblokující oznámení o dropu (log + automaticky mizející toast) namísto modálu vyžadujícího potvrzení,
- výměnu vybavení a okamžitý přepočet statů,
- lokální uložení postupu v prohlížeči (včetně vybrané lokace/nepřítele a goldu),
- kompaktní černobílé systémové UI s barevným zvýrazněním vzácné kořisti a statickým, slabším glow efektem signature předmětů.

## Pracovní balance

Hodnoty jsou nastavení pro první pocitový test. Nejsou schválenými pravidly finální hry.

| Pravidlo | Prototyp 0.1 |
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
| Šance na předmět | 42 % za vítězství |
| Rarity | 74 % běžná, 22 % vzácná, 4 % epická |
| Kapacita inventáře | 18 předmětů |

## Hranice této verze

Prototype 0.2 zatím neobsahuje banku, crafting, offline postup, účty ani market. Tyto systémy patří do dalších testovacích verzí. Drop rate je záměrně vysoký, aby šel loot během krátkého testu vyhodnotit. Enemy jména v Pustině ticha ("Nepřítel 1"–"Nepřítel 6") jsou dočasná zástupná jména, stejně jako jejich staty a drop tabulky — vše je centrálně v `world-data.js` pro snadné pozdější doladění. Kompletní dosavadní návrh je v souboru [`docs/navrh-hry.md`](docs/navrh-hry.md).

## Grafika

Portréty Poutníka a Goblina používají upravené SVG ikony z open-source balíčku
[game-icons.net](https://game-icons.net) (licence CC BY 3.0). Zdroje a autoři jsou uvedeni
v [`assets/icons/CREDITS.md`](assets/icons/CREDITS.md).

Nepřátelé a itemy lokace Pustina ticha (`assets/icons/enemies/pustina-ticha-*.png`,
`assets/icons/items/chitin-*.png`) jsou dodané hotové assety, beze změny obsahu — pouze
proporcionálně zmenšené (LANCZOS, zachovaný poměr stran a průhlednost) na velikost
odpovídající zbytku sady ikon.

## Struktura

- `index.html` — struktura rozhraní,
- `styles.css` — responzivní vizuální vrstva,
- `app.js` — stav hry, souboj, mapa/výběr cíle a postup,
- `item-data.js` — sdílená data předmětů (rarity, sloty, ikony, šablony předmětů),
- `world-data.js` — lokace a nepřátelé (staty, drop tabulky) pro tok mapa → lokace → nepřítel → farmení,
- `item-catalog.html` — statický přehled všech předmětů,
- `docs/navrh-hry.md` — dosavadní návrhový dokument,
- `docs/prototype-0.2.md` — cíle, pracovní balance a scénář testování této verze.
- `docs/ui-direction.md` — pravidla vizuálního směru pro další verze.
- `docs/visual-language-reference.md` — rozbor referencí a plán převodu jejich vizuálního jazyka do hry.
