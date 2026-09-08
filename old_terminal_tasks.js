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
          client.from('plan').select('*').in('Статус', ['Активен', 'Завършен', '📦 Опакован']).limit(100000), client.from('bom').select('*').limit(100000),
          client.from('marshruti').select('*').limit(100000), client.from('otcheti').select('*').order('Дата', {ascending: false}).limit(2000), 
          client.from('sklad').select('*').limit(100000), client.from('Номенклатура').select('*').limit(100000),
          client.from('sklad_bufferi').select('*').limit(100000),
          client.from('inventory_gp').select('*').limit(100000),
          client.from('inventory_wip').select('*').limit(100000)
      ]);

      if (plansRes.error) throw plansRes.error; if (bomRes.error) throw bomRes.error;
      if (routesRes.error) throw routesRes.error; if (reportsRes.error) throw reportsRes.error;
      if (gpRes.error) throw gpRes.error; if (wipRes.error) throw wipRes.error;

      if (gpRes.error) throw gpRes.error; if (wipRes.error) throw wipRes.error;

      globalNomData = nomRes.data || [];
      let namesMap = {}; if (nomRes.data) nomRes.data.forEach(n => { let code = String(n['ID Детайл']).trim().toLowerCase(); namesMap[code] = n['Вътрешно име'] || ''; });
      
      let bufferMap = {};
      let bufferScrapMap = {};
      
      if (nomRes.data) {
          nomRes.data.forEach(n => {
              let code = normalizeStr(n['ID Детайл']);
              let type = normalizeStr(n['Тип'] || '');
          });
      }

      if (bufferRes && bufferRes.data) {
          bufferRes.data.forEach(b => {
              let bKey = String(b['ID Детайл']).trim().toLowerCase();
              let bufVal = parseFloat(b['Буфер']) || 0;
              let scrapVal = parseFloat(b['% Брак']) || 0;
              if (bufVal > 0) bufferMap[bKey] = bufVal;
              if (scrapVal > 0) bufferScrapMap[bKey] = scrapVal;
          });
      }

      globalBomData = bomRes.data || []; 
      
      globalRoutesByDetail = {};
      routesRes.data.forEach(r => { let code = String(r['Код на детайла']).trim().toLowerCase(); if(!globalRoutesByDetail[code]) globalRoutesByDetail[code] = []; globalRoutesByDetail[code].push(r); });
      Object.keys(globalRoutesByDetail).forEach(code => globalRoutesByDetail[code].sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция'])));

      let takenOps = {}; 
      reportsRes.data.forEach(r => {
          let code = String(r['ID Детайл']).trim().toLowerCase();
          let op = String(r['Операция']).trim().toLowerCase();
          let key = code + '_' + op; 
          
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
      let groupEarliestId = {};
      let planNameToId = {};
      let groupTotalTargets = {};
      let groupScrapDetails = {};
      
      plansRes.data.forEach(plan => {
          if (String(plan['Статус']).trim() === 'Изпратен') return;
          let planId = String(plan.id).trim(); 
          let rootItem = String(plan['Вътрешно име']).trim(); 
          let targetQty = parseFloat(plan['Целево количество']) || 0;
          let monthYear = (plan['Месец'] && plan['Година']) ? (plan['Месец'] + ' ' + plan['Година']) : '';
          
          let groupKey = monthYear || planId; 
          
          if (!groupEarliestId[groupKey] || parseInt(planId) < groupEarliestId[groupKey]) {
              groupEarliestId[groupKey] = parseInt(planId);
              groupScrapDetails[groupKey] = plan['scrap_details']; // jsonb column
          }
          groupTotalTargets[groupKey] = (groupTotalTargets[groupKey] || 0) + targetQty;
          
          if (plan['Вътрешно име']) planNameToId[String(plan['Вътрешно име']).trim()] = planId;
          planNameToId[planId] = planId;
          
          planNames[groupKey] = monthYear ? monthYear : plan['Вътрешно име'];
          
          if (nomRes.data) {
              let translated = nomRes.data.find(n => String(n['Вътрешно име']).trim() === rootItem);
              if (translated && translated['ID Детайл']) rootItem = String(translated['ID Детайл']).trim();
          }
          rootItem = rootItem.toLowerCase();

          if(!planRoots[groupKey]) planRoots[groupKey] = {};
          planRoots[groupKey][rootItem] = (planRoots[groupKey][rootItem] || 0) + targetQty;
      });

      let physicalStock = {}; 
      if (gpRes.data) {
          gpRes.data.forEach(r => {
              let code = String(r['ID Детайл']).trim().toLowerCase();
              let routes = globalRoutesByDetail[code];
              if (routes && routes.length > 0) {
                  let lastOp = String(routes[routes.length - 1]['Име на операция']).trim().toLowerCase();
                  let key = code + '_' + lastOp;
                  physicalStock[key] = (physicalStock[key] || 0) + (parseFloat(r['Количество']) || 0);
              }
          });
      }
      if (wipRes.data) {
          wipRes.data.forEach(r => {
              let code = String(r['ID Детайл']).trim().toLowerCase();
              let op = String(r['Операция']).trim().toLowerCase();
              let key = code + '_' + op;
              physicalStock[key] = (physicalStock[key] || 0) + (parseFloat(r['Количество']) || 0);
          });
      }

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
      let depths = {};

      let globalPlanItems = new Set();
      Object.keys(planRoots).forEach(pId => {
          Object.keys(planRoots[pId]).forEach(root => globalPlanItems.add(root));
      });
      Object.keys(bufferMap).forEach(root => globalPlanItems.add(root));
      let planItemsAdded = true;
      while(planItemsAdded) {
          planItemsAdded = false;
          globalBomData.forEach(b => {
              let parent = String(b['ID Родител']).trim().toLowerCase();
              let child = String(b['ID Компонент']).trim().toLowerCase();
              if (globalPlanItems.has(parent) && !globalPlanItems.has(child)) {
                  globalPlanItems.add(child);
                  planItemsAdded = true;
              }
          });
      }

      globalTasks = [];

      let planIdsToProcess = Object.keys(planRoots).sort((a,b) => (groupEarliestId[a] || 0) - (groupEarliestId[b] || 0));
      planIdsToProcess.push('NONE');
      
      let scrapUpdatesToSave = {};

      planIdsToProcess.forEach(pId => {
          let isBuffer = pId === 'NONE';
          let deficitBom = {};
          let originalBom = {};
          
          let savedMap = null;
          let currentTargetTotal = groupTotalTargets[pId] || 0;
          
          if (!isBuffer) {
              if (groupScrapDetails[pId] && groupScrapDetails[pId].target === currentTargetTotal && groupScrapDetails[pId].map) {
                  savedMap = groupScrapDetails[pId].map;
              } else {
                  savedMap = {};
                  let earliestId = groupEarliestId[pId];
                  if (earliestId) {
                      scrapUpdatesToSave[earliestId] = { target: currentTargetTotal, map: savedMap };
                  }
              }
          }
          
          if (!isBuffer && planRoots[pId]) {
              Object.keys(planRoots[pId]).forEach(root => {
                  deficitBom[root] = (deficitBom[root] || 0) + planRoots[pId][root];
                  originalBom[root] = (originalBom[root] || 0) + planRoots[pId][root];
              });
          } else if (isBuffer) {
              Object.keys(bufferMap).forEach(root => {
                  deficitBom[root] = (deficitBom[root] || 0) + bufferMap[root];
                  originalBom[root] = (originalBom[root] || 0) + bufferMap[root];
              });
          }

          let allItemsSet = new Set(Object.keys(deficitBom));
          globalBomData.forEach(b => { allItemsSet.add(String(b['ID Родител']).trim().toLowerCase()); allItemsSet.add(String(b['ID Компонент']).trim().toLowerCase()); });
          if (isBuffer) Object.keys(bufferMap).forEach(code => allItemsSet.add(code));
          
          let allItemsArray = Array.from(allItemsSet);
          allItemsArray.forEach(item => getDepth(item));
          allItemsArray.sort((a, b) => (depths[a] || 0) - (depths[b] || 0));
          
          allItemsArray.forEach(code => {
              let currentOrigTarget = originalBom[code] || 0;
              let parentScrap = bufferScrapMap[code] || 0;
              
              if (currentOrigTarget > 0) {
                  let children = globalBomData.filter(b => String(b['ID Родител']).trim().toLowerCase() === code);
                  children.forEach(c => {
                      let cCode = String(c['ID Компонент']).trim().toLowerCase(); 
                      let multiplier = parseFloat(c['Количество']) || 1;
                      originalBom[cCode] = (originalBom[cCode] || 0) + (currentOrigTarget * multiplier);
                      
                      if (parentScrap > 0) {
                          bufferScrapMap[cCode] = Math.max(bufferScrapMap[cCode] || 0, parentScrap);
                      }
                  });
              }
          });

          allItemsArray.forEach((code, nodeIndex) => {
              let target = deficitBom[code] || 0;
              if (target <= 0) return;
              
              let currentTarget = target;
              let routes = globalRoutesByDetail[code] || []; 
              
              if (routes.length > 0) {
                  for (let i = routes.length - 1; i >= 0; i--) {
                  let route = routes[i];
                  let opName = String(route['Име на операция']).trim().toLowerCase();
                  let opKey = code + '_' + opName;
                  
                  let availableHere = physicalStock[opKey] || 0;
                  let taken = Math.min(currentTarget, availableHere);
                  if (taken > 0) {
                      physicalStock[opKey] -= taken;
                  }
                  
                  let shortage = currentTarget - taken;
                  
                  if (shortage > 0) {
                      let maxAllowed = Infinity;
                      let displayMaxAllowed = Infinity;
                      let hasLimit = false;
                      let blockingReasons = [];
                      
                      // 1. Check previous operation availability
                      if (i > 0) {
                          hasLimit = true;
                          let prevRoute = routes[i - 1]; 
                          let prevOpName = String(prevRoute['Име на операция']).trim().toLowerCase();
                          maxAllowed = physicalStock[code + '_' + prevOpName] || 0;
                          displayMaxAllowed = maxAllowed;
                          if (maxAllowed < shortage) blockingReasons.push(`Липсва наличност на предходна операция (${String(prevRoute['Име на операция']).trim()})`);
                      }

                      // 2. Check BOM availability for THIS specific operation
                      let isLastOp = (i === routes.length - 1);
                      let currentOpNum = parseInt(route['№ Операция']) || 0;
                      let children = globalBomData.filter(b => String(b['ID Родител']).trim().toLowerCase() === code);
                      
                      let relevantChildren = children.filter(c => {
                          let opNum = c['Влага се на Оп. №'] ? parseFloat(c['Влага се на Оп. №']) : 0;
                          if (opNum > 0) return opNum === currentOpNum;
                          return (i === 0);
                      });

                      if (relevantChildren.length > 0) {
                          hasLimit = true;
                          let minSets = Infinity;
                          let rawMinSets = Infinity;
                          relevantChildren.forEach(child => {
                              let cCode = String(child['ID Компонент']).trim().toLowerCase(); 
                              let multiplier = parseFloat(child['Количество']) || 1;
                              let childRoutes = globalRoutesByDetail[cCode] || [];
                              let wipAvail = 0;
                              let skladAvail = getSkladQty(cCode);
                              if (childRoutes.length > 0) {
                                  let lastChildOp = String(childRoutes[childRoutes.length - 1]['Име на операция']).trim().toLowerCase();
                                  wipAvail = physicalStock[cCode + '_' + lastChildOp] || 0;
                              }
                              let childAvail = wipAvail + skladAvail;
                              let sets = Math.floor(childAvail / multiplier);
                              if (sets < minSets) { minSets = sets; blockingReasons.push(`${cCode} (${childAvail} налични)`); }
                              if (sets < rawMinSets) rawMinSets = sets;
                          });
                          
                          if (rawMinSets < displayMaxAllowed) displayMaxAllowed = rawMinSets;
                          if (maxAllowed < shortage) {
                              if (!blockingReasons.includes(`Липсващи компоненти`)) blockingReasons.push(`Липсващи компоненти`);
                          }
                      }
                      
                      let itemsToFetch = [];
                      relevantChildren.forEach(child => {
                          let cCode = String(child['ID Компонент']).trim().toLowerCase();
                          let nomItem = globalNomData.find(n => String(n['ID Детайл']).trim().toLowerCase() === cCode);
                          let type = nomItem ? String(nomItem['Тип']).trim().toLowerCase() : '';
                          if (type !== 'материал' || i === 0) {
                              let qty = parseFloat(child['Количество']) || 1;
                              
                              let childRoutes = globalRoutesByDetail[cCode] || [];
                              let wipAvail = 0;
                              let skladAvail = getSkladQty(cCode);
                              let lastChildDropoff = '';
                              if (childRoutes.length > 0) {
                                  let lastOpObj = childRoutes[childRoutes.length - 1];
                                  wipAvail = physicalStock[cCode + '_' + String(lastOpObj['Име на операция']).trim().toLowerCase()] || 0;
                                  lastChildDropoff = String(lastOpObj['Инструкция за оставяне'] || '').trim();
                              }
                              
                              let locTexts = [];
                              if (wipAvail > 0) {
                                  locTexts.push(`${wipAvail}бр. ${lastChildDropoff ? 'в ' + lastChildDropoff : 'в Буфер'}`);
                              }
                              if (skladAvail > 0) {
                                  locTexts.push(`${skladAvail}бр. в Склад`);
                              }
                              if (locTexts.length === 0) locTexts.push(`0бр. налични`);
                              let loc = locTexts.join(' / ');
                              
                              itemsToFetch.push({ code: String(child['ID Компонент']).trim(), qty: qty, loc: loc, type: type });
                          }
                      });
                      
                      if (i === 0) {
                          let rootNom = globalNomData.find(n => String(n['ID Детайл']).trim().toLowerCase() === code);
                          if (rootNom && rootNom['ID Родител'] && String(rootNom['ID Родител']).trim() !== '') {
                              let parentCode = String(rootNom['ID Родител']).trim().toLowerCase();
                              if (!itemsToFetch.some(item => item.code.toLowerCase() === parentCode)) {
                                  let pNom = globalNomData.find(n => String(n['ID Детайл']).trim().toLowerCase() === parentCode);
                                  let loc = pNom ? String(pNom['Местоположение'] || '').trim() : '';
                                  itemsToFetch.push({ code: String(rootNom['ID Родител']).trim(), qty: parseFloat(rootNom['Разходна норма']) || 1, loc: loc, type: 'материал' });
                              }
                          }
                      }
                      
                      let isTaken = takenOps[opKey] === true;
                      if (maxAllowed < 0) maxAllowed = 0; 
                      let isBlocked = hasLimit && maxAllowed <= 0; 
                      let machineName = route['Машина'] || '';
                      
                      let matchMachine = false;
                      if (!currentMachine || currentMachine.trim() === "" || isTaken) {
                          matchMachine = true;
                      } else {
                          let selectedMachines = currentMachine.split(',').map(m => m.toLowerCase().trim()); 
                          matchMachine = selectedMachines.some(m => machineName.toLowerCase().includes(m));
                      }

                      if (matchMachine) {
                          blockingReasons = [...new Set(blockingReasons)];
                          let safeIdBase = (pId + '_' + code + '_n' + nodeIndex + '_op' + i).replace(/[^a-zA-Z0-9а-яА-Я_]/g, '_');
                          
                          let targetInput = shortage;
                          if (hasLimit && targetInput > maxAllowed) targetInput = maxAllowed;
                          if (targetInput <= 0 && !hasLimit) targetInput = 1;
                          if (targetInput <= 0 && isBlocked) targetInput = 0;
                          
                          let displayName = String(route['Код на детайла']).trim();
                          let displayOpName = String(route['Име на операция']).trim();
                          
                          let scrapAllowance = 0;
                          if (!isBuffer && i === 0 && bufferScrapMap[code] > 0) {
                              if (savedMap && savedMap[code] !== undefined) {
                                  scrapAllowance = savedMap[code];
                              } else {
                                  let baseQtyForScrap = shortage;
                                  scrapAllowance = Math.ceil(baseQtyForScrap * (bufferScrapMap[code] / 100));
                                  if (savedMap) savedMap[code] = scrapAllowance;
                              }
                              
                              if (!isBlocked && scrapAllowance > 0) {
                                  let desiredTotal = shortage + scrapAllowance;
                                  
                                  if (hasLimit) {
                                      displayMaxAllowed = Math.min(displayMaxAllowed, desiredTotal);
                                      maxAllowed = displayMaxAllowed; // ensure they match
                                  } else {
                                      displayMaxAllowed = desiredTotal;
                                      maxAllowed = desiredTotal;
                                      hasLimit = true;
                                  }
                                  
                                  targetInput = displayMaxAllowed;
                              }
                          }
                          
                          globalTasks.push({ 
                              id: safeIdBase + (isBuffer ? '_green' : '_blue'), 
                              plan_id: isBuffer ? null : pId, 
                              plan_name: isBuffer ? "БУФЕРИ" : (planNames[pId] || pId),
                              name: displayName, internalName: namesMap[code] || '', op: displayOpName, opNum: parseInt(route['№ Операция']) || 0, next_op: i < routes.length - 1 ? String(routes[i+1]['Име на операция']).trim() : "Готово", 
                              machine: machineName, drawing_link: route['Линк към чертеж'], sop_link: route['Линк към СОП'], desc: route['Описание'], 
                              type: i === routes.length - 1 ? "ЗЕЛЕНА" : "СИНЯ", 
                              dropoff: route['Инструкция за оставяне'],
                              defaultQty: targetInput, maxAllowed: displayMaxAllowed, realMaxAllowed: maxAllowed, hasLimit: hasLimit, isBlocked: isBlocked, blockingReasons: blockingReasons, 
                              totalNeed: shortage, pureQty: shortage, scrapAllowance: scrapAllowance,
                              totalDone: (originalBom[code] || 0) - shortage, totalScrapped: 0, isTaken: isTaken, isGreenCard: isBuffer,
                              globalGrossAtLoad: 0, globalScrapAtLoad: 0,
                              itemsToFetch: itemsToFetch
                          });
                      }
                  }
                  
                  currentTarget = shortage;
              }
              }
              
              if (currentTarget > 0) {
                  let children = globalBomData.filter(b => String(b['ID Родител']).trim().toLowerCase() === code);
                  children.forEach(c => {
                      let cCode = String(c['ID Компонент']).trim().toLowerCase(); 
                      let multiplier = parseFloat(c['Количество']) || 1;
                      deficitBom[cCode] = (deficitBom[cCode] || 0) + (currentTarget * multiplier);
                  });
              }
          });
      });
      
      // WIP SWEEP: Generate tasks for orphaned WIP (СВРЪХПРОИЗВОДСТВО)
      Object.keys(physicalStock).forEach(stockKey => {
          let leftover = physicalStock[stockKey];
          if (leftover > 0) {
              let lastUnderscore = stockKey.lastIndexOf('_');
              if (lastUnderscore !== -1) {
                  let code = stockKey.substring(0, lastUnderscore);
                  let currentOpName = stockKey.substring(lastUnderscore + 1);
                  
                  let routes = globalRoutesByDetail[code] || [];
                  if (routes.length > 0) {
                      let currentOpIndex = routes.findIndex(r => String(r['Име на операция']).trim().toLowerCase() === currentOpName);
                      
                      // 1. WIP Sweep: Generate task for the next operation if it's not the final step
                      if (currentOpIndex !== -1 && currentOpIndex < routes.length - 1) {
                          let nextOpIndex = currentOpIndex + 1;
                          let nextRoute = routes[nextOpIndex];
                          
                          let machineName = nextRoute['Машина'] || '';
                          let matchMachine = false;
                          
                          let takenOpsKey = code + '_' + String(nextRoute['Име на операция']).trim().toLowerCase();
                          let isTaken = takenOps[takenOpsKey] === true;
                          
                          if (!currentMachine || currentMachine.trim() === "" || isTaken) {
                              matchMachine = true;
                          } else {
                              let selectedMachines = currentMachine.split(',').map(m => m.toLowerCase().trim()); 
                              matchMachine = selectedMachines.some(m => machineName.toLowerCase().includes(m));
                          }
                          
                          if (matchMachine) {
                              let displayOpName = String(nextRoute['Име на операция']).trim();
                              let displayName = String(nextRoute['Код на детайла']).trim();
                              
                              let safeIdBase = ('WIP_' + code + '_op' + nextOpIndex).replace(/[^a-zA-Z0-9а-яА-Я_]/g, '_');
                              
                              globalTasks.push({ 
                                  id: safeIdBase + '_green', 
                                  plan_id: null, 
                                  plan_name: "СВРЪХПРОИЗВОДСТВО",
                                  name: displayName, internalName: namesMap[code] || '', op: displayOpName, opNum: parseInt(nextRoute['№ Операция']) || 0, 
                                  next_op: nextOpIndex < routes.length - 1 ? String(routes[nextOpIndex+1]['Име на операция']).trim() : "Готово", 
                                  machine: machineName, drawing_link: nextRoute['Линк към чертеж'], sop_link: nextRoute['Линк към СОП'], desc: nextRoute['Описание'], 
                                  type: nextOpIndex === routes.length - 1 ? "ЗЕЛЕНА" : "СИНЯ", 
                                  dropoff: nextRoute['Инструкция за оставяне'],
                                  defaultQty: leftover, maxAllowed: leftover, realMaxAllowed: leftover, hasLimit: true, isBlocked: false, blockingReasons: [], 
                                  totalNeed: leftover, pureQty: leftover, 
                                  totalDone: 0, totalScrapped: 0, isTaken: isTaken, isGreenCard: true,
                                  globalGrossAtLoad: 0, globalScrapAtLoad: 0,
                                  itemsToFetch: []
                              });
                          }
                      }
                  }
              }
          }
      });



      globalTasks.sort((a, b) => {
          let getWeight = (t) => {
              if (t.plan_name === "БУФЕРИ") return Infinity;
              if (t.plan_name === "СВРЪХПРОИЗВОДСТВО") return 9999999;
              return groupEarliestId[t.plan_id] || 0;
          };
          let aPlanWeight = getWeight(a);
          let bPlanWeight = getWeight(b);
          if (aPlanWeight !== bPlanWeight) return aPlanWeight - bPlanWeight;
          return a.opNum - b.opNum;
      });
      renderTasks(globalTasks);
  } catch (err) { console.error(err); document.getElementById('tasksContainer').innerHTML = '<div style="text-align:center; padding: 40px; color:#ef4444; font-weight:bold;">❌ Грешка:<br>' + err.message + '</div>'; }
}

function renderTasks(tasks) {
  var container = document.getElementById('tasksContainer');
  
  let visibleTasks = tasks;

  // Bulletproof safeguard for edge cases
  visibleTasks.forEach(t => {
      if (t.hasLimit && Number(t.maxAllowed) <= 0) {
          t.isBlocked = true;
          if (!t.blockingReasons) t.blockingReasons = [];
          if (t.blockingReasons.length === 0) t.blockingReasons.push('Наличност: 0');
      }
  });

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
    let labelHtml = t.isGreenCard ? `<span class="plan-label" style="color: #16a34a;">ЗЕЛЕНА КАРТА: ${t.plan_name}</span>` : `<span class="plan-label">ПЛАН: ${t.plan_name}</span>`;
    let badgeStyle = t.isGreenCard ? 'background-color:#16a34a;' : '';

    if (t.plan_name === "СВРЪХПРОИЗВОДСТВО") {
        borderStyle = 'border-left: 6px solid #7dd3fc;';
        labelHtml = `<span class="plan-label" style="color: #0284c7; font-weight: 900;">⚠️ ${t.plan_name}</span>`;
        badgeStyle = 'background-color:#bae6fd; color: #0c4a6e;';
    }

    let partCode = t.name; let internalNameHtml = t.internalName ? `<div class="detail-code">${t.internalName}</div>` : '';
    let linkHtml = t.drawing_link && t.drawing_link.startsWith('http') ? `<a href="${t.drawing_link}" target="_blank">${partCode} 🔗</a>` : partCode;
    var sopHtml = (t.sop_link && t.sop_link.startsWith('http')) ? `<a href="${t.sop_link}" target="_blank" style="display:inline-block; margin-bottom:12px; background:#f59e0b; color:white; padding:6px 12px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:12px;">📑 Отвори СОП</a>` : '';
    var descHtml = t.desc ? `<div style="background-color: #fef9c3; border-left: 4px solid #eab308; padding: 10px; margin-bottom: 12px; font-size: 13px; color: #854d0e; font-weight: 700; border-radius: 4px;">💡 ${t.desc}</div>` : '';
    var dropoffHtml = t.dropoff ? `<div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 10px; margin-bottom: 12px; font-size: 13px; color: #166534; font-weight: 700; border-radius: 4px;">📍 Остави на: ${t.dropoff}</div>` : '';
    
    var fetchHtml = '';
    if (t.itemsToFetch && t.itemsToFetch.length > 0) {
        let actualDefaultQty = t.defaultQty > 0 ? t.defaultQty : 1;
        fetchHtml += `<div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px; margin-bottom: 12px; font-size: 13px; color: #92400e; font-weight: 700; border-radius: 4px;">`;
        fetchHtml += `<div style="margin-bottom:5px;">🛒 <b>Вземи компоненти (за ${actualDefaultQty} бр.):</b></div>`;
        fetchHtml += `<ul style="margin: 0; padding-left: 20px;">`;
        t.itemsToFetch.forEach(item => {
            let locStr = item.loc ? ` (📍 ${item.loc})` : '';
            let totalNeeded = item.qty * actualDefaultQty;
            fetchHtml += `<li>${item.code} - ${totalNeeded} бр.${locStr}</li>`;
        });
        fetchHtml += `</ul></div>`;
    }
    
    var bomBadgeHtml = ''; var actionButtonHtml = ''; var inputMaxHtml = t.hasLimit ? `max="${t.maxAllowed}"` : '';
    
    let remainingQty = Math.max(0, t.pureQty);
    let displayNeedHtml = `<span class="qty-badge" style="${badgeStyle}">${remainingQty} бр.</span>`;
    if (t.scrapAllowance > 0) displayNeedHtml += `<span class="qty-badge" style="background-color: #bae6fd; color: #0369a1; border: 2px solid #7dd3fc; margin-left: 5px;">+${t.scrapAllowance} бр. (Брак)</span>`;

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
        <div class="route-flow"><span class="op-active">▶ ${t.op}</span><span class="route-arrow">➔</span><span class="op-pending">${t.next_op}</span></div>
        ${t.isBlocked ? bomBadgeHtml : ''}
        <div id="free_state_${t.id}" style="${freeStateStyle}">${actionButtonHtml}</div>
        <div id="focus_state_${t.id}" style="${focusStateStyle}">
          ${!t.isBlocked ? bomBadgeHtml : ''}
          ${sopHtml}
          ${fetchHtml}
          ${descHtml}
          ${dropoffHtml}
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 12px; margin-top: 5px; border: 2px solid #bae6fd;">
            <p style="color: #0369a1; font-weight: 900; text-align:center; margin-top:0; font-size: 1.1em;">🟢 В ПРОЦЕС НА РАБОТА</p>
            <div style="display:flex; justify-content:space-between; margin-bottom: 5px; font-size: 0.85em; font-weight:bold; color: #64748b;"><span>Готови до момента:</span><span>${t.totalDone} бр.</span></div>
            <input type="number" id="qty_${t.id}" min="1" value="" placeholder="${t.defaultQty}" ${inputMaxHtml} inputmode="numeric" style="margin-bottom:15px;">
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
