/**
 * TMS CORE: Header Component (js/ui/header.js)
 * Предоставляет функцию рендера навигационной панели.
 */

const tmsHeaderHTML = `
    <header class="tms-global-header">
        <div style="font-size: 18px; font-weight: 900; color: #1e293b; letter-spacing: -0.5px; cursor: pointer;" onclick="window.location.href='QuoteCreation.html'">
            <span style="color: #2563eb;">TMS</span>CORE
        </div>

        <ul class="tms-nav-menu">
            <li class="tms-nav-item">
                <a class="tms-nav-link">
                    Коммерция
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </a>
                <div class="tms-sub-menu">
                    <a href="QuoteCreation.html">Новое КП (Quotation)</a>
                    <a href="QuotesDatabase.html">База созданных КП</a>
                </div>
            </li>
            
            <li class="tms-nav-item">
                <a class="tms-nav-link">
                    Операционка
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </a>
                <div class="tms-sub-menu">
                    <a href="ActiveBookings.html" class="nav-item active-link">Активные заказы (Bookings)</a>
                    <a href="#">Архив доставок</a>
                </div>
            </li>

            <li class="tms-nav-item">
                <a class="tms-nav-link">
                    Финансы
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </a>
                <div class="tms-sub-menu">
                    <a href="#">Исходящие счета (AR)</a>
                    <a href="#">Входящие счета (AP)</a>
                    <a href="#">Фин. аналитика</a>
                </div>
            </li>

            <li class="tms-nav-item">
                <a class="tms-nav-link">
                    Справочники
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </a>
                <div class="tms-sub-menu">
                    <a href="#">Контрагенты</a>
                    <a href="#">Авиалинии и Порты</a>
                    <a href="#">Справочник сборов</a>
                </div>
            </li>
        </ul>

        <div class="tms-header-actions">
            <button id="btn-tms-theme-toggle" title="Сменить тему" style="background:none; border:none; cursor:pointer; color:#64748b; padding: 4px; display:flex; align-items:center; transition: color 0.2s;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
            </button>

            <div id="btn-tms-profile" class="tms-user-profile" title="Настройки профиля">
                <div style="width: 32px; height: 32px; background: #e0e7ff; color: #2563eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">
                    S
                </div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 13px; font-weight: 700; color: #1e293b; line-height: 1;">Stanislav</span>
                    <span style="font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">Manager</span>
                </div>
            </div>
            
            <button id="btn-tms-logout" title="Выйти" style="background:none; border:none; cursor:pointer; color:#ef4444; padding: 4px; display:flex; align-items:center; transition: opacity 0.2s; margin-left: 4px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
        </div>
    </header>
`;

// ДОБАВЛЕНО СЛОВО export
export function injectTmsHeader() {
    // Аудит: проверяем, не был ли хедер уже отрендерен
    if (document.querySelector('.tms-global-header')) {
        console.warn("TMS Header уже существует в DOM. Отмена повторного рендера.");
        return;
    }

    // Инъекция в начало body
    document.body.insertAdjacentHTML('afterbegin', tmsHeaderHTML);
}
// БЛОК С document.readyState УДАЛЕН.