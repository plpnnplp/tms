/**
 * TMS CORE: Parser Engine
 * Ответственность: Извлечение данных из сырого текста запроса.
 * Отдает данные строго в формате структуры AppStore.
 */

import { api } from './api.js';

export const ParserEngine = {
   async parse(rawText) {
        // Очищаем текст для анализа
        let textForGeo = rawText.replace(/[\r\n]+/g, ' ').trim();
        const textLow = textForGeo.toLowerCase();
        
        // 1. Сразу вырезаем коммерческие условия и параметры груза, чтобы остался только чистый маршрут
        const incotermsCode = this._parseIncoterms(textLow);
        const transportMode = this._determineTransport(textLow);
        
        // Убираем из строки цифры, размеры (120х80х160), кг, коробки, паллеты и инкотермс
        let cleanRouteStr = textForGeo
            .replace(/\d+\s*[xх*×]\s*\d+\s*[xх*×]\s*\d+/gi, '') // размеры
            .replace(/\d+\s*(кг|kg|т|t|коробок|boxes|палле?т|plts|pcs|шт)/gi, '') // вес и кол-во (одна или две 'л')
            .replace(new RegExp(incotermsCode, 'gi'), '') // Инкотермс
            .replace(/(авиа|air|море|sea|fcl|road|авто|автофрахт)/gi, '') // транспорт
            .replace(/[^a-zA-Zа-яА-ЯёЁ\s-,\.]/g, ' ') 
            .replace(/\s+/g, ' ')
            .trim();

        // 2. Делим оставшуюся строку на потенциальные локации (обычно это первые два крупных слова/фразы)
        // Ищем слова с большой буквы или просто разделенные пробелами/знаками локации
        let potentialCities = cleanRouteStr.split(/(?:\s*[-–—]\s*|\s+(?:в|из|до)\s+|\s+)/).filter(w => w && w.trim().length > 2);        
        
        // Если у нас составной город (например, "Белая Церковь"), склеим первые два слова, 
        // если они не являются предлогами, или доверимся базовому разделению.
        // Но надежнее — взять первую половину строки как Старт, вторую как Финиш.
        let pickupRaw = "";
        let deliveryRaw = "";
        
        if (potentialCities.length >= 3) {
            // Кейс для составных названий типа "Белая Церковь Мюнхен"
            // Если первое слово + второе слово дают локацию, Photon это поймет.
            // Нам нужно аккуратно разделить строку пополам или по смысловым границам.
            const mid = Math.ceil(potentialCities.length / 2);
            pickupRaw = potentialCities.slice(0, mid).join(' ');
            deliveryRaw = potentialCities.slice(mid).join(' ');
        } else {
            pickupRaw = potentialCities[0] || "";
            deliveryRaw = potentialCities[1] || "";
        }

        console.log("-> Результат грубой очистки маршрута:", { pickupRaw, deliveryRaw });

        let loadType = 'Full Load (FTL)';
        if (transportMode === 'air') loadType = 'Passenger Aircraft (PAX)';
        if (transportMode === 'sea') loadType = 'Less Container Load (LCL)';

        // 3. Асинхронные фоновые запросы к Photon API — теперь они ищут ВСЁ, что есть на картах мира
        const geoPickup = pickupRaw ? await this._fetchGeoData(pickupRaw) : null;
        const geoDelivery = deliveryRaw ? await this._fetchGeoData(deliveryRaw) : null;

        const cleanPickupName = geoPickup ? geoPickup.name : pickupRaw;
        const cleanDeliveryName = geoDelivery ? geoDelivery.name : deliveryRaw;

        // 4. Умное определение места для Инкотермс
        let incotermsPlace = "";
        const originTerms = ['EXW', 'FCA', 'FAS', 'FOB'];
        const destTerms = ['CPT', 'CIP', 'CFR', 'CIF', 'DAP', 'DPU', 'DDP'];

        if (originTerms.includes(incotermsCode)) {
            incotermsPlace = cleanPickupName.split(',')[0].trim();
        } else if (destTerms.includes(incotermsCode)) {
            incotermsPlace = cleanDeliveryName.split(',')[0].trim();
        }

        // 5. Формируем массив грузов
        const cargoRows = this._parseCargo(textLow).map(c => ({
            id: Math.random().toString(36).substr(2, 9),
            qty: c.qty || 1, stack: 'Да / Yes',
            l: c.l || 120, w: c.w || 80, h: c.h || 160,
            weight: c.weight || 0, charge: "0.00", ldm: "0.00"
        }));

        return {
           route: {
                pickup: {
                    rawText: pickupRaw,
                    cleanCity: cleanPickupName,
                    countryCode: geoPickup ? geoPickup.countryCode : '',
                    lat: geoPickup ? geoPickup.lat : null,
                    lon: geoPickup ? geoPickup.lon : null,
                    localNames: geoPickup ? geoPickup.localNames : { en: pickupRaw, ru: pickupRaw, uk: pickupRaw, de: pickupRaw },
                    address: ''
                },
                delivery: {
                    rawText: deliveryRaw,
                    cleanCity: cleanDeliveryName,
                    countryCode: geoDelivery ? geoDelivery.countryCode : '',
                    lat: geoDelivery ? geoDelivery.lat : null,
                    lon: geoDelivery ? geoDelivery.lon : null,
                    localNames: geoDelivery ? geoDelivery.localNames : { en: deliveryRaw, ru: deliveryRaw, uk: deliveryRaw, de: deliveryRaw },
                    address: ''
                },
                distance: 0
            },
            config: { transport: transportMode },
            conditions: { 
                incotermsCode: incotermsCode, 
                incotermsPlace: incotermsPlace, 
                loadType: loadType 
            },
            cargo: cargoRows
        };
    },

    // Продвинутый гео-поиск Photon с приоритетом глобальной важности (importance)
    async _fetchGeoData(cityName, lang = 'en') {
        try {
            let photonLang = lang === 'uk' ? 'ru' : lang;
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(cityName)}&limit=10&lang=${photonLang}&lon=9.99&lat=53.55`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data && data.features && data.features.length > 0) {
                
                // ИСПРАВЛЕНИЕ 1: Сортировка. Главный вес — importance (Берлин > Берлин, деревня)
                data.features.sort((a, b) => {
                    const impA = a.properties.importance || 0;
                    const impB = b.properties.importance || 0;
                    
                    // Если разница в весе значительная, глобальный хаб сразу побеждает
                    if (Math.abs(impA - impB) > 0.05) return impB - impA;

                    // Если вес одинаковый, смотрим на административный статус
                    const typeA = a.properties.osm_value || '';
                    const typeB = b.properties.osm_value || '';
                    const getScore = (val) => (['city', 'administrative', 'capital'].includes(val) ? 3 : (val === 'town' ? 2 : 0));
                    return getScore(typeB) - getScore(typeA);
                });

                let feature = data.features[0];
                const props = feature.properties;
                const coords = feature.geometry.coordinates;
                
                const enName = props['name:en'] || props.name;
                const ruName = props['name:ru'] || props.name;
                const deName = props['name:de'] || props['name:en'] || props.name;
                const ukName = props['name:uk'] || props['name:ru'] || props.name;

                const getFullName = (n, c) => c ? `${n}, ${c}` : n;
                
                return {
                    name: getFullName(props.name, props.country),
                    lat: coords[1],
                    lon: coords[0],
                    countryCode: (props.countrycode || '').toUpperCase(),
                    localNames: {
                        en: getFullName(enName, props.country),
                        ru: getFullName(ruName, props.country),
                        uk: getFullName(ukName, props.country),
                        de: getFullName(deName, props.country)
                    }
                };
            }
        } catch (err) {
            console.error("Ошибка гео-поиска:", err);
        }
        return null;
    },

    _findCity(text, db, order) {
        let found = [];
        db.forEach(cityObj => {
            cityObj.variants.forEach(variant => {
                const v = variant.toLowerCase().trim();
                if (text.includes(v)) {
                    found.push({ name: cityObj.name, index: text.indexOf(v) });
                }
            });
        });
        found.sort((a, b) => a.index - b.index);
        const unique = [...new Set(found.map(i => i.name))];
        return unique[order] || "";
    },

    _parseCargo(text) {
        const rows = [];
        const dimRegex = /(\d+)\s*(?:на|[xх*×])\s*(\d+)\s*(?:на|[xх*×])\s*(\d+)/gi;
        const qtyMatch = text.match(/(\d+)\s*(?:палле?т|коробок|boxes|шт|pcs)/i);
        const globalQty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

        // Ищем вес ОДИН РАЗ глобально для всего текста запроса, чтобы привязать к строкам груза
        const weightMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)/i);
        const parsedWeight = weightMatch ? Math.round(parseFloat(weightMatch[1].replace(',', '.'))) : 0;

        let match;
        while ((match = dimRegex.exec(text)) !== null) {
            rows.push({ 
                qty: globalQty, 
                l: parseInt(match[1]), 
                w: parseInt(match[2]), 
                h: parseInt(match[3]), 
                weight: parsedWeight // Теперь вес корректно пишется в строку вместе с габаритами
            });
        }

        if (rows.length === 0) {
            rows.push({ 
                qty: globalQty, l: 0, w: 0, h: 0, 
                weight: parsedWeight 
            });
        }
        return rows;
    },

    _parseIncoterms(text) {
        const incotermsList = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DDP'];
        for (let code of incotermsList) {
            if (text.toUpperCase().includes(code)) return code;
        }
        return "FCA";
    },

    _determineTransport(text) {
        if (text.includes('авиа') || text.includes('air')) return 'air';
        if (text.includes('море') || text.includes('sea') || text.includes('fcl')) return 'sea';
        return 'road';
    }
};