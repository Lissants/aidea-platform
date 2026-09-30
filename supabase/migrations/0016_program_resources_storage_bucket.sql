-- 0016_program_resources_storage_bucket.sql
--
-- Storage bucket for Program Configuration resource-file uploads
-- (program_resources.file_url). Mirrors the program_resources RLS itself
-- (0099_rls.sql): any authenticated user can read (resources are shared
-- program collateral, not secret), only an admin can write/delete. Same
-- manual-dashboard fallback note as 0011_showcase_storage_bucket.sql
-- applies if migrations run somewhere without the storage schema.
insert into storage.buckets (id, name, public)
values ('program-resources', 'program-resources', true)
on conflict (id) do nothing;

do $$ begin
  create policy "program_resources_bucket_read"
    on storage.objects for select
    using (bucket_id = 'program-resources' and auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "program_resources_bucket_admin_write"
    on storage.objects for all
    using (bucket_id = 'program-resources' and is_admin(auth.uid()))
    with check (bucket_id = 'program-resources' and is_admin(auth.uid()));
exception when duplicate_object then null; end $$;
