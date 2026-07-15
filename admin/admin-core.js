window.onload = () => {
    if (sessionStorage.getItem('is_admin_logged') !== 'true') {
        Swal.fire({ title: '🔐 Системен достъп', text: 'Въведете административен PIN код', input: 'password', allowOutsideClick: false, allowEscapeKey: false, showCancelButton: false, confirmButtonText: 'ВХОД', confirmButtonColor: '#4338ca'
        }).then((result) => {
            if (result.value === ADMIN_PIN) { sessionStorage.setItem('is_admin_logged', 'true'); document.getElementById('appContent').style.display = 'block'; initializeApp(); 
            } else { Swal.fire('Грешен код!', 'Опитайте отново.', 'error').then(() => location.reload()); }
        });
    } else { document.getElementById('appContent').style.display = 'block'; initializeApp(); }
};

let globalActivePlansForDropdown = [];

function initializeApp() { 
    client.from('plan').select('id, Вътрешно име').in('Статус', ['Активен']).then(res => {
        if (res.data) globalActivePlansForDropdown = res.data;
    });
    buildNavbar(); loadCurrentTableData(); runInvisibleAutoCheckout(); 
}

function buildNavbar() {
  const container = document.getElementById('tabsContainer'); container.innerHTML = '';
  Object.keys(tableConfigs).forEach(key => {
    const btn = document.createElement('button'); btn.className = `tab-btn ${key === currentTab ? 'active' : ''}`;
    btn.innerText = tableConfigs[key].label; btn.onclick = () => switchTab(key); container.appendChild(btn);
  });
}

function switchTab(tabKey) {
  currentTab = tabKey; buildNavbar(); document.getElementById('searchInput').value = '';
  selectedIndices.clear(); updateMassActionBar();
  
  const config = tableConfigs[tabKey]; const addBtn = document.getElementById('addNewBtn');
  const pdfBtn = document.getElementById('pdfBtn'); const logBtn = document.getElementById('logisticsBtn'); const sidebar = document.getElementById('personnelSidebar');
  
  addBtn.innerText = `➕ Нов запис в ${config.label.replace(/[^а-яА-Я ]/g, '').trim()}`; 
  addBtn.style.display = (config.readOnlyTab && tabKey !== 'sklad_gp' && tabKey !== 'sklad_wip') ? 'none' : 'flex';
  if (pdfBtn) pdfBtn.style.display = (tabKey === 'plan') ? 'flex' : 'none';
  if (logBtn) logBtn.style.display = (tabKey === 'plan') ? 'flex' : 'none';

  // Тук прехвърлихме показването на папките само когато сме в менюто Персонал
  if (tabKey === 'personal') { sidebar.style.display = 'block'; loadPersonnelSidebar(); } else { sidebar.style.display = 'none'; }
  loadCurrentTableData();
}

function toggleSelectAll(event) {
    const isChecked = event.target.checked; const checkboxes = document.querySelectorAll('.row-cb');
    checkboxes.forEach(cb => { cb.checked = isChecked; const idx = parseInt(cb.dataset.index); if (isChecked) selectedIndices.add(idx); else selectedIndices.delete(idx); });
    updateMassActionBar();
}

function toggleRowSelection(event, trueIndex) {
    if (event.target.checked) selectedIndices.add(trueIndex); else selectedIndices.delete(trueIndex);
    const allCheckbox = document.getElementById('selectAllCb');
    if (allCheckbox) { const visibleCheckboxes = document.querySelectorAll('.row-cb'); const allChecked = Array.from(visibleCheckboxes).every(cb => cb.checked); allCheckbox.checked = visibleCheckboxes.length > 0 && allChecked; }
    updateMassActionBar();
}

function updateMassActionBar() {
    const bar = document.getElementById('massActionBar'); const text = document.getElementById('massActionText');
    if (selectedIndices.size > 0 && !tableConfigs[currentTab].readOnlyTab) { text.innerText = `Маркирани: ${selectedIndices.size} записа`; bar.style.display = 'flex'; } else { bar.style.display = 'none'; }
}

