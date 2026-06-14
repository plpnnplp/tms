/**
 * TMS: API Layer (Интеграция с FastAPI бэкендом)
 */

const BASE_URL = 'http://127.0.0.1:8000';

export const api = {
    getCities: async () => {
        const response = await fetch(`${BASE_URL}/api/cities`);
        return await response.json();
    },
    
    fetchCities: async () => {
        const response = await fetch(`${BASE_URL}/api/cities`);
        return await response.json();
    },
    
    fetchPrices: async () => {
        const response = await fetch(`${BASE_URL}/api/prices`);
        return await response.json();
    },
    
    async fetchPrices() {
        const response = await fetch(`${BASE_URL}/api/prices`);
        return await response.json();
    },

    fetchDistance: async (lat1, lon1, lat2, lon2) => {
        const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            return Math.round(data.routes[0].distance / 1000); 
        }
        return 0;
    },

    // Работа с Коммерческими предложениями через серверную БД
    async getQuotes() {
        try {
            const response = await fetch(`${BASE_URL}/api/quotes`);
            if (!response.ok) throw new Error("Не удалось загрузить КП с сервера");
            return await response.json();
        } catch (error) {
            console.error("API Error [getQuotes]:", error);
            return [];
        }
    },

    async saveQuoteToBackend(payload) {
        const response = await fetch(`${BASE_URL}/api/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("Ошибка сохранения КП на бэкенде");
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

    // Старые заглушки для обратной совместимости (чтобы ничего не падало)
    saveQuotes(dataArray) {
        console.warn("saveQuotes устарел. Данные сохраняются через POST /api/quotes");
    },
    getActiveOrders() { return JSON.parse(localStorage.getItem('tmsActiveOrders') || '[]'); },
    saveActiveOrders(dataArray) { localStorage.setItem('tmsActiveOrders', JSON.stringify(dataArray)); },
    getCounters() { return JSON.parse(localStorage.getItem('tmsOrderCounters') || '{}'); },
    saveCounters(counters) { localStorage.setItem('tmsOrderCounters', JSON.stringify(counters)); }
};