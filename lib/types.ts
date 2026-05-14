export type Role = "student" | "admin";
export type ExamStatus = "draft" | "reviewed" | "published" | "archived";
export type Difficulty = "easy" | "medium" | "hard";
export type QuestionType = "mcq" | "frq";
export type QuestionStatus = "draft" | "reviewed" | "published";
export type SubmissionStatus = "in_progress" | "submitted" | "graded" | "completed" | "paused" | "abandoned";
export type ExamAttemptStep = "section" | "break" | "completed";
export type ExamSectionProgressStatus = "not_started" | "in_progress" | "completed";
export type ReviewGuideStatus = "draft" | "published";
export type PdfStatus = "uploaded" | "parsed" | "failed";

export type JsonRecord = Record<string, unknown>;

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone_number?: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  subject: string;
  course: string;
  year: number | null;
  section: string;
  exam_type: string;
  time_limit_minutes: number;
  sections?: ExamSection[];
  status: ExamStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamSection {
  id: string;
  section: string;
  title: string;
  questionCount: number;
  timeLimitMinutes: number;
  calculatorAllowed: boolean;
  order: number;
}

export interface ExamSectionProgress {
  section: string;
  sectionTitle: string;
  status: ExamSectionProgressStatus;
  startedAt: string | null;
  submittedAt: string | null;
  timeLimitMinutes: number;
  timeSpentSeconds: number;
  currentQuestionIndex: number;
  scoreCorrect: number;
  scoreTotal: number;
}

export interface QuestionImage {
  id: string;
  url: string;
  caption?: string | null;
  alt?: string | null;
}

export interface QuestionChoice {
  id: string;
  text: string;
  image_url?: string | null;
}

export interface Question {
  id: string;
  exam_name: string;
  subject: string;
  course: string;
  year: number | null;
  section: string;
  exam_type: string;
  question_number: number | null;
  unit: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  selection_type?: "single" | "multiple";
  required_selections?: number | null;
  max_selections?: number | null;
  question_text: string;
  question_images: QuestionImage[];
  choices: QuestionChoice[];
  correct_answer: string | null;
  explanation: string;
  source_pdf: string | null;
  tags: string[];
  status: QuestionStatus;
  points: number;
  time_estimate_seconds: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_id: string;
  order_index: number;
  points_override: number | null;
}

export interface ExamQuestionWithQuestion extends ExamQuestion {
  question: Question;
}

export interface ExamWithQuestions extends Exam {
  exam_questions: ExamQuestionWithQuestion[];
}

export interface Submission {
  id: string;
  exam_id: string;
  student_id: string;
  section?: string | null;
  section_title?: string | null;
  calculator_allowed?: boolean | null;
  section_time_limit_minutes?: number | null;
  current_step?: ExamAttemptStep;
  current_section_index?: number;
  break_started_at?: string | null;
  break_completed_at?: string | null;
  break_skipped?: boolean;
  sections_progress?: ExamSectionProgress[];
  status: SubmissionStatus;
  started_at: string;
  submitted_at: string | null;
  total_score: number;
  max_score: number;
  percentage: number;
  time_spent_seconds: number;
  current_question_index: number;
  created_at: string;
  updated_at: string;
}

export interface Answer {
  id: string;
  submission_id: string;
  question_id: string;
  answer_text: string | null;
  selected_choice: string | null;
  is_correct: boolean | null;
  auto_score: number;
  manual_score: number | null;
  final_score: number;
  time_spent_seconds: number | null;
  flagged: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubmissionWithDetails extends Submission {
  exam: Exam | null;
  student: Profile | null;
  answers: Array<Answer & { question: Question | null }>;
}

export interface MediaFile {
  id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  linked_question_id: string | null;
  created_at: string;
}

export interface PdfUpload {
  id: string;
  file_name: string;
  file_url: string;
  subject: string | null;
  unit: string | null;
  topic: string | null;
  status: PdfStatus;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewGuide {
  id: string;
  title: string;
  slug: string;
  description: string;
  subject: string;
  unit: string;
  topic: string;
  difficulty: Difficulty;
  content_markdown: string;
  status: ReviewGuideStatus;
  cover_image_url: string | null;
  estimated_reading_time_minutes: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ReviewGuideQuestion {
  id: string;
  review_guide_id: string;
  question_id: string;
  order_index: number;
}

export interface ReviewGuideWithQuestions extends ReviewGuide {
  related_questions: Question[];
}

export interface QuestionFilters {
  examName?: string;
  subject?: string;
  course?: string;
  unit?: string;
  topic?: string;
  difficulty?: Difficulty | "";
  type?: QuestionType | "";
  status?: QuestionStatus | "";
  year?: string;
  section?: string;
  examType?: string;
  tag?: string;
  search?: string;
}

export interface QuestionImportItem {
  id: string;
  exam_name: string;
  subject: string;
  course: string;
  year: number | null;
  section: string;
  exam_type: string;
  question_number: number | null;
  unit: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  selection_type?: "single" | "multiple";
  required_selections?: number | null;
  max_selections?: number | null;
  question_text: string;
  question_images: QuestionImage[];
  choices: QuestionChoice[];
  correct_answer: string | null;
  explanation: string;
  source_pdf: string | null;
  tags: string[];
  status: QuestionStatus;
  points: number;
  time_estimate_seconds: number | null;
}

export interface ExamFilters {
  subject?: string;
  course?: string;
  year?: string;
  section?: string;
  examType?: string;
  status?: ExamStatus | "";
  search?: string;
}

export interface ExamImportMetadata {
  id: string;
  title: string;
  description: string;
  subject: string;
  course: string;
  year: number | null;
  section: string;
  exam_type: string;
  time_limit_minutes: number;
  sections?: ExamSection[];
  status: ExamStatus;
}

export interface QuestionImportBatch {
  exam: ExamImportMetadata;
  questions: QuestionImportItem[];
}
