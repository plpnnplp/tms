from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import List, Optional
import json
import os
import datetime

from app.core.database import SessionLocal, QuoteDB, CounterpartyDB, ContactDB, ActiveBookingDB, OrderCounterDB

app = FastAPI(title="TMS Core API")

# --- PYDANTIC СХЕМЫ ---
class ContactSchema(BaseModel):
    position: str = ""
    salutation: str = ""
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""
    tg_nick: str = ""
    has_telegram: bool = False
    has_whatsapp: bool = False
    has_viber: bool = False

class CounterpartySchema(BaseModel):
    name: str
    name_extra: str = ""
    short_name: str = ""
    street: str = ""
    house_no: str = ""
    office_no: str = ""
    postal_code: str = ""
    city: str = ""
    region: str = ""
    country: str = ""
    country_iso: str = ""
    country_en: str = ""
    is_client_sender: bool = False
    is_client_receiver: bool = False
    is_carrier: bool = False
    is_agent: bool = False
    tax_number: str = ""
    vat_id: str = ""
    eori_number: str = ""
    language: str = "en"
    currency: str = "EUR"
    credit_limit: float = 0.0
    payment_terms: str = ""
    contacts: List[ContactSchema] = []

class QuoteCreatePayload(BaseModel):
    quote_id: str
    data: dict

class QuoteStatusUpdate(BaseModel):
    status: str

class ContactCreate(BaseModel):
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""

class CounterpartyCreate(BaseModel):
    name: str
    short_name: str = ""
    role: str = "client"
    country: str = ""
    payment_terms: str = ""
    contacts: List[ContactCreate] = []

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- БАЗОВЫЕ ЭНДПОИНТЫ И СПРАВОЧНИКИ ---
@app.get("/")
def read_root():
    return {
        "status": "online", 
        "system": "TMS Core API",
        "docs": "Go to /docs to see the interactive API documentation"
    }

@app.get("/api/prices")
def get_prices():
    file_path = os.path.join(os.path.dirname(__file__), "../prices.json")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="prices.json не найден на сервере")

@app.get("/api/cities")
def get_cities():
    file_path = os.path.join(os.path.dirname(__file__), "../cities.json")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="cities.json не найден")


# --- ЭНДПОИНТЫ КОНТРАГЕНТОВ ---
@app.post("/api/counterparties", status_code=201)
def create_counterparty(cp: CounterpartySchema, db: Session = Depends(get_db)):
    data_dict = cp.model_dump()
    contacts_data = data_dict.pop("contacts", [])
    
    new_cp = CounterpartyDB(**data_dict)
    db.add(new_cp)
    db.commit()
    db.refresh(new_cp)
    
    for c_data in contacts_data:
        db.add(ContactDB(**c_data, counterparty_id=new_cp.id))
    db.commit()
    return {"status": "created", "id": new_cp.id}

@app.get("/api/counterparties")
def get_counterparties(db: Session = Depends(get_db)):
    results = db.query(CounterpartyDB).options(joinedload(CounterpartyDB.contacts)).order_by(CounterpartyDB.name).all()
    return results

@app.get("/api/counterparties/search")
def search_counterparties(q: str, db: Session = Depends(get_db)):
    if len(q) < 2: return []
    results = db.query(CounterpartyDB).options(joinedload(CounterpartyDB.contacts)).filter(
        (CounterpartyDB.name.ilike(f"%{q}%")) | (CounterpartyDB.short_name.ilike(f"%{q}%"))
    ).limit(10).all()
    
    return [{
        "id": c.id, "name": c.name, "country": c.country, "payment_terms": c.payment_terms,
        "contacts": [{"first_name": cont.first_name, "last_name": cont.last_name, "email": cont.email, "phone": cont.phone} for cont in c.contacts]
    } for c in results]

@app.get("/api/counterparties/{cp_id}")
def get_counterparty_by_id(cp_id: int, db: Session = Depends(get_db)):
    return db.query(CounterpartyDB).options(joinedload(CounterpartyDB.contacts)).filter(CounterpartyDB.id == cp_id).first()

