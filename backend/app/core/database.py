from sqlalchemy import create_engine, Column, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import datetime

# Создаем файл базы данных tms_core.db прямо в папке backend
SQLALCHEMY_DATABASE_URL = "sqlite:///./tms_core.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# --- ВРЕМЕННО ВОЗВРАЩАЕМ МОДЕЛЬ ДЛЯ ТЕСТА СВЯЗИ ---
class QuoteDB(Base):
    __tablename__ = "quotes"

    id = Column(String, primary_key=True, index=True) 
    status = Column(String, default="draft")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    data = Column(Text) 

# Автоматически создаем таблицу при запуске
Base.metadata.create_all(bind=engine)

class CounterpartyDB(Base):
    __tablename__ = "counterparties"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    short_name = Column(String, index=True) # Короткое имя для поиска
    role = Column(String, default="client")
    country = Column(String)
    payment_terms = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Связь 1-ко-многим с контактами
    contacts = relationship("ContactDB", back_populates="counterparty", cascade="all, delete-orphan")

class ContactDB(Base):
    __tablename__ = "contacts"
    id = Column(Integer, primary_key=True, index=True)
    counterparty_id = Column(Integer, ForeignKey("counterparties.id"))
    first_name = Column(String, default="")
    last_name = Column(String, default="")
    email = Column(String, default="")
    phone = Column(String, default="")

    counterparty = relationship("CounterpartyDB", back_populates="contacts")

# Обновляем структуру базы
Base.metadata.create_all(bind=engine)