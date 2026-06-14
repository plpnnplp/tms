from sqlalchemy import create_engine, Column, String, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
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