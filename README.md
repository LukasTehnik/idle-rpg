# Idle RPG — Prototype 0.1

První hratelný prototyp prohlížečového idle RPG. Ověřuje základní otázku: **je příjemné sledovat automatický boj, vítězství a postup postavy?**

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

## Hranice této verze

Prototype 0.1 zatím neobsahuje inventář, loot, gold, banku, crafting, offline postup, účty ani market. Tyto systémy patří do dalších testovacích verzí. Kompletní dosavadní návrh je v souboru [`docs/navrh-hry.md`](docs/navrh-hry.md).

## Struktura

- `index.html` — struktura rozhraní,
- `styles.css` — responzivní vizuální vrstva,
- `app.js` — stav hry, souboj a postup,
- `docs/navrh-hry.md` — dosavadní návrhový dokument.
