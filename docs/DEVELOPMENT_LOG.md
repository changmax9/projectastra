# AP Mock Exam Platform Development Log

这份文档是给新加入项目的朋友，以及他的 Codex 使用的项目交接说明。它不是产品宣传页，而是当前工程状态、关键设计决策、容易踩坑的地方和继续开发路线图。

更新时间：2026-05-08

## 2026-06-11: Large scanned packet OCR triage

- Diagnosed a 718-page image-only AP Physics mixed packet where the previous first-12-page OCR limit could never reach question pages.
- Added bounded document-wide OCR triage before full OCR when image-only pages exceed `PDF_OCR_MAX_PAGES`.
- Triage samples evenly across the packet, favors question starts, choices, prompt verbs, and exam-section signals, and strongly penalizes scoring guidelines, distribution-of-points pages, contents, and course-description material.
- Full OCR now targets the strongest question-page neighborhoods and warns that skipped pages still require later batches.
- Added `PDF_OCR_TRIAGE_SAMPLE_PAGES` and `PDF_OCR_TRIAGE_TIMEOUT_MS` configuration.
- Sample verification on `物理2简答题 选择题.pdf`: 718 image-only pages, 24-page triage sample, 12 pages sent to full OCR, 25 review drafts from actual question pages, zero accepted scoring-guideline pages, and maximum draft page span of 1 after preventing cross-gap merges.
- Passed `node tests/run-import-tests.cjs`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/next/dist/bin/next lint`, `node scripts/predeploy-check.cjs`, and `git diff --check` (using the bundled Node executable because `node` was not on this PowerShell session's `PATH`).
- Ran an isolated raw-Tesseract-versus-vision comparison on 12 previously unused sample pages. Vision classified all 12 pages correctly; raw OCR recovered readable prompt prose but no selected question page was structurally complete without layout/visual context.
- Preserved untouched Tesseract output separately as `tesseract-local-raw`, tightened triage exclusions for performance-data and answer-list pages, and documented the experiment in `docs/sample-physics2-ocr-vs-vision-report.md`.
- Pulled GitHub UI commits `512cfad` and `6dc0db4`, moved the local Tesseract runtime and OCR evaluation artifacts to `D:\Codex`, configured `.env.local` with D-drive OCR paths, added `npm run check:ocr`, and exposed untouched OCR model output in the admin PDF page audit.
- Verified the website analyzer against the 718-page sample using only D-drive OCR paths: provider `tesseract-local`, 4 triaged OCR pages, 5 review drafts, raw Tesseract audit blocks on all 4 OCR pages, and generated page images stored under the D-drive project. `npm run check:ocr`, tests, TypeScript, lint, predeploy, and production `next build` passed.

---

## 1. 项目简介

AP Mock Exam Platform 是一个 AP 风格模考网站，目前已经支持：

- AP Calculus AB 2019 Practice Exam
- AP Physics 1 2023 Practice Exam
- 一个小型 AP Physics 1 Mock Exam
- 学生端登录、选择考试、分 section 作答、保存退出、恢复、提交和查看结果
- Admin 题库管理、题目编辑、图片预览、LaTeX preview、needs-admin-review workflow
- Supabase/Postgres 作为线上数据库
- Vercel Free + Supabase Free 部署
- 本地 `.mock-db.json` fallback

项目最重要的核心理念：

题目必须是结构化网页内容。题干、选项、公式、表格都应该是可编辑、可渲染、可搜索的文本/Markdown/LaTeX/HTML，不允许把整页 PDF 截图或整道题截图当成题目内容。只有题目真正需要的图像、函数图、实验图、坐标图、表格图片、几何图、选择题图片选项，才可以作为独立 image asset 保存和显示。

这个规则是最高优先级，已经写进 import/seed/predeploy/backup 检查里。不要绕过。

---

## 2. 当前技术栈

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Supabase Auth / Postgres / Storage-ready data layer
- Vercel Free 部署
- Zod 表单和 JSON 校验
- `react-hook-form` 用于 admin question editor
- `react-markdown`
- `remark-gfm`
- `remark-math`
- `rehype-katex`
- `katex`
- `MathMarkdown` 统一渲染 Markdown + LaTeX
- `.mock-db.json` local fallback
- seed/check/backup/restore/predeploy scripts

当前项目是 Supabase-first，但仍保留 mock fallback。没有 Supabase 环境变量时，本地可以继续用 `.mock-db.json` 跑通学生端和 admin 端。

---

## 3. 当前 repo / 部署结构

当前有两个 GitHub repo remote：

1. organization repo
   - `apresources27/ap-website`
   - 当前 remote 名称：`origin`

2. personal repo
   - `sjfq/ap-website-vercel`
   - 当前 remote 名称：`personal`

当前部署约定：

- `personal` repo 连接 Vercel。
- push 到 `personal/main` 会触发 Vercel 自动部署。
- `origin` 可以作为协作主仓库或备份仓库。
- 如果朋友直接 push 到 personal repo 的 `main`，必须先确保：
  - `npm run test` 通过
  - `npm run lint` 通过
  - `npx tsc --noEmit` 通过

最近 git history 里的关键节点：

- `8b93c0e` finish reviewed AP Calculus AB question bank and exam flow
- `32c95bb` prepare Vercel and Supabase deployment
- `4c1089d` finish Supabase seed and deployment setup
- `ae705e8` add Supabase backup and restore dry-run scripts
- `9b17d66` fix exam saving crash and optimize Supabase performance

---

## 4. 当前主要功能

### 学生端

已经支持：

- Login / Register
- Dashboard
- Available Exams
- 按 subject -> AP course -> exam 分组展示考试
- 每套 exam 只有一个 `Start Exam` / `Resume Exam`
- 一套 exam 一个 attempt/session
- section 是考试内部流程，不是独立考试
- Save & Exit / Resume
- End Section
- 10-minute break screen
- Section timer
- Timer 到 0 自动提交当前 section
- Results by section
- MCQ auto grading
- FRQ manual grading pending
- Select Two 限制最多选 2 个
- Select Two grading 按 unordered set 判断
- Markdown / LaTeX 渲染
- 题目图片完整显示，不裁剪
- choice image 完整显示
- History 里显示友好的状态文案，例如 `In Progress` / `Completed`

### Admin 端

已经支持：

- Admin dashboard
- `/admin/questions`
- `/admin/questions/[id]`
- question list 搜索和筛选
- admin questions 分页，默认每页 25 道
- questionText 编辑
- choices 编辑
- answer 编辑
- explanation 编辑
- topic / difficulty / tags / status 编辑
- images 编辑和 preview
- MathMarkdown preview
- needs-admin-review workflow
- `Save Draft`
- `Mark as Reviewed`
- 标记 reviewed 后移除 `needs-admin-review` tag，并跳到下一题
- Admin edit 保存到 Supabase

### 数据层

已经支持：

- Supabase as production database
- `.mock-db.json` as local fallback
- Supabase seed script
- Supabase check script
- Supabase backup export script
- Restore dry-run script
- Predeploy check script
- 禁止整页/整题 screenshot path 的校验

---

## 5. Exam flow 设计

这一节非常重要。不要把 section/part 重新改回独立 Start。

### 总原则

- Available Exams 每套 exam 只有一个 Start / Resume。
- 一套 exam 只有一个 attempt/session。
- section 是 attempt 内部自动推进流程。
- attempt 通过 `exam_attempts` 表保存整体状态。
- section 进度通过 `section_progress` 表保存。
- 学生不能在 Available Exams 里单独开始某个 Part。

### AP Calculus AB 2019 flow

一套 exam，一个 attempt，内部自动按顺序：

1. `MCQ_NON_CALCULATOR`
   - 显示名：`Multiple Choice - Part A: No Calculator`
   - 30 questions
   - 60 minutes
   - No Calculator

2. `MCQ_CALCULATOR`
   - 显示名：`Multiple Choice - Part B: Calculator Allowed`
   - 15 questions
   - 45 minutes
   - Calculator Allowed

3. Break
   - 10 minutes
   - 只出现一次
   - 只在 MCQ sections 全部完成后、FRQ sections 开始前出现
   - `Skip Break` 是 practice-only，真实 AP 考试不允许跳过 scheduled break

4. `FRQ_CALCULATOR`
   - 显示名：`Free Response - Part A: Calculator Allowed`
   - 2 questions
   - 30 minutes
   - Calculator Allowed

5. `FRQ_NON_CALCULATOR`
   - 显示名：`Free Response - Part B: No Calculator`
   - 4 questions
   - 60 minutes
   - No Calculator

6. Results
   - 按 section 分组展示
   - MCQ Part A denominator = 30
   - MCQ Part B denominator = 15
   - Overall MCQ denominator = 45
   - FRQ 显示 Manual grading pending

### AP Physics flow

AP Physics 的流程也使用同一套 section system：

1. `MCQ`
   - 90 minutes

2. Break
   - 10 minutes
   - MCQ 完成后出现

3. `FRQ`
   - 90 minutes

4. Results

如果某套 Physics exam 暂时没有 FRQ 题，学生端不要进入空白 FRQ section。可以显示 `Free Response section not available yet`，或者在 MCQ 后直接进入 results。不要让 0-question section 进入作答页。

### 不要改回错误设计

错误做法：

- Available Exams 展开 4 个 Part。
- 每个 Part 都有单独 Start。
- 每个 Part 创建独立 attempt。
- Dashboard/History 里每个 Part 像独立考试。

正确做法：

- Available Exams 一套 exam 一个 Start / Resume。
- section 自动推进。
- Dashboard/History 只显示一条 exam attempt。
- History 可以显示当前 section title，但不能把 section 当成独立 exam。

---

## 6. 数据库 / Supabase

当前 production app 读写 Supabase。`.mock-db.json` 只是 fallback 和 seed 来源。

主要表：

- `profiles`
- `exams`
- `exam_sections`
- `questions`
- `question_images`
- `exam_questions`
- `exam_attempts`
- `section_progress`
- `student_answers`
- `frq_responses`
- `review_guides`
- `review_guide_questions`
- `admin_edits`
- 另外还有 `media_files`、`pdf_uploads`

重要说明：

- production app 读写 Supabase。
- `.mock-db.json` 只是本地 fallback 和 seed 来源。
- 线上 admin 修改题目会保存到 Supabase。
- 线上 admin 修改不会自动回写 `.mock-db.json`。
- 所以要定期运行 backup script，把 Supabase 里的稳定题库导出到 `backups/`。
- 不要重新 seed 覆盖线上 admin 已经手动编辑过的题库，除非你非常确定要恢复 seed 状态。

当前 Supabase 数据规模大致是：

- profiles: 2
- exams: 3
- exam_sections: 8
- questions: 107
- question_images: 45
- exam_questions: 107
- review_guides: 1
- review_guide_questions: 3

attempt/answer 数据会随着测试增加，不应作为题库 backup 的主要内容。

---

## 7. Scripts / 常用命令

开发：

```bash
npm run dev
```

测试：

```bash
npm run test
npm run lint
npx tsc --noEmit
```

Supabase：

```bash
npm run check:supabase
npm run seed:supabase:dry
npm run seed:supabase
npm run backup:supabase
npm run restore:supabase:dry -- backups/<filename>.json
```

部署前检查：

```bash
npm run predeploy
```

重要提醒：

不要在 `npm run dev` 正在运行时执行 `npm run build`。Next dev server 和 build 都会写 `.next`，容易造成 CSS/JS chunk 404、ChunkLoadError、`.next` cache rename error。

如果需要 build：

```bash
# 先 Ctrl+C 停掉 dev server
rm -rf .next
npm run build
```

---

## 8. 环境变量

本地需要 `.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

可选开发 seed 变量：

