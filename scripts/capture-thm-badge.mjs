#!/usr/bin/env node
/** @deprecated Use update-profile-stats.mjs (custom SVG cards). Kept for manual fallback only. */
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "assets/thm-badge.png");
const userPublicId = process.env.THM_USER_PUBLIC_ID?.trim();

if (!userPublicId) {
  console.log("THM_USER_PUBLIC_ID not set — skipping badge capture");
  process.exit(0);
}

const { chromium } = await import("playwright");

mkdirSync(resolve(ROOT, "assets"), { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 260 } });
  const url = `https://tryhackme.com/api/v2/badges/public-profile?userPublicId=${userPublicId}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("#thm-badge", { timeout: 45000 });
  const badge = page.locator("#thm-badge");
  await badge.screenshot({ path: OUT });
  console.log(`Saved THM badge → ${OUT}`);
} finally {
  await browser.close();
}
