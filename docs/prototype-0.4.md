# Prototype 0.4 — Materiály a cílený loot

Navazuje na Prototype 0.3 (viz historický dokument `prototype-0.3.md`, který se nemění).

## Hlavní testovací otázka

**Je výběr konkrétního nepřítele podle jeho materiálů a dropů dostatečně zajímavý, aby motivoval hráče střídat farmené cíle?**

Crafting se v této verzi neimplementuje. Ověřujeme, zda hráč rozumí tomu, co který nepřítel dropuje, proč ho farmit, kolik materiálů vlastní, které dropy jsou běžné/vzácné a kde konkrétní materiál získat.

## Nepřátelé Pustiny ticha

| ID | Jméno | Typ | Úroveň |
| --- | --- | --- | ---: |
| e01 | Prašná můra | COMMON | 2 |
| e02 | Plastová můra | COMMON | 3 |
| e03 | Slepá můra | UNCOMMON | 4 |
| e04 | Pamětnice | RARE | 5 |
| e05 | Můra z hlubiny | ELITE | 6 |
| e06 | Matka děr | BOSS | 7 |

Všichni jsou přístupní od začátku. Staty z Prototype 0.3 zůstaly beze změny.

## Přidané materiály (`material-data.js`)

| ID | Název | Rarita | Kategorie | Asset |
| --- | --- | --- | --- | --- |
| `wing-dust` | Prach z křídel | common | material | `assets/materials/wing-dust.png` |
| `torn-membrane` | Potrhaná blána | common | material | `assets/materials/torn-membrane.png` |
| `underground-fiber` | Podzemní vlákno | uncommon | material | `assets/materials/underground-fiber.png` |
| `polymer-nest-piece` | Kus polymerového hnízda | uncommon | material | `assets/materials/polymer-nest-piece.png` |
| `human-memory-fragment` | Fragment lidské vzpomínky | rare | material | `assets/materials/human-memory-fragment.png` |
| `mother-eye` | Oko Matky | epic | material | `assets/materials/mother-eye.png` |
| `scroll-of-oblivion` | Svitek zapomnění | rare | **scroll** | `assets/materials/scroll-of-oblivion.png` |

Každý má `id`, `name`, `asset`, `rarity`, `category`, `stackable`, `tradeable`, `sourceLocationId`, `sourceEnemyIds` a `description`. ID je stabilní a nezávislé na názvu (podle něj se ukládá save i odkazují drop tabulky a do budoucna recepty). Rarita `uncommon` je nová a používají ji jen materiály (váha 0 v rollu vybavení, takže šance na gear se nezměnila). Svitek je kategorie `scroll`, zatím zobrazený mezi materiály se štítkem SVITEK.

## Zdroje materiálů

| Materiál | Padá z |
| --- | --- |
| Prach z křídel | Prašná můra (hlavní), Plastová můra, Slepá můra, Pamětnice |
| Potrhaná blána | Prašná můra, Plastová můra, Slepá můra |
| Podzemní vlákno | Slepá můra (hlavní), Můra z hlubiny (hlavní) |
| Kus polymerového hnízda | Plastová můra (hlavní), Můra z hlubiny |
| Fragment lidské vzpomínky | Pamětnice (hlavní), Matka děr (hlavní), Můra z hlubiny |
| Svitek zapomnění | Pamětnice (vzácný), Matka děr (vzácný) |
| Oko Matky | **pouze** Matka děr |

## Pracovní drop tabulky (`world-data.js`)

Každý řádek `materialDrops` je samostatný hod za jedno vítězství. Procenta jsou pracovní balance; hráči se zobrazuje jen slovní úroveň (Běžný / Neobvyklý / Vzácný / Velmi vzácný drop).

| Nepřítel | Materiál | Šance | Množství | Úroveň dropu |
| --- | --- | ---: | ---: | --- |
| Prašná můra | Prach z křídel | 80 % | 1–3 | Běžný |
| | Potrhaná blána | 25 % | 1 | Neobvyklý |
| Plastová můra | Kus polymerového hnízda | 55 % | 1–2 | Běžný |
| | Potrhaná blána | 30 % | 1 | Neobvyklý |
| | Prach z křídel | 20 % | 1–2 | Neobvyklý |
| Slepá můra | Podzemní vlákno | 50 % | 1–2 | Běžný |
| | Prach z křídel | 25 % | 1–2 | Neobvyklý |
| | Potrhaná blána | 25 % | 1 | Neobvyklý |
| Pamětnice | Fragment lidské vzpomínky | 35 % | 1 | Běžný |
| | Prach z křídel | 20 % | 1–2 | Neobvyklý |
| | Svitek zapomnění | 5 % | 1 | Vzácný |
| Můra z hlubiny | Podzemní vlákno | 45 % | 1–3 | Běžný |
| | Kus polymerového hnízda | 20 % | 1–2 | Neobvyklý |
| | Fragment lidské vzpomínky | 12 % | 1 | Vzácný |
| Matka děr | Fragment lidské vzpomínky | 60 % | 1–2 | Běžný |
| | Svitek zapomnění | 10 % | 1 | Vzácný |
| | Oko Matky | 5 % | 1 | Velmi vzácný |

