import type {
  Answer,
  Exam,
  ExamQuestion,
  MediaFile,
  PdfUpload,
  Profile,
  Question,
  ReviewGuide,
  ReviewGuideQuestion,
  Submission
} from "./types";
import apPsychologyGuideData from "../data/ap-psychology-review-guides.json";
import { hashPassword } from "./password";

const created = "2026-01-15T12:00:00.000Z";
const mockAdminEmail = process.env.ADMIN_EMAIL || "admin@local.invalid";
const mockStudentEmail = process.env.STUDENT_EMAIL || "student@local.invalid";
const showDemoCredentials = process.env.NODE_ENV === "development" && process.env.SHOW_DEMO_CREDENTIALS === "true";

export const mockProfiles: Profile[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    email: mockAdminEmail,
    full_name: "Platform Admin",
    role: "admin",
    created_at: created,
    updated_at: created
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: mockStudentEmail,
    full_name: "Demo Student",
    role: "student",
    created_at: created,
    updated_at: created
  }
];

export const mockPasswords: Record<string, string> = showDemoCredentials
  ? Object.fromEntries(
      [
        [mockAdminEmail, process.env.ADMIN_PASSWORD ? hashPassword(process.env.ADMIN_PASSWORD) : undefined],
        [mockStudentEmail, process.env.STUDENT_PASSWORD ? hashPassword(process.env.STUDENT_PASSWORD) : undefined]
      ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    )
  : {};

export const mockQuestions: Question[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    exam_name: "AP Physics 1",
    subject: "Physics",
    course: "AP Physics 1",
    year: null,
    section: "MCQ",
    exam_type: "Practice Exam",
    question_number: 1,
    unit: "Unit 1: Kinematics",
    topic: "Constant Acceleration",
    difficulty: "easy",
    type: "mcq",
    question_text:
      "A cart starts from rest and accelerates uniformly at $2.0\\,\\text{m/s}^2$ for 4.0 s. What is the cart's displacement during this interval?",
    question_images: [],
    choices: [
      { id: "A", text: "4.0 m", image_url: null },
      { id: "B", text: "8.0 m", image_url: null },
      { id: "C", text: "16 m", image_url: null },
      { id: "D", text: "32 m", image_url: null }
    ],
    correct_answer: "C",
    explanation:
      "Starting from rest, displacement is $\\Delta x = \\frac{1}{2}at^2 = \\frac{1}{2}(2.0)(4.0)^2 = 16\\,\\text{m}$.",
    source_pdf: null,
    tags: ["kinematics", "constant acceleration"],
    status: "published",
    points: 1,
    time_estimate_seconds: 90,
    created_by: mockProfiles[0].id,
    created_at: created,
    updated_at: created
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    exam_name: "AP Physics 1",
    subject: "Physics",
    course: "AP Physics 1",
    year: null,
    section: "MCQ",
    exam_type: "Practice Exam",
    question_number: 2,
    unit: "Unit 2: Dynamics",
    topic: "Newton's Laws",
    difficulty: "medium",
    type: "mcq",
    question_text:
      "A student pushes a box across a rough horizontal floor at constant velocity. Which statement best describes the horizontal forces on the box?",
    question_images: [],
    choices: [
      { id: "A", text: "The applied force is greater than kinetic friction.", image_url: null },
      { id: "B", text: "The applied force is equal in magnitude to kinetic friction.", image_url: null },
      { id: "C", text: "The applied force is less than kinetic friction.", image_url: null },
      { id: "D", text: "There is no friction because the velocity is constant.", image_url: null }
    ],
    correct_answer: "B",
    explanation:
      "Constant velocity means zero acceleration, so the net horizontal force is zero. The applied force balances kinetic friction.",
    source_pdf: null,
    tags: ["newton's laws", "friction", "constant velocity"],
    status: "published",
    points: 1,
    time_estimate_seconds: 75,
    created_by: mockProfiles[0].id,
    created_at: created,
    updated_at: created
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    exam_name: "AP Physics 1",
    subject: "Physics",
    course: "AP Physics 1",
    year: null,
    section: "MCQ",
    exam_type: "Practice Exam",
    question_number: 3,
    unit: "Unit 3: Circular Motion and Gravitation",
    topic: "Circular Motion",
    difficulty: "medium",
    type: "mcq",
    question_text:
      "A block moves in a horizontal circle at constant speed. Which statement correctly describes the net force on the block?",
    question_images: [
      {
        id: "img_001",
        url: "/mock-media/circular-motion.svg",
        caption: "Top view of a block moving around a circular path."
      }
    ],
    choices: [
      { id: "A", text: "The net force is directed toward the center of the circle.", image_url: null },
      { id: "B", text: "The net force is directed tangent to the circle.", image_url: null },
      { id: "C", text: "The net force is zero because the speed is constant.", image_url: null },
      { id: "D", text: "The net force is directed outward from the center.", image_url: null }
    ],
    correct_answer: "A",
    explanation:
      "For uniform circular motion, the acceleration and net force point toward the center of the circle.",
    source_pdf: "ap_physics_mock_01.pdf",
    tags: ["centripetal force", "circular motion", "net force"],
    status: "published",
    points: 1,
    time_estimate_seconds: 90,
    created_by: mockProfiles[0].id,
    created_at: created,
    updated_at: created
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    exam_name: "AP Physics 1",
    subject: "Physics",
    course: "AP Physics 1",
    year: null,
    section: "MCQ",
    exam_type: "Practice Exam",
    question_number: 4,
    unit: "Unit 6: Oscillations",
    topic: "Simple Harmonic Motion",
    difficulty: "hard",
    type: "mcq",
    question_text:
      "A mass attached to a horizontal spring oscillates with amplitude A. At which position is the speed of the mass greatest?",
    question_images: [],
    choices: [
      { id: "A", text: "At $x = A$", image_url: null },
      { id: "B", text: "At $x = -A$", image_url: null },
      { id: "C", text: "At $x = 0$", image_url: null },
      { id: "D", text: "The speed is the same at every position.", image_url: null }
    ],
    correct_answer: "C",
    explanation:
      "The mass has maximum kinetic energy and minimum spring potential energy at equilibrium, so its speed is greatest at $x=0$.",
    source_pdf: null,
    tags: ["simple harmonic motion", "energy"],
    status: "published",
    points: 1,
    time_estimate_seconds: 90,
    created_by: mockProfiles[0].id,
    created_at: created,
    updated_at: created
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    exam_name: "AP Physics 1",
    subject: "Physics",
    course: "AP Physics 1",
    year: null,
    section: "FRQ",
    exam_type: "Practice Exam",
    question_number: 1,
    unit: "Unit 4: Energy",
    topic: "Work and Energy",
    difficulty: "medium",
    type: "frq",
    question_text:
      "A cart is pushed along a track by a variable force. Explain how the work done on the cart can be determined from a force-position graph.",
    question_images: [],
    choices: [],
    correct_answer: null,
    explanation:
      "The work done by a variable force is the signed area under the force-position graph over the interval of motion.",
    source_pdf: null,
    tags: ["work", "energy", "graph"],
    status: "published",
    points: 4,
    time_estimate_seconds: 480,
    created_by: mockProfiles[0].id,
    created_at: created,
    updated_at: created
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    exam_name: "AP Physics 1",
    subject: "Physics",
    course: "AP Physics 1",
    year: null,
    section: "FRQ",
    exam_type: "Practice Exam",
    question_number: 2,
    unit: "Unit 3: Circular Motion and Gravitation",
    topic: "Vertical Circles",
    difficulty: "hard",
    type: "frq",
    question_text:
      "A small object attached to a light string moves in a vertical circle. At the top of the circle, identify the forces on the object and explain why the string tension can be zero at a minimum speed.",
    question_images: [],
    choices: [],
    correct_answer: null,
    explanation:
      "At the top, gravity and tension both point toward the center. At the minimum speed, gravity alone supplies the required centripetal force, so tension is zero.",
    source_pdf: null,
    tags: ["vertical circle", "centripetal force", "free-body diagram"],
    status: "published",
    points: 4,
    time_estimate_seconds: 600,
    created_by: mockProfiles[0].id,
    created_at: created,
    updated_at: created
  }
];

