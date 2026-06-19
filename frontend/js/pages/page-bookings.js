import { api } from '../api.js';
import { injectTmsHeader } from '../ui/header.js';

let allBookings = []; // Храним загруженную базу здесь
let currentTransport = 'all';
let currentDirection = 'export';
let currentSearch = '';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Вызываем шапку напрямую, как и на остальных страницах
        injectTmsHeader();

        // Инициализируем UI и слушатели вкладок
        initBookingsUI();
        initSearchAndActions();

        // Загружаем данные с бэкенда
        await loadBookings();

    } catch (error) {
        console.error("❌ [TMS] Ошибка инициализации страницы заказов:", error);
    }
});

// --- ЛОГИКА ЗАГРУЗКИ ---
async function loadBookings() {
    const tbody = document.getElementById('tmsBookingsTableBody');
    tbody.innerHTML = '<tr><td colspan="9" style="padding: 30px; text-align: center; color: #94a3b8;">Загрузка данных...</td></tr>';
    
    try {
        allBookings = await api.getActiveBookings();
        renderBookingsTable();
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="9" style="padding: 30px; text-align: center; color: #ef4444;">Ошибка связи с сервером</td></tr>';
    }
}

// --- ЛОГИКА ВКЛАДОК И ЦВЕТОВ ---
function initBookingsUI() {
    const mainTabs = document.querySelectorAll('.tms-tab-btn');
    const subTabsContainer = document.getElementById('subTabsContainer');
    const subTabs = document.querySelectorAll('.tms-sub-tab-btn');
    const mainContainer = document.getElementById('bookingsMainContainer');

    mainTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            mainTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            currentTransport = tab.getAttribute('data-transport');

            // Сброс тем
            mainContainer.className = 'tms-app-container'; 

            if (currentTransport === 'all' || currentTransport === 'delays') {
                subTabsContainer.style.display = 'none';
                if (currentTransport === 'delays') mainContainer.classList.add('theme-delays');
            } else {
                subTabsContainer.style.display = 'flex';
                mainContainer.classList.add(`theme-${currentTransport}`); 
                
                // При смене транспорта сбрасываем направление на Экспорт
                subTabs.forEach(st => st.classList.remove('active'));
                document.querySelector('.tms-sub-tab-btn[data-direction="export"]').classList.add('active');
                currentDirection = 'export';
            }
            renderBookingsTable();
        });
    });

    subTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            subTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentDirection = tab.getAttribute('data-direction');
            renderBookingsTable();
        });
    });
}

// --- ЖИВОЙ ПОИСК И КНОПКИ ДЕЙСТВИЙ ---
function initSearchAndActions() {
    const searchInput = document.getElementById('tmsBookingSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.trim().toLowerCase();
            renderBookingsTable();
        });
    }

    const tbody = document.getElementById('tmsBookingsTableBody');
    tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.tms-btn-action');
        if (!btn) return;

        const action = btn.getAttribute('data-action');
        const orderId = btn.getAttribute('data-id');

        if (action === 'delete') {
            if (confirm(`Удалить заказ ${orderId} из оперативного учета?`)) {
                try {
                    await api.deleteBooking(orderId);
                    await loadBookings(); // Перезагружаем после удаления
                } catch (err) {
                    alert('Ошибка при удалении заказа');
                }
            }
        }

        if (action === 'workspace') {
            window.location.href = `OrderDetail.html?id=${encodeURIComponent(orderId)}`;
        }
    });
}

// Функция перевода КП в статус Заказа (вызывать при клике на кнопку "Взять в работу" / "Accept")
async function handleAcceptQuote(quoteId, transportMode, direction) {
    // 1. Автоматически определяем префикс на основе параметров КП
    // transportMode: 'air', 'sea', 'road'
    // direction: 'export', 'import', 'domestic'
    let tLetter = 'R'; // По умолчанию Road
    if (transportMode === 'air') tLetter = 'A';
    if (transportMode === 'sea') tLetter = 'S';

    let dLetter = 'E'; // По умолчанию Export
    if (direction === 'import') dLetter = 'I';
    if (direction === 'domestic') dLetter = 'D';

    const prefix = `${tLetter}${dLetter}`; // Получаем 'AE', 'SI', 'RE' и т.д.

    try {
        // 2. Отправляем запрос на бэкенд
        const result = await api.acceptQuoteToBooking(quoteId, prefix);
        
        if (result.status === 'success') {
            alert(`Успешно! КП переведено в статус активного заказа. Номер: ${result.order_number}`);
            // Перенаправляем менеджера на страницу активных заказов, чтобы он увидел результат
            window.location.href = 'ActiveBookings.html';
        }
    } catch (error) {
        console.error("Ошибка при переводе КП в заказ:", error);
        alert(`Не удалось создать заказ: ${error.message}`);
    }
}

