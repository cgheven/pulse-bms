-- =============================================================
-- Pulse BMS — Demo vehicles seed
-- Idempotent: relies on bms_vehicles_plate_unique to skip dups.
-- Picks the first 8 active residents (across any building) and
-- attaches 1-2 realistic Pakistani vehicles each.
-- Safe to run multiple times.
-- =============================================================

with picks as (
  -- One resident per flat — avoids two-primaries-per-flat collisions when
  -- owner + tenant both live on the same flat.
  select
    resident_id,
    flat_id,
    building_id,
    row_number() over (order by created_at) as rn
  from (
    select distinct on (flat_id)
      id as resident_id,
      flat_id,
      building_id,
      created_at
    from public.bms_residents
    where is_active = true
    order by flat_id, is_primary desc nulls last, created_at
  ) one_per_flat
  order by created_at
  limit 8
),
seed (rn, plate_number, vehicle_type, make, model, color, is_primary, notes) as (
  values
    (1::int, 'ALN-540',   'car',   'Toyota',  'Corolla GLi',  'white',  true,  'Daily driver'),
    (1,      'KMH-0817',  'bike',  'Honda',   'CG 125',       'red',    false, 'Backup for office runs'),
    (2,      'LEA-1234',  'car',   'Honda',   'Civic 1.8 i-VTEC', 'black', true, null),
    (3,      'AKM-219',   'car',   'Suzuki',  'Cultus VXL',   'silver', true,  null),
    (4,      'AVD-7733',  'bike',  'Yamaha',  'YBR 125G',     'black',  true,  null),
    (5,      'BLT-9001',  'car',   'Suzuki',  'Mehran VX',    'white',  true,  'Owner''s car'),
    (5,      'BFR-3322',  'bike',  'Suzuki',  'GD 110S',      'blue',   false, null),
    (6,      'ICT-0007',  'ev',    'Tesla',   'Model 3',      'white',  true,  'EV — charges in basement'),
    (7,      'RYP-1408',  'car',   'Toyota',  'Vitz',         'red',    true,  null),
    (8,      'KMC-0440',  'other', 'Suzuki',  'Bolan',        'blue',   true,  'Family van')
)
insert into public.bms_vehicles
  (building_id, flat_id, resident_id, plate_number, vehicle_type, make, model, color, is_primary, notes)
select
  p.building_id,
  p.flat_id,
  p.resident_id,
  s.plate_number,
  s.vehicle_type,
  s.make,
  s.model,
  s.color,
  s.is_primary,
  s.notes
from seed s
join picks p on p.rn = s.rn
on conflict (building_id, lower(plate_number)) do nothing;

-- Summary
select
  v.plate_number,
  v.vehicle_type,
  v.make || ' ' || v.model as model,
  v.color,
  v.is_primary,
  f.flat_number,
  r.full_name as owner
from public.bms_vehicles v
join public.bms_flats f on f.id = v.flat_id
left join public.bms_residents r on r.id = v.resident_id
order by f.flat_number, v.is_primary desc;
