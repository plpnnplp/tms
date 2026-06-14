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
        try {
            const response = await fetch(`${BASE_URL}/api/quotes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error("Ошибка сохранения КП на бэкенде");
            return await response.json();
        } catch (error) {
            console.warn("TMS Warning: Бэкенд недоступен. Сохранение имитируется (Mock).");
            // Мок-ответ, чтобы кнопка "Сохранить" не вызывала краш фронтенда при отключенном сервере
            return { status: 'mocked_success', id: payload.quote_id };
        }
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

    // ---------------------------------------------------------
    // 4. ЗАГЛУШКИ ДЛЯ LOCAL STORAGE (Обратная совместимость)
    // ---------------------------------------------------------
    saveQuotes(dataArray) {
        console.warn("saveQuotes устарел. Данные сохраняются через POST /api/quotes");
    },
    getActiveOrders() { return JSON.parse(localStorage.getItem('tmsActiveOrders') || '[]'); },
    saveActiveOrders(dataArray) { localStorage.setItem('tmsActiveOrders', JSON.stringify(dataArray)); },
    getCounters() { return JSON.parse(localStorage.getItem('tmsOrderCounters') || '{}'); },
    saveCounters(counters) { localStorage.setItem('tmsOrderCounters', JSON.stringify(counters)); }
};