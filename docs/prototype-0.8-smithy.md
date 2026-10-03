# Prototype 0.8 — Kovářství

Tento milník ověřuje, zda cílené farmení materiálů, výroba konkrétního kusu vybavení a práce s přebytečnou kořistí tvoří srozumitelný a opakovatelný loop.

## Hratelný tok

1. Hráč farmí konkrétního nepřítele pro jeho materiály.
2. V Kováři zvolí recept a systém automaticky použije nejvyšší dostupnou kvalitu každého potřebného materiálu.
3. Volitelně přidá jeden naučený prefix a jeden naučený suffix.
4. Výsledkem je samostatná instance se sériovým číslem, vlastním rollem statů, quality, odolností a upgradem `+0`.
5. Přebytečný nevybavený item lze roztavit na omezené množství materiálů.

## Pravidla svitků

- Svitek se při naučení spotřebuje a jeho affix se stane trvalým receptem.
- Při dalším kování se naučený affix nespotřebovává.
- Hráč nevidí interní tier, vzácnost svitku ani doporučený build.
- Systém vynucuje maximálně jeden prefix a jeden suffix a používá existující validaci konfliktů.

## Pracovní hodnoty k testu

| Situace | Šance úspěchu |
| --- | ---: |
| Base item bez affixu | 100 % |
| Jeden affix | 85 % |
| Prefix + suffix | 70 % |
| Upgrade +1 až +3 | 100 % |
| Upgrade +4 až +6 | 85 % |
| Upgrade +7 až +9 | 70 % |
| Upgrade +10 až +12 | 55 % |
| Upgrade +13 až +15 | 40 % |

Při neúspěšném kování se spotřebují materiály a nesené zlato. Neúspěšný upgrade do `+9` level nemění; od `+10` může snížit upgrade o jeden. Item se nikdy neničí.

## Upgrade a oprava

- Upgrade je oddělený od quality a přidává 6 % základních bojových statů za úroveň, maximálně `+15`.
- Odolnost se snižuje pouze při smrti, nikdy offline ani za obyčejné zabití.
- Výbava se automaticky nesundá a při 0 % stále poskytuje 50 % základních statů.
- Oprava obnoví plnou odolnost za zlato a lešticí směs.

## Tavba

- Taví se jen nevybavený item z inventáře.
- Oblíbený a uzamčený item nelze tavit.
- Výstup je záměrně nižší než původní výrobní cena; vyšší quality a upgrade dávají o něco lepší návratnost.
- Tavba je nevratná a před potvrzením vyžaduje potvrzení prohlížeče.

## Hranice verze

Neobsahuje frontu výroby, obchodní zakázky, recepty jako dropy, automatickou údržbu, craftění křídel ani finální ekonomický balance. Recepty, náklady, quality capy, upgrade i tavba jsou v `smith-data.js`; budoucí obsah se přidává datově.
