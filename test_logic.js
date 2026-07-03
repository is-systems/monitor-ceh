const https = require('https');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE",
                "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"
            }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function run() {
    const bomRes = await fetchJson('https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/bom?select=*');
    const routesRes = await fetchJson('https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/marshruti?select=*');
    const otchetiRes = await fetchJson('https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/otcheti?select=*');

    let globalBomData = bomRes || [];
    let globalRoutesByDetail = {};
    if (routesRes) {
        routesRes.forEach(r => { let code = String(r['Код на детайла']).trim().toLowerCase(); if(!globalRoutesByDetail[code]) globalRoutesByDetail[code] = []; globalRoutesByDetail[code].push(r); });
        Object.keys(globalRoutesByDetail).forEach(code => globalRoutesByDetail[code].sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция'])));
    }
    
    let completedOps = {}; let scrappedOps = {};
    if (otchetiRes) {
        otchetiRes.forEach(r => {
            let code = String(r['ID Детайл']).trim().toLowerCase();
            let op = String(r['Операция']).trim().toLowerCase();
            let key = code + '_' + op;
            let qty = parseFloat(r['Количество']) || 0;
            if (r['Статус'] === 'Отчетено') completedOps[key] = (completedOps[key] || 0) + qty;
            else if (r['Статус'] === 'Брак') scrappedOps[key] = (scrappedOps[key] || 0) + qty;
        });
    }

    let trueDoneOps = {};
    Object.keys(globalRoutesByDetail).forEach(code => {
        let routes = globalRoutesByDetail[code];
        if (routes.length === 0) return;
        let lastOpKey = code + '_' + String(routes[routes.length - 1]['Име на операция']).trim().toLowerCase();
        trueDoneOps[lastOpKey] = completedOps[lastOpKey] || 0;
        for (let i = routes.length - 2; i >= 0; i--) {
            let opKey = code + '_' + String(routes[i]['Име на операция']).trim().toLowerCase();
            let nextOpKey = code + '_' + String(routes[i+1]['Име на операция']).trim().toLowerCase();
            trueDoneOps[opKey] = Math.max(completedOps[opKey] || 0, (trueDoneOps[nextOpKey] || 0) + (scrappedOps[nextOpKey] || 0));
        }
    });

    let startedOpsCache = {};
    let getStarted = (code) => {
        let lcCode = code.toLowerCase();
        if (startedOpsCache[lcCode] !== undefined) return startedOpsCache[lcCode];
        let pRoutes = globalRoutesByDetail[lcCode] || [];
        if (pRoutes.length > 0) {
            let firstOpKey = lcCode + '_' + String(pRoutes[0]['Име на операция']).trim().toLowerCase();
            startedOpsCache[lcCode] = (trueDoneOps[firstOpKey] || 0) + (scrappedOps[firstOpKey] || 0);
        } else { startedOpsCache[lcCode] = 0; }
        return startedOpsCache[lcCode];
    };

    let cCode = "мпр вар. 25";
    let opName = "струговане";
    let rKey = cCode + '_' + opName;
    
    let cRoutes = globalRoutesByDetail[cCode] || [];
    let opIndex = cRoutes.findIndex(route => String(route['Име на операция']).trim().toLowerCase() === opName);
    let stockHere = 0;
    let consumedByOthers = 0;
    
    if (opIndex !== -1) {
        if (opIndex === cRoutes.length - 1) {
            let allParents = globalBomData.filter(b => String(b['ID Компонент']).trim().toLowerCase() === cCode);
            console.log("Found parents:", allParents.map(p => p['ID Родител']));
            allParents.forEach(p => {
                let pCode = String(p['ID Родител']).trim();
                let pMultiplier = parseFloat(p['Количество']) || 1;
                let pStarted = getStarted(pCode);
                console.log(`Parent: ${pCode}, Started: ${pStarted}, Multiplier: ${pMultiplier}`);
                consumedByOthers += pStarted * pMultiplier;
            });
            console.log("Total consumed:", consumedByOthers);
            console.log("True done:", trueDoneOps[rKey]);
            stockHere = Math.max(0, (trueDoneOps[rKey] || 0) - consumedByOthers);
        } else {
            console.log("Not last op");
        }
    } else {
        console.log("Op not found");
    }
    
    console.log("FINAL STOCK:", stockHere);
}
run();
