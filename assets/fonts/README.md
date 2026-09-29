# Fonty

Fonty jsou uložené lokálně (žádný Google Fonts CDN) ve formátu `woff2`, rozdělené na `latin` a `latin-ext` (česká diakritika je v `latin-ext`, prohlížeč si stáhne jen potřebné části přes `unicode-range`).

| Použití | Font | Řezy | Licence | Zdroj |
| --- | --- | --- | --- | --- |
| Display (nadpisy, navigace, tlačítka, štítky, číselné hodnoty) | **Jersey 10** | 400 | SIL OFL 1.1 — `OFL-Jersey10.txt` | balíček `@fontsource/jersey-10` 5.3.0 (původně https://github.com/scfried/soft-type-jersey) |
| Text (popisy, statistiky, combat log, detail) | **IBM Plex Mono** | 400, 700 | SIL OFL 1.1 — `OFL-IBMPlexMono.txt` | balíček `@fontsource/ibm-plex-mono` 5.3.0 (původně https://github.com/IBM/plex) |

## Proč Jersey 10
Původně zvolený Pixelify Sans měl pro tuto hru nečitelné znaky (`7` vypadala jako `1`, `5` jako `S`, `Z` jako `2`), což je u statistik a čísel nepřijatelné. Jersey 10 má jednoznačné číslice a písmena a obsahuje celou českou diakritiku (ověřeno přes `latin` + `latin-ext`: ěščřžýáíéúůďťňó a velká písmena).
Jersey 10 je bez tučného řezu, proto se v CSS nepoužívá synthetic bold (`font-synthesis: none`). V `@font-face` je `size-adjust: 125%`, aby při stejné `font-size` odpovídala velikost písma ostatním fontům.
