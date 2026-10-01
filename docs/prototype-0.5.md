# Prototype 0.5 — Loot, Economy & Collection

Staví na Prototype 0.4 (mapa, detail lokace, výběr nepřítele, auto boj, combat widget, run statistiky, drop tabulky, stackování materiálů, sloty vybavení). Tyto systémy se nepřepisovaly, jen se na ně navázalo. Historický popis 0.4 zůstává v [`prototype-0.4.md`](prototype-0.4.md).

## Testovací otázka

**Dává smysl smyčka boj → loot → porovnání → nasadit / nechat / prodat → zlato → farmení → sbírka, a chce hráč kvůli ní dál farmit?** Konkrétně: je porovnání itemu srozumitelné, je správa 60 míst únosná a je 5% riziko neseného zlata dost zajímavé, aby dávalo smysl banka?

## Nové funkce

- **Instance itemů**: `id`, `templateId`, `quality` (dříve `rarity`), `stats`, `obtainedAt`, `sourceEnemyId`, `sourceLocationId`, `isNew`, `isFavorite`, `isLocked`.
- **Inventář**: badge NOVÉ, oblíbené (★), zámek; kapacita 60 (`LOOT_CONFIG.inventoryCapacity`); filtry (typ, rarita, nové, oblíbené, zamčené, lokace původu), řazení (nejnovější, nejstarší, rarita, název, prodejní hodnota, síla itemu), hledání, viditelné a zrušitelné aktivní filtry, hromadný výběr.
- **Plný inventář**: drop se neztratí, uloží se do trvalé sekce „NEVYZVEDNUTÁ KOŘIST“ s počtem a tlačítkem pro přesun po uvolnění místa. Žádný potvrzovací modál při dropu.
- **Porovnání**: detail se porovnává s itemem ve stejném slotu podle VÝSLEDNÝCH statů postavy (zelená / červená / neutrální). Desktop vedle sebe, mobil pod sebou. Nasazení nikdy neléčí (HP se jen ořízne na nové maximum).
- **Obchodník**: pouze výkup, jednotlivě i hromadně, se součtem, počtem a raritami; varování u vzácných a epických; zpětný odkup posledních 10 ručně prodaných itemů za stejnou cenu (respektuje kapacitu a zlato).
- **Pravidla kořisti**: automatický prodej je ve výchozím stavu vypnutý; jen běžné vybavení, vybrané sloty; nikdy oblíbené, zamčené ani první získání šablony. Vše se zapisuje do loot logu se ziskem zlata.
- **Zlato**: `carriedGold` (nesené) a `bankGold` (banka).
- **Banka**: vklad / výběr konkrétní částky nebo všeho; validace prázdného, nulového, záporného, desetinného a příliš velkého vstupu; bez poplatků; boj se nezastavuje.
- **Smrt**: ztráta `floor(carriedGold × 0,05)`, banka je v bezpečí; zápis do logu, nenápadný toast (jen při ztrátě > 0), započtení do statistik.
- **Bestiář** (`#/bestiar`): generovaný z `ENEMIES`, objevení po začátku prvního souboje, poražení, smrti, objevená kořist, filtr lokace; neobjevení nepřátelé jako silueta a `???`; bez přesných šancí.
- **Sbírka** (`#/sbirka`): stabilní `templateId`; získáno, počet, nejlepší varianta, první lokace / nepřítel / čas; prodané a smazané itemy zůstávají v historii; postup celkem i po lokacích; jen informativní.
- **Dlouhodobé statistiky** (Postava): poražení, nalezené předměty a materiály, zlato celkem / z prodeje / ztracené smrtí, smrti, objevení nepřátelé a itemy, nejvyšší kritický zásah. Přežijí reload, změnu lokace i konec runu; run statistiky zůstávají zvlášť.

## Pracovní hodnoty (odhad, ne balance)

Všechna čísla jsou centrálně v `economy-data.js`.

| Hodnota | Nastavení |
| --- | ---: |
| Kapacita inventáře | 60 |
| Zpětný odkup | posledních 10 |
| Délka loot logu | 40 |
| Ztráta zlata při smrti | 5 % neseného |

Síla itemu = `2·minDmg + 2·maxDmg + 0,5·maxHP + 5·crit%`.
Prodejní hodnota = `max(1, round(síla × 0,5 × násobek rarity))`; násobky: běžný 1, vzácný 1,5, epický 2,5. Ceny jsou odhad pro první test a ověřuje se, zda dávají pocit smysluplného zisku, ne finální ekonomika.

## Změny datového modelu

`state` nově obsahuje `carriedGold`, `bankGold`, `buyback`, `lootRules`, `lootLog`, `stats`, `collection`, `bestiary` a `unclaimed`. Původní `gold` už se nepoužívá. Item instance mají nová pole viz výše. Šablony mají `templateId` (= klíč ikony).

## Migrace savu

Klíč `idle-rpg-prototype-v02` zůstává, verze se píše jako 3; načtou se verze 2 i 3. Starý `gold` → `carriedGold` (nic se neztrácí), banka 0. Staré itemy dostanou `templateId`, `isNew=false`, `isFavorite=false`, `isLocked=false`. Statistiky, sbírka a bestiář se zpětně dopočítají z vlastněných itemů, materiálů, zlata a aktuálního nepřítele. Level, XP, HP, vybavení, inventář, materiály, aktivní lokace, vybraný nepřítel, run i run statistiky se zachovávají. Žádná offline odměna.

## Testovací scénář

1. Načti starý save 0.4 → nic nechybí, zlato je v „Nesené“.
2. Zabij pár nepřátel, otevři nový item, porovnej se stejným slotem a nasaď ho.
3. Zamkni a oblíbi item; ověř, že nejdou prodat / hromadně vybrat.
4. Na Obchodníku prodej běžné, odkup zpět; zkus prodat vzácný (varování).
5. Naplň inventář na 60 → nová kořist jde do nevyzvednuté; uvolni místo a přesuň ji.
6. Banka: zkus prázdné, 0, −5, 1,5, příliš vysoké; vlož a vyber; boj běží.
7. Nech postavu zemřít s neseným i bankovním zlatem → ztratí se jen 5 % neseného.
8. Zapni auto-prodej, ověř log a ochranu prvního nálezu.
9. Bestiář a Sbírka po reloadu i změně lokace; Odpadkové hory zůstávají náhled bez kořisti.
10. Desktop, tablet, mobil; konzole bez nových chyb.

## Známé limity

- Starý save 0.4 nemá historii per nepřítel: bestiář se dopočítá jen částečně (aktuální nepřítel, původ vlastněných itemů, jednozdrojové materiály); počty smrtí z minulosti neznáme.
- Kolekce zahrnuje jen vybavení, ne materiály.
- Ceny, kapacita a drop rate jsou pracovní; sbírka zatím nic neodměňuje.
- Ve sbírce je u neobjevených položek vidět slot a lokace (cílem je orientace, ne tajemství).
- Tabulka pracovní balance v README je zděděná z 0.3/0.4.

## Mimo rozsah

Crafting, prefixy/suffixy a recepty, kvalita crafting materiálů, hráčský market, multiplayer, účty, offline postup, questy, achievementy, cestovní náklady, energie, finální balance dropů, finální mapa světa a kořist pro Odpadkové hory.


---
**Aktualizace 0.5.1:** pole `rarity` bylo přejmenováno na `quality` a systém kvalit je popsán v [`prototype-0.5.1.md`](prototype-0.5.1.md).
