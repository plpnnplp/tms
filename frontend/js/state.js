/**
 * TMS CORE: State Management (Store & History)
 * Ответственность: Хранение единого источника правды (Single Source of Truth).
 * Никаких прямых обращений к DOM (document.getElementById здесь запрещен).
 */

// 1. ЖЕСТКАЯ СХЕМА ДАННЫХ (Скелет пустого бланка)
const initialState = {
    config: {
        language: 'en',
        transport: 'road',
        direction: 'export',
        clientRole: 'sender'
    },
    route: {
        pickup: {
            rawText: '',       // Исходный текст из мессенджера/инпута
            cleanCity: '',     // Валидное имя от гео-API (например, "Kyiv")
            countryCode: '',   // Двузначный код (UA, DE) для таможни и тарифов
            lat: null,
            lon: null,
            address: ''        // Улица, индекс, фирма
        },
        delivery: {
            rawText: '',
            cleanCity: '',
            countryCode: '',
            lat: null,
            lon: null,
            address: ''
        },
        distance: 0
    },
    conditions: {
        incotermsCode: 'FCA',
        incotermsPlace: '',
        loadType: 'Full Load (FTL)',
        customsPlaces: ''
    },
    // Грузы храним как массив объектов, а не HTML-строки
    cargo: [
        { id: generateId(), qty: 1, stack: 'Да / Yes', l: 120, w: 80, h: 160, weight: 0, charge: 0.00, ldm: 0.40 }
    ],
    // Услуги и финансы (массив добавленных сборов)
    services: [], 
    details: {
        clientCompany: '',
        clientCountry: '',
        clientContact: '',
        clientContactInfo: '',
        paymentTerms: '',
        transitTime: '',
        specialNotes: ''
    },
    meta: {
        quoteNumber: '',
        validUntilDate: '',
        managerName: 'Manager',
        managerEmail: 'm.professional@tms.de'
    }
};

// Хелпер для уникальных ID строк груза
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// 2. ЯДРО УПРАВЛЕНИЯ СОСТОЯНИЕМ (Store & Pub/Sub)
class TMSStore {
    constructor() {
        // Глубокое клонирование стартового состояния
        this.state = JSON.parse(JSON.stringify(initialState));
        this.listeners = [];
        
        // Встроенный менеджер истории (Undo/Redo)
        this.history = { past: [], future: [] };
        this.maxHistoryDepth = 50;
        this.isProcessingHistory = false;
    }

    // ПОДПИСКА: Любой UI-модуль может подписаться на обновления
    subscribe(listener) {
        this.listeners.push(listener);
        // Возвращаем функцию отписки
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    // УВЕДОМЛЕНИЕ: Вызывается автоматически при любом изменении State
    _notify() {
        if (this.isProcessingHistory) return;
        // Передаем защищенную (иммутабельную) копию стейта, чтобы UI не мог ее сломать напрямую
        const stateSnapshot = this.getState();
        this.listeners.forEach(listener => listener(stateSnapshot));
    }

    // ПОЛУЧЕНИЕ ДАННЫХ
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }

    // 3. МЕТОДЫ МУТАЦИИ ДАННЫХ (Actions)
    /**
     * @param {string} slice - Раздел стейта (например 'config', 'route')
     * @param {object} payload - Новые данные для обновления
     * @param {boolean} saveHistory - Нужно ли делать снимок для Ctrl+Z
     */
    update(slice, payload, saveHistory = true) {
        if (saveHistory) this._saveSnapshot();

        if (slice && this.state[slice]) {
            // Обновляем конкретный блок
            this.state[slice] = { ...this.state[slice], ...payload };
        } else if (!slice) {
            // Обновляем корень (например, при загрузке данных с бэкенда)
            this.state = { ...this.state, ...payload };
        }
        
        this._notify();
    }

    // Специальные методы для массивов (Грузы)
    addCargoRow(cargoData = null) {
        this._saveSnapshot();
        const newRow = cargoData || { id: generateId(), qty: 1, stack: 'Да / Yes', l: 120, w: 80, h: 160, weight: 0, charge: 0.00, ldm: 0.40 };
        this.state.cargo.push(newRow);
        this._notify();
    }

    removeCargoRow(id) {
        if (this.state.cargo.length <= 1) return; // Оставляем минимум 1 строку
        this._saveSnapshot();
        this.state.cargo = this.state.cargo.filter(item => item.id !== id);
        this._notify();
    }

    // 4. ИНКАПСУЛИРОВАННАЯ ИСТОРИЯ (Undo / Redo)
    _saveSnapshot() {
        this.history.past.push(this.getState());
        if (this.history.past.length > this.maxHistoryDepth) {
            this.history.past.shift();
        }
        this.history.future = []; // Сбрасываем ветку будущего при новом действии
    }

    undo() {
        if (this.history.past.length === 0) return;
        this.isProcessingHistory = true;
        
        this.history.future.push(this.getState());
        this.state = this.history.past.pop();
        
        this.isProcessingHistory = false;
        this._notify();
    }

    redo() {
        if (this.history.future.length === 0) return;
        this.isProcessingHistory = true;
        
        this.history.past.push(this.getState());
        this.state = this.history.future.pop();
        
        this.isProcessingHistory = false;
        this._notify();
    }

    // Проверка статуса кнопок истории (для UI)
    getHistoryStatus() {
        return {
            canUndo: this.history.past.length > 0,
            canRedo: this.history.future.length > 0
        };
    }
}

// Создаем единственный глобальный экземпляр хранилища (Singleton)
export const appStore = new TMSStore();

// Оставляем HistoryManager как фасад (Proxy) для старого кода, 
// чтобы не сломать кнопки в page-quote.js прямо сейчас.
export const HistoryManager = {
    init: () => {}, 
    saveState: () => {
        // Убираем старую заглушку и реально вызываем сохранение в стейт
        if (window.appStore && typeof window.appStore._saveSnapshot === 'function') {
            window.appStore._saveSnapshot();
        }
    },
    handleUndo: () => appStore.undo(),
    handleRedo: () => appStore.redo()
};

window.appStore = appStore;
window.HistoryManager = HistoryManager;