```env
ADMIN_EMAIL=
ADMIN_PASSWORD=
STUDENT_EMAIL=
STUDENT_PASSWORD=
SESSION_SECRET=
SHOW_DEMO_CREDENTIALS=false
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

安全要求：

- `.env.local` 不要 commit。
- `SUPABASE_SERVICE_ROLE_KEY` 只能 server-side 使用。
- `SUPABASE_SERVICE_ROLE_KEY` 不能 import 到 client component。
- 不要把任何真实 key 写进代码。
- 不要把 key 发到公开聊天。
- Vercel production 必须配置 Supabase env，否则 production 会 fallback mock 或无法正确读写线上数据。

---

## 9. 题库内容规则：最高优先级

必须遵守：

- 不允许把整页 PDF 截图作为题目。
- 不允许把整题截图作为题目内容。
- 题干必须是文字 / Markdown / LaTeX。
- 选项必须是结构化 choices。
- 数学公式要用 LaTeX。
- 表格要用 Markdown table 或 HTML table。
- 只有必要 graph / diagram / coordinate plane / table image / figure 可以作为独立 image asset。
- 题目图片和 choice image 必须完整显示，不裁剪。

禁止 image path 包含：

- `mcq-page`
- `frq-page`
- `pdf-page`
- `full-page`
- `whole-page`
- `full-question`
- `question-screenshot`
- `page-screenshot`

这些规则已经写进 import/seed/predeploy/backup 检查里，不能绕过。  
如果 Codex 试图用整页 PDF screenshot 快速塞题，必须拒绝这条实现方向。

---

## 10. 重要文件地图

- `app/actions.ts`
  - Server actions 集中入口。
  - 登录、start exam、save answer、save progress、submit section、admin save、import 等都在这里。
  - 保存/提交动作必须保留 Supabase + mock fallback。

- `lib/data.ts`
  - 数据访问统一入口。
  - Supabase-first，缺少 Supabase env 时 fallback 到 mock store。
  - 包含 exam/question/submission/answer/review-guide 的核心读写逻辑。
  - 不要绕过它新建第二套 data access。

- `lib/types.ts`
  - 核心 TypeScript 类型。
  - Exam、ExamSection、Question、Submission、Answer、ReviewGuide 等。

- `lib/mock-store.ts`
  - `.mock-db.json` hydrate/persist。
  - 本地 fallback 用。

- `components/exam/TakeExamClient.tsx`
  - 学生作答页核心 client component。
  - 管理当前题号、responses、autosave、Save & Exit、End Section、current section UI。
  - 最近修过 `currentQuestion` undefined crash。

- `components/exam/AvailableExamsBrowser.tsx`
  - Available Exams 展示和筛选。
  - 按 subject -> course -> exam 分组。
  - 每套 exam 只有一个 Start / Resume。

- `components/exam/BreakScreenClient.tsx`
  - 10-minute break screen。
  - 支持 Save & Exit 和 Skip Break。

- `components/exam/ChoiceList.tsx`
  - MCQ choices 渲染。
  - Select Two 限制最多选 2 个。
  - choices text 使用 MathMarkdown。
  - choice image 使用 contain，不裁剪。

- `components/exam/QuestionImageAsset.tsx`
  - 题目图片统一渲染。
  - 保持完整显示，不使用 `object-cover` 裁剪。

- `components/MathMarkdown.tsx`
  - Markdown + LaTeX 统一 renderer。
  - questionText、choices、explanation、review guide 都应该走它。

- `components/admin/QuestionForm.tsx`
  - Admin 单题编辑表单。
  - 支持 choices/images/tags/status/preview。

- `app/admin/questions/page.tsx`
  - Admin 题库列表。
  - 支持筛选、分页、needs-review badge。

- `app/admin/questions/[id]/page.tsx`
  - Admin 单题编辑页。
  - Save Draft / Mark as Reviewed workflow。

- `app/results/[submissionId]/page.tsx`
  - Results 页面。
  - 按 section 汇总。
  - MCQ auto grading，FRQ manual grading pending。

- `scripts/seed-supabase-from-mock.cjs`
  - 从 `.mock-db.json` seed 到 Supabase。
  - upsert exams、sections、questions、images、exam_questions、review guides。
  - 不导入本地测试 attempts。

- `scripts/check-supabase-data.cjs`
  - 检查 Supabase 各表 count 和基本数据健康。

- `scripts/export-supabase-to-backup.cjs`
  - 从 Supabase 导出题库 backup JSON。
  - 不导出学生作答数据、attempts、secret、password。

- `scripts/restore-supabase-from-backup.cjs`
  - 当前只支持 dry-run。
  - 用于读取 backup 并显示将恢复的数据量。

- `supabase/migrations/004_production_data_layer.sql`
  - production data layer migration。
  - 添加 exam_sections、exam_attempts、section_progress、student_answers、frq_responses、admin_edits 等。

- `supabase/migrations/005_performance_indexes.sql`
  - 性能索引。
  - 覆盖 exams、exam_sections、exam_questions、questions、question_images、exam_attempts、section_progress、student_answers。

- `public/assets/questions/`
  - 结构化题库用到的必要图表/图片 assets。
  - Vercel 会随项目一起部署。
  - 不要放整页 PDF 或整题截图。

---

## 11. 已经修过的重要 bug / 决策记录

### 1. PDF screenshot rule

问题：

- 早期如果直接把 PDF page screenshot 放进题目，会破坏题库结构化目标。

最终方案：

- 不允许整页截图/整题截图。
- 只允许必要图表 assets。
- import/seed/predeploy/backup 都检查 forbidden screenshot path。

### 2. LaTeX rendering

问题：

- OCR 后数学内容可能变成普通文本，例如 `L0`、`t0`、`m/s2`。
- choices 之前可能直接渲染 raw string。

最终方案：

- 使用 `MathMarkdown`。
- questionText、choices、explanation、review guide 都走统一 renderer。
- KaTeX 负责 inline/block math。

### 3. 图片 cut off

问题：

- graph/diagram/choice image 曾经被 fixed height / `object-cover` 裁掉坐标轴、标签、箭头。

最终方案：

- 使用 `object-contain` / `max-w-full` / `h-auto`。
- 父容器不要用会裁剪内容的 fixed height + overflow hidden。

### 4. Login 状态 bug

问题：

- 登录后 navbar 还显示 Login。
- Start Practicing 错误跳 signup。

最终方案：

- 使用 server-side profile/session 判断。
- 登录后 Start Practicing 进入 dashboard/available exams。
- 未登录才跳 login/register。

### 5. Tailwind / CSS 404 / ChunkLoadError

问题：

- 页面变成浏览器默认 HTML 样式。
- dev server 跑着时 build 会覆盖 `.next` chunks。

最终方案：

- root layout 正确 import global CSS。
- 不要在 `npm run dev` 正在运行时执行 `npm run build`。
- 如果要 build，先停 dev server，再清 `.next`。

### 6. Save & Exit / Resume

问题：

- Save & Exit 早期不可靠。
- Resume 可能创建新 attempt 或丢 current question。

最终方案：

- 保存完整 exam session。
- 保存 current section progress。
- 保存 answers、markedForReview、currentQuestionIndex、timeSpent。
- Resume 回到同一个 attempt/current section/current question。

### 7. Select Two bug

问题：

- Select Two 题可以选超过两个。

最终方案：

- `selection_type: "multiple"`
- `required_selections: 2`
- `max_selections: 2`
- UI 最多选 2 个，可取消后换选。
- grading 用 unordered set。

### 8. Submit 0/0 / 1/99 bug

问题：

- Results 出现 `0/0` 或 `1/99`。
- 分母用了错误范围或混入整套/所有题。

最终方案：

- Results 按当前 exam section progress 汇总。
- Calculus MCQ total = x/45。
- Part A = x/30。
- Part B = x/15。
- FRQ = Manual grading pending。

### 9. Section flow bug

问题：

- 曾经把每个 Part 做成 Available Exams 中独立 Start。

最终方案：

- 一套 exam 一个 attempt。
- section 自动推进。
- break 只出现一次。
- Dashboard/History 只显示一条 exam attempt。

### 10. Supabase seed bug

问题：

- seed output 曾显示 exams/questions/sections 已导入，但 Supabase Dashboard 只有 profiles 有数据。

最终方案：

- 修复 `scripts/seed-supabase-from-mock.cjs`。
- 每张表 upsert 后检查 error 并打印实际结果。
- 修复后写入 exams、exam_sections、questions、question_images、exam_questions、review_guides。

### 11. Saving crash

问题：

- 考试页 saving 很久后崩溃。
- 报错：`TypeError: Cannot read properties of undefined (reading 'section')`
- 触发点在 `TakeExamClient.tsx` 里直接读取 `currentQuestion.section`。

最终方案：

- safe access：`currentQuestion?.section`
- clamp `currentQuestionIndex`
- empty/recoverable state
- client-side try/catch
- server action expected errors 返回 `{ error }`
- 保存/提交批量 upsert，避免逐题 await 卡住。

### 12. Performance optimization

问题：

- 切到 Supabase 后页面变慢。
- Available Exams / Dashboard 曾拉完整 questions。
- Take Exam 曾一次拉整套 exam。

最终方案：

- Available Exams 不再拉完整 questions/choices/explanations/images。
- Dashboard 只查 summary。
- Take Exam 只加载当前 section。
- Admin questions 分页。
- 添加 development timing log。
- 添加 `005_performance_indexes.sql`。

---

## 12. 当前已知问题 / 后续 TODO

建议后续按优先级继续做：

- 进一步优化 Supabase loading/saving。
- 添加 `editor` role，而不是只有 `admin` / `student`。
- GitHub Actions 自动跑 `test` / `lint` / `tsc`。
- 完整 FRQ grading/admin grading 页面。
- PDF -> JSON 自动导入 pipeline。
- Supabase Storage 图片上传和迁移。
- 更好的 Admin image manager。
- 更多 AP 科目。
- 自定义域名。
- 更正式的 user/auth flow。
- 数据导出/恢复 apply script。
- 线上 monitoring/error logging。
- 更完整的 E2E tests，覆盖 Start、Save & Exit、Resume、End Section、Break、Results、Admin Edit。

---

## 13. 开发注意事项

每次改代码前：

- 先 pull latest `main`。
- 看清当前是否有别人未合并的改动。
- 不要改业务无关文件。
- 不要重新导入 PDF，除非明确要求。
- 不要改题目正文，除非明确要求。

push main 前必须跑：

```bash
npm run test
npm run lint
npx tsc --noEmit
```

部署相关：

- `personal/main` 会自动触发 Vercel deploy。
- 不要 commit `.env.local`。
- 不要 commit `backups/`。
- 不要把 service role key 写进代码。
- 不要直接改 Supabase schema 而不写 migration。

题库相关：

- 不要重新 seed 覆盖线上已手动编辑过的题库。
- 线上题库以 Supabase 为准。
- 改 admin 保存逻辑前先运行 `npm run backup:supabase`。
- 改 import/seed/backup 时必须保留 forbidden screenshot path 检查。

考试流程相关：

- 改 exam flow 前先理解：
  - `exam_attempts`
  - `section_progress`
  - `student_answers`
  - `frq_responses`
  - `TakeExamClient`
  - `submitCurrentSection`
- 不要把 sections 重新做成独立 Start。
- 不要让 Results denominator 回到 0/0、1/99 这类错误。

---

## 14. 给朋友的最短上手流程

Checklist：

1. Clone repo。
2. `npm install`
3. 创建 `.env.local`
4. 填入 Supabase env
5. `npm run dev`
6. 打开 localhost
7. 用 `.env.local` 中配置的本地账号登录
8. 修改代码
9. `npm run test`
10. `npm run lint`
11. `npx tsc --noEmit`
12. `git add ...`
13. `git commit -m "..."`
14. `git push origin main`
15. `git push personal main`
16. 检查 Vercel deployment
17. 如果改了线上题库，运行 `npm run backup:supabase`

---

## 15. 给“朋友的 Codex”的提示

请另一个 Codex 先读：

1. `docs/DEVELOPMENT_LOG.md`
2. `README.md`
3. `lib/data.ts`
4. `components/exam/TakeExamClient.tsx`
5. `app/actions.ts`

请遵守：

- 不要重构无关代码。
- 不要改题目内容，除非用户明确要求。
- 不要改 exam section flow。
- 不要重新导入 PDF。
- 不要把题目变成截图。
- 不要把 service role key 暴露到 client。
- 不要创建第二套数据访问逻辑。
- 先搜索现有 data layer，再修改。
- 任何保存/submit/admin edit 的改动都必须保留 Supabase + mock fallback。
- 修改题库导入、seed、backup、predeploy 时必须保留 forbidden screenshot path 检查。
- 修改考试流程后必须真实验证：
  - Start
  - Save & Exit
  - Resume
  - End Section
  - Break
  - Results
- 修改后必须运行：

```bash
npm run test
npm run lint
npx tsc --noEmit
```

如果用户要求“只修 bug”，不要顺手做新功能。  
如果用户要求“只写文档”，不要改业务逻辑。  
如果用户要求“不要 build”，不要运行 `npm run build`。

---

## 16. 快速现状总结

当前项目已经是可部署、可登录、可考试、可 admin 编辑、可 Supabase 持久化、可 backup 的状态。

最不能乱改的三件事：

1. 结构化题库规则：不要用整页/整题截图。
2. Exam flow：一套 exam 一个 attempt，section 内部自动推进。
3. 数据层：Supabase production + mock fallback 都要保留。

继续开发时，优先保持稳定，再做功能扩展。

---

## 17. 2026-05-08 Codex Handoff Session

### Initial orientation

- Read the external handoff log supplied from WeChat and reconciled it with the repository copy at `docs/DEVELOPMENT_LOG.md`.
- Identified the active deployment repository as `sjfq/ap-website-vercel` and the organization backup/collaboration repository as `apresources27/ap-website`.
- Noted the release policy from the latest handoff message: debug and validate locally first, push to the personal/Vercel-connected repository first, verify the online deployment, and only then push to the organization repository as the one-step-behind backup.
- Inspected the local AP resources folder at `D:\Ethan\2025上中11\Summer AP Resources`; only `.env.local` was present at the time of inspection.
- Confirmed that `.env.local` contains Supabase variable names and non-empty values without recording the secret values in this log.
- Download fallback: direct network clone was not available in the Codex shell, but a local GitHub zipball was found at `C:\Users\ethan\Downloads\ap-website-vercel-main.zip` and extracted into the Codex workspace for development.

### Working constraints for this session

- Do not commit or disclose `.env.local`.
- Preserve the structured-question rule: no full-page or full-question screenshots as question content.
- Preserve the exam flow rule: one exam attempt per exam, with sections advancing inside the attempt.
- Preserve the data-layer rule: Supabase-first production behavior with mock fallback.
- Keep this development log updated after each meaningful setup, code, verification, or release step.

### Local development setup

- The machine has a Codex-bundled Node.js runtime, but `git`, `npm`, and `npx` were not available on the shell PATH.
- Extracted the WeChat `AP Website.zip` into a separate `friend-ap-website-full` workspace folder to recover local-only artifacts and installed dependencies.
- Linked `node_modules` from the full working copy into the clean GitHub archive so local verification commands can run without downloading packages.
- Copied `.mock-db.json` from the full working copy into the clean archive for mock fallback data.
- Copied the local Supabase `.env.local` from `D:\Ethan\2025上中11\Summer AP Resources` into the clean archive for local execution only. This file remains ignored and must not be committed.

### Verification fix

- Initial execution of `tests/run-import-tests.cjs` failed on Windows because the runner spawned TypeScript's extensionless `node_modules/typescript/bin/tsc` file directly.
- Updated the test runner to invoke TypeScript through `process.execPath`, making the import test command portable across Windows and Unix-like environments.
- After the runner fix, strict TypeScript checking reached the parser layer and exposed implicit callback parameter types in `lib/ap-question-format.ts`.
- Added local inferred Zod helper types for AP draft choices, images, and FRQ parts so the parser remains strict without weakening compiler settings.
- Broadened the validation helper input shape in `lib/schemas.ts` so the same `superRefine` validator is compatible with both base and extended question schemas while still validating parsed choices, answers, and image paths.
- Rehydrated incomplete local dependency folders (`@types/node/ts5.6` and `zod`) from the WeChat working-copy zip after the full extraction timed out.
- Verified `tests/run-import-tests.cjs` with the bundled Node runtime. Result: passed (`Import, rendering, and auth guard tests passed.`).
- Re-extracted the full `node_modules` tree from the WeChat working-copy zip with a longer timeout. Windows reported expected errors for Unix-style `.bin` shim files, but package contents were restored sufficiently for direct Node-based verification.
- Verified `next lint` through `node_modules/next/dist/bin/next`. Result: passed with no ESLint warnings or errors.
- Verified `tsc --noEmit` through `node_modules/typescript/bin/tsc`. Result: passed.

### UI polish pass

- Updated shared visual tokens in `tailwind.config.ts` toward a calmer Bluebook-inspired but Material-leaning palette: softer paper background, a less saturated brand blue, teal accents, and a restrained Material-style shadow.
- Added global component utility classes in `app/globals.css` for app surfaces, fields, primary buttons, secondary buttons, and chips. These keep controls consistent without introducing a new component library.
- Refined `components/layout/AppHeader.tsx` into a more app-like sticky header with a compact icon block, clearer product subtitle, and denser navigation styling.
- Reworked `app/page.tsx` from a marketing-heavy split into a practical first-screen workspace preview with current exam status, counters, and structured feature rows.
- Updated `app/dashboard/page.tsx` with a clearer workspace heading, a Browse Exams action, more neutral admin tooling, and calmer history/recommendation panels.
- Updated `components/exam/AvailableExamsBrowser.tsx` so the filter form is a single Material-style surface and exam cards are not nested inside an outer card shell.

### UI verification

- Re-ran `tests/run-import-tests.cjs`. Result: passed.
- Re-ran `next lint`. Result: passed with no ESLint warnings or errors.
- Re-ran `tsc --noEmit`. Result: passed.
- Ran `scripts/predeploy-check.cjs`. Result: passed with warnings that `.env.local` and `.mock-db.json` are local-only and that the script could not inspect running Next dev processes.
- Attempted to start `next dev` for browser inspection. It could not run inside the current sandbox because Next.js needed to create/download the Windows SWC cache under `C:\Users\ethan\AppData\Local\next-swc`; sandbox approval for that external write timed out twice. Browser visual QA is therefore still pending.
- Attempted to mirror this updated log back to the original WeChat `DEVELOPMENT_LOG.md`; sandbox approval for writing outside the workspace timed out twice. The repository copy has been updated successfully.

### 2026-05-08 Calc AB content and option UI pass

- Started a follow-up pass from the user handoff image requesting three checks: confirm AP Calculus AB 2019 uses only necessary images, replace placeholder answer explanations with real database explanations where possible, and remove the unsupported "cancel out" option effect from the exam UI.
- Located the supplied source PDF at `D:\xwechat_files\wxid_bdd83i6ke01g12_764f\msg\file\2026-05\AP Calc AB 2019.pdf`.
- Began auditing `.mock-db.json`, `components/exam/ChoiceList.tsx`, `components/exam/ResultQuestionReview.tsx`, and related tests for explanation placeholders and choice-elimination behavior.
- Confirmed the local `.mock-db.json` recovered from the WeChat working-copy zip is stale and only contains the older Physics fallback data. The AP Calculus AB 2019 question bank appears to be Supabase-resident production data, consistent with the previous handoff log.
- Tried to run `scripts/check-supabase-data.cjs`; sandboxed network access failed with `fetch failed`. Retried twice with a scoped Supabase network approval request, but approval timed out both times. Live database inspection/update is therefore blocked in this environment until network approval is available.
- Confirmed the supplied Calc AB PDF is scanned image content: normal PDF text extraction returned empty page text.
- Rendered PDF contact sheets for pages 60-103 by extracting embedded page images with `pypdf`; these pages include the multiple-choice explanation tables, FRQ scoring guidelines, scoring worksheet, and question descriptors.
- Added a local option-elimination/cancel-out UI to `ChoiceList` and `TakeExamClient`: students can mark a choice as eliminated with a slashed-circle control, eliminated choices render faded with strikethrough text, and the eliminated state is local-only and not submitted for grading.
- Added import-test assertions covering the new option-elimination control and ensuring eliminated choices are not included in submitted response snapshots.
- Added `scripts/update-calc-ab-2019-explanations.cjs`, a dry-run-first Supabase updater for AP Calculus AB 2019 explanations. It reads `data/calc-ab-2019-explanations.json`, matches questions by course/year/question number, updates only empty or placeholder explanations by default, warns on answer mismatches, and requires `--apply` before modifying Supabase rows.
- Added the package script `update:calc-explanations` for the updater.
- Added `data/calc-ab-2019-explanations.json` as a structured placeholder for original, concise explanations derived from the PDF answer/scoring pages. It is intentionally empty until the explanations can be transcribed/summarized without copying long copyrighted text verbatim.
- Verified the explanation updater exits safely when the explanation data file is empty.
- Re-ran `tests/run-import-tests.cjs`. Result: passed.
- Re-ran `next lint`. Result: passed with no ESLint warnings or errors.
- Re-ran `tsc --noEmit`. Result: passed.
- Re-ran `scripts/predeploy-check.cjs`. Result: passed with the expected local-only `.env.local` / `.mock-db.json` warnings and the existing running-process inspection warning.
- Attempted user-requested agent-mode browser testing. The normal Next.js localhost route remains blocked because the Windows SWC package is missing and Next.js needs approval to download/cache it under `AppData`; the scoped approval request timed out twice.
- Attempted the Codex in-app Browser plugin on a temporary static harness; the Node-backed browser runtime failed before executing any JavaScript with `failed to write kernel assets: system cannot find the path`.
- Attempted a Microsoft Edge headless + DevTools fallback against the same temporary harness; launching Edge required approval and timed out.
- Removed the temporary static harness after the browser-agent attempts. Current verification remains source/test based rather than visual browser based.
- User explicitly approved all three browser-enablement options: Next.js SWC download/cache, manual SWC package install, and Edge headless fallback.
- Retried the Next.js dev server with escalation twice after that approval; the approval reviewer still timed out both times.
- Retried `next dev` with `NEXT_SWC_PATH` pointed inside the workspace to avoid the external `AppData` cache write. This avoided the original `AppData` permission error, but Next.js still failed because `@next/swc-win32-x64-msvc` is not installed.
- Tried to manually download `@next/swc-win32-x64-msvc-14.2.35.tgz` from the npm registry. Sandboxed network access failed immediately, and the escalated download approval also timed out.
- Tried `curl.exe` as a final non-PowerShell network path; it also could not connect to `registry.npmjs.org`.
- Retried the temporary static harness and removed it afterward. Browser/agent testing remains blocked by the environment's approval/network/browser-runtime failures, not by project code.
- During manual PowerShell setup, confirmed that the copied `node_modules\next\dist\build\swc\index.js` expects `nextVersion = "14.2.33"` even though `package.json` declares `"next": "14.2.35"`. Corrected the manual npm-registry tarball guidance to use an encoded scoped package URL such as `https://registry.npmjs.org/@next%2fswc-win32-x64-msvc/-/swc-win32-x64-msvc-14.2.33.tgz`.

