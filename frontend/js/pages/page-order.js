/**
 * TMS ORDER WORKSPACE CORE (page-order.js)
 * Ответственность: Маршрутизация конкретного заказа, адаптивный бланк (AWB/BL/CMR),
 * динамический расчет финансового контроля (Profit) и управление контрагентами.
 * Исполнено в рамках модульной архитектуры ES6 без сокращения логики.
 */

import { api } from '../api.js';
import { injectTmsHeader } from '../ui/header.js';

let currentOrderContext = null;

document.addEventListener('DOMContentLoaded', () => {
    // Инициализация рабочего пространства при загрузке DOM-дерева
    initWorkspace();
    setupEventListeners();
});

/**
 * 1. ИНИЦИАЛИЗАЦИЯ РАБОЧЕЙ СРЕДЫ ЗАКАЗА
 */
export function initWorkspace() {
    // Читаем ID заказа из адресной строки (например, ?id=AE-2600001)
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');

    if (!orderId) {
        alert("КРИТИЧЕСКАЯ ОШИБКА: ID заказа не передан. Возврат в базу.");
        window.location.href = "ActiveBookings.html";
        return;
    }

    // Запрос контекста заказа из хранилища через общий API-клиент
    const db = api.getActiveOrders();
    currentOrderContext = db.find(o => o.orderId === orderId);

    if (!currentOrderContext) {
        alert(`Заказ ${orderId} не найден в активной базе.`);
        window.location.href = "ActiveBookings.html";
        return;
    }

    console.log("[TMS WORKSPACE] Загружен контекст заказа:", currentOrderContext);

    // Запуск формирования интерфейсных компонентов
    setupQuickJump(currentOrderContext.orderId);
    renderSystemSidebar(currentOrderContext);
    renderDynamicDocument(currentOrderContext);
}

/**
 * 2. ЦЕНТРАЛИЗОВАННАЯ ПРИВЯЗКА СОБЫТИЙ (Замена инлайновых вызовов)
 */
function setupEventListeners() {
    // Кнопка удаления заказа из оперативного учета
    const deleteBtn = document.querySelector('.tms-top-bar button[style*="background: #ef4444"]');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (!currentOrderContext) return;
            const isConfirmed = confirm(`КРИТИЧЕСКОЕ ДЕЙСТВИЕ!\nВы уверены, что хотите безвозвратно удалить заказ ${currentOrderContext.orderId} из оперативного учета?`);
            if (isConfirmed) {
                let db = api.getActiveOrders();
                db = db.filter(o => o.orderId !== currentOrderContext.orderId);
                api.saveActiveOrders(db);
                window.location.href = "ActiveBookings.html";
            }
        });
    }

    // Кнопка сохранения изменений всей формы
    const saveBtn = document.querySelector('.tms-top-bar button[style*="background: #16a34a"]');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (!currentOrderContext) return;
            
            // Чтение измененного Buy Rate из сайдбара
            const buyRateInput = document.getElementById('sbBuyRateInput');
            if (buyRateInput) {
                currentOrderContext.commercials.buyRate = parseFloat(buyRateInput.value) || 0;
            }

            // Если транспорт относится к авиации, производим сбор изменений из полей бланка AWB
            if (currentOrderContext.specification.transportMode === 'air') {
                const prefix = document.getElementById('awbPrefix')?.value.trim() || '';
                const serial = document.getElementById('awbSerial')?.value.trim() || '';
                if (prefix || serial) {
                    currentOrderContext.transportDocs.masterDocNumber = `${prefix}-${serial}`;
                }

                if (currentOrderContext.parties.shipper) {
                    currentOrderContext.parties.shipper.text = document.getElementById('awbShipper')?.value || '';
                }
                if (currentOrderContext.parties.consignee) {
                    currentOrderContext.parties.consignee.text = document.getElementById('awbConsignee')?.value || '';
                }
                if (currentOrderContext.parties.carrier) {
                    currentOrderContext.parties.carrier.text = document.getElementById('awbCarrierName')?.value || '';
                }
                
                currentOrderContext.transportDocs.portOfLoading = document.getElementById('awbDep')?.value || '';
                currentOrderContext.transportDocs.portOfDischarge = document.getElementById('awbDest')?.value || '';
                currentOrderContext.transportDocs.vesselOrFlight = document.getElementById('awbFlight')?.value || '';
                
                currentOrderContext.cargoDetails.totalQty = parseInt(document.getElementById('awbPieces')?.value, 10) || 0;
                currentOrderContext.cargoDetails.grossWeight = parseFloat(document.getElementById('awbGrossForm')?.value) || 0;
                currentOrderContext.cargoDetails.chargeableWeight = parseFloat(document.getElementById('awbChargeableForm')?.value) || 0;
                currentOrderContext.cargoDetails.descriptionOfGoods = document.getElementById('awbNature')?.value || '';
            }

            // Перезапись измененного контекста в хранилище через API слой
            let db = api.getActiveOrders();
            const index = db.findIndex(o => o.orderId === currentOrderContext.orderId);
            if (index !== -1) {
                db[index] = currentOrderContext;
                api.saveActiveOrders(db);
                alert(`Изменения по заказу ${currentOrderContext.orderId} успешно сохранены в системе.`);
                renderSystemSidebar(currentOrderContext);
            }
        });
    }

    // Живой пересчет Profit при вводе данных в поле Buy Rate
    const sidebar = document.querySelector('.tms-sidebar');
    if (sidebar) {
        sidebar.addEventListener('input', (e) => {
            if (e.target.id === 'sbBuyRateInput') {
                const buyRate = parseFloat(e.target.value) || 0;
                const sellRate = currentOrderContext?.commercials?.sellRate || 0;
                const profit = sellRate - buyRate;
                
                const profitSpan = document.getElementById('sbProfitValue');
                if (profitSpan) {
                    profitSpan.innerText = `${profit >= 0 ? '+' : ''}${profit.toFixed(2)} EUR`;
                    profitSpan.style.color = profit >= 0 ? '#16a34a' : '#ef4444';
                }
            }
        });
    }
}

