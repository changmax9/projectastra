alter table public.exam_attempts
  add column if not exists write_lock_token text,
  add column if not exists write_lock_acquired_at timestamptz;

comment on column public.exam_attempts.write_lock_token is
  'Short-lived server-side mutex for answer, checkpoint, and section-transition writes.';

comment on column public.exam_attempts.write_lock_acquired_at is
  'Acquisition time used to recover an abandoned exam-attempt write lock.';

create or replace function public.claim_exam_attempt_write_lock(
  p_attempt_id text,
  p_expected_section_index integer,
  p_token text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update public.exam_attempts
    set
      write_lock_token = p_token,
      write_lock_acquired_at = clock_timestamp(),
      updated_at = clock_timestamp()
    where id = p_attempt_id
      and status = 'in_progress'
      and current_step = 'section'
      and current_section_index = p_expected_section_index
      and length(p_token) > 0
      and (
        write_lock_token is null
        or write_lock_token = p_token
        or write_lock_acquired_at is null
        or write_lock_acquired_at < clock_timestamp() - interval '60 seconds'
      )
    returning id
  )
  select exists(select 1 from claimed);
$$;

create or replace function public.write_exam_attempt_answers(
  p_attempt_id text,
  p_expected_section_index integer,
  p_token text,
  p_answers jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_row public.exam_attempts%rowtype;
begin
  select *
  into attempt_row
  from public.exam_attempts
  where id = p_attempt_id
  for update;

  if not found
    or attempt_row.status <> 'in_progress'
    or attempt_row.current_step <> 'section'
    or attempt_row.current_section_index <> p_expected_section_index
    or attempt_row.write_lock_token is distinct from p_token
  then
    return false;
  end if;

  insert into public.student_answers (
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
    eliminated_choice_ids,
    updated_at
  )
  select
    p_attempt_id,
    answer_row.question_id,
    answer_row.answer_text,
    answer_row.selected_choice,
    answer_row.is_correct,
    coalesce(answer_row.auto_score, 0),
    answer_row.manual_score,
    coalesce(answer_row.final_score, 0),
    answer_row.time_spent_seconds,
    coalesce(answer_row.flagged, false),
    coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(answer_row.eliminated_choice_ids, '[]'::jsonb)
        )
      ),
      '{}'::text[]
    ),
    coalesce(answer_row.updated_at, clock_timestamp())
  from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer_row(
    question_id text,
    answer_text text,
    selected_choice text,
    is_correct boolean,
    auto_score numeric,
    manual_score numeric,
    final_score numeric,
    time_spent_seconds integer,
    flagged boolean,
    eliminated_choice_ids jsonb,
    updated_at timestamptz
  )
  on conflict (attempt_id, question_id) do update
  set
    answer_text = excluded.answer_text,
    selected_choice = excluded.selected_choice,
    is_correct = excluded.is_correct,
    auto_score = excluded.auto_score,
    manual_score = excluded.manual_score,
    final_score = excluded.final_score,
    time_spent_seconds = excluded.time_spent_seconds,
    flagged = excluded.flagged,
    eliminated_choice_ids = excluded.eliminated_choice_ids,
    updated_at = excluded.updated_at;

  insert into public.frq_responses (
    attempt_id,
    question_id,
    response_text,
    updated_at
  )
  select
    p_attempt_id,
    answer_row.question_id,
    coalesce(answer_row.answer_text, ''),
    coalesce(answer_row.updated_at, clock_timestamp())
  from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer_row(
    question_id text,
    answer_text text,
    updated_at timestamptz
  )
  where answer_row.answer_text is not null
  on conflict (attempt_id, question_id) do update
  set
    response_text = excluded.response_text,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

