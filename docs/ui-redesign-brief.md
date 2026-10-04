# UI redesign — brief (DRAFT k odsouhlasení)

Stav: **návrh, žádný kód zatím nezměněn.** Po odsouhlasení se dělá po jedné obrazovce.

## Proč
Současné UI je zdědění po retro tématu: velké písmo, velké mezery, všechno stejné váhy. Hráč neví, kam se dívat, a na itemy zbývá málo místa. Cílem je klidná, teplá, prostorná hra, kde **staty a itemy vedou** a vedlejší informace ustoupí.

## Rozhodnutí (odsouhlaseno)
1. **Mobile first.** Návrh se dělá pro telefon (~390 px) a rozšiřuje na desktop.
2. **Navigace:** desktop = levé menu (zůstává, čistší). Telefon = spodní lišta (hlavní: Boj, Inventář, Postava, Kovář + „Další").
3. **Písmo:** volně dostupný bezpatkový font (návrh: Inter, SIL OFL, hostovaný lokálně, bez externích závislostí). Čísla s `tabular-nums`, aby se staty četly pod sebou.
4. **Styl:** čistý minimalistický, bez retro rámečků a pixelových stínů. Měkké rohy, jemné oddělení ploch, málo čar.
5. **Assety zůstávají pixel art.** Na hladkých dlaždicích, zvětšují se po celých násobcích, `image-rendering: pixelated`.
6. **Rarita:** vše vzácné má zářit a působit draze (viz níže).

## Hierarchie informací (hlavní pravidlo)
Každá obrazovka má tři úrovně a nesmí je míchat:

| Úroveň | Co | Jak vypadá |
| --- | --- | --- |
| 1 Hlavní | staty, jméno itemu, kvalita, akce (Nasadit, Ukovat…) | největší písmo / kontrast, vždy nahoře |
| 2 Podpůrná | úroveň, upgrade, odolnost, požadavky | střední, plný kontrast |
| 3 Pozadí | původ itemu, datum, sériové číslo, popisy | malé, tlumené, na konci nebo rozbalovací |

Příklad detailu itemu: nahoře jméno + kvalita, pod tím velké staty (s porovnáním s nasazeným), potom affixy, a až úplně dole „Původ: …, nalezeno …".

## Rozvržení
- **Inventář:** velká mřížka dlaždic (na telefonu 4 sloupce, na desktopu 6–8) jako hlavní prvek. Filtry sbalené do jednoho řádku (hledání + tlačítko „Filtry"). Detail itemu jako spodní panel (telefon) / pravý sloupec (desktop). Nasazená výbava jako kompaktní pruh nad mřížkou.
- **Boj:** scéna menší (řádek, ne celá obrazovka). Nahoře stav bojovníků, pod ním živý záznam a drop. Tlačítko Start/Stop vždy po ruce.
- **Postava:** staty jako hlavní prvek, doplněné grafem (např. porovnání s nasazenou/ostatní výbavou), výbava jako dlaždice.
- **Kovář:** jeden sloupec na telefonu: recept → materiály s ikonou (22 px) → výsledek → akce.
- **Horní lišta:** jen to, co je třeba vidět pořád (úroveň, XP, nesené zlato). Ostatní (banka, úlomky) do podstránky/rozbalení.
- **Boční widget souboje:** na desktopu úzký, na telefonu se nahradí malým pruhem nad spodní lištou.

## Rozměry (výchozí návrh)
- Základní text 15–16 px, popisky 12–13 px, nadpis stránky 22–24 px. Ne větší.
- Mezery po násobcích 4 px (4/8/12/16/24).
- Dotykové cíle min. 44 px.
- Dlaždice itemu: telefon ≥ 72 px, desktop ≥ 88 px.

## Rarita (musí zářit a působit draze)
Tmavé teplé pozadí je kvůli tomu nutné: záře je na světlém pozadí neviditelná. Proto navrhuji **teplé tmavé téma** (espresso / grafit), ne bílé.

| Kvalita | Projev |
| --- | --- |
| Common | bez efektu, neutrální rámeček |
| Rare | čistá barevná linka, jemný barevný nádech dlaždice |
| Epic | + měkká vnější záře |
| Legendary | + zlatý/tyrkysový lesk, pomalý jemný záblesk přes dlaždici |
| Mythic | + sytá záře, jemné částice |
| God | vícebarevný přechod, výrazná záře a pomalý lesk |

Efekty jsou statické nebo velmi pomalé, respektují `prefers-reduced-motion` a mají limit jasu. Barva není jediný indikátor, název kvality se píše.

## Postup
1. Odsouhlasit tento dokument (hlavně motiv: tmavé vs. světlé, viz otevřená otázka).
2. Vytvořit sdílené „design tokeny" (barvy, písmo, mezery) na jednom místě.
3. Přepsat obrazovky po jedné v pořadí: **Inventář → Boj → Postava → Kovář → ostatní**. Po každé commit + kontrola na telefonu i desktopu.
4. Stávající logika, save a testy se nemění.

## Otevřené otázky
- **Tmavé teplé vs. světlé téma?** (návrh: tmavé teplé kvůli záři; světlé lze přidat později přes tokeny)
- Má zůstat nějaký „herní" prvek (ikony, nadpisy), nebo čistě minimalistické?
- Má se hra i na desktopu držet užšího sloupce, nebo využít celou šířku (grafy, víc sloupců)?
