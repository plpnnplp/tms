import { api } from '../api.js';
import { injectTmsHeader } from '../ui/header.js';

let loadedCounterparty = null; // Текущий загруженный объект из базы
let currentContactsList = [];  // Локальный массив контактов для редактирования
let isEditMode = false;        // Замок редактирования по умолчанию защелкнут

document.addEventListener('DOMContentLoaded', async () => {
    injectTmsHeader();
    await loadPaymentTermsDropdown();
    initSearchModalLogic();
    initTabsLogic();
    initEditLockControls();
    initMessengerToggles();
    initContactFormPush();
});

// 1. ЛОГИКА СМАРТ-ЗАМКА РЕДАКТИРОВАНИЯ
function initEditLockControls() {
    const btnEdit = document.getElementById('btnTmsEdit');
    const btnSave = document.getElementById('btnTmsSave');
    const btnDelete = document.getElementById('btnTmsDelete');

    btnEdit.addEventListener('click', () => {
        isEditMode = true;
        toggleInputsLock(false); // Отпираем все инпуты
        btnSave.disabled = false;
        btnSave.style.opacity = '1';
        btnEdit.style.background = '#e0f2fe';
        console.log("[TMS CORE] Режим редактирования активирован. Замок снят.");
    });

    btnSave.addEventListener('click', async () => {
        if (!isEditMode) return;
        
        const nameVal = document.getElementById('cpName').value.trim();
        if (!nameVal) { alert("Ошибка: Поле 'Полное название фирмы' обязательно!"); return; }

        // Собираем Payload реляционной модели
        const payload = {
            name: nameVal,
            name_extra: document.getElementById('cpNameExtra').value.trim(),
            short_name: document.getElementById('cpShortName').value.trim(),
            street: document.getElementById('cpStreet').value.trim(),
            house_no: document.getElementById('cpHouseNo').value.trim(),
            office_no: document.getElementById('cpOfficeNo').value.trim(),
            postal_code: document.getElementById('cpPostalCode').value.trim(),
            city: document.getElementById('cpCity').value.trim(),
            region: document.getElementById('cpRegion').value.trim(),
            country: document.getElementById('cpCountry').value.trim(),
            country_iso: document.getElementById('cpCountryIso').value.trim().toUpperCase(),
            country_en: document.getElementById('cpCountryEn').value.trim(),
            is_client_sender: document.getElementById('roleSender').checked,
            is_client_receiver: document.getElementById('roleReceiver').checked,
            is_carrier: document.getElementById('roleCarrier').checked,
            is_agent: document.getElementById('roleAgent').checked,
            tax_number: document.getElementById('cpTaxNumber').value.trim(),
            vat_id: document.getElementById('cpVatId').value.trim(),
            eori_number: document.getElementById('cpEoriNumber').value.trim(),
            language: document.getElementById('cpLanguage').value,
            currency: document.getElementById('cpCurrency').value,
            credit_limit: parseFloat(document.getElementById('cpCreditLimit').value) || 0.0,
            payment_terms: document.getElementById('cpPaymentTerms').value,
            contacts: currentContactsList
        };

        try {
            if (loadedCounterparty && loadedCounterparty.id) {
                // Обновление существующего контрагента
                await api.updateCounterparty(loadedCounterparty.id, payload);
                alert(`Контрагент ID ${10000 + loadedCounterparty.id} успешно сохранен.`);
            } else {
                // Создание нового контрагента
                const res = await api.createCounterparty(payload);
                alert(`Создан новый контрагент. Присвоен ID: ${10000 + res.id}`);
            }
            
            isEditMode = false;
            toggleInputsLock(true); // Снова блокируем замок
            btnSave.disabled = true;
            btnSave.style.opacity = '0.5';
            btnEdit.style.background = '#ffffff';
        } catch (err) {
            alert("Критический сбой сохранения: " + err.message);
        }
    });

    btnDelete.addEventListener('click', async () => {
        if (!loadedCounterparty || !loadedCounterparty.id) return;
        const conf = confirm(`Вы уверены, что хотите полностью стереть фирму и контакты из системы?`);
        if (!conf) return;

        await api.deleteCounterparty(loadedCounterparty.id);
        location.reload();
    });
}

function toggleInputsLock(isLocked) {
    // Находим все инпуты, селекты, чекбоксы на странице и меняем им состояние disabled
    const selectElements = document.querySelectorAll('.tms-input, #contactFormBlock input, #contactFormBlock select, #contactFormBlock button, input[type="checkbox"]');
    selectElements.forEach(el => {
        if (el.id !== 'cpAccId') { // ID бухгалтерии всегда заблокирован
            el.disabled = isLocked;
        }
    });
}

