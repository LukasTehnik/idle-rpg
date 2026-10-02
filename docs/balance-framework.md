# Balance Framework — Prototype 0.7

This document is an internal framework for adding content. It is not a player-facing rules page and it does not lock the final economy.

## Design rule: target farming is deterministic

A player chooses **one location → one area → one enemy**. That enemy remains the farming target after every defeat until the player changes it. There is no random rotation to another enemy.

This makes every material source legible: if a player needs a material, they can intentionally farm its source. Search time is a short presentation and pacing beat, not a random target-selection system.

## Balance in time, not isolated HP

Enemy HP must be derived from the player DPS expected at that point in progression:

`enemy HP = expected player DPS × desired time-to-kill`

This means a boss does not have a universal number such as 1,000,000 HP. One million HP is correct only if it results in the desired boss fight time for the expected end-game DPS. A million HP would be a broken early-game boss.

| Enemy type | Target time to defeat | Search before same target returns | Primary material chance band |
| --- | ---: | ---: | ---: |
| Common | 5–9 s | 1.6 s | 45–70% |
| Uncommon | 9–15 s | 2.2 s | 38–62% |
| Rare | 15–25 s | 3.2 s | 28–48% |
| Elite | 25–45 s | 4.5 s | 18–36% |
| Boss | 45–90 s | 6.5 s | 8–22% |

The live timings are centralised in `balance-data.js`. Existing enemy HP, damage and drop tables remain working test values in `world-data.js`; they should be tuned through playtesting against this framework, not bulk-replaced.

## Content unit: area

Every playable location has compact areas. An area groups one to two related enemy targets and appears between the location detail and enemy selection. It makes a location readable without forcing extra screens.

Current 0.7 areas:

- Pustina ticha: Prašná pláň, Pole děr, Hluboké dutiny.
- Odpadkové hory: Svahy hadrů, Sběračské jámy, Klecová stezka.
- Magma: Kostel žhavení, Propast, Ohnivá hora.
- Elektrika: Sběrný relay, Mrtvý obvod, Líheň jádra.

## Drops

Each reward is an independent roll. A target may have a common primary material, a lower-frequency secondary material, and a rare specialty material or fixed item on stronger targets.

Do not show internal odds, scarcity tiers or intended builds to players. Those are authoring tools. Players learn value from their drops, item effects and the market/crafting layer later.

## 0.7 test loop

For each enemy, test a 15-minute manual run and record kills per minute, deaths and downtime, materials per hour by type and quality, item drops per hour, and whether the target still feels intentional after the first useful drop.

Only then adjust HP, damage, search time or one drop band. Do not alter all variables at once.

## Asset rule

Do not duplicate an asset already used in `assets/`. The 0.7 import adds only the new shared materials under `assets/materials/global/`. These have stable material IDs in `material-data.js`; only Odpadkové hory materials with a defined enemy source are included in live drop tables. Other imported global materials are catalog-ready but intentionally have no source yet.
