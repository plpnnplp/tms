/**
 * TMS CORE: Page Controller - Quote Creation
 * Этот файл связывает UI (кнопки) и логику (Parser/UIController/Calculator).
 */

import { api } from '../api.js';
import { ParserEngine } from '../parser.js';
import { UIController } from '../ui/dom-updater.js';
import { Calculator } from '../calculator.js';
import { HistoryManager } from '../state.js';
import { injectTmsHeader } from '../ui/header.js';
import { tmsTitleTemplates } from '../translations.js';

// --- 1. ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 [TMS] Шаг 1: Запуск скрипта бланка...");

    // БЛОК А: Инициализация UI (Строго синхронно)
    try {
        injectTmsHeader();
        window.tmsTitleTemplates = tmsTitleTemplates;
        
        initEventListeners();
        UIController.initDropdownListeners();
        HistoryManager.init();
        UIController.initCityAutocomplete();
        
        // ВЫЗЫВАЕМ ЗДЕСЬ, ДО СЕТЕВОГО ЗАПРОСА
        if (typeof UIController.initTmsBlankDateTime === 'function') {
            UIController.initTmsBlankDateTime();
        }
        
        if (typeof UIController.initReactivity === 'function') {
            UIController.initReactivity();
        }
        UIController.initCityAutocomplete();

        console.log("✅ [TMS] Шаг 2: Интерфейс успешно активирован.");
    } catch (err) {
        console.error("❌ [TMS ОШИБКА UI] Логика интерфейса нарушена:", err);
    }

    // БЛОК Б: Асинхронные сетевые запросы (В фоновом режиме)
    (async () => {
        try {
            console.log("⏳ [TMS] Шаг 3: Запрос справочников с сервера...");
            await loadTmsPrices();
            console.log("✅ [TMS] Шаг 4: Справочники загружены, селекты обновлены!");
        } catch (err) {
            console.error("❌ [TMS ОШИБКА СЕТИ] Бэкенд не отдал справочники:", err);
            // Здесь в будущем нужно добавить вывод уведомления пользователю (Toast/Alert)
        }

        processUrlRouting();

        const savedData = localStorage.getItem('pendingQuoteData');
        if (savedData) {
            localStorage.removeItem('pendingQuoteData');
            const inputField = document.getElementById('rawText');
            if (inputField) {
                inputField.value = savedData;
                executeTmsTextParser();
            }
        }
    })();
});

