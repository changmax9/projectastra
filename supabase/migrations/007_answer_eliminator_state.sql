alter table public.student_answers
add column if not exists eliminated_choice_ids text[] not null default '{}';
