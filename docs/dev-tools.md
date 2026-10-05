# Vývojové nástroje

Všechny jsou statické stránky bez build kroku; rozcestník je `dev-tools.html`. Nejsou pro hráče.

| Nástroj | Účel |
| --- | --- |
| `item-catalog.html` | přehled všech předmětů a ikon, QUALITY PREVIEW — EQUIPMENT |
| `material-catalog.html` | přehled materiálů, QUALITY PREVIEW — MATERIALS |
| `affix-catalog.html` | 64 affixů s interními daty, filtry (typ, tier, stat, slot), náhled „co vidí hráč", sandbox itemu (prefix/suffix, rolly, porovnání), skeny konfliktů, test capů a negativních modifierů, drop fixture a simulace, registr statů, test migrace savu |
| `balance-lab.html` | sequential wave calculator (H = hits/enemy), cílový drop calculator, affix → smelting scroll chain, report existujících drop tabulek a lokální telemetry měřeného runu |
| `index.html?testitems#/inventar` | přidá do inventáře itemy všech kvalit |
| `index.html?testscrolls#/inventar` | přidá 64 svitků a 3 itemy s affixy |
| `node tests/affix-tests.js` | 50 logických testů (Node, bez závislostí) |
| `node tests/ui-tests.js` | 10 UI testů (Playwright; server na `localhost:8765`, `PLAYWRIGHT_MODULE` / `CHROME_PATH` lze přepsat) |

Lokální server: `python3 -m http.server 8080` (pro UI testy port 8765).

## Balance Lab: 15min test

1. Otevři `balance-lab.html` a klikni **START NEW MEASUREMENT**. Stav se přepne na „MĚŘENÍ ČEKÁ NA BOJ“.
2. Vrať se do hry, vyber jeden konkrétní enemy a nech boj běžet alespoň 15 minut.
3. Vrať se do Balance Labu. Uvidíš measured kills/hour, median clear time, cooldown, XP/gold/hour a pozorované dropy/hour. Kalkulátor nahoře používá počet ran na jednoho enemy a interval útoku; 14 zobrazených enemy se nezabíjí paralelně.
4. Klikni **END & SAVE RUN**. Měření se jasně ukončí, uloží mezi snapshoty a hra ho už dál nepřepisuje. Historie drží posledních 20 lokálních měření.
5. Stejný test proveď pro underpowered, expected a overpowered postavu. Při dalším ladění změň vždy jen jednu věc: HP, cooldown, XP, gold nebo jeden konkrétní drop.
