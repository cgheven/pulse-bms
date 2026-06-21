-- =============================================================================
-- Migration: Self-Registration Support
-- Adds bms_self_registrations and bms_password_resets tables used by the
-- public /register and forgot-password flows.
-- =============================================================================

-- ─── 1. Self-registration pending records ────────────────────────────────────
-- One active row per email (unique partial index on unconverted records).
-- Records are cleaned up 24 h after creation via a cron or on-demand sweep.

CREATE TABLE IF NOT EXISTS public.bms_self_registrations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT        NOT NULL,
  full_name        TEXT        NOT NULL,
  building_name    TEXT        NOT NULL,
  city             TEXT        NOT NULL DEFAULT 'Karachi',
  flat_limit       INTEGER     NOT NULL CHECK (flat_limit >= 1 AND flat_limit <= 1500),
  otp_hash         TEXT        NOT NULL,
  otp_salt         TEXT        NOT NULL,
  otp_expires_at   TIMESTAMPTZ NOT NULL,
  attempts         INTEGER     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  send_count       INTEGER     NOT NULL DEFAULT 0 CHECK (send_count >= 0),
  last_sent_at     TIMESTAMPTZ,
  ip_address       TEXT        NOT NULL DEFAULT '0.0.0.0',
  verified_at      TIMESTAMPTZ,
  converted_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active (unconverted) registration per email
CREATE UNIQUE INDEX IF NOT EXISTS bms_self_registrations_email_active_idx
  ON public.bms_self_registrations (lower(email))
  WHERE converted_at IS NULL;

-- IP-based rate-limit lookups
CREATE INDEX IF NOT EXISTS bms_self_registrations_ip_idx
  ON public.bms_self_registrations (ip_address, created_at DESC);

-- Cleanup sweep: find stale unverified records
CREATE INDEX IF NOT EXISTS bms_self_registrations_cleanup_idx
  ON public.bms_self_registrations (created_at)
  WHERE converted_at IS NULL;

-- RLS: deny all direct access — accessible only via service_role in server actions
ALTER TABLE public.bms_self_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self_reg_deny_all"
  ON public.bms_self_registrations
  AS RESTRICTIVE FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);

-- ─── 2. Password reset tokens ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bms_password_resets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        NOT NULL,
  token_hash   TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  ip_address   TEXT        NOT NULL DEFAULT '0.0.0.0',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Token lookup (unique among unused tokens)
CREATE UNIQUE INDEX IF NOT EXISTS bms_password_resets_token_hash_idx
  ON public.bms_password_resets (token_hash)
  WHERE used_at IS NULL;

-- Email rate-limit lookups
CREATE INDEX IF NOT EXISTS bms_password_resets_email_created_idx
  ON public.bms_password_resets (lower(email), created_at DESC);

-- IP rate-limit lookups
CREATE INDEX IF NOT EXISTS bms_password_resets_ip_created_idx
  ON public.bms_password_resets (ip_address, created_at DESC);

-- RLS: deny all direct access
ALTER TABLE public.bms_password_resets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pw_reset_deny_all"
  ON public.bms_password_resets
  AS RESTRICTIVE FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);

-- ─── 3. Atomic OTP attempt increment ─────────────────────────────────────────
-- Server-side increment prevents race conditions where concurrent requests
-- read the same attempt count and all write the same (under-counted) value.
-- Returns the NEW attempt count after increment, or NULL if row not found
-- or already claimed (converted_at / verified_at set).

CREATE OR REPLACE FUNCTION public.bms_increment_otp_attempt(p_reg_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_attempts INTEGER;
BEGIN
  UPDATE bms_self_registrations
  SET attempts = attempts + 1
  WHERE id = p_reg_id
    AND converted_at IS NULL
    AND verified_at IS NULL
  RETURNING attempts INTO v_new_attempts;

  RETURN v_new_attempts; -- NULL if no row matched
END;
$$;