/**
 * 3. ЗАПОЛНЕНИЕ СИСТЕМНОГО САЙДБАРА
 */
export function renderSystemSidebar(order) {
    const parties = order.parties || {};
    const cargo = order.cargoDetails || {};
    const comm = order.commercials || { sellRate: 0, buyRate: 0 };

    // Установка системных идентификаторов компаний
    document.getElementById('sbBillTo').innerText = parties.billTo?.id || '---';
    document.getElementById('sbShipper').innerText = parties.shipper?.id || '---';
    document.getElementById('sbConsignee').innerText = parties.consignee?.id || '---';
    document.getElementById('sbCarrier').innerText = parties.carrier?.id || '---';

    // Установка весовых характеристик груза
    document.getElementById('sbGross').innerText = `${cargo.grossWeight || 0} kg`;
    document.getElementById('sbChargeable').innerText = `${cargo.chargeableWeight || 0} kg`;

    // Расчет финансовой эффективности с генерацией управляемого инпута
    const profit = comm.sellRate - comm.buyRate;
    const financeBlock = document.querySelectorAll('.tms-sidebar .sidebar-block')[2];
    
    if (financeBlock) {
        financeBlock.innerHTML = `
            <div class="sidebar-title">Финансовый контроль</div>
            <div class="sidebar-row"><span>Sell Rate:</span> <span class="sidebar-value">${comm.sellRate.toFixed(2)} EUR</span></div>
            <div class="sidebar-row">
                <span>Buy Rate:</span> 
                <input type="number" id="sbBuyRateInput" value="${comm.buyRate}" style="width: 65px; font-size:11px; text-align:right; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 4px; font-weight: 700; color: #1e293b; outline: none;"> EUR
            </div>
            <div class="sidebar-row" style="margin-top: 8px; border-top: 1px dashed #cbd5e1; padding-top: 4px;">
                <span>Profit:</span> <span class="sidebar-value" id="sbProfitValue" style="color: ${profit >= 0 ? '#16a34a' : '#ef4444'};">${profit >= 0 ? '+' : ''}${profit.toFixed(2)} EUR</span>
            </div>
        `;
    }
}

/**
 * 4. ПЕРЕКЛЮЧЕНИЕ ФОРМАТА ДОКУМЕНТА (Мод-контроллер)
 */
export function renderDynamicDocument(order) {
    const spec = order.specification || {};
    const transportMode = spec.transportMode || 'road';

    // Сброс активного класса видимости со всех типов бланков
    document.getElementById('viewAir')?.classList.remove('active');
    document.getElementById('viewSea')?.classList.remove('active');
    document.getElementById('viewRoad')?.classList.remove('active');

    // Активация и наполнение целевой формы документа
    if (transportMode === 'air') {
        document.getElementById('viewAir')?.classList.add('active');
        fillAirWaybillForm(order);
    } else if (transportMode === 'sea') {
        document.getElementById('viewSea')?.classList.add('active');
    } else {
        document.getElementById('viewRoad')?.classList.add('active');
    }
}

/**
 * 5. ЛОГИКА НАПОЛНЕНИЯ AIR WAYBILL
 */
