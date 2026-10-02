# Prototype 0.7 — World & Location Expansion

## Stav dokumentu

**Milestone:** Prototype 0.7
**Pracovní název:** World & Location Expansion
**Výchozí verze:** Prototype 0.6 — Stat & Affix Foundation
**Stav:** implementováno; Admin Content Studio zůstává odložené

Admin Content Studio není součástí této verze. Je odloženo do backlogu nebo některého z pozdějších prototypů.

---

## 1. Hlavní testovací otázka

**Je svět rozdělený na lokace, oblasti a konkrétní nepřátele dostatečně přehledný a obsahově zajímavý, aby hráč vědomě měnil farmený cíl podle hledané kořisti?**

Prototype 0.7 se soustředí na obsah a prezentaci světa. Neřeší finální balance dropů ani komplexní crafting.

## Dodáno v 0.7

- Oblasti uvnitř každé hratelné lokace: lokace → oblast → konkrétní nepřítel.
- Nepřerušované cílené farmení: vybraný nepřítel se vrací na stejný spot, nikdy se náhodně nemění.
- Odpadkové hory jsou hratelné se třemi cíli a cílenými dropy sdílených materiálů.
- Import nových obecných materiálů bez duplikace assetů, které už hra obsahuje.
- Časové mantinely pro sílu nepřátel a hledání dalšího výskytu v `balance-data.js`; podrobnosti jsou v `docs/balance-framework.md`.
- Umírněné pixelové zásahy v boji a krátké třpytění vzácnějšího dropu v oznámení.

---

## 2. Potvrzený výchozí stav

Aktuální `main` obsahuje:

- Prototype 0.6,
- hratelné lokace Okraj starého lesa, Pustina ticha, Magma a Elektrika,
- Odpadkové hory ve stavu `preview`,
- mapu světa a detail lokace,
- výběr konkrétního nepřítele,
- boj běžící na pozadí při procházení ostatních stránek,
- inventář vybavení, materiálů a svitků,
- Obchodníka, Banku, Bestiář a Sbírku,
- šest kvalit předmětů a materiálů,
- připravený statový a affixový základ,
- lokální i Supabase cloud save,
- vývojové katalogy a automatické testy.

Affixy v 0.6 zatím nepadají v normální hře. Prototype 0.7 World & Location Expansion jejich živé dropy nezapíná automaticky.

---

## 3. Rozsah Prototype 0.7

### 3.1 Hierarchie světa

Rozšířit současný model:

```text
World Map
└── Location
    └── Area
        └── Enemy
```

- **Location** je hlavní bod na mapě světa, například Magma.
- **Area** je konkrétní část uvnitř lokace.
- **Enemy** je konkrétní farmený cíl uvnitř oblasti.

Příklad plánovaných oblastí lokace Magma:

- Kostel žhavení — pracovní název, finální anglický název bude potvrzen samostatně,
- Propast — pracovní název,
- Ohnivá hora — pracovní název,
- další oblasti budou doplněny pouze z odsouhlasených podkladů.

### 3.2 Migrace současného obsahu

Současné lokace a nepřátelé se nesmí při zavedení oblastí ztratit.

Dokud nebudou pro lokaci navrženy její skutečné oblasti:

- stávající nepřátelé mohou být dočasně umístěni do jedné výchozí oblasti,
- stabilní ID lokací a nepřátel musí zůstat zachována,
- starý save musí být automaticky převeden na nové schéma,
- uložený aktivní nepřítel musí po migraci zůstat vybraný, pokud stále existuje.

Dočasná výchozí oblast není nový příběhový obsah a nemá dostat vymyšlený lore název.

### 3.3 Nový tok výběru cíle

Požadovaný tok:

```text
Mapa světa
→ detail lokace
→ vstup do lokace
→ výběr oblasti
→ výběr nepřítele
→ zahájení nebo změna farmení
```

Pravidla:

- pouhé prohlížení lokace nebo oblasti nesmí měnit probíhající boj,
- změna cíle nastane až po vědomém výběru nepřítele,
- boj musí dále běžet na pozadí při procházení mapy, oblastí, inventáře i ostatních stránek,
- návrat na mapu nesmí resetovat statistiky výpravy,
- UI musí vždy ukazovat lokaci, oblast a aktuálně farmeného nepřítele.

### 3.4 Detail lokace

Detail hlavní lokace má obsahovat:

- background lokace,
- název,
- doporučený level,
- stav dostupnosti,
- seznam oblastí,
- souhrnný přehled nepřátel,
- souhrnný přehled potenciální kořisti,
- tlačítko pro vstup nebo pokračování.

