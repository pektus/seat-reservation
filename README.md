# SeatSpace — Workplace Seat Reservation System

> A single-tenant, modular workplace seat/desk reservation platform inspired by Skedda. Built with **NestJS**, **Vue 3**, **PostgreSQL**, and designed around **Autonomous Vertical Slices** following strict Test-Driven Development (TDD) and AI-DLC engineering principles.

---

## ✨ Features & Capabilities

### 1. Interactive Visual Floor Plan & Hot-Desking (Core UX)
* **High-Resolution Architectural Floor Plans**:
  * Displays architectural CAD floor plans directly in the browser ([`FloorPlanCanvas.vue`](apps/web/src/components/floorplan/FloorPlanCanvas.vue)).
  * **Dual Blueprint Styles**: Toggle between **🏢 Architectural CAD** (`floorplan-office.jpg`) and **📐 Vector Blueprint SVG** (`demo-floorplan.svg`) directly from the canvas toolbar.
* **Responsive Coordinate Engine & Zoom/Pan**:
  * Desks are placed using percentage coordinates `(x%, y%)`, ensuring markers scale accurately across all displays, tablets, and zoom levels without pixel distortion.
  * **Zoom & Pan Controls**: Multi-level zoom (50% to 500%), mouse wheel zoom, middle/right-click panning, spacebar navigation, and one-click fit-to-screen.
  * **Marker Sizing Scale**: Micro-scale 1:150 architectural pins (`XS`), compact markers (`S`), standard (`M`), and high-visibility (`L`) sizing.
* **Real-Time Color-Coded Desk Statuses**:
  * 🟢 **Available (Emerald)**: Ready for immediate whole-day reservation.
  * 🟡 **Your Booking (Amber)**: Highlights your active desk reservation.
  * ⚪ **Reserved (Slate)**: Reserved by a colleague or guest.
  * 🔴 **Needs Review (Pulsing Red Badge)**: Alerts managers that a desk position needs review following a floor plan replacement.
  * 🔵 **Selected (Blue Ring)**: The desk currently focused in the booking modal.
* **Accessibility (WCAG 2.1 AA) & Keyboard Navigation**:
  * Desks feature full keyboard navigation (`Tab` focus, `Enter` / `Space` to select), descriptive dynamic ARIA labels, and high-contrast focus rings.
  * **Accessible Table / List View Toggle**: One-click switch from visual 2D floor plan map to a fully accessible tabular view for screen readers and keyboard-only navigation.
* **Building Timezone Integration**:
  * Reservation dates and availability automatically format according to the selected building's designated timezone (`Intl.DateTimeFormat`), ensuring cross-region date accuracy.

### 2. Whole-Day Reservation Engine & Concurrency Protection
* **Single-Day Booking Model**: Streamlined whole-day reservation without micro-slot scheduling friction.
* **Atomic Race-Condition Prevention (Double-Booking Guard)**:
  * Enforced at the PostgreSQL ACID storage engine level via a partial unique index:
    ```sql
    CREATE UNIQUE INDEX uq_active_desk_reservation_per_date 
    ON reservations (desk_id, reservation_date) 
    WHERE status = 'CONFIRMED';
    ```
  * Concurrent booking attempts for the same desk & date atomically commit the first transaction; subsequent requests fail with `409 Conflict`.
* **One Personal Booking per User per Date**:
  * Database-enforced partial unique constraint guarantees employees can only hold one personal reservation on any given calendar date:
    ```sql
    CREATE UNIQUE INDEX uq_one_personal_reservation_per_user_date
    ON reservations (reserved_by_user_id, reservation_date)
    WHERE status = 'CONFIRMED' AND is_guest = FALSE;
    ```
* **Visitor / Guest Proxy Bookings**:
  * Employees can check **"Reserve on behalf of an external Guest"** to input visitor names and optional contact info without requiring IT account provisioning. Guest bookings are exempt from personal booking limits.
* **"My Reservations" Self-Service Drawer**:
  * Employees can access **"📅 My Bookings"** in the top navigation to view their active and past bookings, see guest status, and immediately cancel seats to release them back into circulation.
* **Instant Cancellation & Supervisor Override**:
  * Cancelling marks `status = 'CANCELLED'`, immediately releasing the unique index. Building Managers and System Administrators hold supervisor override rights to cancel bookings across their buildings.

### 3. Privacy & Scoped Access Governance
* **Privacy-Safe Floor Availability**:
  * Unauthenticated callers and standard employees viewing floor availability see availability status only (`AVAILABLE` / `RESERVED`).
  * Occupant identity (`bookedFor`) is strictly restricted to **System Administrators**, assigned **Building Managers**, and the reserving user themselves on their own booking.
