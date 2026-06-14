from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, date

# Импортируем Enum'ы из нашей модели
from app.models.quote import TransportMode, QuoteStatus

# ==========================================
# 1. СХЕМЫ ГРУЗОВ (CARGO)
# ==========================================

class CargoItemCreate(BaseModel):
    """Схема для получения данных от фронтенда. Только физические параметры."""
    qty: int = Field(..., gt=0, description="Количество мест")
    length_cm: float = Field(..., ge=0)
    width_cm: float = Field(..., ge=0)
    height_cm: float = Field(..., ge=0)
    real_weight_kg: float = Field(..., gt=0)
    stackable: bool = False

class CargoItemResponse(CargoItemCreate):
    """Схема ответа. Добавляются расчетные данные, сгенерированные сервером."""
    id: int
    chargeable_weight: float  # Фронтенд получает уже готовый расчетный вес
    ldm: float                # Фронтенд получает готовые погрузочные метры
    
    model_config = ConfigDict(from_attributes=True)

# ==========================================
# 2. СХЕМЫ УСЛУГ (SERVICES / ФИНАНСЫ)
# ==========================================

class QuoteServiceResponse(BaseModel):
    """
    ВАЖНО: Здесь намеренно отсутствуют поля `carrier_cost` и `margin`.
    Клиент (или скрипты в браузере) увидят только итоговую ставку.
    """
    id: int
    service_key: str
    is_stage: bool
    name: str
    qty: float
    rate: float       # Ставка для клиента
    amount: float     # Итоговая сумма (rate * qty)
    status: str

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# 3. ОСНОВНЫЕ СХЕМЫ КП (QUOTE)
# ==========================================

class QuoteCreate(BaseModel):
    """Входящий запрос на создание КП из браузера."""
    transport_mode: TransportMode
    direction: str
    incoterms: str = Field(..., min_length=3, max_length=3)
    incoterms_place: Optional[str] = None
    load_type: str
    
    client_company: Optional[str] = None
    client_contact: Optional[str] = None
    
    pickup_city: str
    pickup_country: str = Field(..., min_length=2, max_length=2)
    delivery_city: str
    delivery_country: str = Field(..., min_length=2, max_length=2)
    distance_km: int = Field(..., ge=0)

    # Фронтенд присылает только массив сырых габаритов
    cargo_items: List[CargoItemCreate]

class QuoteResponse(QuoteCreate):
    """Полный ответ сервера после создания/загрузки КП."""
    id: str
    status: QuoteStatus
    created_at: datetime
    valid_until: date
    transit_time: Optional[str] = None
    
    grand_total: float
    
    # Заменяем сырые массивы на массивы с ответами сервера
    cargo_items: List[CargoItemResponse]
    services: List[QuoteServiceResponse]
    
    model_config = ConfigDict(from_attributes=True)

class QuoteListResponse(BaseModel):
    """Облегченная схема для реестра (GET /api/v1/quotes/). Выдает только нужное для таблицы."""
    id: str
    status: QuoteStatus
    transport_mode: TransportMode
    client_company: Optional[str]
    pickup_city: str
    delivery_city: str
    created_at: datetime
    grand_total: float

    model_config = ConfigDict(from_attributes=True)