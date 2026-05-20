-- ============================================================
-- Pulse BMS — Demo Building seed
--
-- Idempotent demo dataset for the sales-walkthrough experience.
-- Re-running this SQL is safe: every insert is guarded by
-- ON CONFLICT DO NOTHING / DO UPDATE and uses deterministic UUIDs
-- derived from a fixed namespace so foreign keys stay stable
-- across runs.
--
-- DO NOT run this against the real production tenant — it writes
-- only into the demo building id `99999999-9999-9999-9999-999999999999`
-- and never touches other rows.
-- ============================================================

-- ─── Globals ─────────────────────────────────────────────────
do $$
declare
  v_building uuid := '99999999-9999-9999-9999-999999999999';
begin
  -- 1. Building ----------------------------------------------------
  insert into public.bms_buildings (
    id, name, address, city, total_flats,
    fund_balance, entry_fee_owner, entry_fee_tenant,
    monthly_fee_default, utility_cutoff_after_months,
    voting_rule, is_active, expose_defaulter_names,
    listing_enabled, public_whatsapp
  ) values (
    v_building,
    'Pulse Demo Tower',
    'Plot 99, Demo Boulevard, Clifton',
    'Karachi',
    30,
    485000,
    10000,
    5000,
    4000,
    3,
    'majority',
    true,
    true,
    true,
    '03332994029'
  )
  on conflict (id) do update set
    name = excluded.name,
    address = excluded.address,
    city = excluded.city,
    total_flats = excluded.total_flats,
    fund_balance = excluded.fund_balance,
    monthly_fee_default = excluded.monthly_fee_default,
    is_active = true,
    listing_enabled = true,
    expose_defaulter_names = true;
end $$;

-- ─── 2. Flats (30 — A-101 … A-310) ───────────────────────────
with floors as (
  select g.floor as floor
  from generate_series(1, 10) as g(floor)
),
nums as (
  select n from generate_series(1, 3) as g(n)
),
all_flats as (
  select
    floor,
    n,
    'A-' || floor::text || lpad(n::text, 2, '0') as flat_number,
    -- deterministic per-flat UUID:
    -- v5 from a fixed namespace + flat_number string
    md5('99999999-9999-9999-9999-999999999999:flat:A-' || floor::text || lpad(n::text, 2, '0'))::uuid as id
  from floors cross join nums
)
insert into public.bms_flats (
  id, building_id, flat_number, floor, block,
  size_sqft, monthly_fee, ownership_type, outstanding_dues, notes
)
select
  id,
  '99999999-9999-9999-9999-999999999999',
  flat_number,
  floor,
  'A',
  case n when 1 then 1200 when 2 then 1450 else 1100 end,
  case n when 1 then 4500 when 2 then 5000 else 4000 end,
  case
    when floor in (3,7) and n = 3 then 'vacant'
    when n = 2 and floor % 2 = 0 then 'tenant'
    else 'owner'
  end,
  0,
  null
from all_flats
on conflict (id) do nothing;