**Chitinové vybavení** (samostatný hod, `dropChance`): Prašná/Plastová můra 2 %, Slepá můra 3 %, Pamětnice 4 %, Můra z hlubiny 14 % (zvýšená šance), Matka děr 45 %. V dodaných assetech nejsou žádné „vzácnější chitinové materiály“, proto ve verzi 0.4 nejsou; chitin zůstává jen jako vybavení. Goblin zůstal beze změny (42 % na vybavení, žádné materiály).

Poznámka: v 0.3 dávalo všech šest nepřátel Pustiny chitinové vybavení s 40–50 % šancí. Ve 0.4 je to záměrně řídké, aby materiály byly hlavním důvodem výběru nepřítele.

Konzistence `sourceEnemyIds` (materiály) s drop tabulkami se při startu kontroluje (`validateMaterialSources` v `app.js`, jen varování do konzole), a hod materiálu se navíc provede jen pro nepřítele uvedeného v `sourceEnemyIds`.

## Chování inventáře

- Záložka **VYBAVENÍ**: beze změny, limit 18 předmětů, každý kus samostatně, equip a detail.
- Záložka **MATERIÁLY**: `state.materials` (id → počet); stejné materiály se automaticky stackují, nepočítají se do limitu 18, nejdou vybavit, zobrazí se jen vlastněné. Každá karta ukazuje počet. Klik otevře detail ve stejném vizuálním systému: velký asset, název, rarita, vlastněný počet, kategorie, lokace původu, nepřátelé, obchodovatelnost, popis. Bez statistik vybavení.
- Prázdné stavy jsou pro vybavení a materiály odlišné.
- Plný inventář vybavení nikdy nebrání dropu materiálu.
- Mapa: každý nepřítel má rozbalitelnou sekci **MOŽNÁ KOŘIST** (ikona, název, rarita, typ, úroveň dropu).
- U boje je přehled **POSLEDNÍ KOŘIST** (posledních 5 dropů materiálů i vybavení, s časem); nejde o modal.
- Toast „Získáno: Prach z křídel ×2“ mizí sám, nepozastavuje boj, na obrazovce jsou nejvýš 3. Combat log si historii dropů uchovává.

## Migrační pravidla (save z Prototype 0.3)

- Klíč `idle-rpg-prototype-v02` a `version: 2` zůstaly; nová pole `materials` a `recentDrops` jsou volitelná (chybí → prázdná).
- Level, XP, gold, vybavení, inventář, vybraná lokace/nepřítel se nemění.
- Save 0.3 uložený s jmény „Nepřítel N“ nevadí: nepřátelé se načítají podle ID (`e01`–`e06`).
- Staré generické stackovatelné položky v inventáři (pole `quantity`, bez slotu), jejichž `icon`/`materialId` odpovídá ID známého materiálu, se přesunou do `materials`; ostatní zůstávají v inventáři beze změny.
- Poškozená pole (`materials`, `recentDrops`) se ignorují a nahradí prázdnými; neznámá ID materiálů v savu se zachovají.

## Známá omezení

- Bez craftingu, receptů, rozebírání, banky, marketu, offline postupu, další lokace a postupného odemykání.
- Materiály nelze zatím nijak použít ani prodat/smazat; slouží jen k ověření sběru.
- Svitek nemá vlastní záložku.
- Jeden z dodaných assetů (`kridla_mura_material.png`, celé můří křídlo) zatím žádný materiál nepoužívá; není v repu.
- Procenta a množství jsou pracovní balance, nejsou závazná.
- Testy/lint/build repozitář nemá (statický HTML/CSS/JS bez build kroku); ověřeno syntaktickou kontrolou a simulací v jsdom.

## Scénář krátkého testování (5–10 min)

1. Otevři mapu → Pustina ticha; u každého nepřítele si prohlédni „Možná kořist“.
2. Vyber Prašnou můru, nech 2–3 minuty farmit; sleduj toasty, „Poslední kořist“ a záložku MATERIÁLY (stackování).
3. Zjisti, který nepřítel dává Podzemní vlákno a Kus polymerového hnízda; přepni na něj.
4. Otevři detail materiálu a ověř zdroje.
5. Naplň inventář vybavení na 18 a ověř, že materiály dál padají.
6. Zkus Pamětnici (Svitek zapomnění) a Matku děr (Oko Matky); ověř, že Oko Matky padá jen z ní.
7. Obnov stránku a ověř, že materiály, level, gold a cíl zůstaly.
8. Na mobilu (šířka ≤ 430 px) zkontroluj záložky, mřížku materiálů a detail bez horizontálního scrollu.

Otázky po testu: Věděl jsi vždy, koho farmit? Bylo střídání cílů zajímavé, nebo jen zdlouhavé? Zdály se vzácné dropy dost vzácné, a přitom dosažitelné?