async function deleteSelectedItems() {
    const config = tableConfigs[currentTab]; const count = selectedIndices.size;
    const res = await Swal.fire({ title: `Изтриване на ${count} записа?`, text: "Това действие е безвъзвратно!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Да, изтрий всички!', cancelButtonText: 'Отказ' });
    if (res.isConfirmed) { 
        try { 
            Swal.fire({title: 'Изтриване...', allowOutsideClick: false, didOpen: () => Swal.showLoading()}); 
            const keysToDelete = Array.from(selectedIndices).map(idx => globalRows[idx][config.key]);
            const { error } = await client.from(config.table).delete().in(config.key, keysToDelete); 
            if (error) throw error; 
            selectedIndices.clear(); updateMassActionBar();
            Swal.fire({icon: 'success', title: 'Изтрити!', timer: 1500, showConfirmButton: false}); loadCurrentTableData(); 
        } catch(err) { Swal.fire('Грешка', err.message, 'error'); } 
    }
}

async function loadCurrentTableData() {
  const config = tableConfigs[currentTab]; document.getElementById('loadingLayout').style.display = 'block'; document.getElementById('mainTable').style.display = 'none';
  selectedIndices.clear(); updateMassActionBar();
  try {
      let query;
      if (currentTab === 'sklad_gp' || currentTab === 'sklad_wip') {
          query = client.from('plan').select('id').limit(1); // dummy query
      } else {
          query = client.from(config.table).select('*').limit(10000);
          if (currentTab === 'otcheti') query = query.order('Дата', { ascending: false });
          if (currentTab === 'chekiraniya') query = query.order('Време', { ascending: false });
      }
      const { data, error } = await query; if (error) throw error;
      let rows = data || [];
      if (currentTab === 'plan') {
          const nomRes = await client.from('Номенклатура').select('*');
          if (!nomRes.error && nomRes.data) {
              const nomMap = {};
              nomRes.data.forEach(n => { 
                  if (n['Вътрешно име']) nomMap[n['Вътрешно име']] = n['ID Детайл']; 
                  if (n['ID Детайл']) nomMap[n['ID Детайл']] = n['ID Детайл'];
              });
              rows.forEach(r => { 
                  r['ID Детайл'] = nomMap[r['Вътрешно име']] || r['Вътрешно име']; 
              });
          }

      } else if (currentTab === 'otcheti') {
          const planRes = await client.from('plan').select('id, "Вътрешно име", "Месец", "Година"');
          if (!planRes.error && planRes.data) {
              const planMap = {};
              planRes.data.forEach(p => {
                  let m = (p['Месец'] && p['Година']) ? `${p['Месец']} ${p['Година']}` : '';
                  planMap[p.id] = m ? `${m} (${p['Вътрешно име']})` : p['Вътрешно име'];
              });
              rows.forEach(r => {
                  if (r['ID План'] && planMap[r['ID План']]) {
                      r['ID План'] = planMap[r['ID План']];
                  }
              });
          }
      } else if (currentTab === 'sklad_gp') {
          rows = await computeSkladData(true);
      } else if (currentTab === 'sklad_wip') {
          rows = await computeSkladData(false);
      }
      globalRows = rows; filterTable();
  } catch (err) { document.getElementById('loadingLayout').innerHTML = '❌ Грешка: ' + err.message; }
}

function renderDynamicTable(itemsToRender = null) {
  currentRenderedRows = itemsToRender || globalRows; const config = tableConfigs[currentTab]; document.getElementById('loadingLayout').style.display = 'none';
  const table = document.getElementById('mainTable'); const thead = document.getElementById('tableHead'); const tbody = document.getElementById('tableBody');
  thead.innerHTML = ''; tbody.innerHTML = ''; const headerRow = document.createElement('tr');
  
  if (!config.readOnlyTab) {
      const thCheck = document.createElement('th');
      thCheck.style.width = '40px'; thCheck.style.textAlign = 'center';
      thCheck.innerHTML = `<input type="checkbox" id="selectAllCb" class="row-checkbox" onchange="toggleSelectAll(event)">`;
      headerRow.appendChild(thCheck);
  }

  config.fields.forEach(f => { if (f.hideOnAdd) return; const th = document.createElement('th'); th.innerText = f.label || f.name; headerRow.appendChild(th); });
  if (!config.readOnlyTab || currentTab === 'sklad_gp' || currentTab === 'sklad_wip') { const thActions = document.createElement('th'); thActions.innerText = 'Действия'; thActions.style.textAlign = 'center'; headerRow.appendChild(thActions); }
  thead.appendChild(headerRow);
  
  if (currentRenderedRows.length === 0) { tbody.innerHTML = `<tr><td colspan="${config.fields.length + (config.readOnlyTab && currentTab !== 'sklad_gp' && currentTab !== 'sklad_wip' ? 0 : 2)}" style="text-align:center; padding:40px;">Няма данни.</td></tr>`; table.style.display = 'table'; return; }

  currentRenderedRows.forEach((item) => {
    const row = document.createElement('tr'); const trueIndex = globalRows.indexOf(item);
    if (currentTab === 'chekiraniya') {
       let isLate = false; if (item['Действие'] === 'Влизане' && item['Време']) { let d = new Date(item['Време']); if (d.getHours() > 8 || (d.getHours() === 8 && d.getMinutes() > 0)) isLate = true; }
       if (isLate || (item['Бележка'] && item['Бележка'].includes('ИЗВЪН ОБЕКТА'))) { row.style.backgroundColor = '#fef2f2'; row.style.borderLeft = '5px solid #ef4444'; }
       else if (item['Действие'] === 'Авто излизане') { row.style.backgroundColor = '#fffbeb'; row.style.borderLeft = '5px solid #f59e0b'; }
    }
    if (currentTab === 'personal') {
        if (item['Статус'] === 'Блокиран') { row.style.backgroundColor = '#fef2f2'; row.style.color = '#991b1b'; }
    }

    if (!config.readOnlyTab) {
        const tdCheck = document.createElement('td'); tdCheck.style.textAlign = 'center';
        const isChecked = selectedIndices.has(trueIndex) ? 'checked' : '';
        tdCheck.innerHTML = `<input type="checkbox" class="row-checkbox row-cb" data-index="${trueIndex}" onchange="toggleRowSelection(event, ${trueIndex})" ${isChecked}>`;
        row.appendChild(tdCheck);
    }

    config.fields.forEach(f => {
      if (f.hideOnAdd) return; const td = document.createElement('td'); let val = item[f.name] !== undefined && item[f.name] !== null ? item[f.name] : '';
      
      if (currentTab === 'personal' && f.name === 'Статус') {
          if (val === 'Активен') td.innerHTML = `<span style="background:#dcfce7; color:#15803d; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">🟢 ${val}</span>`;
          else td.innerHTML = `<span style="background:#fee2e2; color:#b91c1c; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">🛑 ${val}</span>`;
          row.appendChild(td); return;
      }

      if ((f.name === 'Време' || f.name === 'Дата') && val) { try { td.innerHTML = `<b>${new Date(val).toLocaleString('bg-BG')}</b>`; } catch(e) { td.innerText = val; } row.appendChild(td); return; }
      if (currentTab === 'chekiraniya' && f.name === 'Действие') {
          if (val === 'Влизане') td.innerHTML = `<span style="background:#dcfce7; color:#15803d; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">🟢 ${val}</span>`;
          else if (val === 'Излизане') td.innerHTML = `<span style="background:#fee2e2; color:#b91c1c; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">🔴 ${val}</span>`;
          else if (val === 'Авто излизане') td.innerHTML = `<span style="background:#fef3c7; color:#b45309; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">🕒 ${val}</span>`;
          else td.innerText = val; row.appendChild(td); return;
      }
      if (currentTab === 'chekiraniya' && f.name === 'Локация' && val && val.includes(',')) { let coords = val.replace(/\s/g, ''); td.innerHTML = `<a href="https://www.google.com/maps?q=${coords}" target="_blank" style="color:#2563eb; font-weight:bold; text-decoration:none;">📍 Карта</a>`; row.appendChild(td); return; }
      if (currentTab === 'chekiraniya' && f.name === 'Бележка' && val.includes('ИЗВЪН ОБЕКТА')) { td.innerHTML = `⚠️ <b style="color:#dc2626;">${val}</b>`; row.appendChild(td); return; }
      if (typeof val === 'string' && val.startsWith('http')) { td.innerHTML = `<a href="${val}" target="_blank" style="background:#e0e7ff; color:#4338ca; padding:5px 12px; border-radius:6px; font-weight:800; text-decoration:none; font-size:0.85em; display:inline-block;">🔗 Отвори</a>`; row.appendChild(td); return; }
      if (currentTab === 'plan' && f.name === 'ID Детайл' && val) {
          let safeVal = String(val).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
          td.innerHTML = `<button onclick="openResolverTree('${safeVal}')" style="background:none; border:none; color:#2563eb; font-weight:900; text-decoration:underline; cursor:pointer; font-size:1em; padding:0;">${val}</button>`;
          row.appendChild(td); return;
      }
      td.innerText = val; row.appendChild(td);
    });
      if (!config.readOnlyTab || currentTab === 'sklad_gp' || currentTab === 'sklad_wip') {
          const tdActions = document.createElement('td'); tdActions.style.textAlign = 'center';
          tdActions.innerHTML = `<button class="action-btn btn-edit" onclick="openEditModal(${trueIndex})">✏️</button><button class="action-btn btn-delete" onclick="deleteItem(${trueIndex})">🗑️</button>`;
          row.appendChild(tdActions);
      }
    tbody.appendChild(row);
  });
  table.style.display = 'table';
  
  const allCheckbox = document.getElementById('selectAllCb');
  if (allCheckbox) {
      const visibleCheckboxes = document.querySelectorAll('.row-cb');
      const allChecked = visibleCheckboxes.length > 0 && Array.from(visibleCheckboxes).every(cb => cb.checked);
      allCheckbox.checked = allChecked;
  }
}

function filterTable() { const q = document.getElementById('searchInput').value.toLowerCase().trim(); if(!q) { renderDynamicTable(); return; } const f = globalRows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q))); renderDynamicTable(f); }

