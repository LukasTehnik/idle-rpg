# Playable content milestone: Level 1–100

Implementation baseline: `5e03b18`. This is a content milestone, not a claim about the current release number. Existing IDs, assets, authentication, cloud synchronization and save key remain unchanged. No database migrations or build dependencies are required.

## Scope

- Ten locations and ten item tiers cover levels 1–100. All locations are selectable; levels are recommendations, not map locks.
- Forty new fixed farming targets are added alongside the existing twenty targets. Farm the selected target until manually changed. Navigation does not interrupt combat.
- 135 new templates: 100 base templates (20 swords, 20 helmets, 10 each armor/gloves/leggings/boots/amulets/wings), plus five seven-piece sets. Existing templates are retained.
- Forty new materials: ore, fiber, essence and core for each tier. Quantity is stored by material ID and quality. Material icons remain present in crafting requirements.
- Every new template has a forge recipe. Upgrade and repair costs scale with item tier. Smelting returns the template's local material in matching quality (God returns Mythic, existing material quality limit).
- All 64 existing affix definitions have a reachable equipment source. No new affix names or stat values are invented.
- Placeholder SVGs distinguish slots. Existing art is retained. No new monster art or world-map illustration is required.
- Read-only `content-100.html`, linked from dev tools, displays live target stats, material drop probabilities, equipment quality probabilities, compatible affixes, recipes, sets and progression. It is not an editor and does not alter saves.

## World bands

| Levels | Item tier | Location | Theme |
|---|---:|---|---|
| 1–10 | 1 | Old Forest Edge | Iron |
| 11–20 | 2 | Wasteland of Silence | Chitin |
| 21–30 | 3 | Waste Mountains | Salvaged |
| 31–40 | 4 | Magma | Ember |
| 41–50 | 5 | Electricity | Arc |
| 51–60 | 6 | Glass Desert | Prismatic |
| 61–70 | 7 | Fungal Depths | Spore |
| 71–80 | 8 | Frozen Vault | Frostbound |
| 81–90 | 9 | Ashen Citadel | Obsidian |
| 91–100 | 10 | Void Sanctum | Voidsteel |

Each new location area contains Hunter, Gatherer, Sentinel and Overlord targets. Their levels are band minimum +0/+3/+6/+9. Hunters drop weapons, helmets and gloves plus ore; Gatherers drop armor, boots, leggings and amulets plus fiber; Sentinels drop all base slots including wings plus essence; Overlords also drop the tier's set pieces and cores. No automatic rotation or random target switching.

Original enemy IDs and images are retained. Apart from Goblin, their combat/reward numbers are retuned to their location band. Existing material identities remain, with per-entry chances capped at 16% and a band quality profile. These legacy targets can have several independent material entries and thus larger aggregate material yield than new targets. This is visible in the Atlas, not concealed as final balance.

## Item strength

Item tier is progression strength; quality is the strength/variation of a particular instance. Prefix/suffix are a third, independent axis.

| Quality | Main-stat multiplier | Random secondary groups |
|---|---:|---:|
| Common | 1 | 0 |
| Rare | 1.18 | 1 |
| Epic | 1.45 | 2 |
| Legendary | 1.85 | 3 |
| Mythic | 2.35 | 4 |
| God | 3 | 5 |

Tier main-stat multipliers: **1 / 1.75 / 2.85 / 4.35 / 6.4 / 9.2 / 13 / 18 / 25 / 34**. Main stats are rolled from slot-specific ranges before multiplying by quality and tier.

Random secondary groups are critical strike, vitality, offense, defense and attack speed; they do not repeat within an item. A damage range counts as one group. Flat values increase with tier. Percentage scaling for critical chance and attack speed is limited to ×4 to avoid runaway stacking. More exotic stats enter through affixes, not fabricated random secondary rolls.

All new item names are English. Existing Czech UI and legacy names are not wholesale translated in this milestone. Wing backgrounds keep the existing gold override. Scroll appearances keep their existing uniform quality: no player-facing tier, rarity or build recommendation.

## Drop structure

