#!/usr/bin/env node
import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const accessPath = resolve(root, "data/access-code.json");
const sellerPath = resolve(root, ".seller/current-code.txt");
const publicCodePath = resolve(root, "current-code.txt");
const args = new Set(process.argv.slice(2));
const inCi = args.has("--ci") || process.env.CI === "true";
const codeLength = Number(process.env.ACCESS_CODE_LENGTH ?? 10);
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(length) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function formatBeijingTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

async function postWebhook(payload) {
  const url = process.env.FULFILLMENT_WEBHOOK_URL;
  if (!url) return false;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.FULFILLMENT_WEBHOOK_TOKEN
        ? { authorization: `Bearer ${process.env.FULFILLMENT_WEBHOOK_TOKEN}` }
        : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Webhook failed with ${response.status}`);
  }
  return true;
}

const previous = JSON.parse(readFileSync(accessPath, "utf8"));
const code = process.env.ACCESS_CODE || makeCode(codeLength);
const salt = randomBytes(16);
const iterations = Number(process.env.ACCESS_CODE_ITERATIONS ?? previous.iterations ?? 180000);
const hash = pbkdf2Sync(code, salt, iterations, 32, "sha256");
const updatedAt = new Date();
const validUntil = new Date(updatedAt.getTime() + 48 * 60 * 60 * 1000);
const updatedAtBeijing = formatBeijingTime(updatedAt);
const validUntilBeijing = formatBeijingTime(validUntil);
const next = {
  ...previous,
  enabled: true,
  algorithm: "PBKDF2-SHA256",
  iterations,
  salt: toBase64Url(salt),
  hash: toBase64Url(hash),
  updatedAt: updatedAt.toISOString(),
  validUntil: validUntil.toISOString(),
  codeLength: code.length,
  codeFingerprint: sha256(code).slice(0, 10)
};

writeFileSync(accessPath, `${JSON.stringify(next, null, 2)}\n`);
mkdirSync(dirname(sellerPath), { recursive: true });
writeFileSync(
  sellerPath,
  [
    `KU Compass current access code: ${code}`,
    `Valid from: ${next.updatedAt}`,
    `Valid until: ${next.validUntil}`,
    `Valid from Beijing time: ${updatedAtBeijing}`,
    `Valid until Beijing time: ${validUntilBeijing}`,
    `Fingerprint: ${next.codeFingerprint}`,
    ""
  ].join("\n")
);
writeFileSync(
  publicCodePath,
  [
    "KU Compass 验证码",
    "",
    `验证码：${code}`,
    `北京时间有效期：${updatedAtBeijing} 至 ${validUntilBeijing}`,
    "",
    "请在有效期内使用。验证码会定期更新。",
    ""
  ].join("\n")
);

const payload = {
  product: "KU Compass",
  accessCode: code,
  validFrom: next.updatedAt,
  validUntil: next.validUntil,
  validFromBeijing: updatedAtBeijing,
  validUntilBeijing,
  accessUrl: process.env.ACCESS_URL || "",
  publicCodeUrl: process.env.CODE_URL || "",
  fingerprint: next.codeFingerprint
};

const sentWebhook = await postWebhook(payload);

if (process.env.GITHUB_STEP_SUMMARY && process.env.EXPOSE_CODE_IN_SUMMARY === "true") {
  writeFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      "### KU Compass access code",
      "",
      `Code: \`${code}\``,
      `Valid until: ${next.validUntil}`,
      "",
      "Only enable this summary in a private repository or a trusted workflow run.",
      ""
    ].join("\n"),
    { flag: "a" }
  );
}

console.log(`Rotated access code hash in data/access-code.json`);
console.log(`Plain code written locally to .seller/current-code.txt`);
console.log(`Public code page written to current-code.txt`);
console.log(`Webhook delivery: ${sentWebhook ? "sent" : "not configured"}`);
if (inCi && process.env.EXPOSE_CODE_IN_SUMMARY !== "true" && !sentWebhook) {
  console.log("CI exposed the plaintext code through current-code.txt for GitHub Pages delivery.");
}
