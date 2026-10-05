# Balance Framework — Wave Combat Economy

> Internal design document. This defines how economy numbers are authored and tested. It is never a player-facing rules page: internal affix tiers, weights, source scarcity, target times and build tags remain hidden.

## Purpose

The game is a hard, targeted grind. A player chooses one farming spot and intentionally farms that enemy for materials, items or future affix sources. Therefore every reward is balanced in **hours of real farming**, not by an isolated percentage.

```text
desired reward time → measured kills/hour → final chance/kill
```

The Balance Lab at `balance-lab.html` is the working calculator and telemetry reader for this model. It does not change live rewards.

## Wave baseline

Current expected rhythm:

| Parameter | Value |
| --- | ---: |
| Enemies per standard wave | 14 |
| Boss wave size | 4 |
| Player attack interval | 1.6 s |
| Cooldown after a cleared wave | 8.5 s |
| Expected matching-content rate | roughly 200–600 kills/hour |
| Mechanical one-shot cap (standard / boss) | 1,631 / 966 kills/hour |

```text
expected damage per hit = max(1, average damage × (1 + crit chance) − enemy defense)
hits to kill (H)        = ceil(enemy HP / expected damage per hit)

wave clear time = wave size × H × player attack interval
kills/hour      = wave size × 3,600,000 / (wave clear ms + wave cooldown ms)
```

Combat is **sequential**, not parallel: a player attack selects one living enemy. Fourteen enemies are visible at once, but the player does not kill fourteen enemies in the same second. No individual enemy respawns. The next whole wave appears only after the current one is dead and the cooldown ends.

The current base character against an early enemy is approximately `H = 4`, which produces about **514 kills/hour** for a 14-enemy wave. A stronger player can approach the one-shot cap; an underpowered player can fall to tens or low hundreds of kills/hour. Boss waves use only four enemies, so their cooldown is distributed across fewer kills and their cap is lower.

| H (hits / kill) | Standard wave 14 | Boss wave 4 |
| --- | ---: | ---: |
| 1 | 1,631 / h | 966 / h |
| 2 | 946 / h | 676 / h |
| 3 | 666 / h | 520 / h |
| 4 | 514 / h | 421 / h |
| 5 | 418 / h | 356 / h |
| 10 | 217 / h | 199 / h |

## Probability model

For final per-kill chance `p` and measured kill rate `K`:

```text
expected hours = 1 / (K × p)
P50 hours      ≈ 0.693 / (K × p)
P90 hours      ≈ 2.303 / (K × p)
```

Every chase reward requires expected time, P50 and P90. Expected time alone hides bad luck.

| Expected time at 500 kills/hour | Final chance/kill | Approx. kills | P90 |
| --- | ---: | ---: | ---: |
| 30 min | 0.4% | 250 | 69 min |
| 2 h | 0.1% | 1,000 | 4.6 h |
| 9 h | 0.0222% | 4,500 | 20.7 h |
| 36 h | 0.00556% | 18,000 | 82.9 h |
| 175 h | 0.00114% | 87,500 | 403 h |

These are final chances for one exact target, not “any item”. `500 kills/hour` is a planning reference only; every drop source must use its own measured H and observed kill rate.

## Reward architecture

```text
Enemy defeat
├─ XP + gold
├─ material-family events
│  └─ one quality → quantity
├─ equipment event
│  └─ base item → quality → affix composition → concrete affix
└─ special source later (boss / dungeon)
```

Every material family can roll independently. A successful `Iron` event selects exactly **one** quality; it must never independently roll Common Iron, Rare Iron and Epic Iron from the same event.

## Materials

One family has one stable ID and one icon. Its quality determines its visual frame/background and, later, its crafting and smelting value.

```js
{
  materialId: "iron",
  eventChance: 0.16,
  qualityWeights: { common: 70, rare: 23, epic: 5.5, legendary: 1.2, mythic: 0.3 },
  quantity: [1, 1]
}
```

At 500 kills/hour, that example yields approximately 56 Common, 18.4 Rare, 4.4 Epic, 0.96 Legendary and 0.24 Mythic Iron/hour. It is a reference for a deliberately targeted basic source, not a global rule.

- Materials allow `common` through `mythic`; `god` is not a stackable material quality.
- Requirements always show a small material icon, not name alone.
- Recipe preview communicates that better input qualities improve the output distribution.
- Smelting returns fewer materials than equivalent crafting consumed.

## Equipment, affixes and scrolls

Equipment follows this exact order:

```text
equipment event → concrete base item → item quality → affix composition → concrete prefix/suffix
```

Quality is independent from affixes. An Epic Iron Dagger can have no affix, one affix, or both a prefix and suffix.

Reference composition to test:

| Item quality | No affix | One affix | Prefix + suffix |
| --- | ---: | ---: | ---: |
| Common | 80% | 18% | 2% |
| Rare | 67% | 27% | 6% |
| Epic | 52% | 33% | 15% |
| Legendary | 40% | 38% | 22% |
| Mythic | 28% | 42% | 30% |

### Smelting

- Smelting irreversibly destroys only an unequipped, unlocked item.
- Base-item materials return in lower total value than crafting input.
- Item quality can improve returned material quality and/or quantity.
- Each concrete prefix has its own scroll-recovery roll; each suffix has its own roll. A dual-affix item can therefore recover zero, one or two exact scrolls.
- Failed recovery does not cancel the normal material return.

### Scrolls

- An unlearned scroll can be traded.
- Learning consumes it and permanently unlocks its affix recipe.
- A learned affix is reusable during crafting; it is not consumed per craft.
- Player UI may show the name, explicit effect, drawback, compatible slots, level requirement and tradeability.
- Player UI never shows internal tier, rarity, drop weight, acquisition time, intended build or recommended pairing.

The final chance for an exact scroll is:

```text
equipment event × base-item selection × quality × affix composition
× concrete-affix selection × smelting recovery
```

Internal live-economy targets for a **specific targeted scroll**:

| Stage | Expected time |
| --- | ---: |
| T1 | 20–40 min |
| T2 | 1.5–3 h |
| T3 | 6–12 h |
| T4 | 24–60 h |
| T5 | 100–250 h |

Early pools must remain small and early scroll recovery comparatively generous. Otherwise several individually small chances become an accidental multi-hundred-hour lottery.

## Gold and XP

Gold is balanced backwards from sinks:

```text
gold/hour = target cost / target saving hours
gold/kill = gold/hour / measured kills/hour
```

Gold from player-to-player trading is a transfer, not an economic sink. Real sinks are crafting fees, upgrades, repairs and future market fees/taxes. Death removes 5% of carried gold; banked gold is protected.

| Spend | Target relevant farming time |
| --- | ---: |
| Repair | 2–10 min |
| Basic craft | 20–45 min |
| One-affix craft | 2–5 h |
| Risky high upgrade | 10–50 h |
| Top prefix + suffix craft | Major reserve decision; up to 80–90% of prepared funds |

XP uses the same method:

```text
XP/hour = kills/hour × XP/kill
time to level = XP needed / XP/hour
```

The future level-400 reset journey is balanced as one total time target, not as 400 independent level rewards.

## Test process

For one common enemy, one elite and one boss, run three 15-minute tests:

1. underpowered character;
2. expected character;
3. overpowered character.

Use Balance Lab telemetry to record clear time, kills/hour, deaths, XP/hour, gold/hour and rewards/hour. Change only one variable in a test pass: enemy HP, cooldown, XP, gold, or one specific drop.

Only after those measurements are stable should ordinary live drops receive affix composition and smelting scroll recovery.
