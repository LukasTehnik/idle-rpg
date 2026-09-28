# Návrh hry: idle RPG, loot a hráčské kovářství

**Verze:** 0.1 · **Datum:** 26. 9. 2026 · **Stav:** pracovní návrhový dokument

Tento dokument zachycuje dosavadní směr hry. Rozlišuje **záměr hráče/autora** (co má hra umět), **pracovní návrh** (jedna z možných implementací) a **otevřené rozhodnutí** (pravidlo zatím není dohodnuté). Číselné příklady nejsou automaticky finální balance.

## 1. Vize a hlavní smyčka

Prohlížečové idle/zero-player RPG: hráč nastaví, proti komu postava bojuje, a sleduje automatický boj, výsledky a combat log. Přímé ovládání jednotlivých úderů není základ hry. Hra má fungovat při aktivním sledování i během nepřítomnosti hráče. Postup je pomalý, významné dropy vzácné a malé číselné rozdíly mají mít váhu; cílem není nekonečná inflace damage a levelů.

**Základní smyčka:** vybrat nepřítele → automaticky bojovat → získat XP, gold, itemy a suroviny → zlepšit postavu nebo obchodovat → vrátit se k farmení či zkusit silnějšího nepřítele. Starší lokace mají zůstat užitečné, například díky surovinám pro pozdější crafting.

Hra má později umožnit různé role: bojovník, obchodník a specializovaný crafter. Trh a interakce mezi hráči jsou součástí dlouhodobé vize, ale první prototyp musí být zajímavý i bez nich.

## 2. Boj, aktivita a postup

| Oblast | Dosavadní směr | Co ještě určit |
| --- | --- | --- |
| Výběr cíle | Hráč si může zvolit konkrétního nepřítele a opakovaně ho farmit. | Přesný vztah výběru lokace a nepřítele; zda existují i náhodná setkání. |
| Opakování boje | Automatický boj bez přímého ovládání úderů. | Okamžitý další souboj, nebo prodleva po zabití. |
| Základ postavy | HP, damage, smrt, XP, level, combat log. | Přesné vzorce, healing, ztráty a časové intervaly. |
| Aktivní hra | Malý bonus Magic Find při aktivní přítomnosti (padly příklady 1 % a 2,5 %). | Definice „aktivní“, velikost bonusu a ochrana proti předstírané aktivitě. |
| Offline postup | Postava může pokračovat mimo aktivní session; po návratu hráč dostane report. | Limity, simulace soubojů, smrt, zásoby, odměny a shoda s online výsledky. |
| Růst síly | Pomalý postup a malá smysluplná čísla. | Level cap, křivka XP, staty, třídy a buildy. |

### Smrt a zlato

Zazněl záměr, aby smrt odebrala **5 % zlata, které postava nese u sebe**, a banka chránila uložené zlato. Ještě je nutné navrhnout důvod držet zlato mimo banku: pokud lze kořist okamžitě a zdarma uložit odkudkoli, penalizace smrti ztratí význam. Automatické ukládání ani zákaz přístupu k bance zatím nejsou rozhodnuté.

## 3. Loot a jednotlivé předměty

- Základní typy předmětů mají rozpoznatelné vlastnosti. Hodnotu konkrétního kusu mění rarity a náhodné hodnoty statů (*rolls*); rozsahy, distribuce a případné tierované affixy ještě nejsou stanovené.
- Výrazně vzácný drop má být událost, ze které má hráč radost. Lootnuté vybavení zůstává důležitou cestou k postupu.
- Každý obchodovatelný kus vybavení je **samostatná instance** s vlastním interním ID, vlastnostmi a historií. To je důležité pro market, porovnávání, kontrakty a ochranu proti duplicitám. Veřejně viditelné sériové číslo je zvláštní prezentační vrstva.
- **Specifická kombinace vyrobeného base itemu + prefixu + suffixu** vzniká pouze craftingem; stejný hotový výrobek nemá padat přímo z nepřátel. Tím se odlišuje původ crafted a loot gearu. Ještě není rozhodnuté, zda se některé základní předměty mohou i lootovat a následně použít při kování.

## 4. Klíčový systém: výroba pojmenovaných předmětů

