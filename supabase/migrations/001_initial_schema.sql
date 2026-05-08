create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  subject text not null,
  time_limit_minutes integer not null check (time_limit_minutes > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  unit text not null,
  topic text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  type text not null check (type in ('mcq', 'frq')),
  question_text text not null,
  question_images jsonb not null default '[]'::jsonb,
  choices jsonb not null default '[]'::jsonb,
  correct_answer text,
  explanation text not null,
  source_pdf text,
  tags text[] not null default '{}',
  points integer not null default 1 check (points > 0),
  time_estimate_seconds integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_mcq_requires_answer check (
    (type = 'mcq' and correct_answer is not null) or
    (type = 'frq' and correct_answer is null)
  )
);

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  order_index integer not null,
  points_override integer,
  unique (exam_id, question_id),
  unique (exam_id, order_index)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  total_score numeric not null default 0,
  max_score numeric not null default 0,
  percentage numeric not null default 0,
  time_spent_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer_text text,
  selected_choice text,
  is_correct boolean,
  auto_score numeric not null default 0,
  manual_score numeric,
  final_score numeric not null default 0,
  time_spent_seconds integer,
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

create table if not exists public.media_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_url text not null,
  mime_type text not null,
  size_bytes integer not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  linked_question_id uuid references public.questions(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.pdf_uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_url text not null,
  subject text,
  unit text,
  topic text,
  status text not null default 'uploaded' check (status in ('uploaded', 'parsed', 'failed')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_guides (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null default '',
  subject text not null,
  unit text not null,
  topic text not null,
  content_markdown text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  cover_image_url text,
  estimated_reading_time_minutes integer not null default 8,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.review_guide_questions (
  id uuid primary key default gen_random_uuid(),
  review_guide_id uuid not null references public.review_guides(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  order_index integer not null,
  unique (review_guide_id, question_id)
);

create index if not exists idx_questions_subject_unit_topic on public.questions(subject, unit, topic);
create index if not exists idx_submissions_student on public.submissions(student_id);
create index if not exists idx_answers_submission on public.answers(submission_id);
create index if not exists idx_review_guides_slug_status on public.review_guides(slug, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_exams_updated_at on public.exams;
create trigger set_exams_updated_at before update on public.exams
for each row execute function public.set_updated_at();

drop trigger if exists set_questions_updated_at on public.questions;
create trigger set_questions_updated_at before update on public.questions
for each row execute function public.set_updated_at();

drop trigger if exists set_submissions_updated_at on public.submissions;
create trigger set_submissions_updated_at before update on public.submissions
for each row execute function public.set_updated_at();

drop trigger if exists set_answers_updated_at on public.answers;
create trigger set_answers_updated_at before update on public.answers
for each row execute function public.set_updated_at();

drop trigger if exists set_pdf_uploads_updated_at on public.pdf_uploads;
create trigger set_pdf_uploads_updated_at before update on public.pdf_uploads
for each row execute function public.set_updated_at();

drop trigger if exists set_review_guides_updated_at on public.review_guides;
create trigger set_review_guides_updated_at before update on public.review_guides
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'student')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.exam_questions enable row level security;
alter table public.submissions enable row level security;
alter table public.answers enable row level security;
alter table public.media_files enable row level security;
alter table public.pdf_uploads enable row level security;
alter table public.review_guides enable row level security;
alter table public.review_guide_questions enable row level security;

create policy "profiles self or admin read" on public.profiles
for select using (id = auth.uid() or public.is_admin());

create policy "profiles self update" on public.profiles
for update using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy "published exams visible to signed in users" on public.exams
for select using (status = 'published' or public.is_admin());

create policy "admins manage exams" on public.exams
for all using (public.is_admin()) with check (public.is_admin());

create policy "published exam questions visible" on public.exam_questions
for select using (
  public.is_admin() or exists (
    select 1 from public.exams
    where exams.id = exam_questions.exam_id and exams.status = 'published'
  )
);

create policy "admins manage exam questions" on public.exam_questions
for all using (public.is_admin()) with check (public.is_admin());

create policy "questions visible to signed in users" on public.questions
for select using (auth.uid() is not null);

create policy "admins manage questions" on public.questions
for all using (public.is_admin()) with check (public.is_admin());

create policy "students read own submissions admins all" on public.submissions
for select using (student_id = auth.uid() or public.is_admin());

create policy "students create own submissions" on public.submissions
for insert with check (student_id = auth.uid());

create policy "students update own in progress submissions" on public.submissions
for update using (student_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or public.is_admin());

create policy "students read own answers admins all" on public.answers
for select using (
  public.is_admin() or exists (
    select 1 from public.submissions
    where submissions.id = answers.submission_id and submissions.student_id = auth.uid()
  )
);

create policy "students manage own answers" on public.answers
for all using (
  public.is_admin() or exists (
    select 1 from public.submissions
    where submissions.id = answers.submission_id and submissions.student_id = auth.uid()
  )
) with check (
  public.is_admin() or exists (
    select 1 from public.submissions
    where submissions.id = answers.submission_id and submissions.student_id = auth.uid()
  )
);

create policy "admins manage media" on public.media_files
for all using (public.is_admin()) with check (public.is_admin());

create policy "admins manage pdf uploads" on public.pdf_uploads
for all using (public.is_admin()) with check (public.is_admin());

create policy "published guides visible" on public.review_guides
for select using (status = 'published' or public.is_admin());

create policy "admins manage review guides" on public.review_guides
for all using (public.is_admin()) with check (public.is_admin());

create policy "published guide questions visible" on public.review_guide_questions
for select using (
  public.is_admin() or exists (
    select 1 from public.review_guides
    where review_guides.id = review_guide_questions.review_guide_id
      and review_guides.status = 'published'
  )
);

create policy "admins manage review guide questions" on public.review_guide_questions
for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('question-media', 'question-media', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('pdf-uploads', 'pdf-uploads', true)
on conflict (id) do nothing;
