/**
 * TMS: API Layer (Интеграция с FastAPI бэкендом и локальными файлами)
 */

const BASE_URL = 'http://127.0.0.1:8000';

export const api = {
    // ---------------------------------------------------------
    // 1. ЧТЕНИЕ ЛОКАЛЬНЫХ ФАЙЛОВ (Убираем ERR_CONNECTION_REFUSED)
    // ---------------------------------------------------------
    getCities: async () => {
        const response = await fetch('../json/cities.json');
        return await response.json();
    },
    
    fetchCities: async () => {
        const response = await fetch('../json/cities.json');
        return await response.json();
    },
    
    fetchPrices: async () => {
        const response = await fetch('../json/prices.json');
        return await response.json();
    },

    // ---------------------------------------------------------
    // 2. ВНЕШНИЕ СЕРВИСЫ (Работают независимо от нашего бэкенда)
    // ---------------------------------------------------------
    fetchDistance: async (lat1, lon1, lat2, lon2) => {
        const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            return Math.round(data.routes[0].distance / 1000); 
        }
        return 0;
    },

    // ---------------------------------------------------------
    // 3. СЕРВЕРНАЯ БД (Оставлено для совместимости с FastAPI)
    // ---------------------------------------------------------
    async getQuotes() {
        try {
            const response = await fetch(`${BASE_URL}/api/quotes`);
            if (!response.ok) throw new Error("Не удалось загрузить КП с сервера");
            return await response.json();
        } catch (error) {
            console.error("API Error [getQuotes]: Бэкенд лежит.", error);
            return [];
        }
    },

    async saveQuoteToBackend(payload) {
        const response = await fetch(`${BASE_URL}/api/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Отказ сервера: ${errorText}`);
        }
        return await response.json();
    },

    async updateQuoteStatus(quoteId, newStatus) {
        const response = await fetch(`${BASE_URL}/api/quotes/${quoteId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (!response.ok) throw new Error("Ошибка обновления статуса на сервере");
        return await response.json();
    },

    async deleteQuoteFromServer(quoteId) {
        const response = await fetch(`${BASE_URL}/api/quotes/${quoteId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error("Ошибка удаления КП на сервере");
        return await response.json();
    },


    async searchCounterparties(query) {
        if (!query || query.length < 2) return [];
        try {
            const response = await fetch(`${BASE_URL}/api/counterparties/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) return [];
            return await response.json();
        } catch (error) {
            console.error("[TMS] Ошибка поиска контрагента:", error);
            return [];
        }
    },

    async updateCounterparty(id, payload) {
        const response = await fetch(`${BASE_URL}/api/counterparties/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Бэкенд отказал в обновлении: ${errorText}`);
        }
        return await response.json();
    },
    
    async deleteCounterparty(id) {
        const response = await fetch(`${BASE_URL}/api/counterparties/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error("Ошибка удаления контрагента");
        return await response.json();
    },

   async createCounterparty(data) {
        const response = await fetch(`${BASE_URL}/api/counterparties`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Бэкенд отказал в сохранении (Код ${response.status}): ${errorText}`);
        }
        
        return await response.json();
    },

    async getCounterparties() {
        try {
            const response = await fetch(`${BASE_URL}/api/counterparties`);
            if (!response.ok) throw new Error("Не удалось загрузить контрагентов");
            return await response.json();
        } catch (error) {
            console.error("[TMS] Ошибка загрузки справочника:", error);
            return [];
        }
    },

    async getCounterpartyById(id) {
        const response = await fetch(`${BASE_URL}/api/counterparties/${id}`);
        if (!response.ok) return null;
        return await response.json();
    },

    // --- АКТИВНЫЕ ЗАКАЗЫ (BOOKINGS) ---
    async getActiveBookings() {
        try {
            const response = await fetch(`${BASE_URL}/api/bookings`);
            if (!response.ok) throw new Error("Не удалось загрузить активные заказы");
            return await response.json();
        } catch (error) {
            console.error("[TMS] Ошибка загрузки заказов:", error);
            return [];
        }
    },

    async acceptQuoteToBooking(quoteId, prefix) {
        // prefix: 'AE', 'SI', 'RE' и т.д.
        const response = await fetch(`${BASE_URL}/api/quotes/${quoteId}/accept?prefix=${prefix}`, {
            method: 'POST'
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка генерации заказа: ${errorText}`);
        }
        return await response.json();
    },

    // --- АКТИВНЫЕ ЗАКАЗЫ ---
    async deleteBooking(orderNumber) {
        const response = await fetch(`${BASE_URL}/api/bookings/${orderNumber}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка сервера: ${errorText}`);
        }
        return await response.json();
    },

    async getBookingById(orderNumber) {
        const response = await fetch(`${BASE_URL}/api/bookings/${orderNumber}`);
        if (!response.ok) throw new Error("Ошибка загрузки контекста заказа");
        return await response.json();
    },

    // ---------------------------------------------------------
    // ЗАГЛУШКИ ДЛЯ LOCAL STORAGE (Обратная совместимость)
    // ---------------------------------------------------------
    saveQuotes(dataArray) {
        console.warn("saveQuotes устарел. Данные сохраняются через POST /api/quotes");
    },
    getActiveOrders() { return JSON.parse(localStorage.getItem('tmsActiveOrders') || '[]'); },
    saveActiveOrders(dataArray) { localStorage.setItem('tmsActiveOrders', JSON.stringify(dataArray)); },
    getCounters() { return JSON.parse(localStorage.getItem('tmsOrderCounters') || '{}'); },
    saveCounters(counters) { localStorage.setItem('tmsOrderCounters', JSON.stringify(counters)); }
};