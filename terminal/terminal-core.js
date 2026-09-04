const client = supabase.createClient(
    'https://aoekbmhgbohsgpwqsizv.supabase.co', 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU'
);

let currentOperator = ""; let currentEmail = ""; let currentMachine = "";
let globalTasks = []; let localHistoryData = []; let globalBomData = []; let globalRoutesByDetail = {};
let currentTaskFilter = 'ready'; let activeTaskId = null; let isUserCheckedIn = false; 
const WORKSHOP_LAT = 41.8937; const WORKSHOP_LNG = 23.4875;

async function verifyUserAccess(email) {
    try {
        const { data, error } = await client.from('personal').select('РЎС‚Р°С‚СѓСЃ, РРјРµ').eq('РРјРµР№Р»', email).limit(1);
        if (error) return { allowed: false, msg: "Р“СЂРµС€РєР° РїСЂРё РїСЂРѕРІРµСЂРєР° РЅР° РґРѕСЃС‚СЉРїР°." };
        if (!data || data.length === 0) return { allowed: false, msg: "РќРµРїРѕР·РЅР°С‚ РёРјРµР№Р» Р°РґСЂРµСЃ! РњРѕР»СЏ, СЃРІСЉСЂР¶РµС‚Рµ СЃРµ СЃ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ." };
        if (data[0]['РЎС‚Р°С‚СѓСЃ'] === 'Р‘Р»РѕРєРёСЂР°РЅ') return { allowed: false, msg: "Р”РѕСЃС‚СЉРїСЉС‚ РІРё Рµ РІСЂРµРјРµРЅРЅРѕ Р±Р»РѕРєРёСЂР°РЅ!" };
        return { allowed: true, name: data[0]['РРјРµ'] };
    } catch (err) {
        return { allowed: false, msg: err.message };
    }
}

async function fetchUserCheckInStatus() {
    if (!currentEmail) return false;
    try {
        const { data, error } = await client.from('chekiraniya')
            .select('Р”РµР№СЃС‚РІРёРµ, Р’СЂРµРјРµ')
            .eq('РРјРµР№Р»', currentEmail)
            .in('Р”РµР№СЃС‚РІРёРµ', ['Р’Р»РёР·Р°РЅРµ', 'РР·Р»РёР·Р°РЅРµ', 'РђРІС‚Рѕ РёР·Р»РёР·Р°РЅРµ'])
            .order('Р’СЂРµРјРµ', { ascending: false }).limit(1);
        if (error) return false;
        if (data && data.length > 0) {
            const lastAction = data[0]['Р”РµР№СЃС‚РІРёРµ']; const lastTime = new Date(data[0]['Р’СЂРµРјРµ']); const now = new Date();
            if (lastAction === 'Р’Р»РёР·Р°РЅРµ' && lastTime.toDateString() === now.toDateString()) return true;
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
            Swal.fire('РћРўРљРђР—РђРќ Р”РћРЎРўРЄРџ', access.msg, 'error').then(() => { location.reload(); });
            return; 
        }
        if (access.name) {
            currentOperator = access.name;
            localStorage.setItem('mes_operator', currentOperator);
        }
        OneSignalDeferred.push(function(OneSignal) { OneSignal.login(currentEmail); }); 
    }

    if (!currentOperator || !currentEmail) { await setupProfile(); } else { document.getElementById('uiOperatorName').innerText = currentOperator; }
    if (savedMachine === null) { await changeMachine(true); } else { currentMachine = savedMachine; document.getElementById('uiMachineName').innerText = currentMachine || "Р’РЎРР§РљР"; }
    
    checkSystemMessage();
    loadTasks();
    if (typeof loadHistoryFromDB === 'function') loadHistoryFromDB();

    setInterval(() => { if (!activeTaskId && isUserCheckedIn) loadTasks(true); }, 30000); 
}

