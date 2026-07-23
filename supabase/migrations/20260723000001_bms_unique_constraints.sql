-- Add UNIQUE constraints to prevent duplicate salary payments and duplicate
-- proposal votes at the database layer (defence-in-depth behind app-layer guards).

-- Prevent paying the same staff member twice for the same month.
ALTER TABLE bms_salary_payments
  ADD CONSTRAINT IF NOT EXISTS bms_salary_payments_staff_month_key
  UNIQUE (staff_id, pay_month);

-- Prevent a union member from casting more than one vote per proposal.
ALTER TABLE bms_proposal_votes
  ADD CONSTRAINT IF NOT EXISTS bms_proposal_votes_member_proposal_key
  UNIQUE (proposal_id, union_member_id);
