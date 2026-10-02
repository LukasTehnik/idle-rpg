# Cloudové ukládání (Supabase)

- Projekt: `wwvlhfsfumtnwjlxhuwm` (eu-west-1). Kód: `cloud-sync.js` (bez knihoven, jen `fetch`).
- Přihlášení: e-mail + heslo (Supabase Auth). Veřejná registrace i anonymní přihlášení jsou vypnuté; účet zakládá majitel v dashboardu (Authentication → Users → Add user). Session je v localStorage (`idle-rpg-cloud-session`).
- Přihlašovací brána: `index.html` načte `app.js` až po přihlášení (`cloud-sync.js`). Brána platí i na localhostu (jinak by se nepřihlásil cloud). Vypnutí: `?nologin` (bez cloudu) a automatické testy. Pozor: je to jen UI brána, statické soubory jsou veřejné; chráněná jsou data (RLS). Dev nástroje (`affix-catalog.html`, `dev-tools.html`) brána nekryje.
- Tabulka `public.saves`: `user_id` (PK → auth.users), `data` jsonb (celý save v5), `version`, `updated_at`.
- RLS zapnuté, 4 politiky (select/insert/update/delete) jen pro řádek `user_id = auth.uid()`. Ověřeno: cizí save nejde přečíst ani zapsat.
- Používá se pouze veřejný *publishable* klíč. Secret / service_role klíč nikdy do repa.
- Chování: localStorage je primární; cloud push je odložený (8 s) a při skrytí stránky. Při startu se vezme novější save (`savedAt`) a stránka se jednou znovu načte.
- Vypnutí: `?nocloud`. Automatické testy (webdriver) cloud nepoužívají, pokud není `?cloud`.
- Reset hry smaže i cloudový řádek.
- Omezení: skutečně soukromý hosting (přístup k souborům) vyžaduje ochranu na úrovni hostingu.
