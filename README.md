# Lou Diamond Lava Valdellon — Cinematic Full-Stack & Business Analytics Portfolio CMS

[![Next.js](https://img.shields.io/badge/Next.js-16.4-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3-blue?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![GSAP](https://img.shields.io/badge/GSAP-3.12-88ce02?logo=greensock)](https://greensock.com/)
[![Lenis](https://img.shields.io/badge/Lenis-Smooth_Scroll-black)](https://github.com/darkroomengineering/lenis)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase)](https://supabase.com/)
[![Tests](https://img.shields.io/badge/Tests-Vitest_%2B_Playwright-success)](https://vitest.dev/)

A cinematic, ultra-performant personal portfolio and private Content Management System engineered by **Lou Diamond Lava Valdellon** (Full-Stack Developer & Business Analytics Specialist, BSIT Class of 2026).

Engineered to showcase **100% end-to-end full-stack ownership** across Database schemas, Backend APIs/security, and Frontend UI/UX, running with **$0/month hosting overhead** on Vercel Hobby Tier and Supabase PostgreSQL.

---

## Key Highlights

- **Cinematic Motion & Fluid Interaction:** 60–120 FPS buttery-smooth scrolling powered by **Lenis** and **GSAP**, featuring kinetic split-text reveals, SVG liquid image distortion, and full-viewport curtain preloader.
- **In-App Resume Viewer:** Seamless in-modal PDF viewing with fullscreen expansion, A4 document skeleton loading, and an SSRF-protected streaming proxy (`/api/resume`).
- **Private Administrator CMS (`/admin`):** Full runtime control over portfolio copy, projects, skills bento, and origin story pillars without code redeployment.
- **Multi-Factor Security Perimeter:** Stealth URL gateway (`?portal=key`), HMAC-SHA256 session integrity, constant-time verification, offline RFC 6238 TOTP 2FA, and a 2-column mobile QR cross-device pairing state machine.
- **Cookieless Real-Time Business Analytics:** First-party visitor session telemetry, story chapter conversion funnels, device attribution split, and 1-click CSV/JSON/Brief reporting.
- **Interactive Contact Outbox:** In-site messaging with Zod validation, anti-bot honeypots, rate limiting, and automated Resend transactional email dispatch with in-app reply capabilities.
- **Hybrid Persistence:** Runs instantly with local JSON fallback (`/data/portfolio-db.json`) during development, transitioning to Supabase PostgreSQL in production.

---

## Documentation Quick Links

- [System Documentation & Architecture Manual](file:///SYSTEM_DOCUMENTATION.md): Deep-dive into all tools used, architecture flowcharts, security perimeters, and module breakdowns.
- [Project Architecture Guidelines (GEMINI.md)](file:///GEMINI.md): Strict zero-monolith design rules, performance standards, and quality gates.
- [Master Roadmap & Tracks Log (portfolioPlan.md)](file:///portfolioPlan.md): Completed milestone roadmap, API contracts, and implementation track logs.

---

## Tech Stack & Tools

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5
- **Styling:** Tailwind CSS v4, PostCSS 8, clsx, tailwind-merge
- **Motion:** GSAP 3.12 (ScrollTrigger, Flip), Lenis 1.1
- **State & Validation:** TanStack React Query 5, Zod 3.24
- **Database & Cloud:** Supabase (PostgreSQL 15 & Storage Buckets), Local JSON Engine
- **Email:** Resend REST API
- **Testing:** Vitest 5.1 (Unit/Integration), Playwright 1.65 (Cross-browser E2E)
- **Security:** Node & Web Crypto (HMAC-SHA256, AES-256-GCM, TOTP)

---

## Getting Started

### 1. Installation
```bash
git clone https://github.com/Lou2225/myPortfolio.git
cd myPortfolio
npm install
```

### 2. Environment Setup
Copy the template environment file:
```bash
cp .env.example .env.local
```
Configure your keys in `.env.local`:
```env
ADMIN_PASSWORD=your_secure_password
ADMIN_SESSION_SECRET=your_32_char_cryptographic_secret
RESEND_API_KEY=re_your_key_here
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing & Quality Gates

Run all quality assurance checks before committing:
```bash
# Linter and TypeScript compiler check
npm run lint
npx tsc --noEmit

# Unit & integration tests
npm run test

# End-to-end browser tests
npm run test:e2e

# Production build validation
npm run build
```

---

## License

Created by **Lou Diamond Lava Valdellon**. All rights reserved.
