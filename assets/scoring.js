const DEGREE_LABELS = {
  master: "硕士 Master",
  phd: "常规博士 Regular PhD",
  "direct-phd": "本科直博 Direct PhD"
};

const MAJOR_ALIASES = {
  "computer-science": ["computer-science", "ai-data", "cyber-systems", "math"],
  electrical: ["electrical", "cyber-systems", "robotics", "energy-sustainability", "computer-science"],
  mechanical: ["mechanical", "robotics", "aerospace", "energy-sustainability"],
  chemical: ["chemical", "materials-chemistry", "energy-sustainability"],
  civil: ["civil", "energy-sustainability", "systems-management"],
  biomedical: ["biomedical", "bio-health", "materials-chemistry"],
  energy: ["energy", "energy-sustainability", "chemical", "mechanical"],
  math: ["math", "math-physics", "ai-data", "computer-science"],
  management: ["management", "systems-management", "ai-data"],
  none: []
};

const SCHOOL_LEVEL_LABELS = {
  c9: "C9/顶尖 985",
  "ku-peer": "KU 在读博士常见来源相近",
  "985": "985",
  "211": "211",
  "research-institute": "中科院/科研院所",
  "other-domestic": "双非/其他国内院校",
  "dual-non": "双非/普通本科",
  "qs-top-20": "QS Top 20",
  "qs-21-50": "QS 21-50",
  "qs-51-100": "QS 51-100",
  "overseas-other": "海外其他正规大学"
};

const REFERENCE_PEERS = ["电子科技大学", "四川大学", "西北工业大学", "中国科学院大学", "中科院"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[()]/g, "（）")
    .toLowerCase();
}

function includesSchool(list = [], name) {
  const normalized = normalizeText(name);
  return list.some((school) => normalizeText(school) === normalized);
}

function isPeerSchool(name, schools) {
  const normalized = normalizeText(name);
  return [...REFERENCE_PEERS, ...(schools?.kuPeerSchools ?? [])].some((school) => {
    const candidate = normalizeText(school);
    return normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized);
  });
}

function englishMeets(profile) {
  return numberValue(profile.ielts) >= 6.5 || numberValue(profile.toefl) >= 91;
}

function calculateEligibility(profile) {
  const bachelorGpa = numberValue(profile.bachelorGpa);
  const masterGpa = numberValue(profile.masterGpa);
  const greQuant = numberValue(profile.greQuant);
  const degree = profile.targetDegree;
  const checks = [];

  if (degree === "master") {
    checks.push({
      label: "Bachelor CGPA 本科 CGPA >= 3.0/4.0",
      passed: bachelorGpa >= 3,
      value: bachelorGpa.toFixed(2),
      detail: "KU 官方硕士最低 GPA 基线。"
    });
  }

  if (degree === "phd") {
    checks.push({
      label: "Bachelor CGPA 本科 CGPA >= 3.0/4.0",
      passed: bachelorGpa >= 3,
      value: bachelorGpa.toFixed(2),
      detail: "常规博士仍会审本科成绩。"
    });
    checks.push({
      label: "硕士 CGPA Master CGPA >= 3.25/4.0",
      passed: masterGpa >= 3.25,
      value: masterGpa.toFixed(2),
      detail: "常规博士申请的核心硬门槛之一。"
    });
  }

  if (degree === "direct-phd") {
    checks.push({
      label: "Bachelor CGPA 本科 CGPA >= 3.5/4.0",
      passed: bachelorGpa >= 3.5,
      value: bachelorGpa.toFixed(2),
      detail: "本科直博路径对本科 GPA 要求更高。"
    });
    checks.push({
      label: "GRE Quantitative >= 150",
      passed: greQuant >= 150,
      value: String(greQuant),
      detail: "KU 官方直博最低 GRE Quantitative 基线。"
    });
  }

  checks.push({
    label: "English 英语 IELTS 6.5 或 TOEFL iBT 91",
    passed: englishMeets(profile),
    value: `IELTS ${numberValue(profile.ielts).toFixed(1)} / TOEFL ${numberValue(profile.toefl)}`,
    detail: "KU 官方研究生英语最低要求是 IELTS 6.5 或 TOEFL iBT 91。"
  });

  if (degree !== "master") {
    checks.push({
      label: "Research Statement 博士研究陈述",
      passed: profile.documents !== "not-ready",
      value: profile.documents === "ready" ? "已成型" : profile.documents === "draft" ? "草稿" : "未开始",
      detail: "PhD 申请需要用研究陈述证明和导师/项目的匹配。"
    });
  }

  return checks;
}

