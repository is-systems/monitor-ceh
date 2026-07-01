const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- GLOBAL STATE & CACHE ---
let globalConnections = [];
let domIdMap = {};
let domIdCounter = 0;
let renderedHtmlCache = {};

let staticCache = {
    isLoaded: false,
    bomData: [],
    routesData: [],
    nomData: [],
    nomMap: {},
    routesByDetail: {},
    bomChildrenMap: {}
};

window.onload = async function() {
    if(new URLSearchParams(window.location.search).get('view') === 'machine') {
        document.body.classList.add('machine-view');
    }
    
    await initialFetch();
    loadData();
    setInterval(loadData, 30000); 
};

function getDomId(realId) {
    if (!domIdMap[realId]) {
        domIdCounter++;
        domIdMap[realId] = 'node_' + domIdCounter;
    }
    return domIdMap[realId];
}

function toggleHarmony(idStr) {
    const histEl = document.getElementById('hist_' + idStr);
    const btnEl = document.getElementById('toggle_' + idStr);
    if (histEl && btnEl) {
        if (histEl.classList.contains('hidden-history')) {
            histEl.classList.remove('hidden-history');
            btnEl.innerText = '▶';
            btnEl.style.color = '#60a5fa'; 
            btnEl.style.background = 'rgba(59,130,246,0.15)';
        } else {
            histEl.classList.add('hidden-history');
            btnEl.innerText = '◀';
            btnEl.style.color = '';
            btnEl.style.background = '';
        }
        setTimeout(() => drawArrows(), 50);
    }
}

function toggleTooltip(event, nodeId) {
    if (event) event.stopPropagation();
    const el = document.getElementById('tooltip_' + nodeId);
    if (el) {
        const isHidden = el.style.display === 'none' || el.style.display === '';
        document.querySelectorAll('.vsm-tooltip').forEach(t => t.style.display = 'none');
        el.style.display = isHidden ? 'block' : 'none';
    }
}

document.addEventListener('click', function() {
    document.querySelectorAll('.vsm-tooltip').forEach(t => t.style.display = 'none');
});

// --- DATA FETCHING ---
async function initialFetch() {
    const loader = document.getElementById('loading');
    if (loader) {
        loader.style.display = 'flex';
        const txt = loader.querySelector('div');
        if(txt) txt.innerText = "Зареждане на справочни данни... ⚙️";
    }
    
    try {
        const [bomRes, routesRes, nomRes] = await Promise.all([
            client.from('bom').select('*').limit(50000),
            client.from('marshruti').select('*').limit(50000),
            client.from('Номенклатура').select('*').limit(50000)
        ]);

        if (bomRes.error) throw bomRes.error;

        staticCache.bomData = bomRes.data || [];
        staticCache.routesData = routesRes.data || [];
        staticCache.nomData = nomRes.data || [];

        staticCache.nomData.forEach(n => {
            if (n['ID Детайл']) staticCache.nomMap[String(n['ID Детайл']).trim().toLowerCase()] = n;
        });

        staticCache.routesData.forEach(r => {
            let code = String(r['Код на детайла']).trim();
            if(!staticCache.routesByDetail[code]) staticCache.routesByDetail[code] = [];
            staticCache.routesByDetail[code].push(r);
        });

        Object.keys(staticCache.routesByDetail).forEach(code => {
            staticCache.routesByDetail[code].sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция']));
        });

        let bomDataSorted = staticCache.bomData.sort((a, b) => String(a['ID Компонент']).localeCompare(String(b['ID Компонент'])));
        bomDataSorted.forEach(b => {
            let p = String(b['ID Родител']).trim().toLowerCase();
            if(!staticCache.bomChildrenMap[p]) staticCache.bomChildrenMap[p] = [];
            staticCache.bomChildrenMap[p].push(b);
        });

        staticCache.isLoaded = true;
    } catch (err) {
        document.getElementById('error-box').innerText = "Грешка при зареждане на справочници: " + err.message;
    }
}

async function fetchDynamicData() {
    const [plansRes, reportsRes, skladRes] = await Promise.all([
        client.from('plan').select('*').eq('Статус', 'Активен').limit(5000),
        client.from('otcheti').select('*').limit(50000),
        client.from('sklad').select('*').limit(50000)
    ]);

    if (plansRes.error) throw plansRes.error;
    
    return {
        plansData: plansRes.data || [],
        reportsData: reportsRes.data || [],
        skladData: skladRes.data || []
    };
}

