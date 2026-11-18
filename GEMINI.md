# GEMINI.md — Strict Project Rules & Architecture Guidelines

**Project:** Lou Diamond Lava Valdellon — Cinematic Full-Stack & Business Analytics Portfolio  
**Target Platform:** Vercel (Hobby Tier — $0/month)  
**Live Server / Local Dev:** Next.js Dev Server (`http://localhost:3000`) with instant HMR  

---

## 1. Project Identity & Core Narrative

* **Owner:** Lou Diamond Lava Valdellon (Age: 22, Class of 2026)
* **Title:** Full-Stack Developer & Business Analytics Specialist (BSIT)
* **Signature Origin:** Stepped up as the dedicated lead developer for group/capstone systems, taking 100% end-to-end ownership across Database (schemas/SQL), Backend (APIs/logic), and Frontend (UI/UX).
* **Tone & Persona:** Cinematic, confident, technically rigorous, data-driven, relentless executor.

---

## 2. Strict Architectural Directives

### A. Modular Partials & Reusable Components (Zero Monoliths)
* **Strict Separation of Concerns:** NO massive single-file components. Every section and sub-feature must be isolated in its own modular partial under `src/components/`.
* **Component Directory Layout:**
  ```
  src/
  ├── components/
  │   ├── admin/                # Modular /admin CMS partials
  │   │   ├── AdminLogin.tsx    # Private authentication gate (Password + TOTP)
  │   │   ├── AnalyticsOverview.tsx # Business analytics & chapter funnel
  │   │   ├── ProfileHeroManager.tsx # Hero, avatar/CV upload, roles, contact
  │   │   ├── StoryMarqueeManager.tsx # Story, 4 pillars & marquee editor
  │   │   ├── SkillsImpactManager.tsx # Skills bento, KPI counters & headers
  │   │   ├── ProjectsManager.tsx # Projects & case studies CRUD + upload
  │   │   ├── InboxManager.tsx  # Contact form inbox (read, star, Resend reply)
  │   │   ├── SettingsManager.tsx # Master CMS settings tab coordinator
  │   │   └── settings/         # Granular settings partials (Security, Appearance, Backups)
  │   │       ├── SecurityAccessSettings.tsx # Trusted devices (paginated), TOTP 2FA, session epoch
  │   │       ├── QrDevicePairModal.tsx # Balanced 2-column mobile QR pairing modal
  │   │       ├── DeviceEditModal.tsx # Hardware/telemetry inspector & label editor
  │   │       └── TotpSetupModal.tsx # Authenticator app QR setup & recovery codes
  │   ├── motion/               # Reusable animation primitives
  │   │   ├── SmoothScroll.tsx  # Lenis + GSAP sync wrapper & smooth anchor scroll
  │   │   ├── Preloader.tsx     # Full-page fixed curtain wipe + GPU scaleX progress bar
  │   │   ├── BrandPortal.tsx   # Floating stealth admin portal gateway
  │   │   ├── BrandPortalOrb.tsx # Brand portal draggable orb (clean stealth trigger)
  │   │   ├── LiquidImage.tsx   # SVG turbulence displacement filter
  │   │   ├── Magnetic.tsx      # Cursor proximity magnetic pull
  │   │   └── SplitText.tsx     # Kinetic character & line reveal
  │   ├── sections/             # Modular section partials
  │   │   ├── Hero.tsx          # Hero section (Name, Avatar, Roles, in-app Resume CTA)
  │   │   ├── Marquee.tsx       # Infinite principles ticker
  │   │   ├── Story.tsx         # The origin narrative & 4 core pillars
  │   │   ├── TechBento.tsx     # Full-Stack & Analytics skills bento grid
  │   │   ├── Projects.tsx      # Selected systems grid (offset layout)
  │   │   ├── Impact.tsx        # By-the-numbers metrics counter
  │   │   └── Contact.tsx       # In-site form + magnetic mailto & Resend dispatch
  │   ├── ui/                   # Atomic, reusable UI primitives
  │   │   ├── fields/           # Reusable strict-validated form field partials
  │   │   │   ├── FieldWrapper.tsx # Label, live Valid/Required status & counter
  │   │   │   ├── NameField.tsx    # Strict Name input (sanitizes & blocks numbers)
  │   │   │   ├── EmailField.tsx   # Strict RFC Email input (strips spaces, lowercases)
  │   │   │   ├── SubjectField.tsx # Strict Subject / Title input with counter
  │   │   │   ├── MessageField.tsx # Strict Message / Description textarea
  │   │   │   ├── UrlField.tsx     # Strict URL / asset path input + upload slot
  │   │   │   ├── NumberField.tsx  # Strict numeric input with min/max clamping
  │   │   │   ├── TextField.tsx    # Strict text/tag input
  │   │   │   └── index.ts         # Barrel export for all field partials
  │   │   ├── Navbar.tsx        # Glassmorphic header with chapter underline
  │   │   ├── Footer.tsx        # Bottom bar, copyright & social links
  │   │   ├── ThemeToggle.tsx   # Reusable Dark/Light mode icon with radial pulse wave
  │   │   ├── ScrollToTop.tsx   # Reusable floating SVG progress ring & inline scroll-to-top
  │   │   ├── Tooltip.tsx       # Viewport-aware boundary-clamped operational tooltip
  │   │   ├── ScrollArea.tsx    # Height-constrained accessible scrollable container
  │   │   ├── ModalShell.tsx    # Accessible modal container with backdrop support
  │   │   ├── ProjectCard.tsx   # Individual project card with hover states
  │   │   ├── BentoCard.tsx     # Reusable bento module container
  │   │   └── Button.tsx        # Accessible button & link components
  │   └── common/
  │       ├── Avatar.tsx        # Layered hero avatar with gradient base
  │       ├── MonogramBadge.tsx # High-contrast LV monogram badge
  │       └── ResumeViewerModal.tsx # In-app PDF viewer with fullscreen & skeleton loading
  ├── context/
  │   └── PortfolioContext.tsx  # Live portfolio state & analytics tracker
  ├── lib/
  │   ├── db.ts                 # Hybrid Local JSON / Supabase PostgreSQL adapter
  │   ├── auth.ts               # HMAC-SHA256 httpOnly admin session auth
  │   ├── security.ts           # Device fingerprinting, pairing challenges, audit trail
  │   ├── totp.ts               # RFC 6238 Authenticator 2FA with AES-256-GCM encryption
  │   └── validation.ts         # Real-time input sanitizers, validators & Zod schemas
  ├── data/                     # Initial seed defaults
  │   ├── portfolio.ts          # Core profile metadata, roles, bio, headers
  │   ├── projects.ts           # Project items, tech stacks, links, metrics
  │   ├── skills.ts             # Skills grouped by DB, Backend, Frontend, Analytics
  │   └── principles.ts         # Marquee ticker statements
  ├── types/                    # Strict TypeScript schemas
  │   ├── portfolio.ts
  │   └── security.ts
  └── app/
      ├── admin/
      │   ├── page.tsx          # Private /admin Portfolio Management Dashboard
      │   └── pair/page.tsx     # Mobile cross-device PIN verification client
      ├── api/
      │   ├── admin/            # Auth, Portfolio CRUD, Inbox, Devices, Upload routes
      │   ├── analytics/route.ts # Public analytics event ingest
      │   ├── portfolio/route.ts # Public portfolio state endpoint
      │   ├── contact/route.ts  # Zod-validated inbox & Resend email dispatch
      │   ├── github/route.ts   # Live GitHub repository activity proof
      │   └── resume/route.ts   # SSRF-guarded PDF streaming proxy for in-app viewer
      ├── layout.tsx            # Global fonts, metadata, PortfolioProvider
      ├── page.tsx              # Main orchestrator (imports section partials)
      └── globals.css           # Fluid rem/vw variables, theme tokens
  ```

