from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json
import os

from app.core.database import SessionLocal, QuoteDB

app = FastAPI(title="TMS Core API")

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