// --- MAIN PROCESS ---
async function loadData() {
    if (!staticCache.isLoaded) return;
    
    try {
        const dynamicData = await fetchDynamicData();
        
        if (dynamicData.plansData.length === 0) {
            document.getElementById('loading').style.display = 'none';
            return;
        }

        const { mergedNodes, connections, explicitPlanItems } = buildBOMTree(dynamicData.plansData, dynamicData.skladData);
        const masterData = categorizeParts(mergedNodes, dynamicData.reportsData, explicitPlanItems, connections);

        drawDashboard(JSON.stringify({ nodes: masterData, connections: connections }));

    } catch (err) {
        document.getElementById('error-box').innerText = "Грешка: " + err.message;
        document.getElementById('loading').style.display = 'none';
    }
}

function buildBOMTree(plansData, skladData) {
    plansData.sort((a, b) => a.id - b.id);

    let skladMap = {};
    skladData.forEach(s => {
        if (s['ID Детайл']) skladMap[String(s['ID Детайл']).trim().toLowerCase()] = parseFloat(s['Остатък']) || 0;
    });

    let planMap = {};
    let explicitPlanItems = new Set(); 
    let activeNodes = [];

    plansData.forEach(p => { 
        planMap[p.id] = p; 
        
        let originalPlanCode = String(p['Вътрешно име']).trim();
        let actualBomName = originalPlanCode;
        let displayName = originalPlanCode;
        let targetQty = parseFloat(p['Целево количество']) || 0;

        let translated = staticCache.nomData.find(n => String(n['Вътрешно име']).trim() === originalPlanCode);
        if (translated && translated['ID Детайл']) {
            actualBomName = String(translated['ID Детайл']).trim();
            if (originalPlanCode.toUpperCase() === actualBomName.toUpperCase()) {
                displayName = actualBomName;
            } else {
                displayName = `${originalPlanCode} - ${actualBomName}`; 
            }
        }

        explicitPlanItems.add(`${p.id}___${actualBomName.toUpperCase()}`);

        function traverseAndAdd(parentName, currentCode, requiredQty, isRootLevel) {
            let currentCodeLower = currentCode.toLowerCase();
            let nomEntry = staticCache.nomMap[currentCodeLower] || {};
            let children = staticCache.bomChildrenMap[currentCodeLower] || [];
            
            let isRawMaterial = (children.length === 0) && (!staticCache.routesByDetail[currentCode]);
            if (isRawMaterial && !isRootLevel) return;

            activeNodes.push({
                plan_id: p.id,
                code: currentCode,
                display_name: isRootLevel ? displayName : currentCode, 
                plan_qty: requiredQty,
                parent_code: parentName,
                ready_qty: skladMap[currentCodeLower] || 0,
                drawing_url: nomEntry['Линк към чертеж'] || '',
                part_type: nomEntry['Тип'] || ''
            });

            children.forEach(c => {
                let childName = String(c['ID Компонент']).trim();
                let multiplier = parseFloat(c['Количество']) || 1;
                traverseAndAdd(currentCode, childName, requiredQty * multiplier, false);
            });
        }

        traverseAndAdd('', actualBomName, targetQty, true);
    });
    
    let mergedNodes = {};
    let connections = [];

    activeNodes.forEach(row => {
        let pData = planMap[row.plan_id];
        let pMonthStr = pData ? `${pData['Месец']} ${pData['Година']}` : `ПЛАН ${row.plan_id}`;
        let codeStr = row.code ? String(row.code).trim() : "";
        
        let mergedId = pMonthStr + '___' + codeStr;

        if (!mergedNodes[mergedId]) {
            mergedNodes[mergedId] = {
                id: mergedId,
                planId: row.plan_id, 
                planMonth: pMonthStr,
                code: codeStr,
                displayName: row.display_name, 
                planQty: 0, 
                warehouseQty: row.ready_qty || 0,
                globalState: 'gray',
                operations: [],
                drawingUrl: row.drawing_url,
                partType: row.part_type ? String(row.part_type) : "",
                bucket: ""
            };
        }

        mergedNodes[mergedId].planQty += (parseFloat(row.plan_qty) || 0);

        if (row.parent_code) {
            let parentCodeStr = String(row.parent_code).trim();
            let parentMergedId = pMonthStr + '___' + parentCodeStr;
            
            if (!connections.find(c => c.from === mergedId && c.to === parentMergedId)) {
                connections.push({ from: mergedId, to: parentMergedId });
            }
        }
    });

    return { mergedNodes, connections, explicitPlanItems };
}

