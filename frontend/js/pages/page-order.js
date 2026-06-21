/**
 * TMS ORDER WORKSPACE CORE (page-order.js)
 */

import { api } from '../api.js';
import { injectTmsHeader } from '../ui/header.js';

let currentOrder = null;
let isEditMode = false;

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
        
        populatePassportData();
        initTopBarLogic();
        initQuickJump();
        initDocPagination();
        initTabs();
        initLookups(); // Запуск логики баз данных контрагентов
        
    } catch (error) {
        alert(`Сбой загрузки: ${error.message}`);
        window.location.href = "ActiveBookings.html";
    }
}

/**
 * 2. ЗАПОЛНЕНИЕ ЛЕВОЙ ПАНЕЛИ И БЛАНКА (Безопасный рендер)
 */
function populatePassportData() {
    if (!currentOrder) return;

    // Функция-предохранитель: меняет value только если элемент реально есть на странице
    const safeSetVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };

    // Топ-бар
    const dateEl = document.getElementById('orderCreationDate');
    if (dateEl && currentOrder.created_at) {
        dateEl.innerText = new Date(currentOrder.created_at).toLocaleDateString();
    }
    safeSetVal('opStatus', currentOrder.status || 'active');

    // Левая панель (Паспорт) - Синхронизация
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

    // Правая панель (Бланк AWB) - Заполняем только те поля, которые уже сверстали
    safeSetVal('awbDept', currentOrder.origin_city); // Обрати внимание, ID исправлен на awbDept
    safeSetVal('awbDest', currentOrder.destination_city); // Исправлено на awbDest

    if (currentOrder.order_number && currentOrder.order_number.includes('-')) {
        const numPart = currentOrder.order_number.split('-')[1];
        safeSetVal('awbPrefix', "020"); // Заглушка
        safeSetVal('awbSerial', numPart);
    }

    // Эти поля пока закомментированы, так как мы будем верстать эту таблицу на следующем шаге
    /*
    safeSetVal('awbGridPieces', pkgs);
    safeSetVal('awbGridGw', gw);
    safeSetVal('awbGridCw', cw);
    */
}


/**
 * ИНИЦИАЛИЗАЦИЯ ГЛОБАЛЬНОГО ПОИСКА (Lookup + Enter Key)
 */
