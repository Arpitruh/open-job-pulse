<div align="center">

# 🎯 OpenJobPulse

**Privacy-First, AI-Powered Job Intelligence & Automation Platform**

Automate your job search with two-stage semantic matching, streaming AI cover letters, and sub-3-second alerts — without exposing your career data to third-party brokers.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_%2B_pgvector-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![Redis](https://img.shields.io/badge/BullMQ_%2B_Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://bullmq.io/)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](./LICENSE)

[Features](#-features) • [Architecture](#️-architecture--matching-pipeline) • [Privacy Model](#-privacy--security-model) • [Quick Start](#-quick-start-local) • [Custom Scrapers](#-adding-a-custom-scraper) • [Roadmap](#️-roadmap)

</div>

---

## 🚀 Why OpenJobPulse?

Engineers spend **8–15 hours a week** refreshing the same job boards, reading mismatched descriptions, and rewriting boilerplate cover letters. Worse, commercial job platforms monetize your job-seeking signals and sell your resume data to staffing agencies.

**OpenJobPulse** replaces manual job triage with a self-hostable, high-throughput automation pipeline:
- **Zero-Cost Local Embeddings:** Generates 384-dimension vector embeddings locally inside the worker container via ONNX Runtime (`all-MiniLM-L6-v2`). Your resume never has to leave your server.
- **Sub-80ms Semantic Triage:** Combines deterministic hard filters with `pgvector` HNSW cosine similarity to match 10,000+ listings against 500+ candidate profiles in milliseconds.
- **Sub-3-Second Dispatch:** Pushes matched listings straight to Telegram (with interactive inline action buttons), Email, or Webhooks the moment they go live.
- **BYOK AI Suite:** Stream tailored cover letters, rewrite resume bullets for ATS compatibility, and analyze cross-market skill gaps using your own OpenAI or Anthropic API key.

---

## ✨ Features

### 🔍 Intelligent Job Discovery & Matching
- **Multi-Source Ingestion:** Native adapters for Greenhouse, Lever, and arbitrary RSS/Atom feeds.
- **SHA-256 Content Deduplication:** Fingerprints normalized `(company + title + location)` payloads so you never see cross-posted roles twice.
- **Two-Stage Matching Engine:**
  - *Stage 1 (Deterministic — Microseconds):* Eliminates ~80% of mismatches via hard constraints (minimum salary, remote/hybrid/on-site policy, excluded keywords like `C2C` or `clearance`).
  - *Stage 2 (Probabilistic — Milliseconds):* Computes semantic cosine similarity (`1 - (profile_vec <=> job_vec)`) using PostgreSQL `pgvector` with HNSW indexing.
- **Transparent Match Breakdown:** Inspect exact similarity scores, matched keywords, and filter pass/fail criteria for every listing.

### 🤖 AI Career Suite (BYOK — Bring Your Own Key)
- **Streaming Cover Letter Generator:** Token-by-token real-time generation via Server-Sent Events (SSE). Customize tone (*Professional, Enthusiastic, Concise, Story-Driven*), length (*150 / 300 / 500 words*), and hook style (*Achievement-First, Role-Excitement, Mutual-Connection*). Edit inline with TipTap and export to `.pdf` or `.docx`.
- **Surgical Resume Optimizer:** Outputs a structured JSON audit featuring overall match score, ATS compatibility rating, present/missing keyword chips, and metric-driven bullet point rewrites.
- **Pipeline Skills Gap Analyzer:** Aggregates skill demand across your *entire* matched pipeline (e.g., *"Terraform appears in 67% of your target roles with an avg +$18k salary premium"*) with curated learning paths.

### 📬 Real-Time Omnichannel Alerts
- **Interactive Telegram Bot:** Receive rich job cards with inline keyboard buttons (**Apply**, **Save**, **Archive**, **Reject**) that mutate application state directly from chat.
- **Two-Way Browser Sync:** Clicking an action in Telegram updates your web Kanban board in `<2 seconds` via SSE.
- **Email Digests & Webhooks:** Instant, daily, or weekly summaries via Resend/SMTP, plus outbound JSON webhooks for Discord, Slack, Zapier, or n8n.

### 🗂️ Application CRM & Kanban Tracker
- **5-Stage Drag-and-Drop Board:** Track roles across *Saved → Applied → Interviewing → Offer → Archived*.
- **Immutable Activity Audit Log:** Automatic timestamping for every status change, alert dispatch, and AI generation.
- **Rich Interview Notes:** Store recruiter contacts, compensation bands, and follow-up reminders per role.

### 💳 SaaS-Ready Monetization & Anti-Abuse
- **Flexible Billing:** 7-day cardless free trial, Weekly/Monthly/Yearly Stripe subscriptions, and one-time credit top-up packs with idempotent webhook handling.
- **3-Point Identity Lock:** Prevents free-trial abuse by hashing Email + Twilio Phone OTP + LinkedIn OAuth `sub` claims via SHA-256 in a `blocked_identities` table.
- **Admin Command Center:** Monitor MRR, churn, plan distribution, credit audit logs, and scraper queue health with manual trigger overrides.

---

## 🔐 Privacy & Security Model

| Capability | Commercial Job Boards | OpenJobPulse |
|---|---|---|
| **Resume Storage & Embeddings** | Indexed and sold to recruiter seats | Generated locally via ONNX Runtime (`all-MiniLM-L6-v2`) |
| **LLM Prompts & Keys** | Proxied and logged on vendor servers | Direct BYOK (OpenAI / Anthropic) encrypted with AES-256 |
| **Behavioral Telemetry** | Heavy ad-tech & session tracking | Zero Google Analytics, Mixpanel, or third-party trackers |
| **Identity Blacklisting** | Plaintext PII retention | Irreversible SHA-256 identity hashes |
| **GDPR Compliance** | Buried manual support tickets | 1-click full JSON/ZIP export & cascading hard-delete |

---

## 🏗️ Architecture & Matching Pipeline

```text
┌─────────────────────────────────────────────────────────────────────┐
│                     Next.js 16 (App Router)                         │
│        User Dashboard · Kanban CRM · Admin Portal · SSE Stream      │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                 PostgreSQL 16 + pgvector (Neon)                     │
│          22 Prisma Models · HNSW Vector Indexes · Row Locking       │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                      Redis + BullMQ (Upstash)                       │
│        5 Isolated Queues · Exponential Backoff · Content Dedup      │
└───┬──────────────┬───────────────┬───────────────┬──────────────┬───┘
    │              │               │               │              │
┌───▼──────┐ ┌─────▼──────┐ ┌──────▼─────┐ ┌───────▼────┐ ┌───────▼────┐
│Ingestion │ │  Matching  │ │  Dispatch  │ │  AI Queue  │ │ Scheduler  │
│Greenhouse│ │1.Hard Rules│ │Telegram Bot│ │Cover Letter│ │Cron Triggers│
│Lever API │ │2.pgvector  │ │Resend Email│ │Resume Audit│ │Stale Job   │
│RSS / Atom│ │  Cosine Sim│ │Webhooks/SSE│ │Skills Gap  │ │Cleanup     │
└──────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘
```

### The Two-Stage Matching Query
Once deterministic filters prune incompatible listings, survivors are scored in ~12ms over 100k+ vectors directly inside PostgreSQL:

```sql
SELECT 
  id, 
  1 - (profile_vector <=> listing_vector) AS similarity_score
FROM user_profiles
WHERE (profile_vector <=> listing_vector) < 0.35 -- > 0.65 cosine similarity
ORDER BY profile_vector <=> listing_vector ASC
LIMIT 50;
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React, Tailwind CSS, shadcn/ui, TipTap Editor |
| **Language** | TypeScript 5.5 (`strict: true`) |
| **Database & Vectors** | PostgreSQL 16 + `pgvector` (HNSW Indexing) |
| **ORM** | Prisma v5 (22 relational & vector models) |
| **Queues & Workers** | BullMQ + Redis (5 independent worker pools) |
| **Authentication** | NextAuth.js (Credentials + LinkedIn OAuth + Twilio OTP) |
| **Payments** | Stripe (Subscriptions, Customer Portal, Credit Packs) |
| **AI & LLMs** | OpenAI (`gpt-4o`) & Anthropic (`claude-3-5-sonnet` / `claude-3-7-sonnet`) via BYOK |
| **Embeddings** | Local `all-MiniLM-L6-v2` via ONNX Runtime (384d) or OpenAI `text-embedding-3-small` (1536d) |
| **Notifications** | Telegraf (Telegram), Resend (Transactional Email), Axios (Signed Webhooks) |
| **Monorepo** | Turborepo + npm workspaces |

---

## 📦 Monorepo Structure

```text
open-job-pulse/
├── apps/
│   ├── web/                 # Next.js 16 frontend, API route handlers & SSE endpoints
│   └── worker/              # BullMQ background consumers, ATS scrapers & Telegram bot
├── packages/
│   ├── db/                  # Prisma schema (22 models), migrations & vector helpers
│   ├── queue/               # BullMQ queue definitions, retry policies & payload types
│   ├── ai/                  # BYOK LLM gateway, token stream handlers & credit ledger
│   └── embeddings/          # Local ONNX runtime & OpenAI embedding adapters
└── prompts/                 # Versioned system prompts for cover letters & resume audits
```

---

## ⚡ Quick Start (Local Development)

### Prerequisites
- **Node.js** `>= 20.x`
- **Docker** & **Docker Compose** (for local Postgres + `pgvector` and Redis)

### 1. Clone & Install Dependencies

```bash
git clone [https://github.com/arpitruh/open-job-pulse.git](https://github.com/arpitruh/open-job-pulse.git)
cd open-job-pulse
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```
Populate the required secrets in `.env` (see [Environment Variables](#-environment-variables) below). Generate 32-character secrets quickly via:
```bash
openssl rand -hex 16
```

### 3. Spin Up Infrastructure

```bash
docker compose up -d
```

### 4. Initialize Database & `pgvector`

```bash
# Enable pgvector extension inside the container
docker exec -it ojp-postgres psql -U ojp_admin -d openjobpulse \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run Prisma migrations
npm run db:migrate

# Seed subscription tiers and default admin user
npm run db:seed
```

### 5. Launch Development Servers

```bash
# Terminal 1 — Next.js Web App (http://localhost:3000)
cd apps/web && npm run dev

# Terminal 2 — BullMQ Workers & Scraper Engine
cd apps/worker && npm run dev
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|:---:|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (with `pgvector` enabled) |
| `REDIS_URL` | ✅ | Redis connection string for BullMQ queues & SSE pub/sub |
| `NEXTAUTH_SECRET` | ✅ | 32-character secret for session signing |
| `ENCRYPTION_SECRET` | ✅ | 32-character AES-256 key for encrypting user BYOK API keys |
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRICE_MONTHLY` | ✅ | Stripe Price ID for monthly subscription tier |
| `ADMIN_EMAIL` | ✅ | Email address seeded with root Admin dashboard privileges |
| `TWILIO_ACCOUNT_SID` | ⚠️ | Twilio SID for SMS OTP verification (optional in local dev) |
| `LINKEDIN_CLIENT_ID` | ⚠️ | LinkedIn OAuth Client ID for identity verification (optional in dev) |
| `TELEGRAM_BOT_TOKEN` | ⚠️ | BotFather token for interactive Telegram alerts (optional) |
| `RESEND_API_KEY` | ⚠️ | Resend API key for transactional emails & digests (optional) |

---

## 🔌 Adding a Custom Scraper

OpenJobPulse uses a modular adapter pattern. You can add a new job source in under 50 lines of TypeScript by extending `BaseScraper` inside `apps/worker/src/scrapers/`:

```typescript
import { BaseScraper, type RawJobListing, type ScraperConfig } from "./base.scraper";

export class MyCustomScraper extends BaseScraper {
  constructor(config: ScraperConfig) {
    super(config, "MyPortal");
  }

  async fetch(): Promise<RawJobListing[]> {
    // Built-in exponential backoff & rate-limit handling via this.withRetry()
    const res = await this.withRetry(() =>
      this.http.get("[https://myjobboard.com/api/v1/jobs](https://myjobboard.com/api/v1/jobs)")
    );
    return res.data.jobs.map((job: unknown) => this.normalize(job));
  }

  normalize(job: any): RawJobListing {
    return {
      externalId: `myportal-${job.id}`,
      companyName: job.company,
      jobTitle: job.title,
      locationRaw: job.location,
      workMode: this.detectWorkMode(job.location), // Auto-classifies REMOTE | HYBRID | ON_SITE
      applyUrl: job.url,
      descriptionRaw: job.description,
    };
  }
}
```

---

## 🚢 Production Deployment

### 1. Database (Neon Serverless Postgres)
1. Create a project on [Neon](https://neon.tech) and enable the `vector` extension (`CREATE EXTENSION vector;`).
2. Run production migrations and seed data:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate:prod
   DATABASE_URL="postgresql://..." npm run db:seed
   ```

### 2. Web Application (Vercel)
1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Set the **Root Directory** to `apps/web`.
3. Add all required environment variables and deploy.

### 3. Background Workers (Railway / Fly.io / VPS)
1. Create a new service on [Railway](https://railway.app) connected to your GitHub repo.
2. Set the **Root Directory** to `apps/worker` (automatically builds via `apps/worker/Dockerfile`).
3. Attach your Redis instance and environment variables.

### 4. Stripe Webhook Forwarding
Register your production webhook endpoint (`https://your-domain.com/api/webhooks/stripe`) for the following 5 events:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- ` customer.subscription.trial_will_end`
- `invoice.payment_failed`

For local webhook testing:
```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

---

## 🗺️ Roadmap

- [x] **Phase 1: Core Foundation** — Turborepo workspace, Prisma schema (22 models), NextAuth + 3-point identity lock
- [x] **Phase 2: Ingestion & Matching** — Greenhouse/Lever/RSS scrapers, local ONNX embeddings, `pgvector` HNSW pipeline
- [x] **Phase 3: Real-Time Dispatch & CRM** — Interactive Telegram bot, Kanban board, SSE browser sync
- [x] **Phase 4: Billing & Admin** — Stripe subscriptions, credit ledger, admin analytics & scraper telemetry
- [x] **Phase 5: BYOK AI Suite** — Streaming cover letter editor, ATS resume optimizer, pipeline skills gap analyzer
- [ ] **Phase 6: Browser Extension** — 1-click job capture & autofill for Workday, Ashby, and BambooHR
- [ ] **Phase 7: Mobile PWA** — Installable mobile web app with native Web Push notifications
- [ ] **Phase 8: Public API & Webhook Marketplace** — Community scraper templates and outbound automation recipes
- [ ] **Phase 9: Team & Agency Tiers** — Multi-seat workspaces for bootcamps, career coaches, and recruiting collectives

---

## 🤝 Contributing

Contributions, new ATS scraper adapters, and bug reports are welcome!

1. Fork the repository and create your feature branch (`git checkout -b feat/ashby-scraper`).
2. Implement your adapter in `apps/worker/src/scrapers/` and add unit tests in `apps/worker/src/scrapers/__tests__/`.
3. Verify builds and types across the monorepo (`npm run build && npm run typecheck`).
4. Open a Pull Request.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for detailed architecture conventions.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for full details.
