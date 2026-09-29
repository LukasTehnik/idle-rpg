// Náhled postavy: jednoduchá pixelová figurka + vrstvy nasazených předmětů.
//
// VÝMĚNA FIGURKY: stačí v app.js nastavit CHARACTER_PREVIEW.src na vlastní
// PNG/SVG/WebP siluetu — vestavěná figurka se pak nepoužije. (Pinování itemů
// se v takovém případě vypíná, protože kotvy sedí jen na vestavěné figurce;
// souřadnice kotev jsou v ITEM_ANCHORS níže a dají se přizpůsobit.)
"use strict";

// Souřadnice v prostoru viewBoxu "-8 0 48 48": x, y, šířka, výška obrázku itemu.
// Pořadí v LAYER_ORDER = pořadí vykreslování (první je vzadu).
const ITEM_ANCHORS = Object.freeze({
  wings:  { x: -6,   y: 6,    w: 44, h: 28 },
  pants:  { x: 8.5,  y: 27,   w: 15, h: 15 },
  boots:  { x: 8.5,  y: 35,   w: 15, h: 13 },
  armor:  { x: 8,    y: 12,   w: 16, h: 16 },
  charm:  { x: 13,   y: 14.5, w: 6,  h: 6 },
  gloves: [
    { x: 4.5,  y: 23.5, w: 7, h: 7 },
    { x: 20.5, y: 23.5, w: 7, h: 7, mirror: true }
  ],
  helmet: { x: 9,    y: -0.5, w: 14, h: 14 },
  weapon: { x: -3,   y: 13,   w: 18, h: 18 }
});
const LAYER_ORDER = ["wings", "pants", "boots", "armor", "charm", "gloves", "helmet", "weapon"];

const BASE_FIGURE = `
  <g class="cf-body">
    <rect x="11" y="28" width="4" height="15" fill="var(--char-pants)"/>
    <rect x="17" y="28" width="4" height="15" fill="var(--char-pants)"/>
    <rect x="10" y="43" width="5" height="3" fill="var(--char-boots)"/>
    <rect x="17" y="43" width="5" height="3" fill="var(--char-boots)"/>
    <rect x="7" y="14" width="3" height="12" fill="var(--char-tunic-dark)"/>
    <rect x="22" y="14" width="3" height="12" fill="var(--char-tunic-dark)"/>
    <rect x="7" y="26" width="3" height="3" fill="var(--char-skin)"/>
    <rect x="22" y="26" width="3" height="3" fill="var(--char-skin)"/>
    <rect x="10" y="14" width="12" height="14" fill="var(--char-tunic)"/>
    <rect x="10" y="26" width="12" height="2" fill="var(--char-belt)"/>
    <rect x="14" y="11" width="4" height="3" fill="var(--char-skin)"/>
    <rect x="11" y="3" width="10" height="8" fill="var(--char-skin)"/>
    <rect x="11" y="2" width="10" height="3" fill="var(--char-hair)"/>
    <rect x="10" y="3" width="1" height="5" fill="var(--char-hair)"/>
    <rect x="21" y="3" width="1" height="5" fill="var(--char-hair)"/>
    <rect x="13" y="7" width="2" height="1" fill="var(--char-eye)"/>
    <rect x="17" y="7" width="2" height="1" fill="var(--char-eye)"/>
  </g>`;

function itemArtUri(item) {
  if (item.image) return item.image;
  const svg = ICONS[item.icon];
  if (!svg) return null;
  const color = (RARITIES[item.rarity] ?? RARITIES.common).color;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/currentColor/g, color));
}

function itemLayerMarkup(slot, item) {
  const uri = itemArtUri(item);
  if (!uri) return "";
  const anchors = [].concat(ITEM_ANCHORS[slot]);
  return anchors.map((a) => {
    const flip = a.mirror ? ` transform="translate(${2 * a.x + a.w} 0) scale(-1 1)"` : "";
    return `<image class="cf-item" data-slot="${slot}" href="${uri}" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" preserveAspectRatio="xMidYMid meet"${flip}/>`;
  }).join("");
}

function characterMarkup(equipment, showItems) {
  const layer = (slot) => (showItems && equipment[slot] ? itemLayerMarkup(slot, equipment[slot]) : "");
  const behind = layer("wings");
  const front = LAYER_ORDER.filter((s) => s !== "wings").map(layer).join("");
  return `<svg class="char-svg" viewBox="-8 0 48 48" preserveAspectRatio="xMidYMax meet" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${behind}${BASE_FIGURE}${front}</svg>`;
}

const characterCache = new WeakMap();

// equipment: objekt slot -> item|null. Node s data-character-preview="base"
// ukazuje jen holou figurku (paper-doll), ostatní i nasazené předměty.
function renderCharacters(equipment, overrideSrc) {
  const signature = LAYER_ORDER.map((s) => equipment[s] ? `${equipment[s].id}:${equipment[s].rarity}` : "-").join("|") + "#" + (overrideSrc ?? "");
  document.querySelectorAll("[data-character-preview]").forEach((node) => {
    const key = signature + (node.dataset.characterPreview === "base" ? "b" : "f");
    if (characterCache.get(node) === key) return;
    characterCache.set(node, key);
    if (overrideSrc) {
      node.innerHTML = `<img class="char-svg char-override" src="${overrideSrc}" alt="">`;
    } else {
      node.innerHTML = characterMarkup(equipment, node.dataset.characterPreview !== "base");
    }
  });
}
