/**
 * TMS CORE: Page Controller - Active Bookings
 * Ответственность: Отрисовка таблицы оперативных заказов, фильтрация по вкладкам (Air, Sea, Road),
 * живой поиск и маршрутизация в рабочую среду заказа (order-detail.html).
 */

import { api } from '../api.js';
import { injectTmsHeader } from '../ui/header.js';

let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Первичный рендеринг таблицы и счетчиков
    renderActiveBookingsTable();

    // 2. Привязка живого поиска
    const searchInput = document.getElementById('tmsBookingSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', renderActiveBookingsTable);
    }

    // 3. Делегирование событий для вкладок (Табы)
    const tabsContainer = document.querySelector('.tms-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.tms-tab');
            if (!tab) return;

            // Переключаем активный класс
            document.querySelectorAll('.tms-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Получаем значение фильтра и перерисовываем
            currentFilter = tab.getAttribute('data-filter') || 'all';
            renderActiveBookingsTable();
        });
    }

    // 4. Делегирование событий для кнопок в таблице (Рабочая среда, Удаление)
    const tbody = document.getElementById('tmsActiveOrdersTableBody');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('.tms-btn-action');
            if (btn) {
                const action = btn.getAttribute('data-action');
                const orderId = btn.getAttribute('data-id');
                handleBookingAction(action, orderId);
            }
        });
    }
});

/**
 * ГЛАВНАЯ ФУНКЦИЯ РЕНДЕРИНГА ТАБЛИЦЫ
 */
