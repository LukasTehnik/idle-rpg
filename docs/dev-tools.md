# Vývojové nástroje

Všechny jsou statické stránky bez build kroku; rozcestník je `dev-tools.html`. Nejsou pro hráče.

| Nástroj | Účel |
| --- | --- |
| `item-catalog.html` | přehled všech předmětů a ikon, QUALITY PREVIEW — EQUIPMENT |
| `material-catalog.html` | přehled materiálů, QUALITY PREVIEW — MATERIALS |
| `affix-catalog.html` | 64 affixů s interními daty, filtry (typ, tier, stat, slot), náhled „co vidí hráč", sandbox itemu (prefix/suffix, rolly, porovnání), skeny konfliktů, test capů a negativních modifierů, drop fixture a simulace, registr statů, test migrace savu |
| `index.html?testitems#/inventar` | přidá do inventáře itemy všech kvalit |
| `index.html?testscrolls#/inventar` | přidá 64 svitků a 3 itemy s affixy |
| `node tests/affix-tests.js` | 50 logických testů (Node, bez závislostí) |
| `node tests/ui-tests.js` | 10 UI testů (Playwright; server na `localhost:8765`, `PLAYWRIGHT_MODULE` / `CHROME_PATH` lze přepsat) |

Lokální server: `python3 -m http.server 8080` (pro UI testy port 8765).