create or replace function public.commit_exam_attempt_write(
  p_attempt_id text,
  p_expected_section_index integer,
  p_token text,
  p_attempt_patch jsonb,
  p_progress_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_row public.exam_attempts%rowtype;
begin
  select *
  into attempt_row
  from public.exam_attempts
  where id = p_attempt_id
  for update;

  if not found
    or attempt_row.status <> 'in_progress'
    or attempt_row.current_step <> 'section'
    or attempt_row.current_section_index <> p_expected_section_index
    or attempt_row.write_lock_token is distinct from p_token
  then
    return null;
  end if;

  insert into public.section_progress (
    attempt_id,
    exam_id,
    section,
    section_title,
    status,
    started_at,
    submitted_at,
    time_limit_minutes,
    time_spent_seconds,
    current_question_index,
    score_correct,
    score_total
  )
  select
    p_attempt_id,
    attempt_row.exam_id,
    progress_row.section,
    progress_row.section_title,
    progress_row.status,
    progress_row.started_at,
    progress_row.submitted_at,
    progress_row.time_limit_minutes,
    progress_row.time_spent_seconds,
    progress_row.current_question_index,
    progress_row.score_correct,
    progress_row.score_total
  from jsonb_to_recordset(coalesce(p_progress_rows, '[]'::jsonb)) as progress_row(
    section text,
    section_title text,
    status text,
    started_at timestamptz,
    submitted_at timestamptz,
    time_limit_minutes integer,
    time_spent_seconds integer,
    current_question_index integer,
    score_correct numeric,
    score_total numeric
  )
  on conflict (attempt_id, section) do update
  set
    section_title = excluded.section_title,
    status = excluded.status,
    started_at = excluded.started_at,
    submitted_at = excluded.submitted_at,
    time_limit_minutes = excluded.time_limit_minutes,
    time_spent_seconds = excluded.time_spent_seconds,
    current_question_index = excluded.current_question_index,
    score_correct = excluded.score_correct,
    score_total = excluded.score_total;

  update public.exam_attempts
  set
    status = coalesce(p_attempt_patch ->> 'status', status),
    submitted_at = case
      when p_attempt_patch ? 'submitted_at'
        then (p_attempt_patch ->> 'submitted_at')::timestamptz
      else submitted_at
    end,
    total_score = coalesce((p_attempt_patch ->> 'total_score')::numeric, total_score),
    max_score = coalesce((p_attempt_patch ->> 'max_score')::numeric, max_score),
    percentage = coalesce((p_attempt_patch ->> 'percentage')::numeric, percentage),
    current_step = coalesce(p_attempt_patch ->> 'current_step', current_step),
    current_section_index = coalesce(
      (p_attempt_patch ->> 'current_section_index')::integer,
      current_section_index
    ),
    current_question_index = coalesce(
      (p_attempt_patch ->> 'current_question_index')::integer,
      current_question_index
    ),
    time_spent_seconds = coalesce(
      (p_attempt_patch ->> 'time_spent_seconds')::integer,
      time_spent_seconds
    ),
    break_started_at = case
      when p_attempt_patch ? 'break_started_at'
        then (p_attempt_patch ->> 'break_started_at')::timestamptz
      else break_started_at
    end,
    break_completed_at = case
      when p_attempt_patch ? 'break_completed_at'
        then (p_attempt_patch ->> 'break_completed_at')::timestamptz
      else break_completed_at
    end,
    break_skipped = coalesce(
      (p_attempt_patch ->> 'break_skipped')::boolean,
      break_skipped
    ),
    write_lock_token = null,
    write_lock_acquired_at = null,
    updated_at = coalesce(
      (p_attempt_patch ->> 'updated_at')::timestamptz,
      clock_timestamp()
    )
  where id = p_attempt_id
    and current_step = 'section'
    and current_section_index = p_expected_section_index
    and write_lock_token = p_token
  returning * into attempt_row;

  if not found then
    return null;
  end if;

  return to_jsonb(attempt_row);
end;
$$;

revoke all on function public.claim_exam_attempt_write_lock(text, integer, text) from public;
revoke all on function public.write_exam_attempt_answers(text, integer, text, jsonb) from public;
revoke all on function public.commit_exam_attempt_write(text, integer, text, jsonb, jsonb) from public;

grant execute on function public.claim_exam_attempt_write_lock(text, integer, text) to service_role;
grant execute on function public.write_exam_attempt_answers(text, integer, text, jsonb) to service_role;
grant execute on function public.commit_exam_attempt_write(text, integer, text, jsonb, jsonb) to service_role;