@app.put("/api/counterparties/{cp_id}")
def update_counterparty(cp_id: int, cp: CounterpartySchema, db: Session = Depends(get_db)):
    db_cp = db.query(CounterpartyDB).filter(CounterpartyDB.id == cp_id).first()
    if not db_cp:
        return {"status": "error", "message": "Counterparty not found"}
        
    data_dict = cp.model_dump()
    contacts_data = data_dict.pop("contacts", [])
    
    for key, value in data_dict.items():
        setattr(db_cp, key, value)
        
    try:
        db.query(ContactDB).filter(ContactDB.counterparty_id == cp_id).delete()
        for c_data in contacts_data:
            new_contact = ContactDB(**c_data, counterparty_id=cp_id)
            db.add(new_contact)
            
        db.commit()
        db.refresh(db_cp)
        return {"status": "updated", "id": cp_id}
        
    except Exception as e:
        db.rollback()
        print(f"❌ [TMS CRITICAL ERROR] Сбой при PUT обновлении: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
    
@app.delete("/api/counterparties/{cp_id}")
def delete_counterparty(cp_id: int, db: Session = Depends(get_db)):
    db.query(CounterpartyDB).filter(CounterpartyDB.id == cp_id).delete()
    db.commit()
    return {"status": "deleted"}


# --- ЭНДПОИНТЫ КОММЕРЧЕСКИХ ПРЕДЛОЖЕНИЙ ---
@app.post("/api/quotes", status_code=201)
def save_quote(payload: QuoteCreatePayload, db: Session = Depends(get_db)):
    existing_quote = db.query(QuoteDB).filter(QuoteDB.id == payload.quote_id).first()
    data_str = json.dumps(payload.data, ensure_ascii=False)
    
    if existing_quote:
        existing_quote.data = data_str
        existing_quote.status = "draft" 
    else:
        new_quote = QuoteDB(id=payload.quote_id, data=data_str, status="draft")
        db.add(new_quote)
        
    db.commit()
    return {"message": "Успешно сохранено", "quote_id": payload.quote_id}

@app.get("/api/quotes")
def get_all_quotes(db: Session = Depends(get_db)):
    quotes = db.query(QuoteDB).order_by(QuoteDB.created_at.desc()).all()
    result = []
    for q in quotes:
        result.append({
            "id": q.id,
            "status": q.status,
            "createdAt": q.created_at.isoformat(),
            "data": json.loads(q.data) if q.data else {} 
        })
    return result

@app.delete("/api/quotes/{quote_id}")
def delete_quote(quote_id: str, db: Session = Depends(get_db)):
    quote = db.query(QuoteDB).filter(QuoteDB.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="КП не найдено")
        
    db.delete(quote)
    db.commit()
    return {"message": f"КП {quote_id} удалено"}

@app.put("/api/quotes/{quote_id}/status")
def update_quote_status(quote_id: str, payload: QuoteStatusUpdate, db: Session = Depends(get_db)):
    """Изменение статуса КП и АВТО-ТРИГГЕР создания заказа (Бронебойный парсинг)"""
    import json
    
    quote = db.query(QuoteDB).filter(QuoteDB.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="КП не найдено")
        
    old_status = quote.status
    quote.status = payload.status
    
    if payload.status == "accepted" and old_status != "accepted":
        existing_booking = db.query(ActiveBookingDB).filter(ActiveBookingDB.quote_id == quote_id).first()
        
        if not existing_booking:
            # 1. Глубокая распаковка JSON (защита от двойного stringify фронтенда)
            q_data = quote.data
            try:
                for _ in range(3):
                    if isinstance(q_data, str):
                        q_data = json.loads(q_data)
                    else:
                        break
                if not isinstance(q_data, dict):
                    q_data = {}
            except Exception:
                q_data = {}
                
            def safe_float(val):
                try: return float(val) if val else 0.0
                except (ValueError, TypeError): return 0.0
                    
            def safe_int(val):
                try: return int(val) if val else 0
                except (ValueError, TypeError): return 0

            # 2. Безопасное извлечение блоков
            config_data = q_data.get("config") if isinstance(q_data.get("config"), dict) else {}
            details = q_data.get("details") if isinstance(q_data.get("details"), dict) else {}
            route = q_data.get("route") if isinstance(q_data.get("route"), dict) else {}
            pickup = route.get("pickup") if isinstance(route.get("pickup"), dict) else {}
            delivery = route.get("delivery") if isinstance(route.get("delivery"), dict) else {}
            meta = q_data.get("meta") if isinstance(q_data.get("meta"), dict) else {}
            
            # 3. Обработка грузов (массив или объект)
            cargo_data = q_data.get("cargo")
            total_pkg = 0
            total_gw = 0.0
            total_cw = 0.0
            total_ldm = 0.0
            
            if isinstance(cargo_data, list):
                for item in cargo_data:
                    if isinstance(item, dict):
                        total_pkg += safe_int(item.get("packages"))
                        total_gw += safe_float(item.get("weight"))
                        total_cw += safe_float(item.get("chargeableWeight"))
                        total_ldm += safe_float(item.get("ldm"))
            elif isinstance(cargo_data, dict):
                total_pkg = safe_int(cargo_data.get("packages"))
                total_gw = safe_float(cargo_data.get("weight"))
                total_cw = safe_float(cargo_data.get("chargeableWeight"))
                total_ldm = safe_float(cargo_data.get("ldm"))

            # 4. Жесткое чтение транспорта и направления без пробелов
            t_val = config_data.get("transport") or details.get("transport") or "road"
            t_mode = str(t_val).strip().lower()
            
            dir_val = config_data.get("direction") or details.get("direction") or "export"
            direction = str(dir_val).strip().lower()
            
            t_letter = "A" if "air" in t_mode else ("S" if "sea" in t_mode else "R")
            d_letter = "I" if "import" in direction else ("D" if "domestic" in direction else "E")
            prefix = f"{t_letter}{d_letter}"
            
            current_year = datetime.datetime.now().year
            
            try:
                # 5. Блокировка счетчика номеров
                counter = db.query(OrderCounterDB).filter(
                    OrderCounterDB.prefix == prefix,
                    OrderCounterDB.current_year == current_year
                ).with_for_update().first()
                
                if not counter:
                    counter = OrderCounterDB(prefix=prefix, current_year=current_year, last_value=0)
                    db.add(counter)
                    db.flush()
                
                counter.last_value += 1
                year_str = str(current_year)[-2:]
                order_number = f"{prefix}-{year_str}{counter.last_value:05d}"
                
                origin_c = pickup.get("cleanCity") or "—"
                dest_c = delivery.get("cleanCity") or "—"
                
                # 6. Запись в БД
                booking = ActiveBookingDB(
                    order_number=order_number,
                    quote_id=quote.id,
                    transport_type=t_mode,
                    status="active",
                    bill_to_name=details.get("clientCompany") or "—",
                    origin_city=origin_c.split(",")[0] if origin_c != "—" else "—",
                    destination_city=dest_c.split(",")[0] if dest_c != "—" else "—",
                    packages_count=total_pkg,
                    gross_weight_kg=total_gw,
                    chargeable_weight_kg=total_cw,
                    ldm=total_ldm,
                    quote_price=safe_float(meta.get("grandTotalValue")),
                    actual_price=safe_float(meta.get("grandTotalValue")),
                    costs=safe_float(meta.get("totalCostValue"))
                )
                db.add(booking)
                print(f"✅ [TMS TRIGGER] Успешно сгенерирован заказ {order_number} из КП {quote_id} (Транспорт: {t_mode})")
                
            except Exception as e:
                db.rollback()
                print(f"❌ [TMS CRITICAL] Ошибка авто-генерации: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Сбой парсинга при генерации: {str(e)}")

    db.commit()
    return {"status": "success", "new_status": quote.status}

# --- ЭНДПОИНТЫ ЗАКАЗОВ (BOOKINGS) ---
@app.get("/api/bookings")
def get_all_bookings(db: Session = Depends(get_db)):
    try:
        bookings = db.query(ActiveBookingDB).order_by(ActiveBookingDB.created_at.desc()).all()
        return bookings
    except Exception as e:
        print(f"❌ [TMS ERROR] Ошибка загрузки списка заказов: {str(e)}")
        raise HTTPException(status_code=500, detail="Не удалось получить список заказов")

@app.post("/api/quotes/{quote_id}/accept")
def accept_quote_to_booking(quote_id: str, prefix: str, db: Session = Depends(get_db)):
    """Кнопка явного перевода КП в Заказ из UI (если не используется статус-дропдаун)"""
    quote = db.query(QuoteDB).filter(QuoteDB.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="КП не найдено")
    
    if quote.status == "accepted":
        raise HTTPException(status_code=400, detail="Это КП уже переведено в заказ")

    try:
        q_data = json.loads(quote.data) if quote.data else {}
    except Exception:
        q_data = {}
        
    details = q_data.get("details", {})
    cargo = q_data.get("cargo", {})
    route = q_data.get("route", {})
    pickup = route.get("pickup", {})
    delivery = route.get("delivery", {})
    
    current_year = datetime.datetime.now().year
    
    try:
        counter = db.query(OrderCounterDB).filter(
            OrderCounterDB.prefix == prefix,
            OrderCounterDB.current_year == current_year
        ).with_for_update().first()
        
        if not counter:
            counter = OrderCounterDB(prefix=prefix, current_year=current_year, last_value=0)
            db.add(counter)
            db.flush()
        
        counter.last_value += 1
        year_str = str(current_year)[-2:] 
        order_number = f"{prefix}-{year_str}{counter.last_value:05d}"
        
        booking = ActiveBookingDB(
            order_number=order_number,
            quote_id=quote.id,
            transport_type=prefix.lower()[:3],
            status="active",
            bill_to_name=details.get("clientCompany", "—"),
            origin_city=pickup.get("cleanCity", "—").split(",")[0] if pickup.get("cleanCity") else "—",
            destination_city=delivery.get("cleanCity", "—").split(",")[0] if delivery.get("cleanCity") else "—",
            packages_count=int(cargo.get("packages", 0) or 0),
            gross_weight_kg=float(cargo.get("weight", 0.0) or 0.0),
            chargeable_weight_kg=float(cargo.get("chargeableWeight", 0.0) or 0.0),
            ldm=float(cargo.get("ldm", 0.0) or 0.0),
            quote_price=float(q_data.get("meta", {}).get("grandTotalValue", 0.0) or 0.0),
            actual_price=float(q_data.get("meta", {}).get("grandTotalValue", 0.0) or 0.0),
            costs=float(q_data.get("meta", {}).get("totalCostValue", 0.0) or 0.0)
        )
        db.add(booking)
        
        quote.status = "accepted"
        
        db.commit()
        return {"status": "success", "order_number": order_number}
        
    except Exception as e:
        db.rollback()
        print(f"❌ [TMS CRITICAL] Ошибка генерации заказа: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка генерации: {str(e)}")
    
@app.delete("/api/bookings/{order_number}")
def delete_booking(order_number: str, db: Session = Depends(get_db)):
    """Безвозвратное удаление оперативного заказа из базы"""
    booking = db.query(ActiveBookingDB).filter(ActiveBookingDB.order_number == order_number).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Заказ не найден")
        
    try:
        db.delete(booking)
        db.commit()
        print(f"🗑️ [TMS] Заказ {order_number} безвозвратно удален")
        return {"status": "success", "message": f"Заказ {order_number} удален"}
    except Exception as e:
        db.rollback()
        print(f"❌ [TMS CRITICAL] Ошибка удаления заказа {order_number}: {str(e)}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка при удалении")