function scoreSchoolStage(origin, level, name, rankBand, schools) {
  if (isPeerSchool(name, schools) || level === "ku-peer") {
    return { score: 1, label: "与当前 KU 中国博士常见来源高度相近", peerMatched: true };
  }

  if (origin === "overseas") {
    const overseasScore = {
      "qs-top-20": 0.95,
      "qs-21-50": 0.88,
      "qs-51-100": 0.8,
      "overseas-other": 0.56
    }[rankBand || level];
    return {
      score: overseasScore ?? 0.58,
      label: SCHOOL_LEVEL_LABELS[rankBand || level] ?? "海外正规大学",
      peerMatched: false
    };
  }

  if (includesSchool(schools?.china985, name)) {
    return { score: 0.86, label: "985", peerMatched: false };
  }

  if (includesSchool(schools?.china211Non985, name)) {
    return { score: 0.74, label: "211", peerMatched: false };
  }

  if (includesSchool(schools?.chinaResearchInstitutes, name)) {
    return { score: 0.78, label: "中科院/科研院所", peerMatched: false };
  }

  const declaredScore = {
    c9: 0.92,
    "985": 0.84,
    "211": 0.72,
    "research-institute": 0.78,
    "other-domestic": 0.45,
    "dual-non": 0.45
  }[level];

  return {
    score: declaredScore ?? 0.5,
    label: SCHOOL_LEVEL_LABELS[level] ?? "学校层级待确认",
    peerMatched: false
  };
}

function schoolProfile(profile, schools) {
  const bachelor = scoreSchoolStage(
    profile.bachelorOrigin,
    profile.bachelorSchoolLevel,
    profile.bachelorSchoolName,
    profile.bachelorRankBand,
    schools
  );
  const master = scoreSchoolStage(
    profile.masterOrigin,
    profile.masterSchoolLevel,
    profile.masterSchoolName,
    profile.masterRankBand,
    schools
  );
  const hasMaster = profile.masterMajor !== "none" && profile.masterSchoolName;
  const score = hasMaster ? Math.max(master.score, bachelor.score * 0.92) : bachelor.score;
  const anchor = hasMaster && master.score >= bachelor.score * 0.92 ? "硕士学校" : "本科学校";

  return {
    score,
    anchor,
    bachelor,
    master,
    peerMatched: bachelor.peerMatched || master.peerMatched,
    note: `${anchor}按 ${hasMaster && master.score >= bachelor.score * 0.92 ? master.label : bachelor.label} 计入。`
  };
}

function researchProfile(profile) {
  const journalCount = numberValue(profile.journalPapers);
  const conferenceCount = numberValue(profile.conferencePapers);
  const projectCount = numberValue(profile.researchProjects);
  const levelScore = {
    none: 0,
    "sci-q1": 1,
    "sci-q2": 0.82,
    "sci-q3": 0.64,
    "sci-other": 0.5,
    core: 0.44,
    other: 0.32
  }[profile.bestJournalLevel] ?? 0;
  const conferenceScore = {
    none: 0,
    "ccf-a": 1,
    "ccf-b": 0.82,
    "ccf-c": 0.62,
    international: 0.52,
    other: 0.34
  }[profile.bestConferenceLevel] ?? 0;
  const authorScore = {
    first: 1,
    cofirst: 0.86,
    corresponding: 0.82,
    second: 0.62,
    coauthor: 0.42,
    none: 0.16
  }[profile.authorPosition] ?? 0.2;
  const countScore = clamp((journalCount * 1.25 + conferenceCount + projectCount * 0.35) / 4, 0, 1);
  const bestVenue = Math.max(levelScore, conferenceScore);
  const score = clamp(bestVenue * 0.44 + authorScore * 0.24 + countScore * 0.22 + Math.min(projectCount, 3) * 0.035, 0, 1);

  return {
    score: Math.max(score, projectCount > 0 ? 0.42 : 0),
    journalCount,
    conferenceCount,
    projectCount,
    bestVenue,
    authorScore
  };
}

