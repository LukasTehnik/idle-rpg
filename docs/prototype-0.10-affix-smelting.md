# Prototype 0.10 — affixy a tavba

## Oddělené cesty

| Přepínač | Význam |
| --- | --- |
| `enabledOnEquipmentDrops` | Affix může být na nalezeném itemu. Nyní jen T1. |
| `enabledOnScrollDrops` | Affix padá přímo jako svitek z enemy. Nyní vypnuto. |
| `enabledOnSmeltRecovery` | Affix lze získat tavením nalezeného itemu. Nyní jen T1. |

## Tavba

- Craftěný item svitek nikdy nevrátí.
- Každý obnovitelný affix má vlastní 10% hod.
- Jeden affix: 10% svitek, 90% nic.
- Prefix a suffix: 81% nic, 18% právě jeden, 1% oba.

Prefix se zobrazuje před base názvem a suffix za ním. Oba jsou jantarově
zvýrazněné nezávisle na kvalitě itemu.
