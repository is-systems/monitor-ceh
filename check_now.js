const url = 'https://aoekbmhgbohsgpwqsizv.supabase.co/rest/v1';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU';
const headers = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };

async function fetchAll(endpoint) {
    let all = [];
    let offset = 0;
    while(true) {
        let res = await fetch(`${url}/${endpoint}?select=*&limit=1000&offset=${offset}`, {headers});
        let data = await res.json();
        if(data.length === 0) break;
        all = all.concat(data);
        offset += 1000;
    }
    return all;
}

(async () => {
    let [bom, routesData, allOtcheti] = await Promise.all([
        fetchAll('bom'),
        fetchAll('%D0%BC%D0%B0%D1%80%D1%88%D1%80%D1%83%D1%82%D0%BD%D0%B8_%D0%BA%D0%B0%D1%80%D1%82%D0%B8'), // РјР°СЂС€СЂСѓС‚РЅРё_РєР°СЂС‚Рё
        fetchAll('otcheti')
    ]);
    
    let routesByDetail = {};
    routesData.forEach(r => {
        let code = String(r['РљРѕРґ РЅР° РґРµС‚Р°Р№Р»Р°']||'').trim().toLowerCase();
        if(!routesByDetail[code]) routesByDetail[code] = [];
        routesByDetail[code].push(r);
    });
    Object.keys(routesByDetail).forEach(c => {
        routesByDetail[c].sort((a,b) => (parseFloat(a['в„– РћРїРµСЂР°С†РёСЏ'])||0) - (parseFloat(b['в„– РћРїРµСЂР°С†РёСЏ'])||0));
    });
    
    let completedOps = {};
    let grossCompletedOps = {};
    let scrappedOps = {};
    let savedQty = {};
    
    let sortedReports = allOtcheti.sort((a, b) => new Date(a['Р’СЂРµРјРµ РљСЂР°Р№'] || a.created_at) - new Date(b['Р’СЂРµРјРµ РљСЂР°Р№'] || b.created_at));
    
    sortedReports.forEach(r => {
        let code = String(r['ID Р”РµС‚Р°Р№Р»']).trim().toLowerCase();
        let op = String(r['РћРїРµСЂР°С†РёСЏ']).trim().toLowerCase();
        let key = code + '_' + op;
        let qty = parseFloat(r['РљРѕР»РёС‡РµСЃС‚РІРѕ']) || 0;
        
        if (r['РЎС‚Р°С‚СѓСЃ'] === 'Р‘СЂР°Рє') {
            scrappedOps[key] = (scrappedOps[key] || 0) + qty;
        } 
        else if (r['РЎС‚Р°С‚СѓСЃ'] === 'РћС‚С‡РµС‚РµРЅРѕ') {
            if (op === 'РІСЉР·СЃС‚Р°РЅРѕРІРµРЅ') savedQty[code] = (savedQty[code] || 0) + qty;
            completedOps[key] = (completedOps[key] || 0) + qty;
            if (r['РћРїРµСЂР°С‚РѕСЂ'] !== 'РЎРРЎРўР•РњРђ (Р•РєСЃРїРµРґРёС†РёСЏ)' && !(r['РћРїРµСЂР°С‚РѕСЂ'] === 'РЎРРЎРўР•РњРђ (РљРѕСЂРµРєС†РёСЏ РЅР°Р»РёС‡РЅРѕСЃС‚)' && qty < 0) && op !== 'РІСЉР·СЃС‚Р°РЅРѕРІРµРЅ' && !op.startsWith('РІР»РѕР¶РµРЅ РІ ')) { 
                grossCompletedOps[key] = (grossCompletedOps[key] || 0) + qty; 
            }
        }
    });
    
    let trueDoneOps = {};
    let grossTrueDoneOps = {};
    let shippedQty = {};
    let grossStartedOps = {}; 
    
    Object.keys(routesByDetail).forEach(code => {
        let routes = routesByDetail[code];
        if(routes.length === 0) return;
        
        for (let i = routes.length - 2; i >= 0; i--) {
            let opKey = code + '_' + String(routes[i]['РРјРµ РЅР° РѕРїРµСЂР°С†РёСЏ']).trim().toLowerCase();
            let nextOpKey = code + '_' + String(routes[i+1]['РРјРµ РЅР° РѕРїРµСЂР°С†РёСЏ']).trim().toLowerCase();
            let requiredFromMe = (grossCompletedOps[nextOpKey] || 0) + (scrappedOps[nextOpKey] || 0);
            grossCompletedOps[opKey] = Math.max(grossCompletedOps[opKey] || 0, requiredFromMe);
            let trueRequired = (completedOps[nextOpKey] || 0) + (scrappedOps[nextOpKey] || 0);
            completedOps[opKey] = Math.max(completedOps[opKey] || 0, trueRequired);
        }
        
        let lastOpKey = code + '_' + String(routes[routes.length - 1]['РРјРµ РЅР° РѕРїРµСЂР°С†РёСЏ']).trim().toLowerCase();
        trueDoneOps[lastOpKey] = (completedOps[lastOpKey] || 0) + (savedQty[code] || 0);
        grossTrueDoneOps[lastOpKey] = (grossCompletedOps[lastOpKey] || 0) + (savedQty[code] || 0);
        
        for (let i = routes.length - 2; i >= 0; i--) {
            let opKey = code + '_' + String(routes[i]['РРјРµ РЅР° РѕРїРµСЂР°С†РёСЏ']).trim().toLowerCase();
            let nextOpKey = code + '_' + String(routes[i+1]['РРјРµ РЅР° РѕРїРµСЂР°С†РёСЏ']).trim().toLowerCase();
            let bucket = (grossCompletedOps[opKey] || 0) - (grossCompletedOps[nextOpKey] || 0) - (scrappedOps[nextOpKey] || 0);
            if (bucket < 0) bucket = 0;
            grossTrueDoneOps[opKey] = (grossTrueDoneOps[nextOpKey] || 0) + bucket;
            let trueBucket = (completedOps[opKey] || 0) - (completedOps[nextOpKey] || 0) - (scrappedOps[nextOpKey] || 0);
            if (trueBucket < 0) trueBucket = 0;
            trueDoneOps[opKey] = (trueDoneOps[nextOpKey] || 0) + trueBucket;
        }
        
        let firstOpKey = code + '_' + String(routes[0]['РРјРµ РЅР° РѕРїРµСЂР°С†РёСЏ']).trim().toLowerCase();
        grossStartedOps[firstOpKey] = (grossCompletedOps[firstOpKey] || 0) + (scrappedOps[firstOpKey] || 0);
        
        shippedQty[code] = Math.max(0, (grossTrueDoneOps[lastOpKey] || 0) - (trueDoneOps[lastOpKey] || 0));
    });
    
    let totalShippedCache = {};
    function getTotalShipped(item, visited = new Set()) {
        let lc = item.toLowerCase();
        if(totalShippedCache[lc] !== undefined) return totalShippedCache[lc];
        if(visited.has(lc)) return 0; visited.add(lc);
        let direct = shippedQty[lc] || 0; let indirect = 0;
        let parents = bom.filter(b => String(b['ID РљРѕРјРїРѕРЅРµРЅС‚']).trim().toLowerCase() === lc);
        parents.forEach(p => {
            let parentCode = String(p['ID Р РѕРґРёС‚РµР»']).trim().toLowerCase();
            if(parentCode !== lc) {
                let parentRoutes = routesByDetail[parentCode];
                let parentConsumed = 0;
                if (parentRoutes && parentRoutes.length > 0) {
                    let firstOpKey = parentCode + '_' + String(parentRoutes[0]['РРјРµ РЅР° РѕРїРµСЂР°С†РёСЏ']).trim().toLowerCase();
                    parentConsumed = grossStartedOps[firstOpKey] || 0;
                } else {
                    parentConsumed = getTotalShipped(parentCode, new Set(visited));
                }
                indirect += parentConsumed * (parseFloat(p['РљРѕР»РёС‡РµСЃС‚РІРѕ'])||1);
            }
        });
        totalShippedCache[lc] = direct + indirect; return totalShippedCache[lc];
    }
    
    let positiveWarehouse = [];
    let minuses = [];
    
    Object.keys(routesByDetail).forEach(code => {
        let routes = routesByDetail[code];
        if(routes.length === 0) return;
        let consumedByShipped = getTotalShipped(code);
        let lastRoute = routes[routes.length - 1];
        let opName = String(lastRoute['РРјРµ РЅР° РѕРїРµСЂР°С†РёСЏ']).trim();
        let opKey = code + '_' + opName.toLowerCase();
        
        let myGrossDone = grossTrueDoneOps[opKey] || 0;
        let warehouseStock = myGrossDone - consumedByShipped;
        
        if (warehouseStock > 0) {
            positiveWarehouse.push({code: code.toUpperCase(), qty: warehouseStock});
        } else if (warehouseStock < 0) {
            minuses.push({code: code.toUpperCase(), qty: warehouseStock});
        }
    });
    
    console.log("=== WAREHOUSE STOCK (POSITIVE) ===");
    positiveWarehouse.forEach(x => console.log(`${x.code}: ${x.qty} pcs`));
    if (positiveWarehouse.length === 0) console.log("NO positive stock in warehouse.");
    
    console.log("\n=== WAREHOUSE MINUSES ===");
    minuses.forEach(x => console.log(`${x.code}: ${x.qty} pcs`));
    if (minuses.length === 0) console.log("NO minuses found.");
    
})();