function categorizeParts(mergedNodes, reportsData, explicitPlanItems, connections) {
    let completedOps = {};
    let opStatusMap = {}; 
    
    // Performance optimization: compute timestamps once before sorting (O(N) instead of O(N log N))
    let sortedReports = reportsData.map(r => {
        r._ts = new Date(r['Време Старт'] || r['Дата']).getTime();
        return r;
    }).sort((a, b) => a._ts - b._ts);

    sortedReports.forEach(r => {
        let key = String(r['ID Детайл']).trim() + '_' + String(r['Операция']).trim();
        let qty = parseFloat(r['Количество']) || 0;
        
        if (r['Статус'] === 'Отчетено') {
            completedOps[key] = (completedOps[key] || 0) + qty;
            opStatusMap[key] = 'Отчетено';
        } else if (r['Статус'] !== 'Брак') {
            opStatusMap[key] = r['Статус']; 
        }
    });

    let masterData = {
        tiela: [], predni: [], zadni: [], mpr: [], statori: [], assembly: [],
        var11: [], var25: [], bearings: [],
        small_pins: [], small_studs: [], small_rotors: [], small_spools: [], small_others: [], temp_spools: []
    };

    Object.values(mergedNodes).forEach(n => {
        let partRoutes = staticCache.routesByDetail[n.code] || [];

        if (partRoutes.length > 0) {
            partRoutes.forEach(route => {
                let opName = String(route['Име на операция']).trim();
                let opKey = n.code + '_' + opName;
                
                let doneQty = completedOps[opKey] || 0;
                let latestStatus = opStatusMap[opKey];
                
                let opState = 'gray';
                if (doneQty >= n.planQty) opState = 'green';
                else if (doneQty > 0) opState = 'blue'; 
                else if (latestStatus === 'Започната') opState = 'blue_0'; 
                
                n.operations.push({ name: opName, completed: doneQty, state: opState });
            });
        } else {
            n.operations.push({ 
                name: n.warehouseQty >= n.planQty ? 'Готов (Склад)' : 'Чакащ (Доставка)', 
                completed: n.warehouseQty || 0,
                state: n.warehouseQty >= n.planQty ? 'green' : 'gray'
            });
        }

        let typeStr = (n.partType + " " + n.code).toLowerCase().replace(/[\s\.\-\_]+/g, '');
        
        let isDirectlyInPlan = explicitPlanItems.has(`${n.planId}___${n.code.toUpperCase()}`);
        let baseCode = n.code.toUpperCase().replace(/#+$/, '').trim();
        let isHashVariantOfPlan = n.code.includes('#') && explicitPlanItems.has(`${n.planId}___${baseCode}`);

        if (typeStr.includes("тяло") || typeStr.includes("тела")) n.bucket = 'tiela';
        else if (typeStr.includes("преден") || typeStr.includes("предни") || typeStr.includes("преденкапак")) n.bucket = 'predni';
        else if (typeStr.includes("заден") || typeStr.includes("задни") || typeStr.includes("заденкапак")) n.bucket = 'zadni';
        else if (typeStr.includes("мпр")) n.bucket = 'mpr';
        else if (typeStr.includes("пакет")) n.bucket = 'small_rotors';
        else if (typeStr.includes("статор") || typeStr.includes("трансформатор")) n.bucket = 'statori';
        else if (typeStr.includes("ротор") && typeStr.includes("11")) n.bucket = 'var11';
        else if (typeStr.includes("ротор") && typeStr.includes("25")) n.bucket = 'var25';
        else if (typeStr.includes("лагер")) n.bucket = 'bearings';
        else if (typeStr.includes("щифт")) n.bucket = 'small_pins';
        else if (typeStr.includes("шпилк")) n.bucket = 'small_studs';
        else if (typeStr.includes("макар") || n.code.toLowerCase().includes("мак.")) n.bucket = 'temp_spools';
        else if (isDirectlyInPlan || isHashVariantOfPlan || typeStr.includes("резолвер") || n.code.startsWith("575") || n.code.toUpperCase().startsWith("H25") || n.code.toUpperCase().startsWith("DC25")) {
            n.bucket = 'assembly';
        } 
        else {
            n.bucket = 'small_others';
        }
        
        masterData[n.bucket].push(n);
    });
    
    let parentMap = {};
    if (connections) {
        connections.forEach(c => parentMap[c.from] = c.to);
    }
    
    let spools = masterData['temp_spools'] || [];
    spools.forEach(n => {
        let currId = n.id;
        let finalBucket = 'small_others';
        while (parentMap[currId]) {
            currId = parentMap[currId];
            let pNode = mergedNodes[currId];
            if (pNode && pNode.bucket && pNode.bucket !== 'temp_spools') {
                finalBucket = pNode.bucket;
                break;
            }
        }
        n.bucket = finalBucket;
        masterData[finalBucket].push(n);
    });
    delete masterData['temp_spools'];
    
    return masterData;
}

// --- HELPER FUNCTIONS ---
function getBottomUpLevel(nodeId, childrenMap, calculatedLevels, visitedForLevel) {
    if (calculatedLevels[nodeId]) return calculatedLevels[nodeId];
    if (visitedForLevel.has(nodeId)) return 1; 
    visitedForLevel.add(nodeId);
    
    const children = childrenMap[nodeId];
    if (!children || children.length === 0) {
        calculatedLevels[nodeId] = 1;
        return 1;
    }
    
    let maxChildLevel = 0;
    children.forEach(childId => {
        const childLevel = getBottomUpLevel(childId, childrenMap, calculatedLevels, visitedForLevel);
        if (childLevel > maxChildLevel) maxChildLevel = childLevel;
    });
    calculatedLevels[nodeId] = maxChildLevel + 1; 
    return calculatedLevels[nodeId];
}

function calculateOperationStates(node, children, allNodesMap) {
    let allChildrenDone = true;
    let allChildrenHavePieces = true;
    let anyLocalChildLastOpStarted = false;

    if (children.length > 0) {
        allChildrenDone = children.every(cId => {
            let chNode = allNodesMap[cId];
            if(!chNode || !chNode.operations) return false;
            if(chNode.operations.length === 0) return true; 
            return chNode.operations.every(o => o.state === 'green');
        });

        allChildrenHavePieces = children.every(cId => {
            let chNode = allNodesMap[cId];
            if (!chNode) return false;
            if (!chNode.operations || chNode.operations.length === 0) return true; 
            let lastOp = chNode.operations[chNode.operations.length - 1]; 
            return lastOp.completed > 0 || lastOp.state === 'green';
        });

        anyLocalChildLastOpStarted = children.some(cId => {
            let chNode = allNodesMap[cId];
            if (!chNode || !chNode.operations || chNode.operations.length === 0) return false;
            if (chNode.bucket !== node.bucket) return false; 
            let lastOp = chNode.operations[chNode.operations.length - 1]; 
            return lastOp.state === 'blue' || lastOp.state === 'blue_0' || lastOp.completed > 0 || lastOp.state === 'green';
        });
    }

    let stateMachine = [];
    let hasActive = false;
    let len = (node.operations && node.operations.length > 0) ? node.operations.length : 0;
    
    for (let i = 0; i < len; i++) {
        let op = node.operations[i];
        let state = '';
        
        if (op.state === 'green' || op.completed >= node.planQty) {
            state = 'past';
        } else if (op.state === 'blue' || op.completed > 0) {
            state = 'active'; 
            hasActive = true;
        } else if (op.state === 'blue_0') {
            state = 'active_0'; 
            hasActive = true;
        } else {
            if (i === 0) {
                if (children.length === 0) {
                    state = 'waiting'; 
                } else {
                    if (allChildrenHavePieces) state = 'waiting'; 
                    else if (anyLocalChildLastOpStarted) state = 'future'; 
                    else state = 'hidden'; 
                }
            } else {
                let prev = stateMachine[i - 1];
                if (prev === 'past' || prev === 'active') {
                    state = 'waiting'; 
                } else if (prev === 'active_0') {
                    state = 'future'; 
                } else {
                    state = 'hidden'; 
                }
            }
        }
        stateMachine.push(state);
    }

    return { allChildrenDone, stateMachine, hasActive };
}

// --- RENDERING ---
function drawDashboard(jsonString) {
    if (!jsonString) return;
    const data = JSON.parse(jsonString);
    if (data.error) { document.getElementById('error-box').innerText = data.error; return; }

    document.getElementById('loading').style.display = 'none';
    globalConnections = data.connections || [];
    
    domIdMap = {};
    domIdCounter = 0;

    const allNodesMap = {};
    if (data.nodes) {
        Object.values(data.nodes).forEach(bucket => {
            if(Array.isArray(bucket)) bucket.forEach(n => allNodesMap[n.id] = n);
        });
    }
    
    const childMap = {}; 
    const parentMap = {};
    globalConnections.forEach(c => {
        if (!childMap[c.to]) childMap[c.to] = [];
        childMap[c.to].push(c.from);
        parentMap[c.from] = c.to;
    });

    const renderFamilyBOMBucket = (nodeArray, containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!nodeArray || !Array.isArray(nodeArray) || nodeArray.length === 0) {
            if (renderedHtmlCache[containerId] !== '') {
                container.innerHTML = '';
                renderedHtmlCache[containerId] = '';
            }
            return;
        }

        const plans = {};
        nodeArray.forEach(n => {
            if (!plans[n.planMonth]) plans[n.planMonth] = [];
            plans[n.planMonth].push(n);
        });
        
        let finalHTML = '';

        for (const [planMonth, nodes] of Object.entries(plans)) {
            const nodeIds = new Set(nodes.map(n => n.id));
            const adj = {};
            nodes.forEach(n => adj[n.id] = []);

            const localConns = globalConnections.filter(c => nodeIds.has(c.from) && nodeIds.has(c.to));
            localConns.forEach(c => {
                adj[c.from].push(c.to);
                adj[c.to].push(c.from); 
            });
            
            const visited = new Set();
            const families = [];

            nodes.forEach(n => {
                if (!visited.has(n.id)) {
                    const familyNodes = [];
                    const queue = [n.id];
                    visited.add(n.id);

                    while (queue.length > 0) {
                        const curr = queue.shift();
                        familyNodes.push(nodes.find(x => x.id === curr));
                        adj[curr].forEach(neighbor => {
                            if (!visited.has(neighbor)) {
                                visited.add(neighbor);
                                queue.push(neighbor);
                            }
                        });
                    }
                    families.push(familyNodes);
                }
            });
            
            let planHTML = `<div class="plan-group"><div class="plan-label">ПЛАН: ${planMonth}</div>`;

            families.forEach(famNodes => {
                const childrenMap = {};
                famNodes.forEach(n => childrenMap[n.id] = []);
                
                globalConnections.forEach(c => {
                    if (childrenMap.hasOwnProperty(c.from) && childrenMap.hasOwnProperty(c.to)) {
                        childrenMap[c.to].push(c.from); 
                    }
                });

                const calculatedLevels = {};
                const visitedForLevel = new Set(); 
                
                const levels = {};
                famNodes.forEach(fn => {
                    const lvl = getBottomUpLevel(fn.id, childrenMap, calculatedLevels, visitedForLevel);
                    if (!levels[lvl]) levels[lvl] = [];
                    levels[lvl].push(fn);
                });
                
                let familyHTML = `<div class="family-row">`;
                const sortedLevels = Object.keys(levels).map(Number).sort((a, b) => a - b);
                
                sortedLevels.forEach(lvl => {
                    let colHTML = `<div class="bom-column">`;
                    
                    levels[lvl].forEach(node => {
                        colHTML += generateNodeHTML(node, parentMap, childMap, allNodesMap);
                    });
                    colHTML += `</div>`;
                    familyHTML += colHTML;
                });
                familyHTML += `</div>`;
                planHTML += familyHTML;
            });
            planHTML += `</div>`;
            finalHTML += planHTML;
        }

        // DOM Rendering optimization: only update if changed
        if (renderedHtmlCache[containerId] !== finalHTML) {
            container.innerHTML = finalHTML;
            renderedHtmlCache[containerId] = finalHTML;
        }
    };

    renderFamilyBOMBucket(data.nodes.tiela || [], 'w-tiela');
    renderFamilyBOMBucket(data.nodes.predni || [], 'w-predni');
    renderFamilyBOMBucket(data.nodes.zadni || [], 'w-zadni');
    renderFamilyBOMBucket(data.nodes.mpr || [], 'w-mpr');
    
    renderFamilyBOMBucket(data.nodes.rotors_var11 || data.nodes.var11 || [], 'w-var11');
    renderFamilyBOMBucket(data.nodes.rotors_var25 || data.nodes.var25 || [], 'w-var25');
    renderFamilyBOMBucket(data.nodes.bearings || [], 'w-bearings');
    
    renderFamilyBOMBucket(data.nodes.small_pins || [], 'w-small-pins');
    renderFamilyBOMBucket(data.nodes.small_studs || [], 'w-small-studs');
    renderFamilyBOMBucket(data.nodes.small_rotors || [], 'w-small-rotors');
    renderFamilyBOMBucket(data.nodes.small_spools || [], 'w-small-spools'); 
    renderFamilyBOMBucket(data.nodes.small_others || [], 'w-small-others');
    
    renderFamilyBOMBucket(data.nodes.statori || [], 'w-statori');
    renderFamilyBOMBucket(data.nodes.assembly || [], 'w-assembly');

    const othersContainer = document.getElementById('w-small-others');
    if (othersContainer && othersContainer.innerHTML.trim() === '') {
        const parentDiv = othersContainer.parentElement;
        if(parentDiv && parentDiv.classList.contains('col-lane') === false) parentDiv.style.display = 'none';
    }

    setTimeout(() => {
        drawArrows();
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    }, 800);
}

