# Mapa vizuálního jazyka předmětů a inventáře

Tento dokument převádí společné principy z dodaných MMORPG a ARPG referencí do vlastního vizuálního systému hry. Reference slouží jako nálada a funkční inspirace; nekopírujeme konkrétní rámy, ikony, modely, názvy ani efekty.

## 1. Hlavní designová myšlenka

Běžné rozhraní je strohé, technické a téměř černobílé. Barva, ornament a světlo se objevují jako odměna. Čím je předmět vzácnější, tím více dokáže dočasně „porušit“ základní monochromatický systém.

Vzácnost proto není jen textový štítek. Mění současně:

- barvu názvu a hlavních atributů,
- kvalitu a materiál rámu,
- světelný efekt ikony,
- množství vizuálních vrstev v tooltipu,
- podobu vybavení a aury na postavě,
- intenzitu okamžiku při získání předmětu.

Výsledek má působit jako temná databáze, která při nalezení výjimečné věci odhalí magický artefakt.

## 2. Co mají reference společné

### Temnota jako jeviště

Pozadí je téměř černé nebo velmi tmavé. Neplní dekorativní funkci; vytváří prostor, ve kterém vyniknou ikony, text a světelné efekty. Světlo přichází z předmětů, postavy a rarity, ne z obecných UI panelů.

### Vysoká informační hustota

Tooltipy obsahují mnoho statistik na malé ploše. Hustota není chyba, ale součást fantasy: předmět působí mocně také tím, kolik vlastností a pravidel nese. Čitelnost vzniká jasným pořadím, odsazením, dělicími linkami a sémantickými barvami.

### Předmět jako artefakt

Nejvzácnější předmět nepůsobí jako běžný řádek v databázi. Má vlastní hlavičku, barevnou atmosféru, ikonu, rám, případně krátký příběhový text. Tooltip funguje skoro jako malá sběratelská karta.

### Barevná syntaxe

Barva má konkrétní význam. Hráč se časem naučí číst tooltip pohledem, ještě než přečte všechna čísla.

- bílá: základní údaje a běžné hodnoty,
- šedá: sekundární metadata a požadavky,
- tyrkysová nebo modrá: magické vlastnosti a systémové bonusy,
- zelená: aktivní set, splněná podmínka nebo potvrzený bonus,
- zlatá: unikátní vlastnost, set nebo mimořádná kvalita,
- fialová: epická, mythic nebo socketová vrstva,
- červená: nesplněný požadavek, poškození, corruption nebo riziko.

Barva se nepoužívá pro celé běžné rozhraní. Je soustředěná do názvů, čísel, jemných linií a efektů.

### Rám jako informace

Rám není pouze dekorace. Jeho barva, tloušťka a materiál sdělují kvalitu předmětu. Běžný předmět má jednu tenkou šedou linku. Vzácný může dostat barevný lem. Epický nebo setový předmět přidává druhou vnitřní linku, jemnou texturu nebo lokální záři.

### Ručně působící nedokonalost

Reference nejsou sterilní SaaS rozhraní. Obsahují patinu, kouř, jemný šum, kovové hrany, nepravidelné světlo a lehce opotřebovaný povrch. Naše verze má tento dojem používat střídmě, aby zůstal zachovaný současný technický a monospace základ.

## 3. Rozbor jednotlivých typů obrazovek

### Setový tooltip

Setový tooltip používá úzký tmavý panel a několik výrazných horizontálních hlaviček. Název předmětu je dominantní, následuje seznam částí setu, setový bonus a speciální podmínky. Informace jsou seskupené do bloků a oddělené linkou.

Co převzít:

- jasné členění `název → typ → základní statistiky → modifikátory → setový bonus`,
- zelenou jako potvrzení kompletního nebo aktivního setu,
- samostatný blok pro výjimečnou vlastnost,
- kompaktní šířku a velmi malá vertikální odsazení.

Co nepřevzít doslova:

- široké plné gradientové pruhy na každé sekci,
- centrování dlouhých technických vět,
- příliš mnoho stejně výrazných barev najednou.

