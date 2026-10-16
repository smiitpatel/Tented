# Tented️ — Private Couple Chat Web App

> **An exclusive, end-to-end private sanctuary for two.**  
> Built with HTML5, CSS3, Vanilla JavaScript (ES6+), and Supabase.  
> Exclusively authenticated for two authorized users with real-time messaging, private photo sharing, saved memories, and automated 24h / 72h message expiration.

---

## 🌟 Features

- **Exclusive Two-Partner Sanctuary:**
  - Hardened database-controlled allowlist capping membership to exactly 2 authorized accounts.
  - Public signup disabled; unapproved visitors cannot read messages, view photos, or register.
- **Romantic Dark Aesthetic:**
  - Obsidian and dark purple palette with neon rose/violet gradients.
  - Soft ambient glow effects and floating hearts background.
  - Responsive mobile-first interface designed for phones and desktop screens.
- **Real-Time Messaging:**
  - Instant two-way messaging using Supabase Realtime channels.
  - Live presence indicators (showing when your partner is in the sanctuary).
  - Optimistic UI updates with deduplication and reconnection resilience.
- **Server-Enforced Message Expiration:**
  - Configurable retention: **24 Hours (Default)** or **72 Hours (Weekend Mode)**.
  - Expiration timestamps computed securely on the database via PostgreSQL triggers.
  - Unsaved messages automatically vanish from PostgreSQL tables even when both users are offline.
  - Live countdown hourglass pills on each message.
- **Shared Saved Memories:**
  - Save/unsave any text or photo memory with a single heart tap.
  - A message saved by either partner is protected forever from expiration.
  - Dedicated slide-out drawer to browse saved memories by All, Photos, or Notes.
  - Unsaving safely recalculates a fresh expiration countdown.
- **Private Photo Vault:**
  - Upload photos (JPG, PNG, WebP ≤ 5 MB) stored in a private Supabase Storage bucket (`couple-photos`).
  - Short-lived 60-minute signed URLs ensure photos are never publicly accessible.
  - Full-screen photo lightbox with zoom and save controls.
  - Garbage collection queue purges storage files when messages expire or are deleted.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Structure** | HTML5 Semantic Elements, Mobile Viewport meta tags |
| **Styling** | Vanilla CSS3, Custom Properties, Glassmorphism, Keyframe Animations |
| **Frontend Logic** | Vanilla JavaScript (ES6+), Native DOM APIs, FileReader |
| **Icons** | Lucide Icons (Browser ES / Script) |
| **Authentication** | Supabase Auth (Email / Password, Public Signup Disabled) |
| **Database** | Supabase PostgreSQL with strict Row Level Security (RLS) |
| **Live Sync** | Supabase Realtime (Postgres Changes & Presence) |
| **Photo Vault** | Supabase Storage (Private bucket `couple-photos`, Signed URLs) |
| **Hosting** | Static Hosting on Vercel Hobby / GitHub Pages |

---

## 🚀 Setup & Deployment Guide

