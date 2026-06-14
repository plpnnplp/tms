import enum
from datetime import datetime, date
from typing import List, Optional

from sqlalchemy import String, Float, Integer, ForeignKey, Boolean, Enum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

# --- ENUMS (Справочники состояний) ---
class RoleEnum(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    CLIENT = "client"

class QuoteStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    EXPIRED = "expired"

class TransportMode(str, enum.Enum):
    ROAD = "road"
    AIR = "air"
    SEA = "sea"

# --- ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ (Задел под JWT) ---
class User(Base):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    hashed_password: Mapped[str]
    role: Mapped[RoleEnum] = mapped_column(default=RoleEnum.MANAGER)
    
    # Менеджер может иметь множество выставленных КП
    quotes: Mapped[List["Quote"]] = relationship(back_populates="manager")

# --- ОСНОВНАЯ ТАБЛИЦА КП (QUOTES) ---
class Quote(Base):
    __tablename__ = "quotes"
    
    # Серверная генерация умного номера: e.g., 20260613-R-E-HAM-KIE
    id: Mapped[str] = mapped_column(String(50), primary_key=True) 
    status: Mapped[QuoteStatus] = mapped_column(default=QuoteStatus.DRAFT, index=True)
    transport_mode: Mapped[TransportMode]
    direction: Mapped[str]              # import, export, domestic
    incoterms: Mapped[str] = mapped_column(String(3)) # EXW, FCA, DAP...
    incoterms_place: Mapped[Optional[str]]
    load_type: Mapped[str]              # FTL, LTL, LCL, FCL

    # Клиент (пока денормализовано текстом, в будущем можно вынести в таблицу Clients)
    client_company: Mapped[Optional[str]]
    client_contact: Mapped[Optional[str]]

    # Маршрут
    pickup_city: Mapped[str]
    pickup_country: Mapped[str(2)]      # Код страны для определения тарифа
    delivery_city: Mapped[str]
    delivery_country: Mapped[str(2)]
    distance_km: Mapped[int]            # Рассчитывается на сервере через OSRM
    transit_time: Mapped[Optional[str]]

    # Метаданные и сроки
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    valid_until: Mapped[date]           # Сервер сам задает +3/14/30 дней в зависимости от транспорта

    # Итоги (кэшируются для быстрого вывода в реестре)
    grand_total: Mapped[float] = mapped_column(default=0.0)
    net_profit: Mapped[float] = mapped_column(default=0.0)

    # Связи
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    manager: Mapped["User"] = relationship(back_populates="quotes")
    
    # Каскадное удаление: удаляем КП -> удаляются грузы и услуги
    cargo_items: Mapped[List["CargoItem"]] = relationship(back_populates="quote", cascade="all, delete-orphan")
    services: Mapped[List["QuoteService"]] = relationship(back_populates="quote", cascade="all, delete-orphan")

# --- ТАБЛИЦА ГРУЗОВ (CARGO) ---
class CargoItem(Base):
    __tablename__ = "cargo_items"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    quote_id: Mapped[str] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"))
    
    qty: Mapped[int]
    stackable: Mapped[bool] = mapped_column(default=False)
    length_cm: Mapped[float]
    width_cm: Mapped[float]
    height_cm: Mapped[float]
    real_weight_kg: Mapped[float]

    # Вычисляется ТОЛЬКО на бэкенде, чтобы фронт не мог "подделать" расчетный вес
    chargeable_weight: Mapped[float]
    ldm: Mapped[float]

    quote: Mapped["Quote"] = relationship(back_populates="cargo_items")

# --- ТАБЛИЦА ФИНАНСОВ / УСЛУГ (SERVICES) ---
class QuoteService(Base):
    __tablename__ = "quote_services"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    quote_id: Mapped[str] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"))
    
    service_key: Mapped[str]            # Ключ из prices.json (e.g., 'hauptlauf', 'customs_export')
    is_stage: Mapped[bool]              # True для базовых логистических этапов
    name: Mapped[str]                   # Локализованное название
    
    # Конфиденциальные данные: маржа и себестоимость скрыты от клиента
    carrier_cost: Mapped[float]
    margin: Mapped[float]
    rate: Mapped[float]                 # Итоговая ставка для клиента
    qty: Mapped[float]
    amount: Mapped[float]               # rate * qty

    # Кто платит по Инкотермс (tms_provider или counterparty)
    status: Mapped[str]

    quote: Mapped["Quote"] = relationship(back_populates="services")