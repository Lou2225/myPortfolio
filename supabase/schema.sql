-- ============================================================================
-- LOU DIAMOND VALDELLON — PORTFOLIO MANAGEMENT SYSTEM (SUPABASE POSTGRESQL)
-- Paste this into your Supabase SQL Editor when deploying or migrating.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portfolio_store (
  id TEXT PRIMARY KEY DEFAULT 'main',
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (only Service Role key from Next.js API can read/write;
-- portfolio_store contains private admin credentials, security devices/logs, and snapshots)
ALTER TABLE public.portfolio_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read of portfolio_store" ON public.portfolio_store;

-- Normalized Contact Inquiries Table (decoupled from portfolio_store JSONB)
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_starred BOOLEAN NOT NULL DEFAULT FALSE,
  email_dispatch_status TEXT,
  replied_at TIMESTAMPTZ,
  reply_count INTEGER NOT NULL DEFAULT 0,
  last_reply_subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column upgrades for pre-existing deployments
ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS email_dispatch_status TEXT,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reply_subject TEXT;

CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at
  ON public.contact_messages (created_at DESC);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Normalized Telemetry & Funnel Analytics Table (multi-instance scalable, no 2,000 JSON cap)
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  target TEXT NOT NULL,
  session_id TEXT,
  device TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column upgrades for pre-existing deployments
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS device TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON public.analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
  ON public.analytics_events (event_type, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