Hráč může vytvořit základní zbraň bez prefixu a suffixu, nebo při výrobě použít naučené recepty. Zamýšlený vzorec:

> **Základní předmět + volitelný prefix + volitelný suffix + materiály různé kvality + výsledek kování → konkrétní instance předmětu**

Ilustrační název: **Shadow Blade of Infinity**. Názvy „Shadow“, „Blade“ a „of Infinity“ jsou příklady inspirované vzpomínkou na Gladiatus, nikoli schválený obsah hry. Pořadí a česká lokalizace názvů se určí později.

### Recepty jako trvalá znalost

**Výchozí směr:** vzácný svitek/recept hráč získá, naučí se jej a potom může daný prefix nebo suffix používat opakovaně. Recept se nespotřebuje při každém craftu. Toto rozhodnutí podporuje specializované craftery, kteří jsou na serveru známí tím, co umějí vyrobit. Trvale se spotřebovávají materiály a případně zlato, zejména při neúspěšných pokusech.

Předchozí návrh, v němž by se pro každý pokus spotřeboval nový prefix/suffix svitek, **není výchozím směrem**. Stejně tak nejsou potvrzené hybridní esence nebo katalyzátory. Vzácnost naučené znalosti může v dlouhém období klesat, jak recept získá více hráčů; řešení není rozhodnuto.

### Kvalita surovin a výsledného předmětu

Tentýž typ suroviny může existovat v různých kvalitách, například obyčejné, rare, epic a legendary dřevo. Při smíšení kvalit se mění pravděpodobnost kvality výsledku. Silný recept tedy sám o sobě nezaručuje nejlepší kus: hráč potřebuje i kvalitní materiály, úspěšný craft a případně dobrý roll statů.

**Pracovní příklad:** recept vyžaduje železo, dřevo a kůži. Kombinace rare a epic surovin dává určitou šanci na rare a určitou na epic výsledek; přesná procenta, vážení počtem či hodnotou surovin a případné další stupně nejsou určeny. Materiály nejvyšší kvality vytvářejí cestu k nejvyšší kvalitě výrobku, ale konkrétní garance se musí teprve navrhnout. Vzácná verze běžného materiálu může udržet starší oblasti ekonomicky relevantní.

### Riziko výroby

U nejcennějších kombinací má být kování riskantní. Padl ilustrační příklad **20–30% šance na úspěch**; nejde o plošně schválenou sazbu. Je třeba oddělit dvě nezávislé otázky:

1. **Uspěl pokus o výrobu?** Při selhání musí pravidla předem určit, které materiály či zlato se spotřebují, co se stane s base itemem a zda crafterovi roste zkušenost. Naučené recepty zůstávají.
2. **Jaká kvalita a jaké hodnoty statů vznikly při úspěchu?** Pravděpodobnost kvality se má odvíjet od použitých materiálů; další roll statů se musí stanovit zvlášť.

Každý úspěšně vyrobený kus dostane jedinečné ID a může mít viditelné číslo, například `#000184`. Je nutné určit, zda se čísluje globálně, podle názvu kombinace, serveru nebo kvality; číslo samo o sobě nemusí znamenat lepší staty.

**Dlouhodobý cíl:** „nejlepší recept“ není konec hry. Hráč může shánět kvalitnější materiály, lepší roll, vzácnější kombinaci nebo služby zkušenějšího craftera. Crafted gear může tvořit samostatnou prestižní cestu vedle loot gearu; přesný poměr síly obou cest zatím není stanoven.

## 5. Hráčské zakázky na výrobu

Autorův záměr: hráči se mají navzájem vyhledat, domluvit na výrobě a zaplatit crafterovi za znalost vzácného receptu. Inspirací je zkušenost, kdy zákazník dodal materiály a odměnu konkrétnímu hráči. Hra má nabídnout **smlouvu/kontrakt**, aby předání cenných surovin nestálo jen na důvěře.

### Pracovní návrh smlouvy