* **Building-Scoped Manager Access**:
  * `BUILDING_MANAGER` permissions are strictly scoped to assigned building UUIDs for both reads (`listBuildings`, `listFloors`, `listFloorPlans`) and mutations (creating/deleting floors, uploading plans, placing desks, canceling reservations).
* **Immediate Token Invalidation on Role Changes**:
  * The `users` table tracks a `token_version`. Whenever user roles or building scopes are updated via `PUT /api/v1/auth/users/:id/roles`, `token_version` increments, instantly invalidating stale JWTs.

### 4. Workplace & Layout Administration (Manager Controls)
* **Physical Asset Hierarchy**:
  * Models `Company → Building → Floor → Floor Plan Image → Desks`.
* **Click-to-Place Desk Placement**:
  * Authorized managers can enter placement mode and click anywhere on the canvas to drop hot-desks with specific codes, labels, types (`STANDARD`, `COLLABORATIVE`, `QUIET`, `STANDING`), and amenities.
* **Floor Plan Replacement & Review Workflow**:
  * When a floor plan is replaced, existing desks are preserved and flagged with `needs_position_review = TRUE` with `previous_floor_plan_id` recorded.
  * **Canvas Repositioning Workflow**: Managers can click **"📐 Reposition"** on any flagged desk to click a new canvas position and update coordinates via `PATCH /workplace/desks/:id/coordinates`.
  * **Standardized Review Acknowledgment**: Managers confirm alignment via canonical endpoint `POST /workplace/desks/:id/acknowledge-review` (with backward-compatible `/review-ack` alias).
* **Upload Security & Sanitization**:
  * Enforces a strict 5MB upload size ceiling.
  * Sanitizes vector graphics (`image/svg+xml`) by rejecting files containing `<script>`, `<foreignObject>`, inline event handlers (`onload`, `onerror`), entity declarations (`<!ENTITY`), or `javascript:` URI schemas.

### 5. Production Security & First-Run Setup
* **First-Run Installation Wizard (`/setup`)**:
  * **Database Connection Tester**: Pings PostgreSQL with live latency diagnostics before saving.
  * **Master Recovery Admin Setup**: Provisions an initial break-glass administrator with high-entropy password validation ($\ge 12$ characters). Default placeholders have been eliminated.
  * **Permanent Security Lockout**: Once completed, the wizard creates a physical lock file (`setup.lock`) and permanent DB record; all future requests to `/setup` return `403 Forbidden`.
  * **Production Credential Requirements**: In production mode (`NODE_ENV === 'production'`), explicit, non-default `DB_PASSWORD` and `JWT_SECRET` environment variables are required. Missing credentials halt server boot with fatal errors.
* **Break-Glass Recovery Account**:
  * A dedicated local administrator account that bypasses corporate SSO, ensuring access if Active Directory or identity federation is down.

### 6. Built-in Onboarding & Evaluation Sandbox
* **Interactive Guided Walkthrough ("💡 How to Use")**:
  * An interactive 6-step modal tour ([`GuidedTourModal.vue`](apps/web/src/components/guided-tour/GuidedTourModal.vue)) introducing floor selection, status indicators, guest reservations, and manager audit workflows.
* **Safe Sandbox Seeding & Reset**:
  * Pre-loaded with *"Acme Tech HQ — Main Tower Floor 4"* and 12 hot-desks mapped across 3 functional pods (Quiet, Team Collaboration, and Standing Desks).
  * **Data Isolation Invariant**: Demo entities are explicitly flagged with `is_demo = TRUE`. Resets cancel user-created demo bookings and restore baseline sample bookings without touching real corporate organizations, live users, or production reservations.

---

## 🏛 Architecture & Autonomous Vertical Slices

The backend avoids traditional anemic horizontal layers and is structured into autonomous vertical slices ([`apps/api/src/slices/`](apps/api/src/slices/)), each encapsulating its own API contracts, CQS commands/queries, business domain logic, and persistence mappers:

| Slice | Domain & Scope | Key Responsibilities |
|---|---|---|
| **Slice 1: `system-setup`** | Installation & Locking | Database connectivity validation, master recovery admin provisioning, one-time `/setup` lock flag. |
| **Slice 2: `identity-access`** | Auth & RBAC | JWT generation, break-glass local recovery bypass, role authorization guards (`SYSTEM_ADMIN`, `BUILDING_MANAGER`, `EMPLOYEE`), `token_version` invalidation. |
| **Slice 3: `workplace-management`** | Physical Layout & Assets | Company, Building, Floor entities, PNG/JPG/SVG floor plan uploads, click-to-place coordinates, replacement audit flags, desk repositioning. |
| **Slice 4: `reservation-engine`** | Booking & Concurrency | Whole-day desk reservations, PostgreSQL atomic partial unique indexes preventing double-booking & multiple personal bookings, visitor proxy bookings, privacy filtering. |
| **Slice 5: `audit-logging`** | Compliance & Traceability | Asynchronous domain event listener recording immutable audit logs. |
| **Slice 6: `demo-sandbox`** | Evaluation & Onboarding | Pre-bundled SVG/PNG office floor plan layout, 12+ pre-positioned demo desks, safe isolated sandbox seeder and reset commands. |