export const mockExams: Exam[] = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    title: "AP Physics 1 Mock Exam 1",
    description:
      "A compact AP Physics 1-style practice exam covering kinematics, dynamics, circular motion, energy, and SHM. All questions are original AP-style examples.",
    subject: "Physics",
    course: "AP Physics 1",
    year: null,
    section: "Full Exam",
    exam_type: "Practice Exam",
    time_limit_minutes: 45,
    status: "published",
    created_by: mockProfiles[0].id,
    created_at: created,
    updated_at: created
  }
];

export const mockExamQuestions: ExamQuestion[] = mockQuestions.map((question, index) => ({
  id: `30000000-0000-4000-8000-00000000000${index + 1}`,
  exam_id: mockExams[0].id,
  question_id: question.id,
  order_index: index + 1,
  points_override: null
}));

export const circularGuideMarkdown = `# Unit 3 Review: Circular Motion and Gravitation

## Big Idea

Circular motion requires an inward acceleration. Even if speed is constant, velocity changes because direction changes.

$$
a_c = \\frac{v^2}{r}
$$

## Centripetal Force

The net inward force is what causes centripetal acceleration.

$$
F_c = \\frac{mv^2}{r}
$$

> Important: Centripetal force is not a new force. It is the net inward force.

> Common Mistake: Do not draw both tension and centripetal force if tension is already the inward force.

## Free-Body Diagram Mistakes

For circular motion problems, draw only real forces: tension, gravity, normal force, friction, spring force, and applied forces. Then choose the inward direction as the radial axis.

| Situation | Inward force example | Trap |
| --- | --- | --- |
| Ball on string | Tension | Adding a separate "centripetal force" arrow |
| Car on flat curve | Static friction | Assuming friction points backward |
| Object at top of vertical circle | Gravity plus possible tension | Forgetting both can point inward |

## Horizontal Circle Example

If a puck moves in a horizontal circle because a string pulls it inward, tension supplies the net radial force.

$$
T = \\frac{mv^2}{r}
$$

## Vertical Circle Example

At the top of a vertical circle, the center is downward. Gravity points downward, and tension also points downward if the string is taut.

> Exam Tip: Always identify which real force, or combination of forces, points toward the center.

## Common AP Exam Traps

1. Constant speed does not mean zero acceleration.
2. The net force points inward, not in the direction of motion.
3. The "centripetal force" label describes the radial net force, not an extra interaction.

## Related Practice Questions

Try the circular motion MCQ, the Newton's laws force-balance MCQ, and the vertical-circle FRQ after reading this guide.
`;

