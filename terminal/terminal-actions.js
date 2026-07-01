function updateHistoryUI() {
  var list = document.getElementById('historyList');
  if (localHistoryData.length === 0) { list.innerHTML = '<li class="history-item" style="color:#94a3b8; text-align:center;">Няма скорошни действия</li>'; return; }
  var html = '';
  localHistoryData.forEach(item => { var color = item.type === 'БРАК' ? '#e74c3c' : '#16a34a'; html += `<li class="history-item"><span class="history-time">${item.time}</span><span><span style="color:${color}; font-weight:bold;">${item.qty} бр.</span> ${item.name}</span></li>`; });
  list.innerHTML = html;
}

function toggleHistory() { 
    var panel = document.getElementById('historyPanel'); 
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none'; 
    if(panel.style.display === 'block') document.getElementById('messagesPanel').style.display = 'none';
}

async function toggleMessages() {
    var panel = document.getElementById('messagesPanel');
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'block';
        document.getElementById('historyPanel').style.display = 'none';
        await fetchMessages();
    } else {
        panel.style.display = 'none';
    }
}

function addLogToHistory(type, qty, taskId) {
   var now = new Date(); var timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
   let taskData = globalTasks.find(t => t.id === taskId); var name = taskData ? (taskData.name) : 'Детайл';
   localHistoryData.unshift({ time: timeStr, type: type, qty: qty, name: name }); if (localHistoryData.length > 6) localHistoryData.pop(); updateHistoryUI();
}

function claimCurrentTaskDOM(taskId) {
  if (navigator.vibrate) navigator.vibrate(50); activeTaskId = taskId; 
  document.querySelectorAll('.card').forEach(c => { if (c.id !== 'card_' + taskId) c.style.display = 'none'; });
  document.getElementById('free_state_' + taskId).style.display = 'none'; document.getElementById('focus_state_' + taskId).style.display = 'block';
  window['startTime_' + taskId] = new Date().toISOString(); window.scrollTo(0,0);

  let taskData = globalTasks.find(t => t.id === taskId);
  if (taskData) {
      client.from('otcheti').insert([{ 
          "ID Детайл": taskData.name, 
          "Оператор": currentOperator, 
          "Количество": 0, 
          "Операция": taskData.op, 
          "Статус": "Започната", 
          "Дата": new Date().toISOString(), 
          "Време Старт": window['startTime_' + taskId] 
      }]).then(res => { if(res.error) console.error("Грешка при сигнал Започната", res.error); });
  }
}

function pauseTaskDOM(taskId) {
  if (navigator.vibrate) navigator.vibrate(50); activeTaskId = null; 
  document.querySelectorAll('.card').forEach(c => c.style.display = 'flex'); 
  document.getElementById('free_state_' + taskId).style.display = 'block'; document.getElementById('focus_state_' + taskId).style.display = 'none';

  let taskData = globalTasks.find(t => t.id === taskId);
  if (taskData) {
      client.from('otcheti').insert([{ 
          "ID Детайл": taskData.name, 
          "Оператор": currentOperator, 
          "Количество": 0, 
          "Операция": taskData.op, 
          "Статус": "Прекъсната", 
          "Дата": new Date().toISOString(), 
          "Време Старт": window['startTime_' + taskId] || new Date().toISOString() 
      }]).then(res => { if(res.error) console.error("Грешка при сигнал Прекъсната", res.error); });
  }
}

async function finishTask(taskId, btn) {
  var inputElem = document.getElementById('qty_' + taskId); if (!inputElem) return; var val = parseFloat(inputElem.value);
  if(isNaN(val) || val <= 0) { Swal.fire('Грешка', 'Въведи валидна бройка!', 'error'); return; }
  let taskData = globalTasks.find(t => t.id === taskId);
  if (taskData.hasLimit && val > taskData.maxAllowed) { Swal.fire('Невъзможно', `Разполагаш с материали само за ${taskData.maxAllowed} бр.!`, 'error'); return; }

  Swal.fire({ title: 'Сигурен ли си?', html: `Ще отчетеш <b style="color:#16a34a; font-size:1.2em;">${val} здрави бройки</b>.`, icon: 'question', showCancelButton: true, confirmButtonColor: '#16a34a', confirmButtonText: '🟢 ДА, ПРЕДАЙ', cancelButtonText: 'Отказ'
  }).then(async (result) => {
    if (result.isConfirmed) {
      btn.disabled = true; btn.innerHTML = "ЗАПИС..."; Swal.fire({ title: 'Проверка и Отчитане...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
      try {
          if (taskData.hasLimit) {
              const { data: currentReports, error: repErr } = await client.from('otcheti').select('Количество').eq('ID Детайл', taskData.name).eq('Операция', taskData.op).in('Статус', ['Отчетено', 'Брак']);
              if (repErr) throw repErr;
              let currentConsumed = 0;
              currentReports.forEach(r => { currentConsumed += (parseFloat(r['Количество']) || 0); });
              
              let originalConsumed = (taskData.totalDone || 0) + (taskData.totalScrapped || 0);
              let diff = currentConsumed - originalConsumed;
              let realMaxAllowed = taskData.maxAllowed - diff;
              
              if (realMaxAllowed <= 0) {
                  await forceCancelTask(taskId, taskData, "Някой друг вече е отчел всички бройки. Задачата се приключва автоматично.");
                  return;
              } else if (val > realMaxAllowed) {
                  throw new Error(`Невъзможно! Докато вие работехте, друг е отчел бройки. Оставащ наличен материал за тази операция: ${realMaxAllowed} бр.`);
              }
          }

          let startedAt = window['startTime_' + taskId] || new Date().toISOString();
          let inserts = [{ "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": val, "Операция": taskData.op, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt }];
          const { error } = await client.from('otcheti').insert(inserts);
          if(error) throw error;
          
          addLogToHistory('ГОТОВО', val, taskId); activeTaskId = null; 
          Swal.fire({ icon: 'success', title: 'Браво!', text: 'Отчетени: ' + val + ' бр.', timer: 1500, showConfirmButton: false }).then(() => { loadTasks(); });
      } catch(err) { 
          if (!navigator.onLine || err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('fetch')) {
              let startedAt = window['startTime_' + taskId] || new Date().toISOString();
              let inserts = [{ "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": val, "Операция": taskData.op, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt }];
              if (taskData.hasLimit) { taskData.maxAllowed -= val; if (taskData.maxAllowed < 0) taskData.maxAllowed = 0; }
              saveToOfflineQueue(inserts, taskId, 'Отчетени: ' + val + ' бр.');
          } else {
              Swal.fire('❌ Грешка при запис', err.message, 'error'); 
              btn.disabled = false; btn.innerHTML = "✅ ОТЧЕТИ"; 
          }
      }
    }
  });
}

async function reportScrap(taskId, btn) {
  var inputElem = document.getElementById('qty_' + taskId); if (!inputElem) return; var val = parseFloat(inputElem.value);
  if(isNaN(val) || val <= 0) { Swal.fire('Грешка', 'Въведи валидна бройка!', 'error'); return; }
  let taskData = globalTasks.find(t => t.id === taskId);
  if (taskData.hasLimit && val > taskData.maxAllowed) { Swal.fire('Невъзможно', `Имаш материал само за ${taskData.maxAllowed} бр.!`, 'error'); return; }

  if (taskData.name.includes('#')) {
      let children = globalBomData.filter(b => String(b['ID Родител']).trim() === taskData.name);
      if (children.length > 0) {
          let checkboxHtml = '<div style="text-align:left; margin-top:15px; font-size:14px; max-height: 250px; overflow-y: auto;"><p style="color:#e74c3c; font-weight:bold; margin-bottom:12px;">Кои компоненти вътре бяха счупени?<br><span style="font-size: 0.8em; color: #64748b;">(Отмаркирайте спасените детайли)</span></p>';
          children.forEach(c => { let cName = String(c['ID Компонент']).trim(); checkboxHtml += `<label style="display:flex; align-items:center; margin-bottom:8px; padding:12px; background:#f8fafc; border-radius:6px; border:1px solid #cbd5e1;"><input type="checkbox" class="scrap-child-cb" value="${cName}" checked style="transform: scale(1.5); margin-right:15px;"><span style="font-weight:700; font-size: 1.1em; color: #1e293b;">${cName}</span></label>`; });
          checkboxHtml += '</div>';
          const { value: formValues, isConfirmed } = await Swal.fire({ title: 'Бракуване', html: `Ще бракувате <b>${val} бр.</b><br>` + checkboxHtml, icon: 'warning', showCancelButton: true, confirmButtonColor: '#e74c3c', confirmButtonText: 'Да, бракувай!', cancelButtonText: 'Отказ', preConfirm: () => { let scrapped = []; document.querySelectorAll('.scrap-child-cb:checked').forEach(cb => scrapped.push(cb.value)); return scrapped; } });
          if (isConfirmed) await executeScrapLogic(taskData, val, children, formValues);
          return;
      }
  }
  Swal.fire({ title: 'Сигурен ли си?', text: "⚠️ БРАКУВАШ " + val + " бр.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#e74c3c', confirmButtonText: 'Да, бракувай!', cancelButtonText: 'Отказ' }).then(async (result) => { if (result.isConfirmed) await executeScrapLogic(taskData, val, [], []); });
}

async function executeScrapLogic(taskData, val, allChildren, scrappedChildrenNames) {
    Swal.fire({ title: 'Проверка и Отразяване на брака...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    try {
        if (taskData.hasLimit) {
            const { data: currentReports, error: repErr } = await client.from('otcheti').select('Количество').eq('ID Детайл', taskData.name).eq('Операция', taskData.op).in('Статус', ['Отчетено', 'Брак']);
            if (repErr) throw repErr;
            let currentConsumed = 0;
            currentReports.forEach(r => { currentConsumed += (parseFloat(r['Количество']) || 0); });
            
            let originalConsumed = (taskData.totalDone || 0) + (taskData.totalScrapped || 0);
            let diff = currentConsumed - originalConsumed;
            let realMaxAllowed = taskData.maxAllowed - diff;
            
            if (realMaxAllowed <= 0) {
                await forceCancelTask(taskData.id, taskData, "Някой друг вече е отчел всички бройки. Задачата се приключва автоматично.");
                return;
            } else if (val > realMaxAllowed) {
                throw new Error(`Невъзможно! Докато вие работехте, друг е отчел бройки. Оставащ наличен материал за тази операция: ${realMaxAllowed} бр.`);
            }
        }

        let startedAt = window['startTime_' + taskData.id] || new Date().toISOString();
        let inserts = [{ "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": val, "Операция": taskData.op, "Статус": "Брак", "Дата": new Date().toISOString(), "Време Старт": startedAt }];

        allChildren.forEach(child => {
            let cName = String(child['ID Компонент']).trim();
            if (!scrappedChildrenNames.includes(cName)) {
                let multiplier = parseFloat(child['Количество']) || 1; let savedQty = val * multiplier;
                let cRoutes = globalRoutesByDetail[cName] || []; let opToLog = "Възстановен"; 
                if (cRoutes.length > 0) opToLog = String(cRoutes[cRoutes.length - 1]['Име на операция']).trim();
                inserts.push({ "ID Детайл": cName, "Оператор": "СИСТЕМА (Спасен)", "Количество": savedQty, "Операция": opToLog, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt });
            }
        });

        const { error } = await client.from('otcheti').insert(inserts);
        if (error) throw error; 
        
        addLogToHistory('БРАК', val, taskData.id); Swal.close(); activeTaskId = null; loadTasks(); 
    } catch(err) { 
        if (!navigator.onLine || err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('fetch')) {
            let startedAt = window['startTime_' + taskData.id] || new Date().toISOString();
            let inserts = [{ "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": val, "Операция": taskData.op, "Статус": "Брак", "Дата": new Date().toISOString(), "Време Старт": startedAt }];
            allChildren.forEach(child => {
                let cName = String(child['ID Компонент']).trim();
                if (!scrappedChildrenNames.includes(cName)) {
                    let multiplier = parseFloat(child['Количество']) || 1; let savedQty = val * multiplier;
                    let cRoutes = globalRoutesByDetail[cName] || []; let opToLog = "Възстановен"; 
                    if (cRoutes.length > 0) opToLog = String(cRoutes[cRoutes.length - 1]['Име на операция']).trim();
                    inserts.push({ "ID Детайл": cName, "Оператор": "СИСТЕМА (Спасен)", "Количество": savedQty, "Операция": opToLog, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt });
                }
            });
            if (taskData.hasLimit) { taskData.maxAllowed -= val; if (taskData.maxAllowed < 0) taskData.maxAllowed = 0; }
            saveToOfflineQueue(inserts, taskData.id, 'БРАК: ' + val + ' бр.');
        } else {
            Swal.fire('❌ Грешка при запис', err.message, 'error'); 
        }
    }
}

async function forceCancelTask(taskId, taskData, msg) {
    let startedAt = window['startTime_' + taskId] || new Date().toISOString();
    try {
        await client.from('otcheti').insert([{ 
            "ID Детайл": taskData.name, 
            "Оператор": currentOperator, 
            "Количество": 0, 
            "Операция": taskData.op, 
            "Статус": "Авто приключена", 
            "Дата": new Date().toISOString(), 
            "Време Старт": startedAt 
        }]);
    } catch(e) { console.error(e); }
    activeTaskId = null;
    Swal.fire({ title: 'Автоматично приключена', text: msg, icon: 'info', confirmButtonText: 'Разбрах' }).then(() => { loadTasks(); });
}

// --- OFFLINE SUPPORT ---
function getOfflineQueue() {
    return JSON.parse(localStorage.getItem('offlineReportsQueue') || '[]');
}

function saveToOfflineQueue(insertsArray, taskId, successMsg) {
    let queue = getOfflineQueue();
    queue.push({
        timestamp: Date.now(),
        inserts: insertsArray,
        taskId: taskId,
        successMsg: successMsg
    });
    localStorage.setItem('offlineReportsQueue', JSON.stringify(queue));
    if (taskId) {
        let val = parseFloat(insertsArray[0]['Количество']) || 0;
        let isScrap = insertsArray[0]['Статус'] === 'Брак';
        addLogToHistory(isScrap ? 'БРАК(Офлайн)' : 'ОФЛАЙН', val, taskId);
    }
    activeTaskId = null;
    Swal.fire({ 
        icon: 'warning', 
        title: 'Няма връзка с интернет', 
        text: 'Отчетът е запазен локално! Ще се изпрати автоматично при възстановяване на връзката.', 
        timer: 3500, 
        showConfirmButton: false 
    }).then(() => { loadTasks(); });
}

async function syncOfflineReports() {
    if (!navigator.onLine) return;
    let queue = getOfflineQueue();
    if (queue.length === 0) return;
    
    let newQueue = [];
    let hasSynced = false;
    
    for (let i = 0; i < queue.length; i++) {
        let item = queue[i];
        let success = true;
        
        if (item.inserts && item.inserts.length > 0) {
            let firstInsert = item.inserts[0];
            try {
                const { data, error } = await client.from('otcheti').select('id').eq('Дата', firstInsert['Дата']).eq('Оператор', firstInsert['Оператор']).limit(1);
                if (error) throw error;
                if (data && data.length > 0) {
                    hasSynced = true;
                    continue; 
                }
                const { error: insErr } = await client.from('otcheti').insert(item.inserts);
                if (insErr) throw insErr;
                hasSynced = true;
            } catch (err) {
                console.error("Грешка при офлайн синхронизация", err);
                success = false;
            }
        }
        if (!success) {
            newQueue.push(item);
        }
    }
    
    localStorage.setItem('offlineReportsQueue', JSON.stringify(newQueue));
    if (hasSynced && newQueue.length === 0) {
        Swal.fire({ toast: true, position: 'bottom-end', icon: 'success', title: 'Офлайн отчетите бяха изпратени!', showConfirmButton: false, timer: 3000 });
        loadTasks(true);
    }
}

window.addEventListener('online', syncOfflineReports);
setTimeout(syncOfflineReports, 2000);
