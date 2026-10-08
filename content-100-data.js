"use strict";

// Content milestone, not final balance. Loaded before all data registries.
// Stable IDs and existing save instances are never rewritten.
const CONTENT_100 = (() => {
  const bands = [
    ["okraj-stareho-lesa", "Old Forest Edge", "Iron", "goblin", "beast"],
    ["pustina-ticha", "Wasteland of Silence", "Chitin", "e06", "moth"],
    ["odpadkove-hory", "Waste Mountains", "Salvaged", "odpadky-e03", "bound"],
    ["magma", "Magma", "Ember", "magma-e05", "forge"],
    ["elektrika", "Electricity", "Arc", "elektrika-e05", "machine"],
    ["glass-desert", "Glass Desert", "Prismatic", null, "glass"],
    ["fungal-depths", "Fungal Depths", "Spore", null, "fungal"],
    ["frozen-vault", "Frozen Vault", "Frostbound", null, "undead"],
    ["ashen-citadel", "Ashen Citadel", "Obsidian", null, "forge"],
    ["void-sanctum", "Void Sanctum", "Voidsteel", null, "void"],
  ];
  const primary = [1,1.75,2.85,4.35,6.4,9.2,13,18,25,34];
  const items = [], materials = {}, enemies = {}, recipes = [], locations = [], areas = [];
  const sets = {};
  const slots = ["weapon", "helmet", "armor", "gloves", "pants", "boots", "charm"];
  const slotLabel = { weapon:"Sword", helmet:"Helmet", armor:"Armor", gloves:"Gloves", pants:"Leggings", boots:"Boots", charm:"Amulet", wings:"Wings" };
  const rolls = { weapon:{damageMin:[2,4],damageMax:[5,8]}, helmet:{maxHp:[10,18]}, armor:{maxHp:[20,35]}, gloves:{damageMin:[1,2],damageMax:[2,4]}, pants:{maxHp:[14,24]}, boots:{maxHp:[9,16]}, charm:{maxHp:[8,14],damageMax:[1,3]}, wings:{maxHp:[12,20]} };
  const image = (slot) => `assets/placeholders/${slot}.svg`;
  const materialIds = (tier) => ["ore", "fiber", "essence", "core"].map((kind) => `t${tier}-${kind}`);
  function affixTiers(tier, boss = false) {
    if (tier === 1) return {1:100};
    if (tier <= 3) return {1:75,2:25};
    if (tier <= 6) return {1:40,2:50,3:10};
    if (tier <= 8) return boss ? {2:50,3:40,4:10} : {1:20,2:50,3:30};
    return boss ? {2:25,3:50,4:23,5:2} : {1:10,2:35,3:50,4:5};
  }
  function qualityProfile(tier, boss = false) {
    const legendary = tier === 1 ? 0.0005 : 0.0005 + (tier - 1) * (boss ? 0.001 : 0.00025);
    const mythic = boss && tier >= 8 ? 0.0002 : 0;
    const rare = 0.058 + (tier-1)*0.003;
    const epic = 0.0065 + (tier-1)*(boss ? 0.002 : 0.0005);
    return {common:1-rare-epic-legendary-mythic,rare,epic,legendary,...(mythic ? {mythic} : {})};
  }
  bands.forEach(([locationId,name,theme,legacyBoss,family], index) => {
    const tier = index+1, minLevel = index*10+1, maxLevel = tier*10;
    const ids = materialIds(tier), tierItems = [];
    for (const slot of [...slots,"wings"]) {
      const count = slot === "weapon" || slot === "helmet" ? 2 : 1;
      for (let variant=1; variant<=count; variant++) {
        const id = `t${tier}-${slot}-${variant}`;
        const template = {icon:id, name:`${theme} ${variant===2 ? (slot==="weapon" ? "Greatsword" : "Crown") : slotLabel[slot]}`, slot, itemTier:tier, requiredLevel:minLevel, image:image(slot), rolls:rolls[slot], smeltMaterialId:ids[slot==="weapon" || slot==="helmet" ? 0 : slot==="wings" || slot==="charm" ? 2 : 1], ...(slot==="wings" ? {wingGlow:"none"} : {})};
        items.push(template); tierItems.push(id);
        recipes.push({id:`forge-${id}`,templateId:id,label:template.name,tier,requiredLevel:minLevel,gold:Math.round(200*Math.pow(1.55,index)),materials:[{id:template.smeltMaterialId,qty:24},{id:ids[2],qty:4},...(slot==="wings" ? [{id:ids[3],qty:2}] : [])]});
      }
    }
    if (tier % 2 === 0) {
      const setId = `set-t${tier}`, setName = ["Dustwarden","Furnace Keeper","Prismwalker","Vault Guardian","Void Sovereign"][tier/2-1];
      sets[setId] = {id:setId,name:setName,tier,bonuses:[{pieces:2,stats:{maxHp:Math.round(12*primary[index])}},{pieces:4,stats:{damageMin:Math.round(2*primary[index]),damageMax:Math.round(3*primary[index])}},{pieces:7,stats:{defense:Math.round(3*primary[index]),attackSpeed:5}}]};
      for (const slot of slots) {
        const id = `${setId}-${slot}`;
        items.push({icon:id,name:`${setName} ${slotLabel[slot]}`,slot,itemTier:tier,setId,requiredLevel:minLevel,image:image(slot),rolls:rolls[slot],smeltMaterialId:ids[2]});
        tierItems.push(id);
        recipes.push({id:`forge-${id}`,templateId:id,label:`${setName} ${slotLabel[slot]}`,tier,requiredLevel:minLevel,gold:Math.round(400*Math.pow(1.55,index)),materials:[{id:ids[0],qty:24},{id:ids[1],qty:24},{id:ids[2],qty:8},{id:ids[3],qty:2}]});
      }
    }
    const enemyIds = [1,2,3,4].map((n) => `c100-t${tier}-e${n}`);
    for (let n=0;n<4;n++) {
      const id = enemyIds[n], boss=n===3, type=boss ? "boss" : n===2 ? "elite" : "common";
      const level = minLevel + [0,3,6,9][n];
      const commonPool = tierItems.filter((itemId) => !itemId.startsWith("set-"));
      // Each target has its own slot identity; elite/boss expand the pool.
      const dropPool = n===0 ? commonPool.filter((id) => /weapon|gloves|helmet/.test(id)) : n===1 ? commonPool.filter((id) => /armor|pants|boots|charm/.test(id)) : boss ? tierItems : commonPool;
      enemies[id] = {id,locationId,name:`${theme} ${["Hunter","Gatherer","Sentinel","Overlord"][n]}`,level,type,family,image:null,itemTier:tier,element:tier===4 ? "fire" : tier===5 ? "electric" : null,
        affixBossSources: boss && tier===9 ? ["e06","magma-e05"] : boss && tier===10 ? ["elektrika-e05"] : [],
        maxHp:Math.round(4*(11+2*(level-1)+12*primary[index])*[1,1.15,1.7,3.2][n]),
        minDamage:Math.max(5,Math.round((100+15*(level-1)+90*primary[index])*.013*[1,1,1.25,2][n])),maxDamage:Math.max(8,Math.round((100+15*(level-1)+90*primary[index])*.018*[1,1.1,1.3,2][n])),defense:Math.round(primary[index]*n),
        xp:Math.round(10*Math.pow(1.45,index)*[1,1.1,1.5,2.4][n]),gold:Math.max(1,Math.round(Math.pow(1.38,index)*[1,1,1.5,3][n])),
        dropChance:0.03,equipmentQualityProfile:`c100-t${tier}${boss ? "-boss" : ""}`,affixTierPool:tier===5 && n===2 ? {1:20,2:40,3:35,4:5} : affixTiers(tier,boss),dropPool,
        materialDrops:[{templateId:ids[n===0 ? 0 : n===1 ? 1 : 2],qualityProfile:`c100-t${tier}`,chance:boss ? 0.16 : n===2 ? 0.14 : 0.12,quantity:[1,1],tier:"common"},
          ...(boss ? [{templateId:ids[3],qualityProfile:`c100-t${tier}`,chance:0.04,quantity:[1,1],tier:"rare"}] : []),
          ...(tier===1 ? [{templateId:n===0 ? "iron-rivets" : n===1 ? "leather-padding" : "wooden-handle",qualityProfile:"start",chance:0.12,quantity:[1,1],tier:"common"}] : [])]};
    }
    ids.forEach((id,n) => { materials[id]={id,name:`${theme} ${["Ore","Fiber","Essence","Core"][n]}`,asset:"assets/placeholders/material.svg",defaultQuality:"common",category:"material",stackable:true,tradeable:true,sourceLocationId:locationId,sourceEnemyIds:enemyIds.filter((enemyId) => enemies[enemyId].materialDrops.some((drop) => drop.templateId===id)),description:`Tier ${tier} crafting input.`}; });
    areas.push({id:`c100-area-${tier}`,locationId,name:`${name} — Farming Grounds`,shortDescription:`Level ${minLevel}–${maxLevel}. Four fixed farming targets.`,enemyIds,order:99,status:"available"});
    locations.push({id:locationId,name,recommendedLevel:minLevel,maxLevel,itemTier:tier,status:"available",backgroundAsset:null,shortDescription:`Level ${minLevel}–${maxLevel}. Choose a fixed farming target.`,enemyIds,itemIds:tierItems,mapPosition:{x:12+(index%5)*18,y:index<5 ? 30 : 72}});
  });
  // Aggregate duplicate inputs before availability checks / consumption.
  for(const recipe of recipes){const totals={};for(const m of recipe.materials)totals[m.id]=(totals[m.id]??0)+m.qty;recipe.materials=Object.entries(totals).map(([id,qty])=>({id,qty}));}
  const profiles = {}, materialProfiles = {};
  for(let tier=1;tier<=10;tier++) {
    profiles[`c100-t${tier}`]=qualityProfile(tier); profiles[`c100-t${tier}-boss`]=qualityProfile(tier,true);
    const rare=.09+(tier-1)*.004, epic=.01+(tier-1)*.001, legendary=tier>=5 ? .0005*(tier-4) : 0, mythic=tier>=9 ? .0001 : 0;
    materialProfiles[`c100-t${tier}`]={common:1-rare-epic-legendary-mythic,rare,epic,...(legendary ? {legendary} : {}),...(mythic ? {mythic} : {})};
  }
  return Object.freeze({version:1,maxLevel:100,bands,primary,items,materials,enemies,recipes,locations,areas,sets,profiles,materialProfiles});
})();

