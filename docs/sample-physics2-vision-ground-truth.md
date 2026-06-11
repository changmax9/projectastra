# Sample Physics 2 Vision Ground Truth

Created from rendered page images before OCR was run on these pages.

Protocol:

- Source: `物理2简答题 选择题.pdf`
- Pages were rendered without OCR.
- Classification and observations below were produced from visual inspection only.
- This file is the fixed comparison reference for the later raw-Tesseract run.

| PDF page | Vision classification | Keep as question content? | Visible structure and key content |
| --- | --- | --- | --- |
| 150 | MCQ prompt page | Yes | Questions 6 and 7. Both have four diagram-based choices A-D. Q6 concerns induced charge on two conducting spheres. Q7 concerns x/y velocity graphs for a positive charge entering a uniform electric field. |
| 170 | FRQ continuation page | Yes, attach to preceding FRQ | Part (b), subparts i-iii, about lifting a cube from a pool with a crane. Contains a force-diagram drawing grid. No standalone question number on this page. |
| 190 | Performance-data/reference table | No | Title: `2017 AP Physics 2: Algebra-Based Question Descriptors and Performance Data`. Dense table of question numbers, learning objectives, keys, and percent correct. |
| 205 | MCQ prompt page | Yes | Questions 18 and 19 with four choices each. Q18 uses three reservoir diagrams. Q19 uses a hydrogen-like atom energy-level diagram and asks about absorbing a photon of frequency `2.18 x 10^15 Hz`. |
| 255 | MCQ prompt page | Yes | Questions 27 and 28. Q27 has four diagram-only ion-distribution choices A-D. Q28 asks how final equilibrium temperature T2 compares with T1 and has four textual choices. |
| 325 | Exam-description/reference page | No | Tables describing section timing, scoring, question types, and number of questions. Not an exam prompt. |
| 365 | Answer-key page | No | Heading `Answers to Multiple-Choice Questions`; compact answer list for questions 1-50. |
| 405 | Formula/reference sheet | No | `Table of Information Developed for 2012`; constants, unit symbols, prefixes, trigonometric values, and conventions. |
| 525 | Scoring-guideline page | No | `AP Physics 2 2017 Scoring Guidelines`, Question 2, 12 points total, distribution of points and point-award criteria. |
| 570 | FRQ continuation page | Yes, attach to preceding FRQ | 2015 AP Physics 2 free-response continuation, part (d), electron motion through a uniform magnetic field. Includes a required diagram and subparts i-ii. Ends with `STOP / END OF EXAM`. |
| 610 | FRQ prompt page | Yes | 2013 AP Physics B free-response Question 3, 10 points. Refraction experiment with semicircular plastic block, diagram, data table, and graphing grid. |
| 650 | Scoring-guideline page | No | `AP Physics B 2012 Scoring Guidelines`, Question 2 continued, point distribution, equations, and alternate solution. |

## Vision-side expected selection

- Keep: 150, 170, 205, 255, 570, 610
- Reject: 190, 325, 365, 405, 525, 650

## Vision-side strengths to compare

- Recognizes diagram-only choices as choices even when they contain almost no text.
- Distinguishes FRQ continuation pages from standalone questions.
- Understands that a table can be metadata/reference material rather than a question.
- Preserves visual relationships such as graph choices, energy levels, ion distributions, and required drawing regions.
