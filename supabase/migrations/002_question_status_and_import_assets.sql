alter table public.questions
add column if not exists status text not null default 'draft'
check (status in ('draft', 'reviewed', 'published'));

create index if not exists idx_questions_status on public.questions(status);

alter table public.review_guides
add column if not exists difficulty text not null default 'medium'
check (difficulty in ('easy', 'medium', 'hard'));

create index if not exists idx_review_guides_subject_topic_difficulty
on public.review_guides(subject, topic, difficulty);

create table if not exists public.question_images (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  file_url text not null,
  caption text,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_question_images_question on public.question_images(question_id, sort_order);

drop trigger if exists set_question_images_updated_at on public.question_images;
create trigger set_question_images_updated_at before update on public.question_images
for each row execute function public.set_updated_at();

alter table public.question_images enable row level security;

create policy "question images visible to signed in users" on public.question_images
for select using (auth.uid() is not null);

create policy "admins manage question images" on public.question_images
for all using (public.is_admin()) with check (public.is_admin());

create or replace view public.exam_attempts as
select
  id,
  exam_id,
  student_id as user_id,
  status,
  started_at,
  submitted_at,
  total_score as score,
  max_score,
  percentage,
  time_spent_seconds as time_spent,
  created_at,
  updated_at
from public.submissions;

create or replace view public.student_answers as
select
  id,
  submission_id as attempt_id,
  question_id,
  selected_choice,
  answer_text,
  is_correct,
  flagged as marked_for_review,
  final_score,
  time_spent_seconds,
  created_at,
  updated_at
from public.answers;
