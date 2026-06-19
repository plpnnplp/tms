from sqlalchemy import create_engine, Column, String, Text, DateTime, Integer, ForeignKey, Boolean, Float
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./tms_core.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# ==========================================
# 1. ТАБЛИЦА КОММЕРЧЕСКИХ ПРЕДЛОЖЕНИЙ (КП)
# ==========================================
class QuoteDB(Base):
    __tablename__ = "quotes"

    id = Column(String, primary_key=True, index=True) 
    status = Column(String, default="draft")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    data = Column(Text) 


# ==========================================
# 2. ТАБЛИЦЫ КОНТРАГЕНТОВ И КОНТАКТОВ
# ==========================================
class CounterpartyDB(Base):
    __tablename__ = "counterparties"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    name_extra = Column(String, default="")
    short_name = Column(String, index=True, default="")
    
    # 1.1а Основная информация
    street = Column(String, default="")
    house_no = Column(String, default="")
    office_no = Column(String, default="")
    postal_code = Column(String, default="")
    city = Column(String, default="")
    region = Column(String, default="")
    country = Column(String, default="")
    country_iso = Column(String, default="")
    country_en = Column(String, default="")
    
    # Роли
    is_client_sender = Column(Boolean, default=False)
    is_client_receiver = Column(Boolean, default=False)
    is_carrier = Column(Boolean, default=False)
    is_agent = Column(Boolean, default=False)

    # 1.1б Финансовая информация
    tax_number = Column(String, default="")
    vat_id = Column(String, default="")         
    eori_number = Column(String, default="")    
    language = Column(String, default="en")     
    currency = Column(String, default="EUR")    
    credit_limit = Column(Float, default=0.0)   
    payment_terms = Column(String, default="")

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Связь с контактами
    contacts = relationship("ContactDB", back_populates="counterparty", cascade="all, delete-orphan")


class ContactDB(Base):
    __tablename__ = "contacts"
    
    id = Column(Integer, primary_key=True, index=True)
    counterparty_id = Column(Integer, ForeignKey("counterparties.id"))
    
    position = Column(String, default="")       
    salutation = Column(String, default="")     
    first_name = Column(String, default="")
    last_name = Column(String, default="")
    email = Column(String, default="")
    phone = Column(String, default="")
    tg_nick = Column(String, default="")
    
    # Мессенджеры
    has_telegram = Column(Boolean, default=False)
    has_whatsapp = Column(Boolean, default=False)
    has_viber = Column(Boolean, default=False)

    counterparty = relationship("CounterpartyDB", back_populates="contacts")

# ==========================================
# 3. СИСТЕМНЫЕ СЧЕТЧИКИ ЗАКАЗОВ (ЗАЩИТА ОТ ДУБЛЕЙ)
# ==========================================
class OrderCounterDB(Base):
    __tablename__ = "order_counters"
    
    # Делаем составной первичный ключ: Префикс (AE) + Год (2026)
    prefix = Column(String, primary_key=True, index=True) 
    current_year = Column(Integer, primary_key=True)      
    last_value = Column(Integer, default=0)

# ==========================================
# 4. ТАБЛИЦА АКТИВНЫХ ЗАКАЗОВ
# ==========================================
class ActiveBookingDB(Base):
    __tablename__ = "active_bookings"
    
    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, unique=True, index=True, nullable=False) # e.g., AE-2600001
    quote_id = Column(String, ForeignKey("quotes.id"), nullable=True)      # Связь с оригинальным КП
    status = Column(String, default="active") # active, completed, delayed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Участники (Храним ID для связи или текст, если контрагент не в базе)
    shipper_name = Column(String, default="")
    consignee_name = Column(String, default="")
    bill_to_name = Column(String, default="")

    # Маршрут
    origin_city = Column(String, default="")
    destination_city = Column(String, default="")

    # Операционные детали
    transport_type = Column(String, default="") # air, sea, road
    packages_count = Column(Integer, default=0)
    gross_weight_kg = Column(Float, default=0.0)
    chargeable_weight_kg = Column(Float, default=0.0)
    ldm = Column(Float, default=0.0)

    # Сроки
    etd = Column(DateTime, nullable=True)
    eta = Column(DateTime, nullable=True)
    
    # Финансы (Копируем из КП в момент старта заказа)
    quote_price = Column(Float, default=0.0)
    actual_price = Column(Float, default=0.0)
    costs = Column(Float, default=0.0)
    margin = Column(Float, default=0.0)

    # Статусы документов
    has_awb_cmr = Column(Boolean, default=False)
    has_invoice = Column(Boolean, default=False)
    has_export_doc = Column(Boolean, default=False)

# Автоматически создаем все таблицы при запуске сервера
Base.metadata.create_all(bind=engine)