create extension if not exists "pgcrypto";

drop view if exists public.student_answers;
drop view if exists public.exam_attempts;

alter table public.exam_questions drop constraint if exists exam_questions_exam_id_fkey;
alter table public.exam_questions drop constraint if exists exam_questions_question_id_fkey;
alter table public.submissions drop constraint if exists submissions_exam_id_fkey;
alter table public.answers drop constraint if exists answers_submission_id_fkey;
alter table public.answers drop constraint if exists answers_question_id_fkey;
alter table public.media_files drop constraint if exists media_files_linked_question_id_fkey;
alter table public.review_guide_questions drop constraint if exists review_guide_questions_review_guide_id_fkey;
alter table public.review_guide_questions drop constraint if exists review_guide_questions_question_id_fkey;
alter table public.question_images drop constraint if exists question_images_question_id_fkey;

alter table public.exams alter column id drop default;
alter table public.exams alter column id type text using id::text;
alter table public.exams alter column id set default gen_random_uuid()::text;

alter table public.questions alter column id drop default;
alter table public.questions alter column id type text using id::text;
alter table public.questions alter column id set default gen_random_uuid()::text;
alter table public.questions drop constraint if exists questions_mcq_requires_answer;

alter table public.exam_questions alter column id drop default;
alter table public.exam_questions alter column id type text using id::text;
alter table public.exam_questions alter column id set default gen_random_uuid()::text;
alter table public.exam_questions alter column exam_id type text using exam_id::text;
alter table public.exam_questions alter column question_id type text using question_id::text;

alter table public.submissions alter column id drop default;
alter table public.submissions alter column id type text using id::text;
alter table public.submissions alter column id set default gen_random_uuid()::text;
alter table public.submissions alter column exam_id type text using exam_id::text;

alter table public.answers alter column id drop default;
alter table public.answers alter column id type text using id::text;
alter table public.answers alter column id set default gen_random_uuid()::text;
alter table public.answers alter column submission_id type text using submission_id::text;
alter table public.answers alter column question_id type text using question_id::text;

alter table public.question_images alter column id drop default;
alter table public.question_images alter column id type text using id::text;
alter table public.question_images alter column id set default gen_random_uuid()::text;
alter table public.question_images alter column question_id type text using question_id::text;
alter table public.question_images add column if not exists alt text;

alter table public.media_files alter column id drop default;
alter table public.media_files alter column id type text using id::text;
alter table public.media_files alter column id set default gen_random_uuid()::text;
alter table public.media_files alter column linked_question_id type text using linked_question_id::text;

alter table public.pdf_uploads alter column id drop default;
alter table public.pdf_uploads alter column id type text using id::text;
alter table public.pdf_uploads alter column id set default gen_random_uuid()::text;

alter table public.review_guides alter column id drop default;
alter table public.review_guides alter column id type text using id::text;
alter table public.review_guides alter column id set default gen_random_uuid()::text;

alter table public.review_guide_questions alter column id drop default;
alter table public.review_guide_questions alter column id type text using id::text;
alter table public.review_guide_questions alter column id set default gen_random_uuid()::text;
alter table public.review_guide_questions alter column review_guide_id type text using review_guide_id::text;
alter table public.review_guide_questions alter column question_id type text using question_id::text;

alter table public.exam_questions
  add constraint exam_questions_exam_id_fkey
  foreign key (exam_id) references public.exams(id) on delete cascade;

alter table public.exam_questions
  add constraint exam_questions_question_id_fkey
  foreign key (question_id) references public.questions(id) on delete cascade;

alter table public.submissions
  add constraint submissions_exam_id_fkey
  foreign key (exam_id) references public.exams(id) on delete cascade;

alter table public.answers
  add constraint answers_submission_id_fkey
  foreign key (submission_id) references public.submissions(id) on delete cascade;

alter table public.answers
  add constraint answers_question_id_fkey
  foreign key (question_id) references public.questions(id) on delete cascade;