### 2026-05-10 AP Psychology study guide and current-site follow-up

- Started a new pass from the latest handoff screenshots. Current requirements are: improve the UI against the live `projectastra.uk` baseline, OCR or otherwise handle image-backed content where needed, add fuller AP Psychology explanations into the Study Guide area, split AP Psychology content by units, and preserve the release discipline of validating locally before pushing to the Vercel-connected personal repository.
- Confirmed the active repository map from this log: `sjfq/ap-website-vercel` is the personal/Vercel-connected repository, while `apresources27/ap-website` is the organization copy.
- Located the new source packet at `D:\xwechat_files\wxid_bdd83i6ke01g12_764f\msg\file\2026-05\AP Psychology Packet.md` and confirmed it is already a Markdown conversion with referenced media images.
- Attempted to refresh the current source from GitHub zip/API endpoints for both known repositories. Both returned GitHub `404 Not Found` from the unauthenticated shell, which is consistent with private repository access. Continued from the previously downloaded GitHub archive and live `projectastra.uk` output as the available baseline.
- Re-ran Supabase data inspection with the local `.env.local`. Network access now succeeds. Production currently contains 3 exams, 107 questions, 45 question images, and 1 review guide, so AP Psychology can be added as new review-guide rows without replacing existing guides.
- Added `scripts/build-ap-psych-review-guides.cjs`, which converts the supplied AP Psychology packet into seven published review-guide records: Unit 0 Scientific Foundations/Statistics, Units 1-5, and Exam/FRQ Strategy. The builder removes broken image links and replaces each image-dependent location with an accessible "Visual cue" explanation derived from the image alt/context.
- Generated `data/ap-psychology-review-guides.json` from the packet and wired it into local fallback data through `lib/mock-data.ts`.
- Added `scripts/upsert-ap-psych-review-guides.cjs`, a dry-run-first Supabase upsert script for publishing the AP Psychology study guides into the production `review_guides` table.
- Improved the Study Guide UI: refreshed guide cards, filter controls, unit chips, guide metadata, table of contents, callout styling, and renderer handling for Important/Common Mistake/Exam Tip/Visual cue blocks.
- Ran the AP Psychology upsert script in dry-run mode. It reported seven clean inserts and no existing-row replacements.
- Re-ran `tests/run-import-tests.cjs`, `next lint`, and `tsc --noEmit`. All passed before applying production review-guide changes.
- Applied `scripts/upsert-ap-psych-review-guides.cjs --apply` to Supabase. Seven AP Psychology guides were inserted. Re-ran `scripts/check-supabase-data.cjs`; production now reports 8 review guides total and the data check passed.
- Installed the Windows Next.js SWC package locally at `node_modules/@next/swc-win32-x64-msvc` so localhost can run on this Windows machine.
- Started local Next.js on `http://localhost:3000` using the bundled Node runtime. Verified locally that `/review` lists AP Psychology guides, `/review/ap-psych-unit-0-scientific-foundations-statistics` returns HTTP 200, and the guide page contains the generated Visual cue replacements.
- Took Edge headless screenshots for desktop and mobile review-guide pages. Fixed two polish issues found in screenshots: heading autolink wrappers were incorrectly styling headings like normal blue links, and mobile unit chips/header spacing could overflow. Rechecked screenshots after fixes.
- Checked the live `https://projectastra.uk/review` route after the Supabase insert. It still served the old single-guide output and the new AP Psychology slug returned 404, so the live deployment is not yet reflecting the newly inserted production data and/or is still on the older deployed code/env. Localhost with `.env.local` does reflect the Supabase rows correctly.
- Final verification after UI tweaks: `tests/run-import-tests.cjs` passed, `next lint` passed, `tsc --noEmit` passed, and `scripts/predeploy-check.cjs` passed with only expected local-env/mock-db warnings.
- Mirrored this repository development log back to the original WeChat-supplied `DEVELOPMENT_LOG.md` handoff file.
- Removed temporary Edge screenshot artifacts and added `tmp-*` to `.gitignore` so local dev-server logs/screenshots do not get picked up accidentally.

