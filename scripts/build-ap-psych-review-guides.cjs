const fs = require("fs");
const path = require("path");

const created = "2026-05-10T00:00:00.000Z";
const defaultSourcePath =
  "D:\\xwechat_files\\wxid_bdd83i6ke01g12_764f\\msg\\file\\2026-05\\AP Psychology Packet.md";

const sourcePath = process.argv[2] || defaultSourcePath;
const outputPath = path.join(process.cwd(), "data", "ap-psychology-review-guides.json");

const guidePlan = [
  {
    id: "ap-psych-guide-000",
    title: "AP Psychology Unit 0: Scientific Foundations and Statistics",
    slug: "ap-psych-unit-0-scientific-foundations-statistics",
    description:
      "Research methods, variables, ethics, correlation, experiments, statistics, and the explanation moves that make AP Psychology answers precise.",
    unit: "Unit 0: Scientific Foundations and Statistics",
    topic: "Research Methods and Statistics",
    difficulty: "medium",
    sections: ["Unit Zero - Research Design", "Statistics"],
    coverage: [
      "Operational definitions, samples, random assignment, and research ethics",
      "Correlation, causation, confounds, and descriptive study designs",
      "Mean, median, mode, skew, normal curves, and inferential reasoning"
    ],
    explanationFocus: [
      "Name the research design before interpreting a result.",
      "Separate random sampling from random assignment.",
      "Use the scenario's measured behavior when writing operational definitions."
    ],
    examTrap: "Correlation can predict, but it cannot establish cause and effect."
  },
  {
    id: "ap-psych-guide-001",
    title: "AP Psychology Unit 1: Biological Bases of Behavior",
    slug: "ap-psych-unit-1-biological-bases-behavior",
    description:
      "Neurons, neurotransmitters, brain structures, sleep, sensation, perception, and biological explanations for behavior.",
    unit: "Unit 1: Biological Bases of Behavior",
    topic: "Biological Psychology",
    difficulty: "medium",
    sections: ["Biological Basis Pillar"],
    coverage: [
      "Genes, nervous system organization, neurons, and neurotransmitters",
      "Brain regions, hemispheric specialization, sleep, and consciousness",
      "Vision, hearing, sensation, perception, and sensory disorders"
    ],
    explanationFocus: [
      "Link each biological structure to a behavioral outcome.",
      "Distinguish sensory input from perceptual interpretation.",
      "Use directional language carefully for neurons, brain pathways, and sensory systems."
    ],
    examTrap: "Do not describe a brain part by location only; explain what changes in behavior or mental processing."
  },
  {
    id: "ap-psych-guide-002",
    title: "AP Psychology Unit 2: Cognition",
    slug: "ap-psych-unit-2-cognition",
    description:
      "Perception, thinking, problem solving, memory, intelligence, testing, and common cognitive biases.",
    unit: "Unit 2: Cognition",
    topic: "Cognition",
    difficulty: "medium",
    sections: ["Cognition Pillar"],
    coverage: [
      "Gestalt organization, depth cues, and perceptual constancy",
      "Problem-solving strategies, barriers, algorithms, heuristics, and creativity",
      "Encoding, storage, retrieval, forgetting, intelligence, and testing"
    ],
    explanationFocus: [
      "Use the exact cognitive process, then apply it to the scenario.",
      "Separate encoding, storage, and retrieval when explaining memory.",
      "For bias questions, identify the mental shortcut and the error it creates."
    ],
    examTrap: "A term definition alone is not an FRQ answer; the answer must explain how the scenario shows the term."
  },
  {
    id: "ap-psych-guide-003",
    title: "AP Psychology Unit 3: Development and Learning",
    slug: "ap-psych-unit-3-development-learning",
    description:
      "Lifespan development, language, attachment, identity, classical conditioning, operant conditioning, schedules, and observational learning.",
    unit: "Unit 3: Development and Learning",
    topic: "Development and Learning",
    difficulty: "medium",
    sections: ["Development and Learning Pillar", "Learning"],
    coverage: [
      "Developmental research, prenatal development, childhood, adolescence, and adulthood",
      "Piaget, Vygotsky, language development, attachment, and identity",
      "Classical conditioning, operant conditioning, schedules, and learning principles"
    ],
    explanationFocus: [
      "When using a stage theory, name the stage and connect it to a behavior.",
      "Keep classical conditioning stimulus-response language separate from operant consequence language.",
      "Use examples that show change over time, not just a label."
    ],
    examTrap: "Negative reinforcement means removing something to increase behavior; it is not punishment."
  },
  {
    id: "ap-psych-guide-004",
    title: "AP Psychology Unit 4: Social Psychology and Personality",
    slug: "ap-psych-unit-4-social-personality",
    description:
      "Attribution, attitudes, persuasion, conformity, obedience, group behavior, personality theories, motivation, and emotion.",
    unit: "Unit 4: Social Psychology and Personality",
    topic: "Social Psychology and Personality",
    difficulty: "medium",
    sections: ["Social and Personality Pillar", "Personality", "Motivation"],
    coverage: [
      "Attribution, attitudes, persuasion, conformity, obedience, and group processes",
      "Psychodynamic, trait, humanistic, and social-cognitive personality explanations",
      "Motivation, hunger, emotion theories, stress, and positive psychology"
    ],
    explanationFocus: [
      "For social psychology, identify the social pressure or group context.",
      "For personality, compare theories by what they emphasize as the source of behavior.",
      "For emotion, distinguish physiological arousal, cognition, and expressive behavior."
    ],
    examTrap: "Conformity changes behavior to match a group; obedience follows an authority figure's command."
  },
  {
    id: "ap-psych-guide-005",
    title: "AP Psychology Unit 5: Mental and Physical Health",
    slug: "ap-psych-unit-5-mental-physical-health",
    description:
      "Stress, psychological disorders, diagnostic perspectives, treatment approaches, therapy ethics, and applied health psychology.",
    unit: "Unit 5: Mental and Physical Health",
    topic: "Mental and Physical Health",
    difficulty: "medium",
    sections: ["Mental and Physical Health Pillar"],
    coverage: [
      "Health, stress, stress responses, and resilience",
      "Disorder classification, depressive, bipolar, anxiety, trauma, dissociative, obsessive-compulsive, schizophrenia, eating, and personality disorders",
      "Psychotherapy, biomedical therapy, therapy ethics, and treatment perspectives"
    ],
    explanationFocus: [
      "Use symptoms to justify a disorder label; do not diagnose from one vague clue.",
      "Explain treatment by naming what the therapy changes: thought, behavior, biology, relationship, or coping skill.",
      "Keep clinical descriptions respectful, evidence-based, and scenario-specific."
    ],
    examTrap: "Dissociative identity disorder is not schizophrenia; schizophrenia centers on psychosis such as hallucinations, delusions, and disorganized thought."
  },
  {
    id: "ap-psych-guide-006",
    title: "AP Psychology Exam and FRQ Strategy",
    slug: "ap-psych-exam-frq-strategy",
    description:
      "A compact strategy guide for AP Psychology timing, multiple choice, and free-response writing.",
    unit: "Exam Strategy",
    topic: "FRQ Strategy",
    difficulty: "easy",
    sections: ["AP Exam Formatting"],
    coverage: [
      "Exam section timing and weight",
      "Multiple-choice pacing",
      "FRQ definition, application, and evidence habits"
    ],
    explanationFocus: [
      "Define the term in plain psychology language.",
      "Apply the term directly to the named person, behavior, or study in the prompt.",
      "When asked to explain, include the mechanism, not just the outcome."
    ],
    examTrap: "Do not write a term dump. Each sentence should answer the prompt's specific task."
  }
];

