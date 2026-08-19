// packing-actions.js - Опростени действия за Опаковане

async function finishPackingTask(taskId, btn) {
    let taskData = globalTasks.find(t => t.id === taskId);
    if (!taskData) return;

    let qtyInput = document.getElementById('qty_' + taskId);
    let boxInput = document.getElementById('box_' + taskId);

    if (!qtyInput || !boxInput) return;

    let val = parseFloat(qtyInput.value);
    let boxNum = boxInput.value.trim();

    if (isNaN(val) || val <= 0) { 
        Swal.fire('Грешка', 'Въведи валидна бройка!', 'error'); 
        return; 
    }
    if (val > taskData.available) { 
        Swal.fire('Невъзможно', `Разполагаш само с ${taskData.available} бр. готови за опаковане!`, 'error'); 
        return; 
    }
    if (boxNum === '') {
        Swal.fire('Грешка', 'Въведи номер на кашон!', 'error'); 
        return; 
    }

    Swal.fire({ 
        title: 'Сигурен ли си?', 
        html: `Ще отчетеш <b style="color:#16a34a; font-size:1.2em;">${val} бр.</b><br>в кашон: <b style="color:#0369a1; font-size:1.2em;">${boxNum}</b>.`, 
        icon: 'question', 
        showCancelButton: true, 
        confirmButtonColor: '#2563eb', 
        confirmButtonText: '📦 ДА, ОПАКОВАЙ', 
        cancelButtonText: 'Отказ'
    }).then(async (result) => {
        if (result.isConfirmed) {
            btn.disabled = true; 
            btn.innerHTML = "ЗАПИС..."; 
            Swal.fire({ title: 'Проверка и Отчитане...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            
            try {
                let inserts = [{ 
                    "ID План": taskData.plan_id, 
                    "ID Детайл": taskData.name, 
                    "Оператор": currentOperator, 
                    "Количество": val, 
                    "Операция": "Опаковане - Кашон № " + boxNum, 
                    "Статус": "Отчетено", 
                    "Дата": new Date().toISOString(), 
                    "Време Старт": new Date().toISOString() 
                }];

                const { error } = await client.from('otcheti').insert(inserts);
                if (error) throw error;
                
                addLogToHistory('ОПАКОВАНЕ (Кашон ' + boxNum + ')', val, taskId); 
                Swal.fire({ icon: 'success', title: 'Успешно!', text: 'Опаковани: ' + val + ' бр. в Кашон № ' + boxNum, timer: 2000, showConfirmButton: false }).then(() => { loadTasks(); });
            } catch(err) { 
                Swal.fire('❌ Грешка при запис', err.message, 'error'); 
                btn.disabled = false; 
                btn.innerHTML = "✅ ОТЧЕТИ ОПАКОВАНЕ"; 
            }
        }
    });
}

let localHistoryData = [];
function updateHistoryUI() {
    var list = document.getElementById('historyList');
    if (!list) return;
    if (localHistoryData.length === 0) { list.innerHTML = '<li class="history-item" style="color:#94a3b8; text-align:center;">Няма скорошни действия</li>'; return; }
    var html = '';
    localHistoryData.forEach(function(h) {
        let color = '#15803d'; let bg = '#dcfce7'; 
        if(h.type.includes('БРАК')) { color = '#b91c1c'; bg = '#fee2e2'; }
        else if(h.type.includes('ОФЛАЙН')) { color = '#b45309'; bg = '#fef3c7'; }
        else if(h.type.includes('ОПАКОВАНЕ')) { color = '#0369a1'; bg = '#e0f2fe'; }
        html += `<li class="history-item">
            <span class="h-time">${h.time}</span>
            <span class="h-type" style="background:${bg}; color:${color};">${h.type}</span>
            <span class="h-name">${h.name}</span>
            <span class="h-qty">${h.qty} бр.</span>
        </li>`;
    });
    list.innerHTML = html;
}

function addLogToHistory(type, qty, taskId) {
    var now = new Date(); 
    var timeStr = now.getDate().toString().padStart(2, '0') + '.' + (now.getMonth() + 1).toString().padStart(2, '0') + ' ' + now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    let taskData = globalTasks.find(t => t.id === taskId); 
    var name = taskData ? (taskData.name) : 'Детайл';
    localHistoryData.unshift({ time: timeStr, type: type, qty: qty, name: name }); 
    if (localHistoryData.length > 10) localHistoryData.pop(); 
    updateHistoryUI();
}