function initEventListeners() {
    // 1. Статические кнопки интерфейса
    document.getElementById('btn-parse-data')?.addEventListener('click', executeTmsTextParser);
    document.getElementById('btnTmsFinalize')?.addEventListener('click', executeApplyChangesAndValidate);
    document.getElementById('btnTmsDownloadPdf')?.addEventListener('click', generatePdf);
    document.getElementById('btnTmsCloseValidationModal')?.addEventListener('click', () => {
        const modal = document.getElementById('tmsValidationModal');
        if (modal) modal.style.display = 'none';
    });
    document.getElementById('btnAddService')?.addEventListener('click', addServiceRowFromCatalog);
    
    // 2. Кнопки истории бланка
    document.getElementById('btnTmsUndo')?.addEventListener('click', () => {
        if (window.HistoryManager && typeof HistoryManager.handleUndo === 'function') {
            HistoryManager.handleUndo();
        }
    });
    document.getElementById('btnTmsRedo')?.addEventListener('click', () => {
        if (window.HistoryManager && typeof HistoryManager.handleRedo === 'function') {
            HistoryManager.handleRedo();
        }
    });

    // 3. Кнопка предпросмотра
    document.getElementById('btnTmsToggleVisibility')?.addEventListener('click', () => {
        UIController.togglePreviewMode();
    });

    // 4. ЦЕНТРАЛИЗОВАННЫЙ ПЕРЕХВАТ КЛИКОВ (СТРОГО БЕЗ ВЛОЖЕННЫХ СЛУШАТЕЛЕЙ!)
    document.addEventListener('click', (e) => {
        const target = e.target;

        // Добавление ряда груза
        if (target.closest('.btn-plus')) {
            e.preventDefault();
            if (window.appStore) window.appStore.addCargoRow();
        }
        // Удаление ряда груза
        else if (target.closest('.btn-minus')) {
            e.preventDefault();
            const rowId = target.closest('.tms-cargo-row')?.getAttribute('data-id');
            if (window.appStore && rowId) {
                window.appStore.removeCargoRow(rowId);
                if (window.Calculator) window.Calculator.recalculateFinances();
            }    
        }
        // Добавление дополнительной услуги
        // Удаление дополнительной услуги
        else if (target.closest('.btn-fin-minus')) {
            e.preventDefault();
            const btn = target.closest('.btn-fin-minus');
            const key = btn.getAttribute('data-key');
            
            if (key && window.appStore) {
                const currentStoreState = window.appStore.getState();
                const filtered = currentStoreState.services.filter(s => s.key !== key);
                window.appStore.update(null, { services: filtered }, true);
                
                if (window.Calculator && typeof window.Calculator.recalculateFinances === 'function') {
                    window.Calculator.recalculateFinances();
                }
            }
        }
        // Сбросить изменения
        else if (target.closest('#tmsManualChangeNotice button')) {
            e.preventDefault();
            executeTmsTextParser(); 
            const notice = document.getElementById('tmsManualChangeNotice');
            if (notice) notice.style.display = 'none';
        }

        // ИНТЕГРАЦИЯ КАСТОМНЫХ ДРОПДАУНОВ С APPSTORE
        const option = target.closest('.tms-option, .tms-load-option');
        if (option && window.appStore) {
            const wrapper = option.closest('.tms-select-wrapper, .tms-custom-select-wrapper, .tms-load-type-select-wrapper, .tms-payment-select-wrapper');
            const trigger = wrapper?.querySelector('.tms-select-trigger');
            
            if (trigger) {
                const val = option.getAttribute('data-value') || option.innerText.trim();
                
                // Передаем выбранное значение напрямую в State Manager
                if (trigger.id === 'blankIncotermsCode') {
                    window.appStore.update('conditions', { incotermsCode: val }, true);
                } else if (trigger.id === 'blankPaymentTerms') {
                    // Записываем выбранные условия оплаты в раздел 'details'
                    window.appStore.update('details', { paymentTerms: val }, true);
                } else if (trigger.id === 'blankTruckType') {
                    window.appStore.update('conditions', { loadType: val }, true);
                } else if (trigger.id === 'configLanguage') {
                    window.appStore.update('config', { language: val }, true);
                } else if (trigger.id === 'configTransport') {
                    window.appStore.update('config', { transport: val }, true);
                } else if (trigger.id === 'configDirection') {
                    window.appStore.update('config', { direction: val }, true);
                } else if (trigger.id === 'configClientRole') {
                    window.appStore.update('config', { clientRole: val }, true);
                }

                // Принудительно пересчитываем финансовую сетку под новые условия
                if (window.Calculator && typeof window.Calculator.recalculateFinances === 'function') {
                    window.Calculator.recalculateFinances();
                }
            }
        }
    });

    // 5. РЕАКТИВНЫЙ ВВОД (Защита каретки: сохраняем состояние только при выходе из поля)
    document.getElementById('tms-live-blank')?.addEventListener('focusout', (e) => {
        const target = e.target;
        if (!window.appStore) return;

        // Таблицы грузов и калькуляции цен имеют свои изолированные инпуты, их не трогаем
        if (target.closest('#tmsCargoTable') || target.closest('#blankServicesTable')) return;

        const val = target.value !== undefined ? target.value : target.innerText.trim();

        if (target.id === 'blankPickupAddress') window.appStore.update('route', { pickupAddress: val }, false);
        if (target.id === 'blankDeliveryAddress') window.appStore.update('route', { deliveryAddress: val }, false);
        if (target.id === 'blankIncotermsPlace') window.appStore.update('conditions', { incotermsPlace: val }, false);
        if (target.id === 'blankCustomsPoints') window.appStore.update('conditions', { customsPlaces: val }, false);
        if (target.id === 'clientCompany') window.appStore.update('details', { clientCompany: val }, false);
        if (target.id === 'clientContact') window.appStore.update('details', { clientContact: val }, false);
        if (target.id === 'validUntilDate') window.appStore.update('meta', { validUntilDate: val }, false);
        if (target.id === 'blankPaymentTerms') window.appStore.update('details', { paymentTerms: val }, false);
        if (target.id === 'blankTransitTime') window.appStore.update('details', { transitTime: val }, false);
        if (target.id === 'blankSpecialNotes') window.appStore.update('details', { specialNotes: val }, false);
        
        if (window.HistoryManager) window.HistoryManager.saveState();
    });
}