function dimensionScores(profile, schools = {}) {
  const bachelorGpa = numberValue(profile.bachelorGpa);
  const masterGpa = numberValue(profile.masterGpa);
  const greQuant = numberValue(profile.greQuant);
  const englishScore = Math.max(
    clamp((numberValue(profile.ielts) - 5.5) / 2, 0, 1),
    clamp((numberValue(profile.toefl) - 79) / 21, 0, 1)
  );
  const gpaAnchor = profile.targetDegree === "phd" ? Math.max(bachelorGpa, masterGpa) : bachelorGpa;
  const academic = clamp((gpaAnchor - 2.8) / 1.0, 0, 1);
  const gre = profile.targetDegree === "direct-phd" ? clamp((greQuant - 148) / 14, 0, 1) : 0.65;
  const school = schoolProfile(profile, schools);
  const research = researchProfile(profile);
  const recommendationBase = { strong: 0.9, normal: 0.65, weak: 0.35 }[profile.recommendation] ?? 0.55;
  const recommenderBonus = { professor: 0.12, "associate-professor": 0.08, "ku-related": 0.15, lecturer: 0.02 }[
    profile.recommenderLevel
  ] ?? 0;
  const recommendation = clamp(recommendationBase + recommenderBonus, 0, 1);
  const supervisor = { clear: 0.9, some: 0.68, none: 0.32 }[profile.supervisorFit] ?? 0.5;
  const documents = { ready: 0.88, draft: 0.62, "not-ready": 0.28 }[profile.documents] ?? 0.5;

  return {
    academic,
    english: englishScore,
    gre,
    school: school.score,
    schoolDetail: school,
    research: research.score,
    researchDetail: research,
    recommendation,
    supervisor,
    documents
  };
}

function rankPrograms(profile, programs) {
  const degree = profile.targetDegree === "direct-phd" ? "phd" : profile.targetDegree;
  const backgroundTokens = new Set([
    profile.researchArea,
    profile.bachelorMajor,
    profile.masterMajor,
    ...(MAJOR_ALIASES[profile.bachelorMajor] ?? []),
    ...(MAJOR_ALIASES[profile.masterMajor] ?? [])
  ]);

  return programs
    .filter((program) => program.degrees.includes(degree))
    .map((program) => {
      const keywordHits = program.keywords.filter((keyword) => backgroundTokens.has(keyword)).length;
      const majorHits = program.idealBackground.filter((major) => backgroundTokens.has(major)).length;
      const focusHit = program.keywords.includes(profile.researchArea) ? 1 : 0;
      const fit = clamp(keywordHits * 0.13 + majorHits * 0.15 + focusHit * 0.34 + 0.2, 0.1, 0.98);
      return { ...program, fit };
    })
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 6);
}