-- ─── 3. Residents (≈50) ──────────────────────────────────────
-- Two residents per occupied flat (owner + family/tenant). Names are a fixed
-- realistic Pakistani lookup matrix joined on flat row_number() so each run
-- yields the same residents.
with names(rn, full_name, phone, cnic, relationship) as (
  values
    (1, 'Ali Khan',         '03001112201', '42101-1111111-1', 'owner'),
    (2, 'Sara Ahmed',       '03001112202', '42101-1111111-2', 'family'),
    (3, 'Bilal Hussain',    '03001112203', '42101-2222222-1', 'owner'),
    (4, 'Ayesha Tariq',     '03001112204', '42101-2222222-2', 'family'),
    (5, 'Imran Sheikh',     '03001112205', '42101-3333333-1', 'tenant'),
    (6, 'Hina Sheikh',      '03001112206', '42101-3333333-2', 'family'),
    (7, 'Faisal Qureshi',   '03001112207', '42101-4444444-1', 'owner'),
    (8, 'Mariam Qureshi',   '03001112208', '42101-4444444-2', 'family'),
    (9, 'Usman Raza',       '03001112209', '42101-5555555-1', 'owner'),
    (10,'Sana Raza',        '03001112210', '42101-5555555-2', 'family'),
    (11,'Hamza Iqbal',      '03001112211', '42101-6666666-1', 'owner'),
    (12,'Zara Iqbal',       '03001112212', '42101-6666666-2', 'family'),
    (13,'Rehan Aslam',      '03001112213', '42101-7777777-1', 'tenant'),
    (14,'Maliha Aslam',     '03001112214', '42101-7777777-2', 'family'),
    (15,'Kamran Butt',      '03001112215', '42101-8888888-1', 'owner'),
    (16,'Nida Butt',        '03001112216', '42101-8888888-2', 'family'),
    (17,'Saad Mehmood',     '03001112217', '42101-9999999-1', 'owner'),
    (18,'Iqra Mehmood',     '03001112218', '42101-9999999-2', 'family'),
    (19,'Owais Siddiqui',   '03001112219', '42101-1212121-1', 'owner'),
    (20,'Anum Siddiqui',    '03001112220', '42101-1212121-2', 'family'),
    (21,'Tariq Malik',      '03001112221', '42101-1313131-1', 'tenant'),
    (22,'Sadia Malik',      '03001112222', '42101-1313131-2', 'family'),
    (23,'Asad Yousuf',      '03001112223', '42101-1414141-1', 'owner'),
    (24,'Mehwish Yousuf',   '03001112224', '42101-1414141-2', 'family'),
    (25,'Rizwan Sattar',    '03001112225', '42101-1515151-1', 'owner'),
    (26,'Afshan Sattar',    '03001112226', '42101-1515151-2', 'family'),
    (27,'Junaid Akbar',     '03001112227', '42101-1616161-1', 'owner'),
    (28,'Rabia Akbar',      '03001112228', '42101-1616161-2', 'family'),
    (29,'Adnan Farooq',     '03001112229', '42101-1717171-1', 'tenant'),
    (30,'Nazia Farooq',     '03001112230', '42101-1717171-2', 'family'),
    (31,'Waqar Bhatti',     '03001112231', '42101-1818181-1', 'owner'),
    (32,'Sundus Bhatti',    '03001112232', '42101-1818181-2', 'family'),
    (33,'Hasan Sajid',      '03001112233', '42101-1919191-1', 'owner'),
    (34,'Lubna Sajid',      '03001112234', '42101-1919191-2', 'family'),
    (35,'Naveed Ashraf',    '03001112235', '42101-2020202-1', 'owner'),
    (36,'Komal Ashraf',     '03001112236', '42101-2020202-2', 'family'),
    (37,'Kashif Mirza',     '03001112237', '42101-2121212-1', 'tenant'),
    (38,'Sumaira Mirza',    '03001112238', '42101-2121212-2', 'family'),
    (39,'Babar Sufyan',     '03001112239', '42101-2323232-1', 'owner'),
    (40,'Fariha Sufyan',    '03001112240', '42101-2323232-2', 'family'),
    (41,'Naeem Daud',       '03001112241', '42101-2424242-1', 'owner'),
    (42,'Bushra Daud',      '03001112242', '42101-2424242-2', 'family'),
    (43,'Talha Anwar',      '03001112243', '42101-2525252-1', 'owner'),
    (44,'Saba Anwar',       '03001112244', '42101-2525252-2', 'family'),
    (45,'Salman Pervez',    '03001112245', '42101-2626262-1', 'tenant'),
    (46,'Nimra Pervez',     '03001112246', '42101-2626262-2', 'family'),
    (47,'Asif Latif',       '03001112247', '42101-2727272-1', 'owner'),
    (48,'Erum Latif',       '03001112248', '42101-2727272-2', 'family'),
    (49,'Zubair Memon',     '03001112249', '42101-2828282-1', 'owner'),
    (50,'Madiha Memon',     '03001112250', '42101-2828282-2', 'family')
),
flats_ordered as (
  select
    id as flat_id,
    flat_number,
    ownership_type,
    row_number() over (order by floor, flat_number) as rn
  from public.bms_flats
  where building_id = '99999999-9999-9999-9999-999999999999'
    and ownership_type <> 'vacant'
),
residents_to_seed as (
  select
    md5('99999999-9999-9999-9999-999999999999:res:' || n.rn)::uuid as id,
    f.flat_id,
    n.full_name,
    n.phone,
    n.cnic,
    -- Primary resident = the first row per flat; second row is family unless
    -- flat ownership_type = 'tenant', then the 2nd row is the tenant.
    case
      when ((n.rn - 1) % 2) = 0 then
        case when f.ownership_type = 'tenant' then 'tenant'::text else 'owner'::text end
      else 'family'::text
    end as relationship,
    ((n.rn - 1) % 2 = 0) as is_primary
  from names n
  join flats_ordered f
    on f.rn = ceil(n.rn::numeric / 2)::int
)
insert into public.bms_residents (
  id, building_id, flat_id, profile_id,
  full_name, phone, email, cnic, relationship, is_primary,
  move_in_date, entry_fee_paid, is_active
)
select
  id,
  '99999999-9999-9999-9999-999999999999',
  flat_id,
  null,
  full_name,
  phone,
  null,
  cnic,
  relationship,
  is_primary,
  '2024-01-15'::date + (random() * 200)::int,
  case when relationship = 'owner' then 10000 when relationship = 'tenant' then 5000 else 0 end,
  true
