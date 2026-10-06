# Prototype 0.10 — první pásmo ekonomiky

Tato změna převádí schválený základ z `idle-rpg-progression-economy-v0.1`
do první hratelné vrstvy. Není to finální balance celé mapy ani model svitků.

## Aktivní pravidla

- Výchozí výpočet pracuje s 500 killy za hodinu.
- Goblin má 3% šanci na vybavení, tedy očekávaně 15 kusů za hodinu.
- Kvalita startovního vybavení: 94% Common, 5,5% Rare, 0,5% Epic.
  Kvalita v této fázi mění vzhled, ne statový násobič.
- Kvalita startovních materiálů: 90% Common, 9% Rare, 1% Epic.
- Každý nalezený kus vybavení má nejvýše jeden prefix a jeden suffix:
  76% bez affixu, 11% prefix, 11% suffix, 2% obojí.
- Do živých dropů se v této fázi mohou propsat jen T1 affixy kompatibilní
  se slotem předmětu. Jejich interní tier ani vzácnost se hráči nezobrazuje.
- Železný meč a Kožená vesta jsou vyrobitelné už ze startovního Goblina.
  Materiálové zdroje v pozdějších lokacích zůstávají zachované.
- Startovní recept stojí 200 gold. Upgrade +1 až +3 stojí 50/100/150 gold,
  vždy uspěje a celkem spotřebuje 6 Iron Rivets a 3 Sharpening Stones.
- Oprava v prvním pásmu stojí pouze gold.

## Vědomě mimo rozsah

- žádná šance na získání svitku z tavení;
- craftěné předměty nikdy nevracejí svitek;
- žádné Legendary+ náhodné dropy v prvním pásmu;
- žádné T2+ affixy v živých dropech;
- žádné finální XP křivky, statový růst, endgame lokace ani marketové ceny.

Další patch musí nejdříve rozhodnout návratnost svitku z tavení a cílové
časové intervaly pro T2+; bez toho se tyto systémy neaktivují.
