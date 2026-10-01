# Prototype 0.5.1 — Quality System

Vizuální pravidla: [`item-visual-rarity-rules.md`](item-visual-rarity-rules.md) (autoritativní). Tento dokument popisuje datový model, migraci a návody.

## Co se změnilo

- Nový `quality-data.js` (načítá se první): `ITEM_QUALITIES`, `normalizeQuality`, `stackKey`, `qualityClasses`, `applyQualityVisuals`.
- `rarity` → `quality` (jediný kanonický název). Kvality: Common, Rare, Epic, Legendary, Mythic, God.
- Šablona a instance jsou oddělené: šablona (`ITEM_TEMPLATES`, `MATERIALS`) je jedna, instance přidává `quality`. `composeItem(templateId, instance)` je slučuje.
- Materiály se stackují podle `templateId:quality` (Common a Epic se nikdy neslučují).
- Kvalita zatím **nemění staty, ceny ani drop rate**. Původní zděděný hod (`dropChance` + `dropPool`) zůstal, včetně násobičů statů (`ITEM_QUALITY_ROLL`). Pevná kvalita z `equipmentDrops` používá základní rozsah šablony ×1.
- Vzhled všude (inventář, vybavení, detail, srovnání, toast, poslední dropy, katalogy, bestiář/mapa): plné pozadí + pixelový rám; glow od Legendary; u stackovatelných slabší; křídla vždy zlatá; MAX vrstva.
- `item-catalog.html`: nav ITEMS/MATERIALS + QUALITY PREVIEW — EQUIPMENT. Nový `material-catalog.html` s QUALITY PREVIEW — MATERIALS.
- Odchylky: dřívější kvalita materiálů „uncommon“ → `common` (nová škála ji nezná); signature glow předmětů (`glowColor`) se už nevykresluje (nahrazen kvalitou).

## Datový model

Materiál: `{ id, name, asset, defaultQuality, category, stackable, tradeable, sourceLocationId, sourceEnemyIds, description }`.
Instance itemu: `{ id, templateId, quality, upgradeLevel, maxUpgradeLevel, isMaxUpgraded, wingGlow?, stats, ... }`.
Stack materiálu v savu: `state.materials["wing-dust:epic"] = 5`.

Drop tabulky nepřítele (`world-data.js`):

```js
materialDrops:  [{ templateId: "wing-dust", quality: "common", chance: 0.8, quantity: [1, 3] }],
equipmentDrops: [{ templateId: "iron-sword", quality: "legendary", chance: 0.01 }],
```

## Migrace savu

Verze savu 4 (načtou se 2, 3 i 4; klíč `idle-rpg-prototype-v02` beze změny). Item bez `quality` → `rarity` je přejmenováno, chybí-li obojí, `common`. Neznámá kvalita → `common`. Materiály uložené pod prostým id → `id:defaultQuality`. Nic z inventáře ani postupu se neztrácí.

## Validace

Neznámá quality, God u stackovatelných, chybějící šablona v drop tabulce, chybějící quality ve starém savu → bezpečný návrat na `common` (nebo přeskočení záznamu) a `console.warn` jen v dev režimu (localhost, file://, `?dev`). Produkční UI se nerozbije.

## Návody

1. **Existující zbraň v dané kvalitě nepříteli:** do `equipmentDrops` nepřítele přidej `{ templateId: "iron-sword", quality: "legendary", chance: 0.01 }`. Žádná nová šablona ani CSS.
2. **Materiál v dané kvalitě:** do `materialDrops` přidej `{ templateId: "wing-dust", quality: "epic", chance: 0.05, quantity: [1, 2] }` (a id nepřítele do `sourceEnemyIds` materiálu). God není povolen.
3. **Nová základní šablona itemu:** přidej jeden záznam do `ITEM_TEMPLATES` (`name`, `slot`, `icon`, `rolls`; pro křídla `wingGlow`). Varianty kvality se NEVYTVÁŘEJÍ — kvalita je jen pole instance.
4. **Nový materiál:** jeden záznam v `MATERIALS` (+ `MATERIAL_ORDER`) a asset v `assets/materials/`; kvalitu určují až drop tabulky.

## Testovací položky

Zbraň `iron-sword` (Železný meč) ve všech 6 kvalitách; materiál `wing-dust` (Prach z křídel) v 5 kvalitách. Oba jsou v katalozích v sekci QUALITY PREVIEW.
