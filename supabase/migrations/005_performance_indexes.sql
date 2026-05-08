create index if not exists idx_exams_status on public.exams(status);
create index if not exists idx_exams_subject_course_year_status on public.exams(subject, course, year, status);

create index if not exists idx_exam_sections_exam_order_perf
on public.exam_sections(exam_id, order_index);

create index if not exists idx_exam_questions_exam_question_perf
on public.exam_questions(exam_id, question_id);

create index if not exists idx_exam_questions_exam_order_perf
on public.exam_questions(exam_id, order_index);

create index if not exists idx_questions_course_section_status_perf
on public.questions(course, section, status);

create index if not exists idx_questions_section_perf
on public.questions(section);

create index if not exists idx_questions_tags_gin_perf
on public.questions using gin(tags);

create index if not exists idx_question_images_question_perf
on public.question_images(question_id);

create index if not exists idx_exam_attempts_student_exam_status_perf
on public.exam_attempts(student_id, exam_id, status);

create index if not exists idx_section_progress_attempt_section_perf
on public.section_progress(attempt_id, section);

create index if not exists idx_student_answers_attempt_question_perf
on public.student_answers(attempt_id, question_id);
