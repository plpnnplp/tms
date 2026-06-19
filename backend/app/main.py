from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import List, Optional
import json
import os

from app.core.database import SessionLocal, QuoteDB, CounterpartyDB, ContactDB

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

class QuoteCreatePayload(BaseModel):
    quote_id: str
    data: dict

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

# --- СХЕМЫ КОНТРАГЕНТОВ ---
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

# --- ЭНДПОИНТЫ КОНТРАГЕНТОВ ---
from sqlalchemy.orm import joinedload

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
        
    # Превращаем схему в словарь и вытаскиваем контакты
    data_dict = cp.model_dump()
    contacts_data = data_dict.pop("contacts", [])
    
    # 1. Обновляем основные поля компании
    for key, value in data_dict.items():
        setattr(db_cp, key, value)
        
    try:
        # 2. Удаляем старые связанные контакты из базы
        db.query(ContactDB).filter(ContactDB.counterparty_id == cp_id).delete()
        
        # 3. Записываем обновленный список контактов
        for c_data in contacts_data:
            # Явно передаем counterparty_id, чтобы SQLAlchemy не терял связь
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

# --- ЭНДПОИНТЫ РАБОТЫ С КОММЕРЧЕСКИМИ ПРЕДЛОЖЕНИЯМИ ---

@app.post("/api/quotes", status_code=201)
def save_quote(payload: QuoteCreatePayload, db: Session = Depends(get_db)):
    """Сохранение или обновление коммерческого предложения"""
    existing_quote = db.query(QuoteDB).filter(QuoteDB.id == payload.quote_id).first()
    data_str = json.dumps(payload.data, ensure_ascii=False)
    
    if existing_quote:
        existing_quote.data = data_str
        # При изменении сбрасываем статус обратно в draft (черновик)
        existing_quote.status = "draft" 
    else:
        # Новые КП создаются строго со статусом "draft"
        new_quote = QuoteDB(id=payload.quote_id, data=data_str, status="draft")
        db.add(new_quote)
        
    db.commit()
    return {"message": "Успешно сохранено", "quote_id": payload.quote_id}

@app.get("/api/quotes")
def get_all_quotes(db: Session = Depends(get_db)):
    """Выгрузка всех КП для реестра (QuotesDatabase.html)"""
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

@app.put("/api/quotes/{quote_id}/status")
def update_quote_status(quote_id: str, status_payload: dict, db: Session = Depends(get_db)):
    """Изменение статуса (Won/Lost/Sent) из реестра"""
    new_status = status_payload.get("status")
    quote = db.query(QuoteDB).filter(QuoteDB.id == quote_id).first()
    
    if not quote:
        raise HTTPException(status_code=404, detail="КП не найдено")
        
    quote.status = new_status
    db.commit()
    return {"message": "Статус updated успешно", "new_status": new_status}

@app.delete("/api/quotes/{quote_id}")
def delete_quote(quote_id: str, db: Session = Depends(get_db)):
    """Удаление КП из базы"""
    quote = db.query(QuoteDB).filter(QuoteDB.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="КП не найдено")
        
    db.delete(quote)
    db.commit()
    return {"message": f"КП {quote_id} удалено"}