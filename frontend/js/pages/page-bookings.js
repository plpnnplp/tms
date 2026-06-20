import { api } from '../api.js';
import { injectTmsHeader } from '../ui/header.js';

let currentSort = { column: 'created_at', asc: false };
let allBookings = [];
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

    // Обработка кликов по таблице (Изоляция клика по строке от корзины)
    const tbody = document.getElementById('tmsBookingsTableBody');
    tbody.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('.tms-btn-delete');
        if (delBtn) {
            e.stopPropagation(); // Останавливаем клик, чтобы не открылась среда заказа
            const orderId = delBtn.getAttribute('data-id');
            if (confirm(`Безвозвратно удалить заказ ${orderId}?`)) {
                try {
                    await api.deleteBooking(orderId);
                    await loadBookings();
                } catch (err) { alert('Ошибка при удалении'); }
            }
            return;
        }

        const row = e.target.closest('.tms-row-clickable');
        if (row) {
            const orderId = row.getAttribute('data-id');
            window.location.href = `OrderDetail.html?id=${encodeURIComponent(orderId)}`;
        }
    });

    // Обработка кликов по заголовкам (Сортировка)
    document.querySelectorAll('.tms-bookings-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            if (currentSort.column === col) {
                currentSort.asc = !currentSort.asc; // Меняем направление
            } else {
                currentSort.column = col;
                currentSort.asc = true;
            }
            renderBookingsTable();
        });
    });
}

function renderBookingsTable() {
    const tbody = document.getElementById('tmsBookingsTableBody');
    
    // 1. Фильтрация
    let filtered = allBookings.filter(b => {
        const isDelay = b.status === 'delayed' || (b.eta && new Date(b.eta) < new Date());
        if (currentTransport === 'delays') return isDelay;
        if (currentTransport === 'all') return true;
        if (b.transport_type !== currentTransport) return false;
        
        const prefix = b.order_number.substring(1, 2).toLowerCase();
        if (currentDirection === 'export' && prefix !== 'e') return false;
        if (currentDirection === 'import' && prefix !== 'i') return false;
        if (currentDirection === 'domestic' && prefix !== 'd') return false;
        return true;
    });

    if (currentSearch) {
        filtered = filtered.filter(b => 
            `${b.order_number} ${b.bill_to_name} ${b.origin_city} ${b.destination_city}`.toLowerCase().includes(currentSearch)
        );
    }

    // 2. Сортировка (На лету, без запросов к базе)
    filtered.sort((a, b) => {
        let valA, valB;
        if (currentSort.column === 'id') { valA = a.order_number; valB = b.order_number; }
        else if (currentSort.column === 'eta') { valA = new Date(a.eta || '2099-01-01'); valB = new Date(b.eta || '2099-01-01'); }
        else if (currentSort.column === 'margin') { valA = a.quote_price - a.costs; valB = b.quote_price - b.costs; }
        else { valA = new Date(a.created_at); valB = new Date(b.created_at); }
        
        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 40px; text-align: center; color: #94a3b8; font-size: 13px;">Заказы не найдены.</td></tr>`;
        return;
    }

    // 3. Генерация HTML (Чисто и семантично)
    // 3. Генерация HTML (Нативный стиль)
    let html = '';
    filtered.forEach(b => {
        const isDelay = b.status === 'delayed' || (b.eta && new Date(b.eta) < new Date());
        
        const statusClass = isDelay ? 'tms-status-delay' : 'tms-status-active';
        const etaClass = isDelay ? 'color: #ef4444; font-weight: 700;' : 'tms-text-sub';
        
        const marginVal = (b.quote_price - b.costs) || 0;
        const marginClass = marginVal < 0 ? 'tms-dot-bad' : 'tms-dot-good';
        
        let docsCount = 0;
        if (b.has_awb_cmr) docsCount++;
        if (b.has_invoice) docsCount++;
        const docsComplete = docsCount === 2;
        
        let tIcon = '🚛 LKW';
        let tColor = '#3b82f6';
        if (b.transport_type === 'air') { tIcon = '✈️ Air'; tColor = '#8b5cf6'; }
        if (b.transport_type === 'sea') { tIcon = '🚢 Sea'; tColor = '#06b6d4'; }

        html += `
            <tr class="tms-row-clickable" data-id="${b.order_number}">
                <td>
                    <div class="tms-text-id">${b.order_number}</div>
                    <div class="tms-text-date">${new Date(b.created_at).toLocaleDateString()}</div>
                </td>
                <td>
                    <div class="tms-party-bill">${b.bill_to_name || '—'}</div>
                    <div class="tms-party-sub">Sh: ${b.shipper_name || '—'}</div>
                    <div class="tms-party-sub">Cn: ${b.consignee_name || '—'}</div>
                </td>
                <td>
                    <div class="tms-text-main">${b.origin_city || '—'} &rarr; ${b.destination_city || '—'}</div>
                    <div style="margin-top: 6px;">
                        <span class="tms-transport-badge" style="color: ${tColor};">${tIcon}</span>
                    </div>
                </td>
                <td>
                    <div class="tms-text-sub">ETD: ${b.etd ? new Date(b.etd).toLocaleDateString() : '—'}</div>
                    <div class="${etaClass}">ETA: ${b.eta ? new Date(b.eta).toLocaleDateString() : '—'}</div>
                </td>
                <td>
                    <span class="tms-status-box ${statusClass}">${isDelay ? 'DELAYED' : (b.status || 'ACTIVE').toUpperCase()}</span>
                </td>
                <td>
                     <div class="tms-health-box">
                        <span class="tms-health-dot ${marginClass}" title="Маржа: €${marginVal.toFixed(2)}"></span>
                        <span class="tms-doc-progress ${docsComplete ? 'complete' : ''}">Docs: ${docsCount}/2</span>
                    </div>
                </td>
                <td style="text-align: right;">
                    <button class="tms-btn-icon tms-btn-delete" data-id="${b.order_number}" title="Удалить">Х</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
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