function checkSystemMessage() {
    const urlParams = new URLSearchParams(window.location.search);
    const sysTitle = urlParams.get('sysTitle');
    const sysMsg = urlParams.get('sysMsg');

    if (sysTitle && sysMsg) {
        Swal.fire({
            title: 'рџ“ў ' + sysTitle, text: sysMsg, icon: 'info', confirmButtonText: 'РћРљ, Р РђР—Р‘Р РђРҐ', confirmButtonColor: '#2563eb', allowOutsideClick: false
        }).then(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
            if (currentEmail) {
                client.from('chekiraniya').insert([{ "РРјРµР№Р»": currentEmail, "Р”РµР№СЃС‚РІРёРµ": "рџ“ў РџСЂРѕС‡РµС‚РµРЅРѕ", "Р’СЂРµРјРµ": new Date().toISOString(), "Р›РѕРєР°С†РёСЏ": "РЎРёСЃС‚РµРјРЅРѕ", "Р‘РµР»РµР¶РєР°": sysTitle }]).then(res => {
                    if(res.error) console.error("Р“СЂРµС€РєР° РїСЂРё Р·Р°РїРёСЃ РЅР° РїСЂРѕС‡РёС‚", res.error);
                });
            }
        });
    }
}

function triggerPushPrompt() {
    if (Notification.permission === 'granted') { Swal.fire({ icon: 'info', title: 'Р’РµС‡Рµ СЃС‚Рµ Р°Р±РѕРЅРёСЂР°РЅРё!', text: 'РўРѕР·Рё С‚РµР»РµС„РѕРЅ РІРµС‡Рµ РёРјР° СЂР°Р·СЂРµС€РµРЅРёРµ РґР° РїРѕР»СѓС‡Р°РІР° РёР·РІРµСЃС‚РёСЏ.', confirmButtonColor: '#2563eb' }); return; }
    if (Notification.permission === 'denied') { Swal.fire({ icon: 'warning', title: 'РР·РІРµСЃС‚РёСЏС‚Р° СЃР° Р±Р»РѕРєРёСЂР°РЅРё', text: 'Р‘СЂР°СѓР·СЉСЂСЉС‚ Рµ Р±Р»РѕРєРёСЂР°Р» РёР·РІРµСЃС‚РёСЏС‚Р°. Р—Р° РґР° РіРё РїСѓСЃРЅРµС‚Рµ, РЅР°С‚РёСЃРЅРµС‚Рµ РєР°С‚РёРЅР°СЂС‡РµС‚Рѕ (рџ”’) РёР»Рё РёРєРѕРЅР°С‚Р° Р·Р° РЅР°СЃС‚СЂРѕР№РєРё РіРѕСЂРµ РґРѕ Р°РґСЂРµСЃР° (is-systems...) Рё РїРѕР·РІРѕР»РµС‚Рµ РёР·РІРµСЃС‚РёСЏС‚Р° СЂСЉС‡РЅРѕ.', confirmButtonColor: '#e74c3c' }); return; }
    OneSignalDeferred.push(async function(OneSignal) { try { Swal.close(); await OneSignal.Notifications.requestPermission(); } catch(e) { console.error("Р“СЂРµС€РєР°:", e); } });
}

