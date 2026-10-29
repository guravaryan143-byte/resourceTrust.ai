import importlib
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


def _get_test_db_url(tmp_path):
    """Prefer live PostgreSQL when TEST_DATABASE_URL is set and reachable; fallback to isolated SQLite."""
    pg_url = os.environ.get("TEST_DATABASE_URL")
    if pg_url:
        from sqlalchemy import create_engine, select
        try:
            test_engine = create_engine(pg_url, connect_args={"connect_timeout": 2})
            with test_engine.connect() as conn:
                conn.execute(select(1))
            return pg_url
        except Exception:
            pass
    db_path = tmp_path / "resource_trust_test.sqlite"
    return f"sqlite:///{db_path}"


@pytest.fixture()
def client(tmp_path):
    orig_env = os.environ.get("APP_ENV")
    orig_db = os.environ.get("DATABASE_URL")

    db_url = _get_test_db_url(tmp_path)
    os.environ["APP_ENV"] = "development"
    os.environ["DATABASE_URL"] = db_url

    import app.core.config as config_module
    import app.db.session as session_module
    import app.models.models as models_module
    import app.main as app_module

    importlib.reload(config_module)
    importlib.reload(session_module)
    importlib.reload(models_module)
    importlib.reload(app_module)

    from app.db.session import Base, engine

    Base.metadata.create_all(bind=engine)

    with TestClient(app_module.app) as test_client:
        yield test_client

    Base.metadata.drop_all(bind=engine)

    if orig_env is not None:
        os.environ["APP_ENV"] = orig_env
    else:
        os.environ.pop("APP_ENV", None)

    if orig_db is not None:
        os.environ["DATABASE_URL"] = orig_db
    else:
        os.environ.pop("DATABASE_URL", None)


def _register_user(client, email, full_name, password="SecretPass123"):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "full_name": full_name,
            "password": password,
            "institution": "ResourceTrust Demo",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _login(client, email, password="SecretPass123"):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _grant_role(email, role):
    from app.db.session import SessionLocal
    from app.models.models import Role, User

    with SessionLocal() as db:
        user = db.query(User).filter_by(email=email).one()
        user.role = role
        db.commit()


def test_health_reports_database_unavailable_when_backend_db_is_down():
    orig_env = os.environ.get("APP_ENV")
    orig_db = os.environ.get("DATABASE_URL")
    orig_timeout = os.environ.get("DB_CONNECT_TIMEOUT")

    os.environ["APP_ENV"] = "development"
    # Embed connect_timeout=2 in the URL so psycopg fails fast (no TCP hang).
    os.environ["DB_CONNECT_TIMEOUT"] = "2"
    os.environ["DATABASE_URL"] = "postgresql+psycopg://bad:bad@127.0.0.1:5432/resourcetrust?connect_timeout=2"

    import app.core.config as config_module
    import app.db.session as session_module
    import app.main as app_module

    try:
        importlib.reload(config_module)
        importlib.reload(session_module)
        importlib.reload(app_module)

        with TestClient(app_module.app) as test_client:
            response = test_client.get("/health")
            assert response.status_code == 503, response.text
            payload = response.json()
            assert payload["status"] == "degraded"
            assert payload["database"] == "unavailable"
    finally:
        if orig_env is not None:
            os.environ["APP_ENV"] = orig_env
        else:
            os.environ.pop("APP_ENV", None)
        if orig_db is not None:
            os.environ["DATABASE_URL"] = orig_db
        else:
            os.environ.pop("DATABASE_URL", None)
        if orig_timeout is not None:
            os.environ["DB_CONNECT_TIMEOUT"] = orig_timeout
        else:
            os.environ.pop("DB_CONNECT_TIMEOUT", None)


