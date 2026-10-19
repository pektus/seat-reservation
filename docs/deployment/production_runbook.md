# SeatSpace — Production Deployment & Operations Runbook

> **Target Platform**: Linux (Ubuntu 22.04 LTS / 24.04 LTS, RHEL 9, Debian 12)  
> **Web Server**: Apache HTTP Server 2.4+ (Reverse Proxy & Static SPA Host)  
> **Runtime**: Node.js 20 LTS  
> **Database Engine**: PostgreSQL 16+

---

## 1. Network Topology & Security Boundaries

```
[Corporate Clients / VPN]
          │  HTTPS (Port 443)
          ▼
┌─────────────────────────────────────────────────────────────┐
│ Linux Production Server                                     │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Apache HTTPD (SSL Termination & Static Host)          │  │
│  │  - Serves Vue 3 SPA (/var/www/seatspace/dist)         │  │
│  │  - Enforces HSTS, X-Frame-Options, CSP Headers        │  │
│  │  - Reverse-proxies /api/v1 -> 127.0.0.1:3000          │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ HTTP (Loopback Only)          │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ NestJS API Service (systemd: seatspace-api)           │  │
│  │  - User: seatspace (Non-root, Sandboxed)              │  │
│  │  - Port: 127.0.0.1:3000                               │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ TCP (Loopback / Private LAN)  │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ PostgreSQL 16 Database Service                        │  │
│  │  - Database: seat_reservation_prod                    │  │
│  │  - Partial Unique Index Concurrency Engine            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Server Preparation & System Prerequisites

### 2.1 Install System Packages
```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y \
  apache2 \
  curl \
  git \
  postgresql postgresql-contrib \
  libcap2-bin

# Install Node.js 20 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2.2 Enable Required Apache Modules
```bash
sudo a2enmod proxy proxy_http ssl rewrite headers expires
sudo systemctl restart apache2
```

### 2.3 Create Service Account & Application Directories
```bash
# Create dedicated non-login service user
sudo useradd -r -s /bin/false -d /var/www/seatspace seatspace

# Create application directory tree
sudo mkdir -p /var/www/seatspace/dist
sudo mkdir -p /var/www/seatspace/storage/uploads
sudo mkdir -p /etc/seat-reservation

# Set directory permissions
sudo chown -R seatspace:seatspace /var/www/seatspace
sudo chmod -R 750 /var/www/seatspace
sudo chmod 700 /etc/seat-reservation
```

---

## 3. Database Initialization (PostgreSQL)

Connect as the PostgreSQL superuser and configure a dedicated least-privilege role:
```bash
sudo -u postgres psql
```

```sql
-- 1. Create dedicated application role
CREATE ROLE seatspace_app WITH LOGIN PASSWORD 'REPLACE_WITH_HIGH_ENTROPY_PASSWORD';

-- 2. Create production database
CREATE DATABASE seat_reservation_prod OWNER seatspace_app;

-- 3. Grant schema privileges
\c seat_reservation_prod
GRANT ALL ON SCHEMA public TO seatspace_app;
```

---

## 4. Building the Application

Execute the monorepo build on your CI/CD runner or directly on the deployment host:

```bash
# 1. Clone repository
git clone https://git.company.local/workplace/seat-reservation.git /var/www/seatspace/repo
cd /var/www/seatspace/repo

# 2. Install dependencies
npm ci

# 3. Build shared contracts, API backend, and Vue web client
npm run build --workspaces

# 4. Deploy static frontend assets
sudo cp -r apps/web/dist/* /var/www/seatspace/dist/
sudo chown -R www-data:www-data /var/www/seatspace/dist

# 5. Deploy backend application
sudo mkdir -p /var/www/seatspace/apps/api
sudo cp -r apps/api/dist /var/www/seatspace/apps/api/
sudo cp -r apps/api/node_modules /var/www/seatspace/apps/api/
sudo cp apps/api/package.json /var/www/seatspace/apps/api/
sudo chown -R seatspace:seatspace /var/www/seatspace/apps/api
```

---

## 5. Systemd Service Deployment

### 5.1 Configure Production Environment
Copy the template and set permissions:
```bash
sudo cp deploy/env/production.env.example /etc/seat-reservation/api.env
sudo chown seatspace:seatspace /etc/seat-reservation/api.env
sudo chmod 600 /etc/seat-reservation/api.env

# Edit with real credentials and random secrets
sudo nano /etc/seat-reservation/api.env
```

Generate a secure JWT secret:
```bash
openssl rand -hex 32
```

### 5.2 Install and Start Systemd Unit
```bash
# Copy systemd unit file
sudo cp deploy/systemd/seat-reservation-api.service /etc/systemd/system/

# Reload systemd and enable daemon
sudo systemctl daemon-reload
sudo systemctl enable seat-reservation-api
sudo systemctl start seat-reservation-api

# Check status
sudo systemctl status seat-reservation-api
```

View live application logs:
```bash
sudo journalctl -u seat-reservation-api -f
```

---

## 6. Apache VirtualHost Deployment

### 6.1 Install VirtualHost Configuration
```bash
sudo cp deploy/apache/seat-reservation.conf /etc/apache2/sites-available/seat-reservation.conf

# Test syntax
sudo apache2ctl configtest

# Enable site and restart
sudo a2ensite seat-reservation.conf
sudo a2dissite 000-default.conf
sudo systemctl reload apache2
```

---

## 7. First-Run Installation & Security Lock Verification

1. Navigate to `https://seats.company.local/setup` in your browser.
2. Complete Step 1: Input PostgreSQL host, port, database name, and credentials. Click **"Test Connection"** to verify round-trip connectivity.
3. Complete Step 2: Set organization name and input the master recovery administrator credentials (password $\ge 12$ characters).
4. Complete Step 3: Confirm authentication provider and click **"Initialize & Lock System"**.
5. **Verify Security Lockout**:
   - The `/setup` route will now permanently return `403 Forbidden` / display the locked notice.
   - Physical lock file created at `/var/www/seatspace/storage/setup.lock`.
   - Setup metadata recorded in `setup_metadata` table.

---

## 8. Backup & Disaster Recovery

### 8.1 Automated Nightly PostgreSQL Backup
Create a cron job `/etc/cron.daily/seatspace-db-backup`:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/seatspace"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Dump database preserving all constraints and partial unique indexes
pg_dump -U seatspace_app -h 127.0.0.1 -d seat_reservation_prod -Fc -f "$BACKUP_DIR/seatspace_db_$TIMESTAMP.dump"

# Retain backups for 30 days
find "$BACKUP_DIR" -type f -name "*.dump" -mtime +30 -delete
```

### 8.2 Database Restoration
```bash
pg_restore -U seatspace_app -h 127.0.0.1 -d seat_reservation_prod --clean --if-exists /var/backups/seatspace/seatspace_db_YYYYMMDD_HHMMSS.dump
```

