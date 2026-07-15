---
project: "Astra Exams"
surface: "Student testing application"
status: "active"
accessibility_target: "WCAG 2.2 AA"
tokens:
  color.background.app: "#f3f4f6"
  color.background.surface: "#ffffff"
  color.background.brand: "#3155d8"
  color.background.ink: "#202124"
  color.text.primary: "#202124"
  color.text.secondary: "#555960"
  color.text.inverse: "#ffffff"
  color.action.primary: "#3654d9"
  color.action.warning: "#ffd617"
  color.border.default: "#d3d5d9"
  color.status.success: "#16794b"
  color.status.warning: "#8a5b00"
  radius.control: "4px"
  radius.panel: "6px"
  shadow.overlay: "0 18px 60px rgba(32, 33, 36, 0.22)"
  font.ui: "Arial, Helvetica, sans-serif"
---

# Astra Exams Design Contract

## Request Anchor

- Original user request: Pull the latest project and make it match College Board Bluebook.
- Latest user override: Do not reuse the old exam logic; use Bluebook's logic, including a Bluebook-like startup console.
- Deliverable: A coherent student startup and testing flow covering sign-in, home console, practice-test selection, setup/readiness, launch, section runtime, break, and completion.
- Primary audience: AP students using a laptop or tablet for realistic timed practice.
- Core job to be done: Enter a trusted exam environment, see the next testing task immediately, prepare the device/session, and begin or resume with no dashboard interpretation required.
- Success criteria: The first screen, home console, setup flow, and test runtime share Bluebook's quiet institutional hierarchy and behavior; active work is resumable; setup has explicit readiness states; desktop and mobile remain usable.
- Non-goals: Reproduce College Board trademarks, logos, protected copy, or claim official affiliation; redesign admin tools; preserve the old marketing-dashboard visual language inside the student testing flow.
- Must preserve: Astra identity, existing authentication, published exam data, submissions, section timing, answers, review guides, admin access, and current server actions.
- Validation must check against: sign-in to dashboard; available, in-progress, completed, empty, loading, and error language; setup dialog keyboard behavior; launch/resume; 320px reflow; no page-level horizontal scroll; visible focus; reduced motion; clean browser console.

## Product And Content Contract

- Product problem: The existing student portal reads as a decorative analytics dashboard. Bluebook reads as a purpose-built testing application with a small number of consequential next actions.
- Desired behavior: Students first verify/sign in, then choose from `Your Tests` or `Practice and Prepare`, then complete setup before entering the timed section.
- Success signal: A student can identify the next action in under five seconds without interpreting score metrics or nested cards.
- Primary terms: `Your Tests`, `Practice and Prepare`, `Full-Length Practice`, `Test Preview`, `Exam Setup`, `Start Test`, `Resume Testing`, `Review Results`.
- Voice: Calm, direct, specific, and procedural. No marketing claims inside the application shell.
- State language:
  - Loading names the task in progress.
  - Empty states explain what is absent and provide one next step.
  - Errors state what failed and retain a recovery action.
  - Disabled launch states explain the missing readiness check inline.
  - Resume states name the active test or section.
- Material honesty: The interface may follow Bluebook's workflow and density, but visible branding remains `Astra Exams`; the product never presents itself as College Board software.

## OKF Preflight

| Reference | Decision | Artifact target | Verification |
| --- | --- | --- | --- |
| Taste Engine | Use one flat application shell and row-based task groups; reject equal metric cards, glassmorphism, gradients, bokeh, and oversized hero copy. | Sign-in, dashboard, launch/setup | Screenshot critique finds no decorative card grid or marketing hierarchy. |
| Necessary Design Judgment | Keep only identity, test status, preparation, and the next action. Demote scores and study extras below the testing task. | Dashboard information order | First viewport makes the next testing task obvious; delete test finds no filler. |
| Request Integrity | Treat the startup console as part of the Bluebook behavior request, not a cosmetic extension of the old dashboard. | Request Anchor and all student routes | Final route walk checks every requested stage. |
| Responsive And Interaction | Start from a single-column mobile task list; dialogs trap focus, Escape closes, actions report pending/disabled states. | Auth, console, setup dialog | 320px and desktop screenshots; keyboard tab/escape checks. |
| State Language | Give available, resume, completed, empty, pending, and error states explicit copy and recovery. | Test rows, auth form, setup | DOM and interaction inspection confirms state labels and recovery paths. |

