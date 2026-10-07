# Itemization Foundation

Kvalita a item tier jsou oddělené osy. Tier určuje sílu obsahu a quality
výjimečnost konkrétního kusu. Common má pouze hlavní stat slotu; Rare/Epic/
Legendary/Mythic/God mají postupně 1/2/3/4/5 náhodných sekundárních statů.

T1 Legendary může padnout už na začátku, ale T2 má vyšší základ. T2 Rare je
záměrně přibližně silnější v hlavním statu než T1 Legendary; konkrétní build
však může rozhodnout podle sekundárních statů a prefixu/suffixu.

Startovní quality profil: Common 93,5 %, Rare 5,8 %, Epic 0,65 %, Legendary
0,05 %. Mythic a God zatím nepadá. Při 15 itemech/h znamená Legendary zhruba
jeden kus za 133 hodin očekávaně.

Sekundární pool obsahuje jen aktivní staty: Damage, Maximum HP, Critical
Chance, Defense a Attack Speed. Defense snižuje příchozí damage; Attack Speed
zkracuje interval útoku nejvýše na 650 ms. Pokročilé/farmicí staty zůstávají
do budoucna zamčené.

Vyšší nepřítel se připravuje daty:

```js
{ itemTier: 2, affixTierPool: { 1: 75, 2: 25 } }
```

Affix pool se losuje samostatně pro prefix i suffix. Hráč interní tier affixu
nikdy nevidí.