---

## 📂 Repository Structure

```
seat-reservation/
├── apps/
│   ├── api/                     # NestJS Modular Monolith API
│   │   ├── src/
│   │   │   ├── common/          # Cross-cutting primitives (Result<T>, Global Filters, Pipes)
│   │   │   ├── slices/          # Autonomous Vertical Slices (1 through 6)
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── test/                # E2E and integration test suites
│   └── web/                     # Vue 3 Single Page Application (Vite + Tailwind CSS + Pinia)
│       ├── public/
│       │   ├── floorplan-office.jpg # High-res architectural office CAD layout
│       │   └── demo-floorplan.svg   # Vector blueprint diagram
│       └── src/
│           ├── api/             # Type-safe API client & services
│           ├── components/
│           │   ├── floorplan/   # Interactive click-to-place FloorPlanCanvas (Zoom/Pan/A11y)
│           │   └── guided-tour/ # "How to Use" step-by-step interactive walkthrough
│           ├── router/          # Vue Router with dynamic import.meta.env.BASE_URL
│           ├── stores/          # Pinia Auth & Session Store
│           └── views/           # FloorPlanView, SetupView, LoginView
├── packages/
│   └── contracts/               # Shared TypeScript DTOs, Enums, and Request/Response interfaces
├── deploy/
│   ├── apache/seat-reservation.conf         # Production Apache VirtualHost & reverse proxy (/seats/)
│   ├── systemd/seat-reservation-api.service # Production systemd daemon unit
│   └── env/production.env.example           # Hardened production environment template
├── docs/
│   ├── discovery/               # Discovery notes and Round 1 decisions
│   ├── specification/           # Formal System Specification & Blueprint
│   └── deployment/              # Operations and production runbook
├── docker-compose.yml           # PostgreSQL 16 container definition
├── package.json                 # Monorepo root workspace configuration
└── tsconfig.base.json           # Shared strict TypeScript base config
```

---

## 🌐 Context Path & Base URL Deployment (`/seats/` vs Custom Sub-Path)

The frontend Single Page Application is pre-configured to be deployed under the context path **`/seats/`** (e.g., `https://your-domain.com/seats/`).

### How Context Path Routing Works
1. **Vite Build Base**: Configured in [`apps/web/vite.config.ts`](apps/web/vite.config.ts) via `base: '/seats/'`. All compiled script and style tags in `index.html` are prefixed with `/seats/assets/...`.
2. **Dynamic HTML5 History Router**: [`apps/web/src/router/index.ts`](apps/web/src/router/index.ts) uses `createWebHistory(import.meta.env.BASE_URL)`. It dynamically picks up the base URL from Vite without hardcoding.
3. **Favicon & Public Assets**: [`apps/web/index.html`](apps/web/index.html) references icons via `%BASE_URL%vite.svg`, resolving accurately in all contexts.

---

### 🔧 What Files to Change to Move to a Different Context Path

If you need to change the deployment context path (for example, to root **`/`** or to a custom sub-path like **`/reservations/`** or **`/workplace/`**), modify the following files:

#### 1. Frontend Build Base Path — [`apps/web/vite.config.ts`](apps/web/vite.config.ts)
Update the `base` property to your target context:
```typescript
export default defineConfig({
  // For root deployment:
  // base: '/',

  // For /seats/ deployment (current default):
  base: '/seats/',

  // For a custom sub-path:
  // base: '/reservations/',
  
  plugins: [vue()],
  // ...
});
```

#### 2. Apache VirtualHost Reverse Proxy — [`deploy/apache/seat-reservation.conf`](deploy/apache/seat-reservation.conf)
Update the `Alias` and `FallbackResource` directives in your Apache configuration:

* **For `/seats/` deployment (current default)**:
  ```apache
  Alias /seats /var/www/seatspace/dist
  <Directory /var/www/seatspace/dist>
      Options -Indexes +FollowSymLinks
      AllowOverride None
      Require all granted
      FallbackResource /seats/index.html
  </Directory>
  RedirectMatch 302 ^/$ /seats/
  ```

* **For Root `/` deployment**:
  ```apache
  DocumentRoot /var/www/seatspace/dist
  <Directory /var/www/seatspace/dist>
      Options -Indexes +FollowSymLinks
      AllowOverride None
      Require all granted
      FallbackResource /index.html
  </Directory>
  ```

