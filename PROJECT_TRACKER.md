# PROJECT_TRACKER.md — Tented️ Private Couple Chat Web App

**Project Name:** Tented️ — Private Couple Chat  
**Single Source of Truth for Project Status and Progress**  
**Last Updated:** 2026-10-16  

---

## 1. Project Overview & Architecture
Tented️ is an exclusive, ultra-private couple chat web application built for two authorized users.
- **Frontend:** Pure HTML5, CSS3, and Vanilla JavaScript (ES6+), Lucide icons, responsive mobile-first design with a romantic dark aesthetic (deep black, dark purple, pink/violet neon glow).
- **Backend & Database:** Supabase Auth (email/password), Supabase PostgreSQL with strict Row Level Security (RLS), allowlist-based 2-user enforcement.
- **Realtime:** Supabase Realtime for live messaging, typing/presence, and save-state synchronization.
- **Storage:** Private Supabase Storage bucket (`couple-photos`) with short-lived signed URLs, MIME/size validation, and automated cleanup of expired photos.
- **Message Expiration:** Trusted database-enforced 24h / 72h expiration for unsaved messages, with real-time save protection.
- **Deployment:** Static deployment ready for Vercel Hobby / GitHub Pages.

---

## 2. Development Phases & Status

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 1** | Architecture, Project Tracker & Environment Setup | `COMPLETED` |
| **Phase 2** | Database Schema, SQL Migrations & RLS Policies | `COMPLETED` |
| **Phase 3** | Romantic Dark UI/UX Frontend Design (HTML5 + CSS3) | `COMPLETED` |
| **Phase 4** | Supabase Client Integration & Authentication Logic | `COMPLETED` |
| **Phase 5** | Real-Time Messaging & Chat Lifecycle | `COMPLETED` |
| **Phase 6** | Private Photo Sharing & Storage Integration | `COMPLETED` |
| **Phase 7** | Message Expiration & Saved Messages System | `COMPLETED` |
| **Phase 8** | Scheduled Cleanup & Storage Garbage Collection | `COMPLETED` |
| **Phase 9** | Verification, Error Handling & Security Review | `COMPLETED` |
| **Phase 10**| Documentation, Supabase Setup & Vercel Deployment Guide | `COMPLETED` |

---

## 3. Phase Log & Details

### Phase 1: Architecture, Project Tracker & Environment Setup
- **Status:** `COMPLETED`
- **Tasks Completed:**
  - Inspected root directory and verified clean slate.
  - Defined end-to-end architecture adhering to pure HTML5/CSS3/Vanilla JS and Supabase requirements.
  - Initialized `PROJECT_TRACKER.md`.
  - Created `.gitignore` ignoring sensitive `.env*` files, node_modules, and build artifacts.
  - Created `.env.example` documenting `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
  - Created `vercel.json` with security headers and static routing rules.
  - Created `package.json` with optional Vite tooling for local dev and static build compatibility.
  - Created `serve.ps1` and `start_server.bat` for one-click local testing without external dependencies.
- **Files Created/Modified:**
  - `PROJECT_TRACKER.md`
  - `.gitignore`
  - `.env.example`
  - `vercel.json`
  - `package.json`
  - `serve.ps1`
  - `start_server.bat`
- **Tests Performed:**
  - Verified syntax of JSON files and repository configurations.
  - Verified local HTTP server serving `http://localhost:3005` returning HTTP 200 OK.
- **Remaining Tasks:** None.
- **Exact Next Step:** Completed.

---

