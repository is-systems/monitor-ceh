window.onload = () => {
    if (sessionStorage.getItem('is_admin_logged') !== 'true') {
        Swal.fire({ title: '🔐 Системен достъп', text: 'Въведете административен PIN код', input: 'password', allowOutsideClick: false, allowEscapeKey: false, showCancelButton: false, confirmButtonText: 'ВХОД', confirmButtonColor: '#4338ca'
        }).then((result) => {
            if (result.value === ADMIN_PIN) { sessionStorage.setItem('is_admin_logged', 'true'); document.getElementById('appContent').style.display = 'block'; initializeApp(); 
            } else { Swal.fire('Грешен код!', 'Опитайте отново.', 'error').then(() => location.reload()); }
        });
    } else { document.getElementById('appContent').style.display = 'block'; initializeApp(); }
};

function initializeApp() { buildNavbar(); loadCurrentTableData(); runInvisibleAutoCheckout(); }

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
  const pdfBtn = document.getElementById('pdfBtn'); const sidebar = document.getElementById('personnelSidebar');
  
  addBtn.innerText = `➕ Нов запис в ${config.label.replace(/[^а-яА-Я ]/g, '').trim()}`; 
  addBtn.style.display = (config.readOnlyTab && tabKey !== 'sklad_gp') ? 'none' : 'flex';
  if (pdfBtn) pdfBtn.style.display = (tabKey === 'plan') ? 'flex' : 'none';

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
      let query = client.from(config.table).select('*').limit(10000);
      if (currentTab === 'otcheti') query = query.order('Дата', { ascending: false });
      if (currentTab === 'chekiraniya') query = query.order('Време', { ascending: false });
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
      } else if (currentTab === 'sklad_gp') {
          const bufferRes = await client.from('sklad_bufferi').select('*');
          if (!bufferRes.error && bufferRes.data) {
              const bufferMap = {};
              bufferRes.data.forEach(b => {
                  let bKey = String(b['ID Детайл']).trim() + '_' + String(b['Операция']).trim();
                  bufferMap[bKey] = parseFloat(b['Буфер']) || 0;
              });
              rows.forEach(r => {
                  let rKey = String(r['ID Детайл']).trim() + '_' + String(r['Операция']).trim();
                  r['Минимално количество/Буфер'] = bufferMap[rKey] || 0;
              });
          }
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
  if (!config.readOnlyTab || currentTab === 'sklad_gp') { const thActions = document.createElement('th'); thActions.innerText = 'Действия'; thActions.style.textAlign = 'center'; headerRow.appendChild(thActions); }
  thead.appendChild(headerRow);
  
  if (currentRenderedRows.length === 0) { tbody.innerHTML = `<tr><td colspan="${config.fields.length + (config.readOnlyTab && currentTab !== 'sklad_gp' ? 0 : 2)}" style="text-align:center; padding:40px;">Няма данни.</td></tr>`; table.style.display = 'table'; return; }

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

      if (currentTab === 'chekiraniya' && f.name === 'Време' && val) { try { td.innerHTML = `<b>${new Date(val).toLocaleString('bg-BG')}</b>`; } catch(e) { td.innerText = val; } row.appendChild(td); return; }
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
      if (!config.readOnlyTab || currentTab === 'sklad_gp') {
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
  
  if (currentTab === 'sklad_gp') {
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
            <div class="form-group"><label>ID Детайл (Код):</label><input type="text" id="inp_skladDetail" class="form-input" value="${data['ID Детайл']}" readonly style="background:#f1f5f9; color:#64748b;"></div>
            <div class="form-group"><label>Операция:</label><input type="text" id="inp_skladOp" class="form-input" value="${data['Операция']}" readonly style="background:#f1f5f9; color:#64748b;"></div>
            <div class="form-group"><label>Текуща наличност:</label><input type="number" id="inp_skladOldQty" class="form-input" value="${data['Наличност в цеха']}" readonly style="background:#f1f5f9; color:#64748b;"></div>
            <div class="form-group"><label>НОВА наличност:</label><input type="number" id="inp_skladQty" class="form-input" step="any" min="0" required value="${data['Наличност в цеха']}"></div>
            <div class="form-group"><label>Буфер (Минимално количество):</label><input type="number" id="inp_skladBuffer" class="form-input" step="any" min="0" required value="${data['Минимално количество/Буфер'] || 0}"></div>
          `;
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

async function saveForm(e) {
  e.preventDefault(); const config = tableConfigs[currentTab]; const btn = e.target.querySelector('button[type="submit"]'); btn.innerText = 'Записване...'; btn.disabled = true; 
  
  if (currentTab === 'sklad_gp') {
      try {
          if (!isEditMode) {
              const det = document.getElementById('inp_skladDetail').value.trim();
              const op = document.getElementById('inp_skladOp').value.trim();
              const qty = parseFloat(document.getElementById('inp_skladQty').value) || 0;
              if (!det || !op || qty <= 0) throw new Error("Моля, попълнете всички полета коректно.");
              
              let payload = { "ID Детайл": det, "Операция": op, "Количество": qty, "Статус": "Отчетено", "Оператор": "СИСТЕМА (Ръчно добавен)", "Дата": new Date().toISOString() };
              const { error } = await client.from('otcheti').insert([payload]); 
              if (error) throw error; 
              
              Swal.fire({icon: 'success', title: 'Успешно добавено в склада!', timer: 1500, showConfirmButton: false});
          } else {
              const det = document.getElementById('inp_skladDetail').value;
              const op = document.getElementById('inp_skladOp').value;
              const oldQty = parseFloat(document.getElementById('inp_skladOldQty').value) || 0;
              const newQty = parseFloat(document.getElementById('inp_skladQty').value) || 0;
              const newBuffer = parseFloat(document.getElementById('inp_skladBuffer').value) || 0;
              const diff = newQty - oldQty;
              
              if (diff !== 0) {
                  let payload = { "ID Детайл": det, "Операция": op, "Количество": diff, "Статус": "Отчетено", "Оператор": "СИСТЕМА (Корекция наличност)", "Дата": new Date().toISOString() };
                  const { error } = await client.from('otcheti').insert([payload]); 
                  if (error) throw error; 
              }
              
              await client.from('sklad_bufferi').delete().eq('ID Детайл', det).eq('Операция', op);
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
    if (isEditMode) { const row = globalRows[editingIndex]; const keyVal = row[config.key]; const { error } = await client.from(config.table).update(payload).eq(config.key, keyVal); if (error) throw error; Swal.fire({icon: 'success', title: 'Успешно запазено!', timer: 1000, showConfirmButton: false}); } 
    else { const { error } = await client.from(config.table).insert([payload]); if (error) throw error; Swal.fire({icon: 'success', title: 'Успешно добавено!', timer: 1000, showConfirmButton: false}); }
    closeModal(); loadCurrentTableData();
  } catch (err) { Swal.fire('Грешка', err.message, 'error'); } finally { btn.innerText = 'Запази запис'; btn.disabled = false; }
}

async function deleteItem(index) {
  const config = tableConfigs[currentTab]; const row = globalRows[index]; 
  
  if (currentTab === 'sklad_gp') {
      const res = await Swal.fire({ title: 'Нулиране на наличността?', text: `Наличността за ${row['ID Детайл']} (${row['Операция']}) ще бъде зададена на 0.`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Да, нулирай!', cancelButtonText: 'Отказ' });
      if (res.isConfirmed) { 
          try { 
              Swal.fire({title: 'Записване...', allowOutsideClick: false, didOpen: () => Swal.showLoading()}); 
              let payload = { "ID Детайл": row['ID Детайл'], "Операция": row['Операция'], "Количество": -(parseFloat(row['Наличност в цеха']) || 0), "Статус": "Отчетено", "Оператор": "СИСТЕМА (Нулиране)", "Дата": new Date().toISOString() };
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
