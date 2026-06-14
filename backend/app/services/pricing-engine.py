import json
import math
from typing import List, Dict, Any
from app.schemas.quote import CargoItemCreate
from app.models.quote import TransportMode

class PricingEngine:
    def __init__(self):
        # В реальности здесь будет кэшированная загрузка из локального файла
        # или Redis, чтобы не читать диск при каждом запросе.
        self._prices_db = self._load_prices_mock()
        self.DEFAULT_MARGIN_PCT = 0.10  # 10% стандартная экспедиторская маржа

    def _load_prices_mock(self) -> Dict[str, Any]:
        """Имитация загрузки твоего prices.json"""
        return {
            "base_rates": {
                "road": {
                    "ftl_international": {
                        "hauptlauf": {"rate_per_km": 1.20, "rules": {"FCA": {"status": "tms_provider"}, "EXW": {"status": "tms_provider"}}},
                        "vorlauf": {"default_rate": 150.0, "rules": {"EXW": {"status": "tms_provider"}, "FCA": {"status": "counterparty"}}}
                    }
                }
            }
        }

    def calculate_cargo_metrics(self, items: List[CargoItemCreate], transport: TransportMode) -> List[Dict[str, float]]:
        """Расчет LDM и Chargeable Weight на сервере (защита от махинаций на фронте)"""
        calculated_items = []
        for item in items:
            volume_cbm = (item.length_cm * item.width_cm * item.height_cm) / 1000000
            
            # Расчет LDM (только для Road)
            ldm = 0.0
            if transport == TransportMode.ROAD:
                ldm = ((item.length_cm * item.width_cm) / 24000) * item.qty

            # Определение Chargeable Weight
            chargeable_weight = item.real_weight_kg
            if transport == TransportMode.ROAD:
                chargeable_weight = max(item.real_weight_kg, volume_cbm * item.qty * 250) # 1 cbm = 250 kg
            elif transport == TransportMode.AIR:
                chargeable_weight = max(item.real_weight_kg, volume_cbm * item.qty * 167) # 1 cbm ~ 167 kg (1:6000)
            elif transport == TransportMode.SEA:
                chargeable_weight = max(item.real_weight_kg, volume_cbm * item.qty * 1000) # 1 cbm = 1000 kg

            calculated_items.append({
                "qty": item.qty,
                "stackable": item.stackable,
                "length_cm": item.length_cm,
                "width_cm": item.width_cm,
                "height_cm": item.height_cm,
                "real_weight_kg": item.real_weight_kg,
                "ldm": round(ldm, 2),
                "chargeable_weight": round(chargeable_weight, 2)
            })
        return calculated_items

    def generate_services(self, transport: TransportMode, distance_km: int, incoterms: str) -> List[Dict[str, Any]]:
        """Генерация финансовых строк КП на основе скрытых тарифов и Инкотермс"""
        services = []
        transport_key = transport.value
        
        # Для примера берем только FTL логику. Позже расширишь на LTL/LCL/Air.
        stage_data = self._prices_db["base_rates"].get(transport_key, {}).get("ftl_international", {})
        
        # 1. Hauptlauf (Основной фрахт)
        hl_rule = stage_data.get("hauptlauf", {}).get("rules", {}).get(incoterms.upper())
        if hl_rule:
            carrier_cost = distance_km * stage_data["hauptlauf"]["rate_per_km"] if distance_km > 0 else 0
            margin = carrier_cost * self.DEFAULT_MARGIN_PCT
            rate = carrier_cost + margin
            
            services.append({
                "service_key": "hauptlauf",
                "is_stage": True,
                "name": "Main Carriage / Hauptlauf",
                "qty": 1.0,
                "carrier_cost": carrier_cost,
                "margin": margin,
                "rate": round(rate, 2),
                "amount": round(rate, 2),
                "status": hl_rule["status"]
            })

        # 2. Vorlauf (Пре-кэрридж) - проверяем по Инкотермс
        vl_rule = stage_data.get("vorlauf", {}).get("rules", {}).get(incoterms.upper())
        if vl_rule:
            carrier_cost = stage_data["vorlauf"]["default_rate"] if vl_rule["status"] == "tms_provider" else 0
            margin = carrier_cost * self.DEFAULT_MARGIN_PCT
            rate = carrier_cost + margin
            
            services.append({
                "service_key": "vorlauf",
                "is_stage": True,
                "name": "Pre-carriage / Vorlauf",
                "qty": 1.0,
                "carrier_cost": carrier_cost,
                "margin": margin,
                "rate": round(rate, 2),
                "amount": round(rate, 2),
                "status": vl_rule["status"]
            })

        return services

pricing_engine = PricingEngine()