Smlouva eviduje objednavatele, craftera, požadovaný base item, prefix a suffix, minimální kvalitu (pokud je sjednána), dodané materiály, odměnu, deadline a pravidla neúspěchu. Obě strany ji předem odsouhlasí. Potřebné materiály a sjednaná odměna jsou v úschově systému (*escrow*) a lze je použít jen podle podmínek smlouvy. Historie pokusů je viditelná oběma stranám.

Uživatel navrhl, že crafter vloží hotový item do smlouvy, název se rozsvítí zeleně a zákazník zaškrtne převzetí. Jako bezpečnější pracovní varianta se nabízí, aby systém **automaticky ověřil přesné vlastnosti konkrétní instance** a po splnění provedl výměnu. Rozhraní může i tak ukázat zelený seznam splněných podmínek. Ruční potvrzení může sloužit pro společenský moment nebo řešení sporu, nesmí však umožnit jedné straně zadržet plnění po řádném dodání.

**Zásadní nesoulad k dořešení:** při 20–30% úspěšnosti nelze současně slíbit vrácení *všech* původních materiálů nebo hotový předmět do 14 dní, pokud objednavatel poskytl materiály jen na jeden pokus a selhání je spotřebuje. Smlouva proto musí výslovně určit, kdo nese riziko a co nastane po selhání nebo uplynutí lhůty.

| Model zakázky | Materiály a riziko | Odměna | Stav |
| --- | --- | --- | --- |
| Výroba za pokus | Zákazník dodává materiály a nese předem popsané ztráty při selhání. | Crafter dostává částku za provedený pokus. | Pracovní návrh. |
| Garantované dodání | Crafter obstarává materiály a nese náklady dalších pokusů; musí mít z čeho případně uhradit nesplnění. | Dostává cenu až po doručení odpovídajícího kusu. | Pracovní návrh. |

Před implementací je třeba dořešit odstoupení, vypršení lhůty, opuštěný účet, více pokusů, refundace, vlastnictví vzniklých nevyhovujících kusů, vklad/kolaterál craftera, důkazní historii a atomické vypořádání bez možnosti dvojího utracení. Kontrakt by neměl vypadat jako garance, kterou systém ve skutečnosti nevynucuje.

## 6. Ekonomika a dlouhodobý postup

- **Zdroje (*faucets*):** nepřátelé vytvářejí zlato, itemy a materiály.
- **Spotřeba (*sinks*):** neúspěšné i úspěšné kování mohou spotřebovávat materiály; 5% ztráta neseného zlata při smrti je zamýšlený gold sink. Market fee, repair, travel, další crafting fees apod. jsou pouze náměty k pozdějšímu posouzení.
- **Trh:** hráči mají prodávat a kupovat itemy, materiály a případně recepty; vyhledávání, filtry, srovnání kusů a historie cen jsou pozdější návrhy. Přímý P2P trade je žádoucí součást dlouhodobé vize, ale pořadí implementace není definitivní.
- **Trh služeb:** permanentní recept vytváří hodnotu znalosti konkrétního craftera. Objednávky zachovávají domluvu hráčů a systém smluv chrání dohodnuté plnění.
- **Endgame:** dlouhodobé cíle mohou tvořit kvalitní rolly, vzácné crafted kusy, sbírky, alternativní buildy, ekonomika, crafting mastery a kosmetické odměny. To jsou možnosti, nikoli schválený seznam funkcí.

U permanentních receptů sledujeme **rozšiřování znalosti na serveru**; u neustále vznikajících itemů **rostoucí nabídku gearu**; u gold dropů **inflaci měny**. Balance potřebuje měřit vstupy, spotřebu, počet aktivních crafterů a nabídku jednotlivých kvalit v čase. Nelze předpokládat, že samotný crafting automaticky vyřeší všechny tři problémy.

## 7. Postup vývoje (pracovní roadmapa)

