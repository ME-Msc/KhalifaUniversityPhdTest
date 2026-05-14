import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateProfile, rankPrograms, schoolProfile } from "../assets/scoring.js";

const programs = JSON.parse(readFileSync(new URL("../data/programs.json", import.meta.url), "utf8"));
const schools = JSON.parse(readFileSync(new URL("../data/schools.json", import.meta.url), "utf8"));

const strongProfile = {
  targetDegree: "phd",
  bachelorMajor: "electrical",
  masterMajor: "computer-science",
  researchArea: "ai-data",
  bachelorGpa: 3.65,
  masterGpa: 3.8,
  ielts: 7,
  toefl: 100,
  greQuant: 162,
  bachelorOrigin: "china",
  bachelorSchoolLevel: "985",
  bachelorSchoolName: "电子科技大学",
  masterOrigin: "china",
  masterSchoolLevel: "985",
  masterSchoolName: "四川大学",
  journalPapers: 2,
  conferencePapers: 1,
  bestJournalLevel: "sci-q1",
  bestConferenceLevel: "ccf-b",
  authorPosition: "first",
  researchProjects: 3,
  recommendation: "strong",
  recommenderLevel: "professor",
  supervisorFit: "clear",
  documents: "ready"
};

const riskyProfile = {
  targetDegree: "direct-phd",
  bachelorMajor: "management",
  masterMajor: "none",
  researchArea: "robotics",
  bachelorGpa: 3.25,
  masterGpa: 0,
  ielts: 6,
  toefl: 82,
  greQuant: 148,
  bachelorOrigin: "china",
  bachelorSchoolLevel: "other-domestic",
  bachelorSchoolName: "某普通本科",
  masterOrigin: "china",
  masterSchoolLevel: "other-domestic",
  masterSchoolName: "",
  journalPapers: 0,
  conferencePapers: 0,
  bestJournalLevel: "none",
  bestConferenceLevel: "none",
  authorPosition: "none",
  researchProjects: 0,
  recommendation: "weak",
  recommenderLevel: "lecturer",
  supervisorFit: "none",
  documents: "not-ready"
};

const strong = calculateProfile(strongProfile, programs, schools);
const risky = calculateProfile(riskyProfile, programs, schools);
const scholarshipCopy = strong.scholarshipInfo
  .flatMap((item) => [item.text, ...(item.points ?? [])])
  .filter(Boolean)
  .join("\n");
const repeatedPositioningTerms = programs.flatMap((program) =>
  program.concentrationsZh
    .filter((concentration) => concentration.length >= 4 && program.positioningZh.includes(concentration))
    .map((concentration) => `${program.nameZh}: ${concentration}`)
);

assert.ok(strong.probability > risky.probability, "strong profile should score higher than risky profile");
assert.ok(strong.recommendations.length > 0, "strong profile should produce recommendations");
assert.ok(strong.recommendations[0].nameZh && strong.recommendations[0].nameEn, "recommendations should be bilingual");
assert.deepEqual(repeatedPositioningTerms, [], "positioning copy should not repeat long concentration labels");
assert.ok(strong.supervisorSuggestions.length > 0, "supervisor suggestions should be present");
assert.ok(strong.supervisorSuggestions[0].links?.[0]?.url.includes("ku.ac.ae"), "supervisor suggestions should use KU faculty links");
assert.ok(strong.supervisorSuggestions[0].links?.[0]?.url.endsWith("#people"), "supervisor links should jump to people sections");
assert.ok(
  !strong.supervisorSuggestions.some((item) => item.links?.some((link) => link.label.includes("教师 / Faculty"))),
  "supervisor link labels should be concise"
);
assert.ok(!strong.supervisorSuggestions[0].url, "supervisor suggestions should not fall back to only one program page link");
assert.ok(!strong.supervisorSuggestions.some((item) => item.text.includes("筛 3-5 位")), "supervisor suggestions should stay concise");
assert.deepEqual(
  strong.scholarshipInfo.map((item) => item.title),
  ["奖学金", "入学后 GPA 要求", "Writing Qualifying Exam", "毕业要求"],
  "PhD risk guidance should be grouped into clear sections"
);
assert.ok(scholarshipCopy.includes("AED 14,500"), "PhD scholarship guidance should include current-student cash-flow estimate");
assert.ok(scholarshipCopy.includes("AED 9,200"), "KU-CSC guidance should include the KU-side monthly stipend");
assert.ok(scholarshipCopy.includes("USD 2,000"), "KU-CSC guidance should include the CSC-side monthly stipend");
assert.ok(scholarshipCopy.includes("2026 年通过率约 80%"), "WQE guidance should include the 2026 current-student pass-rate estimate");
assert.ok(scholarshipCopy.includes("GPA 低于 3.2"), "KU scholarship GPA pause threshold should be included");
assert.ok(scholarshipCopy.includes("Q1 期刊"), "graduation Q1 journal note should be included");
assert.ok(risky.eligibility.some((check) => !check.passed), "risky direct PhD should fail at least one minimum");
assert.ok(risky.warnings.some((warning) => warning.title.includes("IELTS")), "low IELTS should produce a warning");
assert.equal(rankPrograms(strongProfile, programs)[0].degrees.includes("phd"), true);
assert.equal(schoolProfile(strongProfile, schools).peerMatched, true);

console.log("scoring tests passed");
