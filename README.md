# Idle RPG — Prototype 0.2

Druhý hratelný prototyp prohlížečového idle RPG. Ověřuje otázku: **je získávání a porovnávání náhodné kořisti dostatečně zajímavé, aby podporovalo další farmení?**

## Spuštění

Projekt nemá žádné externí závislosti ani build krok.

```bash
python3 -m http.server 8080
```

Potom otevři `http://localhost:8080`.

## Co prototyp obsahuje

- automatický souboj Poutník vs. Goblin,
- zahájení a pozastavení výpravy,
- rozdílnou rychlost útoku postavy a nepřítele,
- náhodné poškození a 10% šanci na kritický zásah,
- HP, smrt a automatický návrat postavy,
- XP, levelování a růst základních statů,
- třísekundové hledání dalšího Goblina,
- živý combat log, počet vítězství a čas výpravy,
- responzivní zobrazení pro desktop, tablet a telefon.
- náhodné dropy z dvanácti typů předmětů (včetně tematické „andělské" sady se září),
- běžnou, vzácnou a epickou raritu,
- náhodné hodnoty poškození, HP a kritického zásahu,
- inventář pro 18 předmětů,
- 7 slotů vybavení (zbraň, zbroj, helma, rukavice, boty, kalhoty, talisman),
- katalog předmětů (`item-catalog.html`) pro statický přehled všech ikon a efektů,
- výměnu vybavení a okamžitý přepočet statů,
- lokální uložení postupu v prohlížeči.
- kompaktní černobílé systémové UI s barevným zvýrazněním vzácné kořisti.

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

Prototype 0.2 zatím neobsahuje gold, banku, crafting, offline postup, účty ani market. Tyto systémy patří do dalších testovacích verzí. Drop rate je záměrně vysoký, aby šel loot během krátkého testu vyhodnotit. Kompletní dosavadní návrh je v souboru [`docs/navrh-hry.md`](docs/navrh-hry.md).

## Grafika

Portréty Poutníka a Goblina používají upravené SVG ikony z open-source balíčku
[game-icons.net](https://game-icons.net) (licence CC BY 3.0). Zdroje a autoři jsou uvedeni
v [`assets/icons/CREDITS.md`](assets/icons/CREDITS.md).

## Struktura

- `index.html` — struktura rozhraní,
- `styles.css` — responzivní vizuální vrstva,
- `app.js` — stav hry, souboj a postup,
- `docs/navrh-hry.md` — dosavadní návrhový dokument,
- `docs/prototype-0.2.md` — cíle, pracovní balance a scénář testování této verze.
- `docs/ui-direction.md` — pravidla vizuálního směru pro další verze.
- `docs/visual-language-reference.md` — rozbor referencí a plán převodu jejich vizuálního jazyka do hry.