### 2026-05-10 Personal repository push preparation

- Created a fresh local clone of the Vercel-connected personal repository `sjfq/ap-website-vercel` instead of pushing from the older downloaded archive.
- Confirmed the fresh personal clone starts from `origin/main` at commit `948f7e7` (`fix Supabase auth login and registration`), preserving the newer auth/security work already present in the personal repository.
- Copied only the intended UI, review-guide, data, parser, test, and script changes from the working archive into the fresh personal clone. No auth or Supabase credential files were copied.
- During diff review, restored the personal repository's hardened local mock credential behavior in `lib/mock-data.ts` while keeping the new AP Psychology fallback guide import.
- Removed legacy example account values from this development log so the personal repository does not reintroduce public demo credentials in documentation.
- Restored the personal repository's auth/security import-test assertions, then kept the Windows TypeScript runner fix and the new option-elimination test coverage on top.
- Added this final push-preparation entry before validation, staging, commit, and push so the repository log records the release path as well as the code changes.
- Linked the existing tested `node_modules` directory into the fresh personal clone for local verification only; the dependency directory remains ignored and is not part of the commit.
- Re-ran verification from the fresh personal clone after the credential-behavior fix: `tests/run-import-tests.cjs` passed, `next lint` passed, `tsc --noEmit` passed, and `scripts/predeploy-check.cjs` passed with only expected local-only `.mock-db.json` and process-inspection warnings.
- Committed the implementation to the personal repository as `c2353ea` with message `add AP Psychology guides and review UI polish`.
- Pushed `main` to the personal repository. GitHub accepted the push from `https://github.com/sjfq/ap-website-vercel.git` and reported that the repository has moved to `https://github.com/changmax9/projectastra.git`.
- Updated the local `origin` remote URL to `https://github.com/changmax9/projectastra.git` after the move notice so subsequent personal-repository pushes use the current location directly.
- Rewrote the two Codex-created commits to use the requested GitHub author identity `Rule909 <3255073608@qq.com>` instead of the previous local identity. The implementation commit is now `c2353ea`; the first log-only push-record commit is now `5ed3a86`.

### 2026-05-16 Workspace storage relocation

- Checked local disk pressure before starting the PDF import pipeline work. `C:` had about 3 GB free, while `D:` had about 100 GB free.
- Moved the active `personal-ap-website-vercel` project directory to `D:\Codex\workspaces\projectastra\personal-ap-website-vercel` so future OCR/PDF render artifacts and local dependencies do not crowd the system drive.
- Created a Windows junction at the original path, `C:\Users\ethan\Documents\Codex\2026-05-08\files-mentioned-by-the-user-development\personal-ap-website-vercel`, pointing to the new `D:` location. Existing scripts, terminals, and handoff references using the old path should continue to work.
- Verified the relocated repository with `git status --short` through both the new `D:` path and the old junction path. Both resolved cleanly with no working-tree changes before this log entry.

### 2026-05-16 PDF import/OCR pipeline MVP

- Added the first durable PDF import pipeline layer: `pdf_import_jobs`, `pdf_import_pages`, `pdf_import_draft_questions`, and `pdf_import_draft_assets` in migration `008_pdf_import_pipeline.sql`.
- Extended TypeScript types, mock data, and `.mock-db.json` hydration/persistence support for PDF import jobs, extracted pages, draft questions, and candidate assets while preserving Supabase-first plus mock fallback behavior.
- Replaced the placeholder `lib/pdf.ts` implementation with a conservative analyzer that downloads/reads uploaded PDFs, extracts embedded text from basic PDF content streams, records page-level extraction status, flags scanned/image-only pages for OCR, and segments available text into draft MCQ/FRQ question blocks.
- Added an OCR provider abstraction with an explicit `unavailable-local-ocr` implementation. This deliberately records OCR-unavailable warnings instead of pretending scanned PDFs were parsed when local OCR/rendering is not configured.
- Added explicit safety behavior for answer keys and explanations: the analyzer only records answers/explanations/scoring notes when clear labels are present, otherwise it leaves them blank and creates review warnings.
- Added admin actions to start PDF analysis, save reviewed draft questions into the existing `questions` schema as `draft` plus `needs-admin-review`, and reject bad draft questions. Imported questions are not published directly.
- Updated `/admin/pdfs` with an Analyze PDF action and latest import review link, and added `/admin/pdf-imports/[jobId]` for page extraction summaries plus editable draft question review forms.
- Added import-test assertions that the PDF path has an analyzer, OCR abstraction, no invented answer keys, and no direct published status.
- Verified `node tests/run-import-tests.cjs`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/next/dist/bin/next lint`, and `node scripts/predeploy-check.cjs`. All passed; predeploy reported only the expected missing local `.mock-db.json` and running-process inspection warnings.
- Started local Next.js on `http://localhost:3000`. The Codex in-app Browser connection timed out twice before returning page state, so visual browser QA is still limited.
- Performed lightweight local HTTP checks against `/admin/pdfs` and `/admin/pdf-imports/test-missing-job`; both compiled successfully and redirected to `/login` as expected for unauthenticated admin routes.
- Tested the analyzer directly against local WeChat-supplied files in `D:\xwechat_files\wxid_bdd83i6ke01g12_764f\msg\file\2026-05`. The known AP Psychology source is `AP Psychology Packet.md`, a Markdown cram packet rather than a PDF; it is not a PDF question import candidate.
- Smoke-tested PDFs: `AP Calc AB 2019.pdf`, `practice exam 2012(1).pdf`, `practice exam 2016(1).pdf`, `AP Physics C Mechanics 2025 PE#1 SG.pdf`, and `AP Chem 2023.pdf`.
- Findings: the Calc PDF is fully scanned/image-backed and correctly produced 103 OCR-needed pages with zero draft questions; the 2016 practice PDF also produced OCR-needed pages only; several College Board PDFs contain embedded text with custom font/control-code artifacts, so naive text extraction is not reliable enough for publishing-quality drafts.
- Tightened import safety based on the smoke tests: low-quality embedded text is now flagged for OCR instead of being used, rejected page text is no longer fed into segmentation, missing question-boundary detection no longer creates a giant fallback draft, and oversized image streams no longer crash the analyzer.

### 2026-05-16 Local Tesseract OCR integration

- Installed local OCR tooling for development testing: Tesseract 5.4 via `winget` at `C:\Program Files\Tesseract-OCR\tesseract.exe`, and Python packages `pymupdf`/`pytesseract` under `D:\Codex\tools\pdf-ocr-python`.
- Added `scripts/pdf-ocr-worker.py`, which uses PyMuPDF to render selected PDF pages to ignored `public/uploads/pdf-import-pages/...` PNG files and Tesseract to return OCR text, page image URLs, and confidence scores.
- Wired the PDF analyzer to use the local Tesseract worker when pages have no usable embedded text or have rejected garbled text. If Tesseract or Python is unavailable, the analyzer still falls back to explicit OCR-unavailable warnings.
- Added `PDF_OCR_MAX_PAGES` as a safety limit for local/server-action OCR runs. Default is 12 pages; set `PDF_OCR_MAX_PAGES=0` only for long-running/offline full-PDF imports.
- Tested `AP Calc AB 2019.pdf` with `PDF_OCR_MAX_PAGES=3`: Tesseract rendered/OCRed 3 pages, saved page images, and returned readable OCR text with about 94% confidence on page 1.
- Retested `AP Calc AB 2019.pdf` with `PDF_OCR_MAX_PAGES=10`: Tesseract completed 10 OCR pages and produced 9 draft MCQ blocks from early MCQ pages. Drafts still require admin cleanup because math notation, diagrams, and some question boundaries are imperfect.
- Improved the OCR worker to preserve line breaks from Tesseract block/paragraph/line metadata, which materially improved question segmentation on scanned AP pages.
- Re-ran validation after the OCR integration: `node tests/run-import-tests.cjs`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/next/dist/bin/next lint`, and `node scripts/predeploy-check.cjs` all passed. Predeploy only reported expected local `.mock-db.json` and running-process inspection warnings.

### 2026-05-19 GitHub-current OCR merge

- Fetched `https://github.com/changmax9/projectastra.git` and fast-forwarded local `main` from `3bec729` to current `origin/main` at `5ee8a6f`, preserving the newer GitHub UI, account settings, CI, auth confirmation, and answer-choice eliminator changes.
- Reapplied only the PDF import/OCR pipeline work on top of the current GitHub code: Tesseract-backed PDF page OCR, page extraction records, draft question segmentation, admin review queue, draft-only saving, and mock/Supabase data support.
- Renumbered the PDF import migration from the original local `006_pdf_import_pipeline.sql` to `008_pdf_import_pipeline.sql` because GitHub current already contains `006_profile_settings.sql` and `007_answer_eliminator_state.sql`.
- Kept imported PDF questions behind admin review; the save action still creates draft questions with `needs-admin-review` metadata and does not publish generated content directly.

### 2026-05-19 Supabase OCR setup guard

- Connected the local app to Supabase through `.env.local` and confirmed existing production data can be read without changing Supabase.
- Found that the admin PDF page can crash in Supabase mode when the PDF import tables are not present in the remote schema cache.
- Added a read-only PDF import schema status check and graceful admin UI warning. `/admin/pdfs` now loads existing PDF uploads even when `pdf_import_jobs` is missing, and `Analyze PDF` is disabled until `supabase/migrations/008_pdf_import_pipeline.sql` is applied.
- Left Supabase unchanged per instruction; no migrations, seed scripts, or write operations were run.