export function renderActiveBookingsTable() {
    const tbody = document.getElementById('tmsActiveOrdersTableBody');
    if (!tbody) return;

    const searchQuery = document.getElementById('tmsBookingSearchInput')?.value.trim().toLowerCase() || '';
    
    // Получаем все активные заказы через локальный API
    let db = api.getActiveOrders();

    // Обновляем счетчики на вкладках до фильтрации
    updateTabsCounters(db);

    if (db.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding: 40px; text-align: center; color: #94a3b8; font-weight: 500;">Активных заказов в работе нет.</td></tr>`;
        return;
    }

    // 1. ФИЛЬТРАЦИЯ ПО ВКЛАДКАМ (Табы)
    if (currentFilter !== 'all') {
        db = db.filter(order => {
            if (currentFilter === 'delays') {
                return order.schedule && order.schedule.isDelay === true;
            }
            // Фильтр по префиксу ID (AE, AI, AD, SE, SI, RE, RI, RD)
            return order.orderId.toLowerCase().startsWith(currentFilter);
        });
    }

    // 2. ЖИВОЙ ПОИСК ПО ТЕКСТУ
    if (searchQuery !== '') {
        db = db.filter(order => {
            const parties = order.parties || {};
            const route = order.routing || {};
            const docs = order.transportDocs || {};
            
            const searchString = `
                ${order.orderId} 
                ${parties.billTo?.text || ''} 
                ${parties.shipper?.text || ''} 
                ${parties.consignee?.text || ''} 
                ${route.fromCity || ''} 
                ${route.toCity || ''} 
                ${docs.masterDocNumber || ''} 
                ${docs.vesselOrFlight || ''}
            `.toLowerCase();

            return searchString.includes(searchQuery);
        });
    }

    // 3. СОРТИРОВКА: Свежие заказы сверху
    db.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (db.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding: 30px; text-align: center; color: #94a3b8; font-weight: 500;">По вашему запросу ничего не найдено.</td></tr>`;
        return;
    }

    // 4. ГЕНЕРАЦИЯ HTML
    let html = '';

    db.forEach(order => {
        const createdDate = new Date(order.createdAt);
        const dateStr = `${String(createdDate.getDate()).padStart(2, '0')}.${String(createdDate.getMonth()+1).padStart(2, '0')}.${createdDate.getFullYear()}`;

        const parties = order.parties || {};
        const spec = order.specification || {};
        const route = order.routing || {};
        const cargo = order.cargoDetails || {};
        const docs = order.transportDocs || {};
        const comm = order.commercials || {};
        const schedule = order.schedule || {};

        // Форматирование транспорта
        let transportColor = '#3b82f6';
        let transportIcon = '🚛';
        if (spec.transportMode === 'air') { transportColor = '#8b5cf6'; transportIcon = '✈️'; }
        if (spec.transportMode === 'sea') { transportColor = '#06b6d4'; transportIcon = '🚢'; }

        // Форматирование статуса
        const isDelayed = schedule.isDelay;
        const statusStyle = isDelayed ? 'color: #ef4444; font-weight: 800;' : 'color: #16a34a; font-weight: 700;';
        const statusText = isDelayed ? 'Задержка / Alert' : 'В графике';

        html += `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s; font-size: 12px; color: #334155;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                
                <td style="padding: 12px 16px;">
                    <div style="font-weight: 800; color: #1e293b; font-size: 13px;">${order.orderId}</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${dateStr}</div>
                </td>
                
                <td style="padding: 12px 16px;">
                    <div style="font-weight: 700; color: #2563eb; margin-bottom: 4px;">${parties.billTo?.text || '---'}</div>
                    <div style="font-size: 11px; color: #64748b;">Sh: ${parties.shipper?.text || '---'}</div>
                    <div style="font-size: 11px; color: #64748b;">Cn: ${parties.consignee?.text || '---'}</div>
                </td>
                
                <td style="padding: 12px 16px; font-weight: 600;">
                    <div style="color: #0f172a;">${route.fromCity || '???'}</div>
                    <div style="color: #94a3b8; margin: 2px 0;">&darr;</div>
                    <div style="color: #0f172a;">${route.toCity || '???'}</div>
                </td>
                
                <td style="padding: 12px 16px;">
                    <div style="display: inline-flex; align-items: center; gap: 4px; font-weight: 800; color: ${transportColor}; margin-bottom: 4px;">
                        <span>${transportIcon}</span> ${spec.transportMode?.toUpperCase() || 'ROAD'}
                    </div>
                    <div style="font-size: 11px; font-weight: 600; color: #64748b;">${spec.loadType || ''}</div>
                    <div style="font-size: 11px; font-weight: 700; color: #475569; margin-top: 2px;">${spec.incoterms || 'EXW'}</div>
                </td>
                
                <td style="padding: 12px 16px;">
                    <div style="font-weight: 600; color: #1e293b; margin-bottom: 4px;">Вес: ${cargo.chargeableWeight || 0} kg</div>
                    <div style="font-size: 11px; color: #64748b;">Кол-во: ${cargo.totalQty || 0} шт.</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Док: ${docs.masterDocNumber || 'Ожидается'}</div>
                </td>
                
                <td style="padding: 12px 16px;">
                    <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">ETA: ${schedule.etaPlan || '--.--.----'}</div>
                    <div style="${statusStyle}">${statusText}</div>
                </td>
                
                <td style="padding: 12px 16px;">
                    <div style="font-weight: 800; color: #1e293b;">${(comm.sellRate || 0).toFixed(2)} EUR</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">INV: ${order.paperwork?.inv ? 'Выставлен' : 'Нет'}</div>
                </td>
                
                <td style="padding: 12px 16px; text-align: right;">
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <button class="tms-btn-action" data-action="workspace" data-id="${order.orderId}" style="background: #2563eb; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer; transition: 0.2s;">Открыть среду</button>
                        <button class="tms-btn-action" data-action="delete" data-id="${order.orderId}" style="background: transparent; color: #ef4444; border: 1px solid #fca5a5; padding: 4px 12px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer; transition: 0.2s;">Удалить</button>
                    </div>
                </td>
                
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

/**
 * ОБНОВЛЕНИЕ БЕЙДЖЕЙ НА ВКЛАДКАХ (Air, Sea, Road)
 */
function updateTabsCounters(db) {
    const counts = { all: 0, ae: 0, ai: 0, ad: 0, se: 0, si: 0, re: 0, ri: 0, rd: 0, delays: 0 };

    db.forEach(order => {
        counts.all++;
        
        const prefix = order.orderId.substring(0, 2).toLowerCase();
        if (counts[prefix] !== undefined) {
            counts[prefix]++;
        }

        if (order.schedule && order.schedule.isDelay) {
            counts.delays++;
        }
    });

    // Записываем значения в HTML элементы
    for (const [key, val] of Object.entries(counts)) {
        const badge = document.getElementById(`cnt${key.toUpperCase()}`);
        if (badge) badge.innerText = val;
    }
    
    // Специальная обработка для All и Delays из-за регистра ID в HTML
    const badgeAll = document.getElementById('cntAll');
    if (badgeAll) badgeAll.innerText = counts.all;
    
    const badgeDelays = document.getElementById('cntDelays');
    if (badgeDelays) badgeDelays.innerText = counts.delays;
}

/**
 * ДИСПЕТЧЕР ДЕЙСТВИЙ (Удаление / Переход в Order Workspace)
 */
function handleBookingAction(action, orderId) {
    if (action === 'delete') {
        const isConfirmed = confirm(`КРИТИЧЕСКОЕ ДЕЙСТВИЕ!\nВы уверены, что хотите безвозвратно удалить заказ ${orderId} из оперативного учета?`);
        if (!isConfirmed) return;

        let db = api.getActiveOrders();
        db = db.filter(order => order.orderId !== orderId);
        api.saveActiveOrders(db);
        
        console.log(`[TMS BOOKINGS] Заказ ${orderId} удален из базы.`);
        renderActiveBookingsTable();
        return;
    }

    if (action === 'workspace') {
        // Переход в среду заказа с передачей ID через URL
        window.location.href = `order-detail.html?id=${encodeURIComponent(orderId)}`;
    }
}