function generateNodeHTML(node, parentMap, childMap, allNodesMap) {
    let dId = getDomId(node.id);

    const isRoot = !parentMap[node.id]; 
    const rootMarker = isRoot ? '<span style="margin-right:4px; color:#fb923c;" title="Краен Детайл (План)">🔸</span>' : '';
    
    let headerQty = 0;
    if (node.operations && node.operations.length > 0) {
        headerQty = node.operations[node.operations.length - 1].completed || 0;
    } else {
        headerQty = node.warehouseQty || 0; 
    }
    
    const drawingLinkHTML = (node.drawingUrl && node.drawingUrl.startsWith('http')) 
        ? `<a href="${node.drawingUrl}" target="_blank" style="text-decoration:none; margin-left:6px;" title="Отвори чертеж">📐</a>` : '';

    let opsHTML = '';
    let titleClass = 'title-gray';

    let children = childMap[node.id] || [];
    
    const { allChildrenDone, stateMachine, hasActive } = calculateOperationStates(node, children, allNodesMap);

    if (node.operations && node.operations.length > 0) {
        let len = node.operations.length;
        let allOpsDone = node.operations.every(o => o.state === 'green' || o.completed >= node.planQty);

        const formatPast = (op) => `<span class="op-text op-past">${op.name} | ${op.completed}/${node.planQty}</span>`;
        const formatFuture = (op) => `<span class="op-text op-future">${op.name} | 0/${node.planQty}</span>`;
        const formatActive = (op) => `<span class="op-text op-focus active">${op.name} | ${op.completed}/${node.planQty}</span>`;
        const formatWaiting = (op) => `<span class="op-text op-focus waiting">${op.name} | ${op.completed}/${node.planQty}</span>`;
        const formatFinishedAll = (op) => `<span class="op-text op-finished-all">${op.name} | ${op.completed}/${node.planQty}</span>`;

        if (allOpsDone) {
            titleClass = 'title-green';
            opsHTML = ''; // Completely hide operations to save screen space when the part is fully ready
        } else {
            if (hasActive) titleClass = 'title-blue';

            let pastHiddenArr = [];
            let visibleOpsHtml = '';
            let pastCount = stateMachine.filter(s => s === 'past').length;
            let currentPastIndex = 0;

            for (let i = 0; i < len; i++) {
                let op = node.operations[i];
                let state = stateMachine[i];

                if (state === 'past') {
                    currentPastIndex++;
                    if (currentPastIndex < pastCount) {
                        pastHiddenArr.push(formatPast(op)); 
                    } else {
                        if (visibleOpsHtml !== '') visibleOpsHtml += ' <span class="arr">➔</span> ';
                        visibleOpsHtml += formatPast(op); 
                    }
                } else if (state === 'active' || state === 'active_0') {
                    if (visibleOpsHtml !== '') visibleOpsHtml += ' <span class="arr">➔</span> ';
                    visibleOpsHtml += formatActive(op);
                } else if (state === 'waiting') {
                    if (visibleOpsHtml !== '') visibleOpsHtml += ' <span class="arr">➔</span> ';
                    visibleOpsHtml += formatWaiting(op);
                } else if (state === 'future') {
                    if (visibleOpsHtml === '') {
                        visibleOpsHtml += `<span class="op-text op-future"><span class="arr">➔</span> ${op.name} | 0/${node.planQty}</span>`;
                    } else {
                        visibleOpsHtml += ' <span class="arr">➔</span> ' + formatFuture(op);
                    }
                }
            }

            let opsHTMLContent = '';
            if(pastHiddenArr.length > 0) {
                opsHTMLContent += `<span class="harmony-toggle" onclick="toggleHarmony('past_${dId}')" id="btn_past_${dId}">⋯</span> `;
                opsHTMLContent += `<span id="hist_past_${dId}" class="hidden-history">${pastHiddenArr.join(' <span class="arr">➔</span> ')} <span class="arr">➔</span> </span>`;
            }
            
            opsHTMLContent += visibleOpsHtml;

            if (opsHTMLContent.trim() !== '') {
                opsHTML = `<div class="vsm-ops">${opsHTMLContent}</div>`;
            }
        }
    }
    
    if (children.length > 0 && allChildrenDone && isRoot && titleClass !== 'title-green') {
        titleClass = 'title-yellow'; 
    }

    return `
        <div class="vsm-node" id="card_${dId}">
        <div class="vsm-header">
            <span class="vsm-title ${titleClass}">${rootMarker}${node.displayName}${drawingLinkHTML}</span>
            <span class="vsm-qty">| ${headerQty}/${node.planQty}</span>
        </div>
        ${opsHTML !== '' ? opsHTML : ''}
        </div>
    `;
}

