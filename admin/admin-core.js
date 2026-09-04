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
let globalColumnFilters = {};

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
  globalColumnFilters = {}; document.getElementById('tableHead').innerHTML = '';
  
  const config = tableConfigs[tabKey]; const addBtn = document.getElementById('addNewBtn');
  const pdfBtn = document.getElementById('pdfBtn'); const logBtn = document.getElementById('logisticsBtn'); const mrpBtn = document.getElementById('mrpBtn'); const sidebar = document.getElementById('personnelSidebar');
  
  addBtn.innerText = `➕ Нов запис в ${config.label.replace(/[^а-яА-Я ]/g, '').trim()}`; 
  addBtn.style.display = (config.readOnlyTab && tabKey !== 'sklad_gp' && tabKey !== 'sklad_wip') ? 'none' : 'flex';
  if (pdfBtn) pdfBtn.style.display = (tabKey === 'plan') ? 'flex' : 'none';
  if (logBtn) logBtn.style.display = (tabKey === 'plan') ? 'flex' : 'none';
  if (mrpBtn) mrpBtn.style.display = (tabKey === 'porachki') ? 'flex' : 'none';

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
          const packRes = await client.from('otcheti').select('*').ilike('Операция', 'Опаковане - Кашон №%').in('Статус', ['Отчетено', 'Изпратено']);
          if (!packRes.error && packRes.data) {
              const packMap = {};
              packRes.data.forEach(p => {
                  let pId = String(p['ID План'] || '').trim();
                  let code = String(p['ID Детайл']).trim().toUpperCase();
                  let key = pId + '_' + code;
                  if (!packMap[key]) packMap[key] = {};
                  let boxMatch = p['Операция'].match(/Опаковане - Кашон №\s*(.+)/i);
                  let boxNum = boxMatch ? boxMatch[1] : '?';
                  packMap[key][boxNum] = (packMap[key][boxNum] || 0) + (parseFloat(p['Количество']) || 0);
              });
              rows.forEach(r => {
                  let key = String(r.id).trim() + '_' + String(r['ID Детайл']).trim().toUpperCase();
                  if (packMap[key]) {
                      let boxTexts = Object.keys(packMap[key]).map(b => `${packMap[key][b]} бр в кашон № ${b}`);
                      r['__packaged_info'] = ` <span style="color:#d97706; font-size:0.85em; font-weight:bold;">(${boxTexts.join(', ')})</span>`;
                  }
              });
          }
          rows.sort((a, b) => {
              const statusWeight = (status) => {
                  let s = String(status || '').trim().toLowerCase();
                  if (s === 'изпратен' || s === 'завършен') return 1;
                  return 0;
              };
              let weightA = statusWeight(a['Статус']);
              let weightB = statusWeight(b['Статус']);
              if (weightA !== weightB) return weightA - weightB;
              return parseInt(b.id || 0) - parseInt(a.id || 0);
          });

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
      
      if (currentTab === 'sklad') {
          const nomRes = await client.from('Номенклатура').select('*');
          if (!nomRes.error && nomRes.data) {
              const nomMap = {};
              nomRes.data.forEach(n => { nomMap[String(n['ID Детайл']).trim().toLowerCase()] = n['Мерна единица'] || n['Единици']; });
              rows.forEach(r => {
                  let code = String(r['ID Детайл']).trim().toLowerCase();
                  if (nomMap[code]) r['Мерна единица'] = nomMap[code];
              });
          }
      }

      globalRows = rows; filterTable();
  } catch (err) { document.getElementById('loadingLayout').innerHTML = '❌ Грешка: ' + err.message; }
}

