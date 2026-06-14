from typing import Generator
from sqlalchemy.orm import Session
# Заглушка: предполагается, что движок БД мы настроим в core/database.py
from app.core.database import SessionLocal

def get_db() -> Generator[Session, None, None]:
    """Генератор сессий БД для Dependency Injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()