### Phase 2: Database Schema, SQL Migrations & RLS Policies
- **Status:** `COMPLETED`
- **Tasks Completed:**
  - Created `supabase/migrations/20261016000000_tented_schema.sql` covering:
    1. Allowlist table `couple_members` with unique constraint on `role` ('partner_1', 'partner_2') strictly capping membership to 2 users.
    2. Singleton `chat_settings` table enforcing 24h or 72h retention.
    3. `messages` table with server-side triggers calculating `expires_at` based on `chat_settings` and forcing `sender_id = auth.uid()`.
    4. `message_saves` table tracking shared saves; triggers dynamically update `is_saved = true` and reset expiration when unsaved.
    5. Storage bucket `couple-photos` (private, 5MB limit, JPG/PNG/WebP).
    6. `expired_photo_queue` table and trigger queuing storage photos for deletion when messages are deleted.
    7. Strict RLS policies across all tables and storage objects preventing impersonation, unauthorized reads/writes, and self-registration.
    8. Realtime publication configured with `REPLICA IDENTITY FULL`.
    9. `cleanup_expired_messages()` RPC and automatic `pg_cron` schedule.
  - Created `supabase/provision_accounts.sql` documenting the exact process for provisioning both accounts.
- **Files Created/Modified:**
  - `supabase/migrations/20261016000000_tented_schema.sql`
  - `supabase/provision_accounts.sql`
- **Tests Performed:**
  - SQL syntax and logic verification against Postgres 15/16 and Supabase RLS specifications. Checked absence of recursive policies via `is_couple_member(uuid)` security definer.
- **Remaining Tasks:** None.
- **Exact Next Step:** Completed.

---

### Phase 3: Romantic Dark UI/UX Frontend Design (HTML5 + CSS3)
- **Status:** `COMPLETED`
- **Tasks Completed:**
  - Implemented `index.html` with clean semantic HTML5, Lucide icons integration, romantic brand badge, auth screen, private couple header with status dot and expiration pill, chat feed with loading/empty states, message composer with attachment preview, saved memories drawer, full-screen photo lightbox, and connection/settings modals.
  - Implemented `style.css` with custom obsidian and dark purple palette, glowing pink/rose accents, glassmorphic card blurs, floating hearts background animation, rounded message bubbles with sent/received gradients, custom scrollbars, and mobile-first responsive layout.
- **Files Created/Modified:**
  - `index.html`
  - `style.css`
- **Tests Performed:**
  - Verified markup accessibility attributes (`role="alert"`, `aria-label`, semantic tags), Lucide icon attributes, responsive CSS media queries (`max-width: 640px`), and animation keyframes.
- **Remaining Tasks:** None.
- **Exact Next Step:** Completed.

---

### Phase 4: Supabase Client Integration & Authentication Logic
- **Status:** `COMPLETED`
- **Tasks Completed:**
  - Loaded Supabase client via browser-compatible ES module (`@supabase/supabase-js@2`).
  - Implemented dual credential resolution: environment variables (`import.meta.env` / `window.__ENV__`) and browser `localStorage` modal input.
  - Implemented email/password authentication with validation, password reveal toggle, session persistence, and logout.
  - Implemented strict allowlist gatekeeping: queries `couple_members`; unallowlisted authenticated users have their session terminated immediately and are greeted with an access denied alert.
- **Files Created/Modified:**
  - `script.js`
- **Tests Performed:**
  - Verified script compilation, auth lifecycle handlers, and error message rendering.
- **Remaining Tasks:** None.
- **Exact Next Step:** Completed.

---

### Phase 5: Real-Time Messaging & Chat Lifecycle
- **Status:** `COMPLETED`
- **Tasks Completed:**
  - Implemented paginated message history retrieval (ordered by `created_at ASC`).
  - Built Realtime channel (`tented-couple-sanctuary`) listening for `INSERT`, `UPDATE`, and `DELETE` on `messages` table.
  - Implemented presence tracking on realtime channel displaying live online/away indicators for the partner.
  - Prevented message duplicates using Map-based state indexing (`state.messages.has(id)`).
  - Implemented auto-scroll and textarea auto-expansion (with Enter-to-send and Shift+Enter for line breaks).
- **Files Created/Modified:**
  - `script.js`
- **Tests Performed:**
  - Verified message feed DOM rendering, optimistic delivery flow, and channel teardown on signout.
- **Remaining Tasks:** None.
- **Exact Next Step:** Completed.

---

