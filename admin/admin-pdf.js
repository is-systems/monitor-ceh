pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

async function processPDF(event) {
    const file = event.target.files[0]; if (!file) return; event.target.value = ''; 
    const { value: formValues } = await Swal.fire({ title: 'Детайли за плана', html: '<label style="display:block; text-align:left; font-size:14px; margin-bottom:5px;">Месец на плана:</label><input id="swal-month" class="swal2-input" value="Юни"><label style="display:block; text-align:left; font-size:14px; margin-top:15px; margin-bottom:5px;">Година:</label><input id="swal-year" type="number" class="swal2-input" value="2026">', focusConfirm: false, showCancelButton: true, confirmButtonText: 'Продължи', cancelButtonText: 'Отказ', preConfirm: () => [document.getElementById('swal-month').value.trim(), document.getElementById('swal-year').value.trim()] });
    if (!formValues) return; const [targetMonth, targetYear] = [formValues[0], parseInt(formValues[1])];
    Swal.fire({ title: 'Прецизно сканиране...', text: 'Сверяване с Номенклатура и изолиране на колоните...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: nomData, error: nomErr } = await client.from('Номенклатура').select('*'); if (nomErr) throw nomErr;
        let nomSet = new Set(); if (nomData) { nomData.forEach(n => { if (n['ID Детайл']) nomSet.add(String(n['ID Детайл']).trim().toUpperCase()); if (n['Вътрешно име']) nomSet.add(String(n['Вътрешно име']).trim().toUpperCase()); }); }
        const arrayBuffer = await file.arrayBuffer(); const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise; let extractedPlan = []; 
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i); const content = await page.getTextContent();
            let validItems = content.items.filter(item => item.str.trim() !== '').map(item => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }));
            let rows = [];
            validItems.forEach(item => { let added = false; for (let row of rows) { if (Math.abs(row.y - item.y) < 5) { row.items.push(item); added = true; break; } } if (!added) rows.push({ y: item.y, items: [item] }); });
            rows.forEach(row => {
                row.items.sort((a, b) => a.x - b.x); 
                let qtyIndex = row.items.findIndex(i => i.x < 80 && /^[\d,.]+$/.test(i.text.replace(/,/g, '')));
                if (qtyIndex !== -1) {
                    let qtyItem = row.items[qtyIndex];
                    let partItem = row.items.find((i, idx) => idx > qtyIndex && i.x > 50 && i.x < 250);
                    if (partItem) {
                        let qty = parseInt(qtyItem.text.replace(/,/g, ''), 10);
                        let partCode = partItem.text.toUpperCase();
                        if (qty > 0 && qty < 100000 && partCode.length > 2 && !partCode.includes("PART")) {
                            extractedPlan.push({ 'Вътрешно име': partCode, 'Целево количество': qty, 'Месец': targetMonth, 'Година': targetYear, 'Статус': 'Активен', _existsInNom: nomSet.has(partCode) });
                        }
                    }
                }
            });
        }

        if (extractedPlan.length === 0) { Swal.fire('Внимание', 'Не открих валидни данни в първите две колони.', 'warning'); return; }
        
        let summaryHtml = `<div style="max-height: 350px; overflow-y: auto; text-align: left; font-size: 14px; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; background:#f8fafc;"><ol style="margin:0; padding-left:20px;">`;
        let hasWarnings = false;

        extractedPlan.forEach(p => {
            if (p._existsInNom) { summaryHtml += `<li style="margin-bottom: 6px; padding-bottom:4px; border-bottom:1px dashed #e2e8f0;"><b style="color: #16a34a; font-size:1.1em;">${p['Целево количество']} бр.</b> — <span style="font-family:monospace; font-weight:bold; color:#1e3a8a;">${p['Вътрешно име']}</span></li>`; } 
            else { hasWarnings = true; summaryHtml += `<li style="margin-bottom: 6px; padding-bottom:4px; border-bottom:1px dashed #e2e8f0; background-color: #fef2f2; padding: 6px; border-radius: 6px; border-left: 4px solid #dc2626;"><b style="color: #dc2626; font-size:1.1em;">${p['Целево количество']} бр.</b> — <span style="font-family:monospace; font-weight:bold; color:#dc2626;">${p['Вътрешно име']}</span><br><span style="color:#991b1b; font-size:0.85em; font-weight:bold;">⚠️ Внимание: Този детайл липсва в Номенклатурата!</span></li>`; }
            delete p._existsInNom; 
        });
        summaryHtml += `</ol></div>`;

        let titleText = hasWarnings ? `<span style="color:#dc2626;">⚠️ Открити поръчки: ${extractedPlan.length} реда</span>` : `Открити поръчки: ${extractedPlan.length} реда`;

        const confirmRes = await Swal.fire({ title: titleText, html: '<p style="font-size:13px; color:#64748b; margin-top:0;">Списъкът е генериран само от първите 2 колони (Количество и Детайл):</p>' + summaryHtml, icon: hasWarnings ? 'warning' : 'question', showCancelButton: true, confirmButtonColor: '#4338ca', cancelButtonColor: '#94a3b8', confirmButtonText: '🚀 Зареди в плана', cancelButtonText: 'Отказ' });
        
        if (confirmRes.isConfirmed) { Swal.fire({ title: 'Записване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() }); const { error } = await client.from('plan').insert(extractedPlan); if (error) throw error; Swal.fire({ icon: 'success', title: 'Успех!', text: `Планът беше добавен успешно.`, timer: 2000, showConfirmButton: false }); loadCurrentTableData(); }
    } catch (err) { console.error(err); Swal.fire('Грешка при импорта', err.message, 'error'); }
}