from residents_to_seed
on conflict (id) do nothing;

-- ─── 4. Staff (6) ─────────────────────────────────────────────
with staff_rows(rn, full_name, role, phone, cnic, salary) as (
  values
    (1, 'Akram Hussain', 'chowkidar',     '03011000001', '42101-9000001-1', 25000),
    (2, 'Liaqat Ali',    'chowkidar',     '03011000002', '42101-9000002-1', 25000),
    (3, 'Nadeem Khan',   'chowkidar',     '03011000003', '42101-9000003-1', 25000),
    (4, 'Aslam Masih',   'sweeper',       '03011000004', '42101-9000004-1', 18000),
    (5, 'Rashid Mehmood','other',         '03011000005', '42101-9000005-1', 45000),  -- manager (other)
    (6, 'Salman Bhatti', 'electrician',   '03011000006', '42101-9000006-1', 30000)
)
insert into public.bms_staff (
  id, building_id, full_name, role, phone, cnic, monthly_salary,
  join_date, is_active, notes
)
select
  md5('99999999-9999-9999-9999-999999999999:staff:' || rn)::uuid,
  '99999999-9999-9999-9999-999999999999',
  full_name,
  role,
  phone,
  cnic,
  salary,
  '2024-01-01'::date,
  true,
  case when full_name = 'Rashid Mehmood' then 'Building Manager' else null end
from staff_rows
on conflict (id) do nothing;