function content100AffixWeight(affix) {
  const statWeights={magic_find:.3,equipment_drop_chance:.25,attack_speed:.55,crit_chance:.6};
  return (affix.scarcity?.relativeDropWeight ?? 1)*Math.min(1,...affix.modifiers.map((m)=>statWeights[m.statId] ?? 1));
}
function content100AffixEligible(affix,enemy,item) {
  if(!affix.enabled || !affix.allowedSlots.includes(item.slot) || affix.requiredItemLevel>enemy.level) return false;
  if(affix.locationIdentity && affix.locationIdentity!==enemy.locationId) return false;
  if(!(affix.scarcity.sourcePools ?? []).some(id=>{const pool=SCROLL_SOURCE_POOLS[id];const lineage=pool?.bossEnemyIds?.some(bossId=>enemy.affixBossSources?.includes(bossId));return pool && (!pool.locationId || pool.locationId===enemy.locationId || lineage) && pool.compatibleDropSources.includes(enemy.type) && pool.maxTier>=affix.tier;}))return false;
  if(affix.category==="boss" && (enemy.type!=="boss" || !(affix.scarcity.sourcePools ?? []).some((id)=>typeof SCROLL_SOURCE_POOLS!=="undefined" && SCROLL_SOURCE_POOLS[id]?.bossEnemyIds?.some((bossId)=>bossId===enemy.id || enemy.affixBossSources?.includes(bossId))))) return false;
  return affix.tier<5 || (enemy.type==="boss" && enemy.level>=90);
}
function content100PickWeighted(entries,rng=Math.random) {
  const usable=entries.filter((entry)=>Number(entry.weight)>0); const sum=usable.reduce((a,b)=>a+Number(b.weight),0);
  if(!sum) return null; let roll=rng()*sum;
  for(const entry of usable){ roll-=entry.weight; if(roll<0)return entry.value; } return usable.at(-1).value;
}
// Exact base probabilities, including slot filtering and prefix/suffix conflicts.
// Sum is expected affix instances per kill, not probability of any affix.
function content100AffixDistribution(type,enemy,item) {
  const candidates=AFFIX_DEFINITIONS.filter(a=>a.type===type && a.enabledOnEquipmentDrops && content100AffixEligible(a,enemy,item) && checkAffixOnItem(item,a.id).ok);
  const tiers=Object.entries(enemy.affixTierPool??{}).filter(([tier,weight])=>weight>0&&candidates.some(a=>a.tier===Number(tier)));
  const total=tiers.reduce((s,[,weight])=>s+weight,0);
  return candidates.filter(a=>tiers.some(([t])=>Number(t)===a.tier)).map(affix=>{
    const weights=candidates.filter(a=>a.tier===affix.tier).reduce((s,a)=>s+content100AffixWeight(a),0);
    return {affix,probability:enemy.affixTierPool[affix.tier]/total*content100AffixWeight(affix)/weights};
  });
}
function content100AffixProbabilities(enemy) {
  const totals={},pool=(enemy.dropPool??[]).map(findTemplateById).filter(Boolean),c=PROGRESSION_ECONOMY.affixComposition;
  const add=(id,p)=>{totals[id]=(totals[id]??0)+p*(enemy.dropChance??.03)/Math.max(1,pool.length);};
  for(const template of pool){
    const item={...template,prefix:null,suffix:null},prefixes=content100AffixDistribution("prefix",enemy,item);
    prefixes.forEach(({affix,probability})=>add(affix.id,probability*(c.prefix+c.both)));
    content100AffixDistribution("suffix",enemy,item).forEach(({affix,probability})=>add(affix.id,probability*(c.suffix+(prefixes.length?0:c.both))));
    prefixes.forEach(({affix:p,probability:pp})=>content100AffixDistribution("suffix",enemy,{...item,prefix:{affixId:p.id}}).forEach(({affix,probability})=>add(affix.id,c.both*pp*probability)));
  }
  return totals;
}
function content100SetBonuses(items) {
  const counts={};
  for(const item of items){ const template=typeof findTemplateById==="function" ? findTemplateById(item.templateId ?? item.icon) : null; const id=template?.setId; if(id)counts[id]=(counts[id]??0)+1; }
  const totals={},active=[];
  for(const [id,pieces] of Object.entries(counts))for(const bonus of CONTENT_100.sets[id]?.bonuses ?? [])if(pieces>=bonus.pieces){active.push({id,pieces:bonus.pieces});for(const [key,value] of Object.entries(bonus.stats))totals[key]=(totals[key]??0)+value;}
  return {totals,active};
}
function content100XpNeeded(level) {
  if(level>=100)return Number.MAX_SAFE_INTEGER;
  const tier=Math.min(10,Math.floor((level-1)/10)+1);
  // 150 reference hours to 100 at 500 normal-target kills/h; excludes deaths.
  const hourWeights=Array.from({length:99},(_,i)=>Math.pow(1+(i/98)*2,1.35));
  const total=hourWeights.reduce((a,b)=>a+b,0);
  return Math.round(150*500*10*Math.pow(1.45,tier-1)*hourWeights[level-1]/total);
}

