#!/usr/bin/env node
/**
 * Fetch platform stats + refresh generated markdown snippets for README.
 * Durum SVGs are produced by durum-web/scripts/generate-profile-stats.ts (CI or local).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, "config/platforms.json");
const GENERATED_DIR = resolve(ROOT, "generated");
const PROFILE_STATS_PATH = resolve(ROOT, "data/profile-stats.json");

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function loadProfileStats() {
  if (!existsSync(PROFILE_STATS_PATH)) return null;
  return JSON.parse(readFileSync(PROFILE_STATS_PATH, "utf8"));
}

async function fetchPwnCollege(username) {
  const url = `https://pwn.college/pwncollege_api/v1/score?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json();
  if (data.error) return { error: data.error };
  const text = typeof data === "string" ? data : JSON.stringify(data);
  if (text.includes("not ranked") || text.includes("does not exist")) {
    return { ranked: false, rank: null, points: 0 };
  }
  const cleaned = text.replace(/^"|"$/g, "");
  const [rank, points] = cleaned.split(":");
  return { ranked: true, rank, points: Number(points) || 0 };
}

async function fetchThmProfile(username, userPublicId) {
  if (userPublicId) {
    const badgeUrl = `https://tryhackme.com/api/v2/badges/public-profile?userPublicId=${userPublicId}`;
    try {
      const res = await fetch(badgeUrl, {
        headers: { "User-Agent": "FaikEmrePusat-profile-stats/1.0" },
      });
      const html = await res.text();
      const rank = html.match(/Rank[^0-9]*(\d[\d,]*)/i)?.[1]?.replace(/,/g, "");
      const rooms = html.match(/Completed[^0-9]*(\d+)/i)?.[1];
      const streak = html.match(/Streak[^0-9]*(\d+\s*days?)/i)?.[1];
      const level = html.match(/Level[^[]*(\[[^\]]+\])/i)?.[1];
      if (rank || rooms) {
        return { rank: rank ? Number(rank) : null, rooms: rooms ? Number(rooms) : null, streak, level, source: "badge-api" };
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const res = await fetch(`https://tryhackme.com/p/${encodeURIComponent(username)}`, {
      headers: { "User-Agent": "FaikEmrePusat-profile-stats/1.0" },
      redirect: "follow",
    });
    const html = await res.text();
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    if (title && !title.toLowerCase().includes("security checkpoint")) {
      return { profileTitle: title, source: "profile-page" };
    }
  } catch {
    /* ignore */
  }
  return { error: "THM verisi alınamadı — userPublicId ekleyin veya profili manuel güncelleyin" };
}