// --- 2. ЗАГРУЗКА ДАННЫХ ---
async function loadTmsPrices() {
    let prices = null;
    let cities = null;

    try {
        [prices, cities] = await Promise.all([api.fetchPrices(), api.fetchCities()]);
        
        window.tmsPricesData = prices;
        window.tmsCitiesData = cities;
        console.log("TMS: Справочники с бэкенда загружены успешно");
    } catch (error) {
        console.warn("TMS: Бэкенд недоступен. Переход на автономный режим (фолбэк).");
        window.tmsPricesData = null;
        window.tmsCitiesData = null;
    } finally {
        // Вызываем методы строго из UIController, передавая данные напрямую
        if (window.UIController) {
            if (typeof window.UIController.initAdditionalServicesDropdown === 'function') {
                window.UIController.initAdditionalServicesDropdown(window.tmsPricesData);
            }
            
            if (typeof window.UIController.initPaymentTermsDropdown === 'function') {
                window.UIController.initPaymentTermsDropdown(window.tmsPricesData);
            }
            
            const currentTransport = document.getElementById('configTransport')?.getAttribute('data-selected') || 'road';
            if (typeof window.UIController.filterIncotermsOptions === 'function') {
                window.UIController.filterIncotermsOptions(currentTransport);
            }
        } else {
            console.error("TMS Error: UIController не инициализирован к моменту загрузки данных.");
        }
    }
}

// --- 3. ЛОГИКА ПАРСИНГА И РОУТИНГА ---
async function executeTmsTextParser() {
    const rawText = document.getElementById('rawText').value;
    if (!rawText.trim()) { alert("Поле ввода пустое!"); return; }

    // 1. Парсим текст и прогоняем через Photon API
    const statePayload = await ParserEngine.parse(rawText);
    if (window.appStore) window.appStore.update(null, statePayload, true); 
    
    // 2. ЖДЕМ (await) пока OSRM проложит маршрут по координатам и запишет дистанцию
    await processRouteAndPrices();
    
    // 3. Строим финансовую сетку уже на основе точных километров
    if (window.Calculator && typeof window.Calculator.recalculateFinances === 'function') {
        window.Calculator.recalculateFinances();
    }
}

