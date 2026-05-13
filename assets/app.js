import { calculateProfile, normalizeProfile } from "./scoring.js";

const ACCESS_STORAGE_KEY = "ku-compass-access";
const app = document.querySelector("#app");
const gate = document.querySelector("#accessGate");
const accessForm = document.querySelector("#accessForm");
const accessCodeInput = document.querySelector("#accessCode");
const accessMessage = document.querySelector("#accessMessage");
const resetAccess = document.querySelector("#resetAccess");
const profileForm = document.querySelector("#profileForm");
const scoreValue = document.querySelector("#scoreValue");
const scoreNumber = document.querySelector("#scoreNumber");
const scoreCanvas = document.querySelector("#scoreCanvas");
const eligibility = document.querySelector("#eligibility");
const recommendations = document.querySelector("#recommendations");
const adviceList = document.querySelector("#adviceList");
const warningList = document.querySelector("#warningList");
const supervisorList = document.querySelector("#supervisorList");
const scholarshipList = document.querySelector("#scholarshipList");
const liveWarnings = document.querySelector("#liveWarnings");
const basisList = document.querySelector("#basisList");
const resultPanel = document.querySelector("#resultPanel");
const outcomeCard = document.querySelector("#outcomeCard");
const prevStep = document.querySelector("#prevStep");
const nextStep = document.querySelector("#nextStep");
const generateReport = document.querySelector("#generateReport");
const stepTabs = [...document.querySelectorAll(".step-tab")];
const formSteps = [...document.querySelectorAll(".form-step")];

const KU_APPLICATION_URL = "https://admissions.ku.ac.ae/";
const KU_POSTGRADUATE_URL = "https://www.ku.ac.ae/postgraduate-admissions";

const REGION_LABELS = {
  "north-america": "北美",
  "uk-europe": "英国/欧洲",
  asia: "亚洲",
  oceania: "澳洲/新西兰",
  "middle-east": "中东"
};

