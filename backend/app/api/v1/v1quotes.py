from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.schemas.quote import QuoteCreate, QuoteResponse, QuoteListResponse
from app.crud import crud_quote
from app.api.dependencies import get_db

router = APIRouter()

@router.post("/", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
async def create_quote(quote_in: QuoteCreate, db: Session = Depends(get_db)):
    """
    Создает новое коммерческое предложение (КП).
    Бэкенд сам рассчитывает LDM, Chargeable Weight и финансовые сборы.
    """
    # Пока нет JWT-авторизации, хардкодим ID менеджера (например, 1)
    # В будущем заменим на: current_user = Depends(get_current_user)
    manager_id = 1 
    
    try:
        quote = crud_quote.create_quote(db=db, quote_in=quote_in, manager_id=manager_id)
        return quote
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка создания КП: {str(e)}")

@router.get("/", response_model=List[QuoteListResponse])
async def list_quotes(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    """
    Возвращает реестр КП для базы данных (облегченная схема).
    """
    quotes = crud_quote.get_quotes_list(db, skip=skip, limit=limit)
    return quotes

@router.get("/{quote_id}", response_model=QuoteResponse)
async def get_quote(quote_id: str, db: Session = Depends(get_db)):
    """
    Возвращает полную информацию о КП, включая грузы и сборы.
    """
    quote = crud_quote.get_quote(db, quote_id=quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Коммерческое предложение не найдено")
    return quote