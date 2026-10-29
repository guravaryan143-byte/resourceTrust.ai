import enum
from datetime import datetime, timezone
from sqlalchemy import (String, Text, Boolean, DateTime, Integer, ForeignKey, Enum, Numeric, JSON, Index, UniqueConstraint, CheckConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

def utcnow(): return datetime.now(timezone.utc)

class Role(str, enum.Enum): USER="user"; OWNER="owner"; MANAGER="manager"; ADMIN="admin"
class ResourceStatus(str, enum.Enum): ACTIVE="active"; PAUSED="paused"; MAINTENANCE="maintenance"; ARCHIVED="archived"
class BookingStatus(str, enum.Enum): PENDING="pending"; WAITLISTED="waitlisted"; APPROVED="approved"; REJECTED="rejected"; CANCELLED="cancelled"; CHECKED_OUT="checked_out"; RETURNED="returned"; OVERDUE="overdue"
class IncidentStatus(str, enum.Enum): OPEN="open"; UNDER_REVIEW="under_review"; RESOLVED="resolved"; DISMISSED="dismissed"

class User(Base):
    __tablename__="users"
    id: Mapped[int]=mapped_column(primary_key=True)
    email: Mapped[str]=mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str]=mapped_column(String(120))
    password_hash: Mapped[str]=mapped_column(String(255))
    role: Mapped[Role]=mapped_column(Enum(Role, name="user_role"), default=Role.USER)
    institution: Mapped[str|None]=mapped_column(String(180), nullable=True)
    is_active: Mapped[bool]=mapped_column(Boolean, default=True)
    is_verified: Mapped[bool]=mapped_column(Boolean, default=False)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=utcnow)
    resources: Mapped[list["Resource"]]=relationship(back_populates="owner", foreign_keys="Resource.owner_id")

class Resource(Base):
    __tablename__="resources"
    __table_args__=(CheckConstraint("capacity >= 1", name="ck_resource_capacity_positive"), Index("ix_resources_search", "category", "status", "location"))
    id: Mapped[int]=mapped_column(primary_key=True)
    owner_id: Mapped[int]=mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str]=mapped_column(String(180), index=True)
    description: Mapped[str]=mapped_column(Text)
    category: Mapped[str]=mapped_column(String(60), index=True)
    location: Mapped[str]=mapped_column(String(255), index=True)
    institution: Mapped[str|None]=mapped_column(String(180), nullable=True)
    status: Mapped[ResourceStatus]=mapped_column(Enum(ResourceStatus, name="resource_status"), default=ResourceStatus.ACTIVE, index=True)
    capacity: Mapped[int]=mapped_column(Integer, default=1)
    requires_training: Mapped[bool]=mapped_column(Boolean, default=False)
    required_qualification: Mapped[str|None]=mapped_column(String(180), nullable=True)
    supervision_required: Mapped[bool]=mapped_column(Boolean, default=False)
    deposit_amount: Mapped[float]=mapped_column(Numeric(10,2), default=0)
    usage_rules: Mapped[str]=mapped_column(Text, default="")
    min_booking_minutes: Mapped[int]=mapped_column(Integer, default=30)
    max_booking_minutes: Mapped[int]=mapped_column(Integer, default=480)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    owner: Mapped[User]=relationship(back_populates="resources", foreign_keys=[owner_id])

class Eligibility(Base):
    __tablename__="eligibility_records"
    __table_args__=(UniqueConstraint("user_id", "requirement", name="uq_user_requirement"),)
    id: Mapped[int]=mapped_column(primary_key=True)
    user_id: Mapped[int]=mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    requirement: Mapped[str]=mapped_column(String(180))
    verified: Mapped[bool]=mapped_column(Boolean, default=False)
    verified_by: Mapped[int|None]=mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    evidence_note: Mapped[str|None]=mapped_column(String(500), nullable=True)
    expires_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=utcnow)

class Booking(Base):
    __tablename__="bookings"
    __table_args__=(CheckConstraint("end_at > start_at", name="ck_booking_time_order"), Index("ix_booking_resource_time", "resource_id", "start_at", "end_at"), Index("ix_booking_user_status", "user_id", "status"))
    id: Mapped[int]=mapped_column(primary_key=True)
    resource_id: Mapped[int]=mapped_column(ForeignKey("resources.id", ondelete="RESTRICT"), index=True)
    user_id: Mapped[int]=mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    start_at: Mapped[datetime]=mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime]=mapped_column(DateTime(timezone=True))
    purpose: Mapped[str]=mapped_column(String(500))
    status: Mapped[BookingStatus]=mapped_column(Enum(BookingStatus, name="booking_status"), default=BookingStatus.PENDING, index=True)
    decision_note: Mapped[str|None]=mapped_column(String(500), nullable=True)
    reviewed_by: Mapped[int|None]=mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    waitlist_position: Mapped[int|None]=mapped_column(Integer, nullable=True)
    checked_in_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)
    returned_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=utcnow)

class ConditionReport(Base):
    __tablename__="condition_reports"
    id: Mapped[int]=mapped_column(primary_key=True)
    booking_id: Mapped[int]=mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), index=True)
    submitted_by: Mapped[int]=mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    stage: Mapped[str]=mapped_column(String(20)) # before or after
    condition: Mapped[str]=mapped_column(String(30)) # excellent/good/fair/damaged
    notes: Mapped[str]=mapped_column(String(1000), default="")
    photo_urls: Mapped[list]=mapped_column(JSON, default=list)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=utcnow)

class Incident(Base):
    __tablename__="incidents"
    id: Mapped[int]=mapped_column(primary_key=True)
    booking_id: Mapped[int]=mapped_column(ForeignKey("bookings.id", ondelete="RESTRICT"), index=True)
    reported_by: Mapped[int]=mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    incident_type: Mapped[str]=mapped_column(String(40))
    description: Mapped[str]=mapped_column(String(2000))
    status: Mapped[IncidentStatus]=mapped_column(Enum(IncidentStatus, name="incident_status"), default=IncidentStatus.OPEN)
    resolution_note: Mapped[str|None]=mapped_column(String(1000), nullable=True)
    reviewed_by: Mapped[int|None]=mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)

class AuditEvent(Base):
    __tablename__="audit_events"
    id: Mapped[int]=mapped_column(primary_key=True)
    actor_id: Mapped[int|None]=mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str]=mapped_column(String(80), index=True)
    entity_type: Mapped[str]=mapped_column(String(50), index=True)
    entity_id: Mapped[int|None]=mapped_column(Integer, nullable=True, index=True)
    details: Mapped[dict]=mapped_column(JSON, default=dict)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=utcnow, index=True)

class Notification(Base):
    __tablename__="notifications"
    id: Mapped[int]=mapped_column(primary_key=True)
    user_id: Mapped[int]=mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str]=mapped_column(String(180))
    message: Mapped[str]=mapped_column(String(1000))
    read_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=utcnow)