// 2. ДИНАМИЧЕСКИЕ ПЕРЕКЛЮЧАТЕЛИ МЕССЕНДЖЕРОВ (1.2)
function initMessengerToggles() {
    const btns = document.querySelectorAll('.messenger-btn');
    const tgInput = document.getElementById('ctTgNick');

    btns.forEach(b => {
        b.addEventListener('click', () => {
            b.classList.toggle('active');
            if (b.id === 'mBtnTg') {
                tgInput.style.display = b.classList.contains('active') ? 'block' : 'none';
            }
        });
    });

    // Автоматический перенос Фамилии при потере фокуса с поля ctLastName
    document.getElementById('ctLastName')?.addEventListener('focusout', (e) => {
        const val = e.target.value.trim();
        const sal = document.getElementById('ctSalutation').value;
        console.log(`[TMS] Сформировано обращение: ${sal} ${val}`);
    });
}

// 3. ДОБАВЛЕНИЕ КОНТАКТА В ЛОКАЛЬНЫЙ МАССИВ (Рядом с таблицей)
function initContactFormPush() {
    document.getElementById('btnPushContact').addEventListener('click', () => {
        const fName = document.getElementById('ctFirstName').value.trim();
        const lName = document.getElementById('ctLastName').value.trim();
        
        if (!fName && !lName) { alert("Заполните Имя или Фамилию контакта!"); return; }

        const newContact = {
            position: document.getElementById('ctPosition').value.trim(),
            salutation: document.getElementById('ctSalutation').value,
            first_name: fName,
            last_name: lName,
            email: document.getElementById('ctEmail').value.trim(),
            phone: document.getElementById('ctPhone').value.trim(),
            tg_nick: document.getElementById('ctTgNick').value.trim(),
            has_telegram: document.getElementById('mBtnTg').classList.contains('active'),
            has_whatsapp: document.getElementById('mBtnWa').classList.contains('active'),
            has_viber: document.getElementById('mBtnVb').classList.contains('active')
        };

        currentContactsList.push(newContact);
        renderContactsTable();
        
        // Сброс формы
        document.getElementById('ctPosition').value = '';
        document.getElementById('ctFirstName').value = '';
        document.getElementById('ctLastName').value = '';
        document.getElementById('ctEmail').value = '';
        document.getElementById('ctPhone').value = '';
        document.getElementById('ctTgNick').value = '';
        document.querySelectorAll('.messenger-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('ctTgNick').style.display = 'none';
    });
}

function renderContactsTable() {
    const tbody = document.getElementById('tmsContactsTableBody');
    if (currentContactsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="padding: 20px; text-align: center; color: #94a3b8;">Нет зафиксированных контактов</td></tr>`;
        return;
    }
    let html = '';
    currentContactsList.forEach((c, idx) => {
        const mTags = [];
        if (c.has_telegram) mTags.push(`TG(${c.tg_nick||'@'})`);
        if (c.has_whatsapp) mTags.push('WA');
        if (c.has_viber) mTags.push('VB');

        html += `
            <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:8px 12px; font-weight:700; color:#475569;">${c.position || '-'}</td>
                <td style="padding:8px 12px;"><b>${c.salutation}. ${c.first_name} ${c.last_name}</b></td>
                <td style="padding:8px 12px;">
                    <div>${c.email}</div><div style="color:#94a3b8; font-size:11px;">${c.phone} ${mTags.length > 0 ? '['+mTags.join(', ')+']' : ''}</div>
                </td>
                <td style="padding:8px 12px; text-align:right;">
                    <button type="button" class="tms-btn-del-contact" data-idx="${idx}" style="color:#ef4444; border:none; background:transparent; cursor:pointer; font-weight:800;">X</button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;

    // Вешаем клик удаления на кнопки X
    tbody.querySelectorAll('.tms-btn-del-contact').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.getAttribute('data-idx');
            currentContactsList.splice(idx, 1);
            renderContactsTable();
        });
    });
}