* **For a Custom Sub-Path (e.g. `/reservations/`)**:
  ```apache
  Alias /reservations /var/www/seatspace/dist
  <Directory /var/www/seatspace/dist>
      Options -Indexes +FollowSymLinks
      AllowOverride None
      Require all granted
      FallbackResource /reservations/index.html
  </Directory>
  RedirectMatch 302 ^/$ /reservations/
  ```

#### 3. API Client Base URL (Only if API path changes) — [`apps/web/src/api/client.ts`](apps/web/src/api/client.ts)
By default, the client requests `/api/v1` (which is reverse-proxied by Apache to `http://127.0.0.1:3000/api/v1`). If your reverse proxy exposes the API under the same sub-path (e.g. `/seats/api/v1` or `/reservations/api/v1`), adjust `BASE_URL`:
```typescript
export class ApiClient {
  private static readonly BASE_URL = '/api/v1'; // Or '/seats/api/v1' / '/reservations/api/v1'
  // ...
}
```

#### 4. Rebuild the Frontend
Whenever you modify `vite.config.ts`, recompile the static bundle:
```bash
npm run build --workspace=apps/web
```
The output will be placed in `apps/web/dist/`, ready to be copied to your Apache web root.

---

## 🚀 Quickstart & Local Development

### 1. Prerequisites
- **Node.js**: v20+ 
- **npm** (v10+)
- **Docker**: For running PostgreSQL locally

### 2. Start PostgreSQL
```bash
# Start local PostgreSQL 16 container with healthcheck
docker compose up -d postgres
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Build Shared Contracts & Packages
```bash
npm run build --workspace=packages/contracts
```

### 5. Start Backend API
```bash
npm run dev:api
# Running on http://localhost:3000/api/v1
```

### 6. Start Frontend Web Client
```bash
npm run dev:web
# Running on http://localhost:5173/seats/
```

---

## 🎯 Demo & Evaluation Walkthrough

1. Open `http://localhost:5173/seats/` in your browser.
2. Click **"💡 How to Use (Demo Tour)"** in the top navigation bar to launch the step-by-step interactive walkthrough.
3. Test reserving seats:
   - Click any green desk marker (e.g. `D-01` or `D-05`).
   - Choose to book for yourself or check **"Reserve on behalf of an external Guest"** to test visitor bookings.
4. Click **"Reset Sandbox"** at any time to return demo bookings back to pristine baseline.
5. To test the first-run installation wizard, navigate to `http://localhost:5173/seats/setup`.

---

## 🧪 Testing Strategy (TDD)

All packages enforce strict Test-Driven Development. Unit, integration, and database-backed concurrency test suites are executed via:

```bash
# Run all test suites across the monorepo (16 suites, 85 tests)
npm test

# Run specific integration tests against live PostgreSQL
npm test -- apps/api/src/slices/demo-sandbox/demo-isolation-and-privacy.spec.ts
npm test -- apps/api/src/slices/reservation-engine/reservation-concurrency.spec.ts

# Build all monorepo workspaces for production
npm run build --workspaces
```

---

## 🐧 Production Deployment on Linux (Manual, No Docker)

This guide walks through deploying SeatSpace on a Linux server (Ubuntu 22.04/24.04 LTS, Debian 12, or RHEL 9) **without Docker**, connecting directly to an **existing external PostgreSQL server** (on-premise or managed cloud instance like Amazon RDS, GCP Cloud SQL, or Azure Database).

### Architecture Overview
```
[User Browser / Corporate LAN]
          │  HTTPS (Port 443)
          ▼
┌─────────────────────────────────────────────────────────────┐
│ Linux Application Host (Ubuntu / Debian / RHEL)             │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Apache HTTPD 2.4 (SSL Termination & Reverse Proxy)    │  │
│  │  - Serves Vue 3 SPA at /seats/ (/var/www/seatspace/   │  │
│  │    dist) with FallbackResource /seats/index.html      │  │
│  │  - Reverse-proxies /api/v1 -> 127.0.0.1:3000          │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ HTTP (Loopback Only)          │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ NestJS API Service (Systemd: seat-reservation-api)   │  │
│  │  - User: seatspace (Non-root, Sandboxed)              │  │
│  │  - Port: 127.0.0.1:3000                               │  │
│  └──────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ TCP (Port 5432 / TLS)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Existing External PostgreSQL Server (v14 / v15 / v16+)      │
│  - Database: seat_reservation_prod                          │
│  - User: seatspace_app                                      │
└─────────────────────────────────────────────────────────────┘
```

---

### Step 1: Install Host Prerequisites
On the Linux application host, install Node.js 20 LTS, Apache 2.4, and required tools:

```bash
# Ubuntu / Debian: Update package lists and install utilities
sudo apt update && sudo apt install -y apache2 curl git libcap2-bin

# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
node -v    # Must be v20.x+
npm -v     # Must be v10.x+

# Enable required Apache modules
sudo a2enmod proxy proxy_http ssl rewrite headers expires
sudo systemctl restart apache2
```

---

### Step 2: Configure the Existing PostgreSQL Server
On your **existing PostgreSQL server**, create a dedicated database and least-privilege user account:

```sql
-- 1. Create a dedicated application user
CREATE ROLE seatspace_app WITH LOGIN PASSWORD 'YOUR_STRONG_PASSWORD_HERE';

-- 2. Create the application database owned by this user
CREATE DATABASE seat_reservation_prod OWNER seatspace_app;

-- 3. Grant schema permissions
\c seat_reservation_prod
GRANT ALL ON SCHEMA public TO seatspace_app;
```

---

### Step 3: Create Service User and Directories
On the Linux application host, create an isolated non-login system user and set up the directory tree:

```bash
# Create dedicated non-login service user
sudo useradd -r -s /bin/false -d /var/www/seatspace seatspace

# Create application folders
sudo mkdir -p /var/www/seatspace/dist
sudo mkdir -p /var/www/seatspace/apps/api
sudo mkdir -p /var/www/seatspace/storage/uploads
sudo mkdir -p /etc/seat-reservation

# Set secure permissions
sudo chown -R seatspace:seatspace /var/www/seatspace
sudo chmod -R 750 /var/www/seatspace
sudo chmod 700 /etc/seat-reservation
```

---

### Step 4: Build Application Artifacts
Clone the repository and build both the Vue 3 frontend and NestJS API:

```bash
# 1. Clone your repository to a temporary build directory
git clone https://github.com/your-org/seat-reservation.git /tmp/seat-reservation-build
cd /tmp/seat-reservation-build

# 2. Install workspace dependencies
npm ci

# 3. Compile shared contracts, backend API, and frontend client
npm run build --workspaces

# 4. Deploy Vue 3 static client assets to Apache DocumentRoot
sudo cp -r apps/web/dist/* /var/www/seatspace/dist/
sudo chown -R www-data:www-data /var/www/seatspace/dist

# 5. Deploy NestJS compiled backend to the service directory
sudo cp -r apps/api/dist /var/www/seatspace/apps/api/
sudo cp -r apps/api/node_modules /var/www/seatspace/apps/api/
sudo cp apps/api/package.json /var/www/seatspace/apps/api/
sudo cp -r packages /var/www/seatspace/
sudo chown -R seatspace:seatspace /var/www/seatspace/apps/api /var/www/seatspace/packages

# 6. Clean up temporary build files
rm -rf /tmp/seat-reservation-build
```

---

### Step 5: Configure Environment Variables
Copy the production environment template to `/etc/seat-reservation/api.env`:

```bash
sudo cp deploy/env/production.env.example /etc/seat-reservation/api.env
sudo chown seatspace:seatspace /etc/seat-reservation/api.env
sudo chmod 600 /etc/seat-reservation/api.env
```

Populate your external PostgreSQL credentials and secure secrets:

```ini
# Application Runtime
NODE_ENV=production
PORT=3000

# Connection to Existing External PostgreSQL Server
DB_HOST=10.0.1.50                    # IP or hostname of your PostgreSQL server
DB_PORT=5432
DB_USER=seatspace_app
DB_PASSWORD=YOUR_STRONG_PASSWORD_HERE
DB_NAME=seat_reservation_prod
DB_SSL=false                         # Set to true if connecting with SSL/TLS
DATABASE_URL=postgresql://seatspace_app:YOUR_STRONG_PASSWORD_HERE@10.0.1.50:5432/seat_reservation_prod

# Security Secrets (Generate using: openssl rand -hex 32)
JWT_SECRET=c38e94fa10b9876251dbfa5821094892c908234abecdf0912837461928374619
JWT_EXPIRES_IN=8h

# File Storage & Lock Paths
UPLOAD_DEST=/var/www/seatspace/storage/uploads
STORAGE_MAX_FILE_SIZE_MB=5
SETUP_LOCK_FILE=/var/www/seatspace/storage/setup.lock
```

---

### Step 6: Configure and Start Systemd Daemon

```bash
# Copy unit configuration file
sudo cp deploy/systemd/seat-reservation-api.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable service to start automatically on system boot
sudo systemctl enable seat-reservation-api

# Start the API service
sudo systemctl start seat-reservation-api

# Verify service status
sudo systemctl status seat-reservation-api
```

---

### Step 7: Configure Apache VirtualHost & Reverse Proxy

Deploy [`deploy/apache/seat-reservation.conf`](deploy/apache/seat-reservation.conf):