function highlightParsedFields() {
    const fieldsToHighlight = [
        'blankPickupCity',
        'blankDeliveryCity',
        'blankIncotermsCode',
        'blankIncotermsPlace',
        'blankTruckType',
        'blankCargoType',
        'blankPackageType'
    ];

    // Динамически добавляем стили, если их еще нет
    if (!document.getElementById('tms-highlight-style')) {
        const style = document.createElement('style');
        style.id = 'tms-highlight-style';
        style.innerHTML = `
            @keyframes tmsFlashSuccess {
                0% { background-color: rgba(34, 197, 94, 0.4); box-shadow: 0 0 10px rgba(34, 197, 94, 0.3); }
                100% { background-color: transparent; box-shadow: none; }
            }
            .tms-parsed-highlight {
                animation: tmsFlashSuccess 2.5s ease-out !important;
                border-radius: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    // Подсветка основных текстовых полей и селектов
    fieldsToHighlight.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const isTextDiv = el.tagName === 'DIV' && el.innerText.trim() !== '';
            const isSelectTrigger = el.classList.contains('tms-select-trigger');
            
            if (isTextDiv || isSelectTrigger) {
                el.classList.remove('tms-parsed-highlight');
                void el.offsetWidth; // Сброс DOM для перезапуска анимации
                el.classList.add('tms-parsed-highlight');
            }
        }
    });

    // Подсветка всех инпутов с габаритами и весом в таблице груза
    const cargoInputs = document.querySelectorAll('#tmsCargoTableBody input, #tmsCargoTableBody .tms-select-trigger');
    cargoInputs.forEach(el => {
        el.classList.remove('tms-parsed-highlight');
        void el.offsetWidth;
        el.classList.add('tms-parsed-highlight');
    });
}

async function processUrlRouting() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const action = params.get('action');
    
    if (id) {
        // Здесь логика подгрузки данных заказа из базы по ID через api.js
        console.log(`Загрузка заказа ${id} для режима ${action}`);
    }
}

// --- 4. РАСЧЕТЫ И БИЗНЕС-ЛОГИКА ---
async function processRouteAndPrices() {
    if (window.Calculator) {
        await window.Calculator.calculateRouteAndPrices();
        window.Calculator.recalculateFinances();
    }
}

function calculateValidityDateByTransport(transportType) {
    let days = 14; // дефолт для авто (road)
    if (transportType === 'air') days = 3;   // авиа ставки сгорают за 3 дня
    if (transportType === 'sea') days = 30;  // морские ставки живут месяц

    const date = new Date();
    date.setDate(date.getDate() + days);
    
    // Форматируем в красивый DD.MM.YYYY
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
}

function executeApplyChangesAndValidate() {
    const isValid = UIController.validateBlank();
    if (isValid) finalizeQuotationToBooking();
}

/**
 * ОТПРАВКА СФОРМИРОВАННОГО КП НА СЕРВЕРНЫЙ БЭКЕНД
 */
async function finalizeQuotationToBooking() {
    // 1. Извлекаем текущее состояние бланка из AppStore
    const state = window.appStore.getState();
    
    // Получаем сгенерированный смарт-номер КП (например, 20260613-R-E-MUC-KIE)
    const quoteId = state.meta?.quoteNumber; 

    if (!quoteId) {
        alert("Критическая ошибка: Смарт-номер КП не сгенерирован. Нечего сохранять.");
        return;
    }

    // 2. Формируем структуру Payload, которую жестко ожидает наш Python-сервер (модель QuoteCreatePayload)
    const payload = {
        quote_id: quoteId,
        data: {
            clientCompany: state.details?.clientCompany || '',
            clientContact: state.details?.clientContact || '',
            blankPickupCity: state.route?.pickup?.cleanCity || '',
            blankDeliveryCity: state.route?.delivery?.cleanCity || '',
            validUntilDate: state.meta?.validUntilDate || '--.--.----',
            config: {
                transport: state.config?.transport || 'road'
            },
            route: state.route || {},
            meta: {
                grandTotalValue: state.meta?.grandTotalValue || '0.00',
                validUntilDate: state.meta?.validUntilDate || '--.--.----'
            },
            // Закидываем весь остальной стейт для сохранности структуры внутри text-поля БД
            ...state 
        }
    };

    try {
        // Меняем интерфейс на режим загрузки
        console.log("[TMS] Отправка КП на бэкенд...", payload);
        
        // 3. Вызываем наш асинхронный fetch из api.js
        const response = await api.saveQuoteToBackend(payload);
        
        alert(`Коммерческое предложение ${quoteId} успешно сохранено в базу данных PostgreSQL!`);
        
        // Перенаправляем менеджера в реестр базы, чтобы он сразу увидел результат
        window.location.href = 'QuotesDatabase.html';

    } catch (error) {
        console.error("[TMS ERROR] Ошибка при сохранении КП:", error);
        alert(`Не удалось сохранить КП на сервере: ${error.message}`);
    }
}

// Обязательно проверяем, чтобы функция была доступна глобально для разметки HTML, если кнопка вызывает её инлайново
window.finalizeQuotationToBooking = finalizeQuotationToBooking;

// --- 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (Обертки) ---
function initHistoryManager() { HistoryManager.init(); }
function initAdditionalServicesDropdown(prices) {UIController.initAdditionalServicesDropdown(prices); }
function initPaymentTermsDropdown() { UIController.initPaymentTermsDropdown(window.tmsPricesData); }
function renderDynamicBaseFreight(r, t, l, w) { UIController.renderDynamicBaseFreight(r, t, l, w); }
function updateBaseFreightName(t, l) { UIController.updateBaseFreightName(t, l); }
function addServiceRowFromCatalog() { UIController.addServiceRowFromCatalog(); Calculator.calculateFinancials(); }
function updateQuotationTitle() { UIController.updateQuotationTitle(); }
function applyBlankLanguage(l) { UIController.applyBlankLanguage(l); }
function updateLoadTypeDropdownOptions(t) { UIController.updateLoadTypeDropdownOptions(t); }
function applyIncotermsFinancialFilter() { UIController.applyIncotermsFinancialFilter(); }
function updateFinancialSections() { Calculator.updateFinancialSections(); }
function applyTmsIncotermsAutomation(i) { UIController.applyTmsIncotermsAutomation(i); }
function initTmsBlankDateTime() { UIController.initTmsBlankDateTime(); }
function addCargoRow() { UIController.addCargoRow(); // Calculator.calculateCargoRow();//
    }
function removeCargoRow(b) { UIController.removeCargoRow(b); Calculator.calculateFinancials(); }
function generatePdf() { UIController.generatePdf(); }
function generateTmsSmartQuoteNumber() { 
    const num = Calculator.generateSmartNumber();
    UIController.displayQuoteNumber(num);
}

window.addServiceRowFromCatalog = () => {
    UIController.addServiceRowFromCatalog(); 
    // Больше не нужно вызывать Calculator.calculateFinancials() здесь, 
    // так как UIController делает это внутри себя.
};