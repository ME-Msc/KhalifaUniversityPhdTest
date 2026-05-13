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

assert.ok(strong.probability > risky.probability, "strong profile should score higher than risky profile");
assert.ok(strong.recommendations.length > 0, "strong profile should produce recommendations");
assert.ok(strong.recommendations[0].nameZh && strong.recommendations[0].nameEn, "recommendations should be bilingual");
assert.ok(strong.supervisorSuggestions.length > 0, "supervisor suggestions should be present");
assert.ok(strong.supervisorSuggestions[0].links?.[0]?.url.includes("ku.ac.ae"), "supervisor suggestions should use KU faculty links");
assert.ok(!strong.supervisorSuggestions[0].url, "supervisor suggestions should not fall back to only one program page link");
assert.ok(!strong.supervisorSuggestions.some((item) => item.text.includes("筛 3-5 位")), "supervisor suggestions should stay concise");
assert.ok(strong.scholarshipInfo.some((item) => item.text.includes("Tier III")), "PhD scholarship guidance should use Tier III as the practical expectation");
assert.ok(!strong.scholarshipInfo.some((item) => item.text.includes("Tier I 基本月津贴")), "PhD scholarship guidance should not frame Tier I as the practical default");
assert.ok(risky.eligibility.some((check) => !check.passed), "risky direct PhD should fail at least one minimum");
assert.ok(risky.warnings.some((warning) => warning.title.includes("IELTS")), "low IELTS should produce a warning");
assert.equal(rankPrograms(strongProfile, programs)[0].degrees.includes("phd"), true);
assert.equal(schoolProfile(strongProfile, schools).peerMatched, true);

console.log("scoring tests passed");
