let cachedBom = null;
let cachedRoutes = null;

async function openResolverTree(partCode) {
    document.getElementById('resolverTitle').innerText = partCode;
    document.getElementById('resolverContent').innerHTML = '<div style="text-align:center; padding: 20px;">Зареждане на структурата... ⏳</div>';
    document.getElementById('resolverModalBackdrop').style.display = 'flex';

    try {
        if (!cachedBom || !cachedRoutes) {
            const [bomRes, routesRes] = await Promise.all([
                client.from('bom').select('*').limit(50000),
                client.from('marshruti').select('*').limit(50000)
            ]);
            if (bomRes.error) throw bomRes.error;
            if (routesRes.error) throw routesRes.error;
            cachedBom = bomRes.data || [];
            cachedRoutes = routesRes.data || [];
        }

        const bomMap = {};
        cachedBom.forEach(b => {
            const parent = String(b['ID Родител']).trim().toUpperCase();
            if (!bomMap[parent]) bomMap[parent] = [];
            bomMap[parent].push({
                child: String(b['ID Компонент']).trim().toUpperCase(),
                qty: b['Количество'] || 1
            });
        });

        const routesMap = {};
        cachedRoutes.forEach(r => {
            const code = String(r['Код на детайла']).trim().toUpperCase();
            if (!routesMap[code]) routesMap[code] = [];
            routesMap[code].push(r);
        });

        Object.keys(routesMap).forEach(k => {
            routesMap[k].sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция']));
        });

        let html = '<ul class="tree-root">';
        html += renderNode(partCode.toUpperCase(), bomMap, routesMap, 1);
        html += '</ul>';

        document.getElementById('resolverContent').innerHTML = html;

    } catch (err) {
        document.getElementById('resolverContent').innerHTML = `<div style="color:red; text-align:center;">Грешка: ${err.message}</div>`;
    }
}

function renderNode(code, bomMap, routesMap, requiredQty) {
    let html = `<li>
        <div class="tree-node">
            <span class="tree-part">${code}</span> <span class="tree-qty">[x${requiredQty}]</span>
        </div>`;
    
    const ops = routesMap[code] || [];
    if (ops.length > 0) {
        html += `<div class="tree-ops">`;
        ops.forEach(op => {
            html += `<span class="op-badge">${op['№ Операция']}. ${op['Име на операция']} <small>(${op['Машина'] || 'Н/А'})</small></span>`;
        });
        html += `</div>`;
    }

    const children = bomMap[code] || [];
    if (children.length > 0) {
        html += `<ul>`;
        children.forEach(c => {
            html += renderNode(c.child, bomMap, routesMap, requiredQty * c.qty);
        });
        html += `</ul>`;
    }
    
    html += `</li>`;
    return html;
}
