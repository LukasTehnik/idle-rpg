# Idle RPG — Prototype 0.4

Čtvrtý hratelný prototyp prohlížečového idle RPG. Ověřuje otázku: **je výběr konkrétního nepřítele podle jeho materiálů a dropů dostatečně zajímavý, aby motivoval hráče střídat farmené cíle?** Podrobnosti: [`docs/prototype-0.4.md`](docs/prototype-0.4.md).

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
- **(UI shell)** aplikační shell: pevný levý sidebar, horní stavová lišta a samostatné stránky Postava / Inventář / Mapa / Boj (hash routing, boj běží na pozadí při přepínání),
- **(UI shell)** inventář jako paper-doll: 7 slotů kolem náhledu postavy, inventářový grid vedle něj a persistentní detail itemu s porovnáním,
- responzivní zobrazení pro desktop, tablet a telefon (na mobilu vysouvací menu a detail jako celoobrazovkový panel),
- náhodné dropy z osmnácti typů předmětů (běžná sada, tematická „andělská" sada se září a „chitinová" sada z Pustiny ticha),
- **(0.4)** šest nepřátel Pustiny ticha s finálními jmény (Prašná můra, Plastová můra, Slepá můra, Pamětnice, Můra z hlubiny, Matka děr) a typem COMMON / UNCOMMON / RARE / ELITE / BOSS,
- **(0.4)** sedm materiálů (`material-data.js`) se stabilními ID, cílené drop tabulky každého nepřítele (`world-data.js`) a sekce „Možná kořist“ v mapě,
- **(0.4)** inventář rozdělený na záložky VYBAVENÍ (18 míst) a MATERIÁLY (stackuje se, nezabírá místa), detail materiálu se zdroji, přehled posledních dropů u boje,
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
| Kapacita inventáře | 18 předmětů |

## Hranice této verze

Prototype 0.4 zatím neobsahuje crafting, recepty, rozebírání předmětů, banku, market, offline postup, účty ani další lokace. Tyto systémy patří do dalších testovacích verzí. Drop rate je záměrně vysoký, aby šel materiálový systém během krátkého testu vyhodnotit. Staty nepřátel a drop tabulky jsou pracovní balance — vše je centrálně v `world-data.js` a `material-data.js` pro snadné pozdější doladění. Kompletní dosavadní návrh je v souboru [`docs/navrh-hry.md`](docs/navrh-hry.md).

## Grafika

Portréty Poutníka a Goblina používají upravené SVG ikony z open-source balíčku
[game-icons.net](https://game-icons.net) (licence CC BY 3.0). Zdroje a autoři jsou uvedeni
v [`assets/icons/CREDITS.md`](assets/icons/CREDITS.md).

Materiály Pustiny ticha (`assets/materials/*.png`) jsou dodané ilustrace v původní velikosti a barevnosti; prohlížeč je zmenšuje přes CSS (`object-fit: contain`).

Nepřátelé a itemy lokace Pustina ticha (`assets/icons/enemies/pustina-ticha-*.png`,
`assets/icons/items/chitin-*.png`) jsou dodané hotové assety, beze změny obsahu — pouze
proporcionálně zmenšené (LANCZOS, zachovaný poměr stran a průhlednost) na velikost
odpovídající zbytku sady ikon.

## Struktura

- `index.html` — aplikační shell a čtyři stránky (Postava, Inventář, Mapa, Boj),
- `styles.css` — responzivní vizuální vrstva,
- `app.js` — stav hry, souboj, mapa/výběr cíle a postup,
- `item-data.js` — sdílená data předmětů (rarity, sloty, ikony, šablony předmětů),
- `material-data.js` — centrální data materiálů a svitků (stabilní ID, rarita, zdroje, popis),
- `world-data.js` — lokace a nepřátelé (staty, cílené drop tabulky materiálů i vybavení) pro tok mapa → lokace → nepřítel → farmení,
- `item-catalog.html` — statický přehled všech předmětů,
- `docs/navrh-hry.md` — dosavadní návrhový dokument,
- `docs/prototype-0.2.md` — cíle, pracovní balance a scénář testování Prototype 0.2.
- `docs/prototype-0.3.md` — cíle, pracovní balance a scénář testování Prototype 0.3 (historický dokument).
- `docs/prototype-0.4.md` — cíle, materiály, drop tabulky, migrace a scénář testování aktuální verze.
- `docs/ui-direction.md` — pravidla vizuálního směru pro další verze.
- `docs/visual-language-reference.md` — rozbor referencí a plán převodu jejich vizuálního jazyka do hry.