```bash
# Copy Apache site configuration
sudo cp deploy/apache/seat-reservation.conf /etc/apache2/sites-available/seat-reservation.conf
```

Edit `/etc/apache2/sites-available/seat-reservation.conf`:
- Update `ServerName` to your actual domain name or server IP (e.g. `seats.company.com`).
- Update SSL certificate paths:
  ```apache
  SSLCertificateFile /etc/ssl/certs/your-domain.crt
  SSLCertificateKeyFile /etc/ssl/private/your-domain.key
  ```

Enable the site and reload Apache:
```bash
# Verify Apache configuration syntax
sudo apache2ctl configtest

# Enable seat-reservation site and disable default Apache landing page
sudo a2ensite seat-reservation.conf
sudo a2dissite 000-default.conf

# Reload Apache
sudo systemctl reload apache2
```

---

### Step 8: Complete First-Run Initialization & Database Migration
1. Open your browser and navigate to:
   ```
   https://<your-server-domain-or-ip>/seats/setup
   ```
2. **Step 1 (Database Connection)**:
   - Enter your external PostgreSQL connection details (`DB_HOST`, `DB_PORT`, `seatspace_app`, password, `seat_reservation_prod`).
   - Click **"Test Connection"** to verify live database latency and credentials.
3. **Step 2 (Organization & Break-Glass Master Admin)**:
   - Enter your company name (e.g., *Acme Corporation*).
   - Enter the recovery administrator's full name, email, and master password ($\ge 12$ characters).
4. **Step 3 (Authentication & Lockout)**:
   - Review provider settings and click **"Initialize & Lock System"**.
   - PostgreSQL schema migrations, indexes, core roles, and the break-glass administrator are initialized, and the lock file is persisted.
   - Subsequent requests to `/seats/setup` return `403 Forbidden`.

---

## 🔐 Enterprise SSO Configuration: Apache HTTPD + `mod_auth_gssapi` (Kerberos / SPNEGO)

SeatSpace supports corporate Single Sign-On (SSO) using Kerberos / SPNEGO via Apache HTTPD's `mod_auth_gssapi` module. In this topology, Apache HTTPD negotiates authentication with the client browser and domain controller (Active Directory or FreeIPA), then forwards the verified user identity to the NestJS API over trusted loopback headers.

```
┌─────────────────────────────────┐
│ Domain-Joined Client (Browser)  │
└────────────────┬────────────────┘
                 │ 1. HTTPS GET /api/v1/auth/sso
                 │ 2. HTTP 401 Unauthorized (WWW-Authenticate: Negotiate)
                 │ 3. HTTPS GET with Kerberos Ticket (Authorization: Negotiate YII...)
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Apache HTTPD 2.4+ (mod_auth_gssapi)                                         │
│  - Decrypts and validates SPNEGO ticket using /etc/apache2/seatspace.keytab │
│  - Validates client Kerberos principal (e.g., adrian@CORP.COMPANY.LOCAL)   │
│  - Sets REMOTE_USER = "adrian" (GssapiLocalName on)                        │
│  - Strips any untrusted client X-Remote-User headers                        │
│  - Injects verified header: X-Remote-User: adrian                           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Loopback Proxy (127.0.0.1:3000)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ NestJS API Service (apps/api)                                               │
│  - Reads verified X-Remote-User from trusted loopback connection            │
│  - Matches corporate username/email to user database record                 │
│  - Issues authenticated application JWT session                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 1. Infrastructure Prerequisites

1. **Active Directory / FreeIPA / MIT Kerberos KDC**: Reachable from the Linux application server.
2. **Canonical Forward & Reverse DNS (Strict Requirement)**:
   Kerberos SPNEGO ticket requests are derived from the server's canonical hostname:
   - Forward DNS (`A` record): `seats.company.local` $\rightarrow$ `10.0.1.50`
   - Reverse DNS (`PTR` record): `10.0.1.50` $\rightarrow$ `seats.company.local`
3. **NTP Clock Synchronization**:
   Kerberos rejects tickets with clock skew $> 300$ seconds. Ensure `chronyd` or `systemd-timesyncd` is active:
   ```bash
   sudo timedatectl status
   ```

---

### 2. Install Required Linux Packages

Install the GSSAPI Apache module and Kerberos client utilities:

* **Ubuntu / Debian**:
  ```bash
  sudo apt update
  sudo apt install -y libapache2-mod-auth-gssapi krb5-user
  sudo a2enmod auth_gssapi
  ```

* **RHEL 9 / Rocky Linux / AlmaLinux**:
  ```bash
  sudo dnf install -y mod_auth_gssapi krb5-workstation
  ```

---

### 3. Kerberos Realm Configuration (`/etc/krb5.conf`)

Configure `/etc/krb5.conf` with your corporate Active Directory domain and KDCs:

```ini
[libdefaults]
    default_realm = CORP.COMPANY.LOCAL
    dns_lookup_realm = false
    dns_lookup_kdc = true
    ticket_lifetime = 24h
    renew_lifetime = 7d
    forwardable = true
    rdns = false
    default_tkt_enctypes = aes256-cts-hmac-sha1-96 aes128-cts-hmac-sha1-96
    default_tgs_enctypes = aes256-cts-hmac-sha1-96 aes128-cts-hmac-sha1-96

