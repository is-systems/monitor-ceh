function setTaskFilter(filterType) { currentTaskFilter = filterType; document.querySelectorAll('.t-filter-btn').forEach(btn => btn.classList.remove('active')); document.getElementById('filter_' + filterType).classList.add('active'); renderTasks(globalTasks); }

async function changeMachine(isInitial = false) {
    Swal.fire({ title: 'Зареждане...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data, error } = await client.from('marshruti').select('Машина').limit(100000); if (error) throw error;
        let uniqueMachines = []; if (data) data.forEach(r => { let m = r['Машина']; if (m && m.trim() !== "" && !uniqueMachines.includes(m.trim())) uniqueMachines.push(m.trim()); });
        uniqueMachines.sort(); 
        let checkboxHtml = '<div style="text-align:left; margin-top:15px; max-height: 300px; overflow-y: auto;"><div style="display: flex; gap: 10px; margin-bottom: 15px;"><button type="button" onclick="document.querySelectorAll(\'.machine-cb\').forEach(cb => cb.checked = true)" style="flex:1; padding:10px; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; border-radius:6px; font-weight:bold;">☑️ Всички</button><button type="button" onclick="document.querySelectorAll(\'.machine-cb\').forEach(cb => cb.checked = false)" style="flex:1; padding:10px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; border-radius:6px; font-weight:bold;">☐ Изчисти</button></div>';
        let currentSelections = currentMachine ? currentMachine.split(',') : [];
        uniqueMachines.forEach(m => { let isChecked = currentSelections.includes(m) ? 'checked' : ''; checkboxHtml += `<label style="display:flex; align-items:center; margin-bottom:10px; padding:12px; background:#f8fafc; border-radius:6px; border:1px solid #cbd5e1;"><input type="checkbox" class="machine-cb" value="${m}" ${isChecked} style="transform: scale(1.5); margin-right:15px;"><span style="font-weight:700;">${m}</span></label>`; });
        checkboxHtml += '</div>';
        Swal.close();
        const { isConfirmed } = await Swal.fire({ title: 'Работно място', html: checkboxHtml, showCancelButton: !isInitial, allowOutsideClick: !isInitial, confirmButtonText: 'Потвърди', confirmButtonColor: '#2563eb', preConfirm: () => { let selected = []; document.querySelectorAll('.machine-cb:checked').forEach(cb => selected.push(cb.value)); return selected; } });
        if (isConfirmed) {
            let finalSelection = []; document.querySelectorAll('.machine-cb:checked').forEach(cb => finalSelection.push(cb.value));
            currentMachine = finalSelection.join(','); localStorage.setItem('mes_machine', currentMachine);
            document.getElementById('uiMachineName').innerText = (finalSelection.length > 0) ? finalSelection.join(', ') : "ВСИЧКИ";
            loadTasks();
        }
    } catch (err) { Swal.fire('Gрешка', err.message, 'error'); }
}

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
  if (!isSilent) container.innerHTML = '<div id="loadingMsg" style="text-align:center; padding: 40px; font-weight:bold; color:#64748b; font-size: 1.2em;">Търсене на задачи... 🔄</div>';
  
  try {
      const [plansRes, bomRes, routesRes, reportsRes, skladRes, nomRes, bufferRes, gpRes, wipRes] = await Promise.all([
          client.from('plan').select('*').eq('Статус', 'Активен').limit(100000), client.from('bom').select('*').limit(100000),
          client.from('marshruti').select('*').limit(100000), client.from('otcheti').select('*').order('Дата', {ascending: false}).limit(2000), 
          client.from('sklad').select('*').limit(100000), client.from('Номенклатура').select('*').limit(100000),
          client.from('sklad_bufferi').select('*').limit(100000),
          client.from('computed_sklad_gp').select('*').limit(100000),
          client.from('computed_sklad_wip').select('*').limit(100000)
      ]);

      if (plansRes.error) throw plansRes.error; if (bomRes.error) throw bomRes.error;
      if (routesRes.error) throw routesRes.error; if (reportsRes.error) throw reportsRes.error;
      if (gpRes.error) throw gpRes.error; if (wipRes.error) throw wipRes.error;

      let namesMap = {}; if (nomRes.data) nomRes.data.forEach(n => { let code = String(n['ID Детайл']).trim().toLowerCase(); namesMap[code] = n['Вътрешно име'] || ''; });
      
      let bufferMap = {};
      if (bufferRes && bufferRes.data) {
          bufferRes.data.forEach(b => {
              let bKey = String(b['ID Детайл']).trim().toLowerCase();
              bufferMap[bKey] = parseFloat(b['Буфер']) || 0;
          });
      }

      globalBomData = bomRes.data || []; globalRoutesByDetail = {};
      routesRes.data.forEach(r => { let code = String(r['Код на детайла']).trim().toLowerCase(); if(!globalRoutesByDetail[code]) globalRoutesByDetail[code] = []; globalRoutesByDetail[code].push(r); });
      Object.keys(globalRoutesByDetail).forEach(code => globalRoutesByDetail[code].sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция'])));

      let takenOps = {}; 
      reportsRes.data.forEach(r => {
          let planIdStr = r['ID План'] ? String(r['ID План']).trim() : 'NONE';
          let code = String(r['ID Детайл']).trim().toLowerCase();
          let op = String(r['Операция']).trim().toLowerCase();
          let key = planIdStr + '_' + code + '_' + op; 
          
          if (r['Статус'] === 'Брак' || r['Статус'] === 'Отчетено' || r['Статус'] === 'Прекъсната') {
              if (String(r['Оператор']).trim() === currentOperator.trim() && takenOps[key] === undefined) takenOps[key] = false;
          }
          else if (r['Статус'] === 'Започната') {
              if (String(r['Оператор']).trim() === currentOperator.trim() && takenOps[key] === undefined) takenOps[key] = true;
          }
      });

      let skladData = skladRes.data || [];
      let getSkladQty = (code) => { let c = code.toLowerCase(); let item = skladData.find(s => String(s['ID Детайл']).trim().toLowerCase() === c); return item ? (parseFloat(item['Остатък']) || 0) : 0; };

      let planRoots = {}; 
      let planNames = {};
      plansRes.data.forEach(plan => {
          if (String(plan['Статус']).trim() === 'Изпратен') return;
          let planId = String(plan.id).trim(); 
          let rootItem = String(plan['Вътрешно име']).trim(); 
          let targetQty = parseFloat(plan['Целево количество']) || 0;
          let monthYear = (plan['Месец'] && plan['Година']) ? (plan['Месец'] + ' ' + plan['Година']) : '';
          planNames[planId] = monthYear ? `${monthYear} (${plan['Вътрешно име']})` : plan['Вътрешно име'];
          
          if (nomRes.data) {
              let translated = nomRes.data.find(n => String(n['Вътрешно име']).trim() === rootItem);
              if (translated && translated['ID Детайл']) rootItem = String(translated['ID Детайл']).trim();
          }
          rootItem = rootItem.toLowerCase();

          if(!planRoots[planId]) planRoots[planId] = {};
          planRoots[planId][rootItem] = (planRoots[planId][rootItem] || 0) + targetQty;
      });

      let completedOps = {};
      let scrappedOps = {};
      let grossCompletedOps = {};

      let sortedReports = reportsRes.data.map(r => {
          r._ts = new Date(r['Време Старт'] || r['Дата']).getTime();
          return r;
      }).sort((a,b) => a._ts - b._ts);

      sortedReports.forEach(r => {
          let code = String(r['ID Детайл']).trim().toLowerCase();
          let op = String(r['Операция']).trim().toLowerCase();
          let key = code + '_' + op;
          let qty = parseFloat(r['Количество']) || 0;
          
          if (r['Статус'] === 'Брак') { scrappedOps[key] = (scrappedOps[key]||0) + qty; } 
          else if (r['Статус'] === 'Отчетено') { 
              completedOps[key] = (completedOps[key]||0) + qty; 
              if (r['Оператор'] !== 'СИСТЕМА (Експедиция)' && !(r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty < 0)) { 
                  grossCompletedOps[key] = (grossCompletedOps[key] || 0) + qty; 
              }
          }
      });

      let trueDoneOps = {}; let grossTrueDoneOps = {}; let shippedQty = {};
      
      Object.keys(globalRoutesByDetail).forEach(code => {
          let routes = globalRoutesByDetail[code]; if(routes.length===0) return;
          let lastOpKey = code + '_' + String(routes[routes.length-1]['Име на операция']).trim().toLowerCase();
          trueDoneOps[lastOpKey] = completedOps[lastOpKey]||0;
          grossTrueDoneOps[lastOpKey] = grossCompletedOps[lastOpKey]||0;
          for (let i = routes.length-2; i >= 0; i--) {
              let opKey = code + '_' + String(routes[i]['Име на операция']).trim().toLowerCase();
              let nextOpKey = code + '_' + String(routes[i+1]['Име на операция']).trim().toLowerCase();
              trueDoneOps[opKey] = Math.max(completedOps[opKey]||0, (grossTrueDoneOps[nextOpKey]||0) + (scrappedOps[nextOpKey]||0));
              grossTrueDoneOps[opKey] = Math.max(grossCompletedOps[opKey]||0, (grossTrueDoneOps[nextOpKey]||0) + (scrappedOps[nextOpKey]||0));
          }
          shippedQty[code] = Math.max(0, (grossTrueDoneOps[lastOpKey]||0) - (trueDoneOps[lastOpKey]||0));
      });

      let totalShippedCache = {};
      function getTotalShipped(pId, item, visited = new Set()) {
          let lc = item.toLowerCase();
          let cacheKey = pId + '_' + lc;
          if (totalShippedCache[cacheKey] !== undefined) return totalShippedCache[cacheKey];
          if (visited.has(lc)) return 0;
          visited.add(lc);
          
          let directShipped = shippedQty[lc] || 0;
          let parents = globalBomData.filter(b => String(b['ID Компонент']).trim().toLowerCase() === lc);
          let indirectShipped = 0;
          parents.forEach(p => {
              let parentCode = String(p['ID Родител']).trim().toLowerCase();
              if (parentCode !== lc) {
                  indirectShipped += getTotalShipped(pId, parentCode, new Set(visited)) * (parseFloat(p['Количество']) || 1);
              }
          });
          
          totalShippedCache[cacheKey] = directShipped + indirectShipped;
          return totalShippedCache[cacheKey];
      }

      let depths = {};
      let getDepth = (item, visited = new Set()) => {
          if (depths[item] !== undefined) return depths[item];
          if (visited.has(item)) return 0; 
          visited.add(item);
          let parents = globalBomData.filter(b => String(b['ID Компонент']).trim().toLowerCase() === item);
          if (parents.length === 0) { depths[item] = 0; return 0; }
          let maxP = -1;
          parents.forEach(p => {
              let pCode = String(p['ID Родител']).trim().toLowerCase();
              if (pCode !== item) { let d = getDepth(pCode, new Set(visited)); if (d > maxP) maxP = d; }
          });
          depths[item] = maxP + 1; return depths[item];
      };

      globalTasks = [];

      let planIdsToProcess = Object.keys(planRoots).sort((a,b) => parseInt(a) - parseInt(b));
      planIdsToProcess.push('NONE');
      
      let alreadyAllocated = {};
      
      planIdsToProcess.forEach(pId => {
          let isBuffer = pId === 'NONE';
          let deficitBom = {};
          
          if (!isBuffer && planRoots[pId]) {
              Object.keys(planRoots[pId]).forEach(root => {
                  deficitBom[root] = (deficitBom[root] || 0) + planRoots[pId][root];
              });
          }

          let allItemsSet = new Set(Object.keys(deficitBom));
          globalBomData.forEach(b => { allItemsSet.add(String(b['ID Родител']).trim().toLowerCase()); allItemsSet.add(String(b['ID Компонент']).trim().toLowerCase()); });
          if (isBuffer) {
              Object.keys(bufferMap).forEach(code => allItemsSet.add(code));
          }
          
          let allItemsArray = Array.from(allItemsSet);
          allItemsArray.forEach(item => getDepth(item));
          allItemsArray.sort((a, b) => (depths[a] || 0) - (depths[b] || 0));

          let blueTargets = {};
          allItemsArray.forEach(item => {
              if (isBuffer) return;
              let target = deficitBom[item] || 0;
              blueTargets[item] = target; 
              let deficit = target;
              if (deficit > 0) {
                  let children = globalBomData.filter(b => String(b['ID Родител']).trim().toLowerCase() === item);
                  children.forEach(c => {
                      let childName = String(c['ID Компонент']).trim().toLowerCase(); 
                      let multiplier = parseFloat(c['Количество']) || 1;
                      deficitBom[childName] = (deficitBom[childName] || 0) + (deficit * multiplier);
                  });
              }
          });

          allItemsArray.forEach((code, nodeIndex) => {
              let routes = globalRoutesByDetail[code] || []; 
              if(routes.length === 0) return;
              
              let blueTarget = isBuffer ? 0 : (blueTargets[code] || 0);
              let greenTarget = isBuffer ? (bufferMap[code] || 0) : 0;
              let opBlueTarget = blueTarget;
              let opGreenTarget = greenTarget;

              if (opBlueTarget <= 0 && opGreenTarget <= 0) return;
              
              let consumedByShipped = getTotalShipped(code);

              routes.forEach((route, idx) => {
                  let displayOpName = String(route['Име на операция']).trim();
                  let opName = displayOpName.toLowerCase(); 
                  let opKey = code + '_' + opName;
                  let displayName = String(route['Код на детайла']).trim();
                  
                  let globalGross = grossTrueDoneOps[opKey] || 0;
                  let globalNet = Math.max(0, globalGross - consumedByShipped);
                  
                  let usedSoFar = alreadyAllocated[opKey] || 0;
                  let availableForThisPlan = Math.max(0, globalNet - usedSoFar);
                  
                  let planTarget = Math.max(opBlueTarget, opGreenTarget);
                  let doneQty = Math.min(planTarget, availableForThisPlan);
                  
                  alreadyAllocated[opKey] = usedSoFar + doneQty;
                  
                  if (isBuffer) {
                      if (doneQty >= opGreenTarget) return;
                  } else {
                      if (doneQty >= opBlueTarget) return;
                  }
                  
                  let maxAllowed = 0; let hasLimit = true; let blockingReasons = []; 
                  if (idx > 0) {
                      let prevRoute = routes[idx - 1]; 
                      let prevOpName = String(prevRoute['Име на операция']).trim().toLowerCase();
                      let prevOpKey = pId + '_' + code + '_' + prevOpName;
                      let prevDoneQty = Math.max(0, (grossTrueDoneOps[prevOpKey] || 0) - consumedByShipped);
                      maxAllowed = Math.max(0, prevDoneQty - doneQty);
                      if (maxAllowed <= 0) blockingReasons.push(`Оп. ${prevOpName} (няма завършени)`);
                  } else {
                      let children = globalBomData.filter(b => String(b['ID Родител']).trim().toLowerCase() === code);
                      if (children.length === 0) { hasLimit = false; maxAllowed = Infinity; } 
                      else {
                          let minSets = Infinity;
                          children.forEach(child => {
                              let cCode = String(child['ID Компонент']).trim().toLowerCase(); 
                              let multiplier = parseFloat(child['Количество']) || 1;
                              let isPurchased = !(globalRoutesByDetail[cCode] && globalRoutesByDetail[cCode].length > 0);
                              let cFree = 0;
                              if (isPurchased) {
                                  cFree = getSkladQty(cCode);
                              } else {
                                  let childRoutes = globalRoutesByDetail[cCode];
                                  if (childRoutes && childRoutes.length > 0) {
                                      let childLastOpKey = pId + '_' + cCode + '_' + String(childRoutes[childRoutes.length-1]['Име на операция']).trim().toLowerCase();
                                      let childGrossDone = grossTrueDoneOps[childLastOpKey] || 0;
                                      let childConsumed = getTotalShipped(pId, cCode);
                                      cFree = Math.max(0, childGrossDone - childConsumed);
                                  }
                              }
                              let sets = Math.floor(cFree / multiplier);
                              if (sets < minSets) { minSets = sets; blockingReasons.push(`${cCode} (${cFree} налични)`); }
                          });
                          maxAllowed = minSets;
                          if (maxAllowed === Infinity) { hasLimit = false; } 
                          if (maxAllowed <= 0 && blockingReasons.length > 0) blockingReasons.push(`Липсващи компоненти`);
                      }
                  }

                  if (maxAllowed < 0) maxAllowed = 0; let isBlocked = hasLimit && maxAllowed <= 0; let machineName = route['Машина'] || '';
                  if (currentMachine && currentMachine.trim() !== "") { let selectedMachines = currentMachine.split(',').map(m => m.toLowerCase().trim()); let match = selectedMachines.some(m => machineName.toLowerCase().includes(m)); if (!match) return; }

                  blockingReasons = [...new Set(blockingReasons)];
                  let isTaken = takenOps[opKey] === true;
                  let safeIdBase = (pId + '_' + code + '_n' + nodeIndex + '_op' + idx).replace(/[^a-zA-Z0-9а-яА-Я_]/g, '_');
                  let deficit = isBuffer ? Math.max(0, opGreenTarget - doneQty) : Math.max(0, opBlueTarget - doneQty);
                  
                  if (deficit > 0) {
                      let targetInput = deficit;
                      if (hasLimit && targetInput > maxAllowed) targetInput = maxAllowed;
                      if (targetInput <= 0 && !hasLimit) targetInput = 1;
                      if (targetInput <= 0 && isBlocked) targetInput = 0;
                      
                      globalTasks.push({ 
                          id: safeIdBase + (isBuffer ? '_green' : '_blue'), 
                          plan_id: isBuffer ? null : pId, 
                          plan_name: isBuffer ? "БУФЕРИ" : (planNames[pId] || pId),
                          name: displayName, internalName: namesMap[code] || '', op: displayOpName, opNum: parseInt(route['№ Операция']) || 0, next_op: idx < routes.length - 1 ? String(routes[idx+1]['Име на операция']).trim() : "Готово", 
                          machine: machineName, drawing_link: route['Линк към чертеж'], sop_link: route['Линк към СОП'], desc: route['Описание'], 
                          type: idx === routes.length - 1 ? "ЗЕЛЕНА" : "СИНЯ", 
                          defaultQty: targetInput, maxAllowed: maxAllowed, hasLimit: hasLimit, isBlocked: isBlocked, blockingReasons: blockingReasons, 
                          totalNeed: isBuffer ? opGreenTarget : opBlueTarget, pureQty: isBuffer ? opGreenTarget : opBlueTarget, 
                          totalDone: doneQty, totalScrapped: 0, isTaken: isTaken, isGreenCard: isBuffer 
                      });
                  }
              });
          });
      });
      
      globalTasks.sort((a, b) => a.opNum - b.opNum); renderTasks(globalTasks);
  } catch (err) { console.error(err); document.getElementById('tasksContainer').innerHTML = '<div style="text-align:center; padding: 40px; color:#ef4444; font-weight:bold;">❌ Грешка:<br>' + err.message + '</div>'; }
}

function renderTasks(tasks) {
  var container = document.getElementById('tasksContainer');
  
  // Filter Green Cards if there are any Blue Cards for the current machine
  let hasBlueCards = tasks.some(t => !t.isGreenCard);
  let visibleTasks = tasks;
  if (hasBlueCards) {
      visibleTasks = tasks.filter(t => !t.isGreenCard);
  }

  let filteredTasks = visibleTasks;
  if (currentTaskFilter === 'ready') filteredTasks = visibleTasks.filter(t => !t.isBlocked);
  else if (currentTaskFilter === 'taken') filteredTasks = visibleTasks.filter(t => t.isTaken);

  if(filteredTasks.length === 0) { 
      let msg = currentTaskFilter === 'all' ? '🎉 Всички задачи са изпълнени!' : 'Няма задачи в тази категория.';
      container.innerHTML = `<div style="text-align:center; padding: 40px; font-size:1.3em; color: #16a34a; font-weight: 900;">${msg}</div>`; 
      return; 
  }
  
  var html = '';
  filteredTasks.forEach(function(t) {
    let borderStyle = t.isGreenCard ? 'border-left: 6px solid #16a34a;' : 'border-left: 6px solid #3b82f6;';
    let labelHtml = t.isGreenCard ? `<span class="plan-label" style="color: #16a34a;">БУФЕР: Склад</span>` : `<span class="plan-label">ПЛАН: ${t.plan_name}</span>`;
    let partCode = t.name; let internalNameHtml = t.internalName ? `<div class="detail-code">${t.internalName}</div>` : '';
    let linkHtml = t.drawing_link && t.drawing_link.startsWith('http') ? `<a href="${t.drawing_link}" target="_blank">${partCode} 🔗</a>` : partCode;
    var sopHtml = (t.sop_link && t.sop_link.startsWith('http')) ? `<a href="${t.sop_link}" target="_blank" style="display:inline-block; margin-bottom:12px; background:#f59e0b; color:white; padding:6px 12px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:12px;">📑 Отвори СОП</a>` : '';
    var descHtml = t.desc ? `<div style="background-color: #fef9c3; border-left: 4px solid #eab308; padding: 10px; margin-bottom: 12px; font-size: 13px; color: #854d0e; font-weight: 700; border-radius: 4px;">💡 ${t.desc}</div>` : '';
    var bomBadgeHtml = ''; var actionButtonHtml = ''; var inputMaxHtml = t.hasLimit ? `max="${t.maxAllowed}"` : '';
    
    let remainingQty = Math.max(0, t.pureQty - t.totalDone);
    let displayNeedHtml = `<span class="qty-badge" style="${t.isGreenCard ? 'background-color:#16a34a;' : ''}">${remainingQty} бр.</span>`;

    if (t.isBlocked) {
        let reasonsText = t.blockingReasons.length > 0 ? t.blockingReasons.join(', ') : "Предходни детайли";
        bomBadgeHtml = `<div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; color: #991b1b; font-weight: 700; text-align: center;">🚫 Липсва: ${reasonsText}</div>`;
        actionButtonHtml = `<button disabled style="background-color: #94a3b8; color: white; width: 100%; padding: 16px; font-size: 1.15em; font-weight: 800; border: none; border-radius: 10px;">🛑 БЛОКИРАНА ЗАДАЧА</button>`;
    } else if (t.hasLimit) {
        bomBadgeHtml = `<div style="background-color: #dcfce7; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; color: #166534; font-weight: 800; text-align: center;">📦 Възможни: ${t.maxAllowed} бр.</div>`;
        actionButtonHtml = `<button onclick="claimCurrentTaskDOM('${t.id}')" style="background-color: #2563eb; color: white; width: 100%; padding: 16px; font-size: 1.15em; font-weight: 800; border: none; border-radius: 10px; cursor:pointer; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">🚀 ПОЕМИ ЗАДАЧА</button>`;
    } else {
        bomBadgeHtml = `<div style="background-color: #e0e7ff; border: 1px solid #c7d2fe; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; color: #3730a3; font-weight: 800; text-align: center;">⚡ Първа стъпка (свободно производство)</div>`;
        actionButtonHtml = `<button onclick="claimCurrentTaskDOM('${t.id}')" style="background-color: #2563eb; color: white; width: 100%; padding: 16px; font-size: 1.15em; font-weight: 800; border: none; border-radius: 10px; cursor:pointer; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">🚀 ПОЕМИ ЗАДАЧА</button>`;
    }

    let isFocused = t.isTaken || (typeof activeTaskId !== 'undefined' && t.id === activeTaskId);
    let freeStateStyle = isFocused ? 'display: none;' : 'display: block;';
    let focusStateStyle = isFocused ? 'display: block;' : 'display: none;';

    html += `
      <div class="card" id="card_${t.id}" style="${borderStyle}">
        <div class="task-header">${labelHtml}<div style="display:flex; gap: 6px;">${displayNeedHtml}</div></div>
        <div class="detail-info"><div class="internal-name">${linkHtml}</div>${internalNameHtml}</div>
        ${sopHtml} ${descHtml}
        <div class="route-flow"><span class="op-active">▶ ${t.op}</span><span class="route-arrow">➔</span><span class="op-pending">${t.next_op}</span></div>
        ${bomBadgeHtml}
        <div id="free_state_${t.id}" style="${freeStateStyle}">${actionButtonHtml}</div>
        <div id="focus_state_${t.id}" style="${focusStateStyle}">
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 12px; margin-top: 5px; border: 2px solid #bae6fd;">
            <p style="color: #0369a1; font-weight: 900; text-align:center; margin-top:0; font-size: 1.1em;">🟢 В ПРОЦЕС НА РАБОТА</p>
            <div style="display:flex; justify-content:space-between; margin-bottom: 5px; font-size: 0.85em; font-weight:bold; color: #64748b;"><span>Готови до момента:</span><span>${t.totalDone} бр.</span></div>
            <input type="number" id="qty_${t.id}" value="" placeholder="${t.defaultQty}" ${inputMaxHtml} inputmode="numeric" style="margin-bottom:15px;">
            <div style="display: flex; gap: 10px;">
              <button class="btn" id="btn_${t.id}" onclick="finishTask('${t.id}', this)">✅ ОТЧЕТИ</button>
              <button class="btn-danger" id="btn_scrap_${t.id}" onclick="reportScrap('${t.id}', this)">БРАК</button>
            </div>
            <button onclick="pauseTaskDOM('${t.id}')" style="background: white; color: #475569; border: 2px solid #cbd5e1; padding: 14px; border-radius: 8px; font-weight: 800; width: 100%; margin-top: 15px; cursor: pointer;">📋 ВРЪЩАНЕ НАЗАД</button>
          </div>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}
