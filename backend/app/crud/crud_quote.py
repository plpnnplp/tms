from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.quote import Quote, CargoItem, QuoteService, QuoteStatus
from app.schemas.quote import QuoteCreate
from app.services.pricing_engine import pricing_engine

def generate_smart_quote_number(db: Session, transport: str, direction: str, pickup: str, delivery: str) -> str:
    """Генерация формата 20260613-R-E-HAM-KIE"""
    date_str = datetime.utcnow().strftime("%Y%m%d")
    t_code = transport[0].upper()
    d_code = direction[0].upper()
    p_code = pickup[:3].upper()
    d_code_city = delivery[:3].upper()
    
    base_num = f"{date_str}-{t_code}-{d_code}-{p_code}-{d_code_city}"
    # Здесь можно добавить логику проверки дубликатов и добавления суффикса -01
    return base_num

def create_quote(db: Session, quote_in: QuoteCreate, manager_id: int) -> Quote:
    # 1. Генерация номера
    quote_id = generate_smart_quote_number(
        db, quote_in.transport_mode.value, quote_in.direction, 
        quote_in.pickup_city, quote_in.delivery_city
    )
    
    # 2. Вычисление сроков действия (Авто - 14 дней, Авиа - 3 дня, Море - 30 дней)
    validity_days = 14 if quote_in.transport_mode.value == 'road' else (3 if quote_in.transport_mode.value == 'air' else 30)
    valid_until = datetime.utcnow().date() + timedelta(days=validity_days)

    # 3. Базовая инициализация КП
    db_quote = Quote(
        id=quote_id,
        status=QuoteStatus.DRAFT,
        transport_mode=quote_in.transport_mode,
        direction=quote_in.direction,
        incoterms=quote_in.incoterms.upper(),
        incoterms_place=quote_in.incoterms_place,
        load_type=quote_in.load_type,
        client_company=quote_in.client_company,
        client_contact=quote_in.client_contact,
        pickup_city=quote_in.pickup_city,
        pickup_country=quote_in.pickup_country.upper(),
        delivery_city=quote_in.delivery_city,
        delivery_country=quote_in.delivery_country.upper(),
        distance_km=quote_in.distance_km,
        valid_until=valid_until,
        manager_id=manager_id
    )
    db.add(db_quote)
    db.flush() # Получаем ID для связей, не коммитя транзакцию

    # 4. Расчет и запись грузов (через PricingEngine)
    calculated_cargo = pricing_engine.calculate_cargo_metrics(quote_in.cargo_items, quote_in.transport_mode)
    for c_data in calculated_cargo:
        db_cargo = CargoItem(quote_id=db_quote.id, **c_data)
        db.add(db_cargo)

    # 5. Расчет и запись услуг/финансов (через PricingEngine)
    calculated_services = pricing_engine.generate_services(
        transport=quote_in.transport_mode,
        distance_km=quote_in.distance_km,
        incoterms=quote_in.incoterms
    )
    
    grand_total = 0.0
    net_profit = 0.0
    
    for s_data in calculated_services:
        db_service = QuoteService(quote_id=db_quote.id, **s_data)
        db.add(db_service)
        if s_data["status"] == "tms_provider":
            grand_total += s_data["amount"]
            net_profit += (s_data["margin"] * s_data["qty"])

    # 6. Обновление финальных итогов
    db_quote.grand_total = grand_total
    db_quote.net_profit = net_profit

    db.commit()
    db.refresh(db_quote)
    
    return db_quote

def get_quote(db: Session, quote_id: str) -> Quote:
    return db.execute(select(Quote).where(Quote.id == quote_id)).scalar_one_or_none()

def get_quotes_list(db: Session, skip: int = 0, limit: int = 50) -> list[Quote]:
    return db.execute(
        select(Quote)
        .order_by(Quote.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).scalars().all()