// --- ФИЛЬТРАЦИЯ И ОТРИСОВКА ---
function renderBookingsTable() {
    const tbody = document.getElementById('tmsBookingsTableBody');
    
    // 1. Фильтрация по табам (Транспорт и Направление)
    let filtered = allBookings.filter(b => {
        const isDelay = b.status === 'delayed' || (b.eta && new Date(b.eta) < new Date());
        
        if (currentTransport === 'delays') return isDelay;
        if (currentTransport === 'all') return true;
        
        // Проверяем тип транспорта (air, sea, road)
        if (b.transport_type !== currentTransport) return false;

        // Проверяем префикс для саб-табов (AE/AI/AD, SE/SI/SD, RE/RI/RD)
        const prefix = b.order_number.substring(1, 2).toLowerCase(); // Вторая буква префикса (E, I, D)
        if (currentDirection === 'export' && prefix !== 'e') return false;
        if (currentDirection === 'import' && prefix !== 'i') return false;
        if (currentDirection === 'domestic' && prefix !== 'd') return false;

        return true;
    });

    // 2. Живой поиск
    if (currentSearch) {
        filtered = filtered.filter(b => {
            const searchString = `
                ${b.order_number} 
                ${b.bill_to_name} 
                ${b.shipper_name} 
                ${b.consignee_name} 
                ${b.origin_city} 
                ${b.destination_city}
            `.toLowerCase();
            return searchString.includes(currentSearch);
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding: 40px; text-align: center; color: #94a3b8; font-size: 13px;">По вашему запросу ничего не найдено.</td></tr>`;
        return;
    }

    // 3. Генерация HTML
    let html = '';
    filtered.forEach(b => {
        const isDelay = b.status === 'delayed' || (b.eta && new Date(b.eta) < new Date());
        
        html += `
            <tr>
                <td style="text-align: center; padding: 10px;">
                    <button class="tms-btn-action" data-action="workspace" data-id="${b.order_number}" style="background: none; border: none; cursor: pointer; font-size: 14px;" title="Открыть среду">👁️</button>
                    <button class="tms-btn-action" data-action="delete" data-id="${b.order_number}" style="background: none; border: none; cursor: pointer; font-size: 14px; margin-top: 4px;" title="Удалить">🗑️</button>
                </td>
                <td style="padding: 10px;">
                    <div style="font-weight: 800; color: var(--theme-color); font-size: 13px;">${b.order_number}</div>
                    <div style="font-size: 10px; color: #94a3b8; font-weight: 700; margin-top: 2px;">${new Date(b.created_at).toLocaleDateString()}</div>
                </td>
                <td style="padding: 10px;">
                    <div class="tms-multi-row" style="font-size: 11px; color: #475569;">
                        <span><b style="color:#1e293b;">B:</b> ${b.bill_to_name || '—'}</span>
                        <span><b style="color:#1e293b;">S:</b> ${b.shipper_name || '—'}</span>
                        <span><b style="color:#1e293b;">C:</b> ${b.consignee_name || '—'}</span>
                    </div>
                </td>
                <td style="padding: 10px;">
                    <div class="tms-multi-row" style="font-size: 11px;">
                        <span style="font-weight: 700;">🛫 ${b.origin_city || '—'}</span>
                        <span style="font-weight: 700; margin-top: 4px;">🛬 ${b.destination_city || '—'}</span>
                    </div>
                </td>
                <td style="padding: 10px;">
                    <div class="tms-multi-row" style="font-size: 11px;">
                        <span><b>PKGs:</b> ${b.packages_count || 0}</span>
                        <span><b>GW:</b> ${b.gross_weight_kg || 0} kg</span>
                        ${b.transport_type === 'road' ? `<span><b>LDM:</b> ${b.ldm || 0}</span>` : `<span><b>CW:</b> ${b.chargeable_weight_kg || 0} kg</span>`}
                    </div>
                </td>
                <td style="padding: 10px;">
                    <span style="background: ${isDelay ? '#fef2f2' : '#e2e8f0'}; color: ${isDelay ? '#ef4444' : '#475569'}; padding: 4px 8px; border-radius: 12px; font-weight: 800; font-size: 9px; letter-spacing: 0.5px;">
                        ${isDelay ? 'ЗАДЕРЖКА' : (b.status || 'ACTIVE').toUpperCase()}
                    </span>
                </td>
                <td style="padding: 10px;">
                     <div class="tms-multi-row" style="font-size: 11px;">
                        <span><b style="color:#1e293b;">ETD:</b> ${b.etd ? new Date(b.etd).toLocaleDateString() : '—'}</span>
                        <span style="${isDelay ? 'color: #ef4444; font-weight: 800;' : ''}"><b style="color:#1e293b;">ETA:</b> ${b.eta ? new Date(b.eta).toLocaleDateString() : '—'}</span>
                    </div>
                </td>
                <td style="padding: 10px; text-align: center;">
                     <div style="display: flex; gap: 4px; justify-content: center;">
                         <span style="opacity: ${b.has_awb_cmr ? 1 : 0.3}; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800;">DOC</span>
                         <span style="opacity: ${b.has_invoice ? 1 : 0.3}; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800;">INV</span>
                     </div>
                </td>
                <td style="padding: 10px; text-align: right;">
                     <div class="tms-multi-row" style="font-size: 11px;">
                        <span><b style="color:#1e293b;">План:</b> €${b.quote_price || 0}</span>
                        <span><b style="color:#1e293b;">Факт:</b> €${b.actual_price || 0}</span>
                        <span style="color: ${(b.quote_price - b.costs) < 0 ? '#ef4444' : '#10b981'}; margin-top: 4px;"><b style="color:#1e293b;">Маржа:</b> €${(b.quote_price - b.costs) || 0}</span>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}