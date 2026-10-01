# Item Visual Rarity Rules

## Purpose

This document defines how equipment, wings, crafting materials, consumables, and affix scrolls are presented in the game UI. Equipment and materials communicate quality through color. Prefix and suffix scrolls are a deliberate exception and use one uniform visual presentation without player-facing rarity.

The system must feel like an old-school pixel RPG: bold, readable, slightly rough, and valuable items should feel exciting without using smooth modern neon effects.

## Core Principles

1. **Quality determines the slot background, frame, name color, and rarity effect.**
2. **Item type does not normally change rarity colors.** Wings are the only current exception.
3. **Upgrade level does not change item quality.** A Common `+10` item is still Common.
4. **Color must never be the only quality indicator for equipment and materials.** Display their English quality name in item details and tooltips.
5. **Glow begins at Legendary quality.** Common, Rare, and Epic items do not glow.
6. **All effects are static and pixel-based.** Do not use smooth pulsing, large blurred shadows, or glow that covers nearby slots.
7. **The item asset remains the visual focus.** Backgrounds may be bold, but they must not reduce icon readability.

## Quality Scale

Use these names consistently in code and UI:

```text
Common → Rare → Epic → Legendary → Mythic → God
```

Do not use `Normal` as a player-facing quality name. Use `Common`.

## Equipment Quality Presentation

| Quality | Full Slot Background | Frame | Glow | Player-facing Label |
| --- | --- | --- | --- | --- |
| Common | Gray | Light gray, single pixel frame | None | `COMMON` |
| Rare | Blue | Bright blue pixel frame | None | `RARE` |
| Epic | Purple | Bright violet pixel frame | None | `EPIC` |
| Legendary | Turquoise | Bright turquoise pixel frame | Subtle static pixel glow | `LEGENDARY` |
| Mythic | Red | Bright red pixel frame | Stronger static pixel aura | `MYTHIC` |
| God | Turquoise–pink–red gradient | Bright multicolor or double pixel frame | Unique multicolor pixel aura | `GOD` |

### Background Treatment

- The quality color fills the complete slot background.
- Use controlled saturation and sufficient contrast so the item silhouette remains readable.
- Add a subtle pixel texture, dithering, or tonal variation to avoid a flat mobile-game appearance.
- Do not replace the full background with only a thin colored line.
- The God gradient must look stepped or dithered rather than perfectly smooth.

### Working Color Tokens

These values are starting points and may be visually tuned after testing with actual item assets:

```css
--quality-common-bg: #4a4d52;
--quality-common-frame: #a5a9ae;

--quality-rare-bg: #174f9b;
--quality-rare-frame: #55aaff;

--quality-epic-bg: #642b91;
--quality-epic-frame: #c478ff;

--quality-legendary-bg: #087e7b;
--quality-legendary-frame: #35ead8;

--quality-mythic-bg: #8d222b;
--quality-mythic-frame: #ff555f;

--quality-god-start: #16d9ca;
--quality-god-middle: #d23fb5;
--quality-god-end: #ff454f;

--wing-bg: #9a6a16;
--wing-frame: #ffd45d;
```

Do not treat these values as final balance or permanent art direction. Check contrast and asset readability before locking them.

## Glow Rules

### Common, Rare, and Epic

- No glow.
- Their value is communicated through the full background, frame, quality label, and name color.

### Legendary

- A restrained, static turquoise pixel glow.
- Prefer a bright inner edge and a few one-pixel fragments around the frame.
- The effect may extend only a few pixels outside the slot.
- It must not overlap adjacent item icons.

### Mythic

- A stronger static red pixel aura.
- Use broken edge highlights, sparse corner sparks, or irregular pixel fragments.
- It must remain clearly stronger than Legendary but less visually unique than God.

### God

- A unique turquoise, pink, and red pixel aura.
- Use stepped color bands, dithering, and irregular luminous pixels.
- The effect must remain readable against both dark and light interface surfaces.
- No automatic pulsing or smooth color cycling.

### Forbidden Glow Styles

- large blurred CSS shadows,
- constant pulsing,
- smooth breathing animations,
- glow covering the item artwork,
- bloom extending across nearby inventory slots,
- identical glow intensity for Legendary, Mythic, and God.

