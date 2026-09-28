# Prototype 0.3 — mapa, výběr nepřítele a nové sady předmětů

## Cíl testu

Zjistit, zda výběr konkrétní lokace a konkrétního nepřítele k farmení (místo jediného vždy stejného soupeře) dává hráči pocit postupu a volby, a zda dvě odlišné sady dropů (chitin, andělská) rozlišitelně mění hodnotu kořisti.

## Co sledovat

1. Je přechod Mapa → lokace → nepřítel → farmení srozumitelný bez vysvětlování?
2. Je přepínání cíle bezpečné (žádné zdvojené souboje, žádné zamrznutí HP baru)?
3. Působí nenápadné oznámení o dropu (toast) dostatečně viditelně, i když souboj neruší?
4. Je zvětšený obrázek v detailu předmětu čitelný a nepůsobí rušivě na mobilu?
5. Je glow vzácných předmětů patrný, ale nepřehání to (nebliká, nepřetéká z rámečku)?
6. Chybí hráči informace o nepřátelích v Pustině ticha (jména, lore), nebo dočasná čísla nevadí?

## Pracovní nastavení

- 2 lokace: Okraj starého lesa (Goblin), Pustina ticha (6 nepřátel, dočasně pojmenovaných „Nepřítel 1"–„Nepřítel 6"),
- staty a drop šance jednotlivých nepřátel v `world-data.js` — životy 40–165, poškození, obrana 0–7, XP 14–60, gold 3–16, drop chance 40–50 %,
- 7 slotů vybavení (přidány kalhoty a rozšířena andělská sada),
- generický mechanismus stackování materiálů v inventáři (zatím bez konkrétního materiálového assetu),
- neblokující drop (auto-save + toast) místo modálu vyžadujícího potvrzení.

Tato čísla slouží rychlému uživatelskému testu. Nejsou návrhem finální ekonomiky ani drop rates.

## Známé hranice

- Enemy jména v Pustině ticha a jejich staty/drop tabulky jsou dočasné zástupné hodnoty.
- Mapa nemá vlastní ilustrace lokací ani nepřátel z Okraje starého lesa — jde o čistě systémový UI panel.
- Materiálové stackování je funkční, ale zatím nemá žádný konkrétní materiálový item, který by ho využíval.
- Banka a 5% ztráta neseného zlata při smrti (z roadmapy) nejsou implementované — gold se zatím jen sbírá a nikdy neztrácí.
- Assety Pustiny ticha a chitinové sady jsou proporcionálně zmenšené LANCZOS resamplingem, ne s pixel-perfect nearest-neighbor škálováním — u vysoce detailní/malované grafiky to dává ostřejší výsledek, ale je to interpretační rozhodnutí, ne jistota shody s případným budoucím pixel-art směrem.

## Přechod k Alpha 0.4

Podle roadmapy má další verze přidat první malý svět s návratem do starších oblastí (orientačně 3 lokace, 10–15 nepřátel, 1–3 bossové, 30–50 itemů). Nejdřív je potřeba vyhodnotit pocit z výběru cíle a dvou lokací v Prototype 0.3.
