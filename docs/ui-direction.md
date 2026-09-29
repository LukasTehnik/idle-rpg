# Vizuální směr UI

Tento dokument drží jednotný vizuální jazyk prototypu při dalších úpravách.

## Základ

> Od Prototype 0.5 platí vizuální směr z oddílu **Retro RPG téma** na konci tohoto dokumentu (teplé hnědé povrchy, zlatý akcent, pixelový display font). Původní monochromatická pravidla níže jsou historická; zůstává z nich hranatost, ostré linky a střídmost efektů.

- Panely jsou hranaté a bez měkkých stínů, používá se pouze tvrdý pixelový stín.
- Hierarchii tvoří rámečky, kontrast ploch a hustota dat.

## Barva a rarita

Barva je odměna, ne dekorace. Běžné herní prvky proto zůstávají monochromatické.

- **Běžné předměty:** bílá a šedá.
- **Vzácné předměty:** tyrkysovo-modrý gradient.
- **Epické předměty:** emeraldovo-modro-fialový gradient.
- **Speciální a vymaxované sety:** mohou dostat vlastní zářivý gradient, ale musí zůstat výjimečné.

Gradient se může objevit v názvu, tenké horní lince nebo ohraničení předmětu. Velké barevné plochy se nepoužívají, aby se neztratila informační hierarchie.

## Vzácné vybavení na postavě

Vzácnost se po nasazení nesmí projevit jen barevným názvem v inventáři. Musí být viditelná také přímo na náhledu postavy. Referenční náladou jsou výrazné upgrady a „Excellent“ sety ze starších MMORPG, zejména MU Online: silná magická záře, ostré energetické tahy a přehnaný pocit síly. Nejde ale o kopírování konkrétních modelů nebo efektů.

### Vizuální charakter

- Záře má mít téměř bílé, přepálené jádro a barevný okraj podle rarity nebo setu.
- Místo jednoho hladkého rozostřeného neonu se skládá z několika vrstev: světelný lem předmětu, lokální aura, ostré paprsky nebo střepy a několik částic.
- Tvary mají být nepravidelné, špičaté a lehce chaotické. Mohou připomínat elektřinu, magické plameny, krystaly nebo energetické čepele.
- Animace má působit oldschoolově: krátké pulzy, lehce stupňované blikání a nepravidelný rytmus. Nemá být dokonale plynulá, sterilní ani „mobilně prémiová“.
- Efekt může být intenzivní, ale základní silueta postavy a jednotlivé kusy výbavy musí zůstat čitelné.

### Vazba efektu na slot

- **Zbraň:** světelný lem čepele nebo hlavice, krátká stopa energie a občasný výboj.
- **Zbroj:** záře hran pancíře, světelné praskliny nebo špičaté paprsky vystupující z ramen a trupu.
- **Talisman:** menší orbitující symbol, částice nebo pulz u středu těla.
- **Kompletní set:** efekty jednotlivých kusů se propojí do společné aury. Výjimečný set může přidat křídla, znak za postavou nebo kruh energie u nohou.

### Stupňování síly

| Úroveň | Projev v náhledu postavy |
| --- | --- |
| Běžný předmět | Bez aury; pouze materiál a základní kontrast. |
| Vzácný předmět | Lokální tyrkysovo-modrý lem na vybaveném slotu a občasná malá jiskra. |
| Epický předmět | Silnější emeraldovo-modro-fialová záře, pulzování a několik ostrých energetických tahů. |
| Speciální nebo setový předmět | Vlastní barevná identita a efekt navázaný na téma setu. |
| Vymaxovaný set | Nejsilnější společná aura, přepálené světlé jádro, výrazné paprsky a unikátní prvek za postavou nebo u nohou. |

Upgrade předmětu zesiluje stejný efekt postupně; nemění při každém stupni celý vizuální jazyk. Milníky mohou být například `+5`, `+10` a maximum. Maximum musí být na první pohled rozeznatelné i bez otevření detailu předmětu.

### Chování a omezení