// 4. ПОДКЛЮЧЕНИЕ СМАРТ-ПОИСКА (Справочник)
function initSearchModalLogic() {
    const modal = document.getElementById('tmsGlobalSearchModal');
    const searchInput = document.getElementById('tmsGlobalSearchInput');
    const resultsContainer = document.getElementById('tmsGlobalSearchResults');
    const btnSearch = document.getElementById('btnTmsSearchCp');
    const btnClose = document.getElementById('btnCloseSearchModal');

    if (!modal) return;

    // Функция рендера и фильтрации (до 10 результатов)
    const renderSearchResults = async (query = '') => {
        resultsContainer.innerHTML = '<div style="padding:15px; font-size:12px; color:#64748b; text-align:center;">Загрузка данных...</div>';
        
        try {
            // Берем всю базу один раз (работает мгновенно)
            const allCp = await api.getCounterparties();
            let filtered = allCp;

            // Если введено 2+ символа, фильтруем по ID, Имени или Short-имени
            if (query.length >= 2) {
                const q = query.toLowerCase();
                filtered = allCp.filter(c => {
                    const smartId = (10000 + c.id).toString();
                    return c.name.toLowerCase().includes(q) || 
                           (c.short_name && c.short_name.toLowerCase().includes(q)) ||
                           smartId.includes(q);
                });
            }

            // Ограничиваем список до 10 штук для чистоты интерфейса
            filtered = filtered.slice(0, 10);

            if (filtered.length === 0) {
                resultsContainer.innerHTML = '<div style="padding:15px; font-size:12px; color:#ef4444; text-align:center;">Совпадений не найдено.</div>';
                return;
            }

            resultsContainer.innerHTML = '';
            filtered.forEach(cp => {
                const row = document.createElement('div');
                row.style.cssText = 'padding:12px 15px; border-bottom:1px solid #f1f5f9; cursor:pointer; display:flex; align-items:center; justify-content:space-between; transition: background 0.15s;';
                row.onmouseover = () => row.style.background = '#f8fafc';
                row.onmouseout = () => row.style.background = 'transparent';
                
                // Красивый бейдж страны
                const countryBadge = cp.country ? `<span style="background:#e2e8f0; color:#475569; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:6px; font-weight:700;">${cp.country}</span>` : '';
                
                row.innerHTML = `
                    <div style="display:flex; align-items:center; gap:15px;">
                        <b style="color:#2563eb; font-family:monospace; font-size:14px; width: 45px;">${10000 + cp.id}</b>
                        <div style="display:flex; flex-direction:column;">
                            <div style="font-weight:800; color:#1e293b; font-size:13px;">${cp.name} ${countryBadge}</div>
                            <div style="font-size:11px; color:#64748b; margin-top:2px;">Код: <span style="font-weight:700;">${cp.short_name || '—'}</span></div>
                        </div>
                    </div>
                `;
                row.addEventListener('click', () => {
                    if (typeof loadCounterpartyToWorkspace === 'function') {
                        loadCounterpartyToWorkspace(cp);
                    }
                    modal.style.display = 'none';
                });
                resultsContainer.appendChild(row);
            });
        } catch (err) {
            resultsContainer.innerHTML = '<div style="padding:15px; font-size:12px; color:#ef4444; text-align:center;">Ошибка связи с базой данных.</div>';
        }
    };

    // При открытии окна сразу показываем дефолтную десятку
    if (btnSearch) {
        btnSearch.addEventListener('click', () => {
            modal.style.display = 'flex';
            searchInput.value = '';
            searchInput.focus();
            renderSearchResults(''); 
        });
    }

    if (btnClose) btnClose.addEventListener('click', () => modal.style.display = 'none');

    // Поиск при вводе текста (с задержкой 300мс, чтобы не дергать базу на каждую букву)
    let timer;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timer);
            const query = e.target.value.trim();
            timer = setTimeout(() => renderSearchResults(query), 300);
        });
    }
}

function loadCounterpartyToWorkspace(cp) {
    loadedCounterparty = cp;
    currentContactsList = cp.contacts || [];
    isEditMode = false;
    toggleInputsLock(true); // Запираем замок принудительно

    // Заполнение верхнего ряда
    document.getElementById('lblTopId').innerText = `ID: ${10000 + cp.id}`;
    document.getElementById('lblTopFullName').innerText = `Полное название: ${cp.name}`;
    document.getElementById('lblTopShortName').innerText = `Код: ${cp.short_name || '---'}`;

    // Заполнение 1.1а
    document.getElementById('cpName').value = cp.name;
    document.getElementById('cpNameExtra').value = cp.name_extra || '';
    document.getElementById('cpStreet').value = cp.street || '';
    document.getElementById('cpHouseNo').value = cp.house_no || '';
    document.getElementById('cpOfficeNo').value = cp.office_no || '';
    document.getElementById('cpPostalCode').value = cp.postal_code || '';
    document.getElementById('cpCity').value = cp.city || '';
    document.getElementById('cpRegion').value = cp.region || '';
    document.getElementById('cpCountry').value = cp.country || '';
    document.getElementById('cpCountryIso').value = cp.country_iso || '';
    document.getElementById('cpCountryEn').value = cp.country_en || '';
    document.getElementById('cpShortName').value = cp.short_name || '';
    
    document.getElementById('roleSender').checked = cp.is_client_sender;
    document.getElementById('roleReceiver').checked = cp.is_client_receiver;
    document.getElementById('roleCarrier').checked = cp.is_carrier;
    document.getElementById('roleAgent').checked = cp.is_agent;

    // Заполнение 1.1б
    document.getElementById('cpTaxNumber').value = cp.tax_number || '';
    document.getElementById('cpVatId').value = cp.vat_id || '';
    document.getElementById('cpEoriNumber').value = cp.eori_number || '';
    document.getElementById('cpLanguage').value = cp.language || 'en';
    document.getElementById('cpCurrency').value = cp.currency || 'EUR';
    document.getElementById('cpCreditLimit').value = cp.credit_limit || 0.0;
    document.getElementById('cpPaymentTerms').value = cp.payment_terms || '';

    renderContactsTable();
    generateMockActsTable(cp.short_name || 'CRM');
}

