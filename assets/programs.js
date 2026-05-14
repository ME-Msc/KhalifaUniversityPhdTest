const ACCESS_STORAGE_KEY = "ku-compass-access";
const catalog = document.querySelector("#programCatalog");
const app = document.querySelector("#programApp");
const gate = document.querySelector("#accessGate");
const accessForm = document.querySelector("#accessForm");
const accessCodeInput = document.querySelector("#accessCode");
const accessMessage = document.querySelector("#accessMessage");

let accessConfig = null;

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
  if (accessConfig.validUntil && Date.now() > new Date(accessConfig.validUntil).getTime()) {
    return false;
  }
  const digest = await hashCode(code, accessConfig);
  return digest === accessConfig.hash;
}

function hasCurrentUnlock() {
  const saved = localStorage.getItem(ACCESS_STORAGE_KEY);
  if (!saved) return false;

  try {
    const parsed = JSON.parse(saved);
    const unlockedAt = new Date(parsed.unlockedAt).getTime();
    const updatedAt = new Date(accessConfig.updatedAt).getTime();
    const validUntil = accessConfig.validUntil ? new Date(accessConfig.validUntil).getTime() : Number.POSITIVE_INFINITY;
    return unlockedAt >= updatedAt && Date.now() <= validUntil;
  } catch {
    localStorage.removeItem(ACCESS_STORAGE_KEY);
    return false;
  }
}

function showGate() {
  app.hidden = true;
  gate.hidden = false;
  accessCodeInput.focus();
}

function showApp() {
  gate.hidden = true;
  app.hidden = false;
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

function renderCatalog(programs) {
  catalog.innerHTML = programs
    .map(
      (program) => `
        <article class="program-card catalog-card">
          <h3>${program.nameZh} / ${program.nameEn}</h3>
          <small>${program.concentrationsZh.join(" / ")}</small>
          <a href="${program.officialUrl}" target="_blank" rel="noreferrer">官网专业页</a>
        </article>
      `
    )
    .join("");
}

async function loadCatalog() {
  const programs = await loadJson("data/programs.json");
  renderCatalog(programs);
}

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessMessage.textContent = "校验中...";
  const ok = await verifyAccessCode(accessCodeInput.value);
  if (ok) {
    localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify({ unlockedAt: new Date().toISOString() }));
    showApp();
    accessMessage.textContent = "";
    loadCatalog();
  } else {
    accessMessage.textContent = "验证码不正确或已过期。";
  }
});

async function boot() {
  accessConfig = await loadJson("data/access-code.json");
  if (accessConfig.enabled && !hasCurrentUnlock()) {
    showGate();
    return;
  }

  showApp();
  await loadCatalog();
}

boot().catch(() => {
  gate.hidden = false;
  app.hidden = true;
  if (accessMessage) {
    accessMessage.textContent = "页面数据加载失败，请稍后刷新。";
  } else {
    catalog.innerHTML = `<article class="warning-card danger"><strong>专业目录加载失败</strong><p>请刷新页面或稍后再试。</p></article>`;
  }
});
