import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.core.security import hash_password, verify_password, create_access_token
from app.db.session import Base, engine, get_db
from app.models.models import (User, Resource, Booking, Eligibility, ConditionReport, Incident, AuditEvent, Notification, Role, ResourceStatus, BookingStatus, IncidentStatus)
from app.schemas.schemas import (UserCreate, UserOut, TokenOut, LoginIn, ResourceCreate, ResourceOut, BookingCreate, BookingOut, DecisionIn, ConditionIn, IncidentCreate, IncidentDecision, EligibilityCreate, EligibilityDecision, ResourceStatusIn, NotificationOut, AuditOut)
from app.api.deps import get_current_user, require_roles
from app.services.audit import audit, notify

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Convenient for local prototypes. Production deployments should run `alembic upgrade head`.
    if settings.app_env == "development":
        try:
            Base.metadata.create_all(bind=engine)
        except Exception as exc:  # pragma: no cover - depends on local DB availability
            logging.warning("Database not available during startup; continuing without schema initialization: %s", exc)
    yield

app = FastAPI(title=settings.app_name, version="1.0.0", description="Trusted sharing for institutional spaces and equipment", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["GET","POST","PATCH","DELETE","OPTIONS"], allow_headers=["Authorization","Content-Type"])

@app.get("/", tags=["health"])
def root(): return {"name": settings.app_name, "status": "ok", "docs": "/docs", "api_prefix": settings.api_v1_prefix}
@app.get("/health", tags=["health"])
def health(db: Session = Depends(get_db)):
    try:
        db.execute(select(1))
    except Exception:
        return JSONResponse(status_code=503, content={"status":"degraded","database":"unavailable","detail":"Database unavailable"})
    return {"status":"healthy", "database":"connected"}

# Auth
@app.post("/api/v1/auth/register", response_model=UserOut, status_code=201, tags=["auth"])
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if payload.role in (Role.ADMIN, Role.MANAGER, Role.OWNER): raise HTTPException(400, "Accounts register as users. An administrator must grant elevated roles.")
    user = User(email=payload.email.lower(), full_name=payload.full_name, password_hash=hash_password(payload.password), institution=payload.institution, role=Role.USER)
    db.add(user)
    try:
        db.flush(); audit(db, user.id, "user.registered", "user", user.id, {"role":"user"}); db.commit(); db.refresh(user)
    except IntegrityError: db.rollback(); raise HTTPException(409, "An account with this email already exists")
    return user
@app.post("/api/v1/auth/login", response_model=TokenOut, tags=["auth"])
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash): raise HTTPException(401, "Incorrect email or password", headers={"WWW-Authenticate":"Bearer"})
    if not user.is_active: raise HTTPException(403, "Account is inactive")
    return TokenOut(access_token=create_access_token(str(user.id)))
@app.get("/api/v1/auth/me", response_model=UserOut, tags=["auth"])
def me(user: User = Depends(get_current_user)): return user
@app.patch("/api/v1/admin/users/{user_id}/role", response_model=UserOut, tags=["admin"])
def change_role(user_id: int, role: Role, db: Session = Depends(get_db), admin: User = Depends(require_roles(Role.ADMIN))):
    user = db.get(User, user_id)
    if not user: raise HTTPException(404, "User not found")
    user.role = role; audit(db, admin.id, "user.role_changed", "user", user.id, {"role":role.value}); db.commit(); db.refresh(user); return user

# Resources
@app.post("/api/v1/resources", response_model=ResourceOut, status_code=201, tags=["resources"])
def create_resource(payload: ResourceCreate, db: Session = Depends(get_db), user: User = Depends(require_roles(Role.OWNER, Role.MANAGER, Role.ADMIN))):
    resource = Resource(owner_id=user.id, **payload.model_dump())
    db.add(resource); db.flush(); audit(db, user.id, "resource.created", "resource", resource.id, {"name":resource.name}); db.commit(); db.refresh(resource); return resource