### B. Strict Data Isolation Rule
* **Rule:** Content, copy, project lists, and skills MUST NEVER be hardcoded inside JSX markup.
* All data must be imported from `src/data/*.ts`.
* Adding a new project or updating a skill must require **zero changes** to layout, CSS, or animation code.

---

## 3. Strict Performance & Zero-Lag Standards

To maintain **60–120 FPS** with **zero frame drops** and a **95+ Google Lighthouse score**:

1. **GPU-Only Composite Transforms:**
   * Animations MUST ONLY mutate `transform` (`translate3d`, `scale`) and `opacity`.
   * NEVER animate `width`, `height`, `top`, `left`, `margin`, or `padding` during scroll or runtime.
2. **GSAP + Lenis Harmony:**
   * Lenis must drive the scroll thread and pass its RAF delta directly to GSAP:
     ```typescript
     lenis.on('scroll', ScrollTrigger.update);
     gsap.ticker.add((time) => lenis.raf(time * 1000));
     gsap.ticker.lagSmoothing(0);
     ```
   * All GSAP timelines must be wrapped in `gsap.context()` inside `useEffect` or `useGSAP()` to prevent memory leaks on component re-mounts.
3. **Mobile & Low-Power Degradation:**
   * Desktop-only effects (e.g. SVG liquid distortion, magnetic cursor pull) MUST be scoped with:
     `@media (hover: hover) and (pointer: fine)`
   * On touch devices, fallback to ultra-lightweight hardware-accelerated CSS transforms.
