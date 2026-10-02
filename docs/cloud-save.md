# Cloudové ukládání (Supabase)

- Projekt: `wwvlhfsfumtnwjlxhuwm` (eu-west-1). Kód: `cloud-sync.js` (bez knihoven, jen `fetch`).
- Přihlášení: anonymní (automaticky, bez zadávání). Session je v localStorage (`idle-rpg-cloud-session`).
- Tabulka `public.saves`: `user_id` (PK → auth.users), `data` jsonb (celý save v5), `version`, `updated_at`.
- RLS zapnuté, 4 politiky (select/insert/update/delete) jen pro řádek `user_id = auth.uid()`. Ověřeno: cizí save nejde přečíst ani zapsat.
- Používá se pouze veřejný *publishable* klíč. Secret / service_role klíč nikdy do repa.
- Chování: localStorage je primární; cloud push je odložený (8 s) a při skrytí stránky. Při startu se vezme novější save (`savedAt`) a stránka se jednou znovu načte.
- Vypnutí: `?nocloud`. Automatické testy (webdriver) cloud nepoužívají, pokud není `?cloud`.
- Reset hry smaže i cloudový řádek.
- Omezení: smazáním dat prohlížeče se ztratí anonymní účet. Řešení později: e-mail/OAuth přes linkování identity.
