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

# Автоматически создаем все таблицы при запуске сервера
Base.metadata.create_all(bind=engine)