### 2026-05-21 PDF import fault-finding pass

- Ran this pass explicitly as adversarial testing, not as proof that the OCR/import feature is accurate. No Supabase data was changed, no imported questions were saved or published, and no secrets were printed or committed.
- Initial `git status --short --branch` showed existing dirty PDF-pipeline work in `.gitignore`, `app/actions.ts`, `app/admin/pdfs/page.tsx`, `docs/DEVELOPMENT_LOG.md`, `lib/data.ts`, `lib/mock-data.ts`, `lib/mock-store.ts`, `lib/pdf.ts`, `lib/types.ts`, `tests/run-import-tests.cjs`, plus untracked `app/admin/pdf-imports/`, `components/admin/PdfDraftQuestionReview.tsx`, `scripts/pdf-ocr-worker.py`, and `supabase/migrations/008_pdf_import_pipeline.sql`.
- Required checks: the literal `node tests/run-import-tests.cjs` failed before execution because the Codex app `node.exe` on PATH returned Windows `Access is denied`. Re-ran with the bundled runtime at `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`: `tests/run-import-tests.cjs` passed, `node_modules/typescript/bin/tsc --noEmit` passed, `node_modules/next/dist/bin/next lint` passed, and `scripts/predeploy-check.cjs` passed with only local `.env.local`, `.mock-db.json`, and running-process inspection warnings.
- Environment checks: `.env.local` is present and has Supabase keys, without printing values. Direct Node execution has no Supabase env until `.env.local` is loaded. After loading `.env.local`, `getPdfImportSchemaStatus()` reported PDF import tables available. The previous missing-table guard could not be re-created without altering Supabase, so it was left unmodified. Local OCR tooling exists at `C:\Program Files\Tesseract-OCR\tesseract.exe`, `D:\Anaconda\python.exe`, and `D:\Codex\tools\pdf-ocr-python`.
- Created ignored local artifacts under `tmp-pdf-import-fault-finding-20260521/`: synthetic PDFs in `tmp-pdf-import-fault-finding-20260521/pdfs/`, a compiled probe harness in `tmp-pdf-import-fault-finding-20260521/build/`, and detailed results in `tmp-pdf-import-fault-finding-20260521/probe-report.json`. Local OCR page renders were written under ignored `public/uploads/pdf-import-pages/...`; copyrighted AP output was kept local and not published.
- Strong behavior observed: imported drafts remain behind the admin queue and save as `draft` plus `needs-admin-review`; missing answer keys are usually left blank with warnings; scanned AP Calc AB 2019 with `PDF_OCR_MAX_PAGES=2` produced 103 pages, OCRed only the first 2 pages, and created zero drafts rather than pretending the full scan was usable.
- P1 flaw: embedded-text segmentation collapses line breaks and then requires newline-bound question starts. Multi-question text pages commonly become one merged draft. Clean synthetic MCQ pages, answer-key-at-end pages, and split-across-page probes all merged question 2 into question 1, producing duplicate A/B/C/D choices and corrupted D choices.
- P1 flaw: OCR-scanned MCQs are often misclassified as FRQ when Tesseract drops punctuation or reads labels as `A`, `©`, or `1D`. The scanned synthetic PDF produced a draft with `type=frq`, zero choices, low OCR text quality, and no strong warning that an MCQ choice parse failed.
- P1 flaw: OCR confidence is not used to gate draft confidence. A garbled embedded-text probe was correctly sent to OCR, but Tesseract returned unreadable text with 44.29 OCR confidence; the generated MCQ draft still showed 0.65 draft confidence because four choice markers were present.
- P1 flaw: answer-key and explanation pages are not detected as separate non-question material. An answer-key-at-end probe was swallowed into the preceding MCQ choice text, did not attach explicit answers, and still produced a `needs_review` draft.
- P1 flaw: visual references are only warned about. Table/graph prompts produced no `question_images` or draft assets, no cropped diagram/table candidate, and no side-by-side source view for the admin. This can leave answerable visual questions saved without the needed visual evidence.
- P2 flaw: page counting is regex-based over raw PDF bytes. A one-page PDF containing the literal text `/Type /Page` was reported as 2 pages, requested OCR for a non-existent page 2, and marked the draft as pages 1-2.
- P2 flaw: `PDF_OCR_MAX_PAGES=1` marks unprocessed pages as `ocr_status=unavailable` with "Local OCR/rendering is not configured" even though OCR is configured and deliberately page-limited. `PDF_OCR_MAX_PAGES=not-a-number` silently processed all pages instead of failing closed or warning.
- P2 flaw: explicit invalid `PDF_OCR_PYTHON` and `TESSERACT_CMD` values are silently ignored when default local paths exist. The run with both paths set to `Z:\missing-*` still used `tesseract-local`, which makes misconfiguration hard to diagnose.
- P2 flaw: select-two questions extract `correct_answer=A,C` but no draft metadata exists for `selection_type`, `required_selections`, or `max_selections`, and the answer label remains appended to the last choice text.
- P2 flaw: FRQ scoring notes are extracted into `scoring_notes`, but the admin review form does not expose a scoring-notes field when saving the draft to a real question. Roman subparts `(i)` and `(ii)` remain embedded inside part `(b)` rather than becoming separate structured parts.
- P2 flaw: the admin review UI has audit gaps: page cards show only a short text clamp, not per-page OCR confidence/warnings in a prominent way; draft cards do not show extraction method/provider per draft; source page images are not shown next to the draft; the explanation textarea defaults to "Add an explanation during admin review.", which can become placeholder content if saved unchanged.
- P3/product gap: malformed non-PDF content renamed `.pdf` is accepted far enough to invoke the OCR worker and only then fails. Upload validation still relies mostly on MIME type and parser failure instead of magic-byte/PDF-structure validation at upload time.
- Recommended next fixes by impact: preserve line/position data for embedded text and segment by page/block geometry; validate unique ordered choice labels and split answer/explanation/key sections before choice extraction; gate draft confidence on OCR confidence plus parsed structure; create explicit visual/table/diagram asset candidates and source previews; harden page counting with a real PDF parser; make OCR config fail closed when explicit paths are invalid; add selection metadata and scoring-notes editing to the PDF draft model/UI; add regression tests using the local synthetic probes rather than only source-string assertions.

### 2026-05-22 PDF import fault-finding continuation

- Continued the same adversarial pass. Re-ran `git status --short --branch` first and preserved the existing dirty/untracked work. Re-read the latest development-log tail before probing further.
- Added ignored local probes under `tmp-pdf-import-fault-finding-20260521/`: `probe-mock-save.cjs`, `mock-save-report.json`, `probe-real-pdf-summaries.cjs`, and `real-pdf-summary-report.json`. These are local/ignored artifacts only.
- Mock fallback save probe command: `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-mock-save.cjs`. The probe used a temporary cwd at `tmp-pdf-import-fault-finding-20260521/mock-fallback-cwd` so the repository `.mock-db.json` was not modified.
- P1/P2 mock mismatch: `savePdfImportAnalysis` in mock mode allows a job with `pdf_upload_id="missing-upload-id"` and returns job details with `pdf_upload=null`; Supabase would reject this through the foreign key. This can hide production-only failures during local fallback testing.
- P2 mock/admin save bug: updating a missing draft id returns no error. A bogus `updatePdfImportDraftStatus("missing-draft-id", "saved", ...)` was a silent no-op. In Supabase, a plain `.update().eq()` without row-count checking has the same risk pattern, so an admin action could report success after creating a question even if the PDF draft row was not actually marked saved.
- P1/P2 draft-to-question bug: a simulated select-two PDF draft saved through the same data path became a draft question with `selection_type="single"`, `required_selections=1`, `max_selections=1`, while `correct_answer="A,C"` and the last choice text still contained `Answer: A, C`. This is structurally inconsistent and would grade/display incorrectly if later reviewed/published without manual repair.
- P2 draft-to-question data-loss bug: `scoring_notes` exist on PDF import drafts but are not part of the saved `questions` schema and are not exposed by the PDF draft save form, so scoring-guide evidence is lost during save.
- P2 asset mismatch: a draft asset with an out-of-range `draft_question_index` was silently saved as an orphan asset with `draft_question_id=null`, even when `keep_for_question=true`.
- P2 product-safety issue: the saved question accepted the placeholder explanation text `Add an explanation during admin review.` as a normal explanation. This can leak placeholder instructional text into reviewed content if an admin misses it.
- Real-PDF summary probe command: `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs`. The first batch runner hung for several minutes and was stopped with `Stop-Process`; the replacement runner isolates each PDF in a child process with a 45-second timeout and omits extracted question text from the report.
- Real-PDF latency finding: `2022 AP CHEM MCQ+FRQ KEY.pdf` and `sg-2024-chemistry.pdf` each hit the 45-second per-file timeout even with `PDF_OCR_MAX_PAGES=2`. The current admin action runs synchronously, so one difficult PDF can tie up the request path long enough to feel broken or fail at the platform boundary.
- Real-PDF classification finding: `AP Chem 2023.pdf` produced 4 drafts from 93 pages, but one draft spanned pages 15-30 with 60 choices and another spanned pages 31-93 as one FRQ. `qp-2024-chemistry.pdf` produced 24 drafts from 100 pages, with choice counts up to 24 and every draft carrying a visual-reference warning. Draft creation is therefore not a quality signal.
- Real-PDF extraction accounting bug: `AP Chem 2023.pdf` had `pageMethodCounts={ text: 35, ocr: 2, none: 56 }`, but the probe counted text on all 93 pages because rejected/ignored embedded text remains in `text_extracted`. `savePdfImportAnalysis` uses `(text_extracted || ocr_text)` for `extracted_page_count`, so stored job metrics can overstate usable extraction.
- Real-PDF false-rejection/product issue: several answerable FRQ/scoring PDFs produced zero drafts despite readable pages, including `ap25-frq-chemistry.pdf`, `AP Physics C Mechanics 2025 PE#1 SG.pdf`, `practice exam 2012(1).pdf`, and `2024 Scoring Guidelines - AP Macroeconomics_ Set 1.pdf`. This is partly expected for scoring guides, but the admin-facing failure message does not distinguish "not a question packet" from "parser could not segment readable content."
- Real-PDF page-state wording issue: page-limited OCR still marks unprocessed pages as `unavailable`, reusing the "Local OCR/rendering is not configured" wording even when OCR is configured and intentionally capped.
- Re-ran `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` after adding ignored probes; it passed.

### 2026-05-22 PDF import fault-fix implementation pass