-- ─── 5. Invoices (24 months × occupied flats) ────────────────
-- We generate per-flat per-month invoices for the previous 24 calendar
-- months ending at the most recent completed month. Mix:
--   pre-current-month: 80% paid, 15% pending, 5% overdue (overdue only > 60d)
--   current-month: status = pending
with months as (
  select (date_trunc('month', current_date) - (i || ' months')::interval)::date as billing_month
  from generate_series(0, 23) as gs(i)
),
occupied as (
  select id as flat_id, flat_number, monthly_fee
  from public.bms_flats
  where building_id = '99999999-9999-9999-9999-999999999999'
    and ownership_type <> 'vacant'
),
inv_rows as (
  select
    md5(
      '99999999-9999-9999-9999-999999999999:inv:' ||
      o.flat_id::text || ':' || to_char(m.billing_month, 'YYYY-MM')
    )::uuid as id,
    o.flat_id,
    o.flat_number,
    o.monthly_fee,
    m.billing_month,
    -- 80/15/5 split based on hash bucket; current-month always pending.
    case
      when m.billing_month >= date_trunc('month', current_date) then 'pending'
      when (abs(hashtext(o.flat_id::text || to_char(m.billing_month, 'YYYY-MM'))) % 100) < 80 then 'paid'
      when (abs(hashtext(o.flat_id::text || to_char(m.billing_month, 'YYYY-MM'))) % 100) < 95 then 'pending'
      else 'overdue'
    end as status
  from months m cross join occupied o
)
insert into public.bms_invoices (
  id, building_id, flat_id, invoice_number, billing_month, amount,
  status, due_date, notes
)
select
  id,
  '99999999-9999-9999-9999-999999999999',
  flat_id,
  'INV-DEMO-' || flat_number || '-' || to_char(billing_month, 'YYYYMM'),
  billing_month,
  monthly_fee,
  status,
  billing_month + interval '10 days',
  null
from inv_rows
on conflict (id) do nothing;

-- ─── 6. Payments — paid invoices get one matching payment ────
with paid_invs as (
  select id, building_id, flat_id, amount, billing_month
  from public.bms_invoices
  where building_id = '99999999-9999-9999-9999-999999999999'
    and status = 'paid'
)
insert into public.bms_payments (
  id, building_id, invoice_id, flat_id, resident_id,
  amount, payment_date, payment_mode, category, receipt_no, notes
)
select
  md5('99999999-9999-9999-9999-999999999999:pay:' || id::text)::uuid,
  building_id,
  id,
  flat_id,
  null,
  amount,
  billing_month + interval '7 days',
  'bank',
  'maintenance',
  'RCPT-DEMO-' || substr(md5(id::text), 1, 8),
  null
from paid_invs
on conflict (id) do nothing;

-- ─── 7. Update flat outstanding_dues from non-paid invoices ──
update public.bms_flats f
set outstanding_dues = coalesce(d.dues, 0)
from (
  select flat_id, sum(amount) as dues
  from public.bms_invoices
  where building_id = '99999999-9999-9999-9999-999999999999'
    and status in ('pending', 'overdue', 'partial')
  group by flat_id
) d
where f.id = d.flat_id;

-- ─── 8. Expenses (30 across last 12 months) ──────────────────
with cat(rn, cat_id, subcategory, description, amount, vendor) as (
  values
    (1,  'utilities', 'electricity', 'K-Electric monthly bill',         215000, 'K-Electric'),
    (2,  'utilities', 'water',       'KWSB water + sewage',              48000, 'KWSB'),
    (3,  'utilities', 'gas',         'SSGC commercial gas',              22000, 'SSGC'),
    (4,  'repairs',   'lift',        'Lift annual maintenance',          35000, 'OTIS Pakistan'),
    (5,  'repairs',   'plumbing',    'Water tank overflow repair',        9500, 'Local plumber'),
    (6,  'repairs',   'painting',    'Lobby paint touch-up',             18000, 'Asghar Painters'),
    (7,  'supplies',  'cleaning',    'Cleaning supplies — monthly',       6500, 'Imtiaz Wholesale'),
    (8,  'supplies',  'security',    'Guard uniforms + walkie talkies',  14000, 'Security Mart'),
    (9,  'other',     'misc',        'Eid bonus for staff',              42000, null),
    (10, 'utilities', 'internet',    'Building CCTV internet',            5500, 'StormFiber')
)
insert into public.bms_expenses (
  id, building_id, category, subcategory, description, amount,
  expense_date, is_recurring, recurrence, vendor
)
select
  md5('99999999-9999-9999-9999-999999999999:exp:' || c.rn || ':' || m)::uuid,
  '99999999-9999-9999-9999-999999999999',
  c.cat_id,
  c.subcategory,
  c.description,
  c.amount,
  (date_trunc('month', current_date) - ((m - 1) || ' months')::interval + interval '5 days')::date,
  c.subcategory in ('electricity','water','gas','cleaning','internet'),
  case when c.subcategory in ('electricity','water','gas','cleaning','internet') then 'monthly' else null end,
  c.vendor