Finální drop procenta nejsou v této fázi podmínkou. UI nesmí zobrazovat vymyšlené nebo nepotvrzené šance.

### 3.5 Detail oblasti

Každá oblast má datově podporovat:

- stabilní `areaId`,
- anglický hráčský název,
- příslušnou lokaci,
- doporučený level nebo jiný budoucí požadavek,
- krátký popis,
- vlastní background nebo zděděný background lokace,
- seznam nepřátel,
- seznam získatelných itemů a materiálů,
- stav `available`, `preview` nebo `comingSoon`,
- pořadí zobrazení.

Následující pravidla zatím nejsou určena a nesmí být doplněna odhadem:

- postupné odemykání oblastí,
- poplatek za vstup nebo teleport,
- vlastní level oblasti,
- vlastní vylepšení oblasti,
- hunting nebo hledání oblasti.

### 3.6 Dokončení Odpadkových hor

Cílem je převést Odpadkové hory ze stavu `preview` na plně hratelnou lokaci, pokud dodaná složka obsahuje potřebný obsah.

V repozitáři již jsou:

- background lokace,
- Odpadkový duch,
- Sběračský krtek,
- Vězeň v kleci.

Chybějící obsah musí být doplněn z dodaných assetů a schválených názvů:

- vybavení,
- materiály,
- jejich vazba na konkrétní nepřátele,
- případné další oblasti a nepřátelé.

Pokud asset nebo pravidlo chybí, lokace se nesmí označit jako kompletní pouze pomocí skrytého placeholderu.

### 3.7 Zapojení nových globálních materiálů

Nově dodané obecné craftingové materiály budou:

- přidány do `material-data.js` se stabilními ID,
- zobrazeny v `material-catalog.html`,
- dostupné ve všech podporovaných kvalitách kromě zakázaných kombinací současného quality systému,
- přiřazeny zdrojům pouze tam, kde je vazba potvrzena,
- připraveny pro budoucí crafting bez implementace samotných receptů.

Quality zůstává vlastností instance nebo stacku. Název assetu nesmí obsahovat kvalitu materiálu.

### 3.8 Obsah existujících lokací

Magma, Elektrika a Pustina ticha mají být převedeny do nového area modelu bez ztráty současného obsahu.

Nové oblasti, nepřátelé, itemy a materiály se přidají pouze tehdy, když jsou:

- obsažené v dodané složce,
- jednoznačně pojmenované,
- nebo následně výslovně potvrzené autorem hry.

---

## 4. Navržený datový model

Přesná implementace se přizpůsobí současnému `world-data.js`. Minimální odpovědnost oblasti:

```js
{
  id: "magma_default",
  locationId: "magma",
  displayName: "...",
  description: "...",
  status: "available",
  recommendedLevel: 1,
  background: null,
  inheritLocationBackground: true,
  enemyIds: [],
  order: 1
}
```

`enemy.locationId` může během migrace zůstat kvůli zpětné kompatibilitě, ale nový zdroj pravdy musí jednoznačně určit také `areaId`.

Je zakázáno duplikovat celé definice nepřátel uvnitř oblastí. Oblast má odkazovat na stabilní enemy ID.

---

## 5. Save a zpětná kompatibilita

- Zachovat současný save key `idle-rpg-prototype-v02`.
- Zvýšit interní verzi save pouze tehdy, pokud se skutečně mění uložené schéma.
- Starému savu bez `activeAreaId` odvodit oblast z uloženého nepřítele.
- Neztratit level, XP, gold, banku, inventář, materiály, svitky, vybavení, statistiky, bestiář ani sbírku.
- Cloud save a lokální save musí používat stejnou migrační cestu.
- Chybějící nebo odstraněná oblast nesmí způsobit pád aplikace; hra zvolí bezpečný existující fallback bez spuštění nového boje.

---

## 6. Co do Prototype 0.7 nepatří

- Admin Content Studio,
- databázová správa itemů a affixů,
- finální balance drop šancí,
- zapnutí všech affixů do živých dropů,
- crafting recepty,
- forging a smelting,
- reset a master reset systém,
- crafting a upgrade křídel,
- poplatky za teleport,
- location upgrades,
- market mezi hráči,
- offline progression.

Tyto systémy mohou být připraveny datově pouze tehdy, když to nezavádí jejich neúplnou hráčskou verzi.

---

## 7. UI a UX požadavky

