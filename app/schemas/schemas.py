from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from app.models.models import Role, ResourceStatus, BookingStatus, IncidentStatus

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=10, max_length=128)
    role: Role = Role.USER
    institution: str | None = Field(default=None, max_length=180)
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; email: EmailStr; full_name: str; role: Role; institution: str | None; is_active: bool; is_verified: bool; created_at: datetime
class TokenOut(BaseModel): access_token: str; token_type: str = "bearer"
class LoginIn(BaseModel): email: EmailStr; password: str
class ResourceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    description: str = Field(min_length=10, max_length=5000)
    category: str = Field(min_length=2, max_length=60)
    location: str = Field(min_length=2, max_length=255)
    institution: str | None = Field(default=None, max_length=180)
    capacity: int = Field(default=1, ge=1, le=1000)
    requires_training: bool = False
    required_qualification: str | None = Field(default=None, max_length=180)
    supervision_required: bool = False
    deposit_amount: Decimal = Field(default=Decimal("0.00"), ge=0, le=1000000)
    usage_rules: str = Field(default="", max_length=5000)
    min_booking_minutes: int = Field(default=30, ge=15, le=1440)
    max_booking_minutes: int = Field(default=480, ge=15, le=10080)
    @model_validator(mode="after")
    def validate_duration(self):
        if self.max_booking_minutes < self.min_booking_minutes: raise ValueError("max_booking_minutes must be >= min_booking_minutes")
        if self.requires_training and not self.required_qualification: raise ValueError("required_qualification is required when training is required")
        return self
class ResourceOut(ResourceCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int; owner_id: int; status: ResourceStatus; created_at: datetime; updated_at: datetime
class BookingCreate(BaseModel):
    resource_id: int
    start_at: datetime
    end_at: datetime
    purpose: str = Field(min_length=10, max_length=500)
    @model_validator(mode="after")
    def validate_time(self):
        if self.start_at.tzinfo is None or self.end_at.tzinfo is None: raise ValueError("start_at and end_at must include a timezone")
        if self.end_at <= self.start_at: raise ValueError("end_at must be after start_at")
        if self.start_at <= datetime.now(self.start_at.tzinfo): raise ValueError("start_at must be in the future")
        return self
class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; resource_id: int; user_id: int; start_at: datetime; end_at: datetime; purpose: str; status: BookingStatus; decision_note: str | None; reviewed_by: int | None; waitlist_position: int | None; checked_in_at: datetime | None; returned_at: datetime | None; created_at: datetime
class DecisionIn(BaseModel): decision: str = Field(pattern="^(approve|reject|waitlist)$"); note: str | None = Field(default=None, max_length=500)
class ConditionIn(BaseModel):
    stage: str = Field(pattern="^(before|after)$")
    condition: str = Field(pattern="^(excellent|good|fair|damaged)$")
    notes: str = Field(default="", max_length=1000)
    photo_urls: list[str] = Field(default_factory=list, max_length=8)
class IncidentCreate(BaseModel):
    incident_type: str = Field(min_length=2, max_length=40)
    description: str = Field(min_length=10, max_length=2000)
class IncidentDecision(BaseModel):
    status: IncidentStatus
    resolution_note: str = Field(min_length=3, max_length=1000)
class EligibilityCreate(BaseModel):
    requirement: str = Field(min_length=2, max_length=180)
    evidence_note: str | None = Field(default=None, max_length=500)
class EligibilityDecision(BaseModel):
    verified: bool
    evidence_note: str | None = Field(default=None, max_length=500)
class ResourceStatusIn(BaseModel): status: ResourceStatus
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; user_id: int; title: str; message: str; read_at: datetime | None; created_at: datetime
class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; actor_id: int | None; action: str; entity_type: str; entity_id: int | None; details: dict; created_at: datetime
