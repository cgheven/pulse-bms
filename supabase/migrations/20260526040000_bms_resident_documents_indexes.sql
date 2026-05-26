-- Composite index for the primary query pattern (resident_id + building_id filter)
create index if not exists bms_resident_docs_resident_building
  on public.bms_resident_documents (resident_id, building_id);

-- Index for rate-limiting query (uploaded_by + created_at range scan)
create index if not exists bms_resident_docs_uploader_time
  on public.bms_resident_documents (uploaded_by, created_at);
