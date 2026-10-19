# Seat Reservation System — Discovery Round 1

> **Stage**: Discover · **Status**: In Progress · **Date**: 2026-10-09

---

## Summary of Initial Requirements

### What we know

| Area | Stated intent |
|---|---|
| **Product type** | Web-based workplace seat/desk reservation system |
| **Core domain objects** | Company → Building → Floor (with floor plan) → Desk/Space → Reservation |
| **Primary users** | Employees (self-reserve), employees acting as proxies (guest reservations), managers, administrators |
| **Deployment target** | Corporate network; Active Directory environment; SSO preferred |
| **Auth options under consideration** | One provider per installation; the specific SSO provider remains to be confirmed with IT |
| **First-run setup** | Auth provider configured during initial setup; setup must be protected and disabled after completion |
| **Local admin recovery** | Required when SSO is unavailable |
| **Guest reservations** | Employees can book on behalf of guests; guest names are stored, with email only if needed for notifications or check-in |

### What is not yet defined
- Specific SSO provider
- Team size and MVP timeline
- Data retention, privacy, and audit requirements
- Notification/check-in workflow
- Reporting needs

---

## Highest-Impact Ambiguities

The following eight questions are ordered by their impact on scope, architecture, and security. Answers to earlier questions constrain or unlock answers to later ones.

---

### Q1 — Deployment model and tenancy (Architecture / Security critical)

Is this system deployed **once per company** (single-tenant, internal tool) or will it serve **multiple companies** from a single installation (multi-tenant SaaS)?

> **Why it matters most**: Multi-tenancy fundamentally changes the data model, row-level security strategy, auth broker design, and every domain object's ownership boundary. Getting this wrong is expensive to retrofit.

*Options*:
- **A** — Single-tenant: one installation serves one company. Each company runs its own instance.
- **B** — Multi-tenant: a shared installation serves multiple companies, with strict data isolation.
- **C** — Undecided / both must be supported.

---

### Q2 — Authentication: provider selection model (Security / Ops critical)

Should the system support **one active provider per installation** (operator selects at setup time), or must it support **multiple simultaneous providers** (e.g., SSO for employees + local DB for break-glass admin)?

> **Why it matters**: Simultaneous providers require a more complex auth orchestration layer, account-linking logic, and careful privilege separation. A single-provider model with a dedicated local-admin escape hatch is simpler and safer for most corporate deployments.

*Sub-question*: Is the local administrator recovery account always a **separate, always-enabled local credential** regardless of which SSO provider is active?

One sign-in provider selected at setup, plus a separate local recovery administrator.
---

### Q3 — GSSAPI / Kerberos deployment topology (Security / Integration critical)

When you mention "Azure AD via Apache GSSAPI plugin," do you mean:

- **(a)** The web server (Apache/nginx) performs Kerberos/GSSAPI negotiation, then passes the authenticated username to the application via a trusted HTTP header (e.g., `REMOTE_USER` / `X-Remote-User`)?
- **(b)** The application itself performs Kerberos ticket validation directly?
- **(c)** Azure AD is federated with on-premises AD, and Kerberos tickets are issued by the on-prem domain controller (hybrid join scenario)?
- **(d)** Something else?

> **Why it matters**: If the web server handles GSSAPI, the application must trust and validate that header carefully (header injection is a real attack surface). This determines where auth logic lives, what secrets the app holds, and how fallback works.

---

### Q4 — Reservation time model (Domain critical)

What is the fundamental unit of a reservation?

*Options*:
- **A** — Whole-day only (no time slots).
- **B** — Named time blocks (e.g., Morning / Afternoon).
- **C** — Arbitrary time ranges (start time / end time, same day).
- **D** — Multi-day spans (e.g., "book this desk Mon–Fri").
- **E** — Recurring series (weekly, etc.).

> **Why it matters**: The reservation conflict-detection algorithm, calendar UI, and data model all depend on this. All-day is simplest; arbitrary time ranges with recurrence is significantly more complex.

---

### Q5 — Roles and administrative boundaries (Authorization critical)

Which of the following role concepts do you need in MVP, and who assigns them?

| Role candidate | Proposed capability |
|---|---|
| **System Administrator** | Full system access, manages companies/buildings, configures auth |
| **Building/Floor Manager** | Manages floors and desks within their building; approves/cancels reservations |
| **Employee** | Reserves desks for themselves; books for guests |
| **Guest** | No login; appears only as metadata on a reservation |

> **Why it matters**: Role granularity drives the permission model, API surface, and UI complexity. Fewer roles = simpler MVP.

*Questions*: Is a "floor manager" a distinct role from a "building manager"? Can a user be a manager of some buildings but an employee in others?

---

### Q6 — Guest reservation model (Privacy / Compliance relevant)

When an employee creates a reservation for a guest, what is required?

*Options*:
- **A** — Guest name only (no account, no system access).
- **B** — Guest name + contact email (for notification / check-in).
- **C** — Guest gets a temporary self-service link (no full account).
- **D** — Guest must have a pre-provisioned account.

> **Why it matters**: Options C and D require additional auth flows and account lifecycle management. Options A and B are significantly simpler. Data collected about guests has GDPR/privacy implications for retention and deletion.

---

### Q7 — Floor plan management (UX / Storage relevant)

How should floor plans work?

- What **file formats** are acceptable (PNG/JPG raster images, SVG, PDF, CAD formats)?
- Are desks positioned by **clicking on an uploaded image** (interactive placement UI) or by entering **coordinates/labels manually**?
- When a floor plan image is replaced, should **existing desk positions** be preserved, reset, or flagged for review?
- Who may upload or replace a floor plan (admin only, building manager, or any employee)?

