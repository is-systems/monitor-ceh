// packing-tasks.js - Опростена логика за Опаковане

async function loadTasks(isSilent = false) {
  isUserCheckedIn = await fetchUserCheckInStatus();
  
  if (!isUserCheckedIn) {
      document.getElementById('mainAppContent').style.display = 'none';
      document.getElementById('bigLoginScreen').style.display = 'flex';
      return; 
  }
  
  document.getElementById('bigLoginScreen').style.display = 'none';
  document.getElementById('mainAppContent').style.display = 'block';

  var container = document.getElementById('tasksContainer');
  if (!isSilent) container.innerHTML = '<div id="loadingMsg" style="text-align:center; padding: 40px; font-weight:bold; color:#64748b; font-size: 1.2em;">Търсене на задачи за опаковане... 🔄</div>';
  
  try {
      const [plansRes, routesRes, reportsRes, nomRes] = await Promise.all([
          client.from('plan').select('*').eq('Статус', 'Активен').limit(100000), 
          client.from('marshruti').select('*').limit(100000), 
          client.from('otcheti').select('*').order('Дата', {ascending: false}).limit(100000), 
          client.from('Номенклатура').select('*').limit(100000)
      ]);

      if (plansRes.error) throw plansRes.error;
      if (routesRes.error) throw routesRes.error; 
      if (reportsRes.error) throw reportsRes.error;

      let namesMap = {}; 
      if (nomRes.data) nomRes.data.forEach(n => { let code = String(n['ID Детайл']).trim().toLowerCase(); namesMap[code] = n['Вътрешно име'] || ''; });

      let globalRoutesByDetail = {};
      routesRes.data.forEach(r => { 
          let code = String(r['Код на детайла']).trim().toLowerCase(); 
          if(!globalRoutesByDetail[code]) globalRoutesByDetail[code] = []; 
          globalRoutesByDetail[code].push(r); 
      });
      Object.keys(globalRoutesByDetail).forEach(code => globalRoutesByDetail[code].sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция'])));

      let planRoots = {}; 
      let planNames = {};
      let planIdMap = {};

      plansRes.data.forEach(plan => {
          if (String(plan['Статус']).trim() === 'Изпратен') return;
          let planId = String(plan.id).trim(); 
          let rootItem = String(plan['Вътрешно име']).trim(); 
          let targetQty = parseFloat(plan['Целево количество']) || 0;
          let monthYear = (plan['Месец'] && plan['Година']) ? (plan['Месец'] + ' ' + plan['Година']) : '';
          
          let groupKey = monthYear || planId; 
          
          if (nomRes.data) {
              let translated = nomRes.data.find(n => String(n['Вътрешно име']).trim() === rootItem);
              if (translated && translated['ID Детайл']) rootItem = String(translated['ID Детайл']).trim();
          }
          rootItem = rootItem.toLowerCase();

          if(!planRoots[groupKey]) planRoots[groupKey] = {};
          planRoots[groupKey][rootItem] = (planRoots[groupKey][rootItem] || 0) + targetQty;
          planNames[groupKey] = monthYear ? monthYear : plan['Вътрешно име'];
          planIdMap[groupKey] = planId;
      });

      let completedFinalOps = {};
      let packagedQty = {};
      let explicitPlanPackagedQty = {};

      let sortedReports = reportsRes.data.map(r => {
          r._ts = new Date(r['Време Старт'] || r['Дата']).getTime();
          return r;
      }).sort((a,b) => a._ts - b._ts);

      sortedReports.forEach(r => {
          if (r['Статус'] !== 'Отчетено') return;

          let code = String(r['ID Детайл']).trim().toLowerCase();
          let op = String(r['Операция']).trim().toLowerCase();
          let rawPId = String(r['ID План'] || '').trim();
          let qty = parseFloat(r['Количество']) || 0;

          if (op.startsWith('опаковане')) {
              packagedQty[code] = (packagedQty[code] || 0) + qty;
              if (rawPId) {
                  let planKey = code + '_' + rawPId;
                  explicitPlanPackagedQty[planKey] = (explicitPlanPackagedQty[planKey] || 0) + qty;
              }
          } else {
              // Намираме последната операция за този детайл
              let routes = globalRoutesByDetail[code];
              if (routes && routes.length > 0) {
                  let lastOpName = String(routes[routes.length - 1]['Име на операция']).trim().toLowerCase();
                  if (op === lastOpName) {
                      completedFinalOps[code] = (completedFinalOps[code] || 0) + qty;
                  }
              }
          }
      });

      globalTasks = [];

      Object.keys(planRoots).forEach(groupKey => {
          Object.keys(planRoots[groupKey]).forEach(code => {
              let targetQty = planRoots[groupKey][code];
              
              let totalCompleted = completedFinalOps[code] || 0;
              let totalPackaged = packagedQty[code] || 0;
              
              let availableToPack = Math.max(0, totalCompleted - totalPackaged);
              
              if (availableToPack > 0) {
                  globalTasks.push({
                      id: 'pack_' + code + '_' + planIdMap[groupKey],
                      plan_id: planIdMap[groupKey],
                      plan_name: planNames[groupKey],
                      name: code.toUpperCase(),
                      internalName: namesMap[code] || '',
                      available: availableToPack,
                      target: targetQty
                  });
              }
          });
      });

      renderTasks(globalTasks);
  } catch (err) { 
      console.error(err); 
      document.getElementById('tasksContainer').innerHTML = '<div style="text-align:center; padding: 40px; color:#ef4444; font-weight:bold;">❌ Грешка:<br>' + err.message + '</div>'; 
  }
}

function renderTasks(tasks) {
  var container = document.getElementById('tasksContainer');
  if(tasks.length === 0) { 
      container.innerHTML = `<div style="text-align:center; padding: 40px; font-size:1.3em; color: #16a34a; font-weight: 900;">🎉 Няма детайли, чакащи опаковане!</div>`; 
      return; 
  }
  
  var html = '';
  tasks.forEach(function(t) {
    let borderStyle = 'border-left: 6px solid #f59e0b;';
    let labelHtml = `<span class="plan-label" style="background:#fef3c7; color:#d97706;">ПЛАН: ${t.plan_name}</span>`;
    let partCode = t.name; 
    let internalNameHtml = t.internalName ? `<div class="detail-code">${t.internalName}</div>` : '';
    
    html += `
      <div class="card" id="card_${t.id}" style="${borderStyle} margin-bottom: 20px;">
        <div class="task-header">${labelHtml}
            <div style="display:flex; gap: 6px;">
                <span class="qty-badge" style="background-color:#f59e0b;">Очакват: ${t.target} бр.</span>
            </div>
        </div>
        <div class="detail-info"><div class="internal-name">${partCode}</div>${internalNameHtml}</div>
        
        <div style="background-color: #dcfce7; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; color: #166534; font-weight: 800; text-align: center;">
            📦 Възможни за опаковане: ${t.available} бр.
        </div>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 12px; margin-top: 5px; border: 2px solid #bae6fd;">
            <p style="color: #0369a1; font-weight: 900; text-align:center; margin-top:0; font-size: 1.1em;">ДАННИ ЗА ОПАКОВКА</p>
            
            <label style="font-weight: bold; color: #475569; display: block; margin-bottom: 5px;">Кашон №</label>
            <input type="text" id="box_${t.id}" class="box-input" placeholder="Въведи номер на кашон">
            
            <label style="font-weight: bold; color: #475569; display: block; margin-bottom: 5px;">Брой детайли в кашона</label>
            <input type="number" id="qty_${t.id}" class="box-input" value="${t.available}" max="${t.available}" inputmode="numeric" style="margin-bottom:15px;">
            
            <button class="btn" id="btn_${t.id}" onclick="finishPackingTask('${t.id}', this)" style="background-color: #2563eb; width: 100%; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);">✅ ОТЧЕТИ ОПАКОВАНЕ</button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

function setTaskFilter(filterType) { 
    // За Опаковане не ни трябват филтри, но запазваме функцията, за да не гърми HTML-ът
    renderTasks(globalTasks); 
}