Supporting references: `branch-web-product.md`, `content-model.md`, `design-contract.md`, `tokens-components.md`, `visual-verification.md`, and `quality-gates.md`.

## Taste Signature

- Design read: Quiet, institutional, exam-native, and task first.
- Necessary judgment: Remove decorative portal chrome; make sign-in, test state, setup, and launch feel inevitable.
- Taste dials: restrained expression, high clarity, compact density, low motion, high trust.
- Category defaults avoided: glass panels, gradient backgrounds, floating nav pills, KPI cards, nested cards, marketing hero composition, excessive roundness.
- Layout-family budget: one app shell, one centered authentication panel, flat grouped lists, one setup dialog.
- Visual memory feature: Astra's blue angular `A` mark with a yellow progress bar and cyan readiness corner, supported by the four-color testing stripe inside the runtime.
- Type personality: neutral system sans for controls and status; serif is reserved for exam content only.
- Asset/reference policy: Use live College Board documentation and public Bluebook screenshots for workflow/layout reference; do not copy logos or ship their images.
- Anti-default locks: no decorative gradients, no blur, no decorative blobs, no nested cards, no radius above 8px in the student shell, no viewport-scaled type.
- Intentional exceptions: The fixed four-color testing stripe uses hard color bands as an application identity cue. The timed question interface may use pill controls where Bluebook uses compact tool/status controls; familiar icon buttons keep tooltips and accessible names.

## Necessary Judgment

- Removed or demoted: marketing copy, portal metrics, glass effects, decorative study-posture card, and repeated metadata chips.
- Must remain: account identity, admin escape hatch, active attempt, published practice tests, completed history, review resources, and safe sign-out.
- Inevitable relationships: status precedes action; test title precedes metadata; setup confirmation precedes launch; active tests precede new practice.
- Craft tolerances: 1px rules, 4-6px radii, 44px minimum primary hit targets, consistent 20-24px gutters, no uncontrolled line wrapping in actions.
- Care states: authentication pending/error/success, no scheduled tests, no practice tests, resume, completed, setup incomplete, launch pending, mobile navigation.
- Scene fit: This is repeated operational software used under time pressure, so density and calm outrank personality and decoration.

## Information Architecture

1. Sign-in: brand, device check, account credentials, help/registration.
2. Home console: utility header, `Your Tests`, `Practice and Prepare`, recent results and review links.
3. Practice detail: test identity, timing, section sequence, resume state.
4. Exam Setup: device/session checks and consequences before creating or resuming an attempt.
5. Test runtime: one continuous attempt containing all timed sections, with a single scheduled break between the final MCQ section and the first FRQ section, followed by whole-test submission.

## Components And States

- `BluebookAppHeader`: brand, page label, help, settings, account menu/sign-out; compact mobile state.
- `TestGroup`: semantic section with a flat heading and bordered row list.
- `TestRow`: `available`, `in_progress`, or `completed`; stable title/meta/action geometry.
- `PracticeSelector`: grouped published tests with a compact native filter/search strategy.
- `DeviceCheck`: local browser readiness report with pass/advisory state and a clear close action.
- `ExamSetupFlow`: full-screen two-step readiness and launch sequence with a fixed utility header, stable progress footer, and explicit back/next states.
- `CompletionScreen`: successful whole-test submission, results handoff, and return-home recovery.
- `AuthForm`: pending, field validation, server error, registration success.

## Review Log