function initLookups() {
    const modal = document.getElementById('tmsGlobalSearchModal');
    const closeBtn = document.getElementById('btnCloseSearchModal');
    const searchInput = document.getElementById('tmsGlobalSearchInput');
    const resultsContainer = document.getElementById('tmsGlobalSearchResults');
    
    let currentLookupType = null; 
    let currentDocField = null;   

    // Добавлен inputId для связи с полем ввода
    const lookups = [
        { btnId: 'lkShipper', inputId: 'lkShipperId', type: 'shipper', docField: 'awbShipperAddress', accField: 'awbShipperAcc' },
        { btnId: 'lkConsignee', inputId: 'lkConsigneeId', type: 'consignee', docField: 'awbConsigneeAddress', accField: 'awbConsigneeAcc' },
        { btnId: 'lkAgent', inputId: 'lkAgentId', type: 'agent', docField: 'awbAgentInfo', accField: 'awbAgentAcc' },
        { btnId: 'lkAirline', inputId: 'lkAirlineId', type: 'airline', docField: 'awbAirlineName', accField: null }
    ];

    // Имитация базы данных
    const dummyDb = [
        { id: 'SHP-101', name: 'GLOBAL EXPORTS GMBH', addr: 'STREET 1, BERLIN\nGERMANY' },
        { id: 'AL-020', name: 'Lufthansa Cargo AG', addr: 'Tor 25, 60549 Frankfurt\nGermany' },
        { id: 'CNE-505', name: 'IMPORTEX S.A.', addr: 'ASUNCION 118\nPARAGUAY' }
    ];

    // Функция применения найденных данных в интерфейс (DRY)
    const applyLookupData = (itemData, config) => {
        const fullText = `${itemData.name}\n${itemData.addr}`;
        const docFieldEl = document.getElementById(config.docField);
        if (docFieldEl) docFieldEl.value = fullText;

        if (config.accField) {
            const accFieldEl = document.getElementById(config.accField);
            if (accFieldEl) accFieldEl.value = itemData.id;
        }

        // Обновляем мини-инпут
        const minInput = document.getElementById(config.inputId);
        if (minInput) minInput.value = itemData.id;

        // Синхронизация с Левой Панелью
        if (config.type === 'shipper' || config.type === 'consignee') {
            const nameField = document.getElementById(`${config.type}Name`);
            const idField = document.getElementById(`${config.type}Id`);
            if (nameField) nameField.value = itemData.name;
            if (idField) idField.value = itemData.id;
        }
    };

    // Функция открытия модалки
    const openModalWithSearch = (config, initialQuery = '') => {
        currentLookupType = config.type;
        currentDocField = config.docField;
        
        searchInput.value = initialQuery;
        resultsContainer.innerHTML = '<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 12px;">Введите запрос для поиска...</div>';
        
        modal.style.display = 'flex';
        searchInput.focus();
        
        // Триггерим поиск сразу, если есть query
        if (initialQuery) {
            searchInput.dispatchEvent(new Event('input'));
        }
    };

    // Навешиваем слушатели на кнопки 🔍 и инпуты (Enter)
    lookups.forEach(config => {
        const btn = document.getElementById(config.btnId);
        const inputEl = document.getElementById(config.inputId);
        
        // Клик по лупе
        if (btn) {
            btn.addEventListener('click', () => openModalWithSearch(config, inputEl ? inputEl.value.trim() : ''));
        }

        // Нажатие Enter в мини-поле
        if (inputEl) {
            inputEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const query = inputEl.value.trim().toUpperCase();
                    if (!query) return;

                    // Ищем точное совпадение по ID
                    const found = dummyDb.find(dbItem => dbItem.id.toUpperCase() === query);
                    
                    if (found) {
                        applyLookupData(found, config);
                    } else {
                        openModalWithSearch(config, query);
                    }
                }
            });
        }
    });

    // Живой поиск в модалке (Оставлен без изменений)
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            
            if (query.length < 2) {
                resultsContainer.innerHTML = '<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 12px;">Введите минимум 2 символа...</div>';
                return;
            }

            const filtered = dummyDb.filter(item => 
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
                    const activeConfig = lookups.find(l => l.type === currentLookupType);
                    if (activeConfig) {
                        applyLookupData(item, activeConfig);
                    }
                    modal.style.display = 'none';
                });

                resultsContainer.appendChild(row);
            });
        });
    }

    // Закрытие модального окна
    if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
}

/**
 * Утилита синхронизации полей участников
 */
function updatePartyUI(type, name, id = "DB") {
    // Обновляем паспорт слева
    const idField = document.getElementById(`${type}Id`);
    const nameField = document.getElementById(`${type}Name`);
    if (idField) idField.value = id;
    if (nameField) nameField.value = name;
}

function initTopBarLogic() {
    const btnEdit = document.getElementById('btnEditOrder');
    const btnSave = document.getElementById('btnSaveOrder');
    const lockedFields = document.querySelectorAll('.tms-locked-field');

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

    if (btnNext && btnBack) {
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
            document.getElementById(targetId).style.display = 'block';
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
        if (parts.length === 2) {
            if (qjCategory) qjCategory.value = parts[0];
            if (qjYear) qjYear.value = parts[1].substring(0, 2);
            if (qjNumber) qjNumber.value = parseInt(parts[1].substring(2), 10) || '';
        }
    }

    if (qjNumber) {
        qjNumber.addEventListener('blur', (e) => {
            let val = e.target.value.trim();
            if (val && !isNaN(val)) e.target.value = val.padStart(4, '0');
        });
    }

    goBtn.addEventListener('click', () => {
        const cat = qjCategory.value.toUpperCase();
        const yr = qjYear.value;
        const numRaw = qjNumber.value;
        if (!cat || !numRaw) return;
        window.location.href = `OrderDetail.html?id=${cat}-${yr}${numRaw.padStart(4, '0')}`;
    });
}