- Continued after the fault-finding reports with the user's explicit instruction to work through `TODO.md`. Re-ran `git status --short --branch` first, re-read this development log before editing, preserved the existing dirty/untracked PDF-pipeline work, did not stage/commit/push, did not change Supabase data, and did not publish imported questions.
- Created `TODO.md` because the user explicitly requested continuing and generating TODOs. No separate train log file existed in the repository, so the requested train-style notes are recorded in the `TODO.md` Train Log section.
- Analyzer safety fixes: PDF uploads now fail before OCR when the bytes do not start with a PDF header; page counting strips stream contents before counting `/Type /Page`; embedded text extraction preserves line breaks better; answer/explanation/scoring labels are split before choice extraction; answer-key-like pages are excluded from segmentation; unusable OCR text is stored for audit but not drafted; invalid explicit OCR paths fail closed; invalid `PDF_OCR_MAX_PAGES` warns and uses the default; page-limited OCR pages are marked `ocr_status=pending` with page-limit wording.
- Added an analyzer-level `PDF_OCR_TIMEOUT_MS` guard for the local OCR worker and tightened embedded-text latency by skipping image/binary streams and only parsing streams that contain PDF text operators. This removed the observed 45-second real-PDF probe timeouts for `2022 AP CHEM MCQ+FRQ KEY.pdf` and `sg-2024-chemistry.pdf`; both now complete in about two seconds in the local summary probe.
- Draft quality fixes: severe merged/corrupted choice patterns now lower draft confidence further and add an explicit "split or repair before saving" warning. The remaining `qp-2024-chemistry.pdf` issue is now visible: the probe still finds merged drafts with up to 25 choices, but average draft confidence dropped to 0.39 and the affected drafts are clearly warned.
- Admin review/save fixes: the PDF draft form now submits `selection_type`, `required_selections`, and `max_selections`; inferred select-two drafts are tagged `multi-select`/`select-two`; the previous placeholder explanation default was removed; source scoring notes are carried into the reviewed explanation field with a source label; and the review screen shows source pages with extraction method, OCR status, confidence, warnings, extracted text, and OCR-rendered page images when available.
- Data-layer parity fixes: mock `savePdfImportAnalysis` now rejects missing `pdf_upload_id`; out-of-range draft asset links throw instead of becoming kept orphan assets; missing draft-status updates throw in both mock and Supabase paths; and `extracted_page_count` counts only accepted text/OCR pages rather than rejected embedded text.
- Regression commands run after the fixes:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\next\dist\bin\next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with only the expected `.env.local`, `.mock-db.json`, and running-process inspection warnings.
- Adversarial probe commands run after the fixes:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-mock-save.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/mock-save-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.
- Representative probe outcomes after fixes: clean text MCQ, answer-key-at-end, split-across-pages, choice-label variants, malformed renamed PDF, invalid OCR config, invalid `PDF_OCR_MAX_PAGES`, page-limit OCR, and mock save parity all exercised the safer paths. `AP Calc AB 2019.pdf` with `PDF_OCR_MAX_PAGES=2` still correctly failed instead of pretending to import the 103-page scanned packet. `2022 AP CHEM MCQ+FRQ KEY.pdf` no longer timed out, but with the page limit it produced zero drafts and explicit OCR-limit/no-draft warnings.
- Browser smoke: started Next dev on `http://127.0.0.1:3017`; the first in-app browser navigation to `/admin/pdf-imports/not-real-job` timed out while Next compiled the dynamic route, but the server compiled it and redirected to `/login`. A warm browser navigation to `/admin/pdfs` redirected to `/login` and rendered the login form. The local dev process listening on port 3017 was stopped afterward.
- Remaining honest weaknesses moved into the new TODO section: geometry-aware segmentation for multi-column/page-spanning questions, cropped visual asset detection, answer-key association with source citations, scoring-guide/FRQ classification, async import job progress, authenticated admin E2E coverage, confidence-unit normalization, and fixture-based regression tests.

### 2026-05-23 PDF import same-page OCR workspace pass

- Implemented the planned same-page PDF import workflow without staging, committing, publishing generated questions, or changing Supabase data. Existing dirty/untracked PDF-pipeline work was preserved and extended.
- `/admin/pdfs` now selects an import job inline and renders a same-page import workspace with processing status, page/OCR progress counters, warnings, page audit, and generated draft review cards. The existing `/admin/pdf-imports/[jobId]` route remains available as a fallback/deep link.
- `adminStartPdfImportAction` now creates a `processing` import job and redirects back to `/admin/pdfs?job_id=...` instead of synchronously OCRing the PDF inside the form submit.
- Added a protected processing route at `/api/admin/pdf-imports/[jobId]/process`. The same-page workspace polls this route; the route runs OCR/text analysis, writes pages/drafts/assets into the queued job, updates job status, and returns refreshed job details. This is async from the page UX perspective, but true page-by-page resumable chunking is still pending.
- Added data-layer helpers for queued imports: `createPdfImportJob` and `completePdfImportJob`, with mock and Supabase paths. Mock fallback still validates missing uploads, missing draft updates, and invalid asset links.
- Added `scripts/pdf-text-worker.py`, a PyMuPDF block extractor that prefers page geometry/reading order over raw PDF content-stream order. `lib/pdf.ts` now uses that structured text before falling back to the stream parser. Page `raw_blocks` are preserved for admin audit.
- Added initial product-safety classification: FRQ-named packets are kept as FRQ drafts instead of being converted to fake MCQs from incidental A/B/C text; scoring-guide/sample-response-like PDFs suppress draft generation to avoid importing rubrics as questions.
- Added visual-reference candidate assets when OCR-rendered source page images exist. This is still incomplete for text PDFs because text-PDF pages are not rendered solely for visual preview/cropping yet.
- Fault probe changes after the pass:
  - `qp-2024-chemistry.pdf` improved from the previous max merged choice count of 25 to max 8 in the summary probe, but it still over-generates 73 drafts and needs stronger section/header filtering.
  - `ap25-frq-chemistry.pdf` now produces FRQ drafts only in the real-PDF summary probe instead of mixed fake MCQ/FRQ drafts.
  - `AP Physics C Mechanics 2025 PE#1 SG.pdf`, `ap25-sg-chemistry.pdf`, `sg-2024-chemistry.pdf`, and `2024 Scoring Guidelines - AP Macroeconomics_ Set 1.pdf` fail closed with zero drafts rather than accepting scoring-guide content as questions.
  - `AP Chem 2023.pdf` still over-generates 134 drafts from 93 pages. Draft creation remains a review signal, not an accuracy signal.
- Commands run:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with only expected local `.env.local`, `.mock-db.json`, and running-process inspection warnings.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-mock-save.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/mock-save-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.
- Browser smoke: started Next dev on `http://127.0.0.1:3021`; first browser navigation to `/admin/pdfs` timed out while the route compiled, then the server compiled `/admin/pdfs`, redirected unauthenticated access to `/login`, and rendered the login form on a warm retry. The dev server process listening on port 3021 was stopped.
- Remaining highest-impact work: true page-chunk resumability, authenticated seeded admin E2E for the same-page workspace, text-PDF rendered source previews/crops, content-based scoring-guide detection, answer-key association with citations, and stronger filtering of headers/contents/scoring pages to reduce over-generation.

### 2026-05-24 PDF import visual-evidence UX pass

- Continued improving the admin PDF OCR/import experience after the same-page workspace commit. Re-ran `git status --short --branch` first, re-read this development log and `TODO.md`, preserved local ignored probe artifacts, did not change Supabase data, and did not publish imported questions.
- Added a render-only source-page preview path to the local PDF worker. Text-based PDFs that already have usable embedded/PyMuPDF text can now still render source page images for drafts that mention figures, diagrams, graphs, tables, charts, or "shown below"; this avoids the previous gap where visual references in text PDFs had no page image because OCR was not needed.
- Added `PDF_RENDER_MAX_PAGES` as a separate preview-rendering cap. Invalid values warn and fall back to the default. Render previews reuse the existing local Python/PyMuPDF path and do not require Tesseract.
- Updated draft review cards to accept per-draft candidate assets and show a separate "Candidate visual evidence" panel. These page previews are explicitly marked "Not saved automatically"; the saved question image JSON remains admin-controlled so full-page images are not silently preserved as question images.
- Fault check: after rebuilding the local probe harness, `table-diagram` now reports `pageImageUrl=/uploads/pdf-import-pages/probe-table-diagram-visual-.../page-001.png` while the generated draft still has `questionImages=[]`. This improves auditability without pretending crop/diagram extraction is solved.
- Regression and fault-check commands run:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with only expected local `.env.local`, `.mock-db.json`, and running-process inspection warnings.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.
- Real-PDF fault check remained honest: no timeouts were observed, scoring-guide-like PDFs still failed closed with zero drafts, `ap25-frq-chemistry.pdf` stayed FRQ-only, but `AP Chem 2023.pdf` still over-generated 134 drafts and `qp-2024-chemistry.pdf` still over-generated 73 drafts. Draft count is still not an accuracy signal.
- Browser smoke: started Next dev on `http://127.0.0.1:3022`; first navigation to `/admin/pdfs` timed out during compile, warm retry redirected unauthenticated access to `/login` with title `AP Mock Exam Platform`. The dev server process listening on port 3022 was stopped afterward.
- Remaining highest-impact work: true chunk-by-page resumability/progress, precise visual/table crop proposals, authenticated seeded admin E2E, answer-key association with citations, content-based scoring-guide detection, and stronger filtering to reduce real-PDF over-generation.

### 2026-05-24 PDF import TODO cleanup and confidence normalization

- Continued from the active PDF import TODOs. Re-ran `git status --short --branch` first, re-read this development log and `TODO.md`, preserved the existing dirty visual-evidence work, did not change Supabase data, and did not publish imported questions.
- Cleared implemented items out of `TODO.md`; the file now keeps active PDF import goals only, with completed command/history details retained in this development log.
- Normalized OCR/page confidence values before storage/display. Tesseract worker output can still arrive as percent-style values, but `lib/pdf.ts` now converts finite confidence values into `0..1` and clamps them. The review UI now displays confidence directly from normalized values instead of compensating for mixed units.
- Fault check: rebuilt and re-ran the synthetic probe harness. OCR cases now have `maxConfidence=0.9404`; the garbled embedded-text/OCR case reports confidence `0.4429` instead of `44.29`, and it still fails closed with zero drafts.
- Regression and fault-check commands run:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with only expected local `.env.local`, `.mock-db.json`, and running-process inspection warnings.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.
- Real-PDF fault check remains honest: no timeouts were observed, scoring-guide-like PDFs still failed closed with zero drafts, but `AP Chem 2023.pdf` still over-generated 134 drafts and `qp-2024-chemistry.pdf` still over-generated 73 drafts. The next high-impact parser work is still segmentation/filtering, not claiming higher OCR accuracy.

### 2026-05-24 PDF import section-aware segmentation pass

- Continued the active segmentation/filtering TODO. Re-ran `git status --short --branch` first, re-read this development log and `TODO.md`, preserved existing dirty PDF-import work, did not change Supabase data, and did not publish imported questions.
- Added section-aware segmentation context in `lib/pdf.ts`: table-of-contents pages are excluded from segmentation; answer/scoring sections are excluded from segmentation; MCQ and FRQ sections are tracked across pages; page-marker attribution now uses the nearest preceding page marker instead of falling back to page 1 for same-page follow-up questions.
- Tightened candidate filtering: MCQ-section blocks must parse at least two choices; FRQ-section blocks must look like a real FRQ prompt instead of a lone subpart marker; out-of-sequence FRQ-like starts are filtered to reduce false starts caused by formulas such as a chemical formula ending in `6.`.
- Fault-finding result: `AP Chem 2023.pdf` improved from 134 drafts to 67 drafts, with 60 MCQ and 7 FRQ. This removes the answer/scoring-guide duplicate half of the packet and fixes page attribution.
- Fault-finding result: `qp-2024-chemistry.pdf` improved from 73 drafts to 64 drafts, with 57 MCQ and 7 FRQ. This removes false FRQ starts but now under-extracts several MCQs, so it is safer but not complete. Draft count remains a review signal, not an accuracy claim.
- Synthetic probe regression check still passes the intended paths: clean text, answer-key-at-end, choice-label variants, select-two, table/diagram, split-across-pages, scanned OCR, mixed text/scanned, invalid OCR config, malformed PDF, and page-limit scenarios all exercised expected safer outcomes.
- Commands run:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with only expected local `.env.local`, `.mock-db.json`, and running-process inspection warnings.
- Remaining segmentation work: recover missing/noisy MCQs in `qp-2024-chemistry.pdf`, add fixture-based regression checks that assert real parser outputs instead of only source strings, and eventually move from whole-text regex starts toward block/span-aware candidate generation.

### 2026-05-24 PDF import explicit answer-key association pass

