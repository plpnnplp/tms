/**
 * TMS ORDER WORKSPACE CORE (page-order.js)
 * ОБНОВЛЕНО: Трехколоночный layout, единый скролл, динамическая таблица груза.
 */

import { api } from '../api.js';
import { injectTmsHeader } from '../ui/header.js';

// --- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ---
let currentOrder = null;
let isEditMode = false;

// Имитация базы данных
const MOCK_DB = [
    { id: 'SHP-101', name: 'GLOBAL EXPORTS GMBH', addr: 'STREET 1, BERLIN\nGERMANY' },
    { id: 'AL-020', name: 'Lufthansa Cargo AG', addr: 'Tor 25, 60549 Frankfurt\nGermany', prefix: '020' },
    { id: 'CNE-505', name: 'IMPORTEX S.A.', addr: 'ASUNCION 118\nPARAGUAY' }
];

// --- ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', async () => {
    injectTmsHeader();
    
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');
    
    if (!orderId) {
        alert("ID заказа не передан. Возврат в реестр.");
        window.location.href = "ActiveBookings.html";
        return;
    }

    await loadOrderContext(orderId);
});

async function loadOrderContext(orderId) {
    try {
        // Эмуляция получения данных заказа
        // В реальности: currentOrder = await api.getBookingById(orderId);
        currentOrder = { id: orderId, status: 'active', order_number: orderId }; 
        
        populatePassportData();
        
        // Инициализация модулей
        initTopBarLogic();
        initQuickJump();
        initLookups();
        initAwbCalculator(); // Обновленный калькулятор строк
        initIataValidation();
        initPdfGeneration(); // Обновленный генератор PDF
        trackFormChanges();  // Новая функция отслеживания изменений
        
    } catch (error) {
        console.error("Context load error:", error);
        alert(`Сбой загрузки: ${error.message}`);
        window.location.href = "ActiveBookings.html";
    }
}

// --- УТИЛИТЫ ---
function safeSetVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
}

function updatePartyUI(type, name, id = "DB") {
    safeSetVal(`${type}Id`, id);
    safeSetVal(`${type}Name`, name);
}

// --- БИЗНЕС-ЛОГИКА И РЕНДЕР ---
function populatePassportData() {
    if (!currentOrder) return;

    const dateEl = document.getElementById('orderCreationDate');
    if (dateEl && currentOrder.created_at) {
        dateEl.innerText = new Date(currentOrder.created_at).toLocaleDateString();
    }
    safeSetVal('opStatus', currentOrder.status || 'active');

    // Левая панель
    updatePartyUI('billTo', currentOrder.bill_to_name);
    updatePartyUI('shipper', currentOrder.shipper_name);
    updatePartyUI('consignee', currentOrder.consignee_name);

    safeSetVal('originCity', currentOrder.origin_city);
    safeSetVal('destCity', currentOrder.destination_city);
    
    // Бланк AWB
    safeSetVal('awbDept', currentOrder.origin_city);
    safeSetVal('awbDest', currentOrder.destination_city);

    if (currentOrder.order_number && currentOrder.order_number.includes('-')) {
        const numPart = currentOrder.order_number.split('-')[1];
        safeSetVal('awbPrefix', "020");
        safeSetVal('awbSerial', numPart);
    }
}

// --- МОДУЛИ ИНТЕРФЕЙСА ---

