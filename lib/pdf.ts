import type { QuestionImportItem } from "@/lib/types";

export async function parsePdfToQuestions(pdfUploadId: string): Promise<QuestionImportItem[]> {
  // TODO:
  // Future implementation:
  // 1. Extract text and images from PDF
  // 2. Use OCR or AI parser
  // 3. Convert to validated QuestionImportItem[]
  // 4. Let admin preview and edit before importing
  void pdfUploadId;
  return [];
}