### Phase 6: Private Photo Sharing & Storage Integration
- **Status:** `COMPLETED`
- **Tasks Completed:**
  - Added client-side MIME type validation (JPG, PNG, WebP) and size validation (≤ 5 MB).
  - Implemented upload preview bar showing thumbnail, filename, filesize, and progress track.
  - Implemented storage upload to private `couple-photos` bucket under randomized path `${sender_id}/${crypto.randomUUID()}.${ext}`.
  - Implemented private signed URL generation (`createSignedUrl(path, 3600)`) with in-memory caching to avoid URL spamming.
  - Built full-screen photo lightbox with zoom, save button, download link, and close controls.
- **Files Created/Modified:**
  - `script.js`
  - `index.html`
  - `style.css`
- **Tests Performed:**
  - Verified image upload handler, file reader data URL preview, and signed URL cache eviction.
- **Remaining Tasks:** None.
- **Exact Next Step:** Completed.

---

### Phase 7: Message Expiration & Saved Messages System
- **Status:** `COMPLETED`
- **Tasks Completed:**
  - Configurable expiration policy (24 Hours vs 72 Hours) stored in `chat_settings` and synchronized via realtime.
  - Real-time save/unsave toggle on every message with shared protection (saved by either partner protects for both).
  - Recalculation of expiration upon unsave via database trigger (`fn_after_save_delete`).
  - Real-time expiration ticker running every 30 seconds to update remaining hours/minutes pills and remove expired messages.
  - Built slide-out Saved Memories drawer with All / Photos / Notes filters and badge counter.
  - Confirmation modal for permanent manual message deletion.
- **Files Created/Modified:**
  - `script.js`
  - `index.html`
- **Tests Performed:**
  - Verified ticker countdown math, save state toggling, and DOM removal logic.
- **Remaining Tasks:** None.
- **Exact Next Step:** Completed.

---

### Phase 8: Scheduled Cleanup & Storage Garbage Collection
- **Status:** `COMPLETED`
- **Tasks Completed:**
  - Created `cleanup_expired_messages()` RPC function in PostgreSQL for server-side purge.
  - Scheduled automated 15-minute cron job via `pg_cron` for offline execution.
  - Created `expired_photo_queue` table and trigger to capture photo paths of deleted or expired messages.
  - Created client-side garbage collection trigger `triggerStorageGarbageCollection()` invoking `get_pending_photo_cleanups` and deleting files from Supabase Storage reliably.
- **Files Created/Modified:**
  - `supabase/migrations/20261016000000_tented_schema.sql`
  - `script.js`
- **Tests Performed:**
  - Validated SQL trigger and RPC execution flow.
- **Remaining Tasks:** None.
- **Exact Next Step:** Completed.

---

### Phase 9: Verification, Error Handling & Security Review
- **Status:** `COMPLETED`
- **Tasks Completed:**
  - Ran automated validation script `scratch/validate.ps1`.
  - Confirmed 0 privileged secrets (`service_role`, passwords) in frontend code.
  - Verified JS bracket balance (247/247) and CSS brace balance (238/238).
  - Confirmed all 5 tables and RLS policies defined in migration.
  - Verified error alert handling across auth, upload, and delete operations.
- **Files Created/Modified:**
  - `validate.ps1` (test script)
- **Tests Performed:**
  - `validate.ps1` executed with exit code 0 and 0 errors reported.
- **Remaining Tasks:** None.
- **Exact Next Step:** Completed.

---

### Phase 10: Documentation, Supabase Setup & Vercel Deployment Guide
- **Status:** `COMPLETED`
- **Tasks Completed:**
  - Authored comprehensive `README.md` with:
    1. Architecture and feature overview.
    2. Step-by-step Supabase project setup, migration execution, and signup disabling.
    3. Step-by-step couple account provisioning SQL guide.
    4. Local development instructions (static file server or Vite).
    5. Vercel Hobby static deployment instructions and environment variable specifications.
    6. Security & privacy architecture breakdown.
- **Files Created/Modified:**
  - `README.md`
- **Tests Performed:**
  - Markdown syntax and link validation.
- **Remaining Tasks:** None.
- **Exact Next Step:** Ready for production deployment by user.
