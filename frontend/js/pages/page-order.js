/**
 * TMS ORDER WORKSPACE CORE (page-order.js)
 * Refactored: Focused on modularity, safety, and scalability.
 */

import { api } from '../api.js';
import { injectTmsHeader } from '../ui/header.js';

// --- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ---
let currentOrder = null;
let isEditMode = false;

// Имитация базы данных (В будущем заменить на вызовы API)
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
        currentOrder = await api.getBookingById(orderId);
        
        // Рендер данных
        populatePassportData();
        
        // Инициализация UI-модулей
        initTopBarLogic();
        initQuickJump();
        initDocPagination();
        initTabs();
        initLookups();
        initAwbCalculator();
        initIataValidation();
        initPdfGeneration();
        
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

    // Топ-бар
    const dateEl = document.getElementById('orderCreationDate');
    if (dateEl && currentOrder.created_at) {
        dateEl.innerText = new Date(currentOrder.created_at).toLocaleDateString();
    }
    safeSetVal('opStatus', currentOrder.status || 'active');

    // Левая панель (Паспорт)
    updatePartyUI('billTo', currentOrder.bill_to_name);
    updatePartyUI('shipper', currentOrder.shipper_name);
    updatePartyUI('consignee', currentOrder.consignee_name);

    safeSetVal('originCity', currentOrder.origin_city);
    safeSetVal('destCity', currentOrder.destination_city);
    
    const etd = currentOrder.etd ? currentOrder.etd.split('T')[0] : '';
    const eta = currentOrder.eta ? currentOrder.eta.split('T')[0] : '';
    safeSetVal('etdDate', etd);
    safeSetVal('etaDate', eta);

    const gw = currentOrder.gross_weight_kg || '';
    const cw = currentOrder.chargeable_weight_kg || currentOrder.ldm || '';
    const pkgs = currentOrder.packages_count || '';

    safeSetVal('cargoGw', gw);
    safeSetVal('cargoCw', cw);
    safeSetVal('cargoPkgs', pkgs);

    // Правая панель (Бланк AWB)
    safeSetVal('awbDept', currentOrder.origin_city);
    safeSetVal('awbDest', currentOrder.destination_city);

    if (currentOrder.order_number && currentOrder.order_number.includes('-')) {
        const numPart = currentOrder.order_number.split('-')[1];
        safeSetVal('awbPrefix', "020"); // Заглушка, в будущем брать из справочника
        safeSetVal('awbSerial', numPart);
    }

    safeSetVal('awbGridPieces', pkgs);
    safeSetVal('awbGridGw', gw);
    safeSetVal('awbGridCw', cw);
}

// --- МОДУЛИ ИНТЕРФЕЙСА ---

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

        if (config.type === 'airline' && itemData.prefix) {
            safeSetVal('awbPrefix', itemData.prefix);
        }
    };

    const openModalWithSearch = (config, initialQuery = '') => {
        currentLookupConfig = config;
        searchInput.value = initialQuery;
        resultsContainer.innerHTML = '<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 12px;">Введите запрос для поиска...</div>';
        
        modal.style.display = 'flex';
        searchInput.focus();
        
        if (initialQuery) {
            searchInput.dispatchEvent(new Event('input'));
        }
    };

    // Привязка событий кнопок и инпутов
    lookupsConfig.forEach(config => {
        const btn = document.getElementById(config.btnId);
        const inputEl = document.getElementById(config.inputId);
        
        if (btn) {
            btn.addEventListener('click', () => openModalWithSearch(config, inputEl ? inputEl.value.trim() : ''));
        }

        if (inputEl) {
            inputEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const query = inputEl.value.trim().toUpperCase();
                    if (!query) return;

                    const found = MOCK_DB.find(dbItem => dbItem.id.toUpperCase() === query);
                    if (found) {
                        applyLookupData(found, config);
                    } else {
                        openModalWithSearch(config, query);
                    }
                }
            });
        }
    });

    // Обработчик живого поиска
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            if (query.length < 2) {
                resultsContainer.innerHTML = '<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 12px;">Введите минимум 2 символа...</div>';
                return;
            }

            const filtered = MOCK_DB.filter(item => 
                item.name.toLowerCase().includes(query) || 
                item.id.toLowerCase().includes(query)
            );

            if (filtered.length === 0) {
                resultsContainer.innerHTML = '<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 12px;">Ничего не найдено</div>';
                return;
            }

            resultsContainer.innerHTML = '';
            filtered.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = 'padding: 12px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: 0.2s; display: flex; justify-content: space-between; align-items: center;';
                
                row.onmouseover = () => row.style.background = '#f8fafc';
                row.onmouseout = () => row.style.background = 'transparent';

                row.innerHTML = `
                    <div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 13px;">${item.name}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${item.addr.replace(/\n/g, ', ')}</div>
                    </div>
                    <div style="font-weight: 800; color: #cbd5e1; font-size: 12px;">${item.id}</div>
                `;

                row.addEventListener('click', () => {
                    if (currentLookupConfig) {
                        applyLookupData(item, currentLookupConfig);
                    }
                    modal.style.display = 'none';
                });

                resultsContainer.appendChild(row);
            });
        });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
}