function renderDynamicTable(itemsToRender = null) {
  currentRenderedRows = itemsToRender || globalRows; const config = tableConfigs[currentTab]; document.getElementById('loadingLayout').style.display = 'none';
  const table = document.getElementById('mainTable'); const thead = document.getElementById('tableHead'); const tbody = document.getElementById('tableBody');
  if (thead.innerHTML === '') {
      const headerRow = document.createElement('tr');
      if (!config.readOnlyTab) {
          const thCheck = document.createElement('th');
          thCheck.style.width = '40px'; thCheck.style.textAlign = 'center';
          thCheck.innerHTML = `<input type="checkbox" id="selectAllCb" class="row-checkbox" onchange="toggleSelectAll(event)">`;
          headerRow.appendChild(thCheck);
      }

      config.fields.forEach(f => { 
          if (f.hideOnAdd) return; 
          const th = document.createElement('th'); 
          
          const labelDiv = document.createElement('div');
          labelDiv.innerText = f.label || f.name;
          th.appendChild(labelDiv);
          
          const filterInput = document.createElement('input');
          filterInput.type = 'text';
          filterInput.placeholder = '🔍 Филтър...';
          filterInput.style.width = '100%';
          filterInput.style.boxSizing = 'border-box';
          filterInput.style.marginTop = '6px';
          filterInput.style.padding = '4px 6px';
          filterInput.style.fontSize = '12px';
          filterInput.style.border = '1px solid #cbd5e1';
          filterInput.style.borderRadius = '4px';
          filterInput.style.fontWeight = 'normal';
          
          if (globalColumnFilters[f.name]) filterInput.value = globalColumnFilters[f.name];
          
          filterInput.oninput = (e) => {
              globalColumnFilters[f.name] = e.target.value.toLowerCase().trim();
              filterTable();
          };
          
          th.appendChild(filterInput);
          headerRow.appendChild(th); 
      });
      
      if (!config.readOnlyTab && currentTab !== 'sklad') { 
          const thActions = document.createElement('th'); thActions.innerText = 'Действие'; thActions.style.textAlign = 'center'; 
          headerRow.appendChild(thActions); 
      }
      thead.appendChild(headerRow);
  }

  tbody.innerHTML = '';
  
  if (currentRenderedRows.length === 0) { tbody.innerHTML = `<tr><td colspan="${config.fields.length + (config.readOnlyTab || currentTab === 'sklad' ? 0 : 2)}" style="text-align:center; padding:40px;">Няма данни.</td></tr>`; table.style.display = 'table'; return; }

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

      if ((f.name === 'Време' || f.name === 'Дата') && val) { try { let pVal = val; if (!pVal.endsWith('Z') && !pVal.includes('+')) pVal += 'Z'; td.innerHTML = `<b>${new Date(pVal).toLocaleString('bg-BG')}</b>`; } catch(e) { td.innerText = val; } row.appendChild(td); return; }
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
          if (item['__packaged_info']) td.innerHTML += item['__packaged_info'];
          row.appendChild(td); return;
      }
      if ((currentTab === 'sklad_gp' || currentTab === 'sklad_wip') && (f.name === 'Общо' || f.name === 'Минимално количество/Буфер') && typeof val === 'number' && val < 0) {
          td.innerHTML = `<span style="color:#dc2626; font-weight:bold;">${val}</span>`;
          row.appendChild(td); return;
      }
      td.innerText = val; 
      if (currentTab === 'plan' && f.name === 'Вътрешно име' && item['__packaged_info']) {
          td.innerHTML = val + item['__packaged_info'];
      }
      row.appendChild(td);
    });
      if (!config.readOnlyTab && currentTab !== 'sklad') {
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

function filterTable() { 
    const normalizeStr = (str) => String(str || '').replace(/[\u00A0\s]+/g, ' ').trim().toLowerCase();
    const q = normalizeStr(document.getElementById('searchInput').value); 
    let f = globalRows;
    
    if (q) {
        f = f.filter(r => Object.values(r).some(v => normalizeStr(v).includes(q)));
    }
    
    Object.keys(globalColumnFilters).forEach(col => {
        const colQ = globalColumnFilters[col];
        if (colQ) {
            f = f.filter(r => {
                let val = r[col];
                if ((col === 'Време' || col === 'Дата') && val) {
                     try { let pVal = val; if (!pVal.endsWith('Z') && !pVal.includes('+')) pVal += 'Z'; val = new Date(pVal).toLocaleString('bg-BG'); } catch(e) {}
                }
                return normalizeStr(val).includes(colQ);
            });
        }
    });
    
    renderDynamicTable(f); 
}

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
            <div class="form-group"><label>Количество (физическо):</label><input type="number" id="inp_skladQty" class="form-input" step="any" value="0" required></div>
            <div class="form-group"><label>Количество (буфер):</label><input type="number" id="inp_skladQtyBuffer" class="form-input" step="any" value="0" required></div>
            <div class="form-group"><label>Процент Брак (%):</label><input type="number" id="inp_skladScrap" class="form-input" step="any" min="0" placeholder="Без промяна"></div>
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
            <div class="form-group"><label>НОВА наличност:</label><input type="number" id="inp_skladQty" class="form-input" step="any" required></div>
            <div class="form-group"><label>Буфер (Минимално количество):</label><input type="number" id="inp_skladBuffer" class="form-input" step="any" required></div>
            <div class="form-group"><label>Процент Брак (%):</label><input type="number" id="inp_skladScrap" class="form-input" step="any" min="0" required></div>
          `;
          document.getElementById('inp_skladDetail').value = data['ID Детайл'] || '';
          document.getElementById('inp_skladOp').value = data['Операция'] || '';
          document.getElementById('inp_skladRealOp').value = (currentTab === 'sklad_gp') ? (data['Оригинална Операция'] || data['Операция'] || '') : (data['Операция'] || '');
          document.getElementById('inp_skladOldQty').value = data['Общо'] || 0;
          document.getElementById('inp_skladQty').value = data['Общо'] || 0;
          document.getElementById('inp_skladBuffer').value = data['Минимално количество/Буфер'] || 0;
          document.getElementById('inp_skladScrap').value = data['% Брак'] || 0;
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

async function fetchAll(table, orderCol) {
    let allData = [];
    let from = 0;
    const step = 1000;
    while(true) {
        let query = client.from(table).select('*').range(from, from + step - 1);
        if (orderCol) query = query.order(orderCol, {ascending: true});
        let { data, error } = await query;
        if (error || !data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < step) break;
        from += step;
    }
    return { data: allData };
}

async function computeSkladData(isGpTab) {
    const table = isGpTab ? 'inventory_gp' : 'inventory_wip';
    const [invRes, nomRes, bufferRes, routeRes] = await Promise.all([
        fetchAll(table),
        fetchAll('Номенклатура'),
        fetchAll('sklad_bufferi'),
        fetchAll('marshruti')
    ]);
    
    let bufferMap = {};
    let bufferScrapMap = {};
    if (bufferRes.data) {
        bufferRes.data.forEach(b => {
            let code = String(b['ID Детайл']).trim().toLowerCase();
            bufferMap[code] = parseFloat(b['Буфер']) || 0;
            bufferScrapMap[code] = parseFloat(b['% Брак']) || 0;
        });
    }
    
    let nomNameMap = {};
    let nomLocMap = {};
    if (nomRes.data) {
        nomRes.data.forEach(n => {
            let c = String(n['ID Детайл']).trim().toLowerCase();
            nomNameMap[c] = n['Вътрешно име'] || n['ID Детайл'];
            nomLocMap[c] = String(n['Местоположение'] || '').trim();
        });
    }
    
    let routeMap = {};
    let lastDropoffMap = {};
    if (routeRes.data) {
        let routeGroups = {};
        routeRes.data.forEach(r => {
            let code = String(r['Код на детайла']).trim().toLowerCase();
            let op = String(r['Име на операция']).trim().toLowerCase();
            let dropoff = String(r['Инструкция за оставяне'] || '').trim();
            if (dropoff) {
                if (!routeMap[code]) routeMap[code] = {};
                routeMap[code][op] = dropoff;
            }
            if (!routeGroups[code]) routeGroups[code] = [];
            routeGroups[code].push(r);
        });
        Object.keys(routeGroups).forEach(code => {
            let ops = routeGroups[code];
            ops.sort((a, b) => (parseInt(a['№ Операция']) || 0) - (parseInt(b['№ Операция']) || 0));
            let lastOpDropoff = String(ops[ops.length - 1]['Инструкция за оставяне'] || '').trim();
            if (lastOpDropoff) {
                lastDropoffMap[code] = lastOpDropoff;
            }
        });
    }
    
    let packingData = [];
    if (isGpTab) {
        let pRes = await client.from('otcheti')
            .select('*')
            .ilike('Операция', '%Опаковане%')
            .eq('Статус', 'Отчетено')
            .limit(100000);
        if (pRes.data) packingData = pRes.data;
    }
    
    let packedByDetail = {};
    let packedDetailsByBox = {};
    packingData.forEach(p => {
        let code = String(p['ID Детайл']).trim().toLowerCase();
        let qty = parseFloat(p['Количество']) || 0;
        let op = String(p['Операция']);
        let boxMatch = op.match(/Кашон №\s*(.+)/i);
        let box = boxMatch ? boxMatch[1].trim() : 'Неизвестен';
        
        if (!packedByDetail[code]) {
            packedByDetail[code] = 0;
            packedDetailsByBox[code] = {};
        }
        packedByDetail[code] += qty;
        packedDetailsByBox[code][box] = (packedDetailsByBox[code][box] || 0) + qty;
    });

    let rows = [];
    (invRes.data || []).forEach(item => {
        let code = String(item['ID Детайл']).trim().toLowerCase();
        let qty = parseFloat(item['Количество']) || 0;
        let buf = bufferMap[code] || 0;
        let scrap = bufferScrapMap[code] || 0;
        let opName = isGpTab ? 'Готов детайл' : (item['Операция'] || '');
        
        let reservedQty = packedByDetail[code] || 0;
        let freeQty = Math.max(0, qty - reservedQty);
        
        let reservedStr = "0";
        if (reservedQty > 0) {
            let boxTexts = [];
            Object.keys(packedDetailsByBox[code]).forEach(b => {
                boxTexts.push(`${packedDetailsByBox[code][b]} бр в Кашон №${b}`);
            });
            reservedStr = boxTexts.join(', ');
        }

        let loc = '';
        let opKey = String(item['Операция'] || '').trim().toLowerCase();
        if (isGpTab) {
            loc = nomLocMap[code] || lastDropoffMap[code] || 'Склад Готови Детайли';
        } else {
            loc = (routeMap[code] && routeMap[code][opKey]) ? routeMap[code][opKey] : 'Буфер';
        }

        let shouldShowEmpty = (buf > 0 || (scrap > 0 && scrap !== 20)) && isGpTab;

        if (qty > 0 || shouldShowEmpty || reservedQty > 0) {
            rows.push({
                "RawPlanId": "",
                "ID Детайл": item['ID Детайл'],
                "Име": nomNameMap[code] || item['ID Детайл'],
                "Локация": loc,
                "Операция": opName,
                "Оригинална Операция": opName,
                "Общо": qty,
                "Запазени": reservedStr,
                "Свободни": freeQty,
                "Минимално количество/Буфер": buf,
                "% Брак": scrap
            });
        }
    });
    
    if (isGpTab) {
        Object.keys(bufferMap).forEach(code => {
            let buf = bufferMap[code];
            let scrap = bufferScrapMap[code] || 0;
            let shouldShowEmpty = buf > 0 || (scrap > 0 && scrap !== 20);
            
            if (shouldShowEmpty && !rows.some(r => String(r['ID Детайл']).trim().toLowerCase() === code)) {
                rows.push({
                    "RawPlanId": "",
                    "ID Детайл": code.toUpperCase(),
                    "Име": nomNameMap[code] || code,
                    "Локация": nomLocMap[code] || lastDropoffMap[code] || 'Склад Готови Детайли',
                    "Операция": "Готов детайл",
                    "Оригинална Операция": "Готов детайл",
                    "Общо": 0,
                    "Запазени": "0",
                    "Свободни": 0,
                    "Минимално количество/Буфер": buf,
                    "% Брак": scrap
                });
            }
        });
    }
    
    return rows;
}



// backflushSimulation removed as it is no longer used

async function saveForm(e) {
  e.preventDefault(); const config = tableConfigs[currentTab]; const btn = e.target.querySelector('button[type="submit"]'); btn.innerText = 'Записване...'; btn.disabled = true; 
  
  if (currentTab === 'sklad_gp' || currentTab === 'sklad_wip') {
      try {
          if (!isEditMode) {
              const det = document.getElementById('inp_skladDetail').value.trim();
              const op = document.getElementById('inp_skladOp').value.trim();
              const qty = parseFloat(document.getElementById('inp_skladQty').value) || 0;
              const bufferQty = parseFloat(document.getElementById('inp_skladQtyBuffer').value) || 0;
              const scrapInput = document.getElementById('inp_skladScrap').value;
              const scrap = parseFloat(scrapInput) || 0;
              if (!det || !op || (qty === 0 && bufferQty === 0 && scrapInput === "")) throw new Error("Моля, въведете поне едно количество (физическо, буфер) или % брак.");
              
              if (qty !== 0) {
                  Swal.fire({title: 'Записване на наличности...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
                  
                  let cleanDet = det.toLowerCase();
                  let opName = op.trim().toLowerCase();
                  let tName = currentTab === 'sklad_gp' ? 'inventory_gp' : 'inventory_wip';
                  
                  const { data: routeData } = await client.from('marshruti').select('*').ilike('Код на детайла', cleanDet);
                  if (routeData && routeData.length > 0) {
                      routeData.sort((a,b) => (parseInt(a['№ Операция'])||0) - (parseInt(b['№ Операция'])||0));
                      let lastOp = routeData[routeData.length - 1]['Име на операция'].trim().toLowerCase();
                      
                      if (opName === lastOp || opName === 'готов детайл') {
                          tName = 'inventory_gp';
                          opName = 'готов детайл';
                      } else {
                          tName = 'inventory_wip';
                      }
                  } else {
                      if (currentTab === 'sklad_gp') opName = 'готов детайл';
                  }
                  
                  let query = client.from(tName).select('Количество').eq('ID Детайл', cleanDet);
                  if (tName === 'inventory_wip') query = query.eq('Операция', opName);
                  let { data: currData } = await query;
                  
                  let currentStock = currData && currData.length > 0 ? parseFloat(currData[0]['Количество']) || 0 : 0;
                  let newTotal = currentStock + qty;
                  
                  if (newTotal < 0) {
                      Swal.close();
                      throw new Error(`Недостатъчна наличност! Опитвате се да извадите повече бройки, отколкото има в склада (Налични: ${currentStock}).`);
                  }
                  
                  let payload = { "ID Детайл": cleanDet, "Количество": newTotal };
                  if (tName === 'inventory_wip') payload["Операция"] = opName;
                  
                  let { error: upsertErr } = await client.from(tName).upsert([payload], { onConflict: tName === 'inventory_gp' ? 'ID Детайл' : 'ID Детайл, Операция' });
                  if (upsertErr) throw upsertErr;
                  
                  let auditNewData = { "ID Детайл": cleanDet, "Разлика": qty, "Ново Количество": newTotal };
                  if (tName === 'inventory_wip') auditNewData["Операция"] = opName;
                  
                  await client.from('audit_logs').insert([{ table_name: tName, action_type: 'MANUAL_ADJUSTMENT', old_data: { "Количество": currentStock }, new_data: auditNewData }]);
              }
              
              if (bufferQty !== 0 || scrapInput !== "") {
                  Swal.fire({title: 'Запазване на буфер...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
                  let currentBuffer = 0;
                  let currentScrap = 0;
                  const { data: bufData } = await client.from('sklad_bufferi').select('Буфер, "% Брак"').eq('ID Детайл', det);
                  if (bufData && bufData.length > 0) {
                      currentBuffer = parseFloat(bufData[0]['Буфер']) || 0;
                      currentScrap = parseFloat(bufData[0]['% Брак']) || 0;
                  }
                  const newBufferTotal = currentBuffer + bufferQty;
                  const newScrap = scrapInput !== "" ? parseFloat(scrapInput) : currentScrap;
                  await client.from('sklad_bufferi').delete().eq('ID Детайл', det);
                  const { error: bufError } = await client.from('sklad_bufferi').insert([{ "ID Детайл": det, "Операция": op, "Буфер": newBufferTotal, "% Брак": newScrap }]);
                  if (bufError) throw bufError;
              }
              
              Swal.fire({icon: 'success', title: 'Успешно добавено в склада!', timer: 1500, showConfirmButton: false});
          } else {
              const det = document.getElementById('inp_skladDetail').value.trim();
              const realOpEl = document.getElementById('inp_skladRealOp');
              const op = (realOpEl && realOpEl.value) ? realOpEl.value.trim() : document.getElementById('inp_skladOp').value.trim();
              const oldQty = parseFloat(document.getElementById('inp_skladOldQty').value) || 0;
              const newQty = parseFloat(document.getElementById('inp_skladQty').value) || 0;
              const newBuffer = parseFloat(document.getElementById('inp_skladBuffer').value) || 0;
              const newScrap = parseFloat(document.getElementById('inp_skladScrap').value) || 0;
              const diff = newQty - oldQty;
              
              if (diff !== 0) {
                  Swal.fire({title: 'Записване на наличности...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
                  let tName = currentTab === 'sklad_gp' ? 'inventory_gp' : 'inventory_wip';
                  let opName = currentTab === 'sklad_gp' ? 'готов детайл' : op.trim().toLowerCase();
                  let cleanDet = det.toLowerCase();
                  
                  let query = client.from(tName).select('Количество').eq('ID Детайл', cleanDet);
                  if (currentTab === 'sklad_wip') query = query.eq('Операция', opName);
                  let { data: currData } = await query;
                  
                  let currentStock = currData && currData.length > 0 ? parseFloat(currData[0]['Количество']) || 0 : 0;
                  let newTotal = currentStock + diff;
                  
                  if (newTotal < 0) {
                      Swal.close();
                      throw new Error(`Недостатъчна наличност! Опитвате се да извадите повече бройки, отколкото има в склада (Налични: ${currentStock}).`);
                  }
                  
                  let payload = { "ID Детайл": cleanDet, "Количество": newTotal };
                  if (currentTab === 'sklad_wip') payload["Операция"] = opName;
                  
                  let { error: upsertErr } = await client.from(tName).upsert([payload], { onConflict: currentTab === 'sklad_gp' ? 'ID Детайл' : 'ID Детайл, Операция' });
                  if (upsertErr) throw upsertErr;
                  
                  let auditNewData = { "ID Детайл": cleanDet, "Разлика": diff, "Ново Количество": newTotal };
                  if (currentTab === 'sklad_wip') auditNewData["Операция"] = opName;
                  
                  await client.from('audit_logs').insert([{ table_name: tName, action_type: 'UPDATE', old_data: { "Количество": oldQty }, new_data: auditNewData }]);
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
  config.fields.forEach(f => { 
      const el = document.getElementById('inp_' + f.name); 
      if (el && !f.readonly && !(isEditMode && f.readonlyOnEdit)) { 
          let val = el.value; 
          if (f.type === 'number') {
              val = parseFloat(val) || 0; 
          } else if (f.type === 'date' && val === "") {
              val = null;
          }
          payload[f.name] = val; 
      } 
  });
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

    if (currentTab === 'porachki' && payload['Статус'] === 'Прието') {
        let oldStatus = isEditMode ? globalRows[editingIndex]['Статус'] : null;
        if (oldStatus !== 'Прието') {
            let itemCode = payload['Материал'];
            let qty = parseFloat(payload['Количество']) || 0;
            
            // fetch current from sklad
            const { data: skData, error: skErr } = await client.from('sklad').select('Доставено, Остатък').eq('ID Детайл', itemCode);
            if (!skErr && skData && skData.length > 0) {
                let currentDostaveno = parseFloat(skData[0]['Доставено']) || 0;
                let currentOstatuk = parseFloat(skData[0]['Остатък']) || 0;
                await client.from('sklad').update({ 
                    'Доставено': currentDostaveno + qty,
                    'Остатък': currentOstatuk + qty
                }).eq('ID Детайл', itemCode);
            }
        }
    }

    if (isEditMode) { 
        const row = globalRows[editingIndex]; 
        const keyVal = row[config.key]; 
        if (config.table === 'computed_sklad_gp' || config.table === 'computed_sklad_wip') {
            let oldQty = parseFloat(row['Общо']) || 0;
            let newQty = parseFloat(payload['Общо']) || 0;
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
                const { error: updErr2 } = await client.from('otcheti').insert([otchetiPayload]);
                if (updErr2) throw updErr2;
            }
            Swal.fire({icon: 'success', title: 'Наличността е коригирана!', timer: 1500, showConfirmButton: false});
        } else {
            const { error } = await client.from(config.table).update(payload).eq(config.key, keyVal); 
            if (error) throw error; 
            Swal.fire({icon: 'success', title: 'Успешно запазено!', timer: 1000, showConfirmButton: false}); 
        }
    } 
    else { 
        let inserts = [payload];
        
        if (currentTab === 'plan') {
            const phantoms = {
                "575-91001-9": "Ф63.4 204J",
                "h25-f1e": "Кв. Фл. 22108201Е",
                "575-60021": "Капак с китайски отливки"
            };
            let code = String(payload['Вътрешно име'] || '').trim().toLowerCase();
            if (phantoms[code]) {
                let phantomPayload = { ...payload };
                phantomPayload['Вътрешно име'] = phantoms[code];
                inserts.push(phantomPayload);
            }
        }

        const { error } = await client.from(config.table).insert(inserts); 
        if (error) throw error; 
        Swal.fire({icon: 'success', title: 'Успешно добавено!', timer: 1000, showConfirmButton: false}); 
    }
    
    if (currentTab === 'porachki') {
        let isNewOrder = !isEditMode;
        let isChangedToPorachano = isEditMode && payload['Статус'] === 'Поръчано' && globalRows[editingIndex]['Статус'] !== 'Поръчано';
        if (isNewOrder || isChangedToPorachano) {
            let recipient = payload['Имейл на доставчик'] || '';
            let materialName = payload['Материал'] || '';
            let orderQty = payload['Количество'] || 0;
            let subject = encodeURIComponent("Поръчка на материал: " + materialName);
            let body = encodeURIComponent(`Здравейте,\n\nБихме искали да поръчаме следната позиция:\nМатериал: ${materialName}\nКоличество: ${orderQty} бр.\n\nМоля да потвърдите получаването на поръчката и очаквано време за доставка.\n\nПоздрави,`);
            
            // Вместо mailto, директно отваряме Gmail (понеже видях, че ползвате Gmail)
            let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipient}&su=${subject}&body=${body}`;
            // Отваряме в нов, по-малък прозорец (popup), за да не изгубите админ панела
            window.open(gmailUrl, 'GmailPopup', 'width=800,height=600,left=200,top=100,scrollbars=yes');
        }
    }
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
              let tName = currentTab === 'sklad_gp' ? 'inventory_gp' : 'inventory_wip';
              let opName = currentTab === 'sklad_gp' ? 'готов детайл' : (row['Оригинална Операция'] || row['Операция']).trim().toLowerCase();
              let cleanDet = String(row['ID Детайл']).trim().toLowerCase();
              
              let query = client.from(tName).delete().eq('ID Детайл', cleanDet);
              if (currentTab === 'sklad_wip') query = query.eq('Операция', opName);
              const { error } = await query;
              
              if (error) throw error; 
              
              let auditNewData = { "ID Детайл": cleanDet, "Ново Количество": 0 };
              if (currentTab === 'sklad_wip') auditNewData["Операция"] = opName;
              await client.from('audit_logs').insert([{ table_name: tName, action_type: 'DELETE', old_data: { "Количество": row['Общо'] }, new_data: auditNewData }]);
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
        if (!plansMap[key]) plansMap[key] = { name: key, month: row['Месец'], year: row['Година'], total: 0, done: 0, packed: 0, fullyPacked: true };
        
        plansMap[key].total++;
        if (row['Статус'] === 'Завършен' || row['Статус'] === '📦 Опакован') {
            plansMap[key].done++;
            let target = parseFloat(row['Целево количество']) || 0;
            let packed = parseFloat(row['__total_packed']) || 0;
            if (packed >= target || row['Статус'] === '📦 Опакован') {
                plansMap[key].packed++; // Отчитаме го като логически опакован
            } else {
                plansMap[key].fullyPacked = false;
            }
        }
    });

    let html = '';
    let plansList = Object.values(plansMap).sort((a,b) => b.year - a.year || b.month - a.month);
    
    if (plansList.length === 0) {
        html = '<div style="text-align:center; padding:20px; color:#64748b;">Няма заредени планове.</div>';
    } else {
        plansList.forEach(p => {
            html += `<div style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:15px; margin-bottom:15px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-weight:bold; font-size:1.1em; margin-bottom:10px; color:#334155;">📅 План: Месец ${p.month} / ${p.year} (Общо ${p.total} реда детайли)</div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="font-size:0.95em;">
                        <div style="color:#059669; margin-bottom:4px;">🟢 Завършени детайли: <b>${p.done}</b> бр.</div>
                        <div style="color:#0284c7;">📦 От тях 100% опаковани: <b>${p.packed}</b> бр.</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <button class="btn-primary" ${p.done === 0 || !p.fullyPacked ? 'disabled style="opacity:0.5;cursor:not-allowed;" title="Всички завършени детайли трябва да са 100% опаковани!"' : ''} onclick="window.massLogisticsAction('${p.month}', '${p.year}')" style="background:#f59e0b; min-width:200px;">🚚 Изпрати План ${p.month}/${p.year}</button>
                    </div>
                </div>
            </div>`;
        });
    }

    document.getElementById('logisticsContent').innerHTML = html;
    document.getElementById('logisticsModalBackdrop').style.display = 'flex';
};

