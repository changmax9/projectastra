# AP Mock Exam Platform Development Log

这份文档是给新加入项目的朋友，以及他的 Codex 使用的项目交接说明。它不是产品宣传页，而是当前工程状态、关键设计决策、容易踩坑的地方和继续开发路线图。

更新时间：2026-05-08

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
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123456
STUDENT_EMAIL=student@example.com
STUDENT_PASSWORD=student123456
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
7. 用 demo account 登录：
   - `student@example.com` / `student123456`
   - `admin@example.com` / `admin123456`
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