export function fillAirWaybillForm(order) {
    const parties = order.parties || {};
    const docs = order.transportDocs || {};
    const route = order.routing || {};
    const cargo = order.cargoDetails || {};

    // Разбор структуры номера MAWB (маска 020-44128953)
    let awbPrefix = '', awbSerial = '';
    if (docs.masterDocNumber && docs.masterDocNumber.includes('-')) {
        const parts = docs.masterDocNumber.split('-');
        awbPrefix = parts[0].trim();
        awbSerial = parts[1].trim();
    } else if (docs.masterDocNumber) {
        awbSerial = docs.masterDocNumber;
    }

    // Безопасное сопоставление данных с элементами DOM-дерева бланка
    const elPrefix = document.getElementById('awbPrefix');
    const elSerial = document.getElementById('awbSerial');
    const elShipper = document.getElementById('awbShipper');
    const elConsignee = document.getElementById('awbConsignee');
    const elCarrier = document.getElementById('awbCarrierName');
    const elRef = document.getElementById('awbReferenceId');
    const elDep = document.getElementById('awbDep');
    const elDest = document.getElementById('awbDest');
    const elFlight = document.getElementById('awbFlight');
    const elPieces = document.getElementById('awbPieces');
    const elGross = document.getElementById('awbGrossForm');
    const elChargeable = document.getElementById('awbChargeableForm');
    const elNature = document.getElementById('awbNature');

    if (elPrefix) elPrefix.value = awbPrefix;
    if (elSerial) elSerial.value = awbSerial;
    if (elShipper) elShipper.value = parties.shipper?.text || '';
    if (elConsignee) elConsignee.value = parties.consignee?.text || '';
    if (elCarrier) elCarrier.value = parties.carrier?.text || '';
    if (elRef) elRef.value = order.orderId;
    
    if (elDep) elDep.value = docs.portOfLoading || route.fromCity || '';
    if (elDest) elDest.value = docs.portOfDischarge || route.toCity || '';
    if (elFlight) elFlight.value = docs.vesselOrFlight || '';
    
    if (elPieces) elPieces.value = cargo.totalQty || '';
    if (elGross) elGross.value = cargo.grossWeight || '';
    if (elChargeable) elChargeable.value = cargo.chargeableWeight || '';
    if (elNature) elNature.value = cargo.descriptionOfGoods || '';
}

/**
 * 6. ПАРАМЕТРИЧЕСКИЙ QUICK JUMP ДЛЯ БЫСТРОГО ПЕРЕХОДА
 */
export function setupQuickJump(currentId) {
    const qjCategory = document.getElementById('qjCategory');
    const qjYear = document.getElementById('qjYear');
    const qjNumber = document.getElementById('qjNumber');
    const goBtn = document.querySelector('.quick-jump-group .tms-btn-primary');

    // Разбор текущего ID (маска вида AE-2600001) для предзаполнения полей перехода
    if (currentId && currentId.includes('-')) {
        const parts = currentId.split('-');
        if (qjCategory) qjCategory.value = parts[0];
        if (parts[1].length >= 2) {
            if (qjYear) qjYear.value = parts[1].substring(0, 2);
            if (qjNumber) qjNumber.value = parseInt(parts[1].substring(2), 10);
        }
    }

    if (goBtn) {
        goBtn.addEventListener('click', () => {
            const cat = qjCategory?.value.trim().toUpperCase() || '';
            const yr = qjYear?.value.trim() || '';
            const numRaw = qjNumber?.value.trim() || '';
            
            if (!numRaw) return;

            // Сборка нормализованного номера: "42" -> "00042"
            const numFormatted = String(numRaw).padStart(5, '0');
            const targetOrderId = `${cat}-${yr}${numFormatted}`;

            // Верификация существования записи перед выполнением редиректа
            const db = api.getActiveOrders();
            const exists = db.some(o => o.orderId === targetOrderId);

            if (exists) {
                window.location.href = `order-detail.html?id=${targetOrderId}`;
            } else {
                alert(`Заказ ${targetOrderId} не найден в базе активных оперативных данных.`);
                qjNumber?.focus();
            }
        });
    }

    // Поддержка обработки перехода по клавише Enter
    if (qjNumber) {
        qjNumber.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') goBtn?.click();
        });
    }
}

// Принудительный экспорт функций в глобальный контекст для предотвращения сбоев старой инфраструктуры
window.initWorkspace = initWorkspace;
window.renderSystemSidebar = renderSystemSidebar;
window.renderDynamicDocument = renderDynamicDocument;
window.fillAirWaybillForm = fillAirWaybillForm;
window.setupQuickJump = setupQuickJump;