function estimateProbability(profile, programs, schools) {
  const dimensions = dimensionScores(profile, schools);
  const eligibility = calculateEligibility(profile);
  const failedMinimums = eligibility.filter((check) => !check.passed);
  const bestFit = rankPrograms(profile, programs)[0]?.fit ?? 0.35;
  const degreeDifficulty = { master: 1.04, phd: 0.92, "direct-phd": 0.82 }[profile.targetDegree] ?? 0.92;
  const weightedScore =
    dimensions.academic * 18 +
    dimensions.english * 8 +
    dimensions.gre * 4 +
    dimensions.school * 14 +
    dimensions.research * 16 +
    dimensions.recommendation * 7 +
    dimensions.supervisor * 12 +
    dimensions.documents * 6 +
    bestFit * 15;
  const minimumPenalty = failedMinimums.length * 14;
  const peerBoost = dimensions.schoolDetail.peerMatched ? 4 : 0;
  const rawProbability = weightedScore * degreeDifficulty + peerBoost - minimumPenalty;
  const hardCap = failedMinimums.length > 0 ? (profile.targetDegree === "direct-phd" ? 42 : 48) : 92;
  const probability = clamp(Math.round(Math.min(rawProbability, hardCap)), 6, 92);

  return {
    probability,
    dimensions,
    eligibility,
    calculation: {
      weightedScore: Math.round(weightedScore),
      degreeDifficulty,
      minimumPenalty,
      peerBoost,
      hardCap
    },
    band: probability >= 72 ? "强匹配" : probability >= 52 ? "中等机会" : probability >= 34 ? "偏挑战" : "高风险"
  };
}

function buildWarnings(profile, result) {
  const warnings = [];
  const ielts = numberValue(profile.ielts);
  const toefl = numberValue(profile.toefl);

  if (ielts > 0 && ielts < 6.5) {
    warnings.push({
      tone: toefl >= 91 ? "warn" : "danger",
      title: "IELTS 低于 KU 官方最低线",
      text: "KU 研究生申请英语最低要求为 IELTS 6.5 或 TOEFL iBT 91；如果用 TOEFL 达标，IELTS 低分不建议主动强调。"
    });
  }

  if (toefl > 0 && toefl < 91) {
    warnings.push({
      tone: ielts >= 6.5 ? "warn" : "danger",
      title: "TOEFL iBT 低于 91",
      text: "如果 IELTS 已达 6.5，可用 IELTS 覆盖；如果两项都低于线，建议先补语言再递交。"
    });
  }

  result.eligibility
    .filter((check) => !check.passed)
    .forEach((check) => {
      warnings.push({ tone: "danger", title: "硬性门槛未满足", text: `${check.label} 当前为 ${check.value}。${check.detail}` });
    });

  if (result.dimensions.research < 0.5 && profile.targetDegree !== "master") {
    warnings.push({
      tone: "warn",
      title: "博士申请科研证据偏弱",
      text: "KU PhD 更看重研究潜力。建议至少补一个可被导师理解的论文、会议、实验室项目或 Research Statement 核心问题。"
    });
  }

  return warnings.slice(0, 6);
}

function buildAdvice(profile, result) {
  const advice = [];
  const missing = result.eligibility.filter((check) => !check.passed);

  if (missing.length > 0) {
    advice.push(`先补硬门槛：${missing.map((item) => item.label).join("、")}。`);
  }

  if (result.dimensions.schoolDetail.peerMatched) {
    advice.push("你的学校背景与当前 KU 中国博士常见来源相近，建议重点打磨科研匹配和导师邮件。");
  } else if (result.dimensions.school < 0.58) {
    advice.push("学校背景不占优势时，论文质量、导师匹配和 Research Statement 要承担更多解释作用。");
  }

  if (result.dimensions.research < 0.55) {
    advice.push("科研经历要从“做过项目”改成“解决了什么问题、用了什么方法、产出了什么结果”。");
  }

  if (result.dimensions.supervisor < 0.55) {
    advice.push("先按推荐项目的英文方向词去 KU 官网筛 6-8 位潜在导师，再写套磁邮件。");
  }

  if (profile.targetDegree === "direct-phd" && result.dimensions.gre < 0.65) {
    advice.push("本科直博路径对 GPA 和 GRE 更敏感，GRE Quant 建议尽量冲到 158+。");
  }

  if (result.dimensions.documents < 0.55) {
    advice.push("SOP 解释动机和匹配，Research Statement 证明你已经能提出研究问题。");
  }

  advice.push("最终录取和奖学金以 KU 正式 offer 与奖学金条款为准，本工具只做选项优先级判断。");
  return advice.slice(0, 6);
}