// 5. РЕНДЕР КРАСИВОГО СПИСКА АКТОВ В ФОРМАТЕ (R-E-2600001)
function generateMockActsTable(shortName) {
    const tbody = document.getElementById('tmsActsTableBody');
    // Мокаем пару финансовых записей для демонстрации сквозной аналитики актов
    const mockActs = [
        { id: `R-E-260001`, date: "12.06.2026", from: shortName, to: "MUC_LOG", manager: "Stanislav", bill: "1450.00", cost: "1100.00", margin: "350.00" },
        { id: `R-I-260004`, date: "15.06.2026", from: "HAM_CORP", to: shortName, manager: "Stanislav", bill: "2800.00", cost: "2350.00", margin: "450.00" }
    ];

    let html = '';
    mockActs.forEach(act => {
        html += `
            <tr style="border-bottom: 1px solid #f1f5f9; height:36px;">
                <td style="padding:8px 10px; font-weight:800; color:#2563eb; font-family:monospace;">${act.id}</td>
                <td style="padding:8px 10px; color:#64748b;">${act.date}</td>
                <td style="padding:8px 10px; font-weight:700;">${act.from}</td>
                <td style="padding:8px 10px; font-weight:700;">${act.to}</td>
                <td style="padding:8px 10px; color:#475569; font-weight:600;">${act.manager}</td>
                <td style="padding:8px 10px; font-weight:700; color:#0f172a;">${act.bill} EUR</td>
                <td style="padding:8px 10px; color:#ef4444; font-weight:600;">-${act.cost} EUR</td>
                <td style="padding:8px 10px; text-align:right; font-weight:900; color:#16a34a;">+${act.margin} EUR</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (Вкладки и Условия оплаты)
function initTabsLogic() {
    const tabBtns = document.querySelectorAll('.tms-tab-btn');
    const tabContents = document.querySelectorAll('.tms-tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 1. Снимаем класс active со всех кнопок и вкладок
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // 2. Добавляем active на нажатую кнопку
            btn.classList.add('active');

            // 3. Добавляем active на связанный контент
            const targetId = btn.getAttribute('data-tab');
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

window.showTab = function(tabId) {
    // Скрываем все
    document.querySelectorAll('.tms-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tms-tab-btn').forEach(el => el.classList.remove('active'));
    
    // Показываем нужный
    document.getElementById(tabId).style.display = 'block';
    event.currentTarget.classList.add('active');
};

async function loadPaymentTermsDropdown() {
    try {
        const prices = await api.fetchPrices();
        const select = document.getElementById('cpPaymentTerms');
        if (select && prices.payment_terms) {
            select.innerHTML = '<option value="">-- Выберите условия оплаты --</option>';
            Object.values(prices.payment_terms).forEach(term => {
                const opt = document.createElement('option');
                opt.value = term.name_en;
                opt.textContent = term.name_en;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn("[TMS Warning] Не удалось загрузить дефолтные условия в селект");
    }
}

window.showTab = function(tabId, btn) {
    // 1. Прячем ВСЕ вкладки через добавление класса tms-hidden
    document.querySelectorAll('[id^="tab-"]').forEach(el => {
        el.classList.add('tms-hidden');
    });
    
    // 2. Снимаем статус active со всех горизонтальных кнопок
    document.querySelectorAll('.tms-tab-btn').forEach(el => {
        el.classList.remove('active');
    });
    
    // 3. Открываем нужную вкладку, убирая tms-hidden
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.remove('tms-hidden');
    }
    
    // 4. Подсвечиваем синим нажатую кнопку в ряду
    if (btn) {
        btn.classList.add('active');
    }
    console.log(`[TMS CORE] Переключение на среду: ${tabId}`);
};

// Функция надежного переключения вкладок
function initTabs() {
    const tabBtns = document.querySelectorAll('.tms-tab-btn');
    const tabContents = document.querySelectorAll('.tms-tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');

            const targetId = btn.getAttribute('data-tab');
            const targetTab = document.getElementById(targetId);
            if (targetTab) {
                targetTab.classList.add('active');
            }
        });
    });
}