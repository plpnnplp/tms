/**
 * TMS CORE: Calculator Engine
 * Ответственность: Математика, зависящая от State Manager.
 */

import { api } from './api.js';

export const Calculator = {

    // --- 1. ПЕРЕСЧЕТ МАССИВА ГРУЗОВ ИЗ ПАМЯТИ ---
    recalculateAllCargoRows: function() {
        const state = window.appStore.getState();
        if (!state.services) state.services = [];
        if (!state.cargo) return { totalChargeWeight: 0 };

        let totalQty = 0, totalRealWeight = 0, totalChargeWeight = 0, totalLdm = 0;
        const transportVal = state.config.transport || 'road';
        const loadType = state.conditions.loadType || "";

        // Пробегаем по массиву из стейта и пересчитываем каждую строку
        const updatedCargo = state.cargo.map(item => {
            const qty = parseFloat(item.qty) || 0;
            const length = parseFloat(item.l) || 0;
            const width = parseFloat(item.w) || 0;
            const height = parseFloat(item.h) || 0;
            const realWeight = parseFloat(item.weight) || 0;

            let ldm = 0;
            if (transportVal === 'road' && length > 0 && width > 0) {
                ldm = ((length * width) / 24000) * qty;
            }

            let chargeableWeight = realWeight;
            let volumeCbm = (length * width * height) / 1000000;

            if (transportVal === 'road') {
                chargeableWeight = Math.max(realWeight, volumeCbm * qty * 250);
            } else if (transportVal === 'air') {
                chargeableWeight = Math.max(realWeight, ((length * width * height) / 6000) * qty);
            } else if (transportVal === 'sea') {
                if (loadType.includes("FCL")) chargeableWeight = 0;
                else chargeableWeight = Math.max(realWeight, volumeCbm * qty * 1000);
            }

            totalQty += qty; totalRealWeight += realWeight; 
            totalChargeWeight += chargeableWeight; totalLdm += ldm;

            return { ...item, charge: chargeableWeight.toFixed(2), ldm: ldm.toFixed(2) };
        });

        // Тихо обновляем стейт без создания точки сохранения в истории
        window.appStore.update(null, { cargo: updatedCargo }, false);

        return { totalQty, totalRealWeight, totalChargeWeight, totalLdm, transportVal };
    },

    // --- 2. РАСЧЕТ ДИСТАНЦИИ И БАЗОВОЙ СТАВКИ (ЭТАП 2: ИНТЕГРАЦИЯ OSRM) ---
    calculateRouteAndPrices: async function() {
        const state = window.appStore.getState();
        
        // Проверяем, есть ли координаты у обеих точек маршрута
        const latA = state.route.pickup?.lat;
        const lonA = state.route.pickup?.lon;
        const latB = state.route.delivery?.lat;
        const lonB = state.route.delivery?.lon;

        let distance = state.route.distance || 0;
        let transitDays = "";

        if (latA && lonA && latB && lonB) {
            try {
                // Запрос к бесплатному демо-серверу OSRM (формат: lon,lat;lon,lat)
                const url = `https://router.project-osrm.org/route/v1/driving/${lonA},${latA};${lonB},${latB}?overview=false`;
                const response = await fetch(url);
                const data = await response.json();

                if (data && data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    
                    // OSRM возвращает расстояние в метрах -> переводим в километры
                    distance = Math.round(route.distance / 1000);
                    
                    // OSRM возвращает время в секундах -> переводим в дни (минимально 1 день)
                    const seconds = route.duration;
                    const days = Math.ceil(seconds / 86400); 
                    
                    // Формируем красивую строку для Transit Time в зависимости от языка
                    const lang = state.config.language || 'en';
                    transitDays = lang === 'ru' ? `~${days} дн.` : (lang === 'uk' ? `~${days} дн.` : `~${days} days`);

                    // Записываем новые данные дороги и транзита прямо в State Manager
                    window.appStore.update('route', { distance: distance }, false);
                    window.appStore.update('details', { transitTime: transitDays }, false);
                }
            } catch (err) {
                console.error("Критическая ошибка OSRM маршрутизатора:", err);
            }
        }

        // Пересчитываем весовые характеристики грузов
        const metrics = this.recalculateAllCargoRows();

        // Расчет базовой тарифной ставки (остается на пресетах компании)
        const transportVal = state.config.transport || 'road';
        const loadType = state.conditions.loadType || "Full Load (FTL)";
        let calculatedRate = 0;
        const tmsPricesData = window.tmsPricesData;
        
        if (tmsPricesData) {
            if (transportVal === 'road') {
                if (loadType.includes("LTL")) calculatedRate = tmsPricesData.base_rates.road.ltl_international?.default_rate || 0.50;
                else {
                    const ftlConfig = tmsPricesData.base_rates.road.ftl_international;
                    if (distance > 0 && ftlConfig && ftlConfig.rate_per_km) {
                        calculatedRate = distance * ftlConfig.rate_per_km;
                    } else if (ftlConfig) {
                        calculatedRate = ftlConfig.default_rate || 0.00;
                    }
                }
            } else if (transportVal === 'air') {
                if (loadType.includes("PAX")) calculatedRate = tmsPricesData.base_rates.air.pax?.default_rate || 2.50;
                else calculatedRate = tmsPricesData.base_rates.air.cao?.default_rate || 4.20;
            } else if (transportVal === 'sea') {
                if (loadType.includes("LCL")) calculatedRate = tmsPricesData.base_rates.sea.lcl?.default_rate || 85.00;
                else if (loadType.includes("20'")) calculatedRate = tmsPricesData.base_rates.sea.fcl_20dc?.default_rate || 1800.00;
                else calculatedRate = tmsPricesData.base_rates.sea.fcl_40hc?.default_rate || 2600.00;
            }
        }

        return { finalRate: calculatedRate, transportVal, loadType, totalChargeWeight: metrics.totalChargeWeight };
    },

    // --- 3. ПОЛНЫЙ РЕАКТИВНЫЙ РАСЧЕТ СБОРОВ ---
    recalculateFinances: function() {
        const state = window.appStore.getState();
        const transport = state.config.transport || 'road';
        const rawLoadType = state.conditions.loadType || '';
        const inco = (state.conditions.incotermsCode || 'EXW').toUpperCase();
        const lang = state.config.language || 'en';
        const distance = state.route.distance || 0;
        const tmsPricesData = window.tmsPricesData;
        
        if (!tmsPricesData) return;

        // Фиксируем всё, что менеджер уже успел ввести руками в интерфейсе (чтобы не затереть косты)
        const manualRates = {};
        if (state.services) {
            state.services.forEach(s => {
                manualRates[s.key] = { 
                    carrier_cost: parseFloat(s.carrier_cost || 0), 
                    margin: parseFloat(s.margin || 0),
                    rate: parseFloat(s.rate || 0),
                    qty: parseFloat(s.qty || 1) 
                };
            });
        }

        let transportSubtype = 'ftl_international';
        if (transport === 'road') {
            const dir = state.config.direction || 'export';
            if (dir === 'domestic') transportSubtype = 'ftl_domestic';
            else if (rawLoadType.includes('LTL') || rawLoadType.includes('Partial')) transportSubtype = 'ltl_international';
        } else if (transport === 'air') {
            transportSubtype = rawLoadType.includes('CAO') ? 'cao' : 'pax';
        } else if (transport === 'sea') {
            transportSubtype = rawLoadType.includes('LCL') ? 'lcl' : (rawLoadType.includes("20'") ? 'fcl_20dc' : 'fcl_40hc');
        }

        const newServices = [];
        const omittedServices = [];
        const baseStages = ['vorlauf', 'hauptlauf', 'nachlauf'];
        
        // Стандартный экспедиторский интерес компании по умолчанию (например, 10% маржи)
        const DEFAULT_MARGIN_PCT = 0.10; 

        // 1. Вычисление базовых этапов логистики (Инкотермс)
        baseStages.forEach(stage => {
            const stageData = tmsPricesData.base_rates?.[transport]?.[transportSubtype]?.[stage];
            if (!stageData || !stageData.rules?.[inco]) return;

            const rule = stageData.rules[inco];
            const dict = window.tmsTitleTemplates?.[lang] || {};
            const localizedName = dict[stage] || stageData[`name_${lang}`] || stageData.name_en;

            let carrier_cost = 0;
            let margin = 0;
            let rate = 0;
            let qty = 1;
            let status = rule.status;

            if (status === 'tms_provider') {
                if (manualRates[stage]) {
                    // Если менеджер уже правил эту строку руками, сохраняем его цифры
                    carrier_cost = manualRates[stage].carrier_cost;
                    margin = manualRates[stage].margin;
                    rate = manualRates[stage].rate;
                    qty = manualRates[stage].qty;
                } else {
                    // Иначе — авторасчет пресета на основе OSRM километров
                    if (stage === 'hauptlauf' && transport === 'road' && transportSubtype === 'ftl_international' && stageData.rate_per_km) {
                        carrier_cost = distance * stageData.rate_per_km;
                    } else {
                        carrier_cost = stageData.default_rate || 0;
                    }
                    // Накидываем стандартный процент маржи сверху на себестоимость
                    margin = carrier_cost * DEFAULT_MARGIN_PCT;
                    rate = carrier_cost + margin;
                }
            }

            const amount = status === 'tms_provider' ? (rate * qty) : 0;

            newServices.push({
                key: stage,
                isStage: true,
                name: localizedName,
                carrier_cost: carrier_cost,
                margin: margin,
                rate: rate,
                qty: qty,
                amount: amount,
                status: status
            });

            if (status !== 'tms_provider') {
                const cleanName = localizedName.split('(')[0].trim();
                if (!omittedServices.includes(cleanName)) omittedServices.push(cleanName);
            }
        });

        // 2. Расчет добавленных менеджером дополнительных сборов из каталога
        if (state.services) {
            state.services.forEach(manualSrv => {
                if (manualSrv.isStage) return; // Базовые этапы обработаны выше

                const surchargeConfig = tmsPricesData.surcharges?.[manualSrv.key];
                const rule = surchargeConfig?.rules?.[inco] || { status: 'tms_provider' };
                const localizedName = surchargeConfig ? (surchargeConfig[`name_${lang}`] || surchargeConfig.name_en) : manualSrv.name;
                const status = rule.status;

                let carrier_cost = manualSrv.carrier_cost || 0;
                let margin = manualSrv.margin || 0;
                let rate = manualSrv.rate || 0;
                let qty = manualSrv.qty || 1;

                // Если услуга только что добавлена и пуста, инициализируем дефолтами
                if (!manualRates[manualSrv.key] && surchargeConfig) {
                    carrier_cost = surchargeConfig.default_rate || 0;
                    margin = carrier_cost * DEFAULT_MARGIN_PCT;
                    rate = carrier_cost + margin;
                    qty = surchargeConfig.default_qty || 1;
                }

                const amount = status === 'tms_provider' ? (rate * qty) : 0;

                newServices.push({
                    key: manualSrv.key,
                    isStage: false,
                    name: localizedName,
                    carrier_cost: carrier_cost,
                    margin: margin,
                    rate: rate,
                    qty: qty,
                    amount: amount,
                    status: status
                });

                if (status !== 'tms_provider') {
                    const cleanName = localizedName.split('(')[0].trim();
                    if (!omittedServices.includes(cleanName)) omittedServices.push(cleanName);
                }
            });
        }

        // 3. Расчет общих финансовых итогов по бланку КП
        const grandTotal = newServices.reduce((sum, s) => sum + s.amount, 0);

        // Рассчитываем чистую экспедиторскую маржу со всей сделки для скрытого PnL-учета
        const totalNetProfit = newServices.reduce((sum, s) => sum + (s.status === 'tms_provider' ? (s.margin * s.qty) : 0), 0);

        window.appStore.update(null, {
            services: newServices,
            meta: {
                ...state.meta,
                grandTotalValue: grandTotal.toFixed(2),
                totalNetProfitValue: totalNetProfit.toFixed(2), // Сохраняем чистый заработок
                omittedServices: omittedServices
            }
        }, false);

        this.generateSmartNumber();
    },

    // Фасад для обратной совместимости вызовов
    calculateFinancials: function() {
        this.recalculateFinances();
    },

    // --- 4. ГЕНЕРАТОР СМАРТ-НОМЕРА ---
    generateSmartNumber: function() {
        const state = window.appStore.getState();
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

        const transportVal = state.config.transport || 'road';
        const transportMap = { 'air': 'A', 'sea': 'S', 'road': 'R' };
        const x = transportMap[transportVal] || 'R';

        const directionVal = state.config.direction || 'export';
        const directionMap = { 'export': 'E', 'import': 'I', 'domestic': 'D' };
        const y = directionMap[directionVal] || 'E';

        const fromStr = this._getCitySmartCode(state.route.pickupCity);
        const toStr = this._getCitySmartCode(state.route.deliveryCity);

        const totalCharge = state.cargo.reduce((sum, item) => sum + parseFloat(item.charge || 0), 0);
        const chgWeight = Math.round(totalCharge);

        const smartNumber = `${dateStr}-${x}-${y}-${fromStr}-${toStr}-${chgWeight}KG`;
        
        window.appStore.update('meta', { quoteNumber: smartNumber }, false);
        return smartNumber;
    },

    _getCitySmartCode: function(cityName) {
        if (!cityName) return "XXX";
        const cleanCityName = cityName.split(',')[0].trim();
        
        if (window.tmsCitiesData) {
            const foundCity = window.tmsCitiesData.find(c => 
                c.variants.some(v => v.toLowerCase() === cleanCityName.toLowerCase())
            );
            if (foundCity && foundCity.code) return foundCity.code.toUpperCase();
            if (foundCity && foundCity.name_en) return foundCity.name_en.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
        }

        const latinText = this._transliterateCyrillicToLatin(cleanCityName);
        return latinText.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || "XXX";
    },

    _transliterateCyrillicToLatin: function(text) {
        if (!text) return "";
        const map = {
            'А':'A', 'Б':'B', 'В':'V', 'Г':'G', 'Д':'D', 'Е':'E', 'Ё':'E', 'Ж':'ZH',
            'З':'Z', 'И':'I', 'Й':'Y', 'К':'K', 'Л':'L', 'М':'M', 'Н':'N', 'О':'O',
            'П':'P', 'Р':'R', 'С':'S', 'Т':'T', 'У':'U', 'Ф':'F', 'Х':'KH', 'Ц':'TS',
            'Ч':'CH', 'Ш':'SH', 'Щ':'SHCH', 'Ъ':'', 'Ы':'Y', 'Ь':'', 'Э':'E', 'Ю':'YU', 'Я':'YA',
            'а':'a', 'б':'b', 'в':'v', 'г':'g', 'д':'d', 'е':'e', 'ё':'e', 'ж':'zh',
            'з':'z', 'и':'i', 'й':'y', 'к':'k', 'л':'l', 'м':'m', 'н':'n', 'о':'o',
            'п':'p', 'р':'r', 'с':'s', 'т':'t', 'у':'u', 'ф':'f', 'х':'kh', 'ц':'ts',
            'ч':'ch', 'ш':'sh', 'щ':'shch', 'ъ':'', 'ы':'y', 'ь':'', 'э':'e', 'ю':'yu', 'я':'ya',
            'Є':'YE', 'І':'I', 'Ї':'YI', 'Ґ':'G', 'є':'ye', 'і':'i', 'ї':'yi', 'ґ':'g'
        };
        return text.split('').map(char => map[char] || char).join('');
    }
};

window.Calculator = Calculator;