/**
 * TMS DATABASE & STATUS ENGINE (QuotesDatabase.html)
 * Ответственность: Жесткая структура реестра КП, параметрический поиск, 
 * автоматический контроль жизненного цикла предложений через асинхронный API.
 */

import { api } from '../api.js';
import { injectTmsHeader } from '../ui/header.js';

document.addEventListener('DOMContentLoaded', () => {
    injectTmsHeader();
    
    // Первичный рендеринг таблицы при загрузке страницы
    renderQuotationsTable();
    
    // Привязка обработчиков событий для фильтрации и поиска
    const searchParamSelect = document.getElementById('tmsSearchParameter');
    if (searchParamSelect) {
        searchParamSelect.addEventListener('change', renderQuotationsTable);
    }

    const searchInput = document.getElementById('tmsSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', renderQuotationsTable);
    }

    const tbody = document.getElementById('tmsDatabaseTableBody');
    if (tbody) {
        // Перехват изменения статуса в выпадающем списке
        tbody.addEventListener('change', async (e) => {
            if (e.target.classList.contains('tms-status-select')) {
                const quoteId = e.target.getAttribute('data-id');
                await updateQuoteStatusInDb(quoteId, e.target.value);
            }
        });

        // Перехват кликов по кнопкам действий
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('.tms-btn-action');
            if (btn) {
                const action = btn.getAttribute('data-action');
                const quoteId = btn.getAttribute('data-id');
                handleQuoteAction(action, quoteId);
            }
        });
    }
});

/**
 * 1. АСИНХРОННЫЙ РЕНДЕРИНГ ТАБЛИЦЫ ИЗ БАЗЫ ПОСТГРЕСА
 */