### Inventář s náhledem postavy

Postava je hlavní vizuální objekt. Sloty vybavení ji obklopují a inventární mřížka stojí vedle ní. Hráč současně vidí vzhled postavy, používané předměty i volnou kapacitu.

Co převzít:

- velký náhled postavy jako střed obrazovky vybavení,
- sloty rozmístěné podle částí těla nebo ve srozumitelných sloupcích kolem postavy,
- pravidelnou čtvercovou mřížku inventáře,
- barevné ohraničení pouze u vzácných a vybraných předmětů,
- malé počty kusů a stav kapacity přímo v mřížce.

Naše verze nemá kopírovat fantasy ornament celé obrazovky. Vnější konstrukce zůstane hranatá a monochromatická; magická vrstva patří postavě a předmětům.

### Komplexní ARPG tooltip

Tooltip používá téměř černé průsvitné pozadí, tenký kovový nebo měděný rám, výraznou serifovou hlavičku a barevně odlišené modifikátory. Textura je tmavá a špinavá, ale obsah zůstává ostrý.

Co převzít:

- tooltip jako pevně strukturovaný datový objekt,
- samostatné vizuální bloky pro implicitní, explicitní a speciální modifikátory,
- tenké dělicí linky mezi skupinami statistik,
- možnost jedné krátké kurzívní věty s příběhem předmětu,
- barevné zvýraznění pouze klíčových částí řádku.

Co upravit:

- základní UI nadále používá monospace font,
- výrazná serifová typografie může být vyhrazena pouze názvu unikátního předmětu nebo flavor textu,
- dlouhé statistiky budou zarovnané vlevo, ne centrované.

### Mythic nebo unikátní karta

Nejvyšší rarita mění celý povrch tooltipu. Panel dostává tmavě fialovou atmosféru, vlastní ikonu, výrazný název a několik oddělených vrstev bonusů. Přesto zůstává čitelný díky horizontálním pravidlům a konzistentnímu rytmu.

Co převzít:

- silnější vizuální identitu pouze pro nejvyšší rarity,
- malou samostatnou ilustraci předmětu v pravém horním rohu,
- jednu hlavní „hero“ statistiku s větší velikostí,
- flavor text a stav předmětu ve spodní části,
- pocit, že tooltip je sběratelský artefakt, ne běžný dialog.

## 4. Vlastní vizuální gramatika hry

### Dvě vrstvy rozhraní

1. **Systémová vrstva** — černobílá, hranatá, monospace, tenké linky, hustá data.
2. **Artefaktová vrstva** — barevná, světelná a lehce ornamentální; aktivuje se u dropu, tooltipu, vybavení a náhledu postavy.

Tyto vrstvy se nesmějí slít. Kdyby všechny panely dostaly barevné textury a záři, vzácné předměty by přestaly být vzácné.

### Doporučená paleta

| Význam | Doporučený charakter |
| --- | --- |
| Základní pozadí | téměř černá s velmi jemným studeným odstínem |
| Panel | uhlově černá, neprůhledná nebo jen lehce průsvitná |
| Linka | tmavá ocelová šedá |
| Primární text | lomená bílá, ne čistá digitální bílá |
| Sekundární text | chladná střední šedá |
| Vzácný | tyrkysová přecházející do elektrické modré |
| Epický | emeraldová přes modrou do fialové |
| Setový | jedovatě zelená nebo vlastní barva setu |
| Unikátní | tlumené zlato, měď nebo jantar |
| Mythic | sytá fialová s bílým světelným jádrem |
| Nebezpečí | tmavá karmínová až červená |

### Typografie

- systém, navigace, běžné statistiky a inventář: monospace,
- název unikátního předmětu: volitelně úzký display serif nebo výraznější kapitálky,
- čísla: tabulkové číslice, aby se hodnoty při změně nehýbaly,
- popisky: malé verzálky s vyšším prostrkáním,
- dlouhé technické řádky: zarovnat vlevo,
- krátký flavor text: může být centrovaný nebo kurzívní.

