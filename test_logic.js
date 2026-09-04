const fetch = require('node-fetch');
async function run() {
    let headers = {'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU'};
    let bomRes = await fetch('https://aoekbmhgbohsgpwqsizv.supabase.co/rest/v1/bom?limit=100000', {headers}).then(r=>r.json());
    let marshrutiRes = await fetch('https://aoekbmhgbohsgpwqsizv.supabase.co/rest/v1/marshruti?limit=100000', {headers}).then(r=>r.json());
    let otchetiRes = await fetch('https://aoekbmhgbohsgpwqsizv.supabase.co/rest/v1/otcheti?limit=100000', {headers}).then(r=>r.json());
    
    let globalBomData = bomRes;
    let routesData = marshrutiRes;
    let globalRoutesByDetail = {};
    routesData.forEach(r => {
        let code = String(r['Код на детайла']).trim().toLowerCase();
        if (!globalRoutesByDetail[code]) globalRoutesByDetail[code] = [];
        globalRoutesByDetail[code].push(r);
    });
    for(let k in globalRoutesByDetail) globalRoutesByDetail[k].sort((a,b)=>parseInt(a['№ Операция'])-parseInt(b['№ Операция']));
    
    let manualOps = {};
    let completedOps = {};
    let grossCompletedOps = {};
    let savedQty = {};
    
    otchetiRes.forEach(r => {
        let code = String(r['ID Детайл']).trim().toLowerCase();
        let op = String(r['Операция']).trim().toLowerCase();
        let key = code + '_' + op;
        let qty = parseFloat(r['Количество']) || 0;
        let isManual = (r['Оператор'] === 'СИСТЕМА (Ръчно добавен)' || (r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty > 0));
        
        if (isManual) {
            manualOps[key] = (manualOps[key] || 0) + qty;
        } else if (r['Статус'] === 'Отчетено') {
            if (r['Оператор'] === 'СИСТЕМА (Експедиция)') {
            } else if (op === 'възстановен') {
                savedQty[code] = (savedQty[code] || 0) + qty;
            } else if (op.startsWith('вложен в ')) {
            } else {
                completedOps[key] = (completedOps[key] || 0) + qty;
                grossCompletedOps[key] = (grossCompletedOps[key] || 0) + qty;
            }
        } else if (r['Оператор'] !== 'СИСТЕМА (Експедиция)' && !(r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty < 0) && op !== 'възстановен' && !op.startsWith('вложен в ')) { 
            grossCompletedOps[key] = (grossCompletedOps[key] || 0) + qty; 
        }
    });

    let grossTrueDoneOps = {};
    let trueDoneOps = {};
    Object.keys(globalRoutesByDetail).forEach(code => {
        let routes = globalRoutesByDetail[code];
        if (routes.length > 0) {
            let lastOpKey = code + '_' + String(routes[routes.length-1]['Име на операция']).trim().toLowerCase();
            grossTrueDoneOps[lastOpKey] = grossCompletedOps[lastOpKey] || 0;
            trueDoneOps[lastOpKey] = completedOps[lastOpKey] || 0;
        }
    });
    
    let shippedOps = {};
    let shippedQty = {};
    Object.keys(globalRoutesByDetail).forEach(code => {
        let routes = globalRoutesByDetail[code];
        if (routes.length > 0) {
            let lastOpKey = code + '_' + String(routes[routes.length-1]['Име на операция']).trim().toLowerCase();
            shippedQty[code] = Math.max(0, (grossTrueDoneOps[lastOpKey]||0) - (trueDoneOps[lastOpKey]||0));
        }
    });
    
    let totalShippedCache = {};
    function getTotalShipped(item, visited = new Set()) {
        let lc = item.toLowerCase();
        if (totalShippedCache[lc] !== undefined) return totalShippedCache[lc];
        if (visited.has(lc)) return 0;
        visited.add(lc);
        let directShipped = shippedQty[lc] || 0;
        let parents = globalBomData.filter(b => String(b['ID Компонент']).trim().toLowerCase() === lc);
        let indirectShipped = 0;
        parents.forEach(p => {
            let parentCode = String(p['ID Родител']).trim().toLowerCase();
            if (parentCode !== lc) {
                let parentRoutes = globalRoutesByDetail[parentCode];
                let parentConsumed = 0;
                if (parentRoutes && parentRoutes.length > 0) {
                    let lastOpKey = parentCode + '_' + String(parentRoutes[parentRoutes.length-1]['Име на операция']).trim().toLowerCase();
                    parentConsumed = grossTrueDoneOps[lastOpKey] || 0;
                } else {
                    parentConsumed = getTotalShipped(parentCode, visited);
                }
                let mult = parseFloat(p['Количество']) || 1;
                indirectShipped += parentConsumed * mult;
            }
        });
        let finalVal = directShipped + indirectShipped;
        totalShippedCache[lc] = finalVal;
        return finalVal;
    }

    let code = "вал вар. 11 #";
    let consumedByShipped = getTotalShipped(code);
    let opKey = code + "_шлайфане";
    let globalGross = (grossTrueDoneOps[opKey] || 0) + (manualOps[opKey] || 0);
    let globalNet = Math.max(0, globalGross + (savedQty[code] || 0) - consumedByShipped);
    
    console.log("code:", code);
    console.log("globalGross:", globalGross);
    console.log("savedQty:", savedQty[code] || 0);
    console.log("consumedByShipped:", consumedByShipped);
    console.log("globalNet:", globalNet);
    
    console.log("parents of", code, ":");
    globalBomData.filter(b => String(b['ID Компонент']).trim().toLowerCase() === code).forEach(p => {
        let pCode = String(p['ID Родител']).trim().toLowerCase();
        let parentRoutes = globalRoutesByDetail[pCode];
        let lastOpKey = parentCode + '_' + String(parentRoutes[parentRoutes.length-1]['Име на операция']).trim().toLowerCase();
        console.log("  ", pCode, "->", lastOpKey, "-> grossTrueDoneOps:", grossTrueDoneOps[lastOpKey] || 0);
    });
}
run();

