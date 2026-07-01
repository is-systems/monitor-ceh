async function loadPersonnelSidebar() {
    const list = document.getElementById('sidebarList'); const loading = document.getElementById('sidebarLoading'); list.innerHTML = ''; loading.style.display = 'block';
    try {
        const { data, error } = await client.from('personal').select('Имейл').eq('Статус', 'Активен'); if (error) throw error;
        let uniqueEmails = [...new Set(data.map(item => item['Имейл'] ? item['Имейл'].toLowerCase().trim() : ''))].filter(e => e !== ''); uniqueEmails.sort((a, b) => a.localeCompare(b)); loading.style.display = 'none';
        if (uniqueEmails.length === 0) { list.innerHTML = '<li style="padding:15px; color:#94a3b8; text-align:center;">Няма активни служители</li>'; return; }
        uniqueEmails.forEach(email => { const li = document.createElement('li'); li.className = 'sidebar-item'; li.innerHTML = `📁 <span>${email}</span>`; li.onclick = () => openWorkerFolder(email); list.appendChild(li); });
    } catch (err) { loading.innerText = 'Грешка: ' + err.message; }
}

function openWorkerFolder(email) { currentFolderEmail = email; document.getElementById('currentWorkerName').innerText = email; document.getElementById('folderModalBackdrop').style.display = 'flex'; switchFolderTab('att'); }
function closeFolderModal() { document.getElementById('folderModalBackdrop').style.display = 'none'; }
function switchFolderTab(tabId) { ['att', 'work', 'docs'].forEach(id => { document.getElementById('tab' + id.charAt(0).toUpperCase() + id.slice(1) + 'Btn').classList.remove('active'); document.getElementById('f-' + id).classList.remove('active'); }); document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1) + 'Btn').classList.add('active'); document.getElementById('f-' + tabId).classList.add('active'); if (tabId === 'att') loadWorkerAttendance(); if (tabId === 'work') loadWorkerWork(); if (tabId === 'docs') loadWorkerDocs(); }

async function loadWorkerAttendance() {
    const tbody = document.getElementById('workerAttList'); tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Зареждане...</td></tr>';
    try {
        const { data, error } = await client.from('chekiraniya').select('*').eq('Имейл', currentFolderEmail).order('Време', { ascending: false }).limit(100); if (error) throw error;
        if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Няма записи.</td></tr>'; return; }
        let html = '';
        data.forEach(item => {
            let isLate = false; if (item['Действие'] === 'Влизане' && item['Време']) { let d = new Date(item['Време']); if (d.getHours() > 8 || (d.getHours() === 8 && d.getMinutes() > 0)) isLate = true; }
            let rowStyle = ''; if (isLate || (item['Бележка'] && item['Бележка'].includes('ИЗВЪН ОБЕКТА'))) rowStyle = 'background-color: #fef2f2; border-left: 4px solid #ef4444'; else if (item['Действие'] === 'Авто излизане') rowStyle = 'background-color: #fffbeb; border-left: 4px solid #f59e0b';
            let timeStr = item['Време'] ? new Date(item['Време']).toLocaleString('bg-BG') : ''; let actionHtml = item['Действие'];
            if (actionHtml === 'Влизане') actionHtml = `<span style="color:#15803d; font-weight:800;">🟢 Влизане</span>`; if (actionHtml === 'Излизане') actionHtml = `<span style="color:#b91c1c; font-weight:800;">🔴 Излизане</span>`; if (actionHtml === 'Авто излизане') actionHtml = `<span style="color:#b45309; font-weight:800;">🕒 Авто излизане</span>`;
            let noteHtml = item['Бележка'] || ''; if (noteHtml.includes('ИЗВЪН ОБЕКТА')) noteHtml = `⚠️ <b style="color:#dc2626;">${noteHtml}</b>`; let locHtml = item['Локация'] || '';
            if (locHtml.includes(',')) { let coords = locHtml.replace(/\s/g, ''); locHtml = `<a href="https://www.google.com/maps?q=${coords}" target="_blank" style="color:#2563eb; font-weight:bold; text-decoration:none;">📍 Карта</a>`; }
            html += `<tr style="${rowStyle}"><td><b>${timeStr}</b></td><td>${actionHtml}</td><td>${locHtml}</td><td>${noteHtml}</td></tr>`;
        });
        tbody.innerHTML = html;
    } catch(err) { tbody.innerHTML = `<tr><td colspan="4" style="color:red;">Грешка: ${err.message}</td></tr>`; }
}