function drawArrows() {
    const svg = document.getElementById('svg-overlay');
    if (!svg) return;
    
    svg.style.height = document.documentElement.scrollHeight + "px";
    svg.style.width = document.documentElement.scrollWidth + "px";
    
    let html = `<defs>
        <marker id="arrow" viewBox="0 0 14 14" refX="10" refY="7" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 14 7 L 0 14 z" fill="#475569" /></marker>
        <marker id="arrow-spool" viewBox="0 0 14 14" refX="10" refY="7" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 14 7 L 0 14 z" fill="#818cf8" /></marker>
    </defs>`;
    
    globalConnections.forEach(conn => {
        let childDId = domIdMap[conn.from];
        let parentDId = domIdMap[conn.to];
        if (!childDId || !parentDId) return;

        const cardChild = document.getElementById(`card_${childDId}`);
        const cardParent = document.getElementById(`card_${parentDId}`);
        
        if (cardChild && cardParent) {
            const winChild = cardChild.closest('.window-body');
            const winParent = cardParent.closest('.window-body');
            if (winChild !== winParent) return;

            const sourceEl = cardChild.querySelector('.vsm-header');
            const targetEl = cardParent.querySelector('.vsm-title');

            if (sourceEl && targetEl) {
                const rs = sourceEl.getBoundingClientRect();
                const rt = targetEl.getBoundingClientRect();

                const startX = rs.right + window.scrollX + 4;
                const startY = rs.top + window.scrollY + (rs.height / 2);
                const endX = rt.left - 6 + window.scrollX;
                const endY = rt.top + window.scrollY + (rt.height / 2);
                
                const cpX = startX + (endX - startX) * 0.4;
                
                let fromLower = conn.from.toLowerCase();
                let isSpool = fromLower.includes("макар") || fromLower.includes("мак.");
                let strokeColor = isSpool ? "#818cf8" : "#475569";
                let markerId = isSpool ? "url(#arrow-spool)" : "url(#arrow)";
                
                html += `<path d="M ${startX} ${startY} C ${cpX} ${startY}, ${cpX} ${endY}, ${endX} ${endY}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-dasharray="3,3" marker-end="${markerId}" />`;
            }
        }
    });

    svg.innerHTML = html;
}

window.addEventListener('resize', () => requestAnimationFrame(drawArrows));
