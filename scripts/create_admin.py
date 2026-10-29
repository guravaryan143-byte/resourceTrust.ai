"""Create the first administrator. Usage: python -m scripts.create_admin"""
import getpass
from sqlalchemy import select
from app.db.session import SessionLocal
from app.core.security import hash_password
from app.models.models import User, Role

def main():
    email=input("Admin email: ").strip().lower()
    name=input("Admin full name: ").strip()
    password=getpass.getpass("Password (10+ characters): ")
    db=SessionLocal()
    try:
        if db.scalar(select(User).where(User.email==email)):
            raise SystemExit("A user with that email already exists. Promote them using the admin API if appropriate.")
        user=User(email=email,full_name=name,password_hash=hash_password(password),role=Role.ADMIN,is_verified=True)
        db.add(user); db.commit()
        print(f"Created admin account for {email}. Sign in at POST /api/v1/auth/login")
    finally: db.close()
if __name__=="__main__": main()
