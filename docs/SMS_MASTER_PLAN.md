# School Management System — Master Plan & Development Roadmap

**Owner:** Bishnu / Tomorrow's Tech
**Product working name:** (see §1.3) — proposed *Pathshala* / *EduNotify Suite*
**Target market:** Nepal first → international later
**Build method:** Solo developer + Claude Code (CLI), phase-by-phase
**Stack baseline:** Next.js (App Router) · TypeScript · Supabase (Postgres) · Prisma · Tailwind · Expo (mobile, later)

> This document is the single source of truth. Keep it in the repo root (e.g. `/docs/SMS_MASTER_PLAN.md`). Each phase in §10 is a self-contained work package you can hand to Claude Code one at a time. Update the checkboxes as you go.

---

## 1. Executive summary & strategy

### 1.1 What we're building
A multi-tenant, cloud-based **School Management System (SMS / School ERP)**: one platform that many schools subscribe to, each seeing only their own data. Core pillars, matching what the 2026 market and Nepali schools expect:

- **Student Information System (SIS)** — the central record of students, guardians, staff, classes.
- **Attendance** — manual + **RFID card** (your hardware differentiator).
- **Fees & finance** — fee structures, invoices, online payment (eSewa/Khalti/ConnectIPS/fonePay), IRD/CBMS-ready ledger.
- **Examinations & grading** — NEB-aligned GPA, terminal exams, bilingual marksheets.
- **Communication hub** — multi-channel parent messaging (this is where your existing **Notifier** product folds in).
- **Portals & mobile apps** — admin, teacher, parent, student.

### 1.2 Strategic positioning (why you can win)
The Nepal market already has incumbents — **Veda** (600+ schools), Nimble, eAcademy, Genius, NepalSoft, Hamro Academy, InPro, Web Studio Nepal. You do **not** beat them on breadth on day one. You win by:

1. **RFID-first attendance + safety as the wedge.** "Tap-in / tap-out, parent gets an instant message when their child enters/leaves school." This is concrete, emotional (child safety), and you already sell ZKTeco hardware — you can bundle hardware + software + install. Most incumbents treat RFID as an add-on; you lead with it.
2. **Notifier convergence.** Your bulk-messaging app becomes the communication engine of the SMS. A school that buys Notifier is one upsell away from the full suite, and vice-versa.
3. **Modern UX + reliability.** Incumbents look dated. A fast, mobile-first, bilingual (नेपाली + English) UI is a real edge.
4. **Honest local compliance.** IRD/CBMS-ready billing, Bikram Sambat calendar, NEB grading out of the box, Nepali receipts.