// 1. Управление TopBar (Редактирование / Сохранение)
function initTopBarLogic() {
    const btnEdit = document.getElementById('btnEditOrder');
    const labelEdit = document.getElementById('labelEditOrder');
    const btnSave = document.getElementById('btnSaveOrder');
    const lockedFields = document.querySelectorAll('.tms-locked-field');

    if (!btnEdit || !btnSave) return;

    btnEdit.addEventListener('click', () => {
        isEditMode = btnEdit.classList.contains('is-active');

        if (isEditMode) {
            // ОТМЕНА РЕДАКТИРОВАНИЯ
            btnEdit.classList.remove('is-active');
            if (labelEdit) labelEdit.textContent = 'Редактировать';
            btnSave.disabled = true;
            lockedFields.forEach(field => field.disabled = true);
            populatePassportData(); // Сбрасываем изменения к исходным
        } else {
            // СТАРТ РЕДАКТИРОВАНИЯ
            btnEdit.classList.add('is-active');
            if (labelEdit) labelEdit.textContent = 'Отмена';
            lockedFields.forEach(field => field.disabled = false);
        }
    });

    btnSave.addEventListener('click', async () => {
        const originalHtml = btnSave.innerHTML;
        btnSave.disabled = true;
        btnSave.innerHTML = '⏳ Сохранение...';

        try {
            // Имитация отправки на бэкенд
            await new Promise(resolve => setTimeout(resolve, 800));
            
            btnSave.innerHTML = '✅ Сохранено';
            
            setTimeout(() => {
                btnSave.innerHTML = originalHtml;
                btnEdit.classList.remove('is-active');
                if (labelEdit) labelEdit.textContent = 'Редактировать';
                lockedFields.forEach(field => field.disabled = true);
            }, 1000);
        } catch (err) {
            btnSave.innerHTML = '❌ Ошибка';
            setTimeout(() => {
                btnSave.innerHTML = originalHtml;
                btnSave.disabled = false;
            }, 2000);
        }
    });
}

// 2. Отслеживание изменений (включает кнопку Сохранить)
function trackFormChanges() {
    const btnSave = document.getElementById('btnSaveOrder');
    const btnEdit = document.getElementById('btnEditOrder');
    
    // Делегирование событий: слушаем весь документ
    document.body.addEventListener('input', (e) => {
        if (e.target.classList.contains('tms-locked-field')) {
            // Если в режиме редактирования и кнопка заблокирована
            if (btnEdit && btnEdit.classList.contains('is-active') && btnSave && btnSave.disabled) {
                btnSave.disabled = false;
            }
        }
    });
}

// 3. Динамический калькулятор строк груза
function initAwbCalculator() {
    const tbody = document.getElementById('awbCargoBody');
    if (!tbody) return;

    // Функция пересчета одной строки
    const calculateRow = (row) => {
        const inputs = row.querySelectorAll('input');
        if (inputs.length < 8) return;
        
        // Индексы в новой таблице: CW = 5, Rate = 6, Total = 7
        const cwInput = inputs[5];
        const rateInput = inputs[6];
        const totalInput = inputs[7];

        const rate = parseFloat(rateInput.value) || 0;
        const cw = parseFloat(cwInput.value) || 0;
        
        totalInput.value = (rate > 0 && cw > 0) ? (rate * cw).toFixed(2) : '';
    };

    // Слушаем изменения во всем теле таблицы грузов
    tbody.addEventListener('input', (e) => {
        if (e.target.tagName === 'INPUT') {
            const row = e.target.closest('tr');
            if (row) calculateRow(row);
        }
    });
}

// 4. Генерация PDF
function initPdfGeneration() {
    const btnPdf = document.getElementById('btnGeneratePdf');
    if (btnPdf) {
        btnPdf.addEventListener('click', () => {
            // Добавляем класс скрытия UI
            document.body.classList.add('tms-preview-active');
            window.print();
            // Возвращаем UI после печати
            setTimeout(() => document.body.classList.remove('tms-preview-active'), 500);
        });
    }
}

