from sqlalchemy import create_engine, Column, String, Text, DateTime, Integer, ForeignKey, Boolean, Float
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import datetime

# SQLALCHEMY_DATABASE_URL = "sqlite:///./tms_core.db"
# engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
# SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
# Base = declarative_base()

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
    
    # Роли (флаги вместо текста для точной фильтрации)
    is_client_sender = Column(Boolean, default=False)
    is_client_receiver = Column(Boolean, default=False)
    is_carrier = Column(Boolean, default=False)
    is_agent = Column(Boolean, default=False)

    # 1.1б Финансовая информация
    tax_number = Column(String, default="")
    vat_id = Column(String, default="")          # Международный VAT ID
    eori_number = Column(String, default="")     # Таможенный EORI номер
    language = Column(String, default="en")      # ukr, en, de
    currency = Column(String, default="EUR")     # UAH, EUR, USD
    credit_limit = Column(Float, default=0.0)    # Кредитный лимит фирмы
    payment_terms = Column(String, default="")

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    contacts = relationship("ContactDB", back_populates="counterparty", cascade="all, delete-orphan")

class ContactDB(Base):
    __tablename__ = "contacts"
    
    id = Column(Integer, primary_key=True, index=True)
    counterparty_id = Column(Integer, ForeignKey("counterparties.id"))
    
    position = Column(String, default="")        # Бухгалтерия, диспозиция и т.д.
    salutation = Column(String, default="")      # Frau, Herr, Mr, Ms
    first_name = Column(String, default="")
    last_name = Column(String, default="")
    email = Column(String, default="")
    phone = Column(String, default="")
    tg_nick = Column(String, default="")
    
    # Флаги доступности мессенджеров
    has_telegram = Column(Boolean, default=False)
    has_whatsapp = Column(Boolean, default=False)
    has_viber = Column(Boolean, default=False)

    counterparty = relationship("CounterpartyDB", back_populates="contacts")

Base.metadata.create_all(bind=engine)