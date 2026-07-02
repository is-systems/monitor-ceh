const client = supabase.createClient(
    'https://zdythzcgcjxwbxufunuh.supabase.co', 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE'
);

let currentOperator = ""; let currentEmail = ""; let currentMachine = "";
let globalTasks = []; let localHistoryData = []; let globalBomData = []; let globalRoutesByDetail = {};
let currentTaskFilter = 'all'; let activeTaskId = null; let isUserCheckedIn = false; 
const WORKSHOP_LAT = 41.8937; const WORKSHOP_LNG = 23.4875;

async function verifyUserAccess(email) {
    try {
        const { data, error } = await client.from('personal').select('Статус').eq('Имейл', email).limit(1);
        if (error) return { allowed: false, msg: "Грешка при връзката със сървъра." };
        if (!data || data.length === 0) return { allowed: false, msg: "Неразпознат служител! Свържете се с ръководител." };
        if (data[0]['Статус'] === 'Блокиран') return { allowed: false, msg: "Достъпът ви до системата е ограничен!" };
        return { allowed: true };
    } catch (err) {
        return { allowed: false, msg: err.message };
    }
}

async function fetchUserCheckInStatus() {
    if (!currentEmail) return false;
    try {
        const { data, error } = await client.from('chekiraniya')
            .select('Действие, Време')
            .eq('Имейл', currentEmail)
            .in('Действие', ['Влизане', 'Излизане', 'Авто излизане'])
            .order('Време', { ascending: false }).limit(1);
        if (error) return false;
        if (data && data.length > 0) {
            const lastAction = data[0]['Действие']; const lastTime = new Date(data[0]['Време']); const now = new Date();
            if (lastAction === 'Влизане' && lastTime.toDateString() === now.toDateString()) return true;
        }
        return false;
    } catch (err) { return false; }
}

async function initTerminal() {
    currentOperator = localStorage.getItem('mes_operator'); currentEmail = localStorage.getItem('mes_email'); let savedMachine = localStorage.getItem('mes_machine');
    
    if (currentEmail) { 
        let access = await verifyUserAccess(currentEmail);
        if (!access.allowed) {
            localStorage.removeItem('mes_operator'); localStorage.removeItem('mes_email');
            Swal.fire('ОТКАЗАН ДОСТЪП', access.msg, 'error').then(() => { location.reload(); });
            return; 
        }
        if (access.name) {
            currentOperator = access.name;
            localStorage.setItem('mes_operator', currentOperator);
        }
        OneSignalDeferred.push(function(OneSignal) { OneSignal.login(currentEmail); }); 
    }

    if (!currentOperator || !currentEmail) { await setupProfile(); } else { document.getElementById('uiOperatorName').innerText = currentOperator; }
    if (savedMachine === null) { await changeMachine(true); } else { currentMachine = savedMachine; document.getElementById('uiMachineName').innerText = currentMachine || "ВСИЧКИ"; }
    
    checkSystemMessage();
    loadTasks();

    setInterval(() => { if (!activeTaskId && isUserCheckedIn) loadTasks(true); }, 30000); 
}

function checkSystemMessage() {
    const urlParams = new URLSearchParams(window.location.search);
    const sysTitle = urlParams.get('sysTitle');
    const sysMsg = urlParams.get('sysMsg');

    if (sysTitle && sysMsg) {
        Swal.fire({
            title: '📢 ' + sysTitle, text: sysMsg, icon: 'info', confirmButtonText: 'ОК, РАЗБРАХ', confirmButtonColor: '#2563eb', allowOutsideClick: false
        }).then(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
            if (currentEmail) {
                client.from('chekiraniya').insert([{ "Имейл": currentEmail, "Действие": "📢 Прочетено", "Време": new Date().toISOString(), "Локация": "Системно", "Бележка": sysTitle }]).then(res => {
                    if(res.error) console.error("Грешка при запис на прочит", res.error);
                });
            }
        });
    }
}

function triggerPushPrompt() {
    if (Notification.permission === 'granted') { Swal.fire({ icon: 'info', title: 'Вече сте абонирани!', text: 'Този телефон вече има разрешение да получава известия.', confirmButtonColor: '#2563eb' }); return; }
    if (Notification.permission === 'denied') { Swal.fire({ icon: 'warning', title: 'Известията са блокирани', text: 'Браузърът е блокирал известията. За да ги пуснете, натиснете катинарчето (🔒) или иконата за настройки горе до адреса (is-systems...) и позволете известията ръчно.', confirmButtonColor: '#e74c3c' }); return; }
    OneSignalDeferred.push(async function(OneSignal) { try { Swal.close(); await OneSignal.Notifications.requestPermission(); } catch(e) { console.error("Грешка:", e); } });
}