## Wings

Wings are a special item class and override the standard quality background.

### Wing Rules

- Every wing item always uses a gold background.
- Every wing item always uses a gold pixel frame.
- Standard wings do not automatically glow.
- Only the rarest explicitly marked wings receive a restrained static gold aura.
- Wing quality must not replace the gold background with blue, purple, turquoise, red, or the God gradient.
- Internal wing tiers may be communicated through their name, stats, frame ornament, badge, and an explicit special-effect flag.

Do not infer the gold wing aura from ordinary item quality. Store it explicitly in item data.

Suggested data:

```js
{
  itemType: "wings",
  quality: "legendary",
  visualClass: "wings",
  wingGlow: "none" // or "gold"
}
```

## Materials and Consumables

Crafting materials, consumables, recipes, and other quality-bearing stackable items use the same quality language as equipment.

Allowed qualities:

```text
Common → Rare → Epic → Legendary → Mythic
```

Rules:

- Materials and consumables cannot have God quality.
- The natural appearance of the asset does not determine its quality. Wood still looks like wood; its UI background communicates its quality.
- Legendary and Mythic stackable items may glow, but their glow should be weaker than equipment glow to prevent a material-filled inventory from becoming visually noisy.

## Affix Scroll Exception

Prefix and suffix scrolls do not use the equipment or material quality scale in player-facing UI.

Rules:

- Every affix scroll uses the same dedicated scroll background and pixel frame.
- Every affix scroll uses the same name color and the same glow behavior.
- Scrolls do not display `Common`, `Rare`, `Epic`, `Legendary`, `Mythic`, `God`, or `T1–T5`.
- Internal tier, drop weight, source scarcity, stat strength, and market value must not change the scroll's visual treatment.
- A stronger or rarer scroll must not receive a brighter frame, different background, additional glow, rarity badge, or special name color.
- The player sees the scroll name, exact modifiers, conditions, compatible slots, and functional restrictions, but decides its value independently.
- Prefix and suffix scrolls may use different icon symbols when useful, but those symbols identify scroll type rather than power.
- Development and balance tools may show internal tier and scarcity metadata; normal game UI must not.

Recommended semantic data:

```js
{
  itemType: "affix_scroll",
  affixType: "suffix",
  affixId: "suffix_of_discovery",
  visualClass: "affix_scroll"
}
```

Do not assign an equipment-style `quality` value to an affix scroll instance. Internal balance data belongs to the referenced affix definition and must be ignored by the production renderer.
- Stack count must remain readable on every background.

## Maximum Upgrade Presentation

Upgrade level is a separate visual layer and must never overwrite quality presentation.

- Normal upgrade levels are shown only as a numeric value such as `+4` or `+9`.
- A special upgrade effect appears only when the item reaches its maximum upgrade level.
- A maximum-upgrade item receives a dedicated `MAX` marker, special frame corners, a rune, or a small set of crisp pixel sparks.
- The maximum-upgrade effect must use a neutral light or white-gold treatment that is distinguishable from rarity glow.
- Do not make the rarity background brighter to communicate upgrade level.
- A maximally upgraded Common item must still be immediately recognizable as Common.

Suggested data:

```js
{
  quality: "epic",
  upgradeLevel: 10,
  maxUpgradeLevel: 10,
  isMaxUpgraded: true
}
```

## Complete Set Presentation

Set completion is independent of both quality and upgrade level.

- Individual inventory slots retain their normal quality presentation.
- A complete equipped set should primarily affect the character preview.
- Use a restrained old-school holy aura, pixel sparks, or a fragmented outline around the character.
- Do not simply increase the glow of every equipped slot.
- Different set effects may eventually define their own aura color and pattern without changing item quality.

## Interaction and Status States

Hover, selection, equipped state, comparison, lock, favorite, damaged, and broken states must not replace quality colors.

Recommended treatment:

| State | Presentation |
| --- | --- |
| Hover | Neutral white inner outline |
| Selected | Strong neutral outline or corner brackets |
| Equipped | Small equipped icon or label |
| Locked | Lock icon |
| Favorite | Star icon |
| Damaged | Durability icon or warning stripe |
| Broken | Broken icon plus desaturation of the asset, while preserving the quality frame |
| Max upgrade | Dedicated `MAX` overlay or rune |

## Visual Layer Priority

Apply item visuals in this order:

1. **Item type override** — wings replace the standard quality background with gold; affix scrolls replace it with the uniform scroll presentation.
2. **Quality** — defines the standard background, frame, item-name color, and base glow eligibility only for quality-bearing item types.
3. **Special glow** — Legendary, Mythic, God, or explicitly marked rare wings.
4. **Maximum upgrade overlay** — separate marker or effect.
5. **Set state** — primarily shown on the character preview.
6. **Interaction and status overlays** — hover, selected, equipped, locked, damaged, and similar states.

No later layer may make the original quality impossible to recognize.

## Recommended Data Model

Use semantic values instead of storing raw CSS classes in item definitions.

```js
const ITEM_QUALITIES = {
  common: {
    rank: 0,
    label: "COMMON",
    glow: "none",
    allowedForStackables: true
  },
  rare: {
    rank: 1,
    label: "RARE",
    glow: "none",
    allowedForStackables: true
  },
  epic: {
    rank: 2,
    label: "EPIC",
    glow: "none",
    allowedForStackables: true
  },
  legendary: {
    rank: 3,
    label: "LEGENDARY",
    glow: "legendary",
    allowedForStackables: true
  },
  mythic: {
    rank: 4,
    label: "MYTHIC",
    glow: "mythic",
    allowedForStackables: true
  },
  god: {
    rank: 5,
    label: "GOD",
    glow: "god",
    allowedForStackables: false
  }
};
```

Recommended item fields:

```js
{
  id: "stable-item-id",
  itemType: "weapon",
  quality: "legendary",
  visualClass: "standard",
  upgradeLevel: 0,
  maxUpgradeLevel: 10,
  setId: null,
  specialGlow: null
}
```

The renderer should derive classes and effects from these values. Item data should not contain presentation-only strings such as `className: "item-blue-glow"`.

## UI Coverage

The same rules must be applied to:

- inventory slots,
- equipped-item slots,
- item comparison panels,
- item detail modal or drawer,
- loot toasts,
- recent-drop history,
- crafting ingredients and results,
- smelting and forging screens,
- shop, market, and bank screens,
- item catalog and development tools.

Small UI representations may simplify the effect, but they must not use a different color meaning.

## Accessibility and Readability

- Always show the written quality name in the full detail of quality-bearing equipment and materials. Do not show a quality label for affix scrolls.
- Use distinct frames or corner patterns in addition to color where practical.
- Keep item names readable against their quality background.
- Ensure stack counts, upgrade levels, and status icons have sufficient contrast.
- Do not rely on red versus green alone for any comparison or status.

## Acceptance Criteria

The implementation is complete when:

- all six equipment qualities have clearly distinguishable full-slot backgrounds,
- Common, Rare, and Epic have no glow,
- Legendary, Mythic, and God have visibly different static pixel effects,
- God uses a turquoise–pink–red stepped or dithered gradient,
- every wing uses gold presentation regardless of quality,
- only explicitly marked rarest wings have gold glow,
- materials and quality-bearing consumables use the same scale but cannot be God quality,
- every prefix and suffix scroll uses the same dedicated scroll presentation without a quality or tier label,
- scroll strength and scarcity never change its background, frame, name color, or glow,
- Legendary and Mythic stackables have a reduced glow intensity,
- only maximally upgraded items receive the separate upgrade effect,
- quality remains recognizable under hover, selection, equipment, damage, and upgrade overlays,
- effects do not pulse, blur excessively, obscure assets, or spill across adjacent slots,
- the result works consistently on desktop, tablet, and mobile layouts.

## Out of Scope

This document does not define:

- drop probabilities,
- economic value,
- stat ranges,
- how quality is rolled,
- upgrade success rates,
- the number or power of wing tiers,
- final color calibration for every monitor and asset.

Those systems may use the visual quality definitions established here, but they must be specified separately.