- Efekt se objeví okamžitě po vybavení a zmizí po sundání předmětu.
- Při výměně za silnější kus může proběhnout krátký jednorázový záblesk; trvalá aura potom pokračuje v klidnější smyčce.
- V inventáři se používá jen malá ochutnávka efektu. Plná intenzita patří náhledu postavy, odměnové obrazovce a mimořádnému dropu.
- Více efektů se skládá podle slotů, ale systém musí hlídat společný limit jasu a částic, aby postava nezmizela v bílé ploše.
- Animace musí respektovat `prefers-reduced-motion`; v omezeném režimu zůstane statický světelný lem bez blikání a částic.
- Na slabších zařízeních lze snížit počet částic a frekvenci pulzů, ne však odstranit barevnou identitu rarity.

### Čemu se vyhnout

- dokonale hladkému pastelovému gradientu přes celou postavu,
- měkkému modernímu neonovému „blobu“ bez ostrých detailů,
- konstantní duhové animaci bez vztahu k raritě nebo setu,
- částicím rozmístěným náhodně po celé kartě,
- efektu, který překryje tvar vybavení nebo znemožní přečíst siluetu postavy.

## Hustota

- Upřednostnit více relevantních dat na obrazovce před velkými dekorativními plochami.
- Používat malé mezery, kompaktní tlačítka a krátké popisky.
- Na desktopu držet hlavní souboj, statistiky a inventář co nejvíce nad ohybem stránky.
- Na mobilu zachovat čitelnost a dotykové cíle; hustotu nezvyšovat na úkor ovladatelnosti.

## Kontrolní seznam pro nové prvky

1. Je prvek hranatý a bez stínu?
2. Používá barvu pouze tehdy, když sděluje raritu, stav nebo odměnu?
3. Je informace čitelná i bez barvy?
4. Nezabírá padding více místa, než vyžaduje čitelnost?
5. Zapadá typografie a ohraničení do systémového vzhledu?

## Aplikační shell a inventář (UI shell, Prototype 0.4)

Rozhraní je rozdělené na samostatné stránky, které přirozeně scrollují; nic se nesnaží vejít na jednu obrazovku. Velikost UI řeší skutečné rozměry a CSS proměnné (`:root` v `styles.css`), nikdy `zoom` ani `transform: scale()`.

### Shell
- **Levý sidebar** (256 px, `position: sticky`, vlastní scroll): identita postavy, navigace POSTAVA / INVENTÁŘ / MAPA / BOJ a odkaz na katalog. Aktivní stránka má `aria-current="page"`, světlejší pozadí a linku.
- **Horní stavová lišta** (sticky): název stránky, level, XP, gold, stav boje a aktuální cíl.
- **Obsah** má `max-width: 1500px` a padding 32 px. Stránky se přepínají atributem `hidden`, herní smyčka běží mimo ně, takže boj se při navigaci nerestartuje.
- **Mobil (< 900 px):** sidebar je vysouvací drawer (tlačítko Menu, Escape zavírá).

### Stránka Inventář
Desktop ≥ 1440 px: `INVENTÁŘ | PAPER-DOLL | DETAIL` (detail sticky). 1100–1439 px: inventář a paper-doll vedle sebe, detail pod nimi. Pod 1100 px: paper-doll nad inventářem, detail pod nimi. Na mobilu (≤ 760 px) se detail otevírá jako celoobrazovkový panel (Escape zavírá).

- **Paper-doll:** všech sedm slotů je vidět současně, rozmístěné anatomicky (helma; rukavice–brnění–amulet; zbraň–kalhoty; boty), sloty 92–96 px. Náhled postavy je vyměnitelná vrstva; asset se mění na jediném místě (`CHARACTER_PREVIEW` v `app.js`).
- **Slot:** velký asset, rarity rámeček, název typu slotu, prázdný stav (čárkovaný rámeček + symbol), stavy selected / hover / focus a zvýraznění kompatibilního slotu (čárkovaný obrys a štítek VYBAVIT/VYMĚNIT).
- **Grid:** buňky min. 88 px, počet kusů u materiálů, záložky VŠE / VYBAVENÍ / MATERIÁLY / SVITKY, hledání, filtr slotu a rarity, řazení, kapacita.
- **Detail:** velký asset, rarita, staty, porovnání s nasazeným kusem, zdroj a čas získání, obchodovatelnost a akce VYBAVIT / VYMĚNIT / SUNDAT. Jedno kliknutí pouze vybírá; vybavuje až tlačítko.
- Klik na prázdný slot přefiltruje inventář na vhodné předměty (druhý klik filtr zruší). Výběr a filtry jsou stav UI a neukládají se do savu.

