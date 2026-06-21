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
        initTextareaProtection();
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
 * Уровень защиты: Жесткое ограничение строк и символов в textarea
 */
function initTextareaProtection() {
    const textareas = document.querySelectorAll('.tms-awb-textarea');

    textareas.forEach(ta => {
        // Устанавливаем лимиты:
        // Для партий (Shipper/Consignee): строго 5 строк по 35 символов (Стандарт IATA)
        // Для других блоков (Handling, Agent): например, 4 строки по 65 символов
        const isPartyAddress = ta.id === 'awbShipperAddress' || ta.id === 'awbConsigneeAddress';
        const maxLines = isPartyAddress ? 5 : 4; 
        const maxChars = isPartyAddress ? 35 : 65;

        // 1. Плавная блокировка Enter (чтобы курсор не дергался при попытке создать 6-ю строку)
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const lines = ta.value.split('\n');
                if (lines.length >= maxLines) {
                    e.preventDefault();
                }
            }
        });

        // 2. ЖЕСТКАЯ защита (Срабатывает при любом изменении текста: ввод, вставка, автозамена)
        ta.addEventListener('input', function() {
            let lines = this.value.split('\n');
            let isModified = false;

            // Шаг А: Жестко отсекаем лишние строки (больше 5)
            if (lines.length > maxLines) {
                lines = lines.slice(0, maxLines);
                isModified = true;
            }

            // Шаг Б: Жестко отсекаем лишние символы в каждой строке (больше 35)
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].length > maxChars) {
                    lines[i] = lines[i].substring(0, maxChars);
                    isModified = true;
                }
            }

            // Если скрипт нашел нарушения и обрезал текст — обновляем поле
            if (isModified) {
                // Запоминаем позицию курсора, чтобы он не улетал в конец текста при обрезке
                let cursorPosition = this.selectionStart;
                let oldLength = this.value.length;
                
                this.value = lines.join('\n');
                
                // Корректируем курсор с учетом удаленных символов
                let newCursor = cursorPosition - (oldLength - this.value.length);
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