let programs = [];
let schools = {};
let accessConfig = null;
let currentStep = 0;
let maxStepReached = 0;
let reportGenerated = false;

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashCode(code, config) {
  const encoder = new TextEncoder();
  const normalizedCode = code.trim().toUpperCase();
  const key = await crypto.subtle.importKey("raw", encoder.encode(normalizedCode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlToBytes(config.salt),
      iterations: config.iterations
    },
    key,
    256
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

async function verifyAccessCode(code) {
  if (!accessConfig?.enabled) return true;
  const digest = await hashCode(code, accessConfig);
  return digest === accessConfig.hash;
}

function showApp() {
  gate.hidden = true;
  app.hidden = false;
}

function showGate() {
  app.hidden = true;
  gate.hidden = false;
  accessCodeInput.focus();
}

function hasCurrentUnlock() {
  const saved = localStorage.getItem(ACCESS_STORAGE_KEY);
  if (!saved) return false;

  try {
    const parsed = JSON.parse(saved);
    return new Date(parsed.unlockedAt).getTime() >= new Date(accessConfig.updatedAt).getTime();
  } catch {
    localStorage.removeItem(ACCESS_STORAGE_KEY);
    return false;
  }
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

function populateSchools() {
  document.querySelectorAll("[data-region-for]").forEach((select) => {
    select.innerHTML = Object.entries(REGION_LABELS)
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join("");
  });

  updateChinaSchoolOptions("bachelor");
  updateChinaSchoolOptions("master");
  updateOverseasOptions("bachelor");
  updateOverseasOptions("master");
}

function chinaSchoolListFor(level) {
  if (level === "985") return schools.china985 ?? [];
  if (level === "211") return schools.china211Non985 ?? [];
  if (level === "research-institute") return schools.chinaResearchInstitutes ?? [];
  return [];
}

function updateChinaSchoolOptions(stage) {
  const level = profileForm.elements[`${stage}SchoolLevel`]?.value || "985";
  const target = profileForm.querySelector(`[data-china-school-for="${stage}"]`);
  if (!target) return;
  const options = chinaSchoolListFor(level);
  target.innerHTML = options.map((school) => `<option value="${school}">${school}</option>`).join("");

  if (stage === "bachelor" && level === "985" && options.includes("电子科技大学")) {
    target.value = "电子科技大学";
  }

  if (stage === "master" && level === "985" && options.includes("四川大学")) {
    target.value = "四川大学";
  }
}

function updateOverseasOptions(stage) {
  const region = profileForm.elements[`${stage}Region`]?.value || "north-america";
  const target = profileForm.querySelector(`[data-overseas-for="${stage}"]`);
  if (!target) return;
  const options = schools.qsTop100ByRegion?.[region] ?? [];
  target.innerHTML = options.map((school) => `<option value="${school}">${school}</option>`).join("");
}

function updateSchoolVisibility(stage) {
  const origin = profileForm.elements[`${stage}Origin`].value;
  const block = profileForm.elements[`${stage}Origin`].closest(".school-block");
  const level = profileForm.elements[`${stage}SchoolLevel`]?.value || "985";
  const customDomestic = level === "other-domestic";

  block.querySelectorAll(".china-school").forEach((field) => {
    field.hidden = origin === "overseas";
  });
  block.querySelectorAll(".overseas-school").forEach((field) => {
    field.hidden = origin !== "overseas";
  });
  block.querySelectorAll(".china-school-preset").forEach((field) => {
    field.hidden = origin === "overseas" || customDomestic;
  });
  block.querySelectorAll(".china-school-custom").forEach((field) => {
    field.hidden = origin === "overseas" || !customDomestic;
  });
  block.querySelectorAll("input, select").forEach((field) => {
    if (field.closest(".china-school-level")) field.disabled = origin === "overseas";
    if (field.closest(".china-school-preset")) field.disabled = origin === "overseas" || customDomestic;
    if (field.closest(".china-school-custom")) field.disabled = origin === "overseas" || !customDomestic;
    if (field.closest(".overseas-school")) field.disabled = origin !== "overseas";
  });
}

function selectedDegree() {
  return profileForm.querySelector('input[name="targetDegree"]:checked')?.value ?? "phd";
}

function setGroupVisibility(selector, visible) {
  document.querySelectorAll(selector).forEach((element) => {
    element.hidden = !visible;
    element.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = !visible;
    });
  });
}

function updateDegreeVisibility() {
  const degree = selectedDegree();
  const needsMaster = degree === "phd";
  setGroupVisibility(".master-only", needsMaster);
  setGroupVisibility(".direct-phd-only", degree === "direct-phd");
}

function buildProfile() {
  const formData = new FormData(profileForm);
  const degree = formData.get("targetDegree") || selectedDegree();
  formData.set("targetDegree", degree);

  if (degree !== "phd") {
    formData.set("masterMajor", "none");
    formData.set("masterGpa", "0");
    formData.set("masterOrigin", "china");
    formData.set("masterSchoolLevel", "dual-non");
    formData.set("masterSchoolName", "");
  }

  if (degree !== "direct-phd") {
    formData.set("greQuant", "0");
  }

  ["bachelor", "master"].forEach((stage) => {
    if (formData.get(`${stage}Origin`) === "china") {
      const level = formData.get(`${stage}SchoolLevel`);
      const preset = formData.get(`${stage}ChinaSchoolPreset`)?.trim();
      const custom = formData.get(`${stage}SchoolName`)?.trim();
      formData.set(`${stage}SchoolName`, level === "other-domestic" ? custom : preset);
    }

    if (formData.get(`${stage}Origin`) === "overseas") {
      const custom = formData.get(`${stage}OverseasCustom`)?.trim();
      const preset = formData.get(`${stage}OverseasPreset`)?.trim();
      formData.set(`${stage}SchoolName`, custom || preset || "");
      formData.set(`${stage}SchoolLevel`, formData.get(`${stage}RankBand`));
    }
  });
  return normalizeProfile(formData);
}

function setCurrentStep(step) {
  currentStep = Math.max(0, Math.min(formSteps.length - 1, step));
  maxStepReached = Math.max(maxStepReached, currentStep);
  formSteps.forEach((section, index) => {
    const active = index === currentStep;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  stepTabs.forEach((tab, index) => {
    tab.classList.toggle("active", index === currentStep);
    tab.classList.toggle("locked", index > maxStepReached);
  });
  prevStep.hidden = currentStep === 0;
  nextStep.hidden = currentStep === formSteps.length - 1;
  generateReport.hidden = currentStep !== formSteps.length - 1;
  if (currentStep === 2) updateLiveWarnings();
}

function updateLiveWarnings() {
  const result = calculateProfile(buildProfile(), programs, schools);
  renderWarnings(result.warnings);
}

function renderEligibility(items) {
  eligibility.innerHTML = items
    .map(
      (item) => `
        <div class="check-row ${item.passed ? "pass" : "fail"}">
          <span>${item.passed ? "通过" : "待补"}</span>
          <strong>${item.label}</strong>
          <em>${item.value}</em>
          <p>${item.detail}</p>
        </div>
      `
    )
    .join("");
}

function renderWarnings(items) {
  const html = items
    .map(
      (item) => `
        <article class="warning-card ${item.tone}">
          <strong>${item.title}</strong>
          <p>${item.text}</p>
        </article>
      `
    )
    .join("");
  warningList.innerHTML = html;
  liveWarnings.innerHTML = html;
}

function renderRecommendations(items) {
  recommendations.innerHTML = items
    .map(
      (program) => `
        <article class="program-card">
          <div>
            <span>${program.collegeZh}</span>
            <h3>${program.nameZh}</h3>
            <small>${program.nameEn}</small>
          </div>
          <strong>${Math.round(program.fit * 100)}%</strong>
          <p>${program.positioningZh}</p>
          <small>${program.concentrationsZh.join(" / ")}</small>
          <a href="${program.officialUrl}" target="_blank" rel="noreferrer">查看 KU 官方项目页</a>
        </article>
      `
    )
    .join("");
}

function renderInfoList(target, items) {
  target.innerHTML = items
    .map(
      (item) => {
        const links = item.links ?? (item.url ? [{ label: "官方来源", url: item.url }] : []);
        return `
          <article class="info-card">
            <strong>${item.title}</strong>
            <p>${item.text}</p>
            ${
              links.length > 0
                ? `<div class="link-list">${links
                    .map((link) => `<a href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>`)
                    .join("")}</div>`
                : ""
            }
          </article>
        `;
      }
    )
    .join("");
}

function renderAdvice(items) {
  adviceList.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function primaryAction(result) {
  if (result.probability >= 70) {
    return {
      tone: "strong",
      label: "高匹配，可以准备正式申请",
      title: "把 KU 作为主申目标",
      text: "先确认当季申请是否开放，再按推荐项目准备 SOP、Research Statement、推荐信和语言/GRE 材料。",
      actions: [
        { label: "打开 KU 申请入口", url: KU_APPLICATION_URL },
        { label: "查看申请要求", url: KU_POSTGRADUATE_URL }
      ]
    };
  }

  if (result.probability <= 33) {
    return {
      tone: "low",
      label: "当前风险较高",
      title: "不建议只押 KU",
      text: "这不代表不能留学，只是 KU 当前匹配度偏吃力。中东地区有不少奖学金丰厚的院校，可以先看店铺其他商品；后续会补一份中东地区选校指南。",
      actions: [{ label: "查看 KU 官方要求", url: KU_POSTGRADUATE_URL }]
    };
  }

  return {
    tone: "medium",
    label: "有机会，但需要补强",
    title: "先补最短板，再决定是否递交",
    text: "建议优先处理硬门槛、科研证据和导师匹配；如果推荐项目高度契合，可以把 KU 放入冲刺或重点尝试名单。",
    actions: [{ label: "查看 KU 申请要求", url: KU_POSTGRADUATE_URL }]
  };
}

function renderOutcome(result, profile) {
  const action = primaryAction(result);
  const topProgram = result.recommendations[0];
  const failedMinimums = result.eligibility.filter((item) => !item.passed).length;
  const fundingPoint =
    profile.targetDegree === "master" ? "奖学金预期：以正式 offer 和 scholarship letter 为准" : "奖学金预期：博士按 Tier III / CSC-KU 分开判断";
  const actionLinks = action.actions
    .map((link) => `<a href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>`)
    .join("");

  outcomeCard.className = `outcome-card ${action.tone}`;
  outcomeCard.innerHTML = `
    <span>${action.label}</span>
    <h3>${action.title}</h3>
    <p>${action.text}</p>
    <div class="outcome-points">
      <b>首选项目：${topProgram ? `${topProgram.nameZh} / ${topProgram.nameEn}` : "暂无明确推荐"}</b>
      <b>硬门槛：${failedMinimums === 0 ? "已通过当前填写项" : `${failedMinimums} 项需先补齐`}</b>
      <b>${fundingPoint}</b>
    </div>
    <div class="outcome-actions">${actionLinks}</div>
  `;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function renderBasis(result) {
  const d = result.dimensions;
  const items = [
    ["GPA", d.academic],
    ["语言", d.english],
    ["学校", d.school],
    ["科研", d.research],
    ["推荐信", d.recommendation],
    ["导师匹配", d.supervisor],
    ["文书", d.documents]
  ];
  basisList.innerHTML = `
    <article class="basis-card">
      <strong>计算依据</strong>
      <p><b>${result.calculation.weightedScore}/100</b> 为当前申请力加权分，学位难度系数 <b>${result.calculation.degreeDifficulty}</b>。分数用于排序优先级，不等于录取承诺。</p>
      <div class="basis-grid">
        ${items.map(([label, value]) => `<span>${label}<b>${percent(value)}</b></span>`).join("")}
      </div>
    </article>
  `;
}

function drawRadar(dimensions, probability) {
  const ctx = scoreCanvas.getContext("2d");
  const { width, height } = scoreCanvas;
  const center = width / 2;
  const radius = 78;
  const entries = [
    ["GPA", dimensions.academic],
    ["语言", dimensions.english],
    ["科研", dimensions.research],
    ["导师", dimensions.supervisor],
    ["学校", dimensions.school],
    ["文书", dimensions.documents]
  ];

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#d9e2df";

  for (let ring = 1; ring <= 4; ring += 1) {
    ctx.beginPath();
    entries.forEach((_, index) => {
      const angle = (Math.PI * 2 * index) / entries.length - Math.PI / 2;
      const pointRadius = (radius * ring) / 4;
      const x = center + Math.cos(angle) * pointRadius;
      const y = center + Math.sin(angle) * pointRadius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  entries.forEach(([label], index) => {
    const angle = (Math.PI * 2 * index) / entries.length - Math.PI / 2;
    const x = center + Math.cos(angle) * (radius + 20);
    const y = center + Math.sin(angle) * (radius + 20);
    ctx.fillStyle = "#49615b";
    ctx.font = "12px sans-serif";
    ctx.textAlign = x < center - 8 ? "right" : x > center + 8 ? "left" : "center";
    ctx.fillText(label, x, y + 4);
  });

  ctx.beginPath();
  entries.forEach(([, value], index) => {
    const angle = (Math.PI * 2 * index) / entries.length - Math.PI / 2;
    const pointRadius = radius * value;
    const x = center + Math.cos(angle) * pointRadius;
    const y = center + Math.sin(angle) * pointRadius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 87, 184, 0.2)";
  ctx.strokeStyle = "#0057b8";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#13231f";
  ctx.font = "700 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${probability}%`, center, center + 10);
}

function renderResult() {
  const profile = buildProfile();
  const result = calculateProfile(profile, programs, schools);
  reportGenerated = true;
  resultPanel.hidden = false;
  scoreNumber.textContent = `${result.probability}%`;
  scoreValue.textContent = result.band;
  renderOutcome(result, profile);
  renderWarnings(result.warnings);
  renderBasis(result);
  renderEligibility(result.eligibility);
  renderRecommendations(result.recommendations);
  renderInfoList(supervisorList, result.supervisorSuggestions);
  renderInfoList(scholarshipList, result.scholarshipInfo);
  renderAdvice(result.advice);
  drawRadar(result.dimensions, result.probability);
}

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessMessage.textContent = "校验中...";
  const ok = await verifyAccessCode(accessCodeInput.value);
  if (ok) {
    localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify({ unlockedAt: new Date().toISOString() }));
    showApp();
    accessMessage.textContent = "";
  } else {
    accessMessage.textContent = "验证码不正确或已过期。";
  }
});

resetAccess.addEventListener("click", () => {
  localStorage.removeItem(ACCESS_STORAGE_KEY);
  showGate();
});

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (currentStep !== formSteps.length - 1) {
    setCurrentStep(currentStep + 1);
    return;
  }
  setCurrentStep(formSteps.length - 1);
  renderResult();
  resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

profileForm.addEventListener("input", () => {
  if (currentStep === 2 || reportGenerated) updateLiveWarnings();
  if (reportGenerated) resultPanel.hidden = true;
  reportGenerated = false;
});
profileForm.addEventListener("change", (event) => {
  const originStage = event.target.dataset.originFor;
  const regionStage = event.target.dataset.regionFor;
  const schoolStage = event.target.dataset.schoolLevelFor;
  if (event.target.name === "targetDegree") updateDegreeVisibility();
  if (originStage) updateSchoolVisibility(originStage);
  if (regionStage) updateOverseasOptions(regionStage);
  if (schoolStage) {
    updateChinaSchoolOptions(schoolStage);
    updateSchoolVisibility(schoolStage);
  }
  if (currentStep === 2 || reportGenerated) updateLiveWarnings();
  if (reportGenerated) resultPanel.hidden = true;
  reportGenerated = false;
});

prevStep.addEventListener("click", () => setCurrentStep(currentStep - 1));
nextStep.addEventListener("click", () => setCurrentStep(currentStep + 1));
stepTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = Number(tab.dataset.stepTarget);
    if (target <= maxStepReached) setCurrentStep(target);
  });
});

async function boot() {
  [programs, schools, accessConfig] = await Promise.all([
    loadJson("data/programs.json"),
    loadJson("data/schools.json"),
    loadJson("data/access-code.json")
  ]);
  populateSchools();
  updateSchoolVisibility("bachelor");
  updateSchoolVisibility("master");
  updateDegreeVisibility();
  setCurrentStep(0);

  if (accessConfig.enabled && !hasCurrentUnlock()) {
    showGate();
  } else {
    showApp();
  }
}

boot().catch((error) => {
  console.error(error);
  gate.hidden = false;
  gate.querySelector("p").textContent = "页面数据加载失败，请稍后刷新。";
});
