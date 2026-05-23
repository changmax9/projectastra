import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  mockAnswers,
  mockExamQuestions,
  mockExams,
  mockMediaFiles,
  mockPasswords,
  mockPdfImportDraftAssets,
  mockPdfImportDraftQuestions,
  mockPdfImportJobs,
  mockPdfImportPages,
  mockPdfUploads,
  mockProfiles,
  mockQuestions,
  mockReviewGuideQuestions,
  mockReviewGuides,
  mockSubmissions
} from "@/lib/mock-data";
import type {
  Answer,
  Exam,
  ExamQuestion,
  MediaFile,
  PdfImportDraftAsset,
  PdfImportDraftQuestion,
  PdfImportJob,
  PdfImportPage,
  PdfUpload,
  Profile,
  Question,
  ReviewGuide,
  ReviewGuideQuestion,
  Submission
} from "@/lib/types";

interface MockDb {
  profiles: Profile[];
  passwords: Record<string, string>;
  exams: Exam[];
  questions: Question[];
  examQuestions: ExamQuestion[];
  submissions: Submission[];
  answers: Answer[];
  mediaFiles: MediaFile[];
  pdfUploads: PdfUpload[];
  pdfImportJobs: PdfImportJob[];
  pdfImportPages: PdfImportPage[];
  pdfImportDraftQuestions: PdfImportDraftQuestion[];
  pdfImportDraftAssets: PdfImportDraftAsset[];
  reviewGuides: ReviewGuide[];
  reviewGuideQuestions: ReviewGuideQuestion[];
}

const dbPath = path.join(process.cwd(), ".mock-db.json");
function replaceArray<T>(target: T[], source: T[]) {
  target.splice(0, target.length, ...source);
}

function replaceObject<T extends Record<string, string>>(target: T, source: Record<string, string>) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

function currentDb(): MockDb {
  return {
    profiles: mockProfiles,
    passwords: mockPasswords,
    exams: mockExams,
    questions: mockQuestions,
    examQuestions: mockExamQuestions,
    submissions: mockSubmissions,
    answers: mockAnswers,
    mediaFiles: mockMediaFiles,
    pdfUploads: mockPdfUploads,
    pdfImportJobs: mockPdfImportJobs,
    pdfImportPages: mockPdfImportPages,
    pdfImportDraftQuestions: mockPdfImportDraftQuestions,
    pdfImportDraftAssets: mockPdfImportDraftAssets,
    reviewGuides: mockReviewGuides,
    reviewGuideQuestions: mockReviewGuideQuestions
  };
}

function applyDb(db: Partial<MockDb>) {
  replaceArray(mockProfiles, db.profiles || mockProfiles);
  replaceObject(mockPasswords, db.passwords || mockPasswords);
  replaceArray(mockExams, db.exams || mockExams);
  replaceArray(mockQuestions, db.questions || mockQuestions);
  replaceArray(mockExamQuestions, db.examQuestions || mockExamQuestions);
  replaceArray(mockSubmissions, db.submissions || []);
  replaceArray(mockAnswers, db.answers || []);
  replaceArray(mockMediaFiles, db.mediaFiles || []);
  replaceArray(mockPdfUploads, db.pdfUploads || []);
  replaceArray(mockPdfImportJobs, db.pdfImportJobs || []);
  replaceArray(mockPdfImportPages, db.pdfImportPages || []);
  replaceArray(mockPdfImportDraftQuestions, db.pdfImportDraftQuestions || []);
  replaceArray(mockPdfImportDraftAssets, db.pdfImportDraftAssets || []);
  replaceArray(mockReviewGuides, db.reviewGuides || mockReviewGuides);
  replaceArray(mockReviewGuideQuestions, db.reviewGuideQuestions || mockReviewGuideQuestions);
}

export async function hydrateMockStore() {
  try {
    const raw = await readFile(dbPath, "utf8");
    applyDb(JSON.parse(raw) as MockDb);
  } catch {
    await persistMockStore();
  }
}

export async function persistMockStore() {
  await writeFile(dbPath, JSON.stringify(currentDb(), null, 2), "utf8");
}