// Stateless combat helpers used by the live game and the headless simulator.
function content100Damage({damage,critical=false,stats,enemy,targetHp,kills=0}) {
  const t=stats.affixTotals ?? {};
  if(critical)damage*=Math.max(1,2+(t.crit_damage ?? 0)/100);
  damage+=(t.fire_damage ?? 0)+(t.electric_damage ?? 0);
  let bonus=enemy.type==="boss" ? (t.boss_damage ?? 0) : enemy.type==="elite" ? (t.elite_damage ?? 0) : 0;
  bonus+=t[`enemy_family_damage:${enemy.family}`] ?? 0;
  if(stats.hp<=stats.maxHp*.3)bonus+=t.low_hp_damage ?? 0;
  if(stats.hp>=stats.maxHp)bonus+=t.full_hp_damage ?? 0;
  if(targetHp<=enemy.maxHp*.3)bonus+=t.execution_damage ?? 0;
  bonus+=Math.min(t.hunger_damage_cap ?? 0,kills*(t.hunger_damage_per_kill ?? 0));
  const penetration=(t.defense_penetration ?? 0)+(enemy.type==="boss" ? t.boss_defense_penetration ?? 0 : 0);
  return Math.max(1,Math.round(damage*(1+bonus/100)*(t.damage_multiplier ?? 1)-Math.max(0,(enemy.defense ?? 0)-penetration)));
}
function content100Healing(amount,totals={},onKill=false,round=true) {
  const value=Math.max(0,amount*Math.max(0,1+(totals.all_healing ?? 0)/100)*Math.max(0,1+(onKill ? 0 : totals.non_kill_healing ?? 0)/100));
  return round ? Math.round(value) : value;
}
function content100Quality(weights,magicFind=0,rng=Math.random) {
  const boost=1+Math.min(20,Math.max(0,magicFind))/100;
  const result=Object.entries(weights).map(([value,weight])=>({value,weight:value==="common" ? 0 : Number(weight)*boost}));
  const tail=result.reduce((sum,entry)=>sum+entry.weight,0);
  const common=result.find((entry)=>entry.value==="common"); if(common)common.weight=Math.max(0,1-tail);
  return content100PickWeighted(result,rng) ?? "common";
}