async function setupProfile() {
    const { value: formValues } = await Swal.fire({
        title: 'Профил Работник',
        html:
            '<div style="background: #e0e7ff; padding: 10px; border-radius: 8px; margin-bottom: 15px;"><button type="button" onclick="triggerPushPrompt()" style="background: #4338ca; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; width:100%; box-shadow: 0 2px 4px rgba(67,56,202,0.3);">🔔 Поискай известия (Ръчно)</button><p style="font-size: 11px; color: #475569; margin: 5px 0 0 0; text-align: center;">Ако все още не сте се абонирали.</p></div>' +
            '<label style="display:block; text-align:left; font-size:14px; font-weight:bold; margin-bottom:5px; color:#475569;">Име и Фамилия</label><input id="swal-name" class="swal2-input" style="margin-top:0;" value="' + (currentOperator || '') + '">' +
            '<label style="display:block; text-align:left; font-size:14px; font-weight:bold; margin-top:15px; margin-bottom:5px; color:#475569;">Личен Имейл</label><input id="swal-email" class="swal2-input" type="email" style="margin-top:0;" value="' + (currentEmail || '') + '">' +
            '<div style="margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 15px; display: flex; justify-content: center; gap: 10px;">' +
            '<button type="button" onclick="window.location.href=\'admin.html\'" style="background: transparent; border: 1px solid #cbd5e1; color: #475569; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">🔒 Админ</button>' +
            '<button type="button" disabled style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #94a3b8; padding: 6px 12px; border-radius: 6px; cursor: not-allowed; font-size: 12px; font-weight: bold; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);">🔒 Досие (Скоро)</button></div>',
        focusConfirm: false, allowOutsideClick: !!currentOperator, confirmButtonText: 'Запази профила', confirmButtonColor: '#2563eb',
        preConfirm: () => { return [ document.getElementById('swal-name').value.trim(), document.getElementById('swal-email').value.trim() ] }
    });
    
    if (formValues && formValues[0]) {
        let enteredEmail = formValues[0].toLowerCase();
        
        Swal.fire({ title: 'Проверка на правата...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        let access = await verifyUserAccess(enteredEmail);
        
        if (!access.allowed) {
            Swal.fire('ОТКАЗАН ДОСТЪП', access.msg, 'error').then(() => { setupProfile(); });
            return;
        }

        currentOperator = access.name || "Неизвестен"; currentEmail = enteredEmail;
        localStorage.setItem('mes_operator', currentOperator); localStorage.setItem('mes_email', currentEmail);
        document.getElementById('uiOperatorName').innerText = currentOperator;
        OneSignalDeferred.push(function(OneSignal) { OneSignal.login(currentEmail); });
        Swal.fire({icon: 'success', title: 'Профилът е одобрен!', timer: 1500, showConfirmButton: false});
    } else if (!currentOperator) { Swal.fire('Внимание', 'Имейлът е задължителен!', 'error').then(() => location.reload()); }
}

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; const p1 = lat1 * Math.PI/180; const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180; const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) { resolve({ loc: "Не се поддържа", note: "⚠️ GPS НЕ СЕ ПОДДЪРЖА" }); return; }
        navigator.geolocation.getCurrentPosition((pos) => {
                const lat = pos.coords.latitude; const lng = pos.coords.longitude; const dist = getDistanceInMeters(lat, lng, WORKSHOP_LAT, WORKSHOP_LNG);
                resolve({ loc: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, note: dist > 200 ? `⚠️ ИЗВЪН ОБЕКТА (${dist}м)` : "" });
            }, (err) => { resolve({ loc: "GPS Отказан", note: "⚠️ ЛИПСВА ЛОКАЦИЯ" }); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

async function processCheckIn(actionType) {
    if (!currentEmail) { Swal.fire('Внимание', 'Моля, въведете вашия имейл в настройките на профила (⚙️).', 'warning'); return; }
    try {
        Swal.fire({ title: 'Проверка...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { data: lastRecord, error: fetchErr } = await client.from('chekiraniya')
            .select('Действие, Време')
            .eq('Имейл', currentEmail)
            .in('Действие', ['Влизане', 'Излизане', 'Авто излизане'])
            .order('Време', { ascending: false }).limit(1);
        if (fetchErr) throw fetchErr;
        
        if (lastRecord && lastRecord.length > 0) {
            const lastAction = lastRecord[0]['Действие']; const lastTime = new Date(lastRecord[0]['Време']); const now = new Date();
            
            if (lastAction === 'Влизане' && lastTime.toDateString() !== now.toDateString()) {
                let autoOutTime = new Date(lastTime); autoOutTime.setHours(17, 0, 0, 0);
                await client.from('chekiraniya').insert([{ "Имейл": currentEmail, "Действие": 'Авто излизане', "Време": autoOutTime.toISOString(), "Локация": "Системно", "Бележка": "Авто корекция" }]);
                await client.from('otcheti').delete().eq('Оператор', currentOperator).eq('Статус', 'Започната');
            } else {
                if (actionType === 'Влизане' && lastAction === 'Влизане') { Swal.fire('Внимание!', 'Вече сте чекирани за Влизане днес.', 'info'); return; }
                if (actionType === 'Излизане' && (lastAction === 'Излизане' || lastAction === 'Авто излизане')) { Swal.fire('Внимание!', 'Вече сте се изписали.', 'info'); return; }
            }
        }
        Swal.fire({ title: 'Проверка на локация...', allowOutsideClick: false, didOpen: () => Swal.showLoading() }); const geoInfo = await getUserLocation();
        Swal.fire({ title: 'Записване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error: insertErr } = await client.from('chekiraniya').insert([{ "Имейл": currentEmail, "Действие": actionType, "Време": new Date().toISOString(), "Локация": geoInfo.loc, "Бележка": geoInfo.note }]);
        if (insertErr) throw insertErr;
        
        if (actionType === 'Излизане') {
            await client.from('otcheti').delete().eq('Оператор', currentOperator).eq('Статус', 'Започната');
        }
        
        if (actionType === 'Влизане') {
            let now = new Date();
            if (now.getHours() >= 8 && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel(); let msg = new SpeechSynthesisUtterance("Регистрирано е закъснение."); msg.lang = 'bg-BG'; msg.rate = 1.0; msg.pitch = 1.1; window.speechSynthesis.speak(msg);
            }
        }
        Swal.fire({ icon: actionType === 'Влизане' ? 'success' : 'info', title: 'Успешно!', text: `${actionType} е регистрирано.`, timer: 2000, showConfirmButton: false }).then(() => { 
            loadTasks(true); 
        });
    } catch (err) { console.error(err); Swal.fire('❌ Грешка при връзката', 'Моля, проверете интернета си.', 'error'); }
}

async function fetchMessages() {
    if (!currentEmail) return;
    var list = document.getElementById('messagesList');
    list.innerHTML = '<li class="history-item" style="text-align:center;">Зареждане... 🔄</li>';
    try {
        const { data, error } = await client.from('chekiraniya')
            .select('Време, Бележка')
            .eq('Действие', 'Съобщение')
            .in('Локация', ['ALL', currentEmail])
            .order('Време', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        if (!data || data.length === 0) {
            list.innerHTML = '<li class="history-item" style="color:#94a3b8; text-align:center;">Няма скорошни съобщения</li>';
            return;
        }
        
        var html = '';
        data.forEach(msg => {
            let dateStr = new Date(msg['Време']).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            let parts = msg['Бележка'].split('|||');
            let title = parts[0] || 'Съобщение';
            let body = parts[1] || '';
            html += `<li class="history-item" style="background: #f8fafc; padding: 10px; margin-bottom: 8px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <span style="font-size:10px; color:#64748b; margin-bottom:4px; display:block;">${dateStr}</span>
                <strong style="color:#1e293b; font-size:13px; margin-bottom:2px; display:block;">${title}</strong>
                <span style="color:#475569; font-size:12px; display:block;">${body}</span>
            </li>`;
        });
        list.innerHTML = html;
    } catch (e) {
        list.innerHTML = '<li class="history-item" style="color:red; text-align:center;">Грешка при зареждане</li>';
    }
}

window.onload = initTerminal;