### 1.3 Naming / branding note
You already have **ournotifier.com** and a bell logo with teal-green branding. Two clean options:
- Keep **Notifier** as the messaging product and launch the SMS under a sibling brand (e.g. *Pathshala by Tomorrow's Tech*), with shared login.
- Or make the SMS the umbrella ("EduSuite") and Notifier a module inside it.
Decide this before Phase 0 because it affects the root domain, auth realm, and tenant model. **Recommendation:** umbrella SaaS brand, Notifier as the "Communication" module — one account, one bill, less confusion for schools.

---

## 2. Market & competitor research (condensed)

### 2.1 What a modern SMS must have (2026 baseline)
From current market guides (Classter, Gradelink, Camu, Kramah, SchoolCues): a centralized single database; role-based access; modules for **admissions, SIS, attendance, fees, timetable, exams/results, LMS, HR/payroll, transport, library, communication, reporting/analytics**; cloud-hosted with automatic backups; **mobile-first**; integration-friendly; and increasingly **AI-assisted insights** (at-risk-student detection, predictive attendance) and strong data-security/compliance posture. You do not need all of this in v1 — but the data model should not block it.

### 2.2 Nepal incumbents — what they all ship (so you must too, eventually)
- Online fee payment via **eSewa, Khalti, ConnectIPS, fonePay**.
- **Biometric / RFID** attendance and SMS/app notifications to parents.
- Separate **teacher vs student/parent apps** (Veda's "Veda Guru" vs student app is a notable pattern — different roles, different apps, less clutter).
- **IRD-certified billing / accounting** (a real selling point in Nepal).
- LMS-lite features (homework, assignment submission, notices, routines).
- Bilingual marksheets and NEB-aligned grading.

### 2.3 Your differentiators to protect
RFID child-safety messaging · genuinely modern UX · converged messaging (Notifier) · transparent local pricing · fast solo-dev iteration with Claude Code.

---

## 3. Nepal-specific requirements (these are design constraints, not nice-to-haves)

### 3.1 Education structure (drives the academic data model)
- **ECD / pre-primary** (ages ~3–5) → **Basic education Grades 1–8** → **Secondary 9–10** (ends in **SEE**) → **Higher secondary / +2, Grades 11–12** with **streams** (Science, Management, Humanities, Education). Grades 11–12 administered by **NEB**.
- Model `grade_level` 0..12 (+ ECD as level 0/-1), with `stream` applicable at 11–12. Don't hardcode "Class 1–10" — support pre-primary and +2.

### 3.2 Grading (NEB)
- **4.0 GPA letter scale**, **subject-wise (no cumulative GPA at board level)**. Grades roughly: A+ (4.0, 90–100%), A (3.6), B+ (3.2), B (2.8), C+ (2.4), C (2.0), D+ (1.6, ~35% pass), D (1.2 in some bands), **NG** (0.0, "not graded"/fail). Pass = at least D+ in each subject; **NG must be cleared via grade-increment exam**.
- Internal/terminal exams keep **numeric marks**; board-style reporting shows **grades**. Each subject often has **theory + practical/internal** components combined into the final grade.
- **Per-subject grade + overall GPA** on the marksheet. Make the grade scale **configurable per school** (some schools deviate; NEB updates bands over time — e.g. changes around 2078 BS).

### 3.3 Compliance — IRD / CBMS billing (the fee module's hard requirements)
Nepal's **Inland Revenue Department (IRD)** runs the **Central Billing Monitoring System (CBMS)**. Real-time CBMS sync becomes mandatory above turnover thresholds (general ~NPR 10 crore; hospitality ~NPR 5 crore; real-time sync above ~NPR 25 crore). Most single schools sit below the mandatory line, **but** to be credible and audit-ready, design the fee/finance module from day one to satisfy IRD-style rules:
- **Fiscal-year-based invoice numbering** with reprint labeling ("Copy of Original – 2/3…").
- **Immutable audit trail — no hard deletes.** Every edit records *user, time, reason*. → This aligns perfectly with your existing **soft-delete** pattern; extend it to a full audit log.
- **Data stored in Nepal or with locally accessible backup.** (Supabase region matters — see §5.7.)
- VAT/PAN fields on invoices; ability to export Annex-style reports later.
- Architect a clean `ledger` boundary so you can add a **CBMS adapter** later without reworking fees.

### 3.4 Payments
Support **eSewa, Khalti, ConnectIPS, fonePay** for online fee collection, plus **manual/cash/bank** entry with receipts. Build a **PaymentProvider interface** so each gateway is a plug-in; ship eSewa + Khalti first (highest adoption), add ConnectIPS/fonePay next.

### 3.5 Communication channels — **critical architectural decision**
Nepal's platform-regulation environment is **volatile**: TikTok banned (2023) then restored; Telegram banned (Jul 2025); a **26-platform ban including WhatsApp/Facebook in early Sept 2025**, **reversed within days** after the Gen Z protests. WhatsApp works again now, but the risk is structural and recurring.

**Implication:** do **not** couple parent communication to a single channel. Build a **channel-agnostic notification service** with adapters:
- **SMS (carrier — NTC/Ncell via an aggregator): the reliable always-works fallback. Treat as primary for critical alerts.**
- **Viber** — registered & stable in Nepal, widely used; strong secondary.
- **WhatsApp (via Fonnte, your current provider)** — keep, but as one channel among several, not the foundation.
- **In-app push** (mobile app, free) — cheapest once apps exist.
Per-message **channel routing with fallback** (e.g. try push → Viber → SMS). This protects you from the next ban and is itself a selling point.

### 3.6 Language & calendar
- **Bilingual UI and documents:** English + **Nepali (Devanagari)**. Use i18n from Phase 0 (don't retrofit). Marksheets, receipts, and notices especially need Nepali.
- **Bikram Sambat (BS) calendar** alongside Gregorian: academic year, fee months, exam dates, fiscal year are all commonly expressed in BS. Store canonical dates in UTC/Gregorian; render BS via a converter; let users pick.

---

## 4. Product scope — module map

Legend: 🟢 v1 (MVP) · 🟡 v2 · 🔵 later/international

| Module | Priority | Notes |
|---|---|---|
| Tenancy, auth, RBAC | 🟢 | Foundation for everything |
| SIS: students, guardians, staff, classes/sections | 🟢 | The spine |
| Attendance (manual) | 🟢 | |
| Attendance (RFID ingestion + offline buffer) | 🟢 | Your wedge |
| Fees & finance (invoices, payments, receipts, ledger) | 🟢 | eSewa+Khalti first |
| Exams & grading (NEB GPA, terminal, marksheets) | 🟢 | |
| Communication hub (multi-channel, Notifier convergence) | 🟢 | SMS+Viber+WhatsApp+push |
| Parent / student / teacher web portals | 🟢 | |
| Notices / announcements | 🟢 | |
| Timetable / routine + substitution | 🟡 | |
| Homework / assignments (LMS-lite) | 🟡 | |
| Library | 🟡 | RFID/barcode tie-in |
| Transport / bus tracking | 🟡 | RFID boarding tie-in |
| HR / payroll | 🟡 | Staff attendance, salary |
| Admissions / enquiry CRM | 🟡 | |
| Hostel | 🔵 | |
| Inventory / assets | 🔵 | |
| Canteen (cashless, RFID wallet) | 🔵 | Smart-campus upsell |
| Analytics & at-risk insights (AI) | 🔵 | |
| CBMS adapter | 🟡/🔵 | When a client crosses threshold |
| SaaS billing & subscriptions (your revenue) | 🟢 | You bill schools |
| Multi-language beyond ne/en | 🔵 | International |

---

## 5. Technical architecture

### 5.1 High-level
```
                 ┌─────────────────────────────────────────────┐
                 │            Next.js (App Router)              │
   Web users ──► │  - Admin / Teacher / Parent / Student UIs    │
                 │  - Route Handlers / Server Actions (API)     │
                 │  - i18n (en/ne), BS-calendar rendering       │
                 └───────────────┬──────────────────────────────┘
                                 │ Prisma
                 ┌───────────────▼──────────────────────────────┐
                 │   Supabase Postgres (multi-tenant, RLS)       │
                 │   - tenants, users, students, fees, exams...  │
                 │   - audit_log (immutable), soft deletes       │
                 └───────────────┬──────────────────────────────┘
                                 │
   RFID readers ──HTTP/HTTPS──►  Ingestion API (signed device tokens)
   (ESP32 / ZKTeco)                 │  buffers offline, syncs on reconnect
                                 │
   Notification service (queue) ──► SMS / Viber / WhatsApp(Fonnte) / Push
                                 │
   Payment adapters ──► eSewa / Khalti / ConnectIPS / fonePay
                                 │
   Mobile (Expo, later) ──────► same API
```

### 5.2 Why this stack (you already know it)
Next.js App Router + Supabase + Prisma + TS + Tailwind is exactly your current `school` repo. Keep it. It gives SSR portals, a single API surface, easy hosting (Vercel), and Postgres' strength for relational school data (the data is **highly relational** — students↔classes↔fees↔exams — so Postgres over NoSQL is correct).

### 5.3 Multi-tenancy model (decide early — affects every table)
**Recommendation: shared database, shared schema, `tenant_id` column on every tenant-owned row, enforced by Postgres Row-Level Security (RLS).**
- Simplest to operate solo, cheapest, scales to thousands of schools.
- Every query is automatically scoped by RLS using the authenticated user's `tenant_id` (Supabase JWT claim) — defense in depth so a bug in app code can't leak cross-school data.
- Add a `tenants` (schools) table; `users` belong to a tenant; superadmin (you) can cross tenants via a service role.
- Reserve the option to move a huge client to an isolated schema later — but don't build it now.

### 5.4 API & code conventions (keep your existing patterns)
- **`publicId` (UUID)** for all external references; numeric/bigint PKs internal only. Keep your **BigInt serialization** helper.
- **Soft deletes** everywhere (`deleted_at`) — now doubles as audit compliance.
- **Consistent API response envelope** (you already have this): `{ success, data, error, meta }`.
- **JWT auth** (you have this); map JWT → `tenant_id` + `role` claims for RLS.
- **Zod** for input validation at every route handler.
- **CSV import** (you've built this) → reuse for bulk student/staff/guardian onboarding; it's a Phase-1 must (schools arrive with spreadsheets).

### 5.5 Roles & permissions (RBAC)
Roles: `superadmin` (you), `school_admin`, `principal`, `accountant`, `teacher`, `class_teacher`, `parent`, `student`, `librarian`, `transport`, `front_desk`. Use a permission matrix (action × resource) rather than hardcoding role checks, so new roles/plans are config not code.

### 5.6 Notification service (the abstraction from §3.5)
```
sendNotification({
  recipients, templateId, channelPriority: ['push','viber','sms'],
  data, tenantId
})
```
- Channel adapters implement a common interface (`send`, `status`, `cost`).
- Queue + retry + delivery status tracking (incumbents advertise "delivery tracking" — match it).
- Templates with variables, bilingual, per-tenant branding.
- Triggers (each **per-school toggle**, default shown): **absence detected → ON** (the cheap, high-value alert), RFID per-tap-in/out → **OFF** (designed-for, enable later — too costly to send daily), fee due/overdue → ON, exam results published → ON, notice posted → ON.

### 5.7 Data residency & backups
IRD-style rules expect Nepal-accessible data. Choose the **Supabase region closest/compliant** (e.g. Singapore/Mumbai) and keep **scheduled local backups** (nightly dump to object storage you control, retained). Document this for sales ("daily backups, restorable, locally retained").

### 5.8 Security baseline
RLS on every table; least-privilege service keys; device-signed RFID ingestion (HMAC per device + rotating token); rate limiting; audit log immutable; PII encryption at rest (Supabase default) + sensitive columns (guardian phone) access-controlled; no secrets in client bundles; CSP. Student data is sensitive — treat it like health data.

---

## 6. Core data model (sketch — expand in Phase 0/1)

Tenant-scoped tables all carry `tenant_id`, `public_id`, `created_at`, `updated_at`, `deleted_at`.

- **tenants** (schools): name, brand, address, PAN/VAT, fiscal_year_start, locale defaults, subscription_plan, status.
- **branches** (optional, multi-campus): belongs to tenant.
- **academic_years**: tenant, name (e.g. "2082 BS"), start/end (BS+AD), is_current.
- **users**: tenant, public_id, role(s), phone, email, password_hash, locale, status.
- **students**: tenant, public_id, name(en/ne), DOB(BS+AD), gender, admission_no, photo, current_class_section, status, guardian links, **rfid_uid** (unique per tenant).
- **guardians**: tenant, name, relation, phone(s), preferred_channel, student links (many-to-many).
- **staff**: tenant, user link, designation, subjects, salary refs.
- **classes** (grade levels) & **sections**: tenant, grade_level (-1..12), stream (11–12), section name, class_teacher.
- **subjects**: tenant, class, name(en/ne), has_practical, full_marks, pass_marks, credit.
- **enrollments**: student × academic_year × class_section (history preserved).
- **attendance_records**: student, date, status(present/absent/late/leave), source(manual/rfid), first_tap, last_tap, marked_by.
- **rfid_devices**: tenant, device_id, location(gate/class/bus), secret, **last_seen, reported_today (the offline-vs-absent guard)**.
- **tenant_settings / branch_settings**: messaging_mode(`off`/`absence_only`/`per_tap`, default `absence_only`), absence_cutoff_time, channel_priority[], default templates, applies-to scope. (Drives §7.6 — all editable per school, no code change.)
- **rfid_events** (raw taps, append-only): device, rfid_uid, ts, direction(in/out), processed_at, sync_batch_id.
- **fee_heads** (tuition/transport/exam…), **fee_structures** (class × head × amount × frequency), **invoices** (fiscal-year numbering), **invoice_items**, **payments** (provider, ref, amount), **receipts**, **ledger_entries** (immutable), **discounts/scholarships**, **fines**.
- **exams** (terminal/unit/board), **exam_subjects**, **marks** (theory/practical, numeric), **grades** (computed letter+GPA), **marksheets**, **grade_scales** (per tenant, configurable).
- **notifications**, **notification_templates**, **message_log** (channel, status, cost).
- **notices/announcements**, **timetable**, **homework**, **library_*, transport_*** (later).
- **audit_log** (append-only): actor, action, entity, before/after, reason, ts.
- **subscriptions/plans/usage** (your SaaS billing of schools).

---

## 7. RFID integration — deep dive (your differentiator)

### 7.1 Three hardware models (offer a tiered menu)
1. **Tap reader (recommended default): ESP32 (or NodeMCU) + RC522/PN532 RFID module.** Student taps card at gate/class. Cheap (a few hundred NPR per node), you can assemble/source, high margin, contactless tap. Best for classrooms and small gates.
2. **ZKTeco / commercial reader (you already sell these).** Many ZKTeco devices support **Push protocol (ADMS)** over HTTP — the device POSTs attendance to your endpoint, or you pull via SDK. Reuse your existing supply chain and your ZKTeco familiarity. Good for schools wanting "a real device."
3. **Walk-through RFID gate/tower** (UHF, long-range, no tap). Premium "smart gate" — student just walks through and parent gets a message. Higher cost; sell to bigger schools as the flagship safety product.

### 7.2 Data flow (cost-optimized — device-local, batch sync, absence-only messaging)
**Design decision (locked):** the device is the source of truth for the day's swipes; the app pulls them in batches; **no per-swipe messages** — only a once-daily absence alert.

```
On device (synced cache):  card↔student MAPPING lives locally so the reader
                           works fully offline and can show name/feedback.

During the day:  Card tap → reader logs swipe to local store (flash/SD).
                 No cloud call required per tap. LED/buzzer = local feedback.

Sync (batched, not per-tap):  reader/gateway POSTs the day's buffered swipes to
                 /api/rfid/ingest { device_id, [swipes], hmac_signature }
                 → API verifies HMAC + device token, scoped to tenant
                 → append to rfid_events (raw, idempotent) → resolve uid→student
                 → upsert attendance_records (present, with first/last tap times)

Once daily, after cutoff (e.g. 10:00, per-school):  Absence job runs ONLY for
                 classes/devices that reported data that day → students with no
                 swipe = absent → send ONE absence message per absentee.
                 (Per-tap messaging path exists but is OFF by default.)
```

### 7.3 Reliability — the make-or-break detail in Nepal
**Power cuts and internet drops are normal.** Readers MUST:
- **Buffer locally** (on-device flash / SD, or a tiny local gateway) when offline.
- **Sync queued events on reconnect** with idempotency (dedupe by `device_id + uid + ts`).
- Have an **NTP-synced clock** (or include trusted server time) so timestamps survive offline.
- Give immediate **local feedback** (LED/buzzer) so staff know the tap registered even if cloud is down.
Build the ingestion API **idempotent and replay-safe** from day one.

### 7.4 Security
Per-device secret → **HMAC-sign every payload**; rotating device tokens; reject stale/duplicate events; rate-limit; bind device to tenant. Never trust a raw UID without device auth (UIDs are clonable).

### 7.5 Packaging the offer (sales)
Bundle: **RFID cards (printed with school branding) + reader(s) + install + the attendance/safety module + parent messaging**. Price as hardware (one-time) + per-student card + the software subscription. This is the concrete "RFID offer" you wanted — it's your foot in the door and ties hardware revenue to recurring SaaS.

> Your earlier instinct to **defer RFID until a paying client commits** still holds for the *hardware spend*. But build the **software ingestion pipeline (Phase 2)** regardless — it's cheap, it's the demo magic, and an ESP32 dev kit lets you demo end-to-end for under a few thousand NPR.

### 7.6 Attendance messaging model (cost control — the key business rule)
**Default: absence-only, once daily.** Messaging every parent on every tap (in + out) would mean ~2 messages × every enrolled student × every day — financially unviable. Instead:
- A daily job after a **configurable cutoff time** finds students with **no swipe today** and sends **one** absence message each. Cost scales with *absentees* (a handful), not enrollment (hundreds).
- The **per-tap "your child entered/left school" path is fully built but switched OFF by default**, so any school that later wants it (and will pay for the messages) can flip it on with no code change.

**⚠️ The offline-vs-absent guard (must-have, or it backfires badly):** the absence job must distinguish *"student didn't swipe"* from *"the device was offline/powered off all day and synced nothing."* If a reader is down and you see zero swipes, naive logic would tell every parent their child was absent — a reputation-killer. Rule: run the absence check **only for a class/device that actually reported data (or is confirmed online) that day**; otherwise **hold and flag for manual review** in the admin UI. Track `device.last_seen` and require a "data received today" signal before any absence message goes out.

**Everything is per-school configurable (settings, not code):** messaging mode (`off` / `absence_only` / `per_tap`), cutoff time, channel + fallback order, message template (bilingual), and which classes/sections it applies to. Store these on the tenant/branch settings so each school self-serves.

---

## 8. Mobile app strategy (Phase 9 — after web is solid)

- **Use Expo (React Native).** You already write TypeScript/React; Expo reuses ~80% of your mental model and the same backend API. One codebase → iOS + Android. EAS for builds/OTA updates.
- **Ship role-targeted apps** (Veda's lesson): a **Parent app** (attendance alerts, fees + pay, results, notices, messages) and a **Teacher app** (mark attendance, enter marks, post homework, message). Keep admin on web.
- **Push notifications** become your cheapest channel (Expo push) — feeds the §5.6 router.
- Don't start mobile until SIS + attendance + fees + communication are stable on web; the app is a thin client over the same API.

---

## 9. SaaS business layer (don't forget you're the vendor)

- **Subscription plans** (e.g. Lite / Standard / Pro mirroring local market tiering): per-student or per-school monthly/annual; module gating by plan; trial period.
- **Onboarding wizard**: create school → academic year → import students (CSV) → set fees → issue logins. Fast onboarding is a competitive feature.
- **Superadmin console** (you): manage tenants, plans, usage, message credits, support.
- **Message-credit accounting**: SMS/WhatsApp cost real money — meter it per tenant and bill or cap it.
- **Pricing for Nepal**: anchor against incumbents (Lite tiers exist). RFID hardware is separate one-time + cards. Keep software affordable to win logos; make margin on hardware + messaging + Pro tiers.

---

## 10. Development roadmap — phased work packages for Claude Code

**How to use this:** do one phase per focused Claude Code session. Each phase below has *Goal · In scope · Out of scope · Key entities/endpoints · Acceptance criteria · Dependencies · a copy-paste kickoff prompt*. Don't start a phase until the previous one's acceptance criteria pass. Commit at every green checkpoint.

> **Vertical slices, not horizontal layers.** Each phase ships a usable end-to-end feature (DB → API → UI), not "all the database, then all the API." This keeps Claude Code's context bounded and gives you something demoable every phase.

---

### Phase 0 — Foundations & multi-tenant scaffold
- [x] **Goal:** A deployable skeleton with tenancy, auth, RBAC, RLS, i18n, BS calendar, design system, API conventions. ✅ **DONE 2026-06-11** — brand: Scholaris; Supabase Singapore; app connects as `scholaris_app` (NOBYPASSRLS); 12/12 tests incl. live RLS isolation.
- **In scope:** Repo structure; Prisma schema for `tenants`, `users`, `roles/permissions`, `audit_log`; Supabase RLS policies keyed on JWT `tenant_id`; auth (login/logout/refresh, password reset); role-based route guards; API response envelope + Zod + error handling; soft-delete + audit-log middleware; i18n (en/ne) setup; BS↔AD date utility + a date component; Tailwind design system + the teal/bell branding; superadmin can create a tenant.
- **Out of scope:** Any school feature (students, fees…).
- **Acceptance:** Can create a school (tenant) and an admin user; admin logs in and sees an empty dashboard scoped to their tenant; a second tenant's data is invisible (verify RLS); language toggles en/ne; a date renders in BS and AD; every write lands in `audit_log`.
- **Dependencies:** none.
- **Claude Code kickoff prompt:**
  > "Read `/docs/SMS_MASTER_PLAN.md` §5–6 and Phase 0. Set up a multi-tenant Next.js (App Router) + Prisma + Supabase project. Implement: tenants, users, RBAC permission matrix, Postgres RLS scoped by JWT tenant_id, JWT auth with refresh, the standard API response envelope with Zod validation, soft-delete + immutable audit_log middleware, i18n (en/ne), and a BS↔AD date utility with a reusable date picker. Use publicId UUIDs externally and BigInt-safe serialization. Provide a seed script that creates a superadmin and one demo school. Write the RLS policies and a test proving tenant isolation."

---

### Phase 1 — Core SIS (students, guardians, staff, classes)
- [x] **Goal:** The system of record. Onboard a real school's people and structure. ✅ **DONE 2026-06-11** — full SIS CRUD APIs + UI (students/guardians/staff/classes/sections/subjects/academic years); batched CSV import (200 students in ~5s); promotion with history; acceptance verified live. *Deferred: student photo upload (needs Supabase Storage service key), staff CSV import.*
- **In scope:** `academic_years`, `classes` (grade -1..12 incl. ECD & +2 streams), `sections`, `subjects`, `students`, `guardians` (many-to-many to students, preferred channel), `staff`, `enrollments` (history); CSV bulk import (reuse your importer) for students/guardians/staff; student profile page; class/section management; search & list with pagination; photo upload (reuse your FormData/Axios image flow).
- **Out of scope:** attendance, fees, exams.
- **Acceptance:** Import 200 students from CSV; assign to classes/sections; open a student profile with guardians; promote students to next academic year preserving history; bilingual names render.
- **Dependencies:** Phase 0.
- **Kickoff prompt:** "Implement Phase 1 SIS per the plan. Build academic_years, classes (grade_level -1..12 + stream for 11–12), sections, subjects, students, guardians (M:N), staff, enrollments with history. Add CSV import for students/guardians/staff with validation + error report, student profiles, and class management UI. Reuse existing image-upload pattern. Keep everything tenant-scoped under RLS."

---

### Phase 2 — Attendance (manual + RFID ingestion pipeline)
- [ ] **Goal:** Daily attendance, and the RFID magic that is your wedge.
- **In scope:** `attendance_records` (status, source, first/last tap time); teacher manual marking UI (class roster, fast tap); **RFID:** `rfid_devices` (with `last_seen`, `reported_today`), `rfid_events` (append-only), `/api/rfid/ingest` accepting **batched** swipes (HMAC-signed, idempotent, replay-safe), UID→student resolution, auto attendance upsert; **device-side card↔student mapping sync** endpoint (so the reader resolves names offline); **offline buffering + batch-sync contract** documented for reader firmware; **daily absence job** with **per-school cutoff time** and the **offline-vs-absent guard** (only runs for devices/classes that reported data; otherwise holds + flags for manual review); per-school **messaging-mode setting** (`off`/`absence_only`/`per_tap`, default `absence_only`); emit `attendance.absent` events by default and `rfid.tap` events always (per-tap notification consumer stays OFF until enabled).
- **Out of scope:** the physical firmware (separate track); notification *delivery* (Phase 5 — just emit events now); per-tap messaging delivery (built later, off by default).
- **Acceptance:** Teacher marks a class in <30s; a simulated reader POSTs a **batch** of swipes and attendance appears as present; duplicate/replayed swipes are deduped; offline-then-batch sync works; the daily absence job flags only un-swiped students **and** correctly **holds (does not message) when a device reported no data at all**; messaging mode + cutoff are editable per school and take effect without redeploy.
- **Dependencies:** Phase 1.
- **Kickoff prompt:** "Implement Phase 2 Attendance. Manual marking UI per class roster. RFID ingestion API at /api/rfid/ingest accepting BATCHED swipes, verifying per-device HMAC, append-only rfid_events, idempotent dedupe by device+uid+ts, UID→student resolution, attendance upsert with first/last tap times. Add a device mapping-sync endpoint so readers cache card↔student locally. Track rfid_devices.last_seen + reported_today. Implement a daily absence job with a per-school cutoff time that emits attendance.absent ONLY for students with no swipe AND ONLY for devices/classes that reported data that day — otherwise hold and flag for manual review. Add a per-school messaging-mode setting (off/absence_only/per_tap, default absence_only). Emit rfid.tap always; keep per-tap notification consumer disabled. Write a mock reader script (Node) simulating online and offline-batch submission, including a 'device offline all day' scenario for the guard."
- **Parallel hardware note:** Separately, prototype the reader: ESP32 + RC522, store taps to flash when offline, POST signed batches on reconnect, NTP time, LED/buzzer feedback. (Demo-able for a few thousand NPR.)

---

### Phase 3 — Fees & finance (IRD/CBMS-ready)
- [ ] **Goal:** Fee structures, invoices, online + manual payments, receipts, immutable ledger.
- **In scope:** `fee_heads`, `fee_structures` (class×head×amount×frequency), discounts/scholarships, fines; invoice generation (bulk + individual) with **fiscal-year numbering** and reprint labels; `payments` + **PaymentProvider interface** with **eSewa + Khalti** adapters first (sandbox); manual/cash/bank receipt entry; immutable `ledger_entries`; due/aging reports; student fee statement; daily collection report; PDF receipts (bilingual).
- **Out of scope:** live CBMS sync (build the clean ledger boundary + adapter stub only), ConnectIPS/fonePay (Phase 3.1).
- **Acceptance:** Define a class fee structure; bulk-generate monthly invoices; pay one via eSewa sandbox and one as cash; receipt PDF generated in Nepali+English; ledger is append-only (no hard deletes); aging report correct; reprint shows "Copy of Original".
- **Dependencies:** Phase 1 (students/classes).
- **Kickoff prompt:** "Implement Phase 3 Fees. fee_heads, fee_structures, discounts, fines; invoice generation with fiscal-year numbering + reprint labeling; a PaymentProvider interface with eSewa and Khalti sandbox adapters; manual receipt entry; immutable ledger_entries (no hard delete, full audit); due/aging + daily collection reports; bilingual PDF receipts. Leave a documented CBMS adapter interface stub. Ensure all monetary math is integer-paisa safe."

---

### Phase 4 — Examinations & grading (NEB)
- [ ] **Goal:** Terminal/board exams, NEB GPA marksheets, report cards.
- **In scope:** `exams` (unit/terminal/board), `exam_subjects` (theory+practical, full/pass marks), `marks` entry UI (per class/subject, fast grid), `grade_scales` (configurable per tenant; ship NEB 4.0 default), grade/GPA computation (subject-wise letter + GPA, NG handling), `marksheets`/report cards (bilingual PDF), result publish flow + event for notifications, mark-entry locking & audit.
- **Out of scope:** online exams/proctoring (later).
- **Acceptance:** Create a terminal exam; enter theory+practical marks for a class; system computes per-subject grade + GPA per NEB scale; generate a bilingual marksheet PDF; publishing emits a "results.published" event; changing the grade scale reflows grades.
- **Dependencies:** Phase 1.
- **Kickoff prompt:** "Implement Phase 4 Exams. exams, exam_subjects (theory/practical), fast marks-entry grid, configurable grade_scales (default NEB 4.0 A+→NG, D+ pass), subject-wise GPA computation with NG handling, bilingual marksheet/report-card PDF, publish flow emitting results.published. Lock marks after publish with audited override."

---

### Phase 5 — Communication hub (Notifier convergence, multi-channel)
- [ ] **Goal:** The channel-agnostic notification engine; fold Notifier in.
- **In scope:** `notification_templates` (bilingual, variables, per-tenant branding), `sendNotification()` with **channel router + fallback** (per-school priority order; WhatsApp via Fonnte fully supported as a primary channel), adapters: **WhatsApp (Fonnte), SMS aggregator, Viber, Expo push (stub until app)**; queue + retry + `message_log` with delivery status + **per-tenant message-credit metering**; wire triggers from Phases 2–4 — **absence (ON by default), fee due/overdue, results published, notices**; **per-tap RFID messaging consumer built but OFF by default** (flip via the Phase 2 messaging-mode setting); bulk send UI (this *is* Notifier — schools, clinics, institutions); contact groups/segments.
- **Out of scope:** push delivery to real devices (until Phase 9 app) — keep adapter ready; per-tap messaging stays disabled by default.
- **Acceptance:** Create a bilingual template; bulk-send to a class's guardians with delivery statuses logged and credits decremented; the **daily absence job triggers exactly one message per absentee** through the router; switching a school's messaging-mode to `per_tap` activates per-tap messages without code change; changing channel priority (e.g. WhatsApp-first vs SMS-first) reroutes correctly; disabling a channel falls back to the next.
- **Dependencies:** Phases 2–4 (for triggers), 1 (recipients).
- **Kickoff prompt:** "Implement Phase 5 Communication hub. A channel-agnostic notification service: templates (bilingual, variables), sendNotification with per-school channel-priority routing + fallback, adapters for WhatsApp (Fonnte), SMS (aggregator), Viber, and Expo push (stubbed). Queue with retry, message_log with delivery status, per-tenant credit metering. Subscribe to domain events: absence (default ON, one message per absentee), fee due/overdue, results published, notices. Build the per-tap RFID messaging consumer but keep it gated behind the per-school messaging-mode setting (default off). Build a bulk-send UI with recipient groups (this absorbs the Notifier product)."

---

### Phase 6 — Portals (parent / student / teacher web)
- [ ] **Goal:** Role dashboards over the data built so far.
- **In scope:** Parent portal (children, attendance, fees + pay online, results, notices, messages); Student portal (attendance, results, homework, notices); Teacher portal (my classes, mark attendance, enter marks, post homework/notices, message guardians); guardian self-registration linked by student + verification.
- **Out of scope:** native apps (Phase 9).
- **Acceptance:** A parent logs in, sees their child's attendance + fee due, pays via Khalti, views the latest marksheet, reads a notice, replies to a message — all scoped correctly.
- **Dependencies:** Phases 1–5.
- **Kickoff prompt:** "Implement Phase 6 portals (parent, student, teacher) as role-scoped Next.js routes reusing existing APIs. Include parent self-registration with student-link verification. No new domain logic — compose existing modules. Mobile-first responsive UI in the design system."

---

### Phase 7 — Timetable, notices polish, homework (LMS-lite)
- [ ] **Goal:** Daily-driver convenience features. (🟡 v2)
- **In scope:** `timetable` (period grid per class/teacher), substitution; `homework/assignments` (post, submit, teacher comment — Veda-style); notices with targeting (class/section/whole school) and read receipts.
- **Acceptance:** Build a class routine; detect a teacher clash; post homework; student submits; teacher comments; targeted notice with read tracking.
- **Dependencies:** Phases 1, 6.
- **Kickoff prompt:** "Implement Phase 7: timetable with clash detection + substitution, homework/assignment submission with teacher comments, and targeted notices with read receipts."

---

### Phase 8 — Secondary modules (library, transport, HR/payroll, admissions)
- [ ] **Goal:** Round out to parity with incumbents. (🟡, pick by client demand)
- **In scope (modular, build the ones a paying client needs):** Library (catalog, issue/return, barcode/RFID); Transport (routes, stops, RFID boarding → parent alert); HR/payroll (staff attendance, salary, payslips); Admissions/enquiry CRM (lead → application → enroll).
- **Acceptance:** per sub-module, a clean end-to-end flow tenant-scoped.
- **Dependencies:** Phases 1–5.
- **Kickoff prompt (per module):** "Implement the [Library | Transport | HR/Payroll | Admissions] module per the plan, tenant-scoped, reusing RFID ingestion and notification triggers where relevant."

---

### Phase 9 — Mobile apps (Expo: Parent + Teacher)
- [ ] **Goal:** Native parent & teacher apps over the same API; real push.
- **In scope:** Expo (RN, TS) monorepo or separate app; auth reuse; Parent app (alerts, fees+pay, results, messages); Teacher app (attendance, marks, homework, messaging); **real Expo push** wired into the §5.6 router as the cheapest channel; OTA updates via EAS; app store + Play store release.
- **Acceptance:** Parent gets a push when child taps in; pays a fee in-app; teacher marks attendance offline-tolerant; builds shipped to both stores.
- **Dependencies:** Phases 1–6 stable.
- **Kickoff prompt:** "Scaffold an Expo (React Native + TS) project reusing the SMS API and auth. Build the Parent app and Teacher app per the plan. Implement Expo push and register it as the 'push' channel in the notification router. Set up EAS build + OTA."

---

### Phase 10 — SaaS layer, analytics, internationalization-readiness
- [ ] **Goal:** Make it a sellable, scalable product and prep for "international later."
- **In scope:** subscription plans + module gating + trials + your superadmin billing console; onboarding wizard; usage/message-credit billing; analytics dashboards (attendance trends, fee collection, at-risk flags — start rule-based, AI later); abstract Nepal-specific bits (grade scale, calendar, payment providers, tax rules) behind **country config** so a new country = config + new adapters, not a rewrite.
- **Acceptance:** A new school self-onboards on a trial; plan limits enforced; you see MRR/usage; switching `country=XX` swaps calendar/grade/tax/payment defaults.
- **Dependencies:** core phases.
- **Kickoff prompt:** "Implement Phase 10: subscription plans with module gating + trials, superadmin billing/usage console, onboarding wizard, analytics dashboards (rule-based at-risk + collection/attendance), and a country-config layer abstracting calendar, grade scale, tax/CBMS, and payment providers for future internationalization."

---

### Phase 11 — Hardening, compliance, performance, launch
- [ ] **Goal:** Production-ready.
- **In scope:** security review (RLS coverage test on every table, device auth, rate limits, CSP), backup/restore drill (prove §5.7), load testing (bulk invoice/attendance/messaging), CBMS adapter (if a client crosses threshold), accessibility, error monitoring/logging, docs + help (Nepali+English), data-export/portability.
- **Acceptance:** Tenant-isolation tests pass on all tables; restore from backup verified; system handles a 2000-student school's month-end invoice + bulk message run; monitoring live.
- **Kickoff prompt:** "Run Phase 11 hardening: write automated tenant-isolation tests across all tables, add rate limiting + CSP, implement and test backup/restore, load-test bulk invoice/attendance/messaging for a 2000-student tenant, add error monitoring, and produce bilingual help docs."

---

## 11. Suggested sequence & rough effort (solo + Claude Code)

| Phase | Theme | Relative effort | MVP? |
|---|---|---|---|
| 0 | Foundations | M | ✅ |
| 1 | SIS | L | ✅ |
| 2 | Attendance + RFID | M | ✅ |
| 3 | Fees + payments | L | ✅ |
| 4 | Exams/grading | M | ✅ |
| 5 | Communication (Notifier) | M | ✅ |
| 6 | Portals | M | ✅ |
| — | **→ MVP launch with 1–2 pilot schools** | | |
| 7 | Timetable/homework | S–M | |
| 8 | Library/transport/HR/admissions | M (each) | |
| 9 | Mobile apps | L | |
| 10 | SaaS + i18n-ready | M | |
| 11 | Hardening/launch | M | |

**MVP = Phases 0–6.** That's a genuinely sellable Nepali school ERP with the RFID wedge. Get a pilot school *during* Phases 1–3, not after Phase 11.

---

## 12. Key decisions to lock before coding (do these first)

1. ✅ **DECIDED — Brand/domain model:** umbrella SaaS; **Notifier folded in as the Communication module** (single login, single bill). (§1.3)
2. **Tenancy** — shared-schema + `tenant_id` + RLS (recommended). (§5.3)
3. **Supabase region** for data-residency credibility. (§5.7)
4. **First payment gateways** — eSewa + Khalti first. (§3.4)
5. **First RFID hardware** — ESP32+RC522 for demo/default; ZKTeco for clients who want a "real device." Build software pipeline regardless; spend on bulk hardware only when a client commits. (§7)
6. **Channel priority** for notifications — WhatsApp (Fonnte) works fine in Nepal and can be primary; SMS/Viber kept as configurable fallbacks (cheap insurance, not a constraint). (§3.5)
7. ✅ **DECIDED — Attendance messaging:** **absence-only, once daily** (cost-driven); per-tap messaging built but OFF by default; everything per-school configurable; **offline-vs-absent guard mandatory**. (§7.6)

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Platform bans (WhatsApp/Meta volatility) | Multi-channel router; SMS+Viber always available (§3.5) |
| Internet/power outages at schools | Offline-buffering readers; idempotent ingestion (§7.3) |
| Cross-tenant data leak | RLS on every table + automated isolation tests (§5.3, Phase 11) |
| IRD/tax compliance scrutiny | Immutable ledger, fiscal numbering, CBMS-ready boundary from day 1 (§3.3) |
| Solo-dev scope overload | Strict vertical-slice phases; MVP = 0–6; ship to a pilot early |
| Incumbent feature breadth (Veda etc.) | Win on RFID wedge + UX + converged messaging, not breadth |
| Hardware capital risk | Defer bulk hardware until paid commitment; demo on cheap ESP32 |

---

## 14. Immediate next actions

1. Confirm the **six decisions** in §12.
2. Hand **Phase 0** to Claude Code using its kickoff prompt.
3. In parallel, line up **one pilot school** (ideally one you already have a relationship with) to validate Phases 1–3 against real data.
4. Order **one ESP32 + RC522** kit to build the RFID demo during Phase 2.

---

*Living document — update phase checkboxes and decisions as you progress. Sources: 2026 SMS market guides (Classter, Gradelink, Kramah, Camu, SchoolCues), Nepal vendor research (Veda, Nimble, eAcademy, InPro, etc.), NEB/OCE grading references, IRD/CBMS e-billing rules, RFID attendance architecture literature, and Nepal communication-channel/regulatory reporting (Sept 2025 ban & reversal).*
