# ResourceTrust.ai

A platform for trusted sharing of institutional equipment, rooms, labs, and technical resources. It provides authenticated users, owner/manager/admin roles, eligibility verification, booking approvals and waitlists, check-in/check-out lifecycle, condition reports, incident management, notifications, and a full audit history.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12+, FastAPI, Pydantic v2 |
| ORM / DB | SQLAlchemy 2, Psycopg 3, PostgreSQL 16 |
| Migrations | Alembic |
| Auth | JWT Bearer tokens (python-jose), Argon2 password hashing (pwdlib) |
| Frontend | React 19, Vite 8, lucide-react |
| Container | Docker Compose |

---

## Prerequisites

- **Python 3.12+** (3.13 recommended)
- **Node.js 18+** and npm (for the frontend)
- **Docker Desktop** (optional — for the containerised setup)
- **PostgreSQL 16** (optional — only needed for direct local setup; SQLite works for development and testing)

---

## Quick Start — Docker Compose (recommended)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it.
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and set a strong random `JWT_SECRET_KEY`:
   ```
   JWT_SECRET_KEY=your-very-long-random-secret-here
   ```
4. Build and start all services (PostgreSQL + API + Frontend):
   ```bash
   docker compose up --build
   ```
5. Visit:
   - Frontend: [http://localhost:80](http://localhost:80)
   - API docs: [http://localhost:8000/docs](http://localhost:8000/docs)
   - Health check: [http://localhost:8000/health](http://localhost:8000/health)

> [!NOTE]
> Compose starts PostgreSQL, waits for its health check, then starts the API and frontend. The API automatically runs `Base.metadata.create_all` in `development` mode. For production deployments, run `alembic upgrade head` instead.

---

## Local Backend Setup (without Docker)

> [!TIP]
> For rapid development you can use SQLite by setting `DATABASE_URL=sqlite:///./dev.db`. No PostgreSQL installation needed.

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL and JWT_SECRET_KEY

# 4. (PostgreSQL only) Run database migrations
alembic upgrade head

# 5. Start the development server
uvicorn app.main:app --reload
```

The API will be available at [http://localhost:8000](http://localhost:8000). Interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs).

### Using SQLite for development

Set in `.env`:
```
DATABASE_URL=sqlite:///./dev.db
APP_ENV=development
```

In `development` mode the app automatically creates all tables on startup via `Base.metadata.create_all`.

---

## Frontend Setup

```bash
cd frontend

# Copy environment file
cp .env.example .env
# Edit .env if the API is not at http://localhost:8000

# Install dependencies
npm install

# Start the dev server (hot-reload)
npm run dev
# → http://localhost:5173

# Production build + preview
npm run build
npm run preview
# → http://localhost:4173
```

CORS is pre-configured for ports 5173–5175 and 4173.

---

## Running Tests

```bash
# From the project root
python -m pytest tests/ -v
```

The test suite uses **SQLite** only — no PostgreSQL required.

| Test file | Coverage |
|---|---|
| `tests/test_smoke.py` | Password hashing, JWT encode/decode, edge cases (7 tests) |
| `tests/test_integration_workflow.py` | Full booking lifecycle, waitlist, health endpoint with timeout (3 tests) |
| `tests/test_api_integration.py` | Registration, login, resource CRUD, bookings, fair-use limit, notifications, audit, eligibility, incidents (25 tests) |

---

## Creating the First Admin

Public registration always creates a normal `user` — privileged roles cannot be self-assigned. After the database is running, create the initial admin:

```bash
python -m scripts.create_admin
```

Inside Docker:
```bash
docker compose exec api python -m scripts.create_admin
```

Sign in via `POST /api/v1/auth/login`. Copy `access_token`, then click **Authorize** in the Swagger UI.

An admin can promote users:
```
PATCH /api/v1/admin/users/{user_id}/role?role=owner
```
Allowed values: `user`, `owner`, `manager`, `admin`.

---

## API Overview

```
GET  /health
GET  /

# Auth
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/auth/me

# Resources
GET    /api/v1/resources          (q, category, location, institution, requires_training, limit, offset)
POST   /api/v1/resources
GET    /api/v1/resources/{id}
PATCH  /api/v1/resources/{id}/status

# Eligibility
POST   /api/v1/eligibility
GET    /api/v1/eligibility/me
PATCH  /api/v1/admin/eligibility/{id}

# Bookings
POST   /api/v1/bookings
GET    /api/v1/bookings/me
GET    /api/v1/resources/{id}/bookings
PATCH  /api/v1/bookings/{id}/decision
POST   /api/v1/bookings/{id}/cancel
POST   /api/v1/bookings/{id}/condition
POST   /api/v1/bookings/{id}/check-in
POST   /api/v1/bookings/{id}/check-out

# Incidents
POST   /api/v1/bookings/{id}/incidents
GET    /api/v1/incidents
PATCH  /api/v1/incidents/{id}

# Notifications & Audit
GET    /api/v1/notifications
POST   /api/v1/notifications/{id}/read
GET    /api/v1/audit
```

---

## Main Workflow

1. Register requester and owner accounts (`POST /api/v1/auth/register`).
2. Admin promotes the resource lister to `owner`.
3. Owner creates a resource with conditions, duration limits, location, and training requirements.
4. Requester discovers resources (`GET /api/v1/resources`) and books a time slot (`POST /api/v1/bookings`).
5. Owner approves, rejects, or waitlists the request (`PATCH /api/v1/bookings/{id}/decision`).
6. If training is required, the requester submits eligibility (`POST /api/v1/eligibility`) and an authorised manager/admin verifies it.
7. Once approved: submit initial condition report (stage `before`), then check in.
8. Submit final condition report (stage `after`), then complete return. A `damaged` condition automatically creates an incident for review.
9. Review incidents, inspect notifications, and query `/api/v1/audit` for the full history.

---

## Fairness and Concurrency

- Maximum **3 active bookings** per user (returns HTTP 429 if exceeded).
- A resource row lock serialises concurrent booking requests on PostgreSQL; overlapping bookings are automatically waitlisted.
- Owners retain approval authority; eligibility is verified by a manager/admin.
- All important actions are recorded in the append-only audit log.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `development` | `development` \| `production` |
| `DATABASE_URL` | PostgreSQL localhost | Full SQLAlchemy URL |
| `JWT_SECRET_KEY` | *(unsafe dev value)* | **Must be changed in production** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Token lifetime in minutes |
| `CORS_ORIGINS` | Localhost variants | Comma-separated allowed origins |
| `POSTGRES_PASSWORD` | `change_me_local_only` | Used by Docker Compose |
| `DB_CONNECT_TIMEOUT` | `5` | Seconds before DB connect is aborted |
| `VITE_API_URL` | `http://localhost:8000` | Frontend → API base URL (build arg) |

---

## Honest Limitations

- This is a strong hackathon backend foundation, not a security-audited production service.
- Waitlist promotion after cancellation is not yet automatic — owners must manually review and approve waiting requests.
- Photo evidence is stored as URL metadata only. Real images require private object storage with signed uploads, file-type validation, and retention controls.
- Notifications are persisted in the DB; email/SMS/push delivery requires an external provider.
- No payment/deposit capture, institutional SSO, QR scanner, background overdue scheduler, or formal dispute-resolution SLA.
- Audit history is application-level only. For production, restrict DB write access and consider immutable external audit storage.
- `APP_ENV=production` must use a strong unique JWT secret, TLS, managed PostgreSQL backups, least-privilege credentials, rate limiting, and monitoring.

---

## License

MIT — see [LICENSE](LICENSE).