from cat c
cross join generate_series(1, 3) as g(m)
on conflict (id) do nothing;

-- ─── 9. Attendance (last 30 days × 6 staff) ──────────────────
with days as (
  select (current_date - i)::date as d
  from generate_series(0, 29) as gs(i)
),
staff_ids as (
  select id from public.bms_staff
  where building_id = '99999999-9999-9999-9999-999999999999'
)
insert into public.bms_attendance (
  id, building_id, staff_id, date, status, notes
)
select
  md5('99999999-9999-9999-9999-999999999999:att:' || s.id::text || ':' || d.d::text)::uuid,
  '99999999-9999-9999-9999-999999999999',
  s.id,
  d.d,
  case
    when extract(dow from d.d) = 0 and (abs(hashtext(s.id::text || d.d::text)) % 100) < 30 then 'leave'
    when (abs(hashtext(s.id::text || d.d::text)) % 100) < 5 then 'absent'
    else 'present'
  end,
  null
from staff_ids s cross join days d
on conflict (id) do nothing;

-- ─── 10. Salary payments (last 12 months × 6 staff) ──────────
with months as (
  select (date_trunc('month', current_date) - ((i + 1) || ' months')::interval)::date as pay_month
  from generate_series(0, 11) as gs(i)
)
insert into public.bms_salary_payments (
  id, building_id, staff_id, pay_month, amount,
  payment_date, payment_mode, slip_no, notes
)
select
  md5('99999999-9999-9999-9999-999999999999:sal:' || s.id::text || ':' || m.pay_month::text)::uuid,
  '99999999-9999-9999-9999-999999999999',
  s.id,
  m.pay_month,
  s.monthly_salary,
  (m.pay_month + interval '5 days')::date,
  'bank',
  'SLIP-' || substr(md5(s.id::text || m.pay_month::text), 1, 8),
  null
from public.bms_staff s cross join months m
where s.building_id = '99999999-9999-9999-9999-999999999999'
on conflict (id) do nothing;

-- ─── 11. Union members (5) ───────────────────────────────────
-- NOTE: bms_union_members.profile_id is NOT NULL. Union member rows + their
-- proposal votes are created by scripts/seed-demo-users.ts AFTER the union
-- demo auth user exists. All 5 members point at that same union profile so
-- the demo only needs one credential.

-- ─── 12. Elections (2 past cycles) ───────────────────────────
insert into public.bms_elections (id, building_id, cycle_label, scheduled_date, status, results)
values
  (
    md5('99999999-9999-9999-9999-999999999999:el:2024')::uuid,
    '99999999-9999-9999-9999-999999999999',
    '2024 Annual Election',
    (current_date - interval '14 months')::date,
    'closed',
    jsonb_build_object('turnout', 0.78, 'president', 'Faisal Qureshi')
  ),
  (
    md5('99999999-9999-9999-9999-999999999999:el:2025')::uuid,
    '99999999-9999-9999-9999-999999999999',
    '2025 Annual Election',
    (current_date - interval '2 months')::date,
    'closed',
    jsonb_build_object('turnout', 0.82, 'president', 'Faisal Qureshi')
  )
on conflict (id) do nothing;

