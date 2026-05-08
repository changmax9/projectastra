alter table public.exams
add column if not exists course text,
add column if not exists year integer,
add column if not exists section text not null default 'Full Exam',
add column if not exists exam_type text not null default 'Practice Exam';

update public.exams
set course = coalesce(course, subject)
where course is null;

alter table public.exams
alter column course set not null;

alter table public.exams
drop constraint if exists exams_status_check;

alter table public.exams
add constraint exams_status_check
check (status in ('draft', 'reviewed', 'published', 'archived'));

create index if not exists idx_exams_subject_course_year
on public.exams(subject, course, year, section, exam_type, status);

alter table public.questions
add column if not exists exam_name text,
add column if not exists course text,
add column if not exists year integer,
add column if not exists section text not null default 'MCQ',
add column if not exists exam_type text not null default 'Practice Exam',
add column if not exists question_number integer,
add column if not exists selection_type text not null default 'single',
add column if not exists required_selections integer,
add column if not exists max_selections integer;

update public.questions
set
  exam_name = coalesce(exam_name, subject),
  course = coalesce(course, subject)
where exam_name is null or course is null;

alter table public.questions
alter column exam_name set not null,
alter column course set not null;

create index if not exists idx_questions_course_year_section
on public.questions(subject, course, year, section, exam_type, topic, status);

alter table public.submissions
add column if not exists current_question_index integer not null default 0;

alter table public.submissions
drop constraint if exists submissions_status_check;

alter table public.submissions
add constraint submissions_status_check
check (status in ('in_progress', 'submitted', 'graded', 'completed', 'paused', 'abandoned'));

drop view if exists public.exam_attempts;
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
  current_question_index,
  created_at,
  updated_at
from public.submissions;
