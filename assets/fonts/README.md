# Fonty

Celé UI používá jediný font **Jersey 10** (SIL OFL 1.1). Je uložený lokálně (žádný Google Fonts CDN) jako `woff2`, rozdělený na `latin` a `latin-ext` (česká diakritika je v `latin-ext`, prohlížeč stáhne jen potřebné části přes `unicode-range`).

| Soubor | Obsah |
| --- | --- |
| `jersey-10-latin-400-normal.woff2` | základní latinka, číslice |
| `jersey-10-latin-ext-400-normal.woff2` | rozšířená latinka (ěščřžýáíéúůďťň …) |
| `OFL-Jersey10.txt` | licence SIL Open Font License 1.1 |

Zdroj: balíček `@fontsource/jersey-10` 5.3.0 (původně https://github.com/scfried/soft-type-jersey, © The Soft Type Project Authors).

## Poznámky
- Existuje jen řez 400. Bold se nesyntetizuje (`font-synthesis: none`), důraz dělá barva.
- V `@font-face` je `size-adjust: 125%`, protože Jersey 10 má malý x-height; velikosti písma v `styles.css` jsou na to navržené.
- Původně zvolený Pixelify Sans byl zamítnut: číslice `7` vypadala jako `1`, `5` jako `S` a `Z` jako `2`.

## Inter (světlé téma, od 0.9)

Světlé téma (`theme-light.css`) používá **Inter** (SIL OFL 1.1), variabilní řez 100–900, lokálně jako `woff2` (`latin` + `latin-ext`, česká diakritika je v `latin-ext`). Licence: `OFL-Inter.txt`, zdroj: balíček `@fontsource-variable/inter` 5.3.0. Jersey 10 zůstává v repozitáři pro původní tmavé téma.