async function setupProfile() {
    const { value: formValues } = await Swal.fire({
        title: 'РџСЂРѕС„РёР» Р Р°Р±РѕС‚РЅРёРє',
        html:
            '<div style="background: #e0e7ff; padding: 10px; border-radius: 8px; margin-bottom: 15px;"><button type="button" onclick="triggerPushPrompt()" style="background: #4338ca; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; width:100%; box-shadow: 0 2px 4px rgba(67,56,202,0.3);">рџ”” РџРѕРёСЃРєР°Р№ РёР·РІРµСЃС‚РёСЏ (Р СЉС‡РЅРѕ)</button><p style="font-size: 11px; color: #475569; margin: 5px 0 0 0; text-align: center;">РђРєРѕ РІСЃРµ РѕС‰Рµ РЅРµ СЃС‚Рµ СЃРµ Р°Р±РѕРЅРёСЂР°Р»Рё.</p></div>' +
            '<label style="display:block; text-align:left; font-size:14px; font-weight:bold; margin-bottom:5px; color:#475569;">РРјРµ Рё Р¤Р°РјРёР»РёСЏ</label><input id="swal-name" class="swal2-input" style="margin-top:0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed;" readonly placeholder="РђРІС‚РѕРјР°С‚РёС‡РЅРѕ РїРѕРїСЉР»РІР°РЅРµ" value="' + (currentOperator || '') + '">' +
            '<label style="display:block; text-align:left; font-size:14px; font-weight:bold; margin-top:15px; margin-bottom:5px; color:#475569;">Р›РёС‡РµРЅ РРјРµР№Р»</label><input id="swal-email" class="swal2-input" type="email" style="margin-top:0;" value="' + (currentEmail || '') + '">' +
            '<div style="margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 15px; display: flex; justify-content: center; gap: 10px;">' +
            '<button type="button" onclick="window.location.href=\'admin.html\'" style="background: transparent; border: 1px solid #cbd5e1; color: #475569; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">рџ”’ РђРґРјРёРЅ</button>' +
            '<button type="button" disabled style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #94a3b8; padding: 6px 12px; border-radius: 6px; cursor: not-allowed; font-size: 12px; font-weight: bold; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);">рџ”’ Р”РѕСЃРёРµ (РЎРєРѕСЂРѕ)</button></div>',
        focusConfirm: false, allowOutsideClick: !!currentOperator, confirmButtonText: 'Р—Р°РїР°Р·Рё РїСЂРѕС„РёР»Р°', confirmButtonColor: '#2563eb',
        preConfirm: () => { return [ document.getElementById('swal-email').value.trim() ] }
    });
    
    if (formValues && formValues[0]) {
        let enteredEmail = formValues[0].toLowerCase();
        
        Swal.fire({ title: 'РџСЂРѕРІРµСЂРєР° РЅР° РїСЂР°РІР°С‚Р°...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        let access = await verifyUserAccess(enteredEmail);
        
        if (!access.allowed) {
            Swal.fire('РћРўРљРђР—РђРќ Р”РћРЎРўРЄРџ', access.msg, 'error').then(() => { setupProfile(); });
            return;
        }

        currentOperator = access.name || "РќРµРёР·РІРµСЃС‚РµРЅ"; currentEmail = enteredEmail;
        localStorage.setItem('mes_operator', currentOperator); localStorage.setItem('mes_email', currentEmail);
        document.getElementById('uiOperatorName').innerText = currentOperator;
        OneSignalDeferred.push(function(OneSignal) { OneSignal.login(currentEmail); });
        Swal.fire({icon: 'success', title: 'РџСЂРѕС„РёР»СЉС‚ Рµ РѕРґРѕР±СЂРµРЅ!', timer: 1500, showConfirmButton: false});
    } else if (!currentOperator) { Swal.fire('Р’РЅРёРјР°РЅРёРµ', 'РРјРµР№Р»СЉС‚ Рµ Р·Р°РґСЉР»Р¶РёС‚РµР»РµРЅ!', 'error').then(() => location.reload()); }
}

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; const p1 = lat1 * Math.PI/180; const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180; const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) { resolve({ loc: "РќРµ СЃРµ РїРѕРґРґСЉСЂР¶Р°", note: "вљ пёЏ GPS РќР• РЎР• РџРћР”Р”РЄР Р–Рђ" }); return; }
        navigator.geolocation.getCurrentPosition((pos) => {
                const lat = pos.coords.latitude; const lng = pos.coords.longitude; const dist = getDistanceInMeters(lat, lng, WORKSHOP_LAT, WORKSHOP_LNG);
                resolve({ loc: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, note: dist > 200 ? `вљ пёЏ РР—Р’РЄРќ РћР‘Р•РљРўРђ (${dist}Рј)` : "" });
            }, (err) => { resolve({ loc: "GPS РћС‚РєР°Р·Р°РЅ", note: "вљ пёЏ Р›РРџРЎР’Рђ Р›РћРљРђР¦РРЇ" }); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

async function processCheckIn(actionType) {
    if (!currentEmail) { Swal.fire('Р’РЅРёРјР°РЅРёРµ', 'РњРѕР»СЏ, РІСЉРІРµРґРµС‚Рµ РІР°С€РёСЏ РёРјРµР№Р» РІ РЅР°СЃС‚СЂРѕР№РєРёС‚Рµ РЅР° РїСЂРѕС„РёР»Р° (вљ™пёЏ).', 'warning'); return; }
    try {
        Swal.fire({ title: 'РџСЂРѕРІРµСЂРєР°...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { data: lastRecord, error: fetchErr } = await client.from('chekiraniya')
            .select('Р”РµР№СЃС‚РІРёРµ, Р’СЂРµРјРµ')
            .eq('РРјРµР№Р»', currentEmail)
            .in('Р”РµР№СЃС‚РІРёРµ', ['Р’Р»РёР·Р°РЅРµ', 'РР·Р»РёР·Р°РЅРµ', 'РђРІС‚Рѕ РёР·Р»РёР·Р°РЅРµ'])
            .order('Р’СЂРµРјРµ', { ascending: false }).limit(1);
        if (fetchErr) throw fetchErr;
        
        if (lastRecord && lastRecord.length > 0) {
            const lastAction = lastRecord[0]['Р”РµР№СЃС‚РІРёРµ']; const lastTime = new Date(lastRecord[0]['Р’СЂРµРјРµ']); const now = new Date();
            
            if (lastAction === 'Р’Р»РёР·Р°РЅРµ' && lastTime.toDateString() !== now.toDateString()) {
                let autoOutTime = new Date(lastTime); autoOutTime.setHours(17, 0, 0, 0);
                await client.from('chekiraniya').insert([{ "РРјРµР№Р»": currentEmail, "Р”РµР№СЃС‚РІРёРµ": 'РђРІС‚Рѕ РёР·Р»РёР·Р°РЅРµ', "Р’СЂРµРјРµ": autoOutTime.toISOString(), "Р›РѕРєР°С†РёСЏ": "РЎРёСЃС‚РµРјРЅРѕ", "Р‘РµР»РµР¶РєР°": "РђРІС‚Рѕ РєРѕСЂРµРєС†РёСЏ" }]);
                await client.from('otcheti').delete().eq('РћРїРµСЂР°С‚РѕСЂ', currentOperator).eq('РЎС‚Р°С‚СѓСЃ', 'Р—Р°РїРѕС‡РЅР°С‚Р°');
            } else {
                if (actionType === 'Р’Р»РёР·Р°РЅРµ' && lastAction === 'Р’Р»РёР·Р°РЅРµ') { Swal.fire('Р’РЅРёРјР°РЅРёРµ!', 'Р’РµС‡Рµ СЃС‚Рµ С‡РµРєРёСЂР°РЅРё Р·Р° Р’Р»РёР·Р°РЅРµ РґРЅРµСЃ.', 'info'); return; }
                if (actionType === 'РР·Р»РёР·Р°РЅРµ' && (lastAction === 'РР·Р»РёР·Р°РЅРµ' || lastAction === 'РђРІС‚Рѕ РёР·Р»РёР·Р°РЅРµ')) { Swal.fire('Р’РЅРёРјР°РЅРёРµ!', 'Р’РµС‡Рµ СЃС‚Рµ СЃРµ РёР·РїРёСЃР°Р»Рё.', 'info'); return; }
            }
        }
        Swal.fire({ title: 'РџСЂРѕРІРµСЂРєР° РЅР° Р»РѕРєР°С†РёСЏ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() }); const geoInfo = await getUserLocation();
        Swal.fire({ title: 'Р—Р°РїРёСЃРІР°РЅРµ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error: insertErr } = await client.from('chekiraniya').insert([{ "РРјРµР№Р»": currentEmail, "Р”РµР№СЃС‚РІРёРµ": actionType, "Р’СЂРµРјРµ": new Date().toISOString(), "Р›РѕРєР°С†РёСЏ": geoInfo.loc, "Р‘РµР»РµР¶РєР°": geoInfo.note }]);
        if (insertErr) throw insertErr;
        
        if (actionType === 'РР·Р»РёР·Р°РЅРµ') {
            await client.from('otcheti').delete().eq('РћРїРµСЂР°С‚РѕСЂ', currentOperator).eq('РЎС‚Р°С‚СѓСЃ', 'Р—Р°РїРѕС‡РЅР°С‚Р°');
        }
        
        if (actionType === 'Р’Р»РёР·Р°РЅРµ') {
            let now = new Date();
            if (now.getHours() >= 8 && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel(); let msg = new SpeechSynthesisUtterance("Р РµРіРёСЃС‚СЂРёСЂР°РЅРѕ Рµ Р·Р°РєСЉСЃРЅРµРЅРёРµ."); msg.lang = 'bg-BG'; msg.rate = 1.0; msg.pitch = 1.1; window.speechSynthesis.speak(msg);
            }
        }
        Swal.fire({ icon: actionType === 'Р’Р»РёР·Р°РЅРµ' ? 'success' : 'info', title: 'РЈСЃРїРµС€РЅРѕ!', text: `${actionType} Рµ СЂРµРіРёСЃС‚СЂРёСЂР°РЅРѕ.`, timer: 2000, showConfirmButton: false }).then(() => { 
            loadTasks(true); 
        });
    } catch (err) { console.error(err); Swal.fire('вќЊ Р“СЂРµС€РєР° РїСЂРё РІСЂСЉР·РєР°С‚Р°', 'РњРѕР»СЏ, РїСЂРѕРІРµСЂРµС‚Рµ РёРЅС‚РµСЂРЅРµС‚Р° СЃРё.', 'error'); }
}

async function fetchMessages() {
    if (!currentEmail) return;
    var list = document.getElementById('messagesList');
    list.innerHTML = '<li class="history-item" style="text-align:center;">Р—Р°СЂРµР¶РґР°РЅРµ... рџ”„</li>';
    try {
        const { data, error } = await client.from('chekiraniya')
            .select('Р’СЂРµРјРµ, Р‘РµР»РµР¶РєР°')
            .eq('Р”РµР№СЃС‚РІРёРµ', 'РЎСЉРѕР±С‰РµРЅРёРµ')
            .in('Р›РѕРєР°С†РёСЏ', ['ALL', currentEmail])
            .order('Р’СЂРµРјРµ', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        if (!data || data.length === 0) {
            list.innerHTML = '<li class="history-item" style="color:#94a3b8; text-align:center;">РќСЏРјР° СЃРєРѕСЂРѕС€РЅРё СЃСЉРѕР±С‰РµРЅРёСЏ</li>';
            return;
        }
        
        var html = '';
        data.forEach(msg => {
            let dateStr = new Date(msg['Р’СЂРµРјРµ']).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            let parts = msg['Р‘РµР»РµР¶РєР°'].split('|||');
            let title = parts[0] || 'РЎСЉРѕР±С‰РµРЅРёРµ';
            let body = parts[1] || '';
            html += `<li class="history-item" style="background: #f8fafc; padding: 10px; margin-bottom: 8px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <span style="font-size:10px; color:#64748b; margin-bottom:4px; display:block;">${dateStr}</span>
                <strong style="color:#1e293b; font-size:13px; margin-bottom:2px; display:block;">${title}</strong>
                <span style="color:#475569; font-size:12px; display:block;">${body}</span>
            </li>`;
        });
        list.innerHTML = html;
    } catch (e) {
        list.innerHTML = '<li class="history-item" style="color:red; text-align:center;">Р“СЂРµС€РєР° РїСЂРё Р·Р°СЂРµР¶РґР°РЅРµ</li>';
    }
}

window.onload = initTerminal;