let globalNomenclatureCodes = [];

function filterSkladDetails(val) {
    let dropdown = document.getElementById('skladDetailDropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    let q = val.toLowerCase().trim();
    if (!q) { dropdown.style.display = 'none'; return; }
    
    let matches = globalNomenclatureCodes.filter(code => code.toLowerCase().includes(q));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    
    matches.slice(0, 50).forEach(match => {
        let div = document.createElement('div');
        div.style.padding = '8px 12px';
        div.style.cursor = 'pointer';
        div.style.borderBottom = '1px solid #f1f5f9';
        div.innerText = match;
        div.onmouseover = () => div.style.backgroundColor = '#f8fafc';
        div.onmouseout = () => div.style.backgroundColor = 'transparent';
        div.onclick = () => {
            document.getElementById('inp_skladDetail').value = match;
            dropdown.style.display = 'none';
            loadSkladOperations(match);
        };
        dropdown.appendChild(div);
    });
    dropdown.style.display = 'block';
}

function buildForm(data = null) {
  const area = document.getElementById('formFieldsArea'); area.innerHTML = ''; const fields = tableConfigs[currentTab].fields;
  
  if (currentTab === 'sklad_gp' || currentTab === 'sklad_wip') {
      if (!isEditMode) {
          area.innerHTML = `
            <div class="form-group" style="position:relative;">
                <label>ID Детайл (Код):</label>
                <input type="text" id="inp_skladDetail" class="form-input" 
                    oninput="filterSkladDetails(this.value); loadSkladOperations(this.value);" 
                    onfocus="filterSkladDetails(this.value)" 
                    onblur="setTimeout(() => { let d = document.getElementById('skladDetailDropdown'); if(d) d.style.display = 'none'; }, 200)" 
                    required autocomplete="off">
                <div id="skladDetailDropdown" style="display:none; position:absolute; top:100%; left:0; width:100%; max-height:200px; overflow-y:auto; background:white; border:1px solid #cbd5e1; border-radius:4px; z-index:1000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);"></div>
            </div>
            <div class="form-group"><label>Операция:</label><select id="inp_skladOp" class="form-input" required><option value="">-- Въведете детайл първо --</option></select></div>
            <div class="form-group"><label>Количество за добавяне:</label><input type="number" id="inp_skladQty" class="form-input" step="any" min="1" required></div>
          `;
          
          if (globalNomenclatureCodes.length === 0) {
              client.from('Номенклатура').select('*').limit(100000).then(res => {
                  if (res.data) {
                      globalNomenclatureCodes = res.data.map(n => String(n['ID Детайл']).trim()).filter(Boolean);
                  }
              });
          }
      } else {
          area.innerHTML = `
            <div class="form-group"><label>ID Детайл (Код):</label><input type="text" id="inp_skladDetail" class="form-input" readonly style="background:#f1f5f9; color:#64748b;"></div>
            <div class="form-group"><label>Операция:</label><input type="text" id="inp_skladOp" class="form-input" readonly style="background:#f1f5f9; color:#64748b;"><input type="hidden" id="inp_skladRealOp"></div>
            <div class="form-group"><label>Текуща наличност:</label><input type="number" id="inp_skladOldQty" class="form-input" readonly style="background:#f1f5f9; color:#64748b;"></div>
            <div class="form-group"><label>НОВА наличност:</label><input type="number" id="inp_skladQty" class="form-input" step="any" min="0" required></div>
            <div class="form-group"><label>Буфер (Минимално количество):</label><input type="number" id="inp_skladBuffer" class="form-input" step="any" min="0" required></div>
          `;
          document.getElementById('inp_skladDetail').value = data['ID Детайл'] || '';
          document.getElementById('inp_skladOp').value = data['Операция'] || '';
          document.getElementById('inp_skladRealOp').value = (currentTab === 'sklad_gp') ? (data['Оригинална Операция'] || data['Операция'] || '') : (data['Операция'] || '');
          document.getElementById('inp_skladOldQty').value = data['Наличност в цеха'] || 0;
          document.getElementById('inp_skladQty').value = data['Наличност в цеха'] || 0;
          document.getElementById('inp_skladBuffer').value = data['Минимално количество/Буфер'] || 0;
      }
      return;
  }

  fields.forEach(f => {
    if (f.hideOnAdd && !isEditMode) return; const group = document.createElement('div'); group.className = 'form-group'; const label = document.createElement('label'); label.innerText = f.label || f.name; group.appendChild(label); let input;
    if (f.type === 'select') { input = document.createElement('select'); f.options.forEach(opt => { const option = document.createElement('option'); option.value = opt; option.innerText = opt; input.appendChild(option); }); if (data && data[f.name]) input.value = data[f.name]; else if (f.def) input.value = f.def; } 
    else { input = document.createElement('input'); input.type = f.type === 'number' ? 'number' : 'text'; if (f.type === 'number') input.step = 'any'; if (data && data[f.name] !== undefined && data[f.name] !== null) input.value = data[f.name]; else if (f.def !== undefined) input.value = typeof f.def === 'function' ? f.def() : f.def; }
    input.id = 'inp_' + f.name; if (f.required) input.required = true;
    if (f.readonly || (isEditMode && f.readonlyOnEdit)) { input.readOnly = true; input.style.backgroundColor = '#f1f5f9'; input.style.color = '#64748b'; input.style.cursor = 'not-allowed'; if (f.type === 'select') input.disabled = true; }
    group.appendChild(input); area.appendChild(group);
  });
}

function openAddModal() { isEditMode = false; editingIndex = null; document.getElementById('modalTitle').innerHTML = '➕ Добавяне: ' + tableConfigs[currentTab].label.replace(/[^а-яА-Я ]/g, '').trim(); buildForm(); document.getElementById('modalBackdrop').style.display = 'flex'; }
function openEditModal(index) { isEditMode = true; editingIndex = index; document.getElementById('modalTitle').innerHTML = '✏️ Редакция: ' + tableConfigs[currentTab].label.replace(/[^а-яА-Я ]/g, '').trim(); buildForm(globalRows[index]); document.getElementById('modalBackdrop').style.display = 'flex'; }
function closeModal() { document.getElementById('modalBackdrop').style.display = 'none'; }

async function computeSkladData(isGpTab) {
    const [reportsRes, marshrutiRes, bomRes, nomRes, bufferRes, plansRes] = await Promise.all([
        client.from('otcheti').select('*').limit(100000),
        client.from('marshruti').select('*').order('№ Операция', {ascending: true}),
        client.from('bom').select('*'),
        client.from('Номенклатура').select('*'),
        client.from('sklad_bufferi').select('*'),
        client.from('plan').select('*')
    ]);
    
    let routesByDetail = {};
    (marshrutiRes.data || []).forEach(r => {
        let code = String(r['Код на детайла']).trim().toLowerCase();
        if(!routesByDetail[code]) routesByDetail[code] = [];
        routesByDetail[code].push(r);
    });
    
    let completedOps = {}; let scrappedOps = {}; let grossCompletedOps = {};
    
    let sortedReports = (reportsRes.data || []).map(r => {
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
                grossCompletedOps[key] = (grossCompletedOps[key]||0) + qty;
            }
        }
    });
    
    let trueDoneOps = {}; let grossTrueDoneOps = {}; let shippedQty = {};
    
    Object.keys(routesByDetail).forEach(code => {
        let routes = routesByDetail[code];
        if(routes.length === 0) return;
        let lastOpKey = code + '_' + String(routes[routes.length-1]['Име на операция']).trim().toLowerCase();
        trueDoneOps[lastOpKey] = completedOps[lastOpKey] || 0;
        grossTrueDoneOps[lastOpKey] = grossCompletedOps[lastOpKey] || 0;
        for(let i = routes.length - 2; i >= 0; i--) {
            let opKey = code + '_' + String(routes[i]['Име на операция']).trim().toLowerCase();
            let nextOpKey = code + '_' + String(routes[i+1]['Име на операция']).trim().toLowerCase();
            trueDoneOps[opKey] = Math.max(completedOps[opKey] || 0, (grossTrueDoneOps[nextOpKey] || 0) + (scrappedOps[nextOpKey] || 0));
            grossTrueDoneOps[opKey] = Math.max(grossCompletedOps[opKey] || 0, (grossTrueDoneOps[nextOpKey] || 0) + (scrappedOps[nextOpKey] || 0));
        }
        shippedQty[code] = Math.max(0, (grossTrueDoneOps[lastOpKey] || 0) - (trueDoneOps[lastOpKey] || 0));
    });
    
    let totalShippedCache = {};
    function getTotalShipped(item, visited = new Set()) {
        let lc = item.toLowerCase();
        if(totalShippedCache[lc] !== undefined) return totalShippedCache[lc];
        if(visited.has(lc)) return 0; visited.add(lc);
        let direct = shippedQty[lc] || 0; let indirect = 0;
        let parents = (bomRes.data || []).filter(b => String(b['ID Компонент']).trim().toLowerCase() === lc);
        parents.forEach(p => {
            let parentCode = String(p['ID Родител']).trim().toLowerCase();
            if(parentCode !== lc) indirect += getTotalShipped(parentCode, new Set(visited)) * (parseFloat(p['Количество'])||1);
        });
        totalShippedCache[lc] = direct + indirect; return totalShippedCache[lc];
    }
    
    let bufferMap = {}; (bufferRes.data || []).forEach(b => { bufferMap[String(b['ID Детайл']).trim().toLowerCase()] = parseFloat(b['Буфер']) || 0; });
    let nomNameMap = {}; (nomRes.data || []).forEach(n => { nomNameMap[String(n['ID Детайл']).trim().toLowerCase()] = n['Вътрешно име'] || n['ID Детайл']; });
    let planNames = {}; (plansRes.data || []).forEach(p => { planNames[String(p.id).trim()] = p['Вътрешно име'] || p.id; });
    
    let rows = [];
    Object.keys(routesByDetail).forEach(code => {
        let routes = routesByDetail[code];
        if(routes.length === 0) return;
        let consumedByShipped = getTotalShipped(code);
        routes.forEach((route, idx) => {
            let opName = String(route['Име на операция']).trim();
            let opKey = code + '_' + opName.toLowerCase();
            let myGrossDone = grossTrueDoneOps[opKey] || 0;
            let doneQty = Math.max(0, myGrossDone - consumedByShipped);
            
            let availableStock = 0;
            if (idx === routes.length - 1) {
                if (isGpTab) availableStock = doneQty;
            } else {
                if (!isGpTab) {
                    let nextOpKey = code + '_' + String(routes[idx+1]['Име на операция']).trim().toLowerCase();
                    let nextOpDone = grossTrueDoneOps[nextOpKey] || 0;
                    availableStock = Math.max(0, doneQty - nextOpDone);
                }
            }
            
            if (availableStock > 0 || (bufferMap[code] > 0 && isGpTab && idx === routes.length - 1)) {
                rows.push({
                    "ID План": "Общо налично",
                    "RawPlanId": "",
                    "ID Детайл": route['Код на детайла'],
                    "Име": nomNameMap[code] || route['Код на детайла'],
                    "Операция": opName,
                    "Оригинална Операция": opName,
                    "Наличност в цеха": availableStock,
                    "Минимално количество/Буфер": bufferMap[code] || 0
                });
            }
        });
    });
    return rows;
}

