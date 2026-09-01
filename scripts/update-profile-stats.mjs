#!/usr/bin/env node
/**
 * Fetch platform stats via static scrape + public APIs, render custom SVG cards.
 * Optional secrets: HTB_APP_TOKEN, THM_USER_PUBLIC_ID, THM_PROFILE_HASH
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, "config/platforms.json");
const GENERATED_DIR = resolve(ROOT, "generated");
const PROFILE_STATS_PATH = resolve(ROOT, "data/profile-stats.json");
const ASSETS_DIR = resolve(ROOT, "assets");
const THM_SVG = resolve(ASSETS_DIR, "platform-thm.svg");
const HTB_SVG = resolve(ASSETS_DIR, "platform-htb.svg");
const PWN_SVG = resolve(ASSETS_DIR, "platform-pwn.svg");

const UA =
  "FaikEmrePusat-profile-stats/3.0 (+https://github.com/FaikEmrePusat/FaikEmrePusat)";
const CARD_W = 280;
const CARD_H = 150;

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

function loadProfileStats() {
  if (!existsSync(PROFILE_STATS_PATH)) return null;
  return JSON.parse(readFileSync(PROFILE_STATS_PATH, "utf8"));
}

function secret(name) {
  return process.env[name]?.trim() || null;
}

function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtRank(n) {
  if (n == null || n === "") return "—";
  const num = Number(String(n).replace(/,/g, ""));
  return Number.isFinite(num) ? `#${num.toLocaleString("en-US")}` : "—";
}

function writePlatformCard({ id, platform, username, accent, gradient, rows, outPath }) {
  const cols = Math.max(rows.length, 1);
  const colW = (CARD_W - 44) / cols;
  let statSvg = "";
  for (let i = 0; i < rows.length; i++) {
    const x = 22 + i * colW;
    const row = rows[i];
    statSvg += `<text x="${x}" y="104" fill="${accent}" opacity="0.85" font-family="Segoe UI,system-ui,sans-serif" font-size="10" font-weight="600">${escapeXml(row.label)}</text>`;
    statSvg += `<text x="${x}" y="122" fill="#e2e8f0" font-family="Segoe UI,system-ui,sans-serif" font-size="13" font-weight="600">${escapeXml(row.value)}</text>`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" role="img" aria-label="${escapeXml(platform)} ${escapeXml(username)}">
  <defs>
    <linearGradient id="bg-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${gradient[0]}"/>
      <stop offset="100%" stop-color="${gradient[1]}"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" rx="12" fill="url(#bg-${id})"/>
  <rect x="0" y="0" width="4" height="${CARD_H}" rx="2" fill="${accent}"/>
  <text x="22" y="32" fill="${accent}" font-family="Segoe UI,system-ui,sans-serif" font-size="13" font-weight="600">${escapeXml(platform)}</text>
  <text x="22" y="72" fill="#ffffff" font-family="Segoe UI,system-ui,sans-serif" font-size="24" font-weight="700">${escapeXml(username)}</text>
  ${statSvg}
</svg>
`;
  mkdirSync(ASSETS_DIR, { recursive: true });
  writeFileSync(outPath, svg);
}

function writeThmCard(username, stats) {
  const blocked = stats?.blocked;
  const rows = blocked
    ? [{ label: "Status", value: "Scrape blocked" }]
    : [
        { label: "Global rank", value: fmtRank(stats?.rank) },
        { label: "Rooms", value: stats?.rooms ?? stats?.total ?? "—" },
        {
          label: "Level",
          value: [stats?.level, stats?.streak].filter(Boolean).join(" · ") || "—",
        },
      ];
  writePlatformCard({
    id: "thm",
    platform: "TryHackMe",
    username,
    accent: "#1a6b5c",
    gradient: ["#0f2a24", "#0a1612"],
    rows,
    outPath: THM_SVG,
  });
}

function writeHtbCard(username, stats) {
  const owns =
    stats?.userOwns != null || stats?.systemOwns != null
      ? `${stats.userOwns ?? 0} / ${stats.systemOwns ?? 0}`
      : "—";
  const rows = [
    { label: "Global rank", value: fmtRank(stats?.ranking) },
    { label: "User / root", value: owns },
    {
      label: "Tier / pts",
      value: [stats?.rank, stats?.points != null ? `${stats.points} pts` : null]
        .filter(Boolean)
        .join(" · ") || "—",
    },
  ];
  writePlatformCard({
    id: "htb",
    platform: "Hack The Box",
    username,
    accent: "#9fef00",
    gradient: ["#142412", "#0a1408"],
    rows,
    outPath: HTB_SVG,
  });
}

function writePwnCard(username, stats) {
  const rows = stats?.error
    ? [{ label: "Status", value: "Unavailable" }]
    : [
        { label: "Global rank", value: stats?.ranked ? fmtRank(stats.rank) : "—" },
        { label: "Points", value: stats?.ranked ? `${stats.points} pts` : "—" },
      ];
  writePlatformCard({
    id: "pwn",
    platform: "pwn.college",
    username,
    accent: "#c4b5fd",
    gradient: ["#2d1b69", "#1a1033"],
    rows,
    outPath: PWN_SVG,
  });
}

async function scrapeThmProfile(username) {
  const url = `https://tryhackme.com/p/${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  const html = await res.text();
  if (html.includes("Security Checkpoint") || res.status === 429) {
    return { blocked: true, source: "scrape-blocked" };
  }
  if (!res.ok) return { error: `HTTP ${res.status}`, source: "scrape" };

  const rank = html.match(/Rank[^0-9]*(\d[\d,]*)/i)?.[1]?.replace(/,/g, "");
  const rooms = html.match(/Completed[^0-9]*(\d+)/i)?.[1];
  const streak = html.match(/Streak[^0-9]*(\d+\s*days?)/i)?.[1];
  const level = html.match(/Level[^[]*(\[[^\]]+\])/i)?.[1];
  const userPublicId = html.match(/userPublicId[=:"']+(\d+)/)?.[1];

  if (!rank && !rooms && !level) return null;
  return {
    rank: rank ? Number(rank) : null,
    rooms: rooms ? Number(rooms) : null,
    streak,
    level,
    userPublicId: userPublicId ? Number(userPublicId) : null,
    source: "scrape",
  };
}

async function scrapeHtbProfile(username) {
  const url = `https://app.hackthebox.com/profile/${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  const html = await res.text();
  if (!res.ok) return { error: `HTTP ${res.status}`, source: "scrape" };

  const ranking = html.match(/"ranking"\s*:\s*(\d+)/)?.[1];
  const userOwns = html.match(/"user_owns"\s*:\s*(\d+)/)?.[1];
  const systemOwns = html.match(/"system_owns"\s*:\s*(\d+)/)?.[1];
  const points = html.match(/"points"\s*:\s*(\d+)/)?.[1];
  const rank = html.match(/"rank"\s*:\s*"([^"]+)"/)?.[1];

  if (!ranking && !userOwns && !points && !rank) return null;
  return {
    ranking: ranking ? Number(ranking) : null,
    userOwns: userOwns ? Number(userOwns) : null,
    systemOwns: systemOwns ? Number(systemOwns) : null,
    points: points ? Number(points) : null,
    rank,
    source: "scrape",
  };
}

async function fetchPwnCollege(username) {
  const url = `https://pwn.college/pwncollege_api/v1/score?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json();
  if (data.error) return { error: data.error };
  const text = typeof data === "string" ? data : JSON.stringify(data);
  if (text.includes("not ranked") || text.includes("does not exist")) {
    return { ranked: false, rank: null, points: 0 };
  }
  const cleaned = text.replace(/^"|"$/g, "");
  const [rank, points] = cleaned.split(":");
  return { ranked: true, rank, points: Number(points) || 0, source: "api" };
}

async function fetchThmBadgeStats(userPublicId) {
  const badgeUrl = `https://tryhackme.com/api/v2/badges/public-profile?userPublicId=${userPublicId}`;
  const res = await fetch(badgeUrl, { headers: { "User-Agent": UA } });
  const html = await res.text();
  if (html.includes("Security Checkpoint") || html.includes("Vercel") || res.status === 429) {
    return { blocked: true, source: "badge-api-blocked" };
  }
  const rank = html.match(/Rank[^0-9]*(\d[\d,]*)/i)?.[1]?.replace(/,/g, "");
  const rooms = html.match(/Completed[^0-9]*(\d+)/i)?.[1];
  const streak = html.match(/Streak[^0-9]*(\d+\s*days?)/i)?.[1];
  const level = html.match(/Level[^[]*(\[[^\]]+\])/i)?.[1];
  if (!rank && !rooms) return null;
  return {
    rank: rank ? Number(rank) : null,
    rooms: rooms ? Number(rooms) : null,
    streak,
    level,
    source: "badge-api",
  };
}

async function fetchThmCompletedRooms(profileHash) {
  const url = `https://tryhackme.com/api/v2/public-profile/completed-rooms?user=${encodeURIComponent(profileHash)}&limit=8&page=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok || res.status === 429) return null;
  const data = await res.json();
  const total = data?.paginator?.totalDocs ?? data?.rooms?.length ?? null;
  const recent = (data?.rooms ?? [])
    .slice(0, 5)
    .map((r) => r.title || r.roomCode)
    .filter(Boolean);
  return { total, recent, source: "completed-rooms-api" };
}

const HTB_API = "https://labs.hackthebox.com/api/v4";

function decodeJwtUserId(token) {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    const sub = payload?.sub;
    if (sub == null) return null;
    const n = Number(sub);
    return Number.isFinite(n) ? n : sub;
  } catch {
    return null;
  }
}

async function fetchHtbStats(token) {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const jwtUserId = decodeJwtUserId(token);
  let info = null;
  let apiError = null;

  try {
    const infoRes = await fetch(`${HTB_API}/user/info`, { headers });
    if (infoRes.ok) {
      const infoJson = await infoRes.json();
      info = infoJson?.info ?? infoJson?.profile ?? infoJson;
    } else {
      apiError = `HTB user/info ${infoRes.status}`;
    }
  } catch (err) {
    apiError = err instanceof Error ? err.message : "HTB user/info failed";
  }

  const userId = info?.id ?? info?.profile_id ?? jwtUserId;

  let basic = null;
  if (userId) {
    try {
      const basicRes = await fetch(`${HTB_API}/user/profile/basic/${userId}`, { headers });
      if (basicRes.ok) {
        const basicJson = await basicRes.json();
        basic = basicJson?.profile ?? basicJson;
      } else if (!apiError) {
        apiError = `HTB profile/basic ${basicRes.status}`;
      }
    } catch {
      /* optional */
    }
  }

  if (!info && !basic) {
    if (jwtUserId) {
      return { userId: jwtUserId, error: apiError ?? "HTB API unavailable", source: "jwt-fallback" };
    }
    return { error: apiError ?? "HTB API unavailable" };
  }

  return {
    userId,
    name: info?.name ?? basic?.name,
    rank: info?.rank ?? basic?.rank,
    ranking: info?.ranking ?? basic?.ranking,
    userOwns: info?.user_owns ?? basic?.user_owns ?? 0,
    systemOwns: info?.system_owns ?? basic?.system_owns ?? 0,
    points: info?.points ?? basic?.points,
    respects: info?.respects ?? basic?.respects,
    source: info ? "htb-api" : "htb-profile-basic",
    ...(apiError && !info ? { warning: apiError } : {}),
  };
}