function initAwbCalculator() {
    const rateInput = document.getElementById('awbGridRate');
    const cwInput = document.getElementById('awbGridCw');
    const totalInput = document.getElementById('awbGridTotal');

    if (!rateInput || !cwInput || !totalInput) return;

    const calculate = () => {
        const rate = parseFloat(rateInput.value) || 0;
        const cw = parseFloat(cwInput.value) || 0;
        
        totalInput.value = (rate > 0 && cw > 0) ? (rate * cw).toFixed(2) : '';
    };

    rateInput.addEventListener('input', calculate);
    cwInput.addEventListener('input', calculate);
}

/**
 * ГЛОБАЛЬНЫЙ ВАЛИДАТОР IATA CARGO-IMP (Версия 2.0: Auto-Wrap + Ripple Effect)
 * Жестко контролирует матрицы (5x35 и др.), автоматически перенося текст на новые строки.
 */
function initIataValidation() {
    // 1. Конфигурация матриц для многострочных полей (Textarea)
    const areaLimits = {
        'awbShipperAddress': { lines: 5, chars: 35 },
        'awbConsigneeAddress': { lines: 5, chars: 35 },
        'awbAgentInfo': { lines: 2, chars: 35 },
        'awbHandling': { lines: 4, chars: 65 },
        'awbGridNature': { lines: 10, chars: 20 },
        'awbAirlineName': { lines: 2, chars: 35 },
        'awbAccounting': { lines: 4, chars: 35 }
    };

    // 2. Лимиты для однострочных инпутов
    const exactLimits = {
        'awbPrefix': 3, 'awbSerial': 8, 'awbDept': 3, 'awbDest': 3,
        'awbGridPieces': 4, 'awbGridGw': 7, 'awbGridCw': 7, 'awbGridRc': 1,
        'awbGridItemNo': 4, 'awbGridRate': 8, 'awbGridTotal': 12, 'awbAgentIata': 7,
        'awbAgentAcc': 15, 'awbShipperAcc': 15, 'awbConsigneeAcc': 15
    };

    // Утилита: очистка по стандартам IATA (Только A-Z, 0-9, пробел, Enter и пунктуация)
    const cleanIata = (str) => str.toUpperCase().replace(/[^A-Z0-9 \n.,\-\/]/g, '');

    const allFields = document.querySelectorAll('.tms-ws-input, .tms-locked-field, .tms-awb-textarea');

    allFields.forEach(field => {
        
        // ==========================================
        // БЛОК 1: БЕЗОПАСНАЯ ВСТАВКА (CTRL+V)
        // ==========================================
        field.addEventListener('paste', function(e) {
            e.preventDefault(); 
            let pastedText = (e.clipboardData || window.clipboardData).getData('text');
            pastedText = cleanIata(pastedText);

            // Если это обычный инпут - убираем переносы строк перед вставкой
            if (this.tagName.toLowerCase() !== 'textarea') {
                pastedText = pastedText.replace(/\n/g, '');
            }

            let start = this.selectionStart;
            let end = this.selectionEnd;
            this.value = this.value.slice(0, start) + pastedText + this.value.slice(end);
            
            // Ставим курсор в конец вставленного текста
            let newPos = start + pastedText.length;
            this.setSelectionRange(newPos, newPos);
            
            // Запускаем событие input, чтобы сработал авто-перенос (Auto-Wrap) и калькуляторы
            this.dispatchEvent(new Event('input'));
        });

        // ==========================================
        // БЛОК 2: АВТОМАТИЧЕСКИЙ ПЕРЕНОС СТРОК (AUTO-WRAP)
        // ==========================================
        field.addEventListener('input', function(e) {
            let cursorOrig = this.selectionStart;
            let rawVal = this.value;
            let val = cleanIata(rawVal);

            if (this.tagName.toLowerCase() === 'textarea' && areaLimits[this.id]) {
            const limit = areaLimits[this.id];
            let rawLines = val.split('\n');
            let processedLines = [];

            // 1. Проходим по каждой строке и применяем авто-перенос (Ripple)
            for (let i = 0; i < rawLines.length; i++) {
                let line = rawLines[i];
                
                // Пока строка длиннее лимита - режем и кидаем остаток в следующую строку
                while (line.length > limit.chars) {
                    processedLines.push(line.substring(0, limit.chars));
                    line = line.substring(limit.chars);
                    
                    // Если достигли лимита строк - прекращаем "водопад"
                    if (processedLines.length >= limit.lines) break;
                }

                // Добавляем остаток или нормальную строку
                if (processedLines.length < limit.lines) {
                    processedLines.push(line);
                } else {
                    break; // Лимит строк исчерпан
                }
            }

            // 2. Финальная проверка: обрезаем массив до лимита строк (на всякий случай)
            val = processedLines.slice(0, limit.lines).join('\n');
            
        } else if (exactLimits[this.id]) {
            // Для обычных инпутов
            if (val.length > exactLimits[this.id]) {
                val = val.substring(0, exactLimits[this.id]);
            }
        }

            // ==========================================
            // БЛОК 3: УМНЫЙ КОНТРОЛЬ КУРСОРОВ
            // ==========================================
            if (this.value !== val) {
                // Чтобы курсор не улетал при авто-переносе, вычисляем его реальную позицию
                let charsBeforeCursor = rawVal.substring(0, cursorOrig).replace(/\n/g, '').length;
                let charsCounted = 0;
                let newCursor = 0;
                
                for (let i = 0; i < val.length; i++) {
                    if (charsCounted === charsBeforeCursor) {
                        newCursor = i;
                        break;
                    }
                    if (val[i] !== '\n') charsCounted++;
                }
                if (charsCounted < charsBeforeCursor) newCursor = val.length;

                this.value = val;
                this.setSelectionRange(newCursor, newCursor);
            }
        });
    });
}