window.massLogisticsAction = async function(month, year) {
    const res = await Swal.fire({ title: 'Сигурни ли сте?', text: `Искате ли да изпратите (експедирате) всички завършени детайли за Месец ${month} / ${year}? Това ще извади наличностите им от склада!`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Да, изпрати', cancelButtonText: 'Отказ' });
    if (!res.isConfirmed) return;

    try {
        Swal.fire({title: 'Изпращане...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        
        // 1. Взимаме детайлите, които ще бъдат изпратени
        const { data: detailsToShip, error: fetchErr } = await client.from('plan')
            .select('id, "Вътрешно име", "Целево количество"')
            .eq('Месец', month).eq('Година', year).in('Статус', ['Завършен', '📦 Опакован']);
            
        if (fetchErr) throw fetchErr;
        
        if (detailsToShip && detailsToShip.length > 0) {
            const nomRes = await client.from('Номенклатура').select('*');
            const nomMap = {};
            if (!nomRes.error && nomRes.data) {
                nomRes.data.forEach(n => {
                    if (n['Вътрешно име']) nomMap[n['Вътрешно име']] = n['ID Детайл'];
                    if (n['ID Детайл']) nomMap[n['ID Детайл']] = n['ID Детайл'];
                });
            }

            // 2. Подготвяме отчетите за Експедиция
            let otchetiInserts = detailsToShip.map(d => {
                let idDetail = nomMap[d["Вътрешно име"]] || d["Вътрешно име"];
                return {
                    "ID План": String(d.id),
                    "ID Детайл": String(idDetail).trim(),
                    "Операция": "Експедиция",
                    "Количество": parseFloat(d["Целево количество"]) || 0,
                    "Статус": "Изпратено",
                    "Оператор": "Система (Логистика)",
                    "Дата": new Date().toISOString()
                };
            });
            
            // 3. Инсъртваме отчетите (Това ще извика тригера и ще извади от склада)
            const { error: insErr } = await client.from('otcheti').insert(otchetiInserts);
            if (insErr) throw insErr;
            
            // 3.5. Обновяваме статуса на всички записи за 'Опаковане' свързани с тези планове на 'Изпратено',
            // за да изчезнат от колоната 'Запазени'
            const planIds = detailsToShip.map(d => String(d.id));
            if (planIds.length > 0) {
                const { error: updPackErr } = await client.from('otcheti')
                    .update({ 'Статус': 'Изпратено' })
                    .in('ID План', planIds)
                    .ilike('Операция', '%Опаковане%')
                    .eq('Статус', 'Отчетено');
                if (updPackErr) console.error("Грешка при изпращане на кашоните:", updPackErr);
            }
        }

        // 4. Обновяваме статуса им на '🚚 Изпратен'
        const { error: updErr } = await client.from('plan')
            .update({ 'Статус': '🚚 Изпратен' })
            .eq('Месец', month).eq('Година', year).in('Статус', ['Завършен', '📦 Опакован']);
            
        if (updErr) throw updErr;
        
        Swal.fire({icon: 'success', title: 'Успешно!', text: `Изпратени са ${detailsToShip ? detailsToShip.length : 0} записа.`, timer: 2000, showConfirmButton: false});
        
        document.getElementById('logisticsModalBackdrop').style.display = 'none';
        loadCurrentTableData();
    } catch(err) {
        Swal.fire('Грешка', err.message, 'error');
    }
};

window.openMrpModal = async function() {
    try {
        Swal.fire({title: 'Анализ на нуждите...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        
        const { data: plans, error: planErr } = await client.from('plan').select('*').eq('Статус', 'Активен');
        if (planErr) throw planErr;
        
        const { data: bomList, error: bomErr } = await client.from('bom').select('*');
        if (bomErr) throw bomErr;
        

        
        const { data: skladList, error: skladErr } = await client.from('sklad').select('*');
        if (skladErr) throw skladErr;
        
        const bomMap = {};
        bomList.forEach(b => {
            let parent = b['ID Родител']?.trim()?.toLowerCase();
            if (!bomMap[parent]) bomMap[parent] = [];
            bomMap[parent].push({ child: b['ID Компонент']?.trim()?.toLowerCase(), qty: parseFloat(b['Количество']) || 1 });
        });
        
        const skladMap = {};
        skladList.forEach(s => {
            skladMap[s['ID Детайл']?.trim()?.toLowerCase()] = {
                name: s['ID Детайл'],
                stock: parseFloat(s['Остатък']) || 0,
                min: parseFloat(s['Минимално количество']) || 0
            };
        });
        
        let totalDemands = {};
        
        function explode(itemId, qty) {
            if(!itemId) return;
            let key = itemId.trim().toLowerCase();
            if (bomMap[key] && bomMap[key].length > 0) {
                bomMap[key].forEach(childNode => {
                    explode(childNode.child, qty * childNode.qty);
                });
            } else {
                if (!totalDemands[key]) totalDemands[key] = 0;
                totalDemands[key] += qty;
            }
        }
        
        plans.forEach(p => {
            let planItem = p['ID Детайл'] || p['Вътрешно име'];
            let planQty = parseFloat(p['Целево количество']) || 0;
            explode(planItem, planQty);
        });
        
        let deficits = [];
        for (let itemKey in totalDemands) {
            let demand = totalDemands[itemKey];
            let sk = skladMap[itemKey];
            
            if (sk) { 
                let stock = sk.stock;
                let min = sk.min;
                let free = stock - demand;
                
                if (free < min) {
                    deficits.push({
                        item: sk.name,
                        stock: stock,
                        demand: demand,
                        free: free,
                        min: min,
                        missing: min - free
                    });
                }
            }
        }
        
        let html = '';
        if (deficits.length === 0) {
            html = `<div style="text-align:center; padding: 40px; font-size:1.2em; color:#059669; font-weight:bold;">✅ Няма критични липси! Всички материали са над минимума.</div>`;
        } else {
            html = `<table class="minimal-table" style="width:100%; text-align:left; border-collapse:collapse;">
                <thead><tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1;">
                    <th style="padding:10px;">Материал</th>
                    <th style="padding:10px; text-align:center;">Наличност</th>
                    <th style="padding:10px; text-align:center;">Нужно за Планове</th>
                    <th style="padding:10px; text-align:center;">Свободно</th>
                    <th style="padding:10px; text-align:center;">Минимум</th>
                    <th style="padding:10px; text-align:center;">Действие</th>
                </tr></thead>
                <tbody>`;
            deficits.sort((a,b) => b.missing - a.missing).forEach(d => {
                html += `<tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:10px; font-weight:bold; color:#0f172a;">${d.item}</td>
                    <td style="padding:10px; text-align:center;">${d.stock}</td>
                    <td style="padding:10px; text-align:center; color:#d97706;">${d.demand}</td>
                    <td style="padding:10px; text-align:center; color:#ef4444; font-weight:bold;">${d.free}</td>
                    <td style="padding:10px; text-align:center;">${d.min}</td>
                    <td style="padding:10px; text-align:center;">
                        <button class="btn-primary" onclick="window.createOrderForDeficit('${d.item}', ${d.missing})" style="background:#3b82f6; padding: 4px 10px; font-size: 0.85em;">➕ Поръчай</button>
                    </td>
                </tr>`;
            });
            html += `</tbody></table>`;
        }
        
        Swal.close();
        document.getElementById('mrpContent').innerHTML = html;
        document.getElementById('mrpModalBackdrop').style.display = 'flex';
        
    } catch(err) {
        Swal.fire('Грешка при анализа', err.message, 'error');
    }
};

window.createOrderForDeficit = function(item, recommendedQty) {
    document.getElementById('mrpModalBackdrop').style.display = 'none';
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if(btn.innerText.includes('Поръчки')) btn.click();
    });
    
    setTimeout(() => {
        openAddModal();
        setTimeout(() => {
            let itemInput = document.getElementById('inp_Материал');
            let qtyInput = document.getElementById('inp_Количество');
            if(itemInput) itemInput.value = item;
            if(qtyInput) qtyInput.value = recommendedQty;
        }, 300);
    }, 100);
};

function openAuditModal() {
    document.getElementById('auditModalBackdrop').style.display = 'flex';
    fetchAuditLogs();
}

async function fetchAuditLogs() {
    let container = document.getElementById('auditContent');
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Зареждане на историята... ⏳</div>';
    
    let tableFilter = document.getElementById('auditTableFilter').value;
    
    try {
        let query = client.from('audit_logs').select('*').order('changed_at', { ascending: false }).limit(200);
        
        if (tableFilter !== 'all') {
            query = query.eq('table_name', tableFilter);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Няма записани промени за тази таблица.</div>';
            return;
        }
        
        let html = '<table style="width:100%; border-collapse:collapse; background:white; font-size:0.9em; box-shadow:0 1px 3px rgba(0,0,0,0.1);">';
        html += '<thead style="background:#e2e8f0; color:#475569;"><tr><th style="padding:10px; border:1px solid #cbd5e1; text-align:left; width:150px;">Време</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:left; width:120px;">Таблица</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:center; width:80px;">Действие</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:left;">Детайли</th></tr></thead><tbody>';
        
        data.forEach(log => {
            let dateStr = new Date(log.changed_at).toLocaleString('bg-BG');
            let actionBadge = '';
            if (log.action_type === 'DELETE') actionBadge = '<span style="background:#fee2e2; color:#b91c1c; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">ИЗТРИВАНЕ</span>';
            else if (log.action_type === 'INSERT') actionBadge = '<span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">ДОБАВЯНЕ</span>';
            else actionBadge = '<span style="background:#fef3c7; color:#d97706; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">РЕДАКЦИЯ</span>';
            
            let detailsHtml = '';
            let oldData = log.old_data || {};
            let newData = log.new_data || {};
            
            if (log.action_type === 'DELETE') {
                detailsHtml = `<div style="color:#64748b;"><b>Изтрит запис:</b> ${JSON.stringify(oldData)}</div>`;
            } else if (log.action_type === 'INSERT') {
                detailsHtml = `<div style="color:#166534;"><b>Нов запис:</b> ${JSON.stringify(newData)}</div>`;
            } else {
                let changesHtml = [];
                for (let key in newData) {
                    if (oldData[key] !== newData[key]) {
                        changesHtml.push(`<div><b>${key}:</b> <span style="text-decoration:line-through; color:#ef4444;">${oldData[key]}</span> ➡️ <span style="color:#16a34a;">${newData[key]}</span></div>`);
                    }
                }
                detailsHtml = changesHtml.length > 0 ? changesHtml.join('') : '<span style="color:#94a3b8;">Няма промяна в полетата</span>';
            }
            
            html += `<tr>
                <td style="padding:10px; border:1px solid #e2e8f0; color:#475569;">${dateStr}</td>
                <td style="padding:10px; border:1px solid #e2e8f0; font-weight:bold; color:#1e293b;">${log.table_name}</td>
                <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${actionBadge}</td>
                <td style="padding:10px; border:1px solid #e2e8f0; font-family:monospace;">${detailsHtml}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
        
    } catch (err) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444;">Грешка: ' + err.message + '</div>';
    }
}
