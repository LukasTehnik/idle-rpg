# Prototype 0.6 — Stat & Affix Foundation

Základ pro prefixy, suffixy a svitky. **Žádný affix nepadá ve hře.** Fáze dodává datovou architekturu, pravidla, vývojový nástroj a testy; zapnutí do dropů je úkol pro 0.7.

Závazné zdroje: `idle-rpg-affix-balance-catalog-en.md` (má přednost), `idle-rpg-stat-prefix-suffix-design.md`, [`item-visual-rarity-rules.md`](item-visual-rarity-rules.md) (výjimka „Affix Scroll").

## Interní vs. hráčská data

| Interní (jen dev nástroje, validace, simulace) | Hráč vidí (allowlist) |
| --- | --- |
| `tier`, `design{primaryBuild, secondaryBuilds, buildRole}` | anglický název (`displayName`) |
| `scarcity{relativeDropWeight, progressionBand, sourcePools}` | Prefix Scroll / Suffix Scroll |
| `requiredItemLevel` (zatím se nevynucuje) | kladné i záporné modifiery, rozsahy / rolly |
| `enabledInLiveDrops`, pooly, `category` | podmínky, cooldowny, funkční omezení |
| | kompatibilní sloty, obchodovatelnost |

Renderer svitku čte **výhradně** view model `buildAffixScrollViewModel()` s 7 poli: `displayName, affixType, formattedModifiers, formattedConditions, allowedSlots, requiredLevel, tradeable`. Interní objekt se rendereru nepředává (nic se neskrývá přes CSS).

Všech 64 svitků má **identický vzhled**: stejný obrázek (`assets/scrolls/affix_scroll.png`, vybrán náhodně z dodaných, nepoužité jsou v `assets/scrolls/unused/`), stejný rám a pozadí, stejná barva názvu, žádný glow, typ `AFFIX SCROLL`. Prefix/suffix se liší jen písmenem P/S a textem PREFIX/SUFFIX SCROLL. Žádný tier, quality ani build štítek. Na záložce SVITKY se nenabízí filtr/legenda kvality ani řazení podle síly.

## Soubory

| Soubor | Obsah |
| --- | --- |
| `stat-data.js` | centrální registr statů (40) + formátování |
| `affix-data.js` | 30 prefixů + 34 suffixů, zdrojové pooly, tier výchozí hodnoty |
| `affix-logic.js` | validace, roll, pravidla itemu, konflikty, capy, součty, view model, drop model, sanitizace savu |
| `scroll-ui.js` | jediná vizuální komponenta svitku + allowlist renderer detailu |
| `affix-catalog.html` | **DEVELOPMENT TOOL — NOT PLAYER-FACING** |
| `tests/affix-tests.js`, `tests/ui-tests.js` | logické (Node) a UI (Playwright) testy |

Pořadí skriptů: `quality-data, item-data, economy-data, material-data, world-data, stat-data, affix-data, affix-logic, scroll-ui, app`.

## Registr statů

Pole: `id, displayName, valueType, operation, format, stackingRule, cap, enabled, version` + `polarity, comparison, condition, calc, liveKey, unit, system`.

- `valueType`: `flat, range_flat, percent_additive, percent_multiplicative, time_flat, chance, conditional, triggered, typed_damage, resistance` (záporné hodnoty = negative modifier; zda je záporné „špatné", určuje `comparison`, např. −0,2 s hledání je bonus).
- `cap`: `{type:"hard",max}`, `{type:"soft",softAfter,hardMax,factor}`, `{type:"floor",min}`.
- `calc`: `"active"` = zapojeno do živého výpočtu (`max_hp, damage_min, damage_max, crit_chance`; `liveKey` ukazuje na `item.stats`), `"prepared"` = jen data, systém ještě neexistuje.
- Podmíněné staty nesou podmínku v registru (`condition`), enemy-family parametr v modifieru (`params.family`, `"bound"` = rodina uložená na itemu).
- Nový stat = nový řádek v `STAT_DEFINITIONS`; inventář, porovnání ani save se nemění.

## Definice affixu

```js
{ id, type:"prefix"|"suffix", displayName, tier, category,
  visualClass:"affix_scroll", displayTier:false, displayRarity:false,
  design:{ visibility:"internal", primaryBuild, secondaryBuilds, buildRole },
  scarcity:{ visibility:"internal", relativeDropWeight, progressionBand:null, sourcePools:[] },
  requiredItemLevel, allowedSlots, excludedBaseTags,
  modifiers:[{ statId, operation, valueType, minValue, maxValue, params? }],
  drawbacks:[...], conflictsWith:[], locationIdentity, uniqueEquipped, signatureGroup, boundFamily,
  tradeable, learnable, enabled, enabledInLiveDrops:false, definitionVersion:1 }
```

„Všechno vybavení" = 7 slotů bez křídel (`weapon, armor, helmet, gloves, pants, boots, charm`); slot `charm` je v UI Talisman. `signatureGroup` u T5 je pracovní návrh (`signature_sustain / _power / _critical / _balanced`).

## Instance svitku

```js
{ instanceId, itemType:"affix_scroll", affixType, affixId, visualClass:"affix_scroll", tradeable }
```
Žádné `quality` ani `rarity` (sanitizace je ze savu odstraní). Uloženo v `state.affixScrolls`.

## Affix na itemu

`item.prefix` / `item.suffix` = `null` nebo
```js
{ affixId, definitionVersion, rolledModifiers:[{ statId, value, params?, drawback? }] }
```
Roll se zapečetí do itemu; výpočty čtou `rolledModifiers`, ne aktuální definici, takže pozdější změna katalogu staré itemy nemění. Max. 1 prefix + 1 suffix. `applyAffixToItem()` hlídá sloty, vyloučené tagy, konflikty (zrušení nevýhody rizikového affixu, lokační identity, signature skupina, duplicitní unikátní triggery), capy a minimální intervaly (0,65 / 0,75 / 2 s), Hunger reset, Final Memory jednou za výpravu, rekurzi extra útoku. Součty (`computeAffixTotals`): pozitivní modifiery první, nevýhody po nich; `uniqueEquipped` a `signatureGroup` duplicity se neaplikují; `strongest` stat bere jen nejsilnější.

## Save a migrace

Klíč `idle-rpg-prototype-v02`, nyní **verze 5** (načítají se 2–5). Přibylo `affixScrolls` a `prefix`/`suffix` na itemech. Starší save: svitky = `[]`, itemy mají `prefix: null, suffix: null`; nic jiného se nemění. Affix zmizelý z katalogu zůstane na itemu beze změny (žádná tichá ztráta).

## Aktivní vs. jen připravené

- **Živě počítá** (nasazený item s affixem ovlivní postavu): `max_hp`, `damage_min`, `damage_max`, `crit_chance` (+ cap 50 %). Dnes to platí jen pro itemy z dev pomůcky.
- **Jen data** (`calc:"prepared"`, v dev nástroji `inactive`): defense, crit damage, attack speed, průraz, regenerace, heal on kill, dodge, search/revive time, Magic/Gold/Material Find, XP, equipment drop, podmíněné bonusy (boss/elite/rodina/HP), typed damage a odolnosti, healing/damage-taken modifikátory a triggery (Sanctified, Void-Touched, Perfect Resonance, Final Memory, Hunger).

## Drop readiness (nic není zapnuté)

Datový model `{ scrollDropChance, scrollPool:[{affixId, weight}] }`, `specific = chance × weight / Σweights`. `validateAffixForLiveDrop()` vyžaduje: platné ID, aktivní staty, **schválený** source pool, progresní pásmo, kladnou váhu, kompatibilní zdroj (typ nepřítele / bossovy pool jen u svého bosse), tier v limitu poolu (T5 jen v T5 poolech) a výslovné `enabledInLiveDrops:true` (výchozí `false`). Všech 22 poolů má `approved:false`. `SCROLL_DROP_TEST_FIXTURE` je jen dev fixture, nepřipojená k žádnému nepříteli.

### Jak později přidat affix do konkrétního poolu

1. Rozhodnout finální umístění a progresní pásmo → vyplnit `scarcity.progressionBand`.
2. Schválit pool v `SCROLL_SOURCE_POOLS` (`approved:true`) a ověřit `compatibleDropSources`/`maxTier`.
3. Nepříteli přidat `scrollDropChance` + `scrollPool:[{affixId, weight}]` (váha z `relativeDropWeight` nebo upravená).
4. Affixu nastavit `enabledInLiveDrops:true`.
5. Ověřit `validateScrollDropConfig()` (dev katalog, sekce 5) a simulací kills/hod.
6. Napojit vytvoření svitku (`createAffixScroll`) v drop pipeline; do té doby ho nic nevolá.

## Dev pomůcky a testy

- `index.html?testscrolls#/inventar` přidá 64 svitků a 3 itemy s affixy (jen ladění).
- `affix-catalog.html`: filtry (typ, tier, stat, slot, kategorie), sandbox kandidáta a nasazeného itemu (base, prefix/suffix, rolly, výsledný název a staty, porovnání podle statId), skeny konfliktů, test negativních modifierů, capů, obrany, drop fixture + simulace, registr statů, test migrace.
- `node tests/affix-tests.js` (50 testů), `node tests/ui-tests.js` (10 testů; vyžaduje `python3 -m http.server 8765` a Playwright).

## Neimplementováno (záměrně)

Finální umístění svitků a drop šance, market, crafting, forging/smelting, spotřeba/učení svitků, elementální systém bez výpočetního základu, doporučení buildů, hráčské filtry podle síly/rarity.
