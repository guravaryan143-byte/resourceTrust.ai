import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.core.config import settings


def _make_engine(url: str):
    kwargs = dict(pool_pre_ping=True, pool_recycle=1800)
    if url.startswith("postgresql"):
        # Use a short connect timeout so health checks and tests fail fast
        # when the database is unavailable, instead of hanging on TCP timeouts.
        timeout = int(os.getenv("DB_CONNECT_TIMEOUT", "5"))
        kwargs["connect_args"] = {"connect_timeout": timeout}
    return create_engine(url, **kwargs)


engine = _make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