def test_full_booking_lifecycle(client):
    owner_email = "owner.integration@example.com"
    requester_email = "requester.integration@example.com"
    _register_user(client, owner_email, "Owner Person")
    _register_user(client, requester_email, "Requester Person")
    _grant_role(owner_email, "owner")

    owner_token = _login(client, owner_email)
    requester_token = _login(client, requester_email)

    resource_payload = {
        "name": "Laser Cutter",
        "description": "Industrial laser cutter for prototypes",
        "category": "Lab",
        "location": "Room A1",
        "institution": "R&D Center",
        "capacity": 1,
        "requires_training": False,
        "deposit_amount": 0,
        "usage_rules": "Use PPE and follow supervised operation rules.",
        "min_booking_minutes": 30,
        "max_booking_minutes": 240,
    }
    resource_response = client.post(
        "/api/v1/resources",
        json=resource_payload,
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert resource_response.status_code == 201, resource_response.text
    resource_id = resource_response.json()["id"]

    start = datetime.now(timezone.utc) + timedelta(days=1)
    end = start + timedelta(hours=2)
    booking_response = client.post(
        "/api/v1/bookings",
        json={
            "resource_id": resource_id,
            "start_at": start.isoformat(),
            "end_at": end.isoformat(),
            "purpose": "Prototype cutting work for internal review.",
        },
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert booking_response.status_code == 201, booking_response.text
    booking_id = booking_response.json()["id"]

    approval_response = client.patch(
        f"/api/v1/bookings/{booking_id}/decision",
        json={"decision": "approve", "note": "Approved for requested window."},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert approval_response.status_code == 200, approval_response.text
    assert approval_response.json()["status"] == "approved"

    from app.db.session import SessionLocal
    from app.models.models import Booking

    with SessionLocal() as db:
        stored = db.get(Booking, booking_id)
        assert stored is not None
        assert stored.status.value == "approved"

    before_response = client.post(
        f"/api/v1/bookings/{booking_id}/condition",
        json={
            "stage": "before",
            "condition": "good",
            "notes": "Looks good before use.",
            "photo_urls": [],
        },
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert before_response.status_code == 201, before_response.text

    check_in_response = client.post(
        f"/api/v1/bookings/{booking_id}/check-in",
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert check_in_response.status_code == 200, check_in_response.text
    assert check_in_response.json()["status"] == "checked_out"

    after_response = client.post(
        f"/api/v1/bookings/{booking_id}/condition",
        json={
            "stage": "after",
            "condition": "excellent",
            "notes": "Returned in excellent condition.",
            "photo_urls": [],
        },
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert after_response.status_code == 201, after_response.text

    check_out_response = client.post(
        f"/api/v1/bookings/{booking_id}/check-out",
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert check_out_response.status_code == 200, check_out_response.text
    assert check_out_response.json()["status"] == "returned"


def test_approval_waitlist_and_authorization(client):
    owner_email = "owner.waitlist@example.com"
    requester_email = "requester.waitlist@example.com"
    second_requester_email = "requester2.waitlist@example.com"

    _register_user(client, owner_email, "Owner Person")
    _register_user(client, requester_email, "Requester Person")
    _register_user(client, second_requester_email, "Requester Two")
    _grant_role(owner_email, "owner")

    owner_token = _login(client, owner_email)
    requester_token = _login(client, requester_email)
    requester_2_token = _login(client, second_requester_email)

    resource_response = client.post(
        "/api/v1/resources",
        json={
            "name": "3D Printer",
            "description": "Shared industrial 3D printer for prototypes.",
            "category": "Fabrication",
            "location": "Room B2",
            "institution": "Innovation Lab",
            "capacity": 1,
            "requires_training": False,
            "deposit_amount": 0,
            "usage_rules": "Use approved material only.",
            "min_booking_minutes": 30,
            "max_booking_minutes": 480,
        },
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    resource_id = resource_response.json()["id"]

    base_start = datetime.now(timezone.utc) + timedelta(days=2)
    base_end = base_start + timedelta(hours=2)

    booking_response = client.post(
        "/api/v1/bookings",
        json={
            "resource_id": resource_id,
            "start_at": base_start.isoformat(),
            "end_at": base_end.isoformat(),
            "purpose": "Prototype print for customer demo.",
        },
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert booking_response.status_code == 201, booking_response.text
    booking_id = booking_response.json()["id"]
    client.patch(
        f"/api/v1/bookings/{booking_id}/decision",
        json={"decision": "approve", "note": "Accepted."},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    overlap_response = client.post(
        "/api/v1/bookings",
        json={
            "resource_id": resource_id,
            "start_at": (base_start + timedelta(minutes=30)).isoformat(),
            "end_at": (base_end + timedelta(minutes=60)).isoformat(),
            "purpose": "Overlapping print request during the same window.",
        },
        headers={"Authorization": f"Bearer {requester_2_token}"},
    )
    assert overlap_response.status_code == 201, overlap_response.text
    assert overlap_response.json()["status"] == "waitlisted"

    unauthorized_response = client.get(
        f"/api/v1/resources/{resource_id}/bookings",
        headers={"Authorization": f"Bearer {requester_2_token}"},
    )
    assert unauthorized_response.status_code == 403, unauthorized_response.text

    owner_listing = client.get(
        f"/api/v1/resources/{resource_id}/bookings",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert owner_listing.status_code == 200, owner_listing.text
    assert len(owner_listing.json()) >= 2