Base equipment chance: **3% per kill** on new targets, or 15/hour at 500 kills/hour before affix bonuses. Template selection is uniform within the selected target's pool. Quality is independently rolled. T1 quality: **93.5% Common / 5.8% Rare / 0.65% Epic / 0.05% Legendary** conditional on an equipment drop.

At T1, Legendary per-kill probability is `0.03 × 0.0005 = 0.000015`, i.e. **0.0015%**, before bonuses. Mean waiting time at 500 kills/hour is ~133 hours; this is not a guaranteed drop time. Early Legendary is possible, not something the tutorial assumes.

Rare/Epic/Legendary quality weights increase modestly with tier, with larger Epic/Legendary weights on bosses. Mythic has a conditional 0.02% weight on T8+ bosses only. God is represented for catalog/testing but has no level-1–100 drop source. Exact formulas are in `qualityProfile` in `content-100-data.js`; Atlas displays the resolved percentages.

New target material entry chances: Hunter/Gatherer 12%, Sentinel 14%, boss essence 16% and boss core 4%, independently rolled. T1 material quality: 90% Common / 9% Rare / 1% Epic. Higher bands introduce Legendary materials at T5 and Mythic at T9. Source eligibility uses stable enemy IDs. All new recipes have obtainable sources; duplicate ingredient IDs are aggregated before checking/consuming stock.

## Natural affixes and scroll learning

Per equipment drop: **76% none / 11% prefix / 11% suffix / 2% both**. Wings currently have no compatible affixes. For each selected side:

1. Filter definitions by enabled flag, slot, item level, location identity and source pool role.
2. Remove tiers without a compatible candidate; normalize the remaining target tier weights.
3. Choose tier, then definition by relative weight, respecting prefix/suffix conflicts.

Tier weighting is therefore conditional on slot/source compatibility, not a promise that every item uses the unfiltered pool.

| Item band | Normal/elite affix tier pool | Boss pool |
|---|---|---|
| T1 | T1 100 | same |
| T2–T3 | T1 75 / T2 25 | same |
| T4–T6 | T1 40 / T2 50 / T3 10 | same |
| T7–T8 | T1 20 / T2 50 / T3 30 | T2 50 / T3 40 / T4 10 |
| T9–T10 | T1 10 / T2 35 / T3 50 / T4 5 | T2 25 / T3 50 / T4 23 / T5 2 |

Electricity Sentinel additionally allows a 5-weight T4 source pool. Source-role rules still apply: risk/boss affixes remain boss-only where defined; specialist pools remain elite/boss. T5 is explicitly blocked below level 90 and outside bosses.

The source adapter uses existing `SCROLL_SOURCE_POOLS` as compatibility metadata, not as approved direct-scroll drops. Those direct-drop approval flags stay false. For complete late-game reachability, the T9 Overlord inherits Mother of Holes/Collapsed Forge boss source identities, and the T10 Overlord inherits Core Mother. These explicit `affixBossSources` lineage assignments are provisional content decisions; replace them with named late-game encounters later if desired. Original early bosses do not gain those high-tier affixes prematurely.

Within a compatible tier, existing scarcity weights are multiplied by the smallest applicable stat factor: Magic Find ×0.3, equipment-drop bonus ×0.25, attack speed ×0.55, critical chance ×0.6, others ×1. These factors are internal provisional weights, not market value or final scarcity. Tier rarity comes primarily from the tier pool.

Atlas also shows each specific affix's base per-kill probability. This integrates template selection, filtered tier/definition weights, prefix/suffix composition and conflicts when both are present. It excludes equipped farming bonuses and fixed special drops. The sum counts expected affix instances per kill, not probability of any affix (a two-affix item contributes twice). Use this column rather than treating a relative weight as a drop percentage.

Scrolls do not drop directly from enemies. Smelting independently rolls **10% per attached affix**. Two-affix result distribution: 81% none, 18% exactly one, 1% both. Item quality does not change this recovery probability. Stronger affixes are rarer at the equipment-generation stage, not assigned a second hidden recovery penalty here. Crafted items never return scrolls; learned scrolls unlock permanent repeatable forging. Forge success is 100% without affixes, 85% with one, 70% with both, using existing smith logic.

