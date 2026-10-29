"""Comprehensive API integration tests using an in-memory SQLite database.

All tests in this module use the `client` fixture which:
  - Creates a fresh SQLite DB for each test
  - Reloads all app modules so the new DB URL is picked up
  - Tears down the schema after the test

No live PostgreSQL is required.
"""
import importlib
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def client(tmp_path):
    """Full FastAPI app wired to a temporary SQLite database."""
    db_path = tmp_path / "api_integration_test.sqlite"
    os.environ["APP_ENV"] = "development"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"

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


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def register(client, email, full_name, password="SecretPass123"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "full_name": full_name, "password": password, "institution": "Test Inst"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def login(client, email, password="SecretPass123"):
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def grant_role(email, role):
    from app.db.session import SessionLocal
    from app.models.models import User

    with SessionLocal() as db:
        user = db.query(User).filter_by(email=email).one()
        user.role = role
        db.commit()


def create_resource(client, token, **overrides):
    payload = {
        "name": "Lab Microscope",
        "description": "High-powered lab microscope",
        "category": "Lab",
        "location": "Room C3",
        "institution": "Test Inst",
        "capacity": 1,
        "requires_training": False,
        "deposit_amount": 0,
        "usage_rules": "Handle with care.",
        "min_booking_minutes": 30,
        "max_booking_minutes": 480,
    }
    payload.update(overrides)
    resp = client.post("/api/v1/resources", json=payload, headers=auth(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


def make_booking(client, token, resource_id, days_offset=1, duration_hours=2, **overrides):
    start = datetime.now(timezone.utc) + timedelta(days=days_offset)
    end = start + timedelta(hours=duration_hours)
    payload = {
        "resource_id": resource_id,
        "start_at": start.isoformat(),
        "end_at": end.isoformat(),
        "purpose": "Integration test booking.",
    }
    payload.update(overrides)
    return client.post("/api/v1/bookings", json=payload, headers=auth(token))


# ---------------------------------------------------------------------------
# Tests: health
# ---------------------------------------------------------------------------


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["database"] == "connected"


# ---------------------------------------------------------------------------
# Tests: authentication & registration
# ---------------------------------------------------------------------------


def test_register_and_login(client):
    user = register(client, "user1@example.com", "User One")
    assert user["email"] == "user1@example.com"
    assert "id" in user

    token = login(client, "user1@example.com")
    me = client.get("/api/v1/auth/me", headers=auth(token))
    assert me.status_code == 200
    assert me.json()["email"] == "user1@example.com"


def test_duplicate_email_rejected(client):
    register(client, "dup@example.com", "Dup User")
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "dup@example.com", "full_name": "Dup Again", "password": "SecretPass123"},
    )
    assert resp.status_code == 409


def test_login_wrong_password(client):
    register(client, "wrongpass@example.com", "Pass Test")
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpass@example.com", "password": "WrongPassword!"},
    )
    assert resp.status_code == 401


def test_login_nonexistent_user(client):
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "SecretPass123"},
    )
    assert resp.status_code == 401


def test_self_assigned_admin_role_rejected(client):
    """Registration must not allow self-assigning a privileged role."""
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": "hacker@example.com",
            "full_name": "Hacker",
            "password": "SecretPass123",
            "role": "admin",
        },
    )
    assert resp.status_code == 400


