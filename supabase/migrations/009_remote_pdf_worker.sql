alter table public.pdf_uploads
  add column if not exists storage_provider text not null default 'legacy',
  add column if not exists storage_bucket text,
  add column if not exists storage_object_key text,
  add column if not exists mime_type text not null default 'application/pdf',
  add column if not exists size_bytes bigint not null default 0,
  add column if not exists upload_status text not null default 'completed'
    check (upload_status in ('uploading', 'completed', 'failed', 'deleted'));

alter table public.pdf_uploads drop constraint if exists pdf_uploads_status_check;
alter table public.pdf_uploads
  add constraint pdf_uploads_status_check check (status in ('uploading', 'uploaded', 'parsed', 'failed', 'deleted'));

alter table public.pdf_import_jobs drop constraint if exists pdf_import_jobs_status_check;
alter table public.pdf_import_jobs
  alter column status set default 'queued',
  add constraint pdf_import_jobs_status_check check (
    status in ('queued', 'triaging', 'processing', 'finalizing', 'needs_review', 'completed', 'failed', 'cancelled')
  ),
  add column if not exists phase text not null default 'queued',
  add column if not exists processed_page_count integer not null default 0 check (processed_page_count >= 0),
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0);

create table if not exists public.pdf_import_batches (
  id text primary key default gen_random_uuid()::text,
  job_id text not null references public.pdf_import_jobs(id) on delete cascade,
  page_numbers integer[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pdf_import_batches_job_status
on public.pdf_import_batches(job_id, status, created_at);

drop trigger if exists set_pdf_import_batches_updated_at on public.pdf_import_batches;
create trigger set_pdf_import_batches_updated_at before update on public.pdf_import_batches
for each row execute function public.set_updated_at();

alter table public.pdf_import_batches enable row level security;
drop policy if exists "admins manage pdf import batches" on public.pdf_import_batches;
create policy "admins manage pdf import batches" on public.pdf_import_batches
for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.claim_next_pdf_import_job(worker_id text, lease_seconds integer default 300)
returns setof public.pdf_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id text;
begin
  select id into claimed_id
  from public.pdf_import_jobs
  where status in ('queued', 'triaging', 'processing', 'finalizing')
    and cancel_requested_at is null
    and (lease_expires_at is null or lease_expires_at < now())
  order by created_at
  for update skip locked
  limit 1;

  if claimed_id is null then return; end if;

  return query
  update public.pdf_import_jobs
  set lease_owner = worker_id,
      lease_expires_at = now() + make_interval(secs => lease_seconds),
      heartbeat_at = now(),
      attempt_count = attempt_count + 1,
      updated_at = now()
  where id = claimed_id
  returning *;
end;
$$;

revoke all on function public.claim_next_pdf_import_job(text, integer) from public;
grant execute on function public.claim_next_pdf_import_job(text, integer) to service_role;