@app.get("/api/v1/resources", response_model=list[ResourceOut], tags=["resources"])
def list_resources(q: str | None = None, category: str | None = None, location: str | None = None, institution: str | None = None, requires_training: bool | None = None, status_filter: ResourceStatus = ResourceStatus.ACTIVE, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    stmt = select(Resource).where(Resource.status == status_filter)
    if q: stmt = stmt.where(or_(Resource.name.ilike(f"%{q}%"), Resource.description.ilike(f"%{q}%"), Resource.usage_rules.ilike(f"%{q}%")))
    if category: stmt = stmt.where(Resource.category.ilike(category))
    if location: stmt = stmt.where(Resource.location.ilike(f"%{location}%"))
    if institution: stmt = stmt.where(Resource.institution.ilike(f"%{institution}%"))
    if requires_training is not None: stmt = stmt.where(Resource.requires_training == requires_training)
    return list(db.scalars(stmt.order_by(Resource.created_at.desc()).limit(limit).offset(offset)).all())
@app.get("/api/v1/resources/{resource_id}", response_model=ResourceOut, tags=["resources"])
def get_resource(resource_id: int, db: Session = Depends(get_db)):
    resource = db.get(Resource, resource_id)
    if not resource or resource.status == ResourceStatus.ARCHIVED: raise HTTPException(404, "Resource not found")
    return resource
@app.patch("/api/v1/resources/{resource_id}/status", response_model=ResourceOut, tags=["resources"])
def update_resource_status(resource_id: int, payload: ResourceStatusIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    resource = db.get(Resource, resource_id)
    if not resource: raise HTTPException(404, "Resource not found")
    if user.role != Role.ADMIN and resource.owner_id != user.id and user.role != Role.MANAGER: raise HTTPException(403, "Only the owner, manager, or admin can update resource status")
    resource.status=payload.status; audit(db,user.id,"resource.status_changed","resource",resource.id,{"status":payload.status.value}); db.commit(); db.refresh(resource); return resource

# Eligibility records: user submits requirement; authorised manager/admin verifies it.
@app.post("/api/v1/eligibility", status_code=201, tags=["eligibility"])
def submit_eligibility(payload: EligibilityCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.scalar(select(Eligibility).where(Eligibility.user_id==user.id, Eligibility.requirement==payload.requirement))
    if existing: existing.evidence_note=payload.evidence_note; existing.verified=False; existing.verified_by=None; existing.expires_at=None; record=existing
    else: record=Eligibility(user_id=user.id, requirement=payload.requirement, evidence_note=payload.evidence_note); db.add(record)
    db.flush(); audit(db,user.id,"eligibility.submitted","eligibility",record.id,{"requirement":record.requirement}); db.commit(); return {"id":record.id,"requirement":record.requirement,"verified":record.verified,"message":"Submitted for authorised review"}
@app.get("/api/v1/eligibility/me", tags=["eligibility"])
def my_eligibility(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    records=db.scalars(select(Eligibility).where(Eligibility.user_id==user.id).order_by(Eligibility.created_at.desc())).all()
    return [{"id":r.id,"requirement":r.requirement,"verified":r.verified,"expires_at":r.expires_at,"evidence_note":r.evidence_note} for r in records]
@app.patch("/api/v1/admin/eligibility/{record_id}", tags=["admin"])
def verify_eligibility(record_id: int, payload: EligibilityDecision, db: Session = Depends(get_db), reviewer: User = Depends(require_roles(Role.MANAGER, Role.ADMIN))):
    record=db.get(Eligibility,record_id)
    if not record: raise HTTPException(404,"Eligibility record not found")
    record.verified=payload.verified; record.verified_by=reviewer.id; record.evidence_note=payload.evidence_note or record.evidence_note
    audit(db,reviewer.id,"eligibility.reviewed","eligibility",record.id,{"verified":record.verified}); notify(db,record.user_id,"Eligibility reviewed",f"Your requirement '{record.requirement}' was {'verified' if record.verified else 'not verified'}."); db.commit()
    return {"id":record.id,"verified":record.verified,"verified_by":record.verified_by}

# Bookings. Resource row lock serializes concurrent requests for the same resource on PostgreSQL.
@app.post("/api/v1/bookings", response_model=BookingOut, status_code=201, tags=["bookings"])
def create_booking(payload: BookingCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    resource=db.scalar(select(Resource).where(Resource.id==payload.resource_id).with_for_update())
    if not resource or resource.status != ResourceStatus.ACTIVE: raise HTTPException(404,"Resource unavailable")
    if resource.owner_id == user.id: raise HTTPException(400,"Owners cannot book their own resource")
    minutes=int((payload.end_at-payload.start_at).total_seconds()/60)
    if minutes < resource.min_booking_minutes or minutes > resource.max_booking_minutes: raise HTTPException(400,"Booking duration violates the resource's limits")
    if resource.requires_training:
        elig=db.scalar(select(Eligibility).where(Eligibility.user_id==user.id, Eligibility.requirement==resource.required_qualification, Eligibility.verified.is_(True), or_(Eligibility.expires_at.is_(None), Eligibility.expires_at>datetime.now(timezone.utc))))
        if not elig: raise HTTPException(403,f"Verified eligibility required: {resource.required_qualification}")
    overlapping=db.scalar(select(Booking.id).where(Booking.resource_id==resource.id, Booking.status.in_([BookingStatus.PENDING,BookingStatus.APPROVED,BookingStatus.CHECKED_OUT,BookingStatus.OVERDUE]), Booking.start_at < payload.end_at, Booking.end_at > payload.start_at).limit(1))
    user_active=db.scalar(select(func.count(Booking.id)).where(Booking.user_id==user.id, Booking.status.in_([BookingStatus.PENDING,BookingStatus.APPROVED,BookingStatus.CHECKED_OUT,BookingStatus.OVERDUE]))) or 0
    if user_active >= 3: raise HTTPException(429,"Fair-use limit reached: at most 3 active requests/bookings per user")
    booking=Booking(resource_id=resource.id,user_id=user.id,start_at=payload.start_at,end_at=payload.end_at,purpose=payload.purpose,status=BookingStatus.WAITLISTED if overlapping else BookingStatus.PENDING)
    if overlapping:
        position=(db.scalar(select(func.count(Booking.id)).where(Booking.resource_id==resource.id, Booking.status==BookingStatus.WAITLISTED)) or 0)+1
        booking.waitlist_position=position
    db.add(booking); db.flush(); audit(db,user.id,"booking.requested","booking",booking.id,{"status":booking.status.value,"resource_id":resource.id})
    notify(db,resource.owner_id,"New booking request",f"{user.full_name} requested {resource.name}.")
    if overlapping: notify(db,user.id,"Added to waiting list",f"This time conflicts with an existing booking. Your waiting-list position is {position}.")
    db.commit(); db.refresh(booking); return booking
@app.get("/api/v1/bookings/me", response_model=list[BookingOut], tags=["bookings"])
def my_bookings(db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return list(db.scalars(select(Booking).where(Booking.user_id==user.id).order_by(Booking.created_at.desc())).all())
@app.get("/api/v1/resources/{resource_id}/bookings", response_model=list[BookingOut], tags=["bookings"])
def resource_bookings(resource_id: int, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    resource=db.get(Resource,resource_id)
    if not resource: raise HTTPException(404,"Resource not found")
    if user.role not in (Role.ADMIN,Role.MANAGER) and resource.owner_id != user.id: raise HTTPException(403,"Only resource managers can view booking details")
    return list(db.scalars(select(Booking).where(Booking.resource_id==resource_id).order_by(Booking.start_at)).all())
@app.patch("/api/v1/bookings/{booking_id}/decision", response_model=BookingOut, tags=["bookings"])
def decide_booking(booking_id: int, payload: DecisionIn, db: Session=Depends(get_db), user: User=Depends(require_roles(Role.OWNER,Role.MANAGER,Role.ADMIN))):
    booking=db.scalar(select(Booking).where(Booking.id==booking_id).with_for_update())
    if not booking: raise HTTPException(404,"Booking not found")
    resource=db.get(Resource,booking.resource_id)
    if user.role != Role.ADMIN and user.role != Role.MANAGER and resource.owner_id != user.id: raise HTTPException(403,"Only the owner or authorised manager can decide")
    if booking.status != BookingStatus.PENDING: raise HTTPException(409,"Only pending requests can be decided")
    if payload.decision=="approve":
        conflict=db.scalar(select(Booking.id).where(Booking.resource_id==resource.id, Booking.id!=booking.id, Booking.status.in_([BookingStatus.APPROVED,BookingStatus.CHECKED_OUT,BookingStatus.OVERDUE]), Booking.start_at<booking.end_at, Booking.end_at>booking.start_at).limit(1))
        if conflict: raise HTTPException(409,"A conflicting booking was approved first")
        booking.status=BookingStatus.APPROVED
    elif payload.decision=="reject": booking.status=BookingStatus.REJECTED
    else:
        booking.status=BookingStatus.WAITLISTED
        booking.waitlist_position=(db.scalar(select(func.count(Booking.id)).where(Booking.resource_id==resource.id,Booking.status==BookingStatus.WAITLISTED)) or 0)+1
    booking.decision_note=payload.note; booking.reviewed_by=user.id
    audit(db,user.id,f"booking.{payload.decision}","booking",booking.id,{"note":payload.note}); notify(db,booking.user_id,"Booking decision",f"Your request for {resource.name} was {booking.status.value}. {payload.note or ''}")
    db.commit(); db.refresh(booking); return booking
@app.post("/api/v1/bookings/{booking_id}/cancel", response_model=BookingOut, tags=["bookings"])
def cancel_booking(booking_id: int, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    booking=db.scalar(select(Booking).where(Booking.id==booking_id).with_for_update())
    if not booking: raise HTTPException(404,"Booking not found")
    resource=db.get(Resource,booking.resource_id)
    if user.id not in (booking.user_id,resource.owner_id) and user.role not in (Role.MANAGER,Role.ADMIN): raise HTTPException(403,"Not authorised")
    if booking.status not in (BookingStatus.PENDING,BookingStatus.WAITLISTED,BookingStatus.APPROVED): raise HTTPException(409,"This booking can no longer be cancelled")
    booking.status=BookingStatus.CANCELLED; audit(db,user.id,"booking.cancelled","booking",booking.id,{}); notify(db,resource.owner_id,"Booking cancelled",f"Booking #{booking.id} was cancelled.")
    db.commit(); db.refresh(booking); return booking

# Check-in/out and condition reports
@app.post("/api/v1/bookings/{booking_id}/condition", status_code=201, tags=["lifecycle"])
def submit_condition(booking_id: int, payload: ConditionIn, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    booking=db.scalar(select(Booking).where(Booking.id==booking_id).with_for_update())
    if not booking: raise HTTPException(404,"Booking not found")
    if user.id not in (booking.user_id,db.get(Resource,booking.resource_id).owner_id) and user.role not in (Role.MANAGER,Role.ADMIN): raise HTTPException(403,"Not authorised")
    if payload.stage=="before" and booking.status!=BookingStatus.APPROVED: raise HTTPException(409,"Initial condition is recorded after approval and before check-out")
    if payload.stage=="after" and booking.status not in (BookingStatus.CHECKED_OUT,BookingStatus.OVERDUE): raise HTTPException(409,"Final condition can only be recorded after check-out")
    exists=db.scalar(select(ConditionReport.id).where(ConditionReport.booking_id==booking.id,ConditionReport.stage==payload.stage))
    if exists: raise HTTPException(409,f"A {payload.stage} condition report already exists")
    report=ConditionReport(booking_id=booking.id,submitted_by=user.id,**payload.model_dump()); db.add(report); db.flush(); audit(db,user.id,f"condition.{payload.stage}_recorded","booking",booking.id,{"condition":payload.condition})
    if payload.condition=="damaged":
        db.add(Incident(booking_id=booking.id,reported_by=user.id,incident_type="condition_damage",description=payload.notes or "Condition marked damaged; review required.")); audit(db,user.id,"incident.auto_reported","booking",booking.id,{"source":"condition_report"})
    db.commit(); return {"id":report.id,"booking_id":booking.id,"stage":report.stage,"condition":report.condition,"message":"Condition report saved"}
@app.post("/api/v1/bookings/{booking_id}/check-in", response_model=BookingOut, tags=["lifecycle"])
def check_in(booking_id: int, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    booking=db.scalar(select(Booking).where(Booking.id==booking_id).with_for_update())
    if not booking: raise HTTPException(404,"Booking not found")
    resource=db.get(Resource,booking.resource_id)
    if user.id not in (booking.user_id,resource.owner_id) and user.role not in (Role.MANAGER,Role.ADMIN): raise HTTPException(403,"Not authorised")
    if booking.status!=BookingStatus.APPROVED: raise HTTPException(409,"Only approved bookings can check in")
    before=db.scalar(select(ConditionReport.id).where(ConditionReport.booking_id==booking.id,ConditionReport.stage=="before"))
    if not before: raise HTTPException(400,"Record the initial condition before check-in")
    booking.status=BookingStatus.CHECKED_OUT; booking.checked_in_at=datetime.now(timezone.utc); audit(db,user.id,"booking.checked_in","booking",booking.id,{}); notify(db,resource.owner_id,"Resource checked out",f"Booking #{booking.id} has checked out {resource.name}."); db.commit(); db.refresh(booking); return booking
@app.post("/api/v1/bookings/{booking_id}/check-out", response_model=BookingOut, tags=["lifecycle"])
def check_out(booking_id: int, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    booking=db.scalar(select(Booking).where(Booking.id==booking_id).with_for_update())
    if not booking: raise HTTPException(404,"Booking not found")
    resource=db.get(Resource,booking.resource_id)
    if user.id not in (booking.user_id,resource.owner_id) and user.role not in (Role.MANAGER,Role.ADMIN): raise HTTPException(403,"Not authorised")
    if booking.status not in (BookingStatus.CHECKED_OUT,BookingStatus.OVERDUE): raise HTTPException(409,"Resource is not checked out")
    after=db.scalar(select(ConditionReport.id).where(ConditionReport.booking_id==booking.id,ConditionReport.stage=="after"))
    if not after: raise HTTPException(400,"Record the final condition before completing return")
    booking.status=BookingStatus.RETURNED; booking.returned_at=datetime.now(timezone.utc); audit(db,user.id,"booking.returned","booking",booking.id,{"returned_at":booking.returned_at.isoformat()}); notify(db,resource.owner_id,"Resource returned",f"{resource.name} was returned for booking #{booking.id}.")
    db.commit(); db.refresh(booking); return booking

# Incidents and human review
@app.post("/api/v1/bookings/{booking_id}/incidents", status_code=201, tags=["incidents"])
def report_incident(booking_id: int, payload: IncidentCreate, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    booking=db.get(Booking,booking_id)
    if not booking: raise HTTPException(404,"Booking not found")
    resource=db.get(Resource,booking.resource_id)
    if user.id not in (booking.user_id,resource.owner_id) and user.role not in (Role.MANAGER,Role.ADMIN): raise HTTPException(403,"Not authorised")
    incident=Incident(booking_id=booking.id,reported_by=user.id,**payload.model_dump()); db.add(incident); db.flush(); audit(db,user.id,"incident.reported","incident",incident.id,{"type":incident.incident_type}); notify(db,resource.owner_id,"Incident reported",f"An incident was reported for booking #{booking.id}; review is required."); db.commit(); return {"id":incident.id,"status":incident.status,"message":"Incident recorded for human review"}
@app.get("/api/v1/incidents", tags=["incidents"])
def list_incidents(db: Session=Depends(get_db), user: User=Depends(require_roles(Role.OWNER,Role.MANAGER,Role.ADMIN))):
    stmt=select(Incident).order_by(Incident.created_at.desc())
    if user.role==Role.OWNER:
        owned=select(Resource.id).where(Resource.owner_id==user.id); booking_ids=select(Booking.id).where(Booking.resource_id.in_(owned)); stmt=stmt.where(Incident.booking_id.in_(booking_ids))
    return [{"id":i.id,"booking_id":i.booking_id,"reported_by":i.reported_by,"incident_type":i.incident_type,"description":i.description,"status":i.status,"resolution_note":i.resolution_note,"created_at":i.created_at} for i in db.scalars(stmt).all()]
@app.patch("/api/v1/incidents/{incident_id}", tags=["incidents"])
def review_incident(incident_id: int, payload: IncidentDecision, db: Session=Depends(get_db), user: User=Depends(require_roles(Role.MANAGER,Role.ADMIN))):
    incident=db.get(Incident,incident_id)
    if not incident: raise HTTPException(404,"Incident not found")
    if payload.status not in (IncidentStatus.UNDER_REVIEW,IncidentStatus.RESOLVED,IncidentStatus.DISMISSED): raise HTTPException(400,"Invalid review status")
    incident.status=payload.status; incident.resolution_note=payload.resolution_note; incident.reviewed_by=user.id
    if payload.status in (IncidentStatus.RESOLVED,IncidentStatus.DISMISSED): incident.resolved_at=datetime.now(timezone.utc)
    audit(db,user.id,"incident.reviewed","incident",incident.id,{"status":payload.status.value,"resolution_note":payload.resolution_note}); db.commit(); return {"id":incident.id,"status":incident.status,"reviewed_by":incident.reviewed_by}

# Notifications and audit history
@app.get("/api/v1/notifications", response_model=list[NotificationOut], tags=["notifications"])
def notifications(db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return list(db.scalars(select(Notification).where(Notification.user_id==user.id).order_by(Notification.created_at.desc()).limit(100)).all())
@app.post("/api/v1/notifications/{notification_id}/read", tags=["notifications"])
def mark_notification_read(notification_id: int, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    n=db.get(Notification,notification_id)
    if not n or n.user_id!=user.id: raise HTTPException(404,"Notification not found")
    n.read_at=datetime.now(timezone.utc); db.commit(); return {"id":n.id,"read":True}
@app.get("/api/v1/audit", response_model=list[AuditOut], tags=["audit"])
def audit_history(entity_type: str | None=None, entity_id: int | None=None, limit: int=Query(100,ge=1,le=500), db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    stmt=select(AuditEvent)
    if entity_type: stmt=stmt.where(AuditEvent.entity_type==entity_type)
    if entity_id is not None: stmt=stmt.where(AuditEvent.entity_id==entity_id)
    # Users can see events for their own bookings/resources; managers/admins can audit broadly.
    if user.role not in (Role.MANAGER,Role.ADMIN):
        own_bookings=select(Booking.id).where(Booking.user_id==user.id)
        own_resources=select(Resource.id).where(Resource.owner_id==user.id)
        stmt=stmt.where(or_(AuditEvent.actor_id==user.id, and_(AuditEvent.entity_type=="booking",AuditEvent.entity_id.in_(own_bookings)), and_(AuditEvent.entity_type=="resource",AuditEvent.entity_id.in_(own_resources))))
    return list(db.scalars(stmt.order_by(AuditEvent.created_at.desc()).limit(limit)).all())
