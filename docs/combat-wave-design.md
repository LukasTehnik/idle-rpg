# Vlnový boj (farmící spot) — Prototype 0.9

Boj byl předělán z modelu „jeden na jednoho" na **farmící spot**: stojíš na
místě, kolem se objeví houf nepřátel **jednoho druhu** a ty mezi nimi pobíháš a
zabíjíš je. Když je houf pryč, běží respawn a pak se objeví celý nový houf.

Jde čistě o **jiný způsob boje a jiné vykreslení**. Všechna herní čísla
(poškození, krit, HP, obrana, XP, zlato, loot tabulky, úrovně, smrt) zůstala
původní z `world-data.js` a `app.js`.

## Vizuál (`combat-field.js`)

- Čistě geometrické obrysové tvary (styl The Tower), vnitřek volný pro efekty.
- Tvar podle typu nepřítele — **víc hran = silnější**: common = trojúhelník,
  uncommon = čtverec, rare = pětiúhelník, elite = šestiúhelník, boss = větší
  šestiúhelník. Barva taky podle typu.
- Ty jsi kolečko (terakota) se stopou. Dojdeš k nejbližšímu, sekneš, jdeš dál.
- U každého zásahu vyletí **poškození**; kritický zásah je větší a zlatý.
- Smrt nepřítele = **geometrický rozpad** na hrany + jiskry + prstenec, odměny
  vyletí (zelené +XP, mince, kosočtverec předmětu).
- Překryvy: log posledních 5 odměn (vlevo nahoře), stav vlny (vpravo nahoře),
  tlačítko „i" → vysouvací panel s **drop tabulkou a reálnými šancemi**, nahoře
  pruh životů hráče, dole lišta „zabito X / Y" a odpočet respawnu.
- Renderer je jen vizuální vrstva; o tom, kdo dostane zásah, rozhoduje `app.js`.
  rAF běží jen když je stránka Boj vidět; boj počítá dál i na pozadí.

## Logika (`app.js`)

- `beginFight` postaví vlnu `state.wave` (pole instancí HP) daného nepřítele.
- `playerAttack` sekne nejbližší živý cíl; po zabití `awardKill` (původní odměny
  + drobné doléčení + loot) a odebere ho z vlny.
- `enemyAttack` = volej: až `waveMeleeCount` nejbližších nepřátel tě naráz bije
  (aby velký houf nezabil okamžitě). Při smrti hráče běžná `defeatPlayer`.
- Po vybití vlny `enterWaveCooldown` → fáze `searching` (respawn) → `beginFight`
  postaví nový houf. Smrt → `dead` → oživení → nový houf.
- Vlna je transientní, neukládá se; po načtení savu se postaví znovu. Save
  zůstává ve verzi 8.

## Laditelná čísla (`CONFIG` v `app.js`)

| Klíč | Výchozí | Co dělá |
| --- | --- | --- |
| `waveSize` | 14 | počet nepřátel ve vlně |
| `waveSizeBoss` | 4 | menší houf pro boss typy |
| `waveRespawnMs` | 8500 | pauza po vybití vlny |
| `waveMeleeCount` | 2 | kolik nepřátel tě naráz bije |
| `betweenFightHealPercent` | 0.1 | doléčení za každé zabití |

**Balanc je zatím provizorní.** Vlnový model je výrazně těžší než původní boj
(víc nepřátel tě ohrožuje naráz), takže tahle čísla jsou hlavní páky, kterými se
obtížnost a grind budou ladit po hraní.

## Budoucí háčky (zatím nejsou jako itemy)

- Speciální skill „vlnový úder" (AoE, zničí část/celou vlnu).
- Itemy s „+N nepřátel ve vlně" nebo set zkracující respawn (hráč by viděl, o
  kolik se respawn zkrátil, přímo na liště).
- Zásah více cílů naráz (multi-hit) — v rendereru i logice připraveno rozšířit.