[realms]
    CORP.COMPANY.LOCAL = {
        kdc = dc01.corp.company.local:88
        kdc = dc02.corp.company.local:88
        admin_server = dc01.corp.company.local:749
        default_domain = corp.company.local
    }

[domain_realm]
    .corp.company.local = CORP.COMPANY.LOCAL
    corp.company.local = CORP.COMPANY.LOCAL
```

---

### 4. Provision Service Principal Name (SPN) & Generate Keytab

The Kerberos Service Principal Name (SPN) for web services must follow the convention `HTTP/<fully-qualified-domain-name>@<REALM>`.

#### Option A: Active Directory (Domain Controller)
From an elevated Windows PowerShell / Command Prompt on your Domain Controller, run `ktpass` to map a service account and export the keytab:

```cmd
ktpass -princ HTTP/seats.company.local@CORP.COMPANY.LOCAL ^
       -mapuser svc_seatspace@CORP.COMPANY.LOCAL ^
       -pass "ReplaceWithStrongServicePassword123!" ^
       -crypto AES256-SHA1 ^
       -ptype KRB5_NT_PRINCIPAL ^
       -out C:\seatspace.keytab
```

> [!TIP]
> Verify the SPN registration on Active Directory using:
> `setspn -L svc_seatspace`

#### Option B: FreeIPA / Red Hat Identity Management
```bash
ipa service-add HTTP/seats.company.local
ipa-getkeytab -s ipa.company.local -p HTTP/seats.company.local -k /tmp/seatspace.keytab
```

#### Install Keytab on Apache Server
Securely transfer `seatspace.keytab` to the application host:

```bash
# Move keytab to Apache configuration directory
sudo mv /tmp/seatspace.keytab /etc/apache2/seatspace.keytab

# Set ownership to Apache service user
# (Use apache:apache on RHEL/CentOS/Rocky)
sudo chown www-data:www-data /etc/apache2/seatspace.keytab

# Restrict permissions: ONLY the web server process may read the keytab
sudo chmod 0400 /etc/apache2/seatspace.keytab
```

---

### 5. Apache HTTPD VirtualHost Configuration Directives

Add the `mod_auth_gssapi` configuration into [`deploy/apache/seat-reservation.conf`](deploy/apache/seat-reservation.conf) within `<VirtualHost *:443>`:

```apache
# ==============================================================================
# Enterprise SSO (GSSAPI / Kerberos SPNEGO) Configuration
# ==============================================================================

# CRITICAL SECURITY RULE: Strip any client-injected X-Remote-User headers
RequestHeader unset X-Remote-User

# ------------------------------------------------------------------------------
# Topology A: Dedicated SSO Handshake Endpoint (Recommended)
# ------------------------------------------------------------------------------
# Authenticates corporate intranet users transparently via Kerberos while 
# leaving /api/v1/auth/login accessible for local break-glass administrators.
<Location /api/v1/auth/sso>
    AuthType GSSAPI
    AuthName "Corporate Kerberos Single Sign-On"
    
    # Path to Kerberos service keytab
    GssapiCredStore keytab:/etc/apache2/seatspace.keytab
    
    # Strip realm (@CORP.COMPANY.LOCAL) to yield clean username (e.g. 'adrian')
    # Set to 'off' if your database stores usernames as full UPNs/emails.
    GssapiLocalName on
    
    # Disable basic auth fallback (enforce pure Kerberos/SPNEGO negotiation)
    GssapiBasicAuth off
    
    # Performance: Avoid re-negotiating GSSAPI on every request over the same connection
    GssapiNegotiateOnce on
    
    # Require successful Kerberos authentication
    Require valid-user
    
    # Forward the verified Kerberos identity to the backend API
    RequestHeader set X-Remote-User "%{REMOTE_USER}s" env=REMOTE_USER
</Location>

