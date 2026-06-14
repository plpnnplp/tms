/**
 * TMS CORE: UI Controller (DOM Updater)
 * Ответственность: Исключительно манипуляции с DOM (чтение и запись).
 * Никаких API-запросов и сложных математических расчетов.
 */

import { ParserEngine } from '../parser.js';
import { HistoryManager } from '../state.js';
import { tmsTitleTemplates } from '../translations.js';

const UIController = {

    // --- 1. ПЕРЕНОС ДАННЫХ ИЗ ПАРСЕРА НА БЛАНК ---

    // --- ИНФРАСТРУКТУРА REACTIVE STATE ---
    initReactivity() {
        if (!window.appStore) return;
        window.appStore.subscribe((newState) => {
            console.log("State обновился, рендерим:", newState); // ДОБАВЬТЕ ЭТОТ ЛОГ
            this.renderStateToDOM(newState);
        });
    },

    initCityAutocomplete() {
        const setupAutocomplete = (inputId, routeKey) => {
            const inputEl = document.getElementById(inputId);
            if (!inputEl) return;

            // Создаем красивый контейнер для выпадающего списка
            let dropdown = document.createElement('div');
            dropdown.className = 'tms-autocomplete-dropdown';
            dropdown.style.cssText = 'position:absolute; top:100%; left:0; width:100%; background:#fff; border:1px solid #cbd5e1; border-radius:6px; z-index:1000; display:none; max-height:200px; overflow-y:auto; box-shadow:0 4px 12px rgba(0,0,0,0.1);';
            
            inputEl.parentElement.style.position = 'relative';
            inputEl.parentElement.appendChild(dropdown);

            let debounceTimer;

            // Фоновый поиск и расчет при ручном завершении ввода (blur)
            inputEl.addEventListener('blur', (e) => {
                setTimeout(async () => {
                    // Игнорируем, если менеджер выбирает элемент из открытого списка
                    if (dropdown.style.display === 'block') return;
                    
                    const text = e.target.innerText.trim();
                    if (text.length < 3) return;

                    // ИСПРАВЛЕНИЕ: Проверяем локальный импортированный ParserEngine вместо window
                    if (!ParserEngine || typeof ParserEngine._fetchGeoData !== 'function') {
                        console.warn("TMS Core: Испортированный ParserEngine не доступен. Фоновый расчет пропущен.");
                        return;
                    }

                    const state = window.appStore ? window.appStore.getState() : null;
                    if (!state) return;
                    
                    const currentCity = state.route[routeKey];
                    
                    // Если текст реально изменился вручную
                    if (currentCity && currentCity.cleanCity !== text && currentCity.rawText !== text) {
                        const lang = state.config.language || 'en';
                        
                        // ИСПРАВЛЕНИЕ: Вызываем метод напрямую из локального импорта
                        const geo = await ParserEngine._fetchGeoData(text, lang);
                        
                        if (geo) {
                            inputEl.innerText = geo.name;
                            inputEl.style.backgroundColor = 'transparent';
                            
                            const newRoute = { ...state.route };
                            newRoute[routeKey] = {
                                ...newRoute[routeKey],
                                rawText: text,
                                cleanCity: geo.name,
                                countryCode: geo.countryCode,
                                lat: geo.lat,
                                lon: geo.lon,
                                localNames: geo.localNames
                            };
                            
                            window.appStore.update('route', newRoute, true);
                            
                            if (window.Calculator) {
                                await window.Calculator.calculateRouteAndPrices();
                                window.Calculator.recalculateFinances();
                            }
                        }
                    }
                }, 250);
            });

            // Скрывать список, если кликнули в другое место экрана
            document.addEventListener('click', (e) => {
                if (e.target !== inputEl && !dropdown.contains(e.target)) dropdown.style.display = 'none';
            });
        };

        setupAutocomplete('blankPickupCity', 'pickup');
        setupAutocomplete('blankDeliveryCity', 'delivery');
    },

    renderStateToDOM(state) {
        if (this.isRendering) return; // Защита от циклической перерисовки
        this.isRendering = true;

        try {
            const lang = state.config?.language || 'en';

            const historyStatus = window.appStore.getHistoryStatus();
            const btnUndo = document.getElementById('btnTmsUndo');
            const btnRedo = document.getElementById('btnTmsRedo');
            
            if (btnUndo) {
                btnUndo.disabled = !historyStatus.canUndo;
                btnUndo.style.opacity = historyStatus.canUndo ? '1' : '0.4';
                btnUndo.style.cursor = historyStatus.canUndo ? 'pointer' : 'default';
            }
            if (btnRedo) {
                btnRedo.disabled = !historyStatus.canRedo;
                btnRedo.style.opacity = historyStatus.canRedo ? '1' : '0.4';
                btnRedo.style.cursor = historyStatus.canRedo ? 'pointer' : 'default';
            }

            // ЖЕСТКИЙ ОЧИСТИТЕЛЬ СТРОК: убирает невидимые пробелы, <br> и символы переноса строк,
            // которые ломали сравнение истории правок
            const cleanStr = (val) => {
                return (val || '')
                    .toString()
                    .replace(/[\n\r]/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            // Хелпер для обычных текстовых узлов (contenteditable / div / span)
            const safeSetText = (id, val) => {
                const el = document.getElementById(id);
                if (!el) return;
                
                const targetVal = cleanStr(val);
                const currentVal = cleanStr(el.innerText || el.innerHTML);
                
                // Проверяем фокус: если менеджер НЕ стоит курсором внутри этого инпута СЕЙЧАС,
                // значит изменение прилетело либо от парсера, либо от кнопок "Назад/Вперед".
                // В этом случае мы обновляем поле принудительно!
                if (currentVal !== targetVal && document.activeElement !== el) {
                    el.innerText = targetVal;
                }
            };

            // Хелпер для нативных инпутов (input type="text")
            const safeSetValue = (id, val) => {
                const el = document.getElementById(id);
                if (el && cleanStr(el.value) !== cleanStr(val)) {
                    el.value = val || '';
                }
            };

            // Берем город из языкового пакета (localNames) или падаем на старые значения
            const pickupName = state.route.pickup?.localNames?.[lang] || state.route.pickup?.cleanCity || state.route.pickupCity || '';
            const deliveryName = state.route.delivery?.localNames?.[lang] || state.route.delivery?.cleanCity || state.route.deliveryCity || '';

            safeSetText('blankDeliveryAddress', state.route.delivery?.address || state.route.deliveryAddress);
            // 1. Отрисовка текстовых полей и маршрутов
            safeSetText('blankPickupCity', pickupName);
            safeSetText('blankPickupAddress', state.route.pickup?.address || state.route.pickupAddress);
            safeSetText('blankDeliveryCity', deliveryName);
            safeSetText('blankDeliveryAddress', state.route.delivery?.address || state.route.deliveryAddress);

            // Светофор: Красим поля в желтый, если парсер не нашел координаты
            const pickupInput = document.getElementById('blankPickupCity');
            if (pickupInput) {
                pickupInput.style.backgroundColor = (state.route.pickup && !state.route.pickup.lat && state.route.pickup.rawText) ? '#fef08a' : 'transparent';
            }

            const deliveryInput = document.getElementById('blankDeliveryCity');
            if (deliveryInput) {
                deliveryInput.style.backgroundColor = (state.route.delivery && !state.route.delivery.lat && state.route.delivery.rawText) ? '#fef08a' : 'transparent';
            }

            // 2. Отрисовка условий и Инкотермс
            safeSetText('blankIncotermsCode', state.conditions.incotermsCode);
            safeSetText('blankIncotermsPlace', state.conditions.incotermsPlace);
            safeSetText('blankCustomsPoints', state.conditions.customsPlaces);
            
            // 3. Отрисовка деталей клиента
            safeSetText('clientCompany', state.details.clientCompany);
            safeSetValue('clientContact', state.details.clientContact);
            safeSetText('blankPaymentTerms', state.details.paymentTerms);
            safeSetText('blankTransitTime', state.details.transitTime);
            safeSetText('blankSpecialNotes', state.details.specialNotes);

            // 4. Метаданные бланка
            safeSetText('validUntilDate', state.meta.validUntilDate);

            // 5. Реактивный рендеринг таблицы грузов
            const cargoTbody = document.getElementById('tmsCargoTableBody');
            if (cargoTbody && state.cargo) {
                cargoTbody.innerHTML = '';
                state.cargo.forEach((cItem, index) => {
                    const tr = document.createElement('tr');
                    tr.className = "tms-cargo-row";
                    tr.setAttribute('data-id', cItem.id);
                    
                    let buttonsHtml = `<button type="button" class="tms-row-action-btn btn-plus" onclick="window.appStore.addCargoRow()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>`;
                    if (index > 0) {
                        buttonsHtml += `<button type="button" class="tms-row-action-btn btn-minus" onclick="window.appStore.removeCargoRow('${cItem.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>`;
                    }

                    tr.innerHTML = `
                        <td style="text-align: center; padding: 0 4px; position: relative;" class="tms-cargo-first-cell">
                            <input type="number" class="cargo-qty" value="${cItem.qty}" style="width: 55px; border: none; background: #f8fafc; border-radius: 4px; padding: 3px 4px; font-weight: 700; font-size: 13px; text-align: center;">
                            <div class="tms-cargo-action-wrapper">${buttonsHtml}</div>
                        </td>
                        <td style="text-align: center; padding: 0 4px;">
                            <div class="tms-custom-select-wrapper" style="position: relative; display: inline-block; width: 100%;">
                                <div class="tms-select-trigger" style="font-weight: 700; font-size: 11px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 20px 2px 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; position: relative; height: 20px; box-sizing: border-box;">${cItem.stack}</div>
                            </div>
                        </td>
                        <td style="text-align: center; padding: 0 4px;">
                            <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <input type="number" class="cargo-dim-l" value="${cItem.l}" style="width: 48px; border: none; background: #f8fafc; border-radius: 4px; padding: 3px 4px; font-weight: 700; font-size: 12px; text-align: center;"><span>×</span>
                                <input type="number" class="cargo-dim-w" value="${cItem.w}" style="width: 48px; border: none; background: #f8fafc; border-radius: 4px; padding: 3px 4px; font-weight: 700; font-size: 12px; text-align: center;"><span>×</span>
                                <input type="number" class="cargo-dim-h" value="${cItem.h}" style="width: 48px; border: none; background: #f8fafc; border-radius: 4px; padding: 3px 4px; font-weight: 700; font-size: 12px; text-align: center;">
                            </div>
                        </td>
                        <td style="text-align: center; padding: 0 4px;">
                            <input type="number" class="cargo-weight" value="${cItem.weight}" style="width: 75px; border: none; background: #f8fafc; border-radius: 4px; padding: 3px 4px; font-weight: 700; font-size: 13px; text-align: center;">
                        </td>
                        <td style="text-align: center; padding: 0 4px;"><span class="cargo-charge-weight" style="font-weight: 800; font-size: 13px; color: #475569;">${cItem.charge}</span></td>
                        <td style="text-align: center; padding: 0 4px;"><span class="cargo-ldm-val" style="font-weight: 800; font-size: 13px; color: #2563eb;">${cItem.ldm}</span></td>
                    `;
                    
                    // ДОБАВЛЕНО: Подписываем инпуты на обновление стейта (взято из удаленного дубликата)
                    tr.querySelectorAll('input[type="number"]').forEach(input => {
                        input.addEventListener('input', (e) => {
                            const rowId = e.target.closest('tr').getAttribute('data-id');
                            const currentState = window.appStore.getState();
                            const updatedCargo = currentState.cargo.map(c => {
                                if (c.id === rowId) {
                                    if (e.target.classList.contains('cargo-qty')) c.qty = e.target.value;
                                    if (e.target.classList.contains('cargo-dim-l')) c.l = e.target.value;
                                    if (e.target.classList.contains('cargo-dim-w')) c.w = e.target.value;
                                    if (e.target.classList.contains('cargo-dim-h')) c.h = e.target.value;
                                    if (e.target.classList.contains('cargo-weight')) c.weight = e.target.value;
                                }
                                return c;
                            });
                            
                            window.appStore.update(null, { cargo: updatedCargo }, false);
                            if (window.Calculator) window.Calculator.recalculateFinances();
                        });
                    });

                    cargoTbody.appendChild(tr);
                });
            }

            // 6. Реактивный рендеринг таблицы стоимостей (Экспедиторский PnL-интерфейс)
            const finTbody = document.getElementById('tmsFinancialTableBody');
            if (finTbody && state.services) {
                finTbody.innerHTML = '';
                
                state.services.forEach(s => {
                    const tr = document.createElement('tr');
                    tr.className = "tms-fin-row " + (s.isStage ? "tms-stage-row" : "surcharge-row");
                    tr.setAttribute(s.isStage ? 'data-stage' : 'data-surcharge-key', s.key);

                    const isTmsProvider = s.status === 'tms_provider';
                    const labelText = isTmsProvider ? (s.rate || 0).toFixed(2) : (window.tmsPricesData?.meta?.status_labels?.[s.status]?.[`label_${state.config.language || 'en'}`] || s.status);

                    const isPreview = document.getElementById('tms-live-blank')?.classList.contains('tms-preview-mode');
                    
                    // Показываем внутренние косты только если это НЕ превью для клиента
                    const pnlIndicatorsHtml = (isTmsProvider && !isPreview) ? `
                        <div class="tms-pnl-indicators" style="font-size:10px; color:#64748b; margin-top:2px;">
                            Cost: <span class="pnl-cost-val" style="font-weight:700;">${(s.carrier_cost || 0).toFixed(2)}</span> | 
                            Earn: <span class="pnl-margin-val" style="font-weight:700; color:#16a34a;">+${((s.margin || 0) * (s.qty || 1)).toFixed(2)} EUR</span>
                        </div>
                    ` : '';

                    tr.innerHTML = `
                        <td class="fin-row-desc">
                            <span class="title-en" style="font-weight:700; color:#1e293b;">${s.name}</span>
                            ${pnlIndicatorsHtml}
                        </td>
                        <td class="fin-row-input-cell cell-rate">
                            <input type="number" class="tms-fin-input fin-rate" value="${isTmsProvider ? (s.rate || 0).toFixed(2) : '0.00'}" ${!isTmsProvider ? 'disabled style="display:none;"' : ''} style="font-weight:800; color:#2563eb;">
                        </td>
                        <td class="fin-row-input-cell cell-qty">
                            <input type="number" class="tms-fin-input fin-qty" value="${s.qty || 1}" ${!isTmsProvider ? 'disabled style="display:none;"' : ''}>
                        </td>
                        <td class="fin-row-amount-cell">
                            <span class="fin-amount" style="${!isTmsProvider ? 'color: #94a3b8; font-size: 11px; font-weight: 700;' : 'font-weight:800; color:#1e293b;'}">${isTmsProvider ? (s.amount || 0).toFixed(2) : labelText}</span>
                        </td>
                        <td class="tms-action-cell-absolute">
                            <div class="tms-service-action-wrapper">
                                ${!s.isStage ? `
                                <button type="button" class="btn-fin-minus" data-key="${s.key}">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                </button>` : ''}
                            </div>
                        </td>
                    `;

                    if (isTmsProvider) {
                        tr.querySelectorAll('.tms-fin-input').forEach(input => {
                            input.addEventListener('input', (e) => {
                                const targetRow = e.target.closest('tr');
                                const key = targetRow.getAttribute('data-stage') || targetRow.getAttribute('data-surcharge-key');
                                const isRateField = e.target.classList.contains('fin-rate');
                                const val = parseFloat(e.target.value) || 0;

                                const updated = window.appStore.getState().services.map(ser => {
                                    if (ser.key === key) {
                                        let newRate = ser.rate;
                                        let newQty = ser.qty;
                                        let newCarrierCost = ser.carrier_cost;
                                        let newMargin = ser.margin;

                                        if (isRateField) {
                                            // Менеджер изменил конечную цену клиента -> пересчитываем маржу, кост перевозчика фиксирован
                                            newRate = val;
                                            newMargin = Math.max(0, newRate - newCarrierCost);
                                        } else {
                                            // Изменилось количество (базис веса/коробок)
                                            newQty = val;
                                        }

                                        return { 
                                            ...ser, 
                                            carrier_cost: newCarrierCost,
                                            margin: newMargin,
                                            rate: newRate, 
                                            qty: newQty, 
                                            amount: newRate * newQty 
                                        };
                                    }
                                    return ser;
                                });

                                window.appStore.update(null, { services: updated }, false);
                                if (window.Calculator) window.Calculator.recalculateFinances();
                            });
                        });
                    }
                    finTbody.appendChild(tr);
                });
            }

            // 7. Отрисовка текстового дисклеймера инкотермс
            const noticeEl = document.getElementById('tmsIncotermsAutomatedNotice');
            if (noticeEl) {
                const omitted = state.meta.omittedServices || [];
                if (omitted.length > 0) {
                    const inco = state.conditions.incotermsCode || 'EXW';
                    const lang = state.config.language || 'en';
                    let textPrefix = `According to ${inco}, these costs are paid by the other party: `;
                    if (lang === 'ru') textPrefix = `Согласно ${inco}, следующие расходы оплачивает другая сторона: `;
                    
                    noticeEl.innerText = textPrefix + omitted.join(', ');
                    noticeEl.style.display = 'block';
                } else {
                    noticeEl.style.display = 'none';
                }
            }

            safeSetText('quoteNumber', state.meta.quoteNumber);
            safeSetText('blankGrandTotalValue', state.meta.grandTotalValue);

            const profitEl = document.getElementById('tmsInternalProfitIndicator');
            if (profitEl) {
                const isPreview = document.getElementById('tms-live-blank')?.classList.contains('tms-preview-mode');
                const profitValue = parseFloat(state.meta.totalNetProfitValue) || 0;

                // Если включен "глазик" ИЛИ маржа нулевая — полностью скрываем блок
                if (isPreview || profitValue === 0) {
                    profitEl.style.display = 'none';
                } else {
                    profitEl.style.display = 'block';
                    profitEl.innerText = `Estimated Profit / Маржа сделки: +${profitValue.toFixed(2)} EUR`;
                }
            }
            
            const distSpan = document.getElementById('blankDistanceValue');
            if (distSpan && state.route.distance > 0) {
                distSpan.innerText = state.route.distance.toLocaleString('en-US');
            }

        } catch (error) {
            console.error("TMS Render Error:", error);
        } finally {
            // КРИТИЧНО: Гарантирует, что интерфейс разблокируется в любом случае
            this.isRendering = false;
        }
    },

    renderBlankSection(state) {
        const container = document.querySelector('.tms-blank-section-block');
        if (!container) return;

        // Очищаем блок
        container.innerHTML = '';

        // Создаем контент на основе данных из appStore
        const content = `
            <div class="sidebar-title">Условия перевозки</div>
            <div class="sidebar-row">
                <span>Incoterms:</span>
                <span class="sidebar-value">${state.conditions.incotermsCode || '-'}</span>
            </div>
            <div class="sidebar-row">
                <span>Город:</span>
                <span class="sidebar-value">${state.conditions.incotermsPlace || '-'}</span>
            </div>
            <div class="sidebar-row">
                <span>Тип:</span>
                <span class="sidebar-value">${state.conditions.loadType || '-'}</span>
            </div>
        `;
        container.innerHTML = content;
    },

    // --- 2. ИНИЦИАЛИЗАЦИЯ И РЕНДЕРИНГ ВЫПАДАЮЩИХ СПИСКОВ ---
    initAdditionalServicesDropdown(pricesData) {
        const dropdown = document.getElementById('blankAdditionalServiceDropdown');
        if (!dropdown || !pricesData) return;
        
        const selectedDirection = document.getElementById('configDirection')?.getAttribute('data-selected');
        const currentLang = document.getElementById('configLanguage')?.getAttribute('data-selected') || 'en';
        const currentIncoterm = document.getElementById('blankIncotermsCode')?.innerText.trim().toUpperCase();

        dropdown.innerHTML = '';
        
        if (!selectedDirection) {
            dropdown.innerHTML = '<option value="">-- Сначала выберите Направление --</option>';
            dropdown.disabled = true;
            return;
        }

        dropdown.disabled = false;
        dropdown.innerHTML = '<option value="">-- Выберите доп. услугу из справочника --</option>';
        
        const normalizedDir = selectedDirection.charAt(0).toUpperCase() + selectedDirection.slice(1);

        Object.keys(pricesData.surcharges).forEach(key => {
            const item = pricesData.surcharges[key];
            const dirMatch = item.allowed_directions && item.allowed_directions.includes(normalizedDir);
            const incotermMatch = currentIncoterm && item.rules && item.rules[currentIncoterm];

            if (item.allowed_directions && item.allowed_directions.includes(normalizedDir)) {
                const option = document.createElement('option');
                option.value = key;
                const nameText = currentLang === 'uk' ? item.name_ru : item.name_en; 
                option.innerText = `${nameText} (+${item.default_rate.toFixed(2)} EUR)`;
                dropdown.appendChild(option);
            }
        });
    },

    initPaymentTermsDropdown(pricesData) {
        const paymentDropdown = document.querySelector('.tms-payment-dropdown');
        if (!paymentDropdown || !pricesData || !pricesData.payment_terms) return;

        const currentLang = document.getElementById('configLanguage')?.getAttribute('data-selected') || 'en';
        paymentDropdown.innerHTML = '';

        pricesData.payment_terms.forEach(term => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'tms-payment-option tms-option';
            optionDiv.style.cssText = 'padding: 6px 12px; font-size: 11px; font-weight: 700; color: #1e293b; cursor: pointer; text-align: left; transition: background 0.15s;';
            optionDiv.innerText = term['text_' + currentLang] || term['text_en'] || 'Payment Term Error';
            optionDiv.setAttribute('data-term-id', term.id);
            paymentDropdown.appendChild(optionDiv);
        });
    },

    initDropdownListeners() {
        document.addEventListener('click', (e) => {
            const trigger = e.target.closest('.tms-select-trigger, .tms-payment-select-wrapper, .tms-stack-select-wrapper, .tms-package-trigger, .tms-cargo-type-trigger, .tms-loading-trigger');
            const option = e.target.closest('.tms-option, .tms-payment-option, .tms-load-option, .tms-package-option');

            if (option) {
                const dropdown = option.parentElement;
                const triggerEl = dropdown.previousElementSibling; 
                if (!triggerEl) return; 

                triggerEl.innerText = option.innerText;
                const selectedValue = option.getAttribute('data-value') || option.innerText;
                triggerEl.setAttribute('data-selected', selectedValue);
                dropdown.style.display = 'none';

                // Маршрутизация изменений параметров
                if (triggerEl.id === 'configLanguage') {
                    this.applyBlankLanguage(selectedValue);
                } else if (triggerEl.id === 'blankIncotermsCode') {
                    this.refreshBusinessLogic(); 
                } else {
                    this.handleDropdownChange(triggerEl.id);
                }
                
                // Фиксируем ручные правки менеджера
                HistoryManager.saveState();
                const notice = document.getElementById('tmsManualChangeNotice');
                
                if (notice && (triggerEl.id === 'configClientRole' || triggerEl.id !== 'configDirection')) {
                    notice.style.display = 'flex';
                }
                return;
            }

            if (trigger) {
                const dropdown = trigger.nextElementSibling;
                if (dropdown) {
                    const isVisible = dropdown.style.display === 'flex';
                    document.querySelectorAll('.tms-select-options-dropdown, .tms-panel-dropdown, .tms-payment-dropdown, .tms-package-dropdown, .tms-cargo-type-dropdown, .tms-loading-dropdown').forEach(d => d.style.display = 'none');
                    dropdown.style.display = isVisible ? 'none' : 'flex';
                }
            } else {
                document.querySelectorAll('.tms-select-options-dropdown, .tms-panel-dropdown, .tms-payment-dropdown, .tms-package-dropdown, .tms-cargo-type-dropdown, .tms-loading-dropdown').forEach(d => d.style.display = 'none');
            }
        });
    },

    handleDropdownChange(id) {
        const transportEl = document.getElementById('configTransport');
        const transport = transportEl?.getAttribute('data-selected') || 'road';

        if (id === 'configDirection') {
            const dir = document.getElementById('configDirection').getAttribute('data-selected');
            const panel = document.getElementById('services-control-component');
            const serviceDropdown = document.getElementById('blankAdditionalServiceDropdown');
            const clientRoleTrigger = document.getElementById('configClientRole');
            
            if (dir && panel) {
                panel.classList.remove('disabled');
                panel.style.opacity = "1";
                panel.style.pointerEvents = "auto";
                
                if (serviceDropdown) {
                    serviceDropdown.disabled = false;
                    this.initAdditionalServicesDropdown(window.tmsPricesData);
                }
            }

            // Автозаполнение Роли Клиента на основе Направления
            if (clientRoleTrigger) {
                if (dir === 'import') {
                    clientRoleTrigger.setAttribute('data-selected', 'receiver');
                    clientRoleTrigger.innerText = 'Receiver / Получатель';
                } else { 
                    clientRoleTrigger.setAttribute('data-selected', 'sender');
                    clientRoleTrigger.innerText = 'Sender / Отправитель';
                }
            }
        }

        if (id === 'configTransport') {
            this.filterIncotermsOptions(transport);
        }

        // Запуск сквозного пересчета правил
        this.refreshBusinessLogic();

        if (['configLanguage', 'configTransport', 'configDirection', 'configClientRole'].includes(id)) {
            this.updateQuotationTitle();
        }
    },

    updateLoadTypeDropdownOptions(transport) {
        const truckTypeTrigger = document.getElementById('blankTruckType');
        const dropdown = document.querySelector('.tms-load-type-dropdown');
        if (!truckTypeTrigger || !dropdown) return;

        dropdown.innerHTML = '';
        let options = [];

        if (transport === 'air') {
            truckTypeTrigger.innerText = "Passenger Aircraft (PAX)";
            options = ["Passenger Aircraft (PAX)", "Cargo Aircraft Only (CAO)"];
        } else if (transport === 'sea') {
            truckTypeTrigger.innerText = "Less Container Load (LCL)";
            options = ["Less Container Load (LCL)", "Full Container Load (FCL 20'DC)", "Full Container Load (FCL 40'HC)"];
        } else {
            truckTypeTrigger.innerText = "Full Load (FTL)";
            options = ["Full Load (FTL)", "Partial Load (LTL)"];
        }

        options.forEach(optText => {
            const optDiv = document.createElement('div');
            optDiv.className = 'tms-load-option';
            optDiv.style.cssText = 'padding: 6px 12px; font-size: 11px; font-weight: 700; color: #1e293b; cursor: pointer; text-align: left; transition: background 0.15s;';
            optDiv.innerText = optText;
            dropdown.appendChild(optDiv);
        });

        this.toggleLdmColumnVisibility(transport);
    },

    // --- 3. ОБНОВЛЕНИЕ ФИНАНСОВОЙ ЧАСТИ БЛАНКА ---
    renderDynamicBaseFreight(data) {
        const rateInput = document.getElementById('tmsBaseFreightRateInput');
        const qtyInput = document.getElementById('tmsBaseFreightQtyInput');
        const thRate = document.getElementById('thFinancialRate');
        const thBasis = document.getElementById('thFinancialBasis');
        
        const isPerUnit = (data.transportVal === 'road' && data.loadType.includes("LTL")) || 
                          data.transportVal === 'air' || 
                          (data.transportVal === 'sea' && data.loadType.includes("LCL"));
        
        if (isPerUnit) {
            if (thRate) thRate.innerText = data.transportVal === 'sea' ? "Rate (EUR/CBM)" : "Rate (EUR/kg)";
            if (thBasis) thBasis.innerText = "Chg. Wt. / Вес";
        } else {
            if (thRate) thRate.innerText = "Rate (EUR)";
            if (thBasis) thBasis.innerText = "Qty / Кол-во";
        }
        
        if (rateInput && qtyInput) {
            if (document.activeElement !== rateInput && document.activeElement !== qtyInput) {
                rateInput.value = data.finalRate.toFixed(2);
                qtyInput.value = isPerUnit ? (data.totalChargeWeight > 0 ? data.totalChargeWeight.toFixed(2) : "0.00") : "1";
            }
        }
        this.updateBaseFreightName(data.transportVal, data.loadType);
    },

    updateBaseFreightName(transportVal, loadType) {
        const labelEn = document.getElementById('tmsDynamicFreightNameEn');
        const labelRu = document.getElementById('tmsDynamicFreightNameRu');
        if (!labelEn || !labelRu || !window.tmsPricesData) return;
        
        const cityA = document.getElementById('blankPickupCity')?.innerText.trim() || "Точка А";
        const cityB = document.getElementById('blankDeliveryCity')?.innerText.trim() || "Точка Б";
        
        let baseFreight = window.tmsPricesData.base_rates?.[transportVal]?.[loadType.includes("LTL") || loadType.includes("PAX") || loadType.includes("LCL") ? loadType.split('_')[0] : 'ftl_international'];
        if (!baseFreight) baseFreight = window.tmsPricesData.base_rates.road.ftl_international; 

        labelEn.innerText = (baseFreight.name_en || "").replace('{from}', cityA).replace('{to}', cityB);
        labelRu.innerText = (baseFreight.name_ru || "").replace('{from}', cityA).replace('{to}', cityB);
    },

    addServiceRowFromCatalog() {
    const dropdown = document.getElementById('blankAdditionalServiceDropdown');
    const selectedKey = dropdown.value;
    if (!selectedKey || !window.tmsPricesData || !window.appStore) return;
    
    const state = window.appStore.getState();
    const surcharge = window.tmsPricesData.surcharges[selectedKey];
    
    // Проверяем, есть ли уже такая услуга
    if (state.services.some(s => s.key === selectedKey)) {
        dropdown.value = "";
        return;
    }

    // Создаем новую запись
    const newService = {
        key: selectedKey,
        isStage: false,
        name: surcharge.name_en || selectedKey,
        rate: surcharge.default_rate || 0,
        qty: surcharge.default_qty || 1,
        amount: (surcharge.default_rate || 0) * (surcharge.default_qty || 1),
        status: 'tms_provider'
    };

    // Обновляем состояние
    const updatedServices = [...(state.services || []), newService];
    window.appStore.update(null, { services: updatedServices }, true); 
    dropdown.value = "";

    // Принудительно пересчитываем
    if (window.Calculator) window.Calculator.recalculateFinances();
    },

    applyIncotermsFinancialFilter() {
        if (!window.tmsPricesData) return;

        const incoterm = document.getElementById('blankIncotermsCode')?.innerText.trim().toUpperCase();
        const transport = document.getElementById('configTransport')?.getAttribute('data-selected') || 'road';
        const lang = document.getElementById('configLanguage')?.getAttribute('data-selected') || 'en';
        const truckType = document.getElementById('blankTruckType')?.innerText || 'Full Load (FTL)';

        if (!incoterm) return;

        const tbody = document.getElementById('tmsFinancialTableBody');
        if (!tbody) return;

        const savedRates = {};
        tbody.querySelectorAll('.surcharge-row, .tms-fin-row').forEach(row => {
            const key = row.getAttribute('data-surcharge-key') || row.getAttribute('data-stage');
            const input = row.querySelector('.fin-rate');
            if (key && input) savedRates[key] = input.value;
        });

        tbody.innerHTML = "";

        let transportSubtype = 'ftl_international';
        if (transport === 'road') {
            const dir = document.getElementById('configDirection')?.getAttribute('data-selected') || 'export';
            if (dir === 'domestic') transportSubtype = 'ftl_domestic';
            else if (truckType.includes('LTL') || truckType.includes('Partial')) transportSubtype = 'ltl_international';
        } else if (transport === 'air') {
            transportSubtype = truckType.includes('CAO') ? 'cao' : 'pax';
        } else if (transport === 'sea') {
            transportSubtype = truckType.includes('LCL') ? 'lcl' : (truckType.includes('20') ? 'fcl_20dc' : 'fcl_40hc');
        }

        const omittedServices = [];
        const baseStages = ['vorlauf', 'hauptlauf', 'nachlauf'];

        const catRow = document.createElement('tr');
        catRow.className = "tms-fin-category-row";
        tbody.appendChild(catRow);

        const self = this;

        // 1. Сборка базовых этапов
        baseStages.forEach(stage => {
            const stageData = window.tmsPricesData.base_rates?.[transport]?.[transportSubtype]?.[stage];
            if (!stageData || !stageData.rules?.[incoterm]) return;

            const rule = stageData.rules[incoterm];
            const dict = tmsTitleTemplates[lang] || tmsTitleTemplates.en;
            const localizedName = dict[stage] || stageData[`name_${lang}`] || stageData.name_en;

            if (rule.status === 'tms_provider') {
                let defRate = savedRates[stage] || "0.00";
                if (!savedRates[stage] && stageData.default_rate) defRate = stageData.default_rate.toFixed(2);

                const tr = self._renderFinancialRowElement({
                    key: stage,
                    isStage: true,
                    name: localizedName,
                    rate: defRate,
                    qty: "1"
                });
                tbody.appendChild(tr);
            } else {
                const cleanName = localizedName.split('(')[0].trim();
                if (!omittedServices.includes(cleanName)) omittedServices.push(cleanName);
            }
        });

        // 2. Рендеринг дополнительных сборов (Строго по выбору менеджера)
        Object.keys(window.tmsPricesData.surcharges).forEach(key => {
            const surcharge = window.tmsPricesData.surcharges[key];
            if (!surcharge.rules?.[incoterm]) return;

            // Проверяем, была ли эта услуга добавлена менеджером на бланк (есть ли она в сохраненных)
            const isManuallyAdded = savedRates[key] !== undefined;

            // ОТМЕНА ПРИНУДИТЕЛЬНОЙ АВТОМАТИКИ: Если услуги нет на бланке, мы ее не генерируем
            if (!isManuallyAdded) return;

            const rule = surcharge.rules[incoterm];
            const localizedName = surcharge[`name_${lang}`] || surcharge.name_en;

            if (rule.status === 'tms_provider') {
                // Если за добавленную услугу платит клиент - рендерим строку в таблицу
                const tr = self._renderFinancialRowElement({
                    key: key,
                    isStage: false,
                    name: localizedName,
                    rate: savedRates[key] || surcharge.default_rate.toFixed(2),
                    qty: surcharge.default_qty
                });
                tbody.appendChild(tr);
            } else {
                // Если услуга была добавлена, но при смене Инкотермс ответственность перешла к контрагенту,
                // убираем ее из таблицы стоимостей и переносим в текстовый дисклеймер.
                const cleanName = localizedName.split('(')[0].trim();
                if (!omittedServices.includes(cleanName)) omittedServices.push(cleanName);
            }
        });

        self._renderIncotermsNotice(incoterm, omittedServices, lang);
    },

    // Вспомогательный хелпер для генерации строк (БЫЛ УТЕРЯН, ТЕПЕРЬ ВОССТАНОВЛЕН)
    _renderFinancialRowElement(cfg) {
        const tr = document.createElement('tr');
        tr.className = "tms-fin-row " + (cfg.isStage ? "tms-stage-row" : "surcharge-row");
        tr.setAttribute(cfg.isStage ? 'data-stage' : 'data-surcharge-key', cfg.key);

        tr.innerHTML = `
            <td class="fin-row-desc"><span class="title-en">${cfg.name}</span></td>
            <td class="fin-row-input-cell cell-rate"><input type="number" class="tms-fin-input fin-rate" value="${cfg.rate}"></td>
            <td class="fin-row-input-cell cell-qty"><input type="number" class="tms-fin-input fin-qty" value="${cfg.qty}"></td>
            <td class="fin-row-amount-cell"><span class="fin-amount">0.00</span></td>
            <td class="tms-action-cell-absolute">
                <div class="tms-service-action-wrapper">
                    <button type="button" class="btn-fin-minus">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
            </td>
        `;

        tr.querySelectorAll('.tms-fin-input').forEach(input => {
            input.addEventListener('input', () => {
                if (window.calculateFinancials) window.calculateFinancials();
            });
        });

        return tr;
    },

    async applyBlankLanguage(lang) {
        if (!lang) {
            const configLang = document.getElementById('configLanguage');
            lang = configLang ? configLang.getAttribute('data-selected') : 'en';
        }

        console.log("--- Вызов перевода бланка ---", lang);

        const dict = tmsTitleTemplates[lang];
        if (!dict) return;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translated = dict[key];
            if (translated) el.innerText = translated;
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translated = dict[key];
            if (translated) el.setAttribute('placeholder', translated);
        });

        if (window.appStore && window.ParserEngine && typeof window.ParserEngine._fetchGeoData === 'function') {
            const state = window.appStore.getState();
            let routeUpdated = false;
            const newRoute = { ...state.route };

            // Перезапрашиваем точку А на новом языке по её текущим координатам или сырому тексту
            if (state.route.pickup && state.route.pickup.rawText) {
                const geo = await window.ParserEngine._fetchGeoData(state.route.pickup.rawText, lang);
                if (geo) {
                    newRoute.pickup.cleanCity = geo.name;
                    newRoute.pickup.countryCode = geo.countryCode;
                    newRoute.pickup.localNames = geo.localNames; // Восстановлено!
                    routeUpdated = true;
                }
            }

            if (state.route.delivery && state.route.delivery.rawText) {
                const geo = await window.ParserEngine._fetchGeoData(state.route.delivery.rawText, lang);
                if (geo) {
                    newRoute.delivery.cleanCity = geo.name;
                    newRoute.delivery.countryCode = geo.countryCode;
                    newRoute.delivery.localNames = geo.localNames; // Восстановлено!
                    routeUpdated = true;
                }
            }

            if (routeUpdated) {
                // Пушим обновленные языковые названия городов в стейт без сохранения истории
                window.appStore.state.route = newRoute;
                this.renderStateToDOM(window.appStore.getState());
            }
        }
    },

    togglePreviewMode() {
        const blank = document.getElementById('tms-live-blank');
        if (!blank) return;
        
        const isPreview = blank.classList.toggle('tms-preview-mode');
        
        const pickupAddr = document.getElementById('blankPickupAddress');
        const deliveryAddr = document.getElementById('blankDeliveryAddress');
        
        const isPlaceholderOrEmpty = (el) => {
            const text = el.innerText.trim();
            return !text || text === el.getAttribute('placeholder') || text === el.getAttribute('data-i18n-placeholder');
        };

        if (pickupAddr) pickupAddr.style.display = (isPreview && isPlaceholderOrEmpty(pickupAddr)) ? 'none' : '';
        if (deliveryAddr) deliveryAddr.style.display = (isPreview && isPlaceholderOrEmpty(deliveryAddr)) ? 'none' : '';
        
        const notice = document.getElementById('tmsManualChangeNotice');
        if (notice && isPreview) notice.style.display = 'none';

        if (window.appStore) {
            this.renderStateToDOM(window.appStore.getState());
            this.refreshBusinessLogic();
        }
    },

    filterIncotermsOptions(transport) {
        if (!window.tmsPricesData || !window.tmsPricesData.meta?.incoterms_by_transport) {
            console.warn("TMS Core: Справочник incoterms_by_transport не найден в prices.json");
            return;
        }

        const allowedInco = window.tmsPricesData.meta.incoterms_by_transport[transport] || [];
        const incotermTrigger = document.getElementById('blankIncotermsCode');
        if (!incotermTrigger) return;

        const dropdown = incotermTrigger.nextElementSibling;
        if (!dropdown) return;

        dropdown.innerHTML = '';

        allowedInco.forEach(incoCode => {
            const optDiv = document.createElement('div');
            optDiv.className = 'tms-option'; 
            optDiv.style.cssText = 'padding: 6px 12px; font-size: 11px; font-weight: 700; color: #1e293b; cursor: pointer; text-align: left; transition: background 0.15s;';
            optDiv.setAttribute('data-value', incoCode.toUpperCase()); 
            optDiv.innerText = incoCode;
            dropdown.appendChild(optDiv);
        });

        const currentSelectedInco = incotermTrigger.innerText.trim().toUpperCase();
        if (currentSelectedInco && !allowedInco.includes(currentSelectedInco)) {
            const defaultFallback = allowedInco.includes("FCA") ? "FCA" : allowedInco[0] || "EXW";
            incotermTrigger.innerText = defaultFallback;
            incotermTrigger.setAttribute('data-selected', defaultFallback);
            console.log(`TMS Автоматизация: Базис ${currentSelectedInco} недоступен для транспорта "${transport}". Сброшено на ${defaultFallback}.`);
        }
    },

    _renderIncotermsNotice(incoterm, services, lang) {
        const noticeEl = document.getElementById('tmsIncotermsAutomatedNotice');
        if (!noticeEl) return;

        if (services.length === 0) {
            noticeEl.style.display = 'none';
            return;
        }

        const dict = tmsTitleTemplates[lang] || tmsTitleTemplates.en;
        let templateStr = dict.incoterms_disclaimer;

        if (!templateStr) {
            templateStr = "* According to {incoterm} terms, responsibilities for: {services} are processed directly via counterparty and are not included in our rate.";
        }

        const finalNoticeText = templateStr
            .replace('{incoterm}', incoterm)
            .replace('{services}', services.join(', '));

        noticeEl.innerText = finalNoticeText;
        noticeEl.style.display = 'block';
    },

    // --- 4. РАБОТА СО СТРОКАМИ ГРУЗА И UI-ФИШКИ ---
    addCargoRow() {
        const tbody = document.getElementById('tmsCargoTableBody');
        const tr = this._createCargoRowElement(null, false);
        tbody.appendChild(tr);
    },

    removeCargoRow(btnElement) {
        const row = btnElement.closest('.tms-cargo-row');
        if (row) row.remove();
    },

    toggleLdmColumnVisibility(transport) {
        const thLdm = document.getElementById('thLdmDynamic');
        if (!thLdm) return;

        if (transport === 'air') {
            thLdm.setAttribute('data-i18n', 'lbl_vol_wt');
            thLdm.innerText = 'Vol. Wt.';
        } else if (transport === 'sea') {
            thLdm.setAttribute('data-i18n', 'lbl_cbm');
            thLdm.innerText = 'CBM';
        } else {
            thLdm.setAttribute('data-i18n', 'lbl_ldm');
            thLdm.innerText = 'LDM';
        }

        // Переводим новый заголовок, если язык уже был выбран
        const lang = document.getElementById('configLanguage')?.getAttribute('data-selected') || 'en';
        this.applyBlankLanguage(lang);
    },

    applyTmsIncotermsAutomation(passedIncoterm) {
        if (!window.appStore) return;
        const state = window.appStore.getState();
        const incotermCode = passedIncoterm || state.conditions.incotermsCode;
        const firstLetter = (incotermCode || 'F').charAt(0);
        
        // Берем валидированные чистые названия городов
        const pickupCity = (state.route.pickup?.cleanCity || state.route.pickup?.rawText || "").split(',')[0].trim();
        const deliveryCity = (state.route.delivery?.cleanCity || state.route.delivery?.rawText || "").split(',')[0].trim();

        let targetCity = "";
        if (['E', 'F'].includes(firstLetter)) targetCity = pickupCity;
        else if (['C', 'D'].includes(firstLetter)) targetCity = deliveryCity;

        if (targetCity && state.conditions.incotermsPlace !== targetCity) {
            window.appStore.update('conditions', { incotermsPlace: targetCity }, false);
        }
    },

    refreshBusinessLogic() {
        if (!window.appStore) return;
        const state = window.appStore.getState();
        const transport = state.config.transport || 'road';
        const incoterm = state.conditions.incotermsCode || 'EXW';
        const lang = state.config.language || 'en';

        if (transport) this.updateLoadTypeDropdownOptions(transport);
        if (window.tmsPricesData) this.initAdditionalServicesDropdown(window.tmsPricesData);

        // 1. Автоматика Инкотермс (запишет город)
        if (incoterm) this.applyTmsIncotermsAutomation(incoterm);
        
        // КРИТИЧЕСКИЙ ФИКС: Автоматический пересчет и удержание даты валидности при смене транспорта
        if (transport) {
            let validityDays = 14; // дефолт для авто (road)
            if (transport === 'air') validityDays = 3;   // авиа ставки живут 3 дня
            if (transport === 'sea') validityDays = 30;  // морские ставки живут 30 дней

            const date = new Date();
            date.setDate(date.getDate() + validityDays);
            
            const dd = String(date.getDate()).padStart(2, '0');
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const yyyy = date.getFullYear();
            const calculatedDate = `${dd}.${mm}.${yyyy}`;

            // Записываем дату напрямую в рабочий стейт без создания лишних шагов в истории (false)
            window.appStore.state.meta.validUntilDate = calculatedDate;
        }
        
        // 2. Гарантированный пересчет таблицы финансов
        if (window.Calculator && typeof window.Calculator.recalculateFinances === 'function') {
            window.Calculator.recalculateFinances();
        }        
        
        this.applyBlankLanguage(lang);
    },

    initTmsBlankDateTime() {
        const dateEl = document.getElementById('currentQuoteDate');
        const validEl = document.getElementById('validUntilDate');
        if (!dateEl || !validEl) return;

        const now = new Date();
        dateEl.innerText = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

        const transportVal = document.getElementById('configTransport')?.getAttribute('data-selected') || 'road';
        const validityDaysMap = { 'air': 2, 'road': 3, 'sea': 7 };
        const daysToAdd = validityDaysMap[transportVal] || 3;

        const validDate = new Date();
        validDate.setDate(now.getDate() + daysToAdd);
        validEl.innerText = `${String(validDate.getDate()).padStart(2, '0')}.${String(validDate.getMonth() + 1).padStart(2, '0')}.${validDate.getFullYear()}`;
    },

    updateQuotationTitle() {
        const mainTitleEl = document.getElementById('blankMainTitle'); 
        if (!mainTitleEl || !window.tmsTitleTemplates) return;

        const transportVal = document.getElementById('configTransport')?.getAttribute('data-selected') || 'road';
        const directionVal = document.getElementById('configDirection')?.getAttribute('data-selected') || 'export';
        const lang = document.getElementById('configLanguage')?.getAttribute('data-selected') || 'en';

        const currentTemplate = window.tmsTitleTemplates[lang] || window.tmsTitleTemplates.en;
        const transportText = currentTemplate.transport[transportVal] || "";
        const directionText = currentTemplate.direction[directionVal] || "";
        
        if (lang === 'uk') {
            const details = [transportText, directionText].filter(Boolean).join(" ");
            mainTitleEl.innerText = details ? `${currentTemplate.suffix} (${details})` : currentTemplate.suffix;
        } else {
            mainTitleEl.innerText = `${transportText} ${directionText} ${currentTemplate.suffix}`.replace(/\s+/g, ' ').trim();
        }
    },

    displayQuoteNumber(num) {
        const el = document.getElementById('quoteNumber');
        if (el) el.innerText = num;
    },

    generatePdf() {
        const element = document.getElementById('tms-live-blank');
        const originalBorder = element.style.border;
        const wasPreview = element.classList.contains('tms-preview-mode');
        
        // Включаем чистый режим без обводок
        element.classList.add('tms-preview-mode');
        element.style.border = 'none';

        const profitIndicator = document.getElementById('tmsInternalProfitIndicator');
        if (profitIndicator) profitIndicator.style.display = 'none';

        //Принудительное добавление пустой 2-й страницы (впрыскиваем временный блок)
        const forcedSecondPage = document.createElement('div');
        forcedSecondPage.className = 'tms-forced-page-break';
        forcedSecondPage.style.cssText = "page-break-before: always; height: 260mm; background: #ffffff; display: block;";
        element.appendChild(forcedSecondPage);
        
        const opt = {
            margin: 0,
            filename: `${document.getElementById('quoteNumber')?.innerText || 'quotation'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, scrollY: 0, scrollX: 0 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        const toolbar = document.querySelector('.tms-history-toolbar');
        if (toolbar) toolbar.style.display = 'none';

        html2pdf().set(opt).from(element).toPdf().outputPdf('bloburl').then(function (pdfBlobUrl) {
            window.open(pdfBlobUrl, '_blank');
            
            forcedSecondPage.remove();
            
            element.style.border = originalBorder;
            if (toolbar) toolbar.style.display = 'flex';

            if (profitIndicator && !wasPreview) {
                profitIndicator.style.display = 'block';
            }

            if (!wasPreview) {
                element.classList.remove('tms-preview-mode');
            }
        });
    },

    // --- 5. СБОР ДАННЫХ И ВАЛИДАЦИЯ ПЕРЕД ОТПРАВКОЙ НА БЭКЕНД ---
    validateBlank() {
        document.querySelectorAll('.tms-invalid-field').forEach(el => el.classList.remove('tms-invalid-field'));
        let hasErrors = false;
        const markInvalid = (el) => { if (el) { el.classList.add('tms-invalid-field'); hasErrors = true; } };

        ['configLanguage', 'configTransport', 'configDirection', ].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.getAttribute('data-selected')) markInvalid(el);
        });

        ['clientCompany', 'validUntilDate', 'blankPickupCity', 'blankDeliveryCity', 'blankIncotermsPlace', 'blankPaymentTerms', 'blankTransitTime'].forEach(id => {            const el = document.getElementById(id);
            const val = el ? (el.value !== undefined ? el.value : el.innerText) : "";
            if (!val || val.trim() === "") markInvalid(el);
        });

        if (hasErrors) document.getElementById('tmsValidationModal').style.display = 'flex';
        return !hasErrors;
    },

    // --- ПРИВАТНЫЕ ХЕЛПЕРЫ ---
    _getLocalizedCityName(rawText, lang) {
        if (!window.tmsCitiesData || !rawText) return rawText;
        const cleanText = rawText.split(',')[0].trim().toLowerCase();
        const cityObj = window.tmsCitiesData.find(c => c.variants.includes(cleanText));
        return cityObj ? (cityObj['name_' + lang] || cityObj.name_en || cityObj.name) : rawText; 
    },

    _createCargoRowElement(data, isFirstRow) {
        const d = data || { qty: 1, stack: 'Да / Yes', l: 120, w: 80, h: 160, weight: 0, charge: '0.00', ldm: '0.40' };
        const tr = document.createElement('tr');
        tr.className = "tms-cargo-row";
        
        let buttonsHtml = `<button type="button" class="tms-row-action-btn btn-plus"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>`;
        if (!isFirstRow) buttonsHtml += `<button type="button" class="tms-row-action-btn btn-minus"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>`;

        tr.innerHTML = `
            <td style="text-align: center; padding: 0 4px; position: relative;">
                <input type="number" class="cargo-qty" value="${d.qty}" style="width: 55px; border: none; background: #f8fafc; border-radius: 4px; padding: 3px 4px; font-weight: 700; font-size: 13px; text-align: center;">
                <div class="tms-cargo-action-wrapper">${buttonsHtml}</div>
            </td>
           <td style="text-align: center; padding: 0 4px;">
                <div class="tms-custom-select-wrapper" style="position: relative; display: inline-block; width: 100%;">
                    <div class="tms-select-trigger" style="font-weight: 700; font-size: 11px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 20px 2px 6px; cursor: pointer; user-select: none; display: inline-flex; align-items: center; justify-content: center; position: relative; height: 20px; box-sizing: border-box;">${d.stack}</div>
                    <div class="tms-select-options-dropdown" style="position: absolute; top: 100%; left: 0; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 9999; display: none; flex-direction: column; min-width: 85px; width: 100%; padding: 4px 0; margin-top: 4px; box-sizing: border-box;">
                        <div class="tms-option" data-value="yes" style="padding: 6px 12px; font-size: 11px; font-weight: 700; color: #1e293b; cursor: pointer; text-align: center;">Да / Yes</div>
                        <div class="tms-option" data-value="no" style="padding: 6px 12px; font-size: 11px; font-weight: 700; color: #1e293b; cursor: pointer; text-align: center;">Нет / No</div>
                    </div>
                </div>
            </td>
            <td style="text-align: center; padding: 0 4px;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <input type="number" class="cargo-dim-l" value="${d.l}" style="width: 48px; border: none; background: #f8fafc; border-radius: 4px; padding: 3px 4px; font-weight: 700; font-size: 12px; text-align: center;"><span>×</span>
                    <input type="number" class="cargo-dim-w" value="${d.w}" style="width: 48px; border: none; background: #f8fafc; border-radius: 4px; padding: 3px 4px; font-weight: 700; font-size: 12px; text-align: center;"><span>×</span>
                    <input type="number" class="cargo-dim-h" value="${d.h}" style="width: 48px; border: none; background: #f8fafc; border-radius: 4px; padding: 3px 4px; font-weight: 700; font-size: 12px; text-align: center;">
                </div>
            </td>
            <td style="text-align: center; padding: 0 4px;"><input type="number" class="cargo-weight" value="${d.weight}" style="width: 75px; border: none; background: #f8fafc; border-radius: 4px; padding: 3px 4px; font-weight: 700; font-size: 13px; text-align: center;"></td>
            <td style="text-align: center; padding: 0 4px;"><span class="cargo-charge-weight" style="font-weight: 800; font-size: 13px; color: #475569;">${d.charge}</span></td>
            <td style="text-align: center; padding: 0 4px;"><span class="cargo-ldm-val" style="font-weight: 800; font-size: 13px; color: #2563eb;">${d.ldm}</span></td>
        `;

        // Оживляем инпуты нового ряда для калькулятора на лету
        tr.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('input', () => {
                if (window.Calculator && typeof window.Calculator.calculateCargoRow === 'function') {
                    window.Calculator.calculateCargoRow(input);
                }
            });
        });

        return tr;
    },

    _refreshCityNames(lang) {
        const pickupEl = document.getElementById('blankPickupCity');
        const deliveryEl = document.getElementById('blankDeliveryCity');
        
        if (pickupEl && pickupEl.getAttribute('data-raw-name')) {
            pickupEl.innerText = this._getLocalizedCityName(pickupEl.getAttribute('data-raw-name'), lang);
        }
        if (deliveryEl && deliveryEl.getAttribute('data-raw-name')) {
            deliveryEl.innerText = this._getLocalizedCityName(deliveryEl.getAttribute('data-raw-name'), lang);
        }  
    }
};

window.UIController = UIController;
export { UIController };