alter table public.media_files
  add constraint media_files_linked_question_id_fkey
  foreign key (linked_question_id) references public.questions(id) on delete set null;

alter table public.review_guide_questions
  add constraint review_guide_questions_review_guide_id_fkey
  foreign key (review_guide_id) references public.review_guides(id) on delete cascade;

alter table public.review_guide_questions
  add constraint review_guide_questions_question_id_fkey
  foreign key (question_id) references public.questions(id) on delete cascade;

alter table public.question_images
  add constraint question_images_question_id_fkey
  foreign key (question_id) references public.questions(id) on delete cascade;

create table if not exists public.exam_sections (
  id text primary key default gen_random_uuid()::text,
  exam_id text not null references public.exams(id) on delete cascade,
  section text not null,
  title text not null,
  question_count integer not null default 0 check (question_count >= 0),
  time_limit_minutes integer not null check (time_limit_minutes > 0),
  calculator_allowed boolean not null default true,
  order_index integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, section),
  unique (exam_id, order_index)
);

create table if not exists public.exam_attempts (
  id text primary key default gen_random_uuid()::text,
  exam_id text not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'graded', 'completed', 'paused', 'abandoned')),
  current_step text not null default 'section'
    check (current_step in ('section', 'break', 'completed')),
  current_section_index integer not null default 0,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  break_started_at timestamptz,
  break_completed_at timestamptz,
  break_skipped boolean not null default false,
  total_score numeric not null default 0,
  max_score numeric not null default 0,
  percentage numeric not null default 0,
  time_spent_seconds integer not null default 0,
  current_question_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.section_progress (
  id text primary key default gen_random_uuid()::text,
  attempt_id text not null references public.exam_attempts(id) on delete cascade,
  exam_id text not null references public.exams(id) on delete cascade,
  section text not null,
  section_title text not null,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  started_at timestamptz,
  submitted_at timestamptz,
  time_limit_minutes integer not null check (time_limit_minutes > 0),
  time_spent_seconds integer not null default 0,
  current_question_index integer not null default 0,
  score_correct numeric not null default 0,
  score_total numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, section)
);