const imageNotes = {
  "image1.jpeg":
    "The missing correlation image showed scatterplots. Read direction from the slope: upward is positive, downward is negative. Read strength from tightness: tighter clusters mean stronger relationships.",
  "image2.png":
    "The missing skew image compared negative skew, normal distribution, and positive skew. The tail gives the skew its name; the mean is pulled toward the tail.",
  "image3.png":
    "The missing distribution image supported the central-tendency section. For AP-style explanations, choose mean for symmetric data and median when outliers or skew distort the mean.",
  "image4.jpeg":
    "The missing neuron diagram should be read in signal order: dendrites receive, soma integrates, axon sends, myelin speeds, terminal branches release neurotransmitters.",
  "image5.png":
    "The missing action-potential image showed threshold and firing. Once threshold is reached, the neuron fires by the all-or-nothing rule; stronger stimuli increase firing rate, not action-potential size.",
  "image7.jpeg":
    "The missing sleep-cycle diagram showed cycling through sleep stages across the night. REM periods generally lengthen later in the night.",
  "image8.png":
    "The missing split-brain image showed contralateral processing: the left visual field goes to the right hemisphere and the right visual field goes to the left hemisphere.",
  "image10.png":
    "The missing eye diagram located the blind spot where the optic nerve exits the retina and no photoreceptors are present.",
  "image11.png":
    "The missing sound-wave diagram contrasted amplitude and frequency. Taller waves are louder; tighter waves are higher pitch.",
  "image12.jpeg":
    "The missing ear diagram traced sound from outer ear to eardrum, ossicles, cochlea, hair cells, auditory nerve, and auditory cortex.",
  "image13.jpeg":
    "The missing hearing-loss image contrasted conductive loss with sensorineural loss. Conductive loss blocks transmission; sensorineural loss damages cochlear hair cells or auditory nerves.",
  "image15.png":
    "The missing Gestalt diagram illustrated grouping principles such as proximity, similarity, continuity, and closure.",
  "image16.png":
    "The missing depth-cue image showed monocular cues. Interposition means an object blocking another is perceived as closer.",
  "image17.jpeg":
    "The missing linear-perspective image showed parallel lines converging with distance, like railroad tracks.",
  "image18.jpeg":
    "The missing multi-store memory model showed information moving from sensory memory to short-term/working memory and then long-term memory through attention and rehearsal.",
  "image19.jpeg":
    "The missing working-memory model separated the central executive from short-term subsystems such as the phonological loop and visuospatial sketchpad.",
  "image20.jpeg":
    "The missing forgetting-curve graph showed rapid early forgetting followed by a slower decline.",
  "image21.jpeg":
    "The missing serial-position curve showed primacy for early list items and recency for late list items.",
  "image22.jpeg":
    "The missing memory-distortion image supported misinformation and framing effects: later wording can alter recall.",
  "image23.jpeg":
    "The missing IQ formula image showed the historical ratio IQ idea: mental age divided by chronological age, multiplied by 100.",
  "image24.jpeg":
    "The missing visual-cliff image showed infants using depth cues; interpret it as evidence about perceptual development, not a moral choice.",
  "image25.jpeg":
    "The missing scaffolding image showed the zone of proximal development: tasks too hard alone but possible with support.",
  "image26.jpeg":
    "The missing identity-development image introduced identity statuses based on exploration and commitment.",
  "image27.png":
    "The missing identity-status image contrasted diffusion, foreclosure, moratorium, and achievement.",
  "image28.png":
    "The missing ecological-systems diagram nested microsystem, mesosystem, exosystem, macrosystem, and chronosystem.",
  "image29.jpeg":
    "The missing classical-conditioning diagram mapped neutral stimulus, unconditioned stimulus, unconditioned response, conditioned stimulus, and conditioned response.",
  "image30.png":
    "The missing reinforcement-schedule graph compared fixed/variable and ratio/interval schedules. Variable schedules tend to resist extinction most strongly.",
  "image31.png":
    "The missing attribution-bias image contrasted internal and external explanations for behavior.",
  "image32.png":
    "The missing Asch image showed line-judgment conformity: people sometimes give a wrong answer to match a unanimous group.",
  "image33.png":
    "The missing group-polarization graph showed attitudes becoming more extreme after discussion with like-minded group members.",
  "image34.jpeg":
    "The missing reciprocal-determinism diagram showed behavior, personal factors, and environment influencing one another.",
  "image35.png":
    "The missing Yerkes-Dodson image showed performance peaking at moderate arousal.",
  "image36.png":
    "The missing arousal-performance screenshot repeated the Yerkes-Dodson idea: too little or too much arousal can hurt performance.",
  "image37.png":
    "The missing emotion-pathway diagram contrasted fast amygdala routes with slower routes involving appraisal.",
  "image38.png":
    "The missing positive-psychology diagram connected positive emotions, broadened attention, coping resources, and resilience.",
  "image39.gif":
    "The missing stress-response diagram showed alarm, resistance, and exhaustion in the general adaptation syndrome."
};

