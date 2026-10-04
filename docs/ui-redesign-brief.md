# UI redesign — brief (DRAFT k odsouhlasení)

Stav: **návrh, žádný kód zatím nezměněn.** Po odsouhlasení se dělá po jedné obrazovce.

## Proč
Současné UI je zdědění po retro tématu: velké písmo, velké mezery, všechno stejné váhy. Hráč neví, kam se dívat, a na itemy zbývá málo místa. Cílem je klidná, teplá, prostorná hra, kde **staty a itemy vedou** a vedlejší informace ustoupí.

## Rozhodnutí (odsouhlaseno)
1. **Mobile first.** Návrh se dělá pro telefon (~390 px) a rozšiřuje na desktop.
2. **Navigace:** desktop = levé menu (zůstává, čistší). Telefon = spodní lišta (hlavní: Boj, Inventář, Postava, Kovář + „Další").
3. **Písmo:** volně dostupný bezpatkový font (návrh: Inter, SIL OFL, hostovaný lokálně, bez externích závislostí). Čísla s `tabular-nums`, aby se staty četly pod sebou.
4. **Téma:** světlé, teplé (krémové).
5. **Styl:** čistý minimalistický, bez retro rámečků a pixelových stínů. Měkké rohy, jemné oddělení ploch, málo čar.
6. **Assety zůstávají pixel art.** Na hladkých dlaždicích, zvětšují se po celých násobcích, `image-rendering: pixelated`.
7. **Rarita:** vše vzácné má zářit a působit draze (viz níže).

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

## Téma: světlé, teplé (odsouhlaseno)
Papírově krémové pozadí, teplá šedá/hnědá pro text, jedna akcentní barva pro akce. Všechny barvy jsou jako tokeny na jednom místě (`:root`), takže jde později doplnit i tmavou variantu.

| Token | Návrh |
| --- | --- |
| Pozadí stránky | teplá krémová (~`#f6f1e9`) |
| Povrch / karta | světlejší krém až bílá (~`#fffdf9`), jemný okraj a měkký stín |
| Text hlavní / vedlejší / tlumený | tmavě hnědá (~`#2b2620`) / `#6b6258` / `#9a9086` |
| Akcent (akce, vybraný stav) | teplá terakota nebo zlatavá okrová (jedna barva, ne víc) |
| Dobré / špatné | tlumená zelená / tlumená červená (dost kontrastní na krému) |

## Rarita (musí zářit a působit draze) na světlém pozadí
Samotná záře kolem dlaždice se na světlém pozadí ztratí. Proto se vzácnost nedělá vnější září, ale **sytou plochou dlaždice**, která na krémovém pozadí vyskočí (jako plakáty ve FilScreen):

- **Common:** neutrální teplá dlaždice, bez efektu.
- **Rare a výš:** dlaždice dostane sytý barevný přechod (hluboká modrá, fialová, tyrkys, červená), jemný vnitřní lesk a barevný stín pod dlaždicí. Pixel art itemu na ní zůstává ostrý a čitelný.
- **Legendary a výš:** navíc pomalý lesk (světelný pruh, který občas přejede přes dlaždici) a jemná jiskra v rohu.
- **God:** vícebarevný přechod, výraznější lesk a dvojitý rámeček.

| Kvalita | Projev |
| --- | --- |
| Common | neutrální dlaždice |
| Rare | sytá modrá, vnitřní lesk, barevný stín |
| Epic | sytá fialová, silnější lesk a stín |
| Legendary | tyrkys/zlato, pomalý lesk přes dlaždici |
| Mythic | sytá červená, lesk + jiskry |
| God | vícebarevný přechod, lesk, dvojitý rámeček |

Efekty jsou statické nebo velmi pomalé a respektují `prefers-reduced-motion`. Barva není jediný indikátor, název kvality se vždy píše. V seznamech a řádcích (kovář, materiály) se kvalita ukazuje jen drobnou barevnou tečkou nebo štítkem, ne celou plochou.

## Postup
1. Odsouhlasit tento dokument.
2. Vytvořit sdílené „design tokeny" (barvy, písmo, mezery) na jednom místě.
3. Přepsat obrazovky po jedné v pořadí: **Inventář → Boj → Postava → Kovář → ostatní**. Po každé commit + kontrola na telefonu i desktopu.
4. Stávající logika, save a testy se nemění.

## Otevřené otázky
- Má zůstat nějaký „herní" prvek (ikony, nadpisy), nebo čistě minimalistické?
- Má se hra i na desktopu držet užšího sloupce, nebo využít celou šířku (grafy, víc sloupců)?


## Stav implementace (0.9)

- Světlé téma je nasazené pro celou hru jako samostatná vrstva `theme-light.css` (načítá se po `styles.css`, smazáním řádku v `index.html` se vrátí původní vzhled). Platí i pro katalogy a dev stránky.
- Písmo Inter je uložené lokálně (`assets/fonts/inter-*.woff2`, licence `OFL-Inter.txt`).
- Na šířce do 899 px nahrazuje levé menu spodní lišta (Boj, Inventář, Postava, Kovář, Další); „Další“ otevře původní menu.
- Inventář: dlaždice podle kvality, filtry za tlačítkem „Filtry“ na mobilu, detail s hierarchií Základ → Vlastnosti → ostatní.
- Logika, data a ukládání se nezměnily (save zůstává ve verzi 8). Testy: `tests/ui-tests.js` 10/10, `tests/affix-tests.js` 50/50.
