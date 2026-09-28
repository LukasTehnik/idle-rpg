# Prototype 0.2 — test kořisti

## Cíl testu

Zjistit, zda náhodný předmět, jeho odhalení, porovnání a vybavení vytvářejí dostatečný důvod pokračovat ve farmení stejného nepřítele.

## Co sledovat

1. Je první drop srozumitelný bez vysvětlování?
2. Je rozdíl mezi běžným a vzácným předmětem okamžitě patrný?
3. Rozumí hráč tomu, který stat se po vybavení změnil?
4. Má hráč chuť čekat na lepší roll stejného předmětu?
5. Je 3sekundová prodleva po vítězství příjemná i při častějších dropách?
6. Vadí, že souboj pokračuje pod otevřeným oknem s nalezenou kořistí?

## Pracovní nastavení

- 42% šance na předmět po vítězství,
- 74 % běžný, 22 % vzácný a 4 % epický předmět,
- 6 základních typů předmětů,
- 3 sloty: zbraň, zbroj a talisman,
- inventář pro 18 nevystrojených předmětů,
- stav se ukládá lokálně v prohlížeči.

Tato čísla slouží rychlému uživatelskému testu. Nejsou návrhem finální ekonomiky ani drop rates.

## Známé hranice

- Přibližné porovnání „síly“ převádí různé staty na jedno pomocné číslo. Finální hra bude potřebovat porovnání podle buildu.
- Inventář zatím neumí předměty prodat, zahodit ani filtrovat.
- Vybavení nemá požadavky na úroveň.
- Předměty zatím nemají cenu, původ, veřejné sériové číslo ani historii vlastníků.
- Loot se ukládá jen v konkrétním prohlížeči, protože zatím neexistují účty ani serverové ukládání.

## Přechod k Prototype 0.3

Hotovo — viz [`docs/prototype-0.3.md`](prototype-0.3.md). Prototype 0.3 přidal mapu lokací, výběr konkrétního nepřítele k farmení a druhou lokaci (Pustina ticha) s vlastní drop tabulkou. Banka a 5% ztráta zlata při smrti zůstávají otevřené pro další verzi.
