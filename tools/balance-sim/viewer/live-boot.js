"use strict";
// Vkládá se server.js do index.html (parametr ?bsim=<seed>) PŘED herní skripty. Hra pak běží na virtuálních hodinách se seedovaným
// Math.random a s localStorage jen v paměti: nedotkne se uložené hry. Žádná herní logika tu není.
(function () {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get("bsim")) || 1;
  window.__bsimErrors = [];
  window.__bsim = window.BalanceSimVirtualTime.install(window, { seed, stubUi: false, visualSplit: true, memoryStorage: true, errors: window.__bsimErrors });
})();
