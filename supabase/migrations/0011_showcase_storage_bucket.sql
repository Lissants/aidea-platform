-- 0011_showcase_storage_bucket.sql
--
-- Storage bucket for showcase project images, plus bucket-scoped policies
-- on storage.objects (public read, admin-only write). This works when
-- migrations run directly against the Supabase Postgres database (the
-- storage schema/tables already exist there). If your deployment path
-- applies migrations somewhere that doesn't have the storage schema yet
-- (e.g. a fresh non-Supabase Postgres), create the bucket manually instead:
-- Supabase Dashboard -> Storage -> New bucket -> name "showcase-images",
-- Public bucket = on, then apply the two policy statements below by hand.
insert into storage.buckets (id, name, public)
values ('showcase-images', 'showcase-images', true)
on conflict (id) do nothing;

do $$ begin
  create policy "showcase_images_public_read"
    on storage.objects for select
    using (bucket_id = 'showcase-images');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "showcase_images_admin_write"
    on storage.objects for all
    using (bucket_id = 'showcase-images' and is_admin(auth.uid()))
    with check (bucket_id = 'showcase-images' and is_admin(auth.uid()));
exception when duplicate_object then null; end $$;