function buildSupervisorSuggestions(recommendations) {
  return recommendations.slice(0, 4).map((program) => ({
    title: `${program.nameZh} / ${program.nameEn}`,
    text: `导师筛选应围绕 ${program.concentrationsZh.join("、")}。建议先打开对应项目页，再从院系 Faculty 或 Research Areas 里筛 3-5 位方向相近的导师。`,
    url: program.officialUrl
  }));
}

function buildScholarshipInfo(profile) {
  if (profile.targetDegree === "master") {
    return [
      {
        title: "硕士奖学金",
        text: "硕士奖学金名额、津贴和条件需以 KU 当年正式 offer 与 scholarship letter 为准。"
      }
    ];
  }

  return [
    {
      title: "KU PhD Scholarship",
      text: "官方奖学金目录列出 PhD Tier I 基本月津贴 AED 20,000；额外月津贴 AED 20,000 需满足审批与学业进展条件。"
    },
    {
      title: "CSC-KU PhD Scholarship",
      text: "KU 官方目录列出 CSC-KU PhD 学生由 KU 提供每月 AED 9,200，CSC 另提供 additional stipend；公开 KU 目录未写明 CSC 侧具体金额。"
    },
    {
      title: "Writing Qualifying Exam",
      text: "在读反馈：PhD 第二学期通常有 Writing Qualifying Exam，通过率约 85%；若第一次未过，奖学金可能暂停 6 个月，第二次通过后恢复，仍未通过可能退学。此条按在读反馈展示，非官网承诺。"
    }
  ];
}

function normalizeProfile(formData) {
  return {
    targetDegree: formData.get("targetDegree"),
    bachelorMajor: formData.get("bachelorMajor"),
    masterMajor: formData.get("masterMajor"),
    researchArea: formData.get("researchArea"),
    bachelorGpa: numberValue(formData.get("bachelorGpa")),
    masterGpa: numberValue(formData.get("masterGpa")),
    ielts: numberValue(formData.get("ielts")),
    toefl: numberValue(formData.get("toefl")),
    greQuant: numberValue(formData.get("greQuant")),
    bachelorOrigin: formData.get("bachelorOrigin"),
    bachelorSchoolLevel: formData.get("bachelorSchoolLevel"),
    bachelorSchoolName: formData.get("bachelorSchoolName"),
    bachelorRegion: formData.get("bachelorRegion"),
    bachelorRankBand: formData.get("bachelorRankBand"),
    masterOrigin: formData.get("masterOrigin"),
    masterSchoolLevel: formData.get("masterSchoolLevel"),
    masterSchoolName: formData.get("masterSchoolName"),
    masterRegion: formData.get("masterRegion"),
    masterRankBand: formData.get("masterRankBand"),
    journalPapers: numberValue(formData.get("journalPapers")),
    conferencePapers: numberValue(formData.get("conferencePapers")),
    researchProjects: numberValue(formData.get("researchProjects")),
    bestJournalLevel: formData.get("bestJournalLevel"),
    bestConferenceLevel: formData.get("bestConferenceLevel"),
    authorPosition: formData.get("authorPosition"),
    recommendation: formData.get("recommendation"),
    recommenderLevel: formData.get("recommenderLevel"),
    supervisorFit: formData.get("supervisorFit"),
    documents: formData.get("documents")
  };
}

function calculateProfile(profile, programs, schools = {}) {
  const result = estimateProbability(profile, programs, schools);
  const recommendations = rankPrograms(profile, programs);
  const warnings = buildWarnings(profile, result);
  const advice = buildAdvice(profile, result);
  return {
    degreeLabel: DEGREE_LABELS[profile.targetDegree] ?? profile.targetDegree,
    ...result,
    recommendations,
    warnings,
    advice,
    supervisorSuggestions: buildSupervisorSuggestions(recommendations),
    scholarshipInfo: buildScholarshipInfo(profile)
  };
}

export {
  calculateEligibility,
  calculateProfile,
  clamp,
  dimensionScores,
  estimateProbability,
  normalizeProfile,
  rankPrograms,
  researchProfile,
  schoolProfile
};
