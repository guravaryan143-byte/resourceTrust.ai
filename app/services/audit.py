from sqlalchemy.orm import Session
from app.models.models import AuditEvent, Notification

def audit(db: Session, actor_id: int | None, action: str, entity_type: str, entity_id: int | None, details: dict | None = None):
    db.add(AuditEvent(actor_id=actor_id, action=action, entity_type=entity_type, entity_id=entity_id, details=details or {}))
def notify(db: Session, user_id: int, title: str, message: str):
    db.add(Notification(user_id=user_id, title=title, message=message))