create table if not exists public.student_answers (
  id text primary key default gen_random_uuid()::text,
  attempt_id text not null references public.exam_attempts(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
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
  unique (attempt_id, question_id)
);

create table if not exists public.frq_responses (
  id text primary key default gen_random_uuid()::text,
  attempt_id text not null references public.exam_attempts(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
  response_text text not null default '',
  manual_score numeric,
  rubric_feedback text,
  status text not null default 'pending' check (status in ('pending', 'graded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table if not exists public.admin_edits (
  id text primary key default gen_random_uuid()::text,
  admin_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.exam_attempts (
  id,
  exam_id,
  student_id,
  status,
  current_step,
  current_section_index,
  started_at,
  submitted_at,
  total_score,
  max_score,
  percentage,
  time_spent_seconds,
  current_question_index,
  created_at,
  updated_at
)
select
  id,
  exam_id,
  student_id,
  status,
  case when status in ('graded', 'completed', 'submitted') then 'completed' else 'section' end,
  0,
  started_at,
  submitted_at,
  total_score,
  max_score,
  percentage,
  time_spent_seconds,
  current_question_index,
  created_at,
  updated_at
from public.submissions
on conflict (id) do nothing;

insert into public.student_answers (
  id,
  attempt_id,
  question_id,
  answer_text,
  selected_choice,
  is_correct,
  auto_score,
  manual_score,
  final_score,
  time_spent_seconds,
  flagged,
  created_at,
  updated_at
)
select
  id,
  submission_id,
  question_id,
  answer_text,
  selected_choice,
  is_correct,
  auto_score,
  manual_score,
  final_score,
  time_spent_seconds,
  flagged,
  created_at,
  updated_at
from public.answers
on conflict (attempt_id, question_id) do nothing;

create index if not exists idx_exam_sections_exam_order on public.exam_sections(exam_id, order_index);
create index if not exists idx_exam_attempts_student_exam_status on public.exam_attempts(student_id, exam_id, status);
create index if not exists idx_section_progress_attempt on public.section_progress(attempt_id, section);
create index if not exists idx_student_answers_attempt on public.student_answers(attempt_id);
create index if not exists idx_frq_responses_attempt on public.frq_responses(attempt_id);
create index if not exists idx_admin_edits_entity on public.admin_edits(entity_type, entity_id, created_at);

drop trigger if exists set_exam_sections_updated_at on public.exam_sections;
create trigger set_exam_sections_updated_at before update on public.exam_sections
for each row execute function public.set_updated_at();

drop trigger if exists set_exam_attempts_updated_at on public.exam_attempts;
create trigger set_exam_attempts_updated_at before update on public.exam_attempts
for each row execute function public.set_updated_at();

drop trigger if exists set_section_progress_updated_at on public.section_progress;
create trigger set_section_progress_updated_at before update on public.section_progress
for each row execute function public.set_updated_at();

drop trigger if exists set_student_answers_updated_at on public.student_answers;
create trigger set_student_answers_updated_at before update on public.student_answers
for each row execute function public.set_updated_at();

drop trigger if exists set_frq_responses_updated_at on public.frq_responses;
create trigger set_frq_responses_updated_at before update on public.frq_responses
for each row execute function public.set_updated_at();

alter table public.exam_sections enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.section_progress enable row level security;
alter table public.student_answers enable row level security;
alter table public.frq_responses enable row level security;
alter table public.admin_edits enable row level security;

drop policy if exists "exam sections visible" on public.exam_sections;
create policy "exam sections visible" on public.exam_sections
for select using (
  public.is_admin() or exists (
    select 1 from public.exams
    where exams.id = exam_sections.exam_id and exams.status = 'published'
  )
);

drop policy if exists "admins manage exam sections" on public.exam_sections;
create policy "admins manage exam sections" on public.exam_sections
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "students manage own exam attempts" on public.exam_attempts;
create policy "students manage own exam attempts" on public.exam_attempts
for all using (student_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or public.is_admin());

drop policy if exists "students manage own section progress" on public.section_progress;
create policy "students manage own section progress" on public.section_progress
for all using (
  public.is_admin() or exists (
    select 1 from public.exam_attempts
    where exam_attempts.id = section_progress.attempt_id
      and exam_attempts.student_id = auth.uid()
  )
)
with check (
  public.is_admin() or exists (
    select 1 from public.exam_attempts
    where exam_attempts.id = section_progress.attempt_id
      and exam_attempts.student_id = auth.uid()
  )
);

drop policy if exists "students manage own student answers" on public.student_answers;
create policy "students manage own student answers" on public.student_answers
for all using (
  public.is_admin() or exists (
    select 1 from public.exam_attempts
    where exam_attempts.id = student_answers.attempt_id
      and exam_attempts.student_id = auth.uid()
  )
)
with check (
  public.is_admin() or exists (
    select 1 from public.exam_attempts
    where exam_attempts.id = student_answers.attempt_id
      and exam_attempts.student_id = auth.uid()
  )
);

drop policy if exists "students manage own frq responses" on public.frq_responses;
create policy "students manage own frq responses" on public.frq_responses
for all using (
  public.is_admin() or exists (
    select 1 from public.exam_attempts
    where exam_attempts.id = frq_responses.attempt_id
      and exam_attempts.student_id = auth.uid()
  )
)
with check (
  public.is_admin() or exists (
    select 1 from public.exam_attempts
    where exam_attempts.id = frq_responses.attempt_id
      and exam_attempts.student_id = auth.uid()
  )
);

drop policy if exists "admins read admin edits" on public.admin_edits;
create policy "admins read admin edits" on public.admin_edits
for select using (public.is_admin());

drop policy if exists "admins create admin edits" on public.admin_edits;
create policy "admins create admin edits" on public.admin_edits
for insert with check (public.is_admin());