async function saveForm(e) {
  e.preventDefault(); const config = tableConfigs[currentTab]; const btn = e.target.querySelector('button[type="submit"]'); btn.innerText = 'Записване...'; btn.disabled = true; 
  
  if (currentTab === 'sklad_gp' || currentTab === 'sklad_wip') {
      try {
          if (!isEditMode) {
              const det = document.getElementById('inp_skladDetail').value.trim();
              const op = document.getElementById('inp_skladOp').value.trim();
              const qty = parseFloat(document.getElementById('inp_skladQty').value) || 0;
              if (!det || !op || qty <= 0) throw new Error("Моля, попълнете всички полета коректно.");
              
              let payload = { "ID План": null, "ID Детайл": det, "Операция": op, "Количество": qty, "Статус": "Отчетено", "Оператор": "СИСТЕМА (Ръчно добавен)", "Дата": new Date().toISOString() };
              const { error } = await client.from('otcheti').insert([payload]); 
              if (error) throw error; 
              
              Swal.fire({icon: 'success', title: 'Успешно добавено в склада!', timer: 1500, showConfirmButton: false});
          } else {
              const det = document.getElementById('inp_skladDetail').value;
              const realOpEl = document.getElementById('inp_skladRealOp');
              const op = (realOpEl && realOpEl.value) ? realOpEl.value : document.getElementById('inp_skladOp').value;
              const oldQty = parseFloat(document.getElementById('inp_skladOldQty').value) || 0;
              const newQty = parseFloat(document.getElementById('inp_skladQty').value) || 0;
              const newBuffer = parseFloat(document.getElementById('inp_skladBuffer').value) || 0;
              const diff = newQty - oldQty;
              
              if (diff !== 0) {
                  let payload = { "ID План": null, "ID Детайл": det, "Операция": op, "Количество": diff, "Статус": "Отчетено", "Оператор": "СИСТЕМА (Корекция наличност)", "Дата": new Date().toISOString() };
                  const { error } = await client.from('otcheti').insert([payload]); 
                  if (error) throw error; 
              }
              
              await client.from('sklad_bufferi').delete().eq('ID Детайл', det);
              const { error: bufError } = await client.from('sklad_bufferi').insert([{ "ID Детайл": det, "Операция": op, "Буфер": newBuffer }]);
              if (bufError) throw bufError;
              
              Swal.fire({icon: 'success', title: 'Успешен запис!', timer: 1500, showConfirmButton: false});
          }
          closeModal(); loadCurrentTableData();
      } catch (err) { Swal.fire('Грешка', err.message, 'error'); } finally { btn.innerText = 'Запази запис'; btn.disabled = false; }
      return;
  }

  let payload = {};
  config.fields.forEach(f => { const el = document.getElementById('inp_' + f.name); if (el && !f.readonly && !(isEditMode && f.readonlyOnEdit)) { let val = el.value; if (f.type === 'number') val = parseFloat(val) || 0; payload[f.name] = val; } });
  try {
    if (currentTab === 'plan' && payload['Статус'] === '🚚 Изпратен') {
        let oldStatus = isEditMode ? globalRows[editingIndex]['Статус'] : null;
        if (oldStatus !== '🚚 Изпратен') {
            let detailID = payload['ID Детайл'];
            if (!detailID && isEditMode) detailID = globalRows[editingIndex]['ID Детайл'];
            let qtyToDeduct = payload['Целево количество'] || 0;
            
            Swal.fire({title: 'Проверка на маршрут и наличности...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
            
            const { data: routeData, error: routeErr } = await client.from('marshruti').select('*').eq('Код на детайла', detailID);
            if (routeErr) throw routeErr;
            
            let selectedOp = '';
            if (routeData && routeData.length > 0) {
                routeData.sort((a, b) => (parseInt(a['№ Операция']) || 0) - (parseInt(b['№ Операция']) || 0));
                selectedOp = String(routeData[routeData.length - 1]['Име на операция']).trim();
            } else {
                Swal.close();
                throw new Error("Не е намерена маршрутна карта за този детайл. Не може да се определи последната операция!");
            }
            
            const { data: stockData, error: stockErr } = await client.from('computed_sklad_gp').select('*').eq('ID Детайл', detailID).eq('Операция', selectedOp);
            if (stockErr) throw stockErr;
            
            let availableStock = 0;
            if (stockData && stockData.length > 0) {
                availableStock = parseFloat(stockData[0]['Наличност в цеха']) || 0;
            }
            
            if (availableStock < qtyToDeduct) {
                Swal.close();
                throw new Error(`Няма достатъчно завършени бройки на последната операция (${selectedOp})! Налични: ${availableStock} бр., Опитвате да изпратите: ${qtyToDeduct} бр.`);
            }
            
            Swal.fire({title: 'Изписване от склад...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
            let otchetiPayload = { "ID План": null, "ID Детайл": detailID, "Операция": selectedOp, "Количество": -qtyToDeduct, "Статус": "Отчетено", "Оператор": "СИСТЕМА (Експедиция)", "Дата": new Date().toISOString() };
            const { error: otchetiErr } = await client.from('otcheti').insert([otchetiPayload]);
            if (otchetiErr) throw otchetiErr;
        }
    }

    if (isEditMode) { 
        const row = globalRows[editingIndex]; 
        const keyVal = row[config.key]; 
        if (config.table === 'computed_sklad_gp' || config.table === 'computed_sklad_wip') {
            let oldQty = parseFloat(row['Наличност в цеха']) || 0;
            let newQty = parseFloat(payload['Наличност в цеха']) || 0;
            let delta = newQty - oldQty;
            if (delta !== 0) {
                let opName = config.table === 'computed_sklad_gp' ? (row['Оригинална Операция'] || row['Операция']) : row['Операция'];
                let planIdVal = document.getElementById('inp_skladPlanId').value || null;
                let otchetiPayload = {
                    "ID План": planIdVal,
                    "ID Детайл": row['ID Детайл'],
                    "Операция": opName,
                    "Количество": delta,
                    "Статус": "Отчетено",
                    "Оператор": "СИСТЕМА (Корекция наличност)",
                    "Дата": new Date().toISOString()
                };
                const { error } = await client.from('otcheti').insert([otchetiPayload]);
                if (error) throw error;
            }
            Swal.fire({icon: 'success', title: 'Наличността е коригирана!', timer: 1500, showConfirmButton: false});
        } else {
            const { error } = await client.from(config.table).update(payload).eq(config.key, keyVal); 
            if (error) throw error; 
            Swal.fire({icon: 'success', title: 'Успешно запазено!', timer: 1000, showConfirmButton: false}); 
        }
    } 
    else { const { error } = await client.from(config.table).insert([payload]); if (error) throw error; Swal.fire({icon: 'success', title: 'Успешно добавено!', timer: 1000, showConfirmButton: false}); }
    closeModal(); loadCurrentTableData();
  } catch (err) { Swal.fire('Грешка', err.message, 'error'); } finally { btn.innerText = 'Запази запис'; btn.disabled = false; }
}

async function deleteItem(index) {
  const config = tableConfigs[currentTab]; const row = globalRows[index]; 
  
  if (currentTab === 'sklad_gp' || currentTab === 'sklad_wip') {
      const res = await Swal.fire({ title: 'Нулиране на наличността?', text: `Наличността за ${row['ID Детайл']} (${row['Операция']}) ще бъде зададена на 0.`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Да, нулирай!', cancelButtonText: 'Отказ' });
      if (res.isConfirmed) { 
          try { 
              Swal.fire({title: 'Записване...', allowOutsideClick: false, didOpen: () => Swal.showLoading()}); 
              let opName = currentTab === 'sklad_gp' ? (row['Оригинална Операция'] || row['Операция']) : row['Операция'];
              let payload = { "ID План": null, "ID Детайл": row['ID Детайл'], "Операция": opName, "Количество": -(parseFloat(row['Наличност в цеха']) || 0), "Статус": "Отчетено", "Оператор": "СИСТЕМА (Нулиране)", "Дата": new Date().toISOString() };
              const { error } = await client.from('otcheti').insert([payload]); 
              if (error) throw error; 
              Swal.fire({icon: 'success', title: 'Изтрито!', timer: 1000, showConfirmButton: false}); 
              loadCurrentTableData(); 
          } catch(err) { Swal.fire('Грешка', err.message, 'error'); } 
      }
      return;
  }

  const keyVal = row[config.key];
  const res = await Swal.fire({ title: 'Сигурни ли сте?', text: "Записът ще бъде изтрит безвъзвратно!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Да, изтрий!', cancelButtonText: 'Отказ' });
  if (res.isConfirmed) { try { Swal.fire({title: 'Изтриване...', allowOutsideClick: false, didOpen: () => Swal.showLoading()}); const { error } = await client.from(config.table).delete().eq(config.key, keyVal); if (error) throw error; Swal.fire({icon: 'success', title: 'Изтрито!', timer: 1000, showConfirmButton: false}); loadCurrentTableData(); } catch(err) { Swal.fire('Грешка', err.message, 'error'); } }
}

async function loadSkladOperations(detailCode) {
    const sel = document.getElementById('inp_skladOp');
    if (!sel) return;
    if (!detailCode || detailCode.trim().length < 2) { sel.innerHTML = '<option value="">-- Въведете детайл първо --</option>'; return; }
    sel.innerHTML = '<option value="">Зареждане...</option>';
    try {
        const { data, error } = await client.from('marshruti').select('*').eq('Код на детайла', detailCode.trim());
        if (error) throw error;
        sel.innerHTML = '';
        if (!data || data.length === 0) { sel.innerHTML = '<option value="">Не са намерени операции</option>'; return; }
        
        data.sort((a, b) => (a['№ Операция'] || 0) - (b['№ Операция'] || 0));
        
        data.forEach(op => {
            const opt = document.createElement('option');
            opt.value = String(op['Име на операция']).trim();
            opt.innerText = String(op['Име на операция']).trim();
            sel.appendChild(opt);
        });
    } catch(err) {
        sel.innerHTML = '<option value="">' + (err.message || 'Грешка') + '</option>';
        console.error(err);
    }
}
window.openLogisticsModal = function() {
    if (currentTab !== 'plan') return;
    
    // Group active plan rows
    let plansMap = {};
    globalRows.forEach(row => {
        let key = row['Месец'] + ' ' + row['Година'];
        if (!plansMap[key]) plansMap[key] = { name: key, month: row['Месец'], year: row['Година'], total: 0, done: 0, packed: 0 };
        
        plansMap[key].total++;
        if (row['Статус'] === 'Завършен') plansMap[key].done++;
        if (row['Статус'] === 'Опакован') plansMap[key].packed++;
    });

    let html = '';
    let plansList = Object.values(plansMap).sort((a,b) => b.year - a.year || b.month - a.month);
    
    if (plansList.length === 0) {
        html = '<div style="text-align:center; padding:20px; color:#64748b;">Няма заредени планове.</div>';
    } else {
        plansList.forEach(p => {
            html += `<div style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:15px; margin-bottom:15px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-weight:bold; font-size:1.1em; margin-bottom:10px; color:#334155;">📅 План: Месец ${p.month} / ${p.year} (Общо ${p.total} детайла)</div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="font-size:0.95em;">
                        <div style="color:#059669; margin-bottom:4px;">🟢 Завършени: <b>${p.done}</b> бр.</div>
                        <div style="color:#0284c7;">📦 Опаковани: <b>${p.packed}</b> бр.</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <button class="btn-primary" ${p.done === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="window.massLogisticsAction('${p.month}', '${p.year}', 'Завършен', 'Опакован')" style="background:#0284c7; min-width:200px;">📦 Опаковай Завършените</button>
                        <button class="btn-primary" ${p.packed === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="window.massLogisticsAction('${p.month}', '${p.year}', 'Опакован', '🚚 Изпратен')" style="background:#f59e0b; min-width:200px;">🚚 Изпрати Опакованите</button>
                    </div>
                </div>
            </div>`;
        });
    }

    document.getElementById('logisticsContent').innerHTML = html;
    document.getElementById('logisticsModalBackdrop').style.display = 'flex';
};

window.massLogisticsAction = async function(month, year, fromStatus, toStatus) {
    const res = await Swal.fire({ title: 'Сигурни ли сте?', text: `Искате ли да промените всички детайли от статус '${fromStatus}' на '${toStatus}' за Месец ${month} / ${year}?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Да, продължи', cancelButtonText: 'Отказ' });
    if (!res.isConfirmed) return;

    try {
        Swal.fire({title: 'Обновяване...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        
        const { data, error } = await client.from('plan')
            .update({ 'Статус': toStatus })
            .eq('Месец', month).eq('Година', year).eq('Статус', fromStatus)
            .select('id');
            
        if (error) throw error;
        
        Swal.fire({icon: 'success', title: 'Успешно!', text: `Обновени са ${data ? data.length : 0} записа.`, timer: 2000, showConfirmButton: false});
        
        document.getElementById('logisticsModalBackdrop').style.display = 'none';
        loadCurrentTableData();
    } catch(err) {
        Swal.fire('Грешка', err.message, 'error');
    }
};
