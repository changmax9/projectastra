import { createClient } from "@supabase/supabase-js";
import {
  mockExamQuestions,
  mockExams,
  mockProfiles,
  mockQuestions,
  mockReviewGuideQuestions,
  mockReviewGuides
} from "../lib/mock-data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const studentEmail = process.env.STUDENT_EMAIL;
const studentPassword = process.env.STUDENT_PASSWORD;

if (!url || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local first.");
}
if (!adminEmail || !adminPassword) {
  throw new Error("Missing ADMIN_EMAIL or ADMIN_PASSWORD. Seed credentials must come from environment variables.");
}
const requiredAdminEmail = adminEmail;
const requiredAdminPassword = adminPassword;

const supabase = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function ensureUser(email: string, password: string, fullName: string, role: "admin" | "student") {
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;
  const existing = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const { error: authError } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role
      }
    });
    if (authError) throw authError;
    await supabase.from("profiles").upsert({
      id: existing.id,
      email,
      full_name: fullName,
      role
    });
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role
    }
  });
  if (error || !data.user) throw error || new Error(`Unable to create ${email}`);
  await supabase.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: fullName,
    role
  });
  return data.user.id;
}

async function main() {
  const adminId = await ensureUser(requiredAdminEmail, requiredAdminPassword, "Platform Admin", "admin");
  if (studentEmail && studentPassword) {
    await ensureUser(studentEmail, studentPassword, "Demo Student", "student");
  }

  const questions = mockQuestions.map((question) => ({
    ...question,
    created_by: adminId
  }));
  const exams = mockExams.map((exam) => ({
    ...exam,
    created_by: adminId
  }));
  const guides = mockReviewGuides.map((guide) => ({
    ...guide,
    created_by: adminId
  }));

  const { error: questionError } = await supabase.from("questions").upsert(questions);
  if (questionError) throw questionError;

  const { error: examError } = await supabase.from("exams").upsert(exams);
  if (examError) throw examError;

  const { error: examQuestionError } = await supabase.from("exam_questions").upsert(mockExamQuestions);
  if (examQuestionError) throw examQuestionError;

  const { error: guideError } = await supabase.from("review_guides").upsert(guides);
  if (guideError) throw guideError;

  const { error: guideQuestionError } = await supabase
    .from("review_guide_questions")
    .upsert(mockReviewGuideQuestions);
  if (guideQuestionError) throw guideQuestionError;

  console.log("Seed complete");
  console.log(`Admin user ready: ${requiredAdminEmail}`);
  if (studentEmail && studentPassword) {
    console.log(`Student user ready: ${studentEmail}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