async function loadWorkerWork() {
    const tbody = document.getElementById('workerWorkList'); tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Зареждане...</td></tr>';
    try {
        const { data: pData } = await client.from('personal').select('Име').eq('Имейл', currentFolderEmail).limit(1);
        let operatorName = (pData && pData.length > 0) ? pData[0]['Име'] : null;
        
        let query = client.from('otcheti').select('*');
        if (operatorName) {
            query = query.ilike('Оператор', `%${operatorName}%`);
        } else {
            query = query.ilike('Оператор', `%${currentFolderEmail}%`);
        }
        
        const { data, error } = await query.order('Дата', { ascending: false }).limit(50); if (error) throw error;
        if (!data || data.length === 0) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Няма отчетена работа.</td></tr>';
        else { let html = ''; data.forEach(r => { let d = new Date(r['Дата']).toLocaleDateString('bg-BG'); let statusColor = r['Статус'] === 'Брак' ? 'color:#dc2626; font-weight:800;' : 'color:#16a34a; font-weight:800;'; html += `<tr><td>${d}</td><td style="font-weight:800;">${r['ID Детайл']}</td><td>${r['Операция']}</td><td style="font-weight:800;">${r['Количество']}</td><td style="${statusColor}">${r['Статус']}</td></tr>`; }); tbody.innerHTML = html; }
    } catch(err) { tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Грешка: ${err.message}</td></tr>`; }
}

async function loadWorkerDocs() {
    const listDiv = document.getElementById('workerDocsList'); listDiv.innerHTML = 'Зареждане на файлове...';
    try {
        const { data, error } = await client.storage.from('dosieta').list(currentFolderEmail); if (error) throw error;
        if (!data || data.length === 0) { listDiv.innerHTML = '<div style="color:#94a3b8; text-align:center;">Няма качени документи.</div>'; return; }
        let html = '';
        for (let file of data) {
            if (file.name === '.emptyFolderPlaceholder') continue;
            const { data: urlData } = await client.storage.from('dosieta').createSignedUrl(`${currentFolderEmail}/${file.name}`, 3600);
            html += `<div class="doc-item"><a href="${urlData.signedUrl}" target="_blank">📄 ${file.name}</a><button onclick="deleteWorkerDoc('${file.name}')" style="background:transparent; border:none; color:#ef4444; cursor:pointer;">🗑️</button></div>`;
        }
        listDiv.innerHTML = html;
    } catch(err) { listDiv.innerHTML = `<div style="color:red;">Липсва Storage bucket "dosieta" (${err.message})</div>`; }
}

async function uploadWorkerDoc() { const fileInput = document.getElementById('docUploadInput'); const file = fileInput.files[0]; if (!file) { Swal.fire('Внимание', 'Моля, изберете файл.', 'warning'); return; } Swal.fire({ title: 'Качване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() }); try { const { error } = await client.storage.from('dosieta').upload(`${currentFolderEmail}/${file.name}`, file, { upsert: true }); if (error) throw error; Swal.fire({ icon: 'success', title: 'Качен!', timer: 1000, showConfirmButton: false }); fileInput.value = ''; loadWorkerDocs(); } catch(err) { Swal.fire('Грешка', err.message, 'error'); } }
async function deleteWorkerDoc(fileName) { if (!confirm(`Изтриване на ${fileName}?`)) return; try { const { error } = await client.storage.from('dosieta').remove([`${currentFolderEmail}/${fileName}`]); if (error) throw error; loadWorkerDocs(); } catch(err) { alert('Грешка: ' + err.message); } }

async function runInvisibleAutoCheckout() {
    try {
        const { data, error } = await client.from('chekiraniya').select('*').in('Действие', ['Влизане', 'Излизане', 'Авто излизане']).order('Време', { ascending: false }).limit(2000); if(error) return;
        let userState = {}; let userLastTime = {}; 
        data.forEach(r => { 
            if (!userState[r['Имейл']]) {
                userState[r['Имейл']] = r['Действие']; 
                userLastTime[r['Имейл']] = r['Време']; 
            }
        }); 
        let toCheckout = []; let now = new Date();
        for(let email in userState) {
            if(userState[email] === 'Влизане') {
                let loginTime = new Date(userLastTime[email]);
                if (loginTime.toDateString() !== now.toDateString() || (now.getHours() >= 17 && loginTime.getHours() < 17)) {
                    let checkoutTime = new Date(loginTime); checkoutTime.setHours(17, 0, 0, 0);
                    toCheckout.push({ 'Имейл': email, 'Действие': 'Авто излизане', 'Време': checkoutTime.toISOString(), 'Локация': 'Системно', 'Бележка': 'Авто корекция (Липсва излизане)' });
                }
            }
        }
        if(toCheckout.length > 0) { 
            await client.from('chekiraniya').insert(toCheckout); 
            
            const { data: pData } = await client.from('personal').select('Име, Имейл');
            let emailToName = {};
            if (pData) {
                pData.forEach(p => { emailToName[p['Имейл']] = p['Име']; });
            }
            
            for (let item of toCheckout) {
                let email = item['Имейл'];
                let name = emailToName[email];
                if (name) {
                    await client.from('otcheti').delete().eq('Оператор', name).eq('Статус', 'Започната');
                }
                await client.from('otcheti').delete().ilike('Оператор', `%${email}%`).eq('Статус', 'Започната');
            }
            
            loadCurrentTableData(); 
        }
    } catch(e) { console.error("Auto checkout error", e); }
}
