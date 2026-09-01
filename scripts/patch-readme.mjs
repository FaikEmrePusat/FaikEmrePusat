#!/usr/bin/env node
/** Replace AUTO sections in README.md with generated markdown. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README = resolve(ROOT, "README.md");

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patch(content, startTag, endTag, replacement) {
  const re = new RegExp(`${escapeRegExp(startTag)}[\\s\\S]*?${escapeRegExp(endTag)}`, "m");
  if (!re.test(content)) {
    console.warn(`Markers not found: ${startTag}`);
    return content;
  }
  return content.replace(re, `${startTag}\n${replacement.trim()}\n${endTag}`);
}

const readme = readFileSync(README, "utf8");
const platforms = readFileSync(resolve(ROOT, "generated/platforms.md"), "utf8");
const durum = readFileSync(resolve(ROOT, "generated/durum.md"), "utf8");

let next = patch(readme, "<!-- AUTO:PLATFORMS -->", "<!-- /AUTO:PLATFORMS -->", platforms);
next = patch(next, "<!-- AUTO:DURUM -->", "<!-- /AUTO:DURUM -->", durum);
writeFileSync(README, next);
console.log("README.md patched");