function normalizeHeading(text) {
  return text.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function readPacket() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`AP Psychology packet not found: ${sourcePath}`);
  }
  return fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
}

function splitTopSections(markdown) {
  const lines = markdown.split("\n");
  const sections = new Map();
  let currentTitle = null;
  let buffer = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      if (currentTitle) sections.set(normalizeHeading(currentTitle), buffer.join("\n").trim());
      currentTitle = match[1].trim();
      buffer = [`## ${currentTitle}`];
      continue;
    }

    if (!currentTitle) continue;
    if (/^- \[.+\]\(#.+\)\s*$/.test(line)) continue;
    buffer.push(line);
  }

  if (currentTitle) sections.set(normalizeHeading(currentTitle), buffer.join("\n").trim());
  return sections;
}

function visualNoteFor(matchText) {
  const fileMatch = matchText.match(/image\d+\.(?:jpe?g|png|gif|webp)/i);
  if (!fileMatch) return "The source packet included an image here; the key idea has been preserved in text so the guide does not depend on a broken image link.";
  return imageNotes[fileMatch[0].toLowerCase()] || "The source packet included an image here; review the surrounding text as the accessible replacement.";
}

function sanitizeSection(markdown) {
  const lines = markdown.split("\n");
  const output = [];

  for (const line of lines) {
    if (/!\[.*\]\(.+\)/.test(line) || /<img\s+/i.test(line)) {
      const note = visualNoteFor(line);
      output.push(`> Visual cue: ${note}`);
      continue;
    }

    const cleaned = line
      .replace(/\^rd\^/g, "rd")
      .replace(/\bbehvs\b/gi, "behaviors")
      .replace(/\bbehv\b\.?/gi, "behavior")
      .replace(/\bb\/w\b/gi, "between")
      .replace(/\bw\//gi, "with ")
      .replace(/\bwo\b/gi, "without")
      .replace(/\bwitho\b/gi, "without")
      .replace(/\bbc\b/gi, "because")
      .replace(/\bppl\b/gi, "people")
      .replace(/\bpos\.\s*/gi, "positive ")
      .replace(/\bneg\.\s*/gi, "negative ")
      .replace(/\bdiff\./gi, "different")
      .replace(/\bassoc\.\s*/gi, "associated ")
      .replace(/\bExp\./g, "Experiment")
      .replace(/Ghrelin:\*\* makes you hungry \(.+?\)/gi, "Ghrelin:** makes you hungry")
      .replace(/if you saw a .+? on campus you.d remember it!/gi, "campus-location memory cue")
      .replace(/\*\*.?Monkey experiments.?\*\*/gi, "**Contact-comfort studies**")
      .replace(/.?Monkey experiments.?/gi, "Contact-comfort studies")
      .replace(/\brat basketball\b/gi, "successive skill shaping")
      .replace(/\bpigeons hopping on one foot to get food\b/gi, "coincidental ritual-like responding")
      .replace(/\brats in maze get reinforced half way through\b/gi, "maze-learning studies receive reinforcement partway through")
      .replace(/\bchimps with crates to get bananas\b/gi, "insight-based problem solving")
      .replace("*Arachnophobia* **–** fear of spiders", "*Specific phobia* **–** intense fear of a specific object or situation")
      .replace("birds believe the first thing they see after hatching is mom", "the first moving object becomes an attachment target")
      .replace(/\s+$/g, "");

    output.push(cleaned);
  }

  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildGuide(plan, sections) {
  const body = plan.sections
    .map((sectionName) => {
      const section = sections.get(normalizeHeading(sectionName));
      if (!section) throw new Error(`Missing AP Psychology section: ${sectionName}`);
      return sanitizeSection(section);
    })
    .join("\n\n---\n\n");

  const content = [
    `# ${plan.title}`,
    "",
    "> Important: This guide is organized around the current five-unit AP Psychology framework. The original packet language is preserved where useful, while image-dependent spots have text replacements so the page remains readable without broken media.",
    "",
    "## What this unit covers",
    "",
    ...plan.coverage.map((item) => `- ${item}`),
    "",
    "## Explanation moves",
    "",
    ...plan.explanationFocus.map((item) => `- ${item}`),
    "",
    `> Common Mistake: ${plan.examTrap}`,
    "",
    "## Source Packet Notes",
    "",
    body,
    "",
    "## Quick FRQ Checklist",
    "",
    "- Define the psychology term in clear language.",
    "- Apply the term to the exact person, behavior, study, or data in the prompt.",
    "- Explain the mechanism: why the behavior, result, or treatment follows from the concept.",
    "- Avoid one-word answers and avoid repeating the prompt without adding psychology."
  ].join("\n");

  const readMinutes = Math.max(6, Math.ceil(content.split(/\s+/).filter(Boolean).length / 190));

  return {
    id: plan.id,
    title: plan.title,
    slug: plan.slug,
    description: plan.description,
    subject: "AP Psychology",
    unit: plan.unit,
    topic: plan.topic,
    difficulty: plan.difficulty,
    content_markdown: content,
    status: "published",
    cover_image_url: null,
    estimated_reading_time_minutes: readMinutes,
    created_by: null,
    created_at: created,
    updated_at: created,
    published_at: created,
    source_path: sourcePath
  };
}

function main() {
  const markdown = readPacket();
  const sections = splitTopSections(markdown);
  const guides = guidePlan.map((plan) => buildGuide(plan, sections));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(guides, null, 2)}\n`, "utf8");
  console.log(`Wrote ${guides.length} AP Psychology guides to ${outputPath}`);
  for (const guide of guides) {
    console.log(`- ${guide.slug}: ${guide.estimated_reading_time_minutes} min`);
  }
}

main();