// 5. Поиск контрагентов (Lookups) - Оставлено без изменений
function initLookups() {
    const modal = document.getElementById('tmsGlobalSearchModal');
    const closeBtn = document.getElementById('btnCloseSearchModal');
    const searchInput = document.getElementById('tmsGlobalSearchInput');
    const resultsContainer = document.getElementById('tmsGlobalSearchResults');
    
    let currentLookupConfig = null;

    const lookupsConfig = [
        { btnId: 'lkShipper', inputId: 'lkShipperId', type: 'shipper', docField: 'awbShipperAddress', accField: 'awbShipperAcc' },
        { btnId: 'lkConsignee', inputId: 'lkConsigneeId', type: 'consignee', docField: 'awbConsigneeAddress', accField: 'awbConsigneeAcc' },
        { btnId: 'lkAgent', inputId: 'lkAgentId', type: 'agent', docField: 'awbAgentInfo', accField: 'awbAgentAcc' },
        { btnId: 'lkAirline', inputId: 'lkAirlineId', type: 'airline', docField: 'awbAirlineName', accField: null }
    ];

    const applyLookupData = (itemData, config) => {
        const fullText = `${itemData.name}\n${itemData.addr}`;
        safeSetVal(config.docField, fullText);
        
        if (config.accField) safeSetVal(config.accField, itemData.id);
        if (config.inputId) safeSetVal(config.inputId, itemData.id);

        if (config.type === 'shipper' || config.type === 'consignee') {
            updatePartyUI(config.type, itemData.name, itemData.id);
        }

        const docFieldEl = document.getElementById(config.docField);
        if (docFieldEl) docFieldEl.dispatchEvent(new Event('input'));
    };

    const openModalWithSearch = (config, initialQuery = '') => {
        currentLookupConfig = config;
        searchInput.value = initialQuery;
        resultsContainer.innerHTML = '<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 12px;">Введите запрос для поиска...</div>';
        modal.style.display = 'flex';
        searchInput.focus();
        if (initialQuery) searchInput.dispatchEvent(new Event('input'));
    };

    lookupsConfig.forEach(config => {
        const btn = document.getElementById(config.btnId);
        const inputEl = document.getElementById(config.inputId);
        
        if (btn) btn.addEventListener('click', () => openModalWithSearch(config, inputEl ? inputEl.value.trim() : ''));
        if (inputEl) {
            inputEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const query = inputEl.value.trim().toUpperCase();
                    if (!query) return;

                    const found = MOCK_DB.find(dbItem => dbItem.id.toUpperCase() === query);
                    if (found) applyLookupData(found, config);
                    else openModalWithSearch(config, query);
                }
            });
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query.length < 2) {
                resultsContainer.innerHTML = '<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 12px;">Введите минимум 2 символа...</div>';
                return;
            }

            const filtered = MOCK_DB.filter(item => item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query));
            if (filtered.length === 0) {
                resultsContainer.innerHTML = '<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 12px;">Ничего не найдено</div>';
                return;
            }

            resultsContainer.innerHTML = '';
            filtered.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = 'padding: 12px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
                row.onmouseover = () => row.style.background = '#f8fafc';
                row.onmouseout = () => row.style.background = 'transparent';
                row.innerHTML = `
                    <div><div style="font-weight: 700; color: #1e293b; font-size: 13px;">${item.name}</div><div style="font-size: 11px; color: #64748b; margin-top: 4px;">${item.addr.replace(/\n/g, ', ')}</div></div>
                    <div style="font-weight: 800; color: #cbd5e1; font-size: 12px;">${item.id}</div>
                `;
                row.addEventListener('click', () => {
                    if (currentLookupConfig) applyLookupData(item, currentLookupConfig);
                    modal.style.display = 'none';
                });
                resultsContainer.appendChild(row);
            });
        });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
}

// 6. IATA Валидатор - Оставлен без изменений (Бизнес-логика)
const IataWarning = {
    el: null, timeout: null,
    init() {
        this.el = document.createElement('div');
        this.el.className = 'tms-iata-warning';
        this.el.innerHTML = '💡<span class="tms-iata-tooltip"></span>';
        document.body.appendChild(this.el);
    },
    show(targetNode, msg) {
        if (!this.el) this.init();
        const tooltip = this.el.querySelector('.tms-iata-tooltip');
        tooltip.innerText = msg;
        const rect = targetNode.getBoundingClientRect();
        this.el.style.top = (rect.top + window.scrollY - 10) + 'px';
        this.el.style.left = (rect.right + window.scrollX - 25) + 'px';
        this.el.style.display = 'block';
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => { this.hide(); }, 3000);
    },
    hide() {
        if (this.el) { this.el.style.display = 'none'; clearTimeout(this.timeout); }
    }
};

