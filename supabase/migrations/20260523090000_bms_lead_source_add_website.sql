-- BMS: add "website" to the LeadSource enum.
--
-- Leads created via the public /onboarding form get source='website' so
-- super_admin can filter / badge them distinctly from cold-visit, referral,
-- event, and inbound-WhatsApp leads.
ALTER TYPE public.bms_lead_source ADD VALUE IF NOT EXISTS 'website';