- Continued to the next active TODO after segmentation/filtering. Re-ran `git status --short --branch` first, re-read this development log and `TODO.md`, preserved existing dirty PDF-import work, did not change Supabase data, and did not publish imported questions.
- Added conservative explicit answer-key association in `lib/pdf.ts`. The analyzer now parses pages that already look like answer keys, extracts numbered answer labels, and attaches them only to MCQ drafts with matching question numbers and matching parsed choice labels.
- Safety behavior: conflicting answer-key entries are refused; answer entries that do not match parsed choices are refused; answers are not inferred from explanations, scoring notes, or rubrics. Draft warnings cite the source answer-key page, and job warnings report how many MCQ drafts were matched.
- Synthetic fault check: `answer-key-at-end` now attaches cited answers to its two MCQ drafts from source page 2 and removes the previous "No explicit answer key" warning from those drafts.
- Real-PDF fault check: `practice exam 2016(1).pdf` matched 55 explicit MCQ answers. `AP Chem 2023.pdf` and `qp-2024-chemistry.pdf` attached zero answers, which is the desired conservative behavior because their later pages are scoring/question material rather than a clean answer-key page.
- Commands run:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with only expected local `.env.local`, `.mock-db.json`, and running-process inspection warnings.
- Remaining answer-source work: explanation/rationale association still needs source citations and conflict handling. Answer-key association should remain conservative and review-first.

### 2026-05-24 Supabase/admin account health pass

- Re-ran `git status --short --branch` first, re-read this development log and `TODO.md`, preserved existing dirty PDF-import work, did not stage/commit/push, and did not write to Supabase.
- Confirmed the local environment is connected to Supabase using the existing `.env.local` keys. No database mutations, seed scripts, migrations, or auth writes were run.
- Added an admin-account health helper in `lib/data.ts` and surfaced it on the admin dashboard. The dashboard now reports whether it is using Supabase or mock fallback, admin/student profile counts, Auth user count, seed-admin env configuration, admin emails, and account/profile mismatch warnings.
- Read-only Supabase probe result: `profiles=5`, `adminProfileCount=1`, `studentProfileCount=4`, `authUserCount=5`, `adminProfilesMissingAuthCount=0`, and `authUsersMissingProfileCount=0`.
- Environment/setup gap: `ADMIN_EMAIL` and `STUDENT_EMAIL` are not configured locally, so seed-account checks cannot confirm the intended named admin/student accounts.
- Existing data issue found by the read-only Supabase data check: `scripts/check-supabase-data.cjs` connected and counted live tables, then exited 1 because expected seeded exam `20000000-0000-4000-8000-000000000001` is missing. This is a seed/data consistency issue, not a Supabase connectivity failure.
- Commands run:
  - `git status --short --branch` showed existing dirty PDF/admin work plus the new admin-account files.
  - `Get-Content -Path docs/DEVELOPMENT_LOG.md -Tail 80` and `Get-Content -Path TODO.md -Tail 120` were read before continuing.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/check-supabase-data.cjs` connected read-only, printed table counts, and failed only on the missing expected seeded exam noted above.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with only expected local `.env.local`, `.mock-db.json`, and running-process inspection warnings.

### 2026-05-24 PDF import content-based scoring/rubric classifier pass

- Continued the unfinished PDF import TODOs. Re-ran `git status --short --branch` first, re-read this development log and `TODO.md`, preserved existing dirty PDF/admin work, did not stage/commit/push, did not change Supabase data, and did not publish imported questions.
- Added content-based scoring/rubric/sample-response classification in `lib/pdf.ts`. The analyzer now scores page text for rubric, scoring guideline, sample response, commentary, point-awarding, and acceptable-response signals instead of relying only on filenames.
- Added page-level fail-closed behavior for scoring-only pages. Pages that look like scoring/rubric/sample-response material and do not contain a real question prompt are excluded from segmentation with admin-visible page warnings.
- Added document-level suppression when the available text is mostly scoring/rubric/sample-response/commentary material. This prevents neutral-filename scoring packets from producing review drafts just because the filename does not include `sg` or `scoring`.
- Added a neutral-filename local probe (`synthetic-neutral-packet.pdf`) to the ignored fault harness. It now fails closed with zero drafts and explicit content-based suppression warnings.
- Fault check results stayed stable for ordinary question packets: `AP Chem 2023.pdf` remained 67 drafts (60 MCQ, 7 FRQ), `qp-2024-chemistry.pdf` remained 64 drafts (57 MCQ, 7 FRQ), and `ap25-frq-chemistry.pdf` remained 3 FRQ drafts. This improves warnings/exclusions without claiming OCR accuracy improved.
- New warnings are intentionally conservative. `AP Chem 2023.pdf` now reports excluded scoring/rubric-only pages and scoring/rubric signals while still producing drafts for the question sections; admins still need to verify every generated draft.
- Commands run:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with only expected local `.env.local`, `.mock-db.json`, and running-process inspection warnings.
- Remaining highest-impact work: true page-chunk resumability, precise visual/table crop proposals, authenticated admin E2E coverage, explanation/rationale citation handling, real fixture assertions for parser outputs, and recovering missing/noisy MCQs in `qp-2024-chemistry.pdf` without reintroducing false starts.

### 2026-05-24 PDF import fixture, explanation, and visual-review pass

- Continued the remaining PDF import TODOs. Re-ran `git status --short --branch` first, re-read this development log and `TODO.md`, preserved existing dirty PDF/admin work, did not stage/commit/push, did not publish imported questions, and did not change Supabase data.
- Added explicit explanation/rationale association in `lib/pdf.ts`. Explanation text is attached only when an explicit `Explanations`/`Rationales` section has numbered entries that match generated drafts. Conflicting explanation entries are refused, and draft warnings cite the source page.
- Added fixture-backed analyzer regression tests to `tests/run-import-tests.cjs`. The core test now generates local PDF fixtures and runs the real analyzer against:
  - answer-key plus explicit explanations,
  - a neutral-filename rubric/scoring packet that must fail closed,
  - a mixed prompt/scoring packet that should keep the valid prompt while excluding the scoring page.
- Tightened visual evidence safety. `lib/question-import.ts` now rejects `/uploads/pdf-import-pages/.../page-###.png` style full-page PDF previews from saved question images. The PDF draft review card now exposes explicit cropped-asset URL, caption, and crop/source bbox controls; candidate source pages still are not saved automatically.
- Supabase seed consistency remains blocked by the no-live-data-change rule. Read-only exam inspection showed live Supabase has `20230000-0000-4000-8000-000000000150` (`AP Physics 1 2023 Practice Exam`) but not the expected mock seeded exam id/title `20000000-0000-4000-8000-000000000001` (`AP Physics 1 Mock Exam 1`). Resolving this needs an explicit decision to seed, map, or retire that expected exam.
- Fault checks:
  - Synthetic `answer-key-at-end` now attaches both explicit answers and explicit explanations from page 2 with source warnings.
  - Neutral scoring/rubric fixture still fails closed with zero drafts.
  - Real-PDF summary stayed stable: `AP Chem 2023.pdf` remained 67 drafts (60 MCQ, 7 FRQ), `qp-2024-chemistry.pdf` remained 64 drafts (57 MCQ, 7 FRQ), `ap25-frq-chemistry.pdf` remained 3 FRQ drafts, and scoring-guide packets remained failed/zero-draft.
- Commands run:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
- Remaining highest-impact work: true page-chunk resumability, automatic crop image generation from proposed visual bboxes, authenticated `/admin/pdfs` E2E coverage, and recovering missing/noisy MCQs in `qp-2024-chemistry.pdf` without reintroducing false starts.

### 2026-05-25 PDF import raw-block stabilization and crop-candidate pass

- Continued from the active PDF import handoff. Ran `git status --short --branch` first, then re-read this development log, `TODO.md`, and `docs/PDF_IMPORT_LOCAL_CHANGES_SUMMARY.md`; preserved existing dirty/untracked work, did not stage/commit/push, did not publish imported questions, and did not change Supabase data.
- Stabilized the in-progress PyMuPDF `raw_blocks` change in `scripts/pdf-text-worker.py`. Text blocks now determine two-column detection and text reading order, while image blocks are still preserved with `kind: "image"`, bbox, page dimensions, source, block number, and block order for audit/crop proposals. This avoids image blocks perturbing accepted text order.
- Added bounded crop rendering support to `scripts/pdf-ocr-worker.py` via `--crops-json`. Crop requests use PDF page coordinates, render to `/uploads/pdf-import-crops/...`, and refuse crops that are too close to full-page screenshots.
- Added automatic crop-candidate generation in `lib/pdf.ts` for drafts that reference a figure, table, graph, diagram, image, plot, chart, or "shown below" when PyMuPDF image-block bboxes are available. These generated crops are review-only draft assets; they are not saved to `question_images` unless the admin explicitly enables them in the review card. Full-page page previews remain context only.
- Strengthened visual warnings. Visual-reference drafts now explicitly warn when no usable crop candidate is found, or when crop rendering fails. Synthetic `table-diagram` remains a review draft with a source-page preview and an incomplete-visual warning because the fixture has text/vector-like content but no usable image block.
- Review UI now pre-fills the cropped asset URL only for generated bounded crop assets with bbox metadata; the admin still must check "Use cropped asset in saved draft" before the crop is included in the saved draft question.
- Fault check results stayed stable for real PDFs: `AP Chem 2023.pdf` remained 67 drafts (60 MCQ, 7 FRQ), `qp-2024-chemistry.pdf` remained 64 drafts (57 MCQ, 7 FRQ), `ap25-frq-chemistry.pdf` remained 3 FRQ drafts, and scoring-guide packets remained failed/zero-draft. No real-PDF probe timeouts were observed.
- Focused worker checks:
  - `python scripts/pdf-text-worker.py --pdf D:\xwechat_files\wxid_bdd83i6ke01g12_764f\msg\file\2026-05\AP Chem 2023.pdf` with `PYTHONPATH=D:\Codex\tools\pdf-ocr-python` returned structured page text; the first five pages preserved text reading order with text block counts 6, 3, 38, 31, and 27.
  - A Node `execFileSync` smoke call to `scripts/pdf-ocr-worker.py --render-only --crops-json ...` rendered `/tmp/crop-smoke/crop-001-smoke.png` from a bounded bbox and returned no crop warnings.
- Commands run:
  - `node tests/run-import-tests.cjs` failed because direct `node.exe` execution was denied by the local shell.
  - `node node_modules/typescript/bin/tsc --noEmit` failed because direct `node.exe` execution was denied by the local shell.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with only expected local `.env.local`, `.mock-db.json`, and running-process inspection warnings.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.
- Remaining visual work: detect vector/table bboxes, associate crops more precisely with nearby question text, and add fixture coverage with a real embedded image block. True page-chunk resumability and `qp-2024-chemistry.pdf` MCQ recovery remain open.

### 2026-05-31 Supabase PDF-import setup and Mac OCR diagnostics pass