function initIataValidation() {
    const fieldConfigs = {
        'awbShipperAddress': { lines: 4, chars: 35 },
        'awbConsigneeAddress': { lines: 4, chars: 35 },
        'awbAgentInfo': { lines: 4, chars: 35 },
        'awbHandling': { lines: 4, chars: 65 },
        'awbAccounting': { lines: 4, chars: 35 }
    };

    const cleanIata = (str) => str.toUpperCase().replace(/[^A-Z0-9 \n.,\-\/]/g, '');
    const allFields = document.querySelectorAll('.tms-ws-input, .tms-locked-field, .tms-awb-textarea');

    allFields.forEach(field => {
        const tagName = field.tagName.toLowerCase();
        if (tagName === 'select' || tagName === 'button' || field.type === 'checkbox') return; 
        
        field.addEventListener('input', function(e) {
            let cursorOrig = this.selectionStart || 0;
            let rawVal = this.value;
            let val = cleanIata(rawVal);

            if (rawVal.toUpperCase() !== val && rawVal.length > 0 && (!e.detail || !e.detail.isPaste)) {
                IataWarning.show(this, 'Недопустимый символ. Только (A-Z), цифры и знаки препинания.');
            }

            if (tagName === 'textarea' && fieldConfigs[this.id]) {
                const config = fieldConfigs[this.id];
                let rawLines = val.split('\n');
                let processedLines = [];

                for (let i = 0; i < rawLines.length; i++) {
                    let words = rawLines[i].split(' ');
                    let currentLine = "";

                    for (let j = 0; j < words.length; j++) {
                        let word = words[j];
                        while (word.length > config.chars) {
                            if (currentLine) { processedLines.push(currentLine); currentLine = ""; }
                            processedLines.push(word.substring(0, config.chars));
                            word = word.substring(config.chars);
                        }
                        if (word === "") {
                            if (currentLine.length + 1 <= config.chars && currentLine !== "") currentLine += " ";
                            continue;
                        }
                        if (currentLine === "") currentLine = word;
                        else if (currentLine.length + 1 + word.length <= config.chars) currentLine += " " + word;
                        else { processedLines.push(currentLine); currentLine = word; }
                    }
                    if (currentLine !== "") processedLines.push(currentLine);
                }
                val = processedLines.slice(0, config.lines).join('\n');
            }

            if (this.value !== val) {
                this.value = val;
            }
        });
    });
}

// 7. Быстрый переход
function initQuickJump() {
    const qjCategory = document.getElementById('qjCategory');
    const qjYear = document.getElementById('qjYear');
    const qjNumber = document.getElementById('qjNumber');
    const goBtn = document.getElementById('qjGoBtn');

    if (currentOrder && currentOrder.order_number) {
        const parts = currentOrder.order_number.split('-');
        if (parts.length === 2 && qjCategory && qjYear && qjNumber) {
            qjCategory.value = parts[0];
            qjYear.value = parts[1].substring(0, 2);
            qjNumber.value = parseInt(parts[1].substring(2), 10) || '';
        }
    }

    if (qjNumber) {
        qjNumber.addEventListener('blur', (e) => {
            let val = e.target.value.trim();
            if (val && !isNaN(val)) e.target.value = val.padStart(4, '0');
        });
    }

    if (goBtn && qjCategory && qjYear && qjNumber) {
        goBtn.addEventListener('click', () => {
            const cat = qjCategory.value.toUpperCase();
            const yr = qjYear.value;
            const numRaw = qjNumber.value;
            if (!cat || !numRaw) return;
            window.location.href = `OrderDetail.html?id=${cat}-${yr}${numRaw.padStart(4, '0')}`;
        });
    }
}