-- ─── 13. Meetings (2) ────────────────────────────────────────
insert into public.bms_meetings (
  id, building_id, title, scheduled_at, location, agenda, status, created_by
)
values
  (
    md5('99999999-9999-9999-9999-999999999999:mtg:1')::uuid,
    '99999999-9999-9999-9999-999999999999',
    'Quarterly Union Review',
    (current_date - interval '15 days')::timestamptz + time '19:00',
    'Tower Lounge',
    '1. Budget review  2. Lift contract renewal  3. Open floor',
    'completed',
    null
  ),
  (
    md5('99999999-9999-9999-9999-999999999999:mtg:2')::uuid,
    '99999999-9999-9999-9999-999999999999',
    'Annual General Meeting',
    (current_date + interval '20 days')::timestamptz + time '19:30',
    'Tower Lounge',
    '1. Annual report  2. Maintenance fee review  3. Election prep',
    'scheduled',
    null
  )
on conflict (id) do nothing;

-- ─── 14. Proposals (3) ───────────────────────────────────────
insert into public.bms_proposals (
  id, building_id, title, description, proposal_type, amount,
  voting_rule, status, raised_by
)
values
  (
    md5('99999999-9999-9999-9999-999999999999:prop:1')::uuid,
    '99999999-9999-9999-9999-999999999999',
    'Upgrade lobby CCTV to 4K',
    'Current cameras are 720p. Quote attached from SafeCity for 8 cameras + NVR.',
    'expense',
    185000,
    'majority',
    'pending',
    null
  ),
  (
    md5('99999999-9999-9999-9999-999999999999:prop:2')::uuid,
    '99999999-9999-9999-9999-999999999999',
    'Replace lift cable',
    'Recommended by OTIS during last service. Safety-critical.',
    'repair',
    95000,
    'majority',
    'approved',
    null
  ),
  (
    md5('99999999-9999-9999-9999-999999999999:prop:3')::uuid,
    '99999999-9999-9999-9999-999999999999',
    'Hire weekend gardener',
    'Lawn + planters in front courtyard. Approx Rs 8,000/month.',
    'hiring',
    8000,
    'majority',
    'pending',
    null
  )
on conflict (id) do nothing;

-- ─── 15. Proposal votes ──────────────────────────────────────
-- Votes depend on bms_union_members rows, which depend on demo auth users.
-- Both are created together by scripts/seed-demo-users.ts after auth users
-- exist. See that script for the exact vote distribution.

-- ─── 16. Facility tasks (8 — mix of maintenance + complaints) ─
with t(rn, title, category, recurrence, status, due_offset) as (
  values
    (1, 'Lift quarterly service',          'lift',        'quarterly', 'pending',   30),
    (2, 'Water tank cleaning',             'plumbing',    'monthly',   'in_progress',5),
    (3, 'Generator load test',             'electrical',  'monthly',   'pending',   10),
    (4, 'Fire extinguisher refill check',  'safety',      'yearly',    'pending',   60),
    (5, 'Lobby paint touch-up',            'maintenance', null,        'done',      -7),
    (6, 'Roof drain unclog',               'plumbing',    null,        'done',      -14),
    (7, 'CCTV camera angle adjustment',    'security',    null,        'pending',    3),
    (8, 'Pest control — common areas',     'pest',        'quarterly', 'pending',   20)
)
insert into public.bms_facility_tasks (
  id, building_id, title, description, task_type, category,
  recurrence, next_due_date, last_done_date, status
)
select
  md5('99999999-9999-9999-9999-999999999999:ft:' || rn)::uuid,
  '99999999-9999-9999-9999-999999999999',
  title,
  null,
  case when recurrence is not null then 'scheduled' else 'one_off' end,
  category,
  recurrence,
  (current_date + (due_offset || ' days')::interval)::date,
  case when status = 'done' then (current_date + (due_offset || ' days')::interval)::date else null end,
  status
from t
on conflict (id) do nothing;

