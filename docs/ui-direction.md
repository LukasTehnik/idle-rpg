# Vizuální směr UI

Tento dokument drží jednotný vizuální jazyk prototypu při dalších úpravách.

## Základ

- Rozhraní působí jako technický systém, inventární databáze nebo herní terminál.
- Text používá monospace písmo ze systémového font stacku; prototyp nestahuje externí font.
- Panely jsou hranaté, bez stínů a bez dekorativního zaoblení.
- Hierarchii tvoří tenké černé a šedé linky, kontrast textu a hustota dat.
- Přibližně 90 % rozhraní zůstává v odstínech černé, bílé a šedé.

## Barva a rarita

Barva je odměna, ne dekorace. Běžné herní prvky proto zůstávají monochromatické.

- **Běžné předměty:** bílá a šedá.
- **Vzácné předměty:** tyrkysovo-modrý gradient.
- **Epické předměty:** emeraldovo-modro-fialový gradient.
- **Speciální a vymaxované sety:** mohou dostat vlastní zářivý gradient, ale musí zůstat výjimečné.

Gradient se může objevit v názvu, tenké horní lince nebo ohraničení předmětu. Velké barevné plochy se nepoužívají, aby se neztratila informační hierarchie.

## Vzácné vybavení na postavě

Vzácnost se po nasazení nesmí projevit jen barevným názvem v inventáři. Musí být viditelná také přímo na náhledu postavy. Referenční náladou jsou výrazné upgrady a „Excellent“ sety ze starších MMORPG, zejména MU Online: silná magická záře, ostré energetické tahy a přehnaný pocit síly. Nejde ale o kopírování konkrétních modelů nebo efektů.

### Vizuální charakter

- Záře má mít téměř bílé, přepálené jádro a barevný okraj podle rarity nebo setu.
- Místo jednoho hladkého rozostřeného neonu se skládá z několika vrstev: světelný lem předmětu, lokální aura, ostré paprsky nebo střepy a několik částic.
- Tvary mají být nepravidelné, špičaté a lehce chaotické. Mohou připomínat elektřinu, magické plameny, krystaly nebo energetické čepele.
- Animace má působit oldschoolově: krátké pulzy, lehce stupňované blikání a nepravidelný rytmus. Nemá být dokonale plynulá, sterilní ani „mobilně prémiová“.
- Efekt může být intenzivní, ale základní silueta postavy a jednotlivé kusy výbavy musí zůstat čitelné.

### Vazba efektu na slot

- **Zbraň:** světelný lem čepele nebo hlavice, krátká stopa energie a občasný výboj.
- **Zbroj:** záře hran pancíře, světelné praskliny nebo špičaté paprsky vystupující z ramen a trupu.
- **Talisman:** menší orbitující symbol, částice nebo pulz u středu těla.
- **Kompletní set:** efekty jednotlivých kusů se propojí do společné aury. Výjimečný set může přidat křídla, znak za postavou nebo kruh energie u nohou.

### Stupňování síly

| Úroveň | Projev v náhledu postavy |
| --- | --- |
| Běžný předmět | Bez aury; pouze materiál a základní kontrast. |
| Vzácný předmět | Lokální tyrkysovo-modrý lem na vybaveném slotu a občasná malá jiskra. |
| Epický předmět | Silnější emeraldovo-modro-fialová záře, pulzování a několik ostrých energetických tahů. |
| Speciální nebo setový předmět | Vlastní barevná identita a efekt navázaný na téma setu. |
| Vymaxovaný set | Nejsilnější společná aura, přepálené světlé jádro, výrazné paprsky a unikátní prvek za postavou nebo u nohou. |

Upgrade předmětu zesiluje stejný efekt postupně; nemění při každém stupni celý vizuální jazyk. Milníky mohou být například `+5`, `+10` a maximum. Maximum musí být na první pohled rozeznatelné i bez otevření detailu předmětu.

### Chování a omezení

- Efekt se objeví okamžitě po vybavení a zmizí po sundání předmětu.
- Při výměně za silnější kus může proběhnout krátký jednorázový záblesk; trvalá aura potom pokračuje v klidnější smyčce.
- V inventáři se používá jen malá ochutnávka efektu. Plná intenzita patří náhledu postavy, odměnové obrazovce a mimořádnému dropu.
- Více efektů se skládá podle slotů, ale systém musí hlídat společný limit jasu a částic, aby postava nezmizela v bílé ploše.
- Animace musí respektovat `prefers-reduced-motion`; v omezeném režimu zůstane statický světelný lem bez blikání a částic.
- Na slabších zařízeních lze snížit počet částic a frekvenci pulzů, ne však odstranit barevnou identitu rarity.

### Čemu se vyhnout

- dokonale hladkému pastelovému gradientu přes celou postavu,
- měkkému modernímu neonovému „blobu“ bez ostrých detailů,
- konstantní duhové animaci bez vztahu k raritě nebo setu,
- částicím rozmístěným náhodně po celé kartě,
- efektu, který překryje tvar vybavení nebo znemožní přečíst siluetu postavy.

## Hustota

- Upřednostnit více relevantních dat na obrazovce před velkými dekorativními plochami.
- Používat malé mezery, kompaktní tlačítka a krátké popisky.
- Na desktopu držet hlavní souboj, statistiky a inventář co nejvíce nad ohybem stránky.
- Na mobilu zachovat čitelnost a dotykové cíle; hustotu nezvyšovat na úkor ovladatelnosti.

## Kontrolní seznam pro nové prvky

1. Je prvek hranatý a bez stínu?
2. Používá barvu pouze tehdy, když sděluje raritu, stav nebo odměnu?
3. Je informace čitelná i bez barvy?
4. Nezabírá padding více místa, než vyžaduje čitelnost?
5. Zapadá typografie a ohraničení do systémového vzhledu?