- Investigated an admin screenshot showing an unhandled `createPdfImportJob` error claiming `supabase/migrations/008_pdf_import_pipeline.sql` was missing. Ran `git status --short --branch` first, re-read the development log/TODO/local summary, preserved local handoff artifacts, did not apply migrations, did not mutate Supabase rows, and did not publish imported questions.
- Confirmed read-only that migration `008` is committed in GitHub and the currently configured Supabase project has all expected columns in `pdf_import_jobs`, `pdf_import_pages`, `pdf_import_draft_questions`, and `pdf_import_draft_assets`.
- Read-only inspection found an existing live import job created from a Mac path under `/Users/maxchang/Documents/AP Website/`. That later job reached the import tables successfully but failed during local Python OCR execution and produced zero drafts. This indicates the screenshot and the later OCR failure were separate setup issues over time.
- Strengthened `getPdfImportSchemaStatus()` so it checks all four migration-008 tables and key columns instead of checking only `pdf_import_jobs`. Partial migrations now fail closed before analysis starts.
- Updated `adminStartPdfImportAction` and the processing route so missing-schema races and failed-state persistence errors return friendly admin warnings instead of surfacing a Next.js runtime overlay.
- Improved local worker diagnostics by preserving stderr/stdout tails from Python worker failures. Changed executable detection to verify commands with `--version` and added `python3` before `python` as a cross-platform fallback for macOS.
- Added read-only `npm run check:supabase:pdf-import`, which prints the configured Supabase hostname and verifies the four required PDF-import tables without exposing credentials. Updated `README.md` and `docs/DEPLOY_VERCEL_FREE.md` with migration-008 troubleshooting and typical macOS OCR setup commands.
- Supplied-PDF read-only analyzer smoke: `practice exam 2016(1).pdf` completed from the updated local build in about 2.9 seconds with 62 accepted text pages and 56 review drafts (55 MCQ, 1 FRQ). It attached 55 explicit answer-key matches and published/saved nothing.
- Browser smoke: started Next dev on `http://127.0.0.1:3024`, opened `/admin/pdfs` through the in-app browser, and confirmed unauthenticated access redirects to `/login`. Full authenticated click-through remains blocked locally because no admin login credentials are configured in `.env.local`.
- Commands run:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/check-supabase-pdf-import-schema.cjs` passed against the configured Supabase project.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with expected local warnings only.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
- No live migration action is currently needed for the configured Supabase project. If the boss still sees the missing-schema warning, compare his `NEXT_PUBLIC_SUPABASE_URL` hostname using `npm run check:supabase:pdf-import`; he is likely connected to a different project or stale dev server.

### 2026-06-01 Live Supabase PDF-import browser verification

- With explicit user authorization for a live PDF upload/import test, used the authenticated `/admin/pdfs` website flow against the configured Supabase project. Preserved existing dirty/untracked work and did not stage, commit, push, seed, migrate, reject, save, or publish imported questions.
- Uploaded `practice exam 2016(1).pdf` through the website as `AP Microeconomics`, unit `1`, topic `Past Test`. The resulting live upload is `pdf_gv677vtn_mpv8q4w8`; its status advanced from `uploaded` to `parsed`.
- Started review-only analysis through the website. Live job `pdf_job_91clwyo1_mpv8vhcj` completed as `needs_review` using `embedded-text`: 62 pages processed, 62 accepted text pages, 56 draft questions, and no processing error.
- Read-only Supabase verification found 56 pending drafts: 55 MCQ and 1 FRQ. 55 MCQ drafts have explicit answer-key matches, 0 drafts have explanations, 0 drafts have a `saved_question_id`, 0 drafts have saved `question_images`, and 0 draft assets were kept. The question-bank count remained 107.
- Admin-visible warnings remained conservative: one scoring/rubric-only page was excluded, scoring/rubric signals were detected on five pages, and every matched answer still requires admin verification before saving.
- This verifies authenticated upload, select, analyze, progress completion, same-page review, and review-only persistence on live Supabase. Save-as-draft and reject behavior were intentionally not exercised against live question data.

### 2026-06-02 Admin PDF-import review queue visibility pass

- Investigated why an admin did not find the live AP Microeconomics OCR drafts. Read-only Supabase verification confirmed upload `pdf_gv677vtn_mpv8q4w8`, review job `pdf_job_91clwyo1_mpv8vhcj`, and all 56 pending drafts still exist. Authenticated browser verification confirmed the hosted `https://www.projectastra.uk/admin/pdfs` page also shows the upload and `Review 56` link.
- Confirmed the confusion was a product-discovery issue, not missing data: review-only OCR candidates intentionally do not appear in `/admin/questions` or student exam lists until an admin manually verifies and saves them.
- Added a prominent dashboard PDF-import review queue above account health. It explains the review-only lifecycle, lists actionable jobs with source metadata and pending/saved/rejected counts, and links directly to each inline review workspace.
- Added a `PDF drafts` overview statistic and renamed the sidebar entry from `PDFs` to `PDF Imports`.
- Kept the dashboard summary read-only in both Supabase and mock fallback modes. No OCR draft was saved, rejected, or published.
- Verification:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with expected local warnings only.
  - `git diff --check` passed with CRLF normalization warnings only.
  - Authenticated local browser smoke at `http://127.0.0.1:3025/admin` showed the Microeconomics queue item with `56 pending`, the Statistics item with `39 pending`, a total `PDF drafts` count of `95`, and direct `Review drafts` links on desktop and mobile viewports.

### 2026-06-02 Embedded-text MCQ recovery and conservative OCR label repair

- Continued the PDF import quality pass without changing Supabase data, saving drafts, or publishing imported questions. The supplied Microeconomics packet and `qp-2024-chemistry.pdf` both use accepted embedded/PyMuPDF text, so their missing MCQs were parser-order problems rather than Tesseract-training problems.
- Stabilized PyMuPDF reading order for overlapping accessibility-description blocks. Choice blocks that overlap a numbered stem are emitted immediately after that stem; paired blocks no longer look like full-width page headers; two-column assignment uses the block left edge. This recovered swallowed MCQs on the supplied Microeconomics packet.
- Tightened segmentation boundaries. Unpunctuated trailing labels such as ordinary prose `key ingredients` no longer truncate prompts; lowercase formula starts are accepted only after a numbered prompt line break so decimal measurements such as `10. atm` do not become false questions; broader duplicate MCQ candidates are filtered only when a narrower source span exists; and page markers with no following block text no longer spill into the prior question's page attribution.
- Improved scanned OCR conservatively. `PDF_OCR_PSM` now accepts `3`, `4`, `6`, or `11`, defaults to the existing proven `6`, and warns on invalid values. The worker repairs dropped punctuation only on question-like numeric starts and normalizes OCR choice labels only when it sees a complete sequential A-D/E line run. Every repair is recorded as a source-page warning for admin verification.
- Tesseract training was deliberately deferred. A ten-page scanned `AP Calc AB 2019.pdf` analyzer comparison found `PDF_OCR_PSM=3` produced 6 review drafts while `PDF_OCR_PSM=6` produced 7; both still contain merged-choice candidates. The next scanned-PDF improvement should build a labeled page-image/ground-truth evaluation corpus and improve line/geometry recovery before training a custom model.
- Final fault checks:
  - Supplied `practice exam 2016(1).pdf`: 61 review drafts (60 MCQ, 1 FRQ), up from 56 (55 MCQ, 1 FRQ). Numbered MCQs are exactly 1-60 with no duplicate question numbers. Two visual-heavy drafts still carry explicit noisy-choice warnings instead of being silently repaired.
  - `qp-2024-chemistry.pdf`: 67 review drafts (60 MCQ, 7 FRQ), up from 64 (57 MCQ, 7 FRQ).
  - `AP Chem 2023.pdf`: stable at 67 review drafts (60 MCQ, 7 FRQ).
  - Scanned synthetic fixture: page 1 now becomes a four-choice MCQ candidate with a source warning; low-confidence page 2 is isolated as its own incomplete candidate instead of contaminating page 1.
  - Scoring-guide/sample-response packets remained failed with zero drafts. The malformed renamed `.pdf` fixture still failed before OCR.
- Commands run:
  - `node tests/run-import-tests.cjs`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/next/dist/bin/next lint`, `node scripts/predeploy-check.cjs`, and `node node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` could not launch because the shell-resolved Codex app `node.exe` returned Windows `Access is denied`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with expected local warnings only.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.
  - `D:\Anaconda\python.exe -c "compile(...)"` passed for both Python workers.
  - `git diff --check` passed with CRLF normalization warnings only.

### 2026-06-02 PDF-native visual crop association pass

- Continued the PDF import quality pass without changing Supabase data, saving drafts, or publishing imported questions. Re-ran `git status --short --branch` first and re-read this log, `TODO.md`, and `docs/PDF_IMPORT_LOCAL_CHANGES_SUMMARY.md` before edits.
- Extended `scripts/pdf-text-worker.py` so structured extraction preserves bounded PDF-native vector drawing clusters alongside raster image blocks. Table-like grids are identified from clustered vertical and horizontal strokes without running PyMuPDF's expensive formal table finder across every page. Zero-width and zero-height stroked lines are associated with clusters using a touch/overlap test.
- Kept text parsing stable: vector/table evidence blocks remain audit metadata and do not participate in accepted page text. Visual extraction now runs independently after recoverable text extraction errors so a text failure does not automatically erase available figure evidence.
- Tightened `lib/pdf.ts` crop association. Visual-reference drafts accept bounded image, table, and vector blocks; blocks are ranked against nearby question text, source-page distance, block type, and `above`/`below` cues. Weaker same-page neighbors are suppressed unless they are close enough to the best association. Generated assets remain `status: "candidate"` with `keep_for_question: false`.
- Focused generated-PDF probe: a one-page PDF containing a real vector table grid and a separate vector graph produced exactly two review-only crops. Draft 1 received only the table crop (`783x355` PNG) and draft 2 received only the graph crop (`655x517` PNG). Both used bounded bboxes and neither became a full-page screenshot or saved question image.
- During fault-finding, the first formal-table implementation caused `AP Chem 2023.pdf` structured extraction to approach timeout and fall to 59 drafts. Replacing it with drawing-cluster classification recovered the known baseline and improved runtime.
- Final real-PDF summary:
  - `AP Chem 2023.pdf`: 67 drafts (60 MCQ, 7 FRQ), 93 accepted text pages, about 7.5 seconds.
  - `practice exam 2016(1).pdf`: 61 drafts (60 MCQ, 1 FRQ), 62 accepted text pages, about 4.5 seconds.
  - `qp-2024-chemistry.pdf`: 67 drafts (60 MCQ, 7 FRQ), 50 accepted text pages, about 5.3 seconds.
  - Scoring-guide/sample-response packets remained failed with zero drafts. The malformed renamed `.pdf` fixture still failed before OCR.
- Added source regression guards for vector/table cluster preservation, zero-area stroke handling, bounded evidence kinds, and draft-anchor association. Added `__pycache__/` to `.gitignore` after Python syntax checks created local bytecode.
- Commands run:
  - `D:\Anaconda\python.exe -m py_compile scripts/pdf-text-worker.py scripts/pdf-ocr-worker.py` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with expected local warnings only.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js` passed and refreshed `tmp-pdf-import-fault-finding-20260521/probe-report.json`.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs` passed and refreshed `tmp-pdf-import-fault-finding-20260521/real-pdf-summary-report.json`.

### 2026-06-03 Admin PDF workflow clarity pass

- Continued the admin PDF import workflow pass after pushing the OCR/visual-crop work. Ran `git status --short --branch` first, re-read this log, `TODO.md`, and `docs/PDF_IMPORT_LOCAL_CHANGES_SUMMARY.md`, preserved untracked handoff artifacts, did not stage/commit/push, did not change Supabase data, and did not save/reject/publish imported questions.
- Attempted to use the Codex in-app browser with the Browser plugin as requested. The local browser bridge failed before attaching to the tab with `failed to write kernel assets: system cannot find the path`, even after resetting the Node REPL and verifying the plugin path. Browser automation was therefore blocked for this pass.
- Started local Next dev on `http://127.0.0.1:3024` and used the supplied admin account context without recording credentials in docs. The rendered login form did not expose the supplied password. Because browser automation was blocked and PowerShell did not preserve the server-action login cookies reliably, the authenticated render smoke used the same local `ap_mock_profile_id` session cookie path that the app reads, with the admin profile id resolved read-only from Supabase.
- Improved `/admin/pdfs` workflow clarity:
  - Renamed the page heading to `PDF Imports` and added compact upload/analyze/review/save-draft stage cards.
  - Renamed upload controls to `Upload source PDF`, clarified that uploads stay separate from the question bank, and changed metadata placeholder `Subject` to `AP Course`.
  - Changed row action `Analyze PDF` to `Start analysis`, and changed the current review link to a selected-state label.
  - Added a selected-import workspace header, next-action panel, jump links to draft review and page audit, and a visible pending/saved/rejected summary beside generated drafts.
  - Added per-draft review chips for source pages, warnings, visual candidates, and draft-only save status.
  - Changed draft actions to `Save verified draft` and `Reject this draft`, with explicit no-publish copy above editable draft fields.
- Authenticated HTTP smoke for `/admin/pdfs` confirmed the rendered page contains `PDF Imports`, `Selected import`, `Next action`, `Jump to drafts`, `Save verified draft`, `Save status: draft only`, and no-publish copy, and does not expose the supplied password.
- Commands run:
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/typescript/bin/tsc --noEmit` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-import-tests.cjs` passed.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/next/dist/bin/next lint` passed with no ESLint warnings or errors.
  - `C:\Users\ethan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/predeploy-check.cjs` passed with expected local warnings only.
  - `curl.exe -s --cookie ... http://127.0.0.1:3024/admin/pdfs` authenticated render smoke passed for the workflow landmarks above.