-- ─── 17. Complaints (4) ──────────────────────────────────────
with c(rn, title, category, priority, status, days_ago) as (
  values
    (1, 'Water not coming on 7th floor', 'water',       'high',   'in_progress', 2),
    (2, 'Lift making loud noise',         'lift',        'urgent', 'assigned',    1),
    (3, 'Stray cats in parking',          'cleanliness', 'low',    'open',        4),
    (4, 'Security guard off duty 11pm',   'security',    'high',   'resolved',    7)
)
insert into public.bms_complaints (
  id, building_id, title, description, category, priority, status, created_at
)
select
  md5('99999999-9999-9999-9999-999999999999:cmp:' || rn)::uuid,
  '99999999-9999-9999-9999-999999999999',
  title,
  null,
  category,
  priority,
  status,
  (now() - (days_ago || ' days')::interval)
from c
on conflict (id) do nothing;

-- ─── 18. Notices (10) ────────────────────────────────────────
with n(rn, title, body, notice_type, pinned, days_ago) as (
  values
    (1, 'Water tank cleaning Sunday 9am',
        'The overhead water tank will be cleaned this Sunday. Water supply may be interrupted from 9am-1pm.',
        'general', true, 1),
    (2, 'Eid maintenance schedule',
        'Sweepers will be off duty on Eid day. Cleanliness drive on the day after.',
        'general', false, 3),
    (3, 'AGM scheduled — 25th of this month',
        'Annual General Meeting will be held in the Tower Lounge at 7:30pm.',
        'meeting', true, 2),
    (4, 'New entry fee policy approved',
        'Owner entry fee: Rs 10,000. Tenant entry fee: Rs 5,000. Effective from next move-in.',
        'general', false, 14),
    (5, 'Lift A out of service for 2 hours',
        'Annual maintenance on Wednesday 10am. Please use Lift B.',
        'general', false, 5),
    (6, 'Power outage — KE notice',
        'Scheduled outage tomorrow 2pm-5pm in our grid section.',
        'emergency', true, 0),
    (7, 'Pest control scheduled',
        'Common-area pest control on Saturday morning.',
        'general', false, 7),
    (8, 'Defaulter list updated',
        'Please clear dues before the 10th of next month to avoid the utility cut-off.',
        'dues_reminder', false, 4),
    (9, 'Election cycle 2026 — early notice',
        'Nominations open in 30 days. Watch this space for details.',
        'election', false, 10),
    (10,'Welcome to Pulse — building portal is live',
        'You can now pay maintenance online, raise complaints, and read announcements here.',
        'general', false, 30)
)
insert into public.bms_notices (
  id, building_id, title, body, notice_type, pinned, created_at
)
select
  md5('99999999-9999-9999-9999-999999999999:not:' || rn)::uuid,
  '99999999-9999-9999-9999-999999999999',
  title,
  body,
  notice_type,
  pinned,
  (now() - (days_ago || ' days')::interval)
from n
on conflict (id) do nothing;

-- ─── 19. Flat listings (4 — 2 rent, 2 sell) ──────────────────
with picks as (
  select id as flat_id, flat_number,
         row_number() over (order by flat_number) as rn
  from public.bms_flats
  where building_id = '99999999-9999-9999-9999-999999999999'
    and ownership_type <> 'vacant'
  order by flat_number
  limit 4
),
l(rn, listing_type, price, bedrooms, bathrooms, parking, furnished, description) as (
  values
    (1, 'rent', 85000,  2, 2, true, false, 'Bright corner unit, lift access, parking included.'),
    (2, 'rent', 110000, 3, 3, true, true,  'Fully furnished 3-bed, family preferred.'),
    (3, 'sell', 28500000, 2, 2, true, false, 'Owner emigrating. Bank loan welcome.'),
    (4, 'sell', 34000000, 3, 3, true, true,  'Top-floor view. Recently renovated kitchen.')
)
insert into public.bms_flat_listings (
  id, building_id, flat_id, listing_type, price,
  bedrooms, bathrooms, parking, furnished, description, is_active
)
select
  md5('99999999-9999-9999-9999-999999999999:lst:' || l.rn)::uuid,
  '99999999-9999-9999-9999-999999999999',
  p.flat_id,
  l.listing_type,
  l.price,
  l.bedrooms,
  l.bathrooms,
  l.parking,
  l.furnished,
  l.description,
  true