function platformSection(config, platformStats) {
  const lines = [];
  const thm = config.tryhackme;
  const htb = config.hackthebox;
  const pwn = config.pwncollege;

  lines.push("## Platform Progress", "");

  const badges = [];
  if (thm.enabled && thm.username && !thm.username.startsWith("YOUR_")) {
    badges.push(
      `<a href="${thm.profileUrl}"><img src="https://img.shields.io/badge/TryHackMe-${encodeURIComponent(thm.username)}-212C42?style=for-the-badge&logo=tryhackme&logoColor=white" alt="TryHackMe"/></a>`,
    );
  }
  if (htb.enabled && htb.userId) {
    badges.push(
      `<a href="${htb.profileUrl}"><img src="https://www.hackthebox.eu/badge/image/${htb.userId}" alt="Hack The Box" height="28"/></a>`,
    );
  } else if (htb.enabled && htb.username && !htb.username.startsWith("YOUR_")) {
    badges.push(
      `<a href="${htb.profileUrl}"><img src="https://img.shields.io/badge/HackTheBox-${encodeURIComponent(htb.username)}-9FEF00?style=for-the-badge&logo=hackthebox&logoColor=111" alt="Hack The Box"/></a>`,
    );
  }
  if (pwn.enabled && pwn.username && !pwn.username.startsWith("YOUR_")) {
    badges.push(
      `<a href="${pwn.profileUrl}"><img src="https://img.shields.io/badge/pwn.college-${encodeURIComponent(pwn.username)}-111?style=for-the-badge" alt="pwn.college"/></a>`,
    );
  }
  if (badges.length) {
    lines.push("<p align=\"left\">", badges.join("\n"), "</p>", "");
  }

  const rows = [];
  const ts = platformStats.tryhackme;
  if (ts?.rank != null) rows.push(["TryHackMe", "Rank", `#${Number(ts.rank).toLocaleString("en-US")}`]);
  if (ts?.rooms != null) rows.push(["TryHackMe", "Rooms completed", String(ts.rooms)]);
  if (ts?.streak) rows.push(["TryHackMe", "Streak", ts.streak]);
  if (ts?.level) rows.push(["TryHackMe", "Level", ts.level]);

  const ps = platformStats.pwncollege;
  if (ps?.ranked) {
    rows.push(["pwn.college", "Rank", `#${ps.rank}`]);
    rows.push(["pwn.college", "Points", String(ps.points)]);
  }

  if (rows.length) {
    lines.push("| Platform | Metric | Value |", "| :--- | :--- | ---: |");
    for (const [plat, metric, val] of rows) {
      lines.push(`| ${plat} | ${metric} | ${val} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const DIM_EN = {
  Teknik: "Technical",
  Üretim: "Production",
  Dil: "Language",
  Kariyer: "Career",
  Technical: "Technical",
  Production: "Production",
  Language: "Language",
  Career: "Career",
};

function durumSection(config, profileStats) {
  const lines = [];
  lines.push("## Durum Dashboard", "");
  const updated = profileStats?.exportedAt
    ? new Date(profileStats.exportedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
  lines.push(`Model **${profileStats?.model ?? "2.1"}** · Updated ${updated}`, "");
  lines.push(`[Live dashboard](${config.durum.liveUrl}) · [Source code](${config.durum.repoUrl})`, "");
  lines.push("<details open><summary><b>Charts</b></summary>", "");
  lines.push('<p align="center">', "");
  lines.push('<img src="./assets/durum-summary.svg" alt="R score and dimensions" width="520"/>', "");
  lines.push("</p>", "");
  lines.push('<p align="center">', "");
  lines.push('<img src="./assets/durum-skills.svg" alt="Skills" width="520"/>', "");
  lines.push('<img src="./assets/durum-gates.svg" alt="Gate pipeline" width="520"/>', "");
  lines.push("</p>", "</details>", "");

  if (profileStats) {
    lines.push("| Dimension | Score | Target |", "| :--- | ---: | ---: |");
    for (const b of profileStats.boyutlar ?? []) {
      const label = DIM_EN[b.ad] ?? b.ad;
      lines.push(`| ${label} (${b.key}) | ${b.v} | ${b.hedef} |`);
    }
    lines.push(
      "",
      `**R:** ${profileStats.R} (${profileStats.band}) · **Streak:** ${profileStats.streak} days · **Last 7 days:** ${profileStats.saat7} h`,
      "",
    );
    if (profileStats.gateOzet) lines.push(`${profileStats.gateOzet}`, "");
  }

  return lines.join("\n");
}

async function main() {
  const config = loadConfig();
  const platformStats = { fetchedAt: new Date().toISOString() };

  if (config.tryhackme?.enabled && config.tryhackme.username && !config.tryhackme.username.startsWith("YOUR_")) {
    platformStats.tryhackme = await fetchThmProfile(
      config.tryhackme.username,
      config.tryhackme.userPublicId,
    );
  }

  if (config.pwncollege?.enabled && config.pwncollege.username && !config.pwncollege.username.startsWith("YOUR_")) {
    platformStats.pwncollege = await fetchPwnCollege(config.pwncollege.username);
  }

  const profileStats = loadProfileStats();
  mkdirSync(GENERATED_DIR, { recursive: true });
  writeFileSync(resolve(GENERATED_DIR, "platform-stats.json"), JSON.stringify(platformStats, null, 2));

  const platformsMd = platformSection(config, platformStats);
  const durumMd = durumSection(config, profileStats);
  writeFileSync(resolve(GENERATED_DIR, "platforms.md"), platformsMd);
  writeFileSync(resolve(GENERATED_DIR, "durum.md"), durumMd);

  console.log("Generated platform-stats.json, platforms.md, durum.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
