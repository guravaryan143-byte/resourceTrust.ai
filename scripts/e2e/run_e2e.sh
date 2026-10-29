#!/bin/bash
cd "$(cd "$(dirname "$0")/../.." && pwd)" && export DATABASE_URL=sqlite:////tmp/rt_e2e.sqlite APP_ENV=development JWT_SECRET_KEY=e2e-only-secret-not-for-use-0123456789
rm -f /tmp/rt_e2e.sqlite
python3 - <<'PY'
from app.db.session import Base, engine, SessionLocal
from app.models import models
from app.core.security import hash_password
from app.models.models import User, Role
Base.metadata.create_all(bind=engine)
db=SessionLocal(); db.add(User(email="admin@example.com",full_name="Admin E2E",password_hash=hash_password("AdminPass12345"),role=Role.ADMIN,is_verified=True)); db.commit()
PY
(python3 -m uvicorn app.main:app --port 8000 > /tmp/api.log 2>&1 &)
(cd frontend && npx vite preview --port 4173 --host 127.0.0.1 > /tmp/preview.log 2>&1 &)
sleep 4
timeout 250 python3 scripts/e2e/run_ui_e2e.py 2>&1 | tail -70
pkill -f "uvicorn app.main"; pkill -f "vite preview"; true