4. **Viewport Throttling:**
   * Off-screen components must pause animations via `IntersectionObserver` to ensure **0% idle CPU usage** when not visible.
5. **Asset Optimization:**
   * Images must use `.webp` / `.avif` with explicit dimensions and Next.js `<Image />` optimization.
   * Total initial page payload must stay under **1.2 MB**.

---

## 4. Design System & Theme Tokens

* **Backgrounds:**
  * Obsidian Canvas: `--background: #08080a;`
  * Surface 1: `--surface: #111114;`
  * Surface 2: `--surface-2: #17171b;`
* **Accents:**
  * Signature Red: `--accent: #ff3b1d;`
  * Accent Glow: `--accent-glow: rgba(255, 59, 29, 0.25);`
* **Typography:**
  * Display / Headings: `font-family: var(--font-display);` (**Anton**) — Tall, heavy, condensed.
  * Body / Sans: `font-family: var(--font-sans);` (**Onest** or **Geist**) — Clean, legible grotesque.
* **Fluid Layout:**
  * Fluid rem-based grid scaling from mobile (16px gutter) up to 1920px (2.5rem gutter).

---

## 5. Local Development & "Live Server" Workflow

* **Development Server:**
  * Start the hot-reloading dev server:
    ```bash
    npm run dev
    ```
  * Live URL: `http://localhost:3000`
  * Any edit to any component partial or data file triggers instant Hot Module Replacement (HMR) without refreshing the entire browser.
* **Production Build Validation:**
  * Always verify the production build before pushing to Vercel:
    ```bash
    npm run build
    npm run start
    ```

---

## 6. Strict Quality Gates

Before any git commit or deployment to Vercel:
- [ ] `npm run lint` passes with 0 errors.
- [ ] `npx tsc --noEmit` passes with 0 type errors.
- [ ] `npm run test` passes (all Vitest unit & integration test suites).
- [ ] `npm run test:e2e` passes (all Playwright end-to-end specs).
- [ ] All interactive buttons and forms have accessible `aria-labels` and focus rings.
- [ ] `/api/contact` validates input using Zod, enforces rate limiting, and rejects bot submissions via honeypots.
- [ ] `/api/resume` validates target URLs against allowlisted CDNs with loopback/private IP blocking and magic-byte validation.
- [ ] Lighthouse score meets or exceeds:
  * Performance: $\ge 92$
  * Accessibility: $\ge 95$
  * Best Practices: $\ge 95$
  * SEO: $\ge 100$

