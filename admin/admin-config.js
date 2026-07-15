const ADMIN_PIN = "1415"; 

const client = supabase.createClient(
  'https://zdythzcgcjxwbxufunuh.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE'
);

const tableConfigs = {
  plan: { label: '📅 Месечен План', table: 'plan', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'ID Детайл', type: 'text', readonly: true }, { name: 'Вътрешно име', type: 'text', required: true }, { name: 'Целево количество', type: 'number', required: true }, { name: 'Месец', type: 'text', required: true }, { name: 'Година', type: 'number', required: true }, { name: 'Статус', type: 'select', options: ['Активен', 'Завършен', '📦 Опакован', '🚚 Изпратен'], required: true } ] },
  personal: { label: '👥 Персонал & Досиета', table: 'personal', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'Имейл', type: 'text', required: true }, { name: 'Име', type: 'text' }, { name: 'Статус', type: 'select', options: ['Активен', 'Блокиран'], required: true, def: 'Активен' } ] },
  chekiraniya: { label: '⏱️ Хронология Чекирания', table: 'chekiraniya', readOnlyTab: true, fields: [ { name: 'Време', type: 'text' }, { name: 'Имейл', type: 'text' }, { name: 'Действие', type: 'text' }, { name: 'Локация', type: 'text' }, { name: 'Бележка', type: 'text' } ] },
  sklad_gp: { label: '🏭 Склад Готови Детайли', table: 'computed_sklad_gp', readOnlyTab: true, fields: [ { name: 'ID План', type: 'text', readonlyOnEdit: true }, { name: 'ID Детайл', type: 'text', readonlyOnEdit: true }, { name: 'Име', type: 'text', readonlyOnEdit: true }, { name: 'Операция', type: 'text', readonlyOnEdit: true }, { name: 'Наличност в цеха', type: 'number', readonlyOnEdit: true }, { name: 'Минимално количество/Буфер', type: 'number', def: 0 } ] },
  sklad_wip: { label: '⏳ Склад Полуфабрикати', table: 'computed_sklad_wip', readOnlyTab: true, fields: [ { name: 'ID План', type: 'text', readonlyOnEdit: true }, { name: 'ID Детайл', type: 'text', readonlyOnEdit: true }, { name: 'Име', type: 'text', readonlyOnEdit: true }, { name: 'Операция', type: 'text', readonlyOnEdit: true }, { name: 'Наличност в цеха', type: 'number', readonlyOnEdit: true }, { name: 'Минимално количество/Буфер', type: 'number', def: 0 } ] },
  nomenklatura: { label: '🗂️ Номенклатура', table: 'Номенклатура', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'ID Детайл', type: 'text', required: true }, { name: 'Вътрешно име', type: 'text' }, { name: 'Тип', type: 'text' }, { name: 'ID Родител', type: 'text' }, { name: 'Разходна норма', type: 'number', def: 1 }, { name: 'Единици', type: 'text', def: 'бр.' }, { name: 'Линк към чертеж', type: 'text' } ] },
  sklad: { label: '📦 Склад Материали', table: 'sklad', key: 'ID Детайл', fields: [ { name: 'ID Детайл', type: 'text', required: true, readonlyOnEdit: true }, { name: 'Начална наличност', type: 'number', def: 0 }, { name: 'Доставено', type: 'number', def: 0 }, { name: 'Изразходено', type: 'number', def: 0 }, { name: 'Остатък', type: 'number', def: 0, readonly: true }, { name: 'Минимално количество', type: 'number', def: 0 }, { name: 'Бележки', type: 'text' } ] },
  bom: { label: '🧩 БОМ (Разбивка)', table: 'bom', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'ID Родител', type: 'text', required: true }, { name: 'ID Компонент', type: 'text', required: true }, { name: 'Количество', type: 'number', required: true, def: 1 } ] },
  marshruti: { label: '🔄 Маршрутни карти', table: 'marshruti', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'Код на детайла', type: 'text', required: true }, { name: '№ Операция', type: 'number', required: true, def: 10 }, { name: 'Име на операция', type: 'text', required: true }, { name: 'Машина', type: 'text' }, { name: 'Описание', type: 'text' }, { name: 'Линк към чертеж', type: 'text' }, { name: 'Линк към СОП', type: 'text' } ] },
  otcheti: { label: '📊 Отчети (Log)', table: 'otcheti', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'ID План', type: 'text' }, { name: 'ID Детайл', type: 'text', required: true }, { name: 'Операция', type: 'text', required: true }, { name: 'Количество', type: 'number', def: 1, required: true }, { name: 'Статус', type: 'select', options: ['Отчетено', 'Брак', 'Изпратено'], required: true }, { name: 'Оператор', type: 'text', required: true }, { name: 'Дата', type: 'text', def: () => new Date().toISOString() } ] }
};

let currentTab = 'plan'; 
let globalRows = []; 
let currentRenderedRows = []; 
let selectedIndices = new Set();
let isEditMode = false; 
let editingIndex = null; 
let currentFolderEmail = '';