const apPsychologyReviewGuides: ReviewGuide[] = apPsychologyGuideData.map(({ source_path: _sourcePath, ...guide }) => guide as ReviewGuide);

export const mockReviewGuides: ReviewGuide[] = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    title: "Unit 3 Review: Circular Motion and Gravitation",
    slug: "unit-3-circular-motion-and-gravitation",
    description:
      "A quick review of centripetal acceleration, centripetal force, and common AP Physics 1 mistakes.",
    subject: "AP Physics 1",
    unit: "Unit 3: Circular Motion and Gravitation",
    topic: "Circular Motion",
    difficulty: "medium",
    content_markdown: circularGuideMarkdown,
    status: "published",
    cover_image_url: null,
    estimated_reading_time_minutes: 10,
    created_by: mockProfiles[0].id,
    created_at: created,
    updated_at: created,
    published_at: created
  },
  ...apPsychologyReviewGuides
];

export const mockReviewGuideQuestions: ReviewGuideQuestion[] = [
  {
    id: "50000000-0000-4000-8000-000000000001",
    review_guide_id: mockReviewGuides[0].id,
    question_id: mockQuestions[2].id,
    order_index: 1
  },
  {
    id: "50000000-0000-4000-8000-000000000002",
    review_guide_id: mockReviewGuides[0].id,
    question_id: mockQuestions[1].id,
    order_index: 2
  },
  {
    id: "50000000-0000-4000-8000-000000000003",
    review_guide_id: mockReviewGuides[0].id,
    question_id: mockQuestions[5].id,
    order_index: 3
  }
];

export const mockSubmissions: Submission[] = [];
export const mockAnswers: Answer[] = [];
export const mockMediaFiles: MediaFile[] = [];
export const mockPdfUploads: PdfUpload[] = [];