function platformSection(config, platformStats) {
  const lines = [];
  const thm = config.tryhackme;
  const htb = config.hackthebox;
  const pwn = config.pwncollege;
  const ts = platformStats.tryhackme ?? {};
  const hs = platformStats.hackthebox ?? {};
  const ps = platformStats.pwncollege ?? {};
  const thmHasStats = ts.rooms != null || ts.total != null || ts.rank != null || ts.level;

  lines.push("## Platform Progress", "");
  lines.push("*Custom lab cards — stats refresh daily via static scrape.*", "");

  const cards = [];
  if (thm.enabled && thm.username && !thm.username.startsWith("YOUR_") && existsSync(THM_SVG)) {
    cards.push(
      `<a href="${thm.profileUrl}"><img src="./assets/platform-thm.svg" alt="TryHackMe stats" height="150"/></a>`,
    );
  }
  if (htb.enabled && htb.username && !htb.username.startsWith("YOUR_") && existsSync(HTB_SVG)) {
    cards.push(
      `<a href="${htb.profileUrl}"><img src="./assets/platform-htb.svg" alt="Hack The Box stats" height="150"/></a>`,
    );
  }
  if (pwn.enabled && pwn.username && !pwn.username.startsWith("YOUR_") && existsSync(PWN_SVG)) {
    cards.push(
      `<a href="${pwn.profileUrl}"><img src="./assets/platform-pwn.svg" alt="pwn.college stats" height="150"/></a>`,
    );
  }
  if (cards.length) {
    lines.push("<p align=\"center\">", cards.join("\n&nbsp;&nbsp;\n"), "</p>", "");
  }

  lines.push("| Platform | Completed | Global rank | Level / points |", "| :--- | ---: | ---: | :--- |");

  if (thm.enabled && thm.username && !thm.username.startsWith("YOUR_")) {
    const completed = ts.rooms ?? ts.total ?? "—";
    const rank = ts.rank != null ? fmtRank(ts.rank) : "—";
    const extra = [ts.level, ts.streak].filter(Boolean).join(" · ") || "—";
    lines.push(`| [TryHackMe](${thm.profileUrl}) | ${completed} rooms | ${rank} | ${extra} |`);
  }

  if (htb.enabled && htb.username && !htb.username.startsWith("YOUR_")) {
    const completed =
      hs.userOwns != null || hs.systemOwns != null
        ? `${hs.userOwns ?? 0} user · ${hs.systemOwns ?? 0} root`
        : "—";
    const rank = hs.ranking != null ? fmtRank(hs.ranking) : "—";
    const level = [hs.rank, hs.points != null ? `${hs.points} pts` : null].filter(Boolean).join(" · ") || "—";
    lines.push(`| [Hack The Box](${htb.profileUrl}) | ${completed} | ${rank} | ${level} |`);
  }

  if (pwn.enabled && pwn.username && !pwn.username.startsWith("YOUR_")) {
    const rank = ps.ranked ? fmtRank(ps.rank) : "—";
    const pts = ps.ranked ? `${ps.points} pts` : "—";
    lines.push(`| [pwn.college](${pwn.profileUrl}) | — | ${rank} | ${pts} |`);
  }

  lines.push("");

  if (ts.recent?.length) {
    lines.push("<details><summary><b>Recent TryHackMe rooms</b></summary>", "");
    for (const title of ts.recent) lines.push(`- ${title}`);
    lines.push("", "</details>", "");
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
  let configDirty = false;
  const platformStats = { fetchedAt: new Date().toISOString() };

  if (config.tryhackme?.enabled && config.tryhackme.username && !config.tryhackme.username.startsWith("YOUR_")) {
    let thm = (await scrapeThmProfile(config.tryhackme.username)) ?? {};
    if (thm?.userPublicId && !config.tryhackme.userPublicId) {
      config.tryhackme.userPublicId = thm.userPublicId;
      configDirty = true;
    }

    const thmPublicId = secret("THM_USER_PUBLIC_ID") ?? config.tryhackme?.userPublicId;
    const thmProfileHash = secret("THM_PROFILE_HASH") ?? config.tryhackme?.profileHash;

    if (thmPublicId) {
      const badge = await fetchThmBadgeStats(thmPublicId);
      if (badge) {
        thm = { ...thm, ...badge };
        if (!config.tryhackme.userPublicId) {
          config.tryhackme.userPublicId = Number(thmPublicId) || thmPublicId;
          configDirty = true;
        }
      }
    }

    if (thmProfileHash) {
      const rooms = await fetchThmCompletedRooms(thmProfileHash);
      if (rooms) {
        thm = { ...thm, ...rooms };
        if (!config.tryhackme.profileHash) {
          config.tryhackme.profileHash = thmProfileHash;
          configDirty = true;
        }
      }
    }

    platformStats.tryhackme = thm;
    writeThmCard(config.tryhackme.username, thm);
  }

  if (config.hackthebox?.enabled && config.hackthebox.username && !config.hackthebox.username.startsWith("YOUR_")) {
    let htb = (await scrapeHtbProfile(config.hackthebox.username)) ?? {};
    const htbToken = secret("HTB_APP_TOKEN");
    if (htbToken) {
      const api = await fetchHtbStats(htbToken);
      htb = { ...htb, ...api };
      if (api?.userId && !config.hackthebox.userId) {
        config.hackthebox.userId = api.userId;
        configDirty = true;
      }
    } else if (!htb.rank && htb.ranking == null) {
      htb = { ...htb, userId: config.hackthebox.userId, source: htb.source ?? "config-only" };
    }
    platformStats.hackthebox = htb;
    writeHtbCard(config.hackthebox.username, htb);
  }

  if (config.pwncollege?.enabled && config.pwncollege.username && !config.pwncollege.username.startsWith("YOUR_")) {
    platformStats.pwncollege = await fetchPwnCollege(config.pwncollege.username);
    writePwnCard(config.pwncollege.username, platformStats.pwncollege);
  }

  if (configDirty) saveConfig(config);

  const profileStats = loadProfileStats();
  mkdirSync(GENERATED_DIR, { recursive: true });
  writeFileSync(resolve(GENERATED_DIR, "platform-stats.json"), JSON.stringify(platformStats, null, 2));

  const platformsMd = platformSection(config, platformStats);
  const durumMd = durumSection(config, profileStats);
  writeFileSync(resolve(GENERATED_DIR, "platforms.md"), platformsMd);
  writeFileSync(resolve(GENERATED_DIR, "durum.md"), durumMd);

  console.log("Generated platform SVG cards, platform-stats.json, platforms.md, durum.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