### Povrchy a textury

- běžné panely zůstávají čisté a ploché,
- textura se používá jen uvnitř tooltipu vyšší rarity,
- preferovat jemný šum, kouř, kovovou patinu a nepravidelnou vinětu,
- textura nesmí snižovat kontrast textu,
- nepoužívat skleněné karty, velké měkké stíny ani moderní pastelové plochy.

### Ikony

- předmět má být čitelný jako silueta i při malé velikosti,
- ikona leží na tmavém čtverci bez zaoblení,
- běžná ikona nemá barevný rámeček,
- vyšší rarita přidává tenký barevný lem, vnitřní světlo a maximálně několik částic,
- ikona nikdy nesmí být nahrazena pouze emoji ve finální grafické vrstvě.

## 5. Anatomie budoucího tooltipu

Pořadí musí být stabilní napříč všemi předměty:

1. název předmětu a upgrade,
2. rarita, typ a slot,
3. ikona nebo malý náhled,
4. hlavní výkonová hodnota,
5. základní statistiky,
6. implicitní modifikátor,
7. náhodné nebo explicitní modifikátory,
8. setový nebo unikátní efekt,
9. požadavky a omezení,
10. flavor text a stav předmětu.

Prázdný blok se nezobrazuje. Běžný předmět proto zůstane velmi krátký, zatímco unikátní artefakt může mít dlouhý tooltip.

## 6. Postupné zavádění do prototypu

### Fáze 1 — vizuální tokeny a inventární mřížka

- sjednotit význam barev rarity,
- zavést čtvercové sloty s tenkými linkami,
- barevný lem zobrazovat jen u vyšších rarit,
- zachovat současné černobílé rozhraní kolem inventáře.

### Fáze 2 — strukturovaný tooltip

- nahradit jednoduchý text předmětu skutečným tooltipem,
- rozdělit statistiky do stabilních sekcí,
- přidat sémantické barvy čísel a jemné dělicí linky,
- připravit varianty common, rare, epic, set a unique.

### Fáze 3 — obrazovka postavy

- zvětšit náhled postavy,
- umístit vybavení kolem postavy,
- umožnit okamžitě vidět změnu siluety a barvy po vybavení,
- oddělit správu vybavení od hlavního soubojového pohledu, pokud začne být obrazovka přeplněná.

### Fáze 4 — artefaktové efekty

- lokální záře vybavených slotů,
- ostré oldschool paprsky a částice,
- setová aura a propojení více kusů,
- speciální okamžik při epickém nebo unikátním dropu.

### Fáze 5 — materiály nejvyšších rarit

- vlastní jemná textura tooltipu,
- unikátní rám a flavor text,
- tematické barvy setů,
- odlišný zvuk a krátká přechodová animace.

## 7. Kontrolní pravidla

Při každé další úpravě ověřit:

1. Zůstává nejméně 90 % běžného rozhraní monochromatických?
2. Má každá použitá barva konkrétní význam?
3. Je rarita poznatelná i bez přečtení názvu?
4. Je předmět čitelný i bez světelného efektu?
5. Zůstává text čitelný přes případnou texturu?
6. Je nejvyšší vizuální intenzita vyhrazena skutečně výjimečným předmětům?
7. Funguje komponenta také bez animace a na malém displeji?
8. Vypadá prvek jako součást temné hry, ne jako moderní dashboard nebo e-shop?

## 8. Čemu se vyhnout

- přímému kopírování rámů, ikon nebo textur z referenčních her,
- barevnému rámečku kolem každého předmětu,
- permanentnímu duhovému gradientu,
- velkým rozmazaným stínům a glassmorphism efektům,
- příliš hladkým a sterilním animacím,
- několika konkurenčním písmům v jednom tooltipu,
- centrování dlouhých statistik,
- zmenšení textu pod čitelnou hranici jen kvůli informační hustotě,
- tomu, aby efekt překryl samotnou postavu nebo předmět.