## Sets and smithing

Five seven-piece sets: Dustwarden (T2), Furnace Keeper (T4), Prismwalker (T6), Vault Guardian (T8), Void Sovereign (T10). Bonuses activate at 2 / 4 / 7 equipped pieces and are recomputed on equipment changes. They add HP, damage, then defense/5% attack speed. Item detail shows activated thresholds. Set identity comes from the template registry, not transient names.

Normal recipe gold: `round(200 × 1.55^(tier−1))`; set recipe gold twice that. Base inputs: 24 local main material +4 local essence, with +2 core for wings. Sets use 24 ore +24 fiber +8 essence +2 core. Identical inputs are combined (amulets/wings therefore use 28 essence).

New-template upgrade gold: `round(50 × nextUpgrade × 1.55^(tier−1))`; +1–+3 guaranteed, later existing chances/risk retained. Higher upgrades consume local essence and core. Existing starter recipe/upgrade identities remain. Repair is gold-only, scaling by tier. Forge output quality remains capped at Legendary under existing smith rules; Mythic/God forging needs a separate design, not an accidental promise in this milestone.

NPC sell factors: Common1 / Rare1.5 / Epic2.5 / Legendary4 / Mythic6 / God10 applied to existing stat power. These are NPC sinks/sources, not player-market valuations. Gold scarcity needs measurement with crafting, repairs, sales and death losses together.

## Combat and progression

Base wave timings unchanged: 14 normal enemies /4 bosses, player attack1.6s, cooldown8.5s, death recovery5s. Attack-speed bonuses use the game's reciprocal interval formula, with a0.65s floor. Search bonuses affect the wave cooldown, not individual replacement spawns.

Affix combat/reward effects are connected: defense, crit damage, attack speed, penetration, regen, kill healing, dodge, revival/search time, XP/gold/material/quality/equipment-drop bonuses, boss/elite/family/conditional/element damage, element resistance, healing penalties, damage multiplier and three cooldown-based triggers plus once-per-run lethal survival. Typed enemy attacks exist in Magma/Electricity; resistance only applies there. Extra attacks cannot recursively trigger extra attacks.

New normal HP is `round(4 × (11 +2×(level−1) +12×tierMainMultiplier) × roleFactor)`; role factors1/1.15/1.7/3.2. Damage is scaled to an approximate level+gear HP budget. These are understandable test curves, not assertions that HP alone defines difficulty. Gear, multi-enemy damage, healing and kill time still matter.

XP curve has a **150-hour reference to level100 at500 normal-target kills/hour**. Per-level time weight increases by `(1+2×(level−1)/98)^1.35`. Each band uses its normal target XP reward as reference. Real duration can be substantially higher/lower; deaths, slower kills, boss XP and affixes change it. Level100 caps progression but keeps farming. Existing saved item rolls are not rerolled.

## Validation and remaining work

Run `node tests/affix-tests.js`, `node tests/itemization-tests.js`, `node tests/content-100-tests.js`. Optional DOM integration: install `jsdom@26` outside the repo and set `JSDOM_MODULE` to that installation before `node tests/content-dom-tests.js`. It loads all pages, samples7200 real generated items, clears waves, and executes forge/upgrade/repair/smelt across ten tiers. DOM checks do not validate rendered layout or animation.

Playwright UI test contract is updated for all-world affixes. The implementation environment could not download Chromium; **browser-rendered UI tests are not claimed as passed**. Run them with configured `PLAYWRIGHT_MODULE`, `CHROME_PATH` and `BASE_URL` before production deployment.

Not implemented: resets/master resets, market/backend economy, offline farming, new admin editor, new affix definitions, final monster art, wings generation1→2→3 crafting chain, final balance. Next test: fresh-save sessions at band transitions, measured survival and kills/hour, material time-to-recipe, net gold/hour and specific-affix P50/P90. Avoid claiming a complete150-hour playthrough from unit tests.