- 2026-07-15: Replaced the inherited glass-dashboard direction with a Bluebook-referenced student application contract. Startup console, readiness, and launch are now first-class parts of the exam state machine.
- 2026-07-15: Critique removed the remaining KPI/dashboard hierarchy in favor of `Your Tests` and `Practice and Prepare`; active attempts now return through test detail and setup before resuming.
- 2026-07-15: Mobile repair made Exam Setup a fixed-header/fixed-footer dialog with a scrollable checklist so the disabled reason, cancel action, and primary action remain visible at 390px.
- 2026-07-15: Corrected the runtime contract so section boundaries stay inside one continuous test attempt. Nonfinal sections continue in place, the only scheduled break sits between MCQ and FRQ, and only the last section submits the test.
- 2026-07-15: Replaced the placeholder lettermark with an original Astra vector mark, browser favicon, and shared brand asset; normalized stale `Astra Glass` surfaces back to `Astra Exams`.
- 2026-07-15: Rebuilt setup as a full-screen stepped flow, made section directions a dark-shell document state, locked the scheduled break until its timer ends, and added a dedicated successful-submission handoff.
- 2026-07-15: Added per-question save versioning, ten-second attempt checkpoints, and session timer recovery so rapid navigation and refreshes do not silently discard work or reset the local timer.
- 2026-07-15: Browser QA caught and fixed checkpoint feedback that double-counted elapsed time after a server refresh; elapsed time now advances from a resettable baseline, and manual section completion is guarded against duplicate requests.
- 2026-07-15: Mobile runtime QA constrained the footer to fixed 44px navigation controls and verified a structured calculus table, scheduled break, and whole-test completion screen at phone and desktop sizes.
- 2026-07-15: Consolidated autosave, checkpoint, exit, and submission into one client save queue; added a short-lived server attempt lock, retryable contention handling, and section compare-and-set so stale or duplicate requests cannot overwrite answers, scores, or the next section.
- 2026-07-15: Hardened cross-tab persistence with database fencing: lock claims are atomic, every answer batch validates the current token, and attempt plus section progress commit in one transaction before the lock is released. A throwaway PostgreSQL run verified stale-token rejection and atomic transition behavior.
- 2026-07-15: Removed the unrouted legacy exam and skippable-break clients plus their unfenced Server Actions; the Bluebook state machine is now the only student testing path, and the server independently enforces the full ten-minute scheduled break.

## Verification Record

- Desktop: 1440 x 900 console, setup, directions, question runtime, scheduled break, and successful completion inspected in a real browser.
- Mobile: 390 x 844 console, test detail, both setup steps, directions, structured table question, runtime, scheduled break, and completion inspected with no overlapping controls.
- Interaction: Exam Setup remains disabled until all three confirmations are checked; the same attempt continues across sections; the break cannot end early; completion hands off to results.
- Timing: Across three ten-second checkpoint cycles, 65.5 seconds of browser wall time increased stored elapsed time by 64 seconds, confirming server refreshes no longer double-count the timer.
- Persistence: During 12 seconds of continuous answer/review changes, the stable checkpoint persisted state without a debounce pause; a later answer change survived a reload after the queued autosave completed.
- Semantic zones: `data-ud-check` markers cover authentication, app header/footer, test groups, filters, detail, section list, device check, and setup.
- Engineering gates: `npm run lint`, `npm test`, `npm run build`, and `git diff --check` pass; final page console contains no warnings or errors.

## Assumptions

- `Astra Exams` is the correct visible product name for the testing shell.
- Browser readiness can truthfully verify viewport, JavaScript, storage access, and connectivity; it must not claim native lockdown or OS compatibility.
- Published AP exams belong under `Practice and Prepare`; the app has no authoritative scheduled-test feed, so `Your Tests` contains active attempts and recent completed work rather than invented appointments.

## Open Questions

- None block this pass. A future scheduled-administration data model may add real test-day cards without changing the shell.