- Zachovat současný retro RPG vizuální systém, typografii, rámy a quality vrstvy.
- Nevytvářet nový paralelní styl karet.
- Na desktopu využít prostor mapy a detailu lokace bez zbytečných modálů.
- Na mobilu musí být lokace → oblast → nepřítel čitelné bez horizontálního přetékání celé stránky.
- Dlouhé seznamy oblastí a nepřátel mohou scrollovat uvnitř hlavního obsahu.
- Aktivní boj musí zůstat viditelný v sidebarovém widgetu nebo mobilním stavovém pruhu.
- Každý stav musí být rozlišitelný textem, ne pouze barvou.
- Detail kořisti musí používat skutečná data a existující quality komponenty.

---

## 8. Testovací scénáře

### 8.1 Migrace

1. Načíst save z Prototype 0.6.
2. Ověřit odvození aktivní oblasti podle uloženého nepřítele.
3. Ověřit zachování celé postavy a ekonomiky.
4. Uložit a znovu načíst nový save.

### 8.2 Navigace světa

1. Otevřít mapu během probíhajícího boje.
2. Prohlížet jinou lokaci a oblast.
3. Ověřit, že boj pokračuje proti původnímu cíli.
4. Vybrat nového nepřítele.
5. Ověřit, že se aktualizuje location, area, enemy a bojový widget.

### 8.3 Obsah

1. Otevřít každou dostupnou lokaci.
2. Otevřít každou dostupnou oblast.
3. Ověřit všechny enemy obrázky, názvy a typy.
4. Ověřit, že každá zobrazená kořist existuje v katalogu.
5. Ověřit, že materiálové dropy stackují podle ID a quality.
6. Ověřit Bestiář a Sbírku po migraci na area model.

### 8.4 Responzivita

- desktop,
- tablet,
- telefon,
- mapa a detail lokace,
- seznam oblastí,
- výběr nepřítele,
- dlouhé názvy a prázdné stavy.

---

## 9. Akceptační kritéria

Prototype 0.7 je hotový, když:

1. `world-data.js` podporuje location → area → enemy bez duplikace nepřátel.
2. Všechny současné hratelné lokace fungují po migraci stejně nebo lépe než v 0.6.
3. Starý save se načte bez ztráty postupu.
4. Hráč může na mapě přejít z lokace do oblasti a vybrat konkrétního nepřítele.
5. Prohlížení světa nezastavuje ani nemění aktivní boj.
6. UI vždy ukazuje aktivní lokaci, oblast a nepřítele.
7. Nově dodané materiály jsou v katalogu a používají současný quality systém.
8. Odpadkové hory jsou hratelné pouze tehdy, pokud mají skutečnou kořist a kompletní data.
9. Bestiář, Sbírka, Obchodník, Banka, inventář a boj zůstávají funkční.
10. Node testy a UI testy procházejí.
11. README a dokumentace odpovídají skutečně implementované verzi.
12. Nejsou zavedené neodsouhlasené názvy, drop šance ani pravidla odemykání.

---

## 10. Implementační pořadí

### Fáze A — Audit assetů

- převzít dodanou složku,
- vytvořit manifest souborů,
- ověřit názvy, rozměry, průhlednost a duplicity,
- oddělit location, area, enemy, item a material assety,
- nic nezařazovat pouze podle nejasného obrázku bez potvrzené vazby.

### Fáze B — Area datový model

- rozšířit `world-data.js`,
- migrovat existující lokace a nepřátele,
- doplnit validace referencí,
- doplnit save migraci.

### Fáze C — Navigace a prezentace

- detail lokace,
- výběr oblasti,
- detail oblasti,
- výběr nepřítele,
- combat widget s oblastí.

### Fáze D — Obsah

- nové materiály,
- nové itemy a nepřátelé z dodané složky,
- dokončení Odpadkových hor podle dostupných dat,
- převod Magmy, Elektriky a Pustiny ticha do area struktury.

### Fáze E — Testy a dokumentace

- datové validace,
- regresní testy,
- save migrace,
- desktop/tablet/mobile kontrola,
- README a finální handoff.

---

## 11. Podklady potřebné před plnou implementací

- složka nových assetů,
- potvrzené anglické názvy souborů nebo soupis zamýšleného obsahu,
- informace, ke které lokaci nebo oblasti každý lokační asset patří,
- případné nové backgroundy oblastí,
- potvrzení, zda nové oblasti mají být všechny dostupné, nebo se budou odemykat později.

Pokud poslední rozhodnutí zatím není hotové, Prototype 0.7 může oblasti zobrazovat jako dostupné bez zavedení progresního odemykání. Toto však musí autor hry před implementací potvrdit.