### Step 1: Create a Free Supabase Project
1. Log in to [Supabase](https://supabase.com) and click **"New Project"**.
2. Name your project (e.g., `tented-couple-chat`), generate a secure database password, and choose your preferred region.
3. Once the project is created, navigate to **Project Settings -> API**:
   - Copy **Project URL** (`https://xyzcompany.supabase.co`).
   - Copy **anon / public key** (`eyJhbGci...`).
   *(NEVER copy or expose the `service_role` secret key!)*

---

### Step 2: Run Database Migration & Security Policies
1. In the Supabase Dashboard, open the **SQL Editor** from the left navigation.
2. Click **"New Query"**.
3. Open the file [`supabase/migrations/20261016000000_tented_schema.sql`](file:///supabase/migrations/20261016000000_tented_schema.sql) in this repository.
4. Copy its entire contents, paste it into the Supabase SQL Editor, and click **"Run"**.
   - This sets up all tables (`couple_members`, `chat_settings`, `messages`, `message_saves`, `expired_photo_queue`), triggers, RLS policies, the private `couple-photos` storage bucket, and realtime publications.

---

### Step 3: Provision the Two Partner Accounts
1. In the Supabase Dashboard, go to **Authentication -> Users**.
2. Click **"Add user" -> "Create user"**:
   - Create Account 1 (e.g. `you@tented.love`) with a secure password.
   - Create Account 2 (e.g. `girlfriend@tented.love`) with a secure password.
3. Under **Authentication -> Providers -> Email**:
   - **TURN OFF "Enable Signup"**. This ensures nobody else can ever sign up for an account.
4. Go back to **Authentication -> Users**, and copy the **User UID** for each account.
5. In the **SQL Editor**, open [`supabase/provision_accounts.sql`](file:///supabase/provision_accounts.sql), substitute the two UUIDs, and run:

```sql
-- Provision Partner 1 & Partner 2
INSERT INTO public.couple_members (user_id, role, display_name, avatar_emoji)
VALUES 
    ('REPLACE-WITH-YOUR-UUID', 'partner_1', 'My Love', '🤴'),
    ('REPLACE-WITH-GIRLFRIEND-UUID', 'partner_2', 'My Queen', '👸')
ON CONFLICT (user_id) DO UPDATE SET 
    role = EXCLUDED.role,
    display_name = EXCLUDED.display_name,
    avatar_emoji = EXCLUDED.avatar_emoji;
```

---

### Step 4: Configure Environment & Run Locally

#### Option A: Direct Static (No Build Required)
1. You can open `index.html` directly in any web browser, or serve it using any simple local server:
   ```bash
   # Using Python
   python -m http.server 3000
   
   # Or using npx serve
   npx serve .
   ```
2. On first visit, click **"Configure Supabase Connection"** at the bottom of the login screen and enter your **Supabase URL** and **Anon Key**. Credentials are saved securely in your browser's `localStorage`.

#### Option B: With Vite Dev Server
1. Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```
2. Fill in:
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
   ```
3. Run:
   ```bash
   npm install
   npm run dev
   ```

---

### Step 5: Deploy to Vercel (Hobby Free Tier)

1. Push this repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Tented Private Couple Chat"
   git branch -M main
   git remote add origin https://github.com/your-username/tented-chat.git
   git push -u origin main
   ```
2. In the [Vercel Dashboard](https://vercel.com):
   - Click **"Add New..." -> "Project"**.
   - Import your GitHub repository `tented-chat`.
   - **Framework Preset**: Select **"Other"** (or Vite).
   - Under **Environment Variables**, add:
     - `VITE_SUPABASE_URL` = `https://your-project-ref.supabase.co`
     - `VITE_SUPABASE_PUBLISHABLE_KEY` = `your-supabase-anon-key`
   - Click **"Deploy"**.
3. Vercel will deploy your static application in seconds with an SSL-secured URL (e.g., `https://tented-chat.vercel.app`).
4. Both you and your girlfriend can bookmark the URL on your mobile devices and add it to your home screen as a Web App!

---

## 🔒 Security & Privacy Architecture

- **Row Level Security (RLS) on Every Table:**
  Every SQL query runs through `public.is_couple_member(auth.uid())`. Even if an attacker obtains a valid Supabase Auth JWT through a stolen account from another service, queries against `messages`, `chat_settings`, or `storage.objects` return 0 rows.
- **Server-Side Expiration Calculations:**
  `expires_at` cannot be spoofed by the client. The database trigger forces `NEW.expires_at := now() + (retention_hours || ' hours')::interval` based on `chat_settings`.
- **Sender Spoofing Prevention:**
  Database triggers force `NEW.sender_id := auth.uid()`.
- **Zero Public Photo URLs:**
  Photos are uploaded to a private bucket (`couple-photos`). Images are rendered exclusively through short-lived signed URLs (60 minutes).
- **Automated Offline Cleanup:**
  PostgreSQL `cleanup_expired_messages()` purges all expired unsaved rows. In addition, when Supabase's built-in `pg_cron` extension is active, the database automatically cleans itself every 15 minutes even when both partners are asleep or offline.

---

## 📄 License
Created for private couple use under the MIT License.
