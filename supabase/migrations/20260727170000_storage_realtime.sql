-- Storage bucket for uploads (project files, receipts, task photos, signatures)
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists uploads_public_read on storage.objects;
create policy uploads_public_read on storage.objects
  for select using (bucket_id = 'uploads');

drop policy if exists uploads_auth_write on storage.objects;
create policy uploads_auth_write on storage.objects
  for insert to authenticated with check (bucket_id = 'uploads');

drop policy if exists uploads_auth_update on storage.objects;
create policy uploads_auth_update on storage.objects
  for update to authenticated using (bucket_id = 'uploads');

-- Realtime for notifications (Notification.subscribe in the app)
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when others then null;
end $$;