# ------------------------------------------------------------------------------
# Topology B: Whole-Site / Workspace GSSAPI Gatekeeper (Alternative)
# ------------------------------------------------------------------------------
# If you require ALL access to /seats/ and /api/v1 to require a Kerberos ticket,
# protect the root location while whitelisting the local break-glass login:
#
# <Location /seats>
#     AuthType GSSAPI
#     AuthName "Corporate SeatSpace Access"
#     GssapiCredStore keytab:/etc/apache2/seatspace.keytab
#     GssapiLocalName on
#     GssapiNegotiateOnce on
#     Require valid-user
#     RequestHeader set X-Remote-User "%{REMOTE_USER}s" env=REMOTE_USER
# </Location>
#
# # Whitelist local login for emergency break-glass recovery:
# <Location /api/v1/auth/login>
#     AuthType None
#     Require all granted
# </Location>
```

---

### 6. Client Browser Setup (Enterprise Intranet Whitelisting)

Browsers only transmit Kerberos tickets to sites recognized as trusted intranet endpoints:

* **Microsoft Edge & Google Chrome**:
  Deploy via Active Directory Group Policy (GPO):
  - **AuthServerAllowlist**: `seats.company.local,*.company.local`
  - **AuthNegotiateDelegateAllowlist**: `seats.company.local`
  *(Or launch via CLI flag: `--auth-server-allowlist="seats.company.local"`)*
* **Mozilla Firefox**:
  1. Navigate to `about:config`.
  2. Search for `network.negotiate-auth.trusted-uris`.
  3. Set value to: `seats.company.local` (or `https://seats.company.local`).
* **Windows Integrated Windows Authentication (IWA)**:
  Ensure `https://seats.company.local` is listed in **Internet Options $\rightarrow$ Security $\rightarrow$ Local Intranet $\rightarrow$ Sites $\rightarrow$ Advanced**.

---

### 7. DevOps Verification & Troubleshooting Runbook

#### 7.1 Verify Keytab File Integrity
```bash
# Inspect principals and encryption types stored in keytab
sudo klist -k -t -e /etc/apache2/seatspace.keytab
```
*Expected output includes `HTTP/seats.company.local@CORP.COMPANY.LOCAL` with `aes256-cts-hmac-sha1-96`.*

#### 7.2 Test Server-Side Ticket Acquisition
```bash
# Manually test that the keytab authenticates against your KDC
sudo kinit -k -t /etc/apache2/seatspace.keytab HTTP/seats.company.local@CORP.COMPANY.LOCAL
klist
```

#### 7.3 Test Client SPNEGO Negotiation using `curl`
From a domain-joined Linux client or workstation with an active Kerberos ticket:
```bash
# 1. Acquire client ticket
kinit adrian@CORP.COMPANY.LOCAL

# 2. Negotiate authentication with Apache
curl -iv --negotiate -u : https://seats.company.local/api/v1/auth/sso
```
*Expected response*: `HTTP/1.1 200 OK` (or token payload) with `WWW-Authenticate: Negotiate oYG...`.

#### 7.4 Common Issues and Resolution Matrix

| Symptom / Error | Root Cause | Solution |
|---|---|---|
| `HTTP 401 Unauthorized` (Browser prompts for username/password) | Browser does not recognize server as an Intranet site; SPNEGO suppressed. | Add `seats.company.local` to browser's `AuthServerAllowlist` or Windows Local Intranet zone. |
| `gss_acquire_cred() failed: Key table file not found / Permission denied` | Apache process cannot read `/etc/apache2/seatspace.keytab`. | Run `sudo chown www-data:www-data /etc/apache2/seatspace.keytab` and `sudo chmod 0400`. |
| `Clock skew too great (37)` | Server clock is out of sync with Domain Controller by $> 300$ seconds. | Run `sudo chronyc makestep` or check NTP synchronization. |
| `Server not found in Kerberos database (7)` | Client requested a ticket for an SPN that is not registered, or Reverse DNS does not resolve to the canonical name. | Check reverse DNS (`dig -x 10.0.1.50`) and confirm SPN registration (`setspn -Q HTTP/seats.company.local`). |
| `Decryption key not found (35)` | Encryption type mismatch or password changed after keytab export. | Re-export keytab with `-crypto AES256-SHA1` matching the AD account Kerberos attributes. |
| `X-Remote-User spoofing attempt` | Untrusted external client injected custom header. | Ensure `RequestHeader unset X-Remote-User` is declared before setting the header in Apache. |

---

### 🛠 Operational Commands Cheat Sheet

| Task | Command |
|---|---|
| **View API service status** | `sudo systemctl status seat-reservation-api` |
| **Restart API service** | `sudo systemctl restart seat-reservation-api` |
| **Stream API live logs** | `sudo journalctl -u seat-reservation-api -f` |
| **Apache error logs** | `sudo tail -f /var/log/apache2/seatspace_ssl_error.log` |
| **Reload Apache configuration** | `sudo systemctl reload apache2` |
| **Manual DB backup (pg_dump)** | `pg_dump -h <DB_HOST> -U seatspace_app -d seat_reservation_prod -Fc -f backup.dump` |

