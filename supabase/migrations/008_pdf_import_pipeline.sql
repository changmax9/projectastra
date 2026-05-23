create table if not exists public.pdf_import_jobs (
  id text primary key default gen_random_uuid()::text,
  pdf_upload_id text not null references public.pdf_uploads(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'needs_review', 'completed', 'failed')),
  parser_version text not null,
  ocr_provider text not null default 'none',
  page_count integer not null default 0 check (page_count >= 0),
  extracted_page_count integer not null default 0 check (extracted_page_count >= 0),
  draft_question_count integer not null default 0 check (draft_question_count >= 0),
  warnings text[] not null default '{}',
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pdf_import_pages (
  id text primary key default gen_random_uuid()::text,
  job_id text not null references public.pdf_import_jobs(id) on delete cascade,
  pdf_upload_id text not null references public.pdf_uploads(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  extraction_method text not null default 'none'
    check (extraction_method in ('text', 'ocr', 'none')),
  ocr_status text not null default 'pending'
    check (ocr_status in ('not_needed', 'pending', 'unavailable', 'completed', 'failed')),
  text_extracted text not null default '',
  ocr_text text not null default '',
  page_image_url text,
  confidence numeric,
  warnings text[] not null default '{}',
  raw_blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, page_number)
);

create table if not exists public.pdf_import_draft_questions (
  id text primary key default gen_random_uuid()::text,
  job_id text not null references public.pdf_import_jobs(id) on delete cascade,
  pdf_upload_id text not null references public.pdf_uploads(id) on delete cascade,
  question_number integer,
  source_page_start integer not null check (source_page_start > 0),
  source_page_end integer not null check (source_page_end > 0),
  type text not null check (type in ('mcq', 'frq')),
  exam_name text not null,
  subject text not null,
  course text not null,
  year integer,
  section text not null,
  exam_type text not null,
  unit text not null,
  topic text not null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  question_text text not null,
  choices jsonb not null default '[]'::jsonb,
  correct_answer text,
  explanation text not null default '',
  scoring_notes text not null default '',
  frq_parts jsonb not null default '[]'::jsonb,
  question_images jsonb not null default '[]'::jsonb,
  confidence numeric,
  warnings text[] not null default '{}',
  review_status text not null default 'pending' check (review_status in ('pending', 'saved', 'rejected')),
  saved_question_id text references public.questions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pdf_import_draft_assets (
  id text primary key default gen_random_uuid()::text,
  job_id text not null references public.pdf_import_jobs(id) on delete cascade,
  pdf_upload_id text not null references public.pdf_uploads(id) on delete cascade,
  draft_question_id text references public.pdf_import_draft_questions(id) on delete set null,
  page_number integer not null check (page_number > 0),
  asset_type text not null default 'unknown'
    check (asset_type in ('diagram', 'table', 'choice_image', 'unknown')),
  image_url text,
  bbox jsonb,
  keep_for_question boolean not null default false,
  status text not null default 'candidate' check (status in ('candidate', 'kept', 'discarded')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pdf_import_jobs_upload_created
on public.pdf_import_jobs(pdf_upload_id, created_at desc);

create index if not exists idx_pdf_import_pages_job_page
on public.pdf_import_pages(job_id, page_number);

create index if not exists idx_pdf_import_drafts_job_status
on public.pdf_import_draft_questions(job_id, review_status);

create index if not exists idx_pdf_import_assets_job
on public.pdf_import_draft_assets(job_id);

drop trigger if exists set_pdf_import_jobs_updated_at on public.pdf_import_jobs;
create trigger set_pdf_import_jobs_updated_at before update on public.pdf_import_jobs
for each row execute function public.set_updated_at();

drop trigger if exists set_pdf_import_pages_updated_at on public.pdf_import_pages;
create trigger set_pdf_import_pages_updated_at before update on public.pdf_import_pages
for each row execute function public.set_updated_at();

drop trigger if exists set_pdf_import_draft_questions_updated_at on public.pdf_import_draft_questions;
create trigger set_pdf_import_draft_questions_updated_at before update on public.pdf_import_draft_questions
for each row execute function public.set_updated_at();

drop trigger if exists set_pdf_import_draft_assets_updated_at on public.pdf_import_draft_assets;
create trigger set_pdf_import_draft_assets_updated_at before update on public.pdf_import_draft_assets
for each row execute function public.set_updated_at();

alter table public.pdf_import_jobs enable row level security;
alter table public.pdf_import_pages enable row level security;
alter table public.pdf_import_draft_questions enable row level security;
alter table public.pdf_import_draft_assets enable row level security;

drop policy if exists "admins manage pdf import jobs" on public.pdf_import_jobs;
create policy "admins manage pdf import jobs" on public.pdf_import_jobs
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage pdf import pages" on public.pdf_import_pages;
create policy "admins manage pdf import pages" on public.pdf_import_pages
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage pdf import draft questions" on public.pdf_import_draft_questions;
create policy "admins manage pdf import draft questions" on public.pdf_import_draft_questions
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage pdf import draft assets" on public.pdf_import_draft_assets;
create policy "admins manage pdf import draft assets" on public.pdf_import_draft_assets
for all using (public.is_admin()) with check (public.is_admin());