| Fáze | Obsah | Otázka, kterou ověřuje |
| --- | --- | --- |
| Prototyp 0.1 | Postava, jeden nepřítel, auto combat, HP, damage, smrt, XP, level, log. | Baví sledovat souboj a postup? |
| Prototyp 0.2 | Drop, inventář, equipment, několik itemů, rarity a stat rolls. | Vzbuzuje vzácný loot radost? |
| Prototyp 0.3 | Více nepřátel, výběr cíle, drop tables, gold, banka, 5% ztráta při smrti. | Je opakované farmení zajímavé? |
| Alpha 0.4 | První malý svět, návrat do starších oblastí; orientačně 3 lokace, 10–15 nepřátel, 1–3 bossové, 30–50 itemů. | Funguje základní svět jako celek? |
| Alpha 0.5 | Offline postup a report, malá výhoda aktivní hry. | Funguje idle vrstva férově a srozumitelně? |
| Alpha 0.6 | Datový návrh surovin, receptů, kvality, unikátních item instancí a obchodovatelnosti; první omezený crafting prototype. | Podporují data hlavní crafting smyčku? |
| Online beta | Účty a serverové ukládání; následně market, obchod a bezpečné zakázky. | Lze udržet spolehlivou ekonomiku a vlastnictví? |

Čísla obsahu v Alpha 0.4 jsou původní orientační příklad, nikoli produkční závazek. **Crafting je hlavní pilíř vize**: jeho datový model patří do raného návrhu a hratelný prototyp má přijít dříve, než bude obsah ve velkém rozšířen. Plná hráčská ekonomika a kontrakty vyžadují serverové účty a transakční ukládání.

**Stav k 27. 9. 2026:** Prototype 0.3 je implementovaný jako lokální testovací verze. Obsahuje mapu se dvěma lokacemi, výběr konkrétního nepřítele k farmení, sedm slotů vybavení, gold, dvě sady itemů (chitin, andělská) s vlastními asset ikonami, náhodné staty, tři rarity, inventář, stackování materiálů a lokální uložení. Drop rate a rozdělení rarit jsou záměrně zrychlené pro krátký test a nepředstavují finální balance. Banka a 5% ztráta zlata při smrti z roadmapy Prototype 0.3 zatím nejsou implementované.

## 8. Otevřená rozhodnutí v pořadí dopadu

1. Přesná pravidla výběru nepřítele, respawnu a automatického pokračování po smrti.
2. Offline simulace: časový limit, death penalty, loot a rozdíly proti aktivní hře.
3. Přístup k bance a riziko neseného zlata; aby 5% ztráta měla smysl.
4. Struktura základních itemů, stat rolls, prefixů/suffixů a kompatibilita receptů s typy vybavení.
5. Kde a jak recepty vznikají, kdo je může naučit, omezení profesí a případná crafting mastery.
6. Požadavky na materiály, vážení smíšených kvalit, šance na výslednou kvalitu, oddělená šance na úspěch a přesná ztráta při selhání.
7. Jak se porovnává síla crafted gearu s nejlepším loot gearem a zda existují exkluzivní kombinace.
8. Vlastnictví, obchodovatelnost, veřejné sériové číslo a historie konkrétní item instance.
9. Pravidla kontraktů: kdo financuje pokusy, jak se platí, co se vrací při neúspěchu a jak se vynucuje deadline.
10. Market, P2P trade, specializace, ekonomické poplatky a dlouhodobé sinks.

## 9. Co je potvrzený záměr a co zatím není

**Zachovat v návrhu:** automatické idle RPG; výběr konkrétního nepřítele; hodnotný vzácný loot; malé smysluplné staty; aktivní i offline hra; 5% riziko neseného zlata; hráčská ekonomika; předmět vytvořený z base + volitelných naučených prefixů/suffixů; permanentní znalost receptů; materiály několika kvalit ovlivňující kvalitu výrobku; risk selhání; unikátní identita crafted kusů; společenské zakázky s ochranou obou stran.

**Nepovažovat za schválené parametry:** 20–30% univerzální úspěšnost, konkrétní procenta Magic Find, rarity tiers a jejich drop rates, pevný termín 14 dní, čísla obsahu v roadmapě, přesný vzorec kvality, kompletní ztráta materiálů, druhy profesí, sazby kontraktů nebo to, že crafted gear musí být vždy silnější než loot.

---

**Pravidlo pro další úpravy:** Nový nápad nejprve zapsat jako pracovní návrh nebo otevřenou otázku. Do „potvrzeného záměru“ jej přesunout až po výslovném rozhodnutí autora. U změny základního pravidla uvést i to, které starší tvrzení nahrazuje.
