-- Storage bucket for resident documents (private, CDN-backed)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bms-documents',
  'bms-documents',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Document metadata table
create table public.bms_resident_documents (
  id           uuid        primary key default gen_random_uuid(),
  building_id  uuid        not null references public.bms_buildings(id)  on delete cascade,
  resident_id  uuid        not null references public.bms_residents(id)  on delete cascade,
  doc_type     text        not null check (doc_type in ('police_verification', 'rent_agreement', 'other')),
  label        text,                          -- custom label when doc_type = 'other'
  file_name    text        not null,          -- original filename shown in UI
  storage_path text        not null unique,   -- path inside bms-documents bucket
  file_size    integer,                       -- bytes
  mime_type    text,
  uploaded_by  uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index on public.bms_resident_documents (building_id);
create index on public.bms_resident_documents (resident_id);

alter table public.bms_resident_documents enable row level security;

-- Admin / super_admin: full access scoped to their building
create policy bms_resident_docs_admin on public.bms_resident_documents
  for all to authenticated
  using  (building_id = bms_current_building() and bms_current_role() in ('admin', 'super_admin'))
  with check (building_id = bms_current_building() and bms_current_role() in ('admin', 'super_admin'));

-- Resident: SELECT only their own documents
create policy bms_resident_docs_resident_select on public.bms_resident_documents
  for select to authenticated
  using (
    resident_id in (
      select id from public.bms_residents
       where profile_id = auth.uid()
         and building_id = bms_current_building()
    )
  );