> **Why it matters**: Interactive desk-placement on an image is a significant UI investment. If raster images are sufficient and desks are placed by clicking, that is one approach; if SVG with embedded metadata is required, it is substantially different.

---

### Q8 — Operational environment and team constraints (Architecture / Delivery relevant)

A few practical questions to right-size the architecture:

- **Stack preference**: Is there a preferred backend language/framework (e.g., Python/Django, Node.js, .NET, Java) or is this open?
- **Database**: Is there a preferred or mandated database (SQL Server, PostgreSQL, MySQL, SQLite for dev)?
- **Hosting**: Will this run on a Windows Server (IIS/Apache on Windows), Linux server, Docker container, or cloud VM?
- **Team**: How many developers will work on this, and what is the primary language expertise?
- **Timeline**: Is there a target for a working MVP?

> **Why it matters**: Stack selection affects which auth libraries are available (e.g., GSSAPI bindings, SAML libraries), deployment packaging, and the modular architecture decisions.

Stack preference: Node.js with TypeScript and NestJS for the backend API. The UI will be built with Vue and served as static files by Apache httpd.
Database: PostgreSQL. Allow the database connection settings (such as host, port, database name, and credentials) to be configured during installation; PostgreSQL is the supported database engine for the MVP.
Hosting: Deploy on a Linux server. Apache httpd serves the UI, terminates HTTPS, and reverse-proxies API requests to the Node.js service. Keep the backend service private and stateless so additional instances can be added if needed.
Architecture: Start with a modular monolith and REST API rather than microservices.
Team: Team size and experience still need confirmation; favor TypeScript experience where possible.
Timeline: Set the MVP target with the project owner after confirming team capacity and IT dependencies, especially SSO and Linux hosting.

---

## Round 1 Answers (v0.3)

| ID | Answer |
|---|---|
| Q1 | **A — Single-tenant.** Each company runs its own installation. |
| Q2 | One sign-in provider per installation, selected at setup, plus a separate local recovery administrator. The recovery account is required. |
| Q3 | GSSAPI/Kerberos is not required for the MVP. Use the organization’s standard SSO if available; confirm the specific SSO provider and topology with IT if GSSAPI becomes a requirement. |
| Q4 | **A — Whole-day reservations.** |
| Q5 | MVP roles: system administrator, building manager, employee, and guest without an account. Administrators assign roles; managers can also reserve as employees. |
| Q6 | Guest name only; collect email only if needed for notifications or check-in. |
| Q7 | PNG/JPG floor plans, with desks placed by clicking. Flag desk positions for review when a plan is replaced. Administrators and building managers can manage plans. |
| Q8 | Node.js with TypeScript and NestJS backend; Vue UI served by Apache httpd; Linux deployment; PostgreSQL as the supported MVP database, with connection settings configurable during installation; modular monolith with a REST API. Team size and MVP timeline are deferred for project planning. |

## Open Questions Log (v0.3)

| ID | Question | Raised | Status |
|---|---|---|---|
| OQ-001 | Single-tenant vs. multi-tenant deployment model | Round 1 | **Resolved** |
| OQ-002 | One active auth provider or multiple simultaneous providers | Round 1 | **Resolved** |
| OQ-003 | GSSAPI topology: server-handled vs. app-handled | Round 1 | **Not required for MVP** |
| OQ-004 | Reservation time granularity and recurrence | Round 1 | **Resolved** |
| OQ-005 | Role model and management boundaries | Round 1 | **Resolved for MVP** |
| OQ-006 | Guest reservation model and data requirements | Round 1 | **Resolved for MVP** |
| OQ-007 | Floor plan formats and desk placement UX | Round 1 | **Resolved for MVP** |
| OQ-008 | Tech stack, database, hosting, team, timeline | Round 1 | **Answered; team and timeline deferred** |

---

## Decision Log (v0.3)

| ID | Decision | Scope |
|---|---|---|
| D-001 | Deploy a separate single-tenant installation for each company. | MVP |
| D-002 | Configure one sign-in provider per installation and retain a separate local recovery administrator account. | MVP |
| D-003 | Do not require GSSAPI/Kerberos for the MVP; confirm the standard SSO provider with IT. | MVP |
| D-004 | Support whole-day reservations. | MVP |
| D-005 | Use system administrator, building manager, employee, and accountless guest roles. Administrators assign roles; managers may also reserve as employees. | MVP |
| D-006 | Store guest names; collect guest email only if needed for notifications or check-in. | MVP |
| D-007 | Support PNG/JPG floor plans with click-to-place desks; flag placements for review when a plan changes. Administrators and building managers may manage plans. | MVP |
| D-008 | Use Node.js with TypeScript and NestJS for a modular-monolith REST API; serve the Vue UI from Apache httpd on Linux. | MVP |
| D-009 | Use PostgreSQL as the supported MVP database. Configure PostgreSQL connection settings at installation; database-engine switching is not an MVP requirement. | MVP |

---

## Assumptions Log (v0.1)

| ID | Assumption | Risk if wrong |
|---|---|---|
| A-001 | A floor belongs to exactly one building, which belongs to one company | Low — likely correct, but multi-company floors would complicate reporting |
| A-002 | A desk belongs to exactly one floor | Low |
| A-003 | "Guest" means an external visitor, not a contractor or temp worker with company credentials | Medium — contractors may need accounts, not just metadata |
| A-004 | The system is internal-facing only (not publicly accessible without VPN) | High — changes threat model significantly if wrong |

---

*Next action: Proceed to the Specify stage using the recorded MVP decisions. Confirm the specific SSO provider with IT; confirm team capacity and MVP timeline with the project owner during planning.*