function initTopBarLogic() {
    const btnEdit = document.getElementById('btnEditOrder');
    const btnSave = document.getElementById('btnSaveOrder');
    const lockedFields = document.querySelectorAll('.tms-locked-field');

    if (!btnEdit || !btnSave) return;

    btnEdit.addEventListener('click', () => {
        isEditMode = !isEditMode;
        if (isEditMode) {
            btnEdit.classList.add('active');
            btnEdit.innerText = '✖ Отменить ред.';
            btnSave.disabled = false;
            lockedFields.forEach(field => field.disabled = false);
        } else {
            btnEdit.classList.remove('active');
            btnEdit.innerText = '🔓 Редактировать';
            btnSave.disabled = true;
            lockedFields.forEach(field => field.disabled = true);
            populatePassportData(); 
        }
    });

    btnSave.addEventListener('click', () => {
        isEditMode = false;
        btnEdit.classList.remove('active');
        btnEdit.innerText = '🔓 Редактировать';
        btnSave.disabled = true;
        lockedFields.forEach(field => field.disabled = true);
        alert("Изменения сохранены в оперативный контекст.");
    });
}

function initDocPagination() {
    const btnNext = document.getElementById('btnNextToCharges');
    const btnBack = document.getElementById('btnBackToCargo');
    const page1 = document.getElementById('docPage1');
    const page2 = document.getElementById('docPage2');

    if (btnNext && btnBack && page1 && page2) {
        btnNext.addEventListener('click', () => {
            page1.style.display = 'none';
            page2.style.display = 'block';
        });
        btnBack.addEventListener('click', () => {
            page2.style.display = 'none';
            page1.style.display = 'block';
        });
    }
}

function initTabs() {
    const tabs = document.querySelectorAll('#wsTabs .tms-tab-btn');
    const contents = document.querySelectorAll('.tms-tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.style.display = 'none');
            
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.style.display = 'block';
        });
    });
}

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

function initPdfGeneration() {
    const btnPdf = document.getElementById('btnGeneratePdf');
    if (btnPdf) {
        btnPdf.addEventListener('click', () => {
            window.print();
        });
    }
}