export async function renderQuotationsTable() {
    const tbody = document.getElementById('tmsDatabaseTableBody');
    if (!tbody) return;

    const searchParam = document.getElementById('tmsSearchParameter')?.value || 'id';
    const searchQuery = document.getElementById('tmsSearchInput')?.value.trim().toLowerCase() || '';

    tbody.innerHTML = `<tr><td colspan="9" style="padding: 40px; text-align: center; color: #64748b; font-weight: 600;">Загрузка данных с сервера...</td></tr>`;

    // ЖДЕМ ответ от сетевого эндпоинта FastAPI
    let db = await api.getQuotes();

    if (!db || db.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding: 40px; text-align: center; color: #94a3b8; font-weight: 500;">База коммерческих предложений пуста.</td></tr>`;
        return;
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    // Автоматическая детекция просроченных КП
    db = db.map(quote => {
        const d = quote.data || {};
        const validStr = d.validUntilDate;
        
        if (validStr && validStr !== '--.--.----') {
            const parts = validStr.split('.');
            if (parts.length === 3) {
                const validDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                validDate.setHours(0,0,0,0);
                
                const currentStatus = (quote.status || 'draft').toLowerCase();
                if (validDate < today && (currentStatus === 'draft' || currentStatus === 'sent')) {
                    quote.status = 'expired';
                }
            }
        }
        return quote;
    });

    // Сквозная фильтрация по параметрам поиска
    if (searchQuery !== '') {
        db = db.filter(quote => {
            const d = quote.data || {};
            const statusMap = { 'draft': 'черновик', 'sent': 'отправлено', 'accepted': 'подтверждено', 'declined': 'отказ', 'expired': 'просрочено' };
            const currentStatusText = statusMap[(quote.status || 'draft').toLowerCase()] || '';

            if (searchParam === 'id') return quote.id.toLowerCase().includes(searchQuery);
            if (searchParam === 'client') {
                return (d.clientCompany || '').toLowerCase().includes(searchQuery) || (d.clientContact || '').toLowerCase().includes(searchQuery);
            } 
            if (searchParam === 'route') {
                return (d.blankPickupCity || '').toLowerCase().includes(searchQuery) || (d.blankDeliveryCity || '').toLowerCase().includes(searchQuery);
            }
            return true;
        });
    }

    if (db.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding: 30px; text-align: center; color: #94a3b8; font-weight: 500;">Нет совпадений по выбранному критерию поиска.</td></tr>`;
        return;
    }

    let html = '';

    db.forEach(quote => {
        const d = quote.data || {};
        
        const createdDate = new Date(quote.createdAt);
        const dateStr = `${String(createdDate.getDate()).padStart(2, '0')}.${String(createdDate.getMonth()+1).padStart(2, '0')}.${createdDate.getFullYear()}`;

        const clientName = d.clientCompany || '<span style="color:#94a3b8;">Не указан</span>';
        const transportMode = d.config?.transport || 'road';
        
        let transportLabel = ' 🚛 LKW';
        let transportColor = '#3b82f6'; 
        if (transportMode === 'air') { transportLabel = ' ✈️ Air'; transportColor = '#8b5cf6'; }
        if (transportMode === 'sea') { transportLabel = ' 🚢 Sea'; transportColor = '#06b6d4'; }

        const routeFrom = d.route?.pickup?.cleanCity ? d.route.pickup.cleanCity.split(',')[0].trim() : '???';
        const routeTo = d.route?.delivery?.cleanCity ? d.route.delivery.cleanCity.split(',')[0].trim() : '???';
        const totalValue = d.meta?.grandTotalValue || '0.00';
        const validUntil = d.meta?.validUntilDate || '--.--.----';

        const currentStatus = (quote.status || 'draft').toLowerCase();
        
        let statusStyles = 'background: #f1f5f9; color: #475569;'; 
        if (currentStatus === 'sent') statusStyles = 'background: #eff6ff; color: #2563eb;'; 
        if (currentStatus === 'accepted') statusStyles = 'background: #f0fdf4; color: #16a34a;'; 
        if (currentStatus === 'declined') statusStyles = 'background: #fef2f2; color: #ef4444;'; 
        if (currentStatus === 'expired') statusStyles = 'background: #fff7ed; color: #ea580c;'; 

        const statusSelectHtml = `
            <select class="tms-status-select" data-id="${quote.id}" style="${statusStyles} border: 1px solid currentColor; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; outline: none; cursor: pointer; transition: all 0.2s; width: 100%;">
                <option value="draft" ${currentStatus === 'draft' ? 'selected' : ''}>Draft (Черновик)</option>
                <option value="sent" ${currentStatus === 'sent' ? 'selected' : ''}>Sent (Отправлено)</option>
                <option value="accepted" ${currentStatus === 'accepted' ? 'selected' : ''}>Accepted (Won)</option>
                <option value="declined" ${currentStatus === 'declined' ? 'selected' : ''}>Declined (Lost)</option>
                <option value="expired" ${currentStatus === 'expired' ? 'selected' : ''}>Expired (Просрочен)</option>
            </select>
        `;

        html += `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s; font-size: 13px;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="padding: 12px 16px;">
                    <div style="font-weight: 700; color: #1e293b;">${quote.id}</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${dateStr}</div>
                </td>
                <td style="padding: 12px 16px; font-weight: 600; color: #334155;">${clientName}</td>
                <td style="padding: 12px 16px;">
                    <span style="background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: ${transportColor}; white-space: nowrap;">
                        ${transportLabel}
                    </span>
                </td>
                <td style="padding: 12px 16px; color: #475569; font-weight: 600;">${routeFrom} &rarr; ${routeTo}</td>
                <td style="padding: 12px 16px; font-weight: 800; color: #0f172a; white-space: nowrap;">${totalValue} EUR</td>
                <td style="padding: 12px 16px; font-weight: 700; color: #64748b;">${validUntil}</td>
                <td style="padding: 12px 16px;">${statusSelectHtml}</td>
                <td style="padding: 12px 16px; text-align: center;">
                    <button class="tms-btn-action" data-action="view" data-id="${quote.id}" title="Открыть PDF" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; width: 28px; height: 28px; cursor: pointer; color: #475569; display: inline-flex; align-items: center; justify-content: center; transition: 0.2s;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                </td>
                <td style="padding: 12px 16px; text-align: right;">
                    <div style="display: inline-flex; gap: 4px;">
                        <button class="tms-btn-action" data-action="edit" data-id="${quote.id}" style="background: transparent; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; cursor: pointer; color: #2563eb; font-weight: 700; font-size: 11px;">Изменить</button>
                        <button class="tms-btn-action" data-action="duplicate" data-id="${quote.id}" style="background: transparent; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; cursor: pointer; color: #16a34a; font-weight: 700; font-size: 11px;">Копия</button>
                        <button class="tms-btn-action" data-action="delete" data-id="${quote.id}" style="background: transparent; border: none; padding: 4px 6px; cursor: pointer; color: #ef4444; font-weight: 700; font-size: 11px; opacity: 0.7;">Х</button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

/**
 * 2. ИЗМЕНЕНИЕ СТАТУСА НА СЕРВЕРЕ
 */
export async function updateQuoteStatusInDb(quoteId, newStatus) {
    try {
        await api.updateQuoteStatus(quoteId, newStatus);
        console.log(`[TMS STATUS] Статус КП ${quoteId} изменен на сервере: ${newStatus}`);
        renderQuotationsTable();
    } catch (err) {
        alert("Не удалось обновить статус: " + err.message);
    }
}

/**
 * 3. ДИСПЕТЧЕР ДЕЙСТВИЙ С СЕРВЕРНЫМ УДАЛЕНИЕМ
 */
export async function handleQuoteAction(action, quoteId) {
    if (action === 'delete') {
        const isConfirmed = confirm(`Вы уверены, что хотите безвозвратно удалить КП ${quoteId} с сервера?`);
        if (!isConfirmed) return;

        try {
            await api.deleteQuoteFromServer(quoteId);
            renderQuotationsTable();
        } catch (err) {
            alert("Ошибка удаления: " + err.message);
        }
        return;
    }

    const targetUrl = `QuoteCreation.html?action=${action}&id=${encodeURIComponent(quoteId)}`;
    if (action === 'view') {
        window.open(targetUrl, '_blank');
    } else {
        window.location.href = targetUrl;
    }
}

export async function clearDatabase() {
    alert("Действие заблокировано бэкендом. Пожалуйста, удаляйте коммерческие предложения побочно через кнопку 'X'.");
}

window.renderQuotationsTable = renderQuotationsTable;
window.updateQuoteStatusInDb = updateQuoteStatusInDb;
window.handleQuoteAction = handleQuoteAction;
window.clearDatabase = clearDatabase;