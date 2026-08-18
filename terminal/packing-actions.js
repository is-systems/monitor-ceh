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