def test_unauthenticated_me_rejected(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests: resource CRUD & access control
# ---------------------------------------------------------------------------


def test_only_owner_can_create_resource(client):
    """A plain user cannot create a resource; only owner/manager/admin can."""
    user_token = login(client, register(client, "plain@example.com", "Plain User")["email"])
    resp = client.post(
        "/api/v1/resources",
        json={
            "name": "X", "description": "X", "category": "Lab",
            "location": "A1", "institution": "I",
            "capacity": 1, "requires_training": False, "deposit_amount": 0,
            "usage_rules": "", "min_booking_minutes": 30, "max_booking_minutes": 480,
        },
        headers=auth(user_token),
    )
    assert resp.status_code == 403


def test_owner_creates_resource(client):
    owner = register(client, "owner.create@example.com", "Owner Create")
    grant_role(owner["email"], "owner")
    token = login(client, owner["email"])
    resource = create_resource(client, token)
    assert resource["name"] == "Lab Microscope"
    assert resource["status"] == "active"


def test_list_resources(client):
    owner = register(client, "owner.list@example.com", "Owner List")
    grant_role(owner["email"], "owner")
    token = login(client, owner["email"])
    create_resource(client, token, name="Resource Alpha", category="Workshop")
    create_resource(client, token, name="Resource Beta", category="Lab")

    resp = client.get("/api/v1/resources")
    assert resp.status_code == 200
    names = [r["name"] for r in resp.json()]
    assert "Resource Alpha" in names
    assert "Resource Beta" in names


def test_filter_resources_by_category(client):
    owner = register(client, "owner.filter@example.com", "Owner Filter")
    grant_role(owner["email"], "owner")
    token = login(client, owner["email"])
    create_resource(client, token, name="Workshop Machine", category="Workshop")
    create_resource(client, token, name="Lab Centrifuge", category="Lab")

    resp = client.get("/api/v1/resources?category=Workshop")
    assert resp.status_code == 200
    data = resp.json()
    assert all(r["category"].lower() == "workshop" for r in data)


def test_get_resource_by_id(client):
    owner = register(client, "owner.get@example.com", "Owner Get")
    grant_role(owner["email"], "owner")
    token = login(client, owner["email"])
    resource = create_resource(client, token)

    resp = client.get(f"/api/v1/resources/{resource['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == resource["id"]


# ---------------------------------------------------------------------------
# Tests: bookings
# ---------------------------------------------------------------------------


def _setup_owner_and_requester(client, suffix=""):
    owner = register(client, f"owner{suffix}@example.com", f"Owner {suffix}")
    grant_role(owner["email"], "owner")
    owner_tok = login(client, owner["email"])

    requester = register(client, f"requester{suffix}@example.com", f"Requester {suffix}")
    req_tok = login(client, requester["email"])

    resource = create_resource(client, owner_tok)
    return owner_tok, req_tok, resource["id"]


def test_create_booking(client):
    owner_tok, req_tok, rid = _setup_owner_and_requester(client, ".bk1")
    resp = make_booking(client, req_tok, rid)
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"


def test_owner_cannot_book_own_resource(client):
    owner = register(client, "owner.selfbook@example.com", "Owner Self")
    grant_role(owner["email"], "owner")
    token = login(client, owner["email"])
    resource = create_resource(client, token)
    resp = make_booking(client, token, resource["id"])
    assert resp.status_code == 400


def test_booking_duration_too_short(client):
    owner_tok, req_tok, rid = _setup_owner_and_requester(client, ".dur1")
    start = datetime.now(timezone.utc) + timedelta(days=1)
    end = start + timedelta(minutes=10)  # less than min 30 minutes
    resp = client.post(
        "/api/v1/bookings",
        json={"resource_id": rid, "start_at": start.isoformat(), "end_at": end.isoformat(), "purpose": "Testing duration that is too short."},
        headers=auth(req_tok),
    )
    assert resp.status_code == 400


def test_booking_duration_too_long(client):
    owner_tok, req_tok, rid = _setup_owner_and_requester(client, ".dur2")
    start = datetime.now(timezone.utc) + timedelta(days=1)
    end = start + timedelta(hours=20)  # more than max 480 minutes
    resp = client.post(
        "/api/v1/bookings",
        json={"resource_id": rid, "start_at": start.isoformat(), "end_at": end.isoformat(), "purpose": "Testing duration that is too long."},
        headers=auth(req_tok),
    )
    assert resp.status_code == 400


def test_fair_use_limit_three_active_bookings(client):
    """A user cannot have more than 3 active bookings at once."""
    owner = register(client, "owner.fairuse@example.com", "Owner FairUse")
    grant_role(owner["email"], "owner")
    owner_tok = login(client, owner["email"])

    requester = register(client, "req.fairuse@example.com", "Req FairUse")
    req_tok = login(client, requester["email"])

    # Create 3 separate resources so we can have 3 independent bookings
    r1 = create_resource(client, owner_tok, name="FU Resource 1")
    r2 = create_resource(client, owner_tok, name="FU Resource 2")
    r3 = create_resource(client, owner_tok, name="FU Resource 3")
    r4 = create_resource(client, owner_tok, name="FU Resource 4")

    make_booking(client, req_tok, r1["id"], days_offset=1)
    make_booking(client, req_tok, r2["id"], days_offset=2)
    make_booking(client, req_tok, r3["id"], days_offset=3)

    # 4th booking should hit the fair-use limit
    resp = make_booking(client, req_tok, r4["id"], days_offset=4)
    assert resp.status_code == 429


def test_booking_overlap_creates_waitlist(client):
    owner_tok, req_tok, rid = _setup_owner_and_requester(client, ".wl")
    req2 = register(client, "req2.wl@example.com", "Req2 WL")
    req2_tok = login(client, req2["email"])

    first = make_booking(client, req_tok, rid, days_offset=5)
    assert first.status_code == 201
    first_id = first.json()["id"]

    # Approve the first booking so it's APPROVED
    client.patch(
        f"/api/v1/bookings/{first_id}/decision",
        json={"decision": "approve", "note": "Approved"},
        headers=auth(owner_tok),
    )

    # Make an overlapping booking - should be waitlisted
    overlap = make_booking(client, req2_tok, rid, days_offset=5)
    assert overlap.status_code == 201
    assert overlap.json()["status"] == "waitlisted"


def test_cancel_booking(client):
    owner_tok, req_tok, rid = _setup_owner_and_requester(client, ".cancel")
    booking = make_booking(client, req_tok, rid)
    booking_id = booking.json()["id"]

    resp = client.post(f"/api/v1/bookings/{booking_id}/cancel", headers=auth(req_tok))
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


def test_unauthorized_user_cannot_cancel_others_booking(client):
    owner_tok, req_tok, rid = _setup_owner_and_requester(client, ".unauth")
    booking_id = make_booking(client, req_tok, rid).json()["id"]

    other = register(client, "other.cancel@example.com", "Other")
    other_tok = login(client, other["email"])

    resp = client.post(f"/api/v1/bookings/{booking_id}/cancel", headers=auth(other_tok))
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Tests: notifications
# ---------------------------------------------------------------------------


def test_notifications_created_on_booking(client):
    """Creating a booking should produce a notification for the resource owner."""
    owner = register(client, "owner.notif@example.com", "Owner Notif")
    grant_role(owner["email"], "owner")
    owner_tok = login(client, owner["email"])
    resource = create_resource(client, owner_tok)

    requester = register(client, "req.notif@example.com", "Req Notif")
    req_tok = login(client, requester["email"])

    make_booking(client, req_tok, resource["id"])

    resp = client.get("/api/v1/notifications", headers=auth(owner_tok))
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


# ---------------------------------------------------------------------------
# Tests: audit events
# ---------------------------------------------------------------------------


def test_audit_events_recorded(client):
    """Key actions should produce audit events visible to the acting user."""
    owner = register(client, "owner.audit@example.com", "Owner Audit")
    grant_role(owner["email"], "owner")
    owner_tok = login(client, owner["email"])
    create_resource(client, owner_tok)

    resp = client.get("/api/v1/audit", headers=auth(owner_tok))
    assert resp.status_code == 200
    actions = [e["action"] for e in resp.json()]
    assert "resource.created" in actions


# ---------------------------------------------------------------------------
# Tests: admin role management
# ---------------------------------------------------------------------------


def test_only_admin_can_change_roles(client):
    user = register(client, "user.role@example.com", "User Role")
    user_tok = login(client, user["email"])

    resp = client.patch(f"/api/v1/admin/users/{user['id']}/role?role=owner", headers=auth(user_tok))
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Tests: eligibility lifecycle & training-gated resource booking
# ---------------------------------------------------------------------------


def test_eligibility_and_training_gated_booking(client):
    """User cannot book training-gated resource without verified qualification,
    but can book once verified by an admin/manager."""
    # Setup owner and training-gated resource
    owner = register(client, "owner.qual@example.com", "Owner Qual")
    grant_role(owner["email"], "owner")
    owner_tok = login(client, owner["email"])

    resource = create_resource(
        client,
        owner_tok,
        name="CNC Mill",
        requires_training=True,
        required_qualification="CNC Safety Induction",
    )
    rid = resource["id"]

    # Setup requester
    requester = register(client, "req.qual@example.com", "Req Qual")
    req_tok = login(client, requester["email"])

    # Attempt to book without eligibility -> 403
    resp = make_booking(client, req_tok, rid, days_offset=2)
    assert resp.status_code == 403
    assert "Verified eligibility required" in resp.json()["detail"]

    # Submit eligibility
    sub_resp = client.post(
        "/api/v1/eligibility",
        json={"requirement": "CNC Safety Induction", "evidence_note": "Completed course in 2026"},
        headers=auth(req_tok),
    )
    assert sub_resp.status_code == 201
    record_id = sub_resp.json()["id"]

    # Check my eligibility reports pending
    my_elig = client.get("/api/v1/eligibility/me", headers=auth(req_tok))
    assert my_elig.status_code == 200
    assert any(r["requirement"] == "CNC Safety Induction" and not r["verified"] for r in my_elig.json())

    # Create admin and verify the eligibility record
    admin = register(client, "admin.qual@example.com", "Admin Qual")
    grant_role(admin["email"], "admin")
    admin_tok = login(client, admin["email"])

    ver_resp = client.patch(
        f"/api/v1/admin/eligibility/{record_id}",
        json={"verified": True, "evidence_note": "Verified certificate"},
        headers=auth(admin_tok),
    )
    assert ver_resp.status_code == 200
    assert ver_resp.json()["verified"] is True

    # Now booking should succeed -> 201
    book_resp = make_booking(client, req_tok, rid, days_offset=2)
    assert book_resp.status_code == 201
    assert book_resp.json()["status"] == "pending"


# ---------------------------------------------------------------------------
# Tests: incident reporting & review
# ---------------------------------------------------------------------------


def test_incident_reporting_and_review(client):
    owner_tok, req_tok, rid = _setup_owner_and_requester(client, ".inc")
    booking = make_booking(client, req_tok, rid)
    bid = booking.json()["id"]

    # Requester reports an incident
    inc_resp = client.post(
        f"/api/v1/bookings/{bid}/incidents",
        json={"incident_type": "power_failure", "description": "Machine tripped breaker during run."},
        headers=auth(req_tok),
    )
    assert inc_resp.status_code == 201
    incident_id = inc_resp.json()["id"]

    # Owner lists incidents and sees it
    incidents = client.get("/api/v1/incidents", headers=auth(owner_tok))
    assert incidents.status_code == 200
    assert any(i["id"] == incident_id and i["incident_type"] == "power_failure" for i in incidents.json())

    # Admin reviews and resolves the incident
    admin = register(client, "admin.inc@example.com", "Admin Inc")
    grant_role(admin["email"], "admin")
    admin_tok = login(client, admin["email"])

    rev_resp = client.patch(
        f"/api/v1/incidents/{incident_id}",
        json={"status": "resolved", "resolution_note": "Circuit breaker reset and inspected."},
        headers=auth(admin_tok),
    )
    assert rev_resp.status_code == 200
    assert rev_resp.json()["status"] == "resolved"

