# Grafika — zdroje a licence

Ikony postav a předmětů pochází z [game-icons.net](https://game-icons.net) (open source SVG sada).
Všechny jsou upravené (odstraněné černé pozadí, přebarveno / nastaveno na `currentColor` pro
dynamické obarvení podle rarity) — úpravy jsou pod CC BY 3.0 povolené, atribuce autorů zůstává
zachována zde a v README.

## Postavy (arena)

| Soubor | Původní ikona | Autor | Licence |
|---|---|---|---|
| `wanderer.svg` | Hooded Figure | [Darkzaitzev](https://game-icons.net/1x1/darkzaitzev/hooded-figure.html) | CC BY 3.0 |
| `goblin.svg` | Goblin Head | [Delapouite](https://game-icons.net/1x1/delapouite/goblin-head.html) | CC BY 3.0 |

## Předměty a sloty výbavy (`items/`)

Tyto soubory jsou uložené jako referenční kopie s pevnou barvou; ve hře samotné se stejné ikony
vykreslují inline v `app.js` (`ICONS`) s `fill="currentColor"`, aby se automaticky obarvily podle
rarity předmětu.

| Soubor | Použití | Původní ikona | Autor | Licence |
|---|---|---|---|---|
| `items/iron-sword.svg` | Železný meč | Broadsword | [Lorc](https://game-icons.net/1x1/lorc/broadsword.html) | CC BY 3.0 |
| `items/goblin-cleaver.svg` | Gobliní sekáček | Meat Cleaver | [Lorc](https://game-icons.net/1x1/lorc/meat-cleaver.html) | CC BY 3.0 |
| `items/leather-vest.svg` | Kožená vesta | Leather Vest | [Lorc](https://game-icons.net/1x1/lorc/leather-vest.html) | CC BY 3.0 |
| `items/quilted-coat.svg` | Prošívaný kabátec | Sleeveless Jacket | [Delapouite](https://game-icons.net/1x1/delapouite/sleeveless-jacket.html) | CC BY 3.0 |
| `items/bone-talisman.svg` | Kostěný talisman | Tribal Pendant | [Delapouite](https://game-icons.net/1x1/delapouite/tribal-pendant.html) | CC BY 3.0 |
| `items/copper-ring.svg` | Měděný prsten | Ring | [Delapouite](https://game-icons.net/1x1/delapouite/ring.html) | CC BY 3.0 |
| `items/slot-weapon.svg` | prázdný slot zbraně | Crossed Swords | [Lorc](https://game-icons.net/1x1/lorc/crossed-swords.html) | CC BY 3.0 |
| `items/slot-armor.svg` | prázdný slot zbroje | Breastplate | [Lorc](https://game-icons.net/1x1/lorc/breastplate.html) | CC BY 3.0 |
| `items/slot-wings.svg` | prázdný slot křídel | Angel Wings | [Lorc](https://game-icons.net/1x1/lorc/angel-wings.html) | CC BY 3.0 |
| `items/slot-charm.svg` | prázdný slot talismanu | Gem Pendant | [Lorc](https://game-icons.net/1x1/lorc/gem-pendant.html) | CC BY 3.0 |
| `items/slot-helmet.svg` | prázdný slot helmy | Closed Barbute | [Delapouite](https://game-icons.net/1x1/delapouite/closed-barbute.html) | CC BY 3.0 |
| `items/slot-gloves.svg` | prázdný slot rukavic | Gloves | [Delapouite](https://game-icons.net/1x1/delapouite/gloves.html) | CC BY 3.0 |
| `items/slot-boots.svg` | prázdný slot bot | Boots | [Lorc](https://game-icons.net/1x1/lorc/boots.html) | CC BY 3.0 |
| `items/slot-pants.svg` | prázdný slot kalhot | Trousers | [Lorc](https://game-icons.net/1x1/lorc/trousers.html) | CC BY 3.0 |

## Vlastní ilustrace — sada „andělské vybavení" (uživatelem dodané)

Tyto soubory jsou vlastní/generovaná grafika dodaná uživatelem přímo do chatu, ne z game-icons.net.
Zdroj a licence zatím nejsou známé — doplnit, jakmile je uživatel upřesní.

| Soubor | Použití | Zdroj | Licence |
|---|---|---|---|
| `items/greatsword-angels.png` | Meč andělských čepelí (zbraň) | uživatel (neznámý) | TBD |
| `items/angel-armor.png` | Krunýř andělských perutí (zbroj) | uživatel (neznámý) | TBD |
| `items/angel-helmet.png` | Přilba andělského zjevení (helma) | uživatel (neznámý) | TBD |
| `items/angel-gloves.png` | Rukavice andělských spárů (rukavice) | uživatel (neznámý) | TBD |
| `items/angel-boots.png` | Boty andělského vzletu (boty) | uživatel (neznámý) | TBD |
| `items/angel-charm.png` | Přívěsek andělské záře (talisman) | uživatel (neznámý) | TBD |

`items/moth-wings.png` (Můří křídla) je dodaný asset, beze změny obsahu — oříznutý na obsah a proporcionálně zmenšený na 256 × 256 px (LANCZOS, zachovaná průhlednost).