### Typografické minimum
Základ 14 px, pomocný text ≥ 12 px, popisky ≥ 11 px, nadpis stránky 28 px (24 px na mobilu), nadpis sekce 19 px, tlačítka ≥ 13 px s výškou ≥ 40 px.

## Retro RPG téma (Prototype 0.5)

Změna je čistě vizuální: rozložení, stránky, paper-doll, inventář, detail a responzivita zůstaly beze změny. Všechny hodnoty jsou centrální tokeny v `:root` v `styles.css`; komponenty nepoužívají vlastní barvy.

### Paleta
Tmavé teplé pozadí (`--color-bg-*`), hnědé herní povrchy ve třech úrovních (`--color-surface-1..3`, `--color-surface-hover`), pergamenové plochy pro datové bloky (`--color-parchment*` + tmavý inkoust `--color-ink*`), zlatý akcent (`--color-accent-gold*`), hnědé konstrukční linky (`--color-border*`), barvy stavů (HP červená, XP zelená, mana modrá, varování/nebezpečí) a rarity (`--rarity-*`). Orientační poměr: 65–75 % tmavé neutrální plochy, 15–20 % hnědé konstrukční prvky, 5–10 % pergamen, do 5 % stavové a rarity barvy.

### Kontrast
Primární text `#f2e8d5` na povrchech ≥ 11:1, sekundární ≥ 6:1, muted (jen vedlejší informace) ≥ 4.5:1 na základních plochách. Rarity texty (`--rarity-rare`, `--rarity-epic` byly oproti výchozí paletě mírně zesvětlené) dosahují ≥ 4.5:1 na buňkách i panelech. Text na pergamenu používá pouze `--color-ink*`. Rarita se nikdy nesděluje jen barvou: buňky a sloty mají značku z 1–4 čtverečků (běžný → epický), detail a nasazený slot slovní štítek.

### Typografie
- **Display:** Jersey 10 (nadpisy, navigace, tlačítka, štítky, číselné hodnoty). V `@font-face` je `size-adjust: 125 %`, protože font má malý x-height.
- **Text:** IBM Plex Mono 400/700 (popisy, statistiky, combat log, detail).
- Oba fonty jsou lokálně v `assets/fonts/` (`woff2`, `latin` + `latin-ext`), licence SIL OFL 1.1 a zdroje viz `assets/fonts/README.md`. Pixelify Sans byl zamítnut kvůli nečitelným číslicím (`7` ≈ `1`, `5` ≈ `S`) a písmenu `Z`.
- Stupnice: název stránky 32 px, hlavní nadpis 22, nadpis panelu 18, navigace 16, text 14, metadata 13, nejmenší popisek 12 (min. 11), tlačítka 14.

### Povrchy a rámečky
- Běžný rámeček 1 px, aktivní/vybraný 2 px zlatý, výrazné panely (inventář, paper-doll, detail, bojová scéna) mají dvojitou linku a zlaté rohové značky.
- Pixelový stín `--shadow-hard` (2 px, bez blur), jemný dithering pouze na pozadí stránky a sidebaru.
- Detail itemu: tmavý rám → pergamenová datová plocha (staty, meta) s inkoustovým textem; náhled itemu zůstává na tmavém podkladu.

### Stavy komponent
Každý interaktivní prvek má default, hover, `:focus-visible` (2 px světle zlatá linka), active (posun o 1 px a menší stín), selected (2 px zlatý rámeček + rohový marker) a disabled (čitelný, ale ztlumený). Přechody 100 ms, respektuje se `prefers-reduced-motion`.

### Bary a log
Bary mají pevný track, rámeček, dvoutónovou výplň a jemné segmenty (HP červená, XP zelená, progress zlatá). Combat log má základ ve světlém textu; barva jen pro význam (zásah hráče krémová, nepřítel červená, kritický zásah zlatá, level up/drop zelenozlatá, systém sekundární).

### Assety
Itemové a enemy assety se barevně neupravují (žádný globální `filter`); statický glow signature itemů zůstal.