from l
join picks p on p.rn = l.rn
on conflict (id) do nothing;

-- ─── 20. Services (6) ────────────────────────────────────────
-- NOTE: bms_services requires profile_id NOT NULL. These rows will be
-- populated by the seed-demo-users script after the resident demo user
-- is created (it owns all 6 listings to keep the demo simple). Skipping
-- here so the seed is safe to run before scripts/seed-demo-users.ts.

-- ─── 21. Vehicles (12) ───────────────────────────────────────
with picks as (
  select id as flat_id, flat_number,
         row_number() over (order by flat_number) as rn
  from public.bms_flats
  where building_id = '99999999-9999-9999-9999-999999999999'
    and ownership_type <> 'vacant'
  order by flat_number
  limit 12
),
v(rn, plate_number, vehicle_type, make, model, color, is_primary, notes) as (
  values
    (1,  'ALN-540',  'car',   'Toyota',  'Corolla GLi',      'white',  true,  'Daily driver'),
    (2,  'LEA-1234', 'car',   'Honda',   'Civic 1.8 i-VTEC', 'black',  true,  null),
    (3,  'AKM-219',  'car',   'Suzuki',  'Cultus VXL',       'silver', true,  null),
    (4,  'AVD-7733', 'bike',  'Yamaha',  'YBR 125G',         'black',  true,  null),
    (5,  'BLT-9001', 'car',   'Suzuki',  'Mehran VX',        'white',  true,  null),
    (6,  'ICT-0007', 'ev',    'Tesla',   'Model 3',          'white',  true,  'EV — charges in basement'),
    (7,  'RYP-1408', 'car',   'Toyota',  'Vitz',             'red',    true,  null),
    (8,  'KMC-0440', 'other', 'Suzuki',  'Bolan',            'blue',   true,  'Family van'),
    (9,  'KMH-0817', 'bike',  'Honda',   'CG 125',           'red',    true,  'Office runs'),
    (10, 'BFR-3322', 'bike',  'Suzuki',  'GD 110S',          'blue',   true,  null),
    (11, 'KHI-2200', 'car',   'KIA',     'Sportage',         'grey',   true,  null),
    (12, 'LHR-7711', 'car',   'Hyundai', 'Tucson',           'white',  true,  null)
)
insert into public.bms_vehicles (
  id, building_id, flat_id, resident_id, plate_number, vehicle_type,
  make, model, color, is_primary, notes
)
select
  md5('99999999-9999-9999-9999-999999999999:veh:' || v.rn)::uuid,
  '99999999-9999-9999-9999-999999999999',
  p.flat_id,
  null,
  v.plate_number,
  v.vehicle_type,
  v.make,
  v.model,
  v.color,
  v.is_primary,
  v.notes
from v
join picks p on p.rn = v.rn
on conflict (id) do nothing;

-- ─── 22. Summary ─────────────────────────────────────────────
select
  'demo building seed complete' as status,
  '99999999-9999-9999-9999-999999999999'::uuid as building_id,
  (select count(*) from public.bms_flats     where building_id = '99999999-9999-9999-9999-999999999999') as flats,
  (select count(*) from public.bms_residents where building_id = '99999999-9999-9999-9999-999999999999') as residents,
  (select count(*) from public.bms_invoices  where building_id = '99999999-9999-9999-9999-999999999999') as invoices,
  (select count(*) from public.bms_payments  where building_id = '99999999-9999-9999-9999-999999999999') as payments,
  (select count(*) from public.bms_expenses  where building_id = '99999999-9999-9999-9999-999999999999') as expenses,
  (select count(*) from public.bms_staff     where building_id = '99999999-9999-9999-9999-999999999999') as staff,
  (select count(*) from public.bms_notices   where building_id = '99999999-9999-9999-9999-999999999999') as notices,
  (select count(*) from public.bms_vehicles  where building_id = '99999999-9999-9999-9999-999999999999') as vehicles;
