#!/usr/bin/env node
/**
 * Fetch platform stats via static scrape + public APIs, render custom SVG cards.
 * TryHackMe uses username-only endpoints; optional statsOverride in config/platforms.json.
 * Optional secrets: HTB_APP_TOKEN, THM_PROFILE_HASH
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
const CARD_W = 320;
const CARD_H = 200;

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

function isThmBlocked(res, body = "") {
  return (
    res?.status === 429 ||
    body.includes("Security Checkpoint") ||
    body.includes("verifying your browser") ||
    body.includes("Vercel")
  );
}

function formatThmLevel(level) {
  if (level == null || level === "") return null;
  if (typeof level === "string") return level;
  const n = Number(level);
  if (!Number.isFinite(n)) return String(level);
  return `[0x${n.toString(16).toUpperCase()}]`;
}

function hasThmDisplayStats(stats) {
  return (
    stats?.rank != null ||
    stats?.rooms != null ||
    stats?.total != null ||
    stats?.level ||
    stats?.streak
  );
}

function mergeThmStats(...parts) {
  const out = {};
  let blocked = false;
  for (const part of parts) {
    if (!part) continue;
    if (part.blocked) blocked = true;
    for (const key of [
      "rank",
      "rooms",
      "total",
      "streak",
      "level",
      "badges",
      "points",
      "recent",
      "userPublicId",
      "topPercentage",
    ]) {
      if (part[key] != null && part[key] !== "") out[key] = part[key];
    }
    if (part.source) out.source = part.source;
  }
  if (hasThmDisplayStats(out)) {
    delete out.blocked;
  } else if (blocked) {
    out.blocked = true;
  }
  return out;
}

function applyStatsOverride(stats, override, keys) {
  if (!override || typeof override !== "object") return stats ?? {};
  const out = { ...(stats ?? {}) };
  let applied = false;
  for (const key of keys) {
    const value = override[key];
    if (value != null && value !== "") {
      out[key] = value;
      applied = true;
    }
  }
  if (applied) {
    out.source = stats?.source ? `${stats.source}+override` : "statsOverride";
  }
  return out;
}

function applyThmStatsOverride(stats, override) {
  const out = applyStatsOverride(stats, override, ["rank", "rooms", "level", "streak"]);
  if (hasThmDisplayStats(out)) delete out.blocked;
  return out;
}

function applyHtbStatsOverride(stats, override) {
  return applyStatsOverride(stats, override, [
    "userOwns",
    "systemOwns",
    "rank",
    "ranking",
    "points",
    "respects",
  ]);
}

function applyPwnStatsOverride(stats, override) {
  const out = applyStatsOverride(stats, override, ["rank", "points", "solves", "percentile"]);
  if (out.rank != null || out.points != null) {
    out.ranked = true;
    if (out.rank != null) out.rank = String(out.rank);
  }
  return out;
}

function hasHtbDisplayStats(stats) {
  return (
    stats?.ranking != null ||
    stats?.userOwns != null ||
    stats?.systemOwns != null ||
    stats?.rank ||
    stats?.points != null ||
    stats?.respects != null
  );
}

function hasPwnDisplayStats(stats) {
  return stats?.ranked || stats?.rank != null || stats?.points != null || stats?.solves != null;
}

function writePlatformCard({ id, platform, username, accent, gradient, cells, status, outPath }) {
  const pad = 20;
  const colW = (CARD_W - pad * 2 - 8) / 2;
  const rows = [100, 138, 176];
  const col1X = pad + 4;
  const col2X = pad + 4 + colW + 8;

  let statSvg = "";
  if (status) {
    statSvg = `<text x="${col1X}" y="${rows[0]}" fill="${accent}" opacity="0.8" font-family="Segoe UI,system-ui,sans-serif" font-size="10" font-weight="600" letter-spacing="0.04em">STATUS</text>`;
    statSvg += `<text x="${col1X}" y="${rows[0] + 18}" fill="#e2e8f0" font-family="Segoe UI,system-ui,sans-serif" font-size="13" font-weight="600">${escapeXml(status)}</text>`;
  } else {
    const positions = [];
    for (const y of rows) {
      positions.push([col1X, y], [col2X, y]);
    }
    const visible = cells.filter((c) => c && (c.always || (c.value != null && c.value !== "—")));
    for (let i = 0; i < Math.min(visible.length, 6); i++) {
      const [x, y] = positions[i];
      const cell = visible[i];
      statSvg += `<text x="${x}" y="${y}" fill="${accent}" opacity="0.8" font-family="Segoe UI,system-ui,sans-serif" font-size="10" font-weight="600" letter-spacing="0.04em">${escapeXml(cell.label.toUpperCase())}</text>`;
      statSvg += `<text x="${x}" y="${y + 18}" fill="#f1f5f9" font-family="Segoe UI,system-ui,sans-serif" font-size="14" font-weight="600">${escapeXml(cell.value)}</text>`;
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" role="img" aria-label="${escapeXml(platform)} ${escapeXml(username)}">
  <defs>
    <linearGradient id="bg-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${gradient[0]}"/>
      <stop offset="100%" stop-color="${gradient[1]}"/>
    </linearGradient>
    <linearGradient id="accent-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" rx="14" fill="url(#bg-${id})"/>
  <rect x="0" y="0" width="5" height="${CARD_H}" rx="3" fill="url(#accent-${id})"/>
  <rect x="${pad}" y="44" width="${CARD_W - pad * 2}" height="1" fill="#ffffff" opacity="0.08"/>
  <text x="${pad + 4}" y="28" fill="${accent}" font-family="Segoe UI,system-ui,sans-serif" font-size="11" font-weight="700" letter-spacing="0.06em">${escapeXml(platform.toUpperCase())}</text>
  <text x="${pad + 4}" y="68" fill="#ffffff" font-family="Segoe UI,system-ui,sans-serif" font-size="22" font-weight="700">${escapeXml(username)}</text>
  ${statSvg}
</svg>
`;
  mkdirSync(ASSETS_DIR, { recursive: true });
  writeFileSync(outPath, svg);
}

function writeThmCard(username, stats) {
  const hasStats = hasThmDisplayStats(stats);
  if (!hasStats && stats?.blocked) {
    writePlatformCard({
      id: "thm",
      platform: "TryHackMe",
      username,
      accent: "#1a6b5c",
      gradient: ["#12352e", "#0a1612"],
      status: "API blocked — set statsOverride",
      outPath: THM_SVG,
    });
    return;
  }
  writePlatformCard({
    id: "thm",
    platform: "TryHackMe",
    username,
    accent: "#1a6b5c",
    gradient: ["#12352e", "#0a1612"],
    cells: [
      { label: "Global rank", value: fmtRank(stats?.rank), always: true },
      { label: "Rooms", value: stats?.rooms ?? stats?.total ?? "—", always: true },
      { label: "Level", value: stats?.level || "—", always: true },
      { label: "Streak", value: stats?.streak || "—", always: true },
    ],
    outPath: THM_SVG,
  });
}

function writeHtbCard(username, stats) {
  const hasStats = hasHtbDisplayStats(stats);
  if (!hasStats && stats?.error) {
    writePlatformCard({
      id: "htb",
      platform: "Hack The Box",
      username,
      accent: "#9fef00",
      gradient: ["#1a2e14", "#0a1408"],
      status: "Set statsOverride or HTB_APP_TOKEN",
      outPath: HTB_SVG,
    });
    return;
  }
  writePlatformCard({
    id: "htb",
    platform: "Hack The Box",
    username,
    accent: "#9fef00",
    gradient: ["#1a2e14", "#0a1408"],
    cells: [
      { label: "Global rank", value: fmtRank(stats?.ranking), always: true },
      { label: "Tier", value: stats?.rank || "—", always: true },
      { label: "User owns", value: stats?.userOwns != null ? String(stats.userOwns) : "—", always: true },
      { label: "Root owns", value: stats?.systemOwns != null ? String(stats.systemOwns) : "—", always: true },
      { label: "Points", value: stats?.points != null ? `${stats.points} pts` : "—", always: true },
      { label: "Respects", value: stats?.respects != null ? String(stats.respects) : "—" },
    ],
    outPath: HTB_SVG,
  });
}

function writePwnCard(username, stats) {
  if (stats?.error && !hasPwnDisplayStats(stats)) {
    writePlatformCard({
      id: "pwn",
      platform: "pwn.college",
      username,
      accent: "#a78bfa",
      gradient: ["#2d1b69", "#140c28"],
      status: "Unavailable",
      outPath: PWN_SVG,
    });
    return;
  }
  const ranked = stats?.ranked || stats?.rank != null;
  writePlatformCard({
    id: "pwn",
    platform: "pwn.college",
    username,
    accent: "#a78bfa",
    gradient: ["#2d1b69", "#140c28"],
    cells: [
      { label: "Global rank", value: ranked ? fmtRank(stats.rank) : "—", always: true },
      { label: "Points", value: stats?.points != null ? `${stats.points} pts` : "—", always: true },
      { label: "Solves", value: stats?.solves != null ? String(stats.solves) : "—" },
      { label: "Percentile", value: stats?.percentile != null ? `${stats.percentile}%` : "—" },
    ],
    outPath: PWN_SVG,
  });
}

async function fetchThmPublicProfileApi(username) {
  const url = `https://tryhackme.com/api/v2/public-profile?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  const body = await res.text();
  if (isThmBlocked(res, body)) return { blocked: true, source: "public-profile-api-blocked" };
  if (!res.ok) return null;

  try {
    const json = JSON.parse(body);
    const data = json?.data;
    if (!data) return null;
    return {
      rank: data.rank ?? null,
      rooms: data.completedRoomsNumber ?? null,
      level: formatThmLevel(data.level),
      badges: data.badgesNumber ?? null,
      points: data.totalPoints ?? null,
      topPercentage: data.topPercentage ?? null,
      userPublicId: data.userPublicId ?? data.publicId ?? null,
      source: "public-profile-api",
    };
  } catch {
    return null;
  }
}

async function fetchThmLegacyStats(username) {
  const enc = encodeURIComponent(username);
  const headers = { "User-Agent": UA, Accept: "application/json" };
  const stats = {};
  let blocked = false;

  try {
    const rankRes = await fetch(`https://tryhackme.com/api/user/rank/${enc}`, { headers });
    const rankBody = await rankRes.text();
    if (isThmBlocked(rankRes, rankBody)) blocked = true;
    else if (rankRes.ok) {
      const json = JSON.parse(rankBody);
      if (json.userRank != null) stats.rank = Number(json.userRank);
    }
  } catch {
    /* optional */
  }

  try {
    const roomsRes = await fetch(`https://tryhackme.com/api/no-completed-rooms-public/${enc}`, {
      headers,
    });
    const roomsBody = await roomsRes.text();
    if (isThmBlocked(roomsRes, roomsBody)) blocked = true;
    else if (roomsRes.ok) {
      const rooms = Number(roomsBody.trim());
      if (Number.isFinite(rooms)) stats.rooms = rooms;
    }
  } catch {
    /* optional */
  }

  if (Object.keys(stats).length) return { ...stats, source: "legacy-api" };
  if (blocked) return { blocked: true, source: "legacy-api-blocked" };
  return null;
}

function parseThmProfileHtml(html) {
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      const next = JSON.parse(nextMatch[1]);
      const props = next?.props?.pageProps ?? {};
      const profile = props.profile ?? props.user ?? props.publicProfile ?? props;
      const rank = profile.rank ?? profile.userRank;
      const rooms = profile.completedRoomsNumber ?? profile.completedRooms ?? profile.roomsCompleted;
      const level = profile.level;
      const streak = profile.streak;
      const userPublicId = profile.userPublicId ?? profile.publicId;
      if (rank != null || rooms != null || level != null) {
        return {
          rank: rank != null ? Number(rank) : null,
          rooms: rooms != null ? Number(rooms) : null,
          streak: streak != null ? String(streak) : null,
          level: formatThmLevel(level),
          userPublicId: userPublicId != null ? Number(userPublicId) : null,
          source: "next-data",
        };
      }
    } catch {
      /* fall through to regex */
    }
  }

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

async function scrapeThmProfile(username) {
  const url = `https://tryhackme.com/p/${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  const html = await res.text();
  if (isThmBlocked(res, html)) return { blocked: true, source: "scrape-blocked" };
  if (!res.ok) return { error: `HTTP ${res.status}`, source: "scrape" };
  return parseThmProfileHtml(html);
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
      `<a href="${thm.profileUrl}"><img src="./assets/platform-thm.svg" alt="TryHackMe stats" height="200"/></a>`,
    );
  }
  if (htb.enabled && htb.username && !htb.username.startsWith("YOUR_") && existsSync(HTB_SVG)) {
    cards.push(
      `<a href="${htb.profileUrl}"><img src="./assets/platform-htb.svg" alt="Hack The Box stats" height="200"/></a>`,
    );
  }
  if (pwn.enabled && pwn.username && !pwn.username.startsWith("YOUR_") && existsSync(PWN_SVG)) {
    cards.push(
      `<a href="${pwn.profileUrl}"><img src="./assets/platform-pwn.svg" alt="pwn.college stats" height="200"/></a>`,
    );
  }
  if (cards.length) {
    lines.push("<p align=\"center\">", cards.join("\n&nbsp;&nbsp;\n"), "</p>", "");
  }

  lines.push(
    "| Platform | Progress | Global rank | Tier / level | Points | Extra |",
    "| :--- | :--- | ---: | :--- | ---: | :--- |",
  );

  if (thm.enabled && thm.username && !thm.username.startsWith("YOUR_")) {
    const completed = ts.rooms ?? ts.total ?? "—";
    const rank = ts.rank != null ? fmtRank(ts.rank) : "—";
    const level = ts.level || "—";
    const streak = ts.streak || "—";
    lines.push(
      `| [TryHackMe](${thm.profileUrl}) | ${completed} rooms | ${rank} | ${level} | — | ${streak} streak |`,
    );
  }

  if (htb.enabled && htb.username && !htb.username.startsWith("YOUR_")) {
    const progress =
      hs.userOwns != null || hs.systemOwns != null
        ? `${hs.userOwns ?? 0} user · ${hs.systemOwns ?? 0} root`
        : "—";
    const rank = hs.ranking != null ? fmtRank(hs.ranking) : "—";
    const tier = hs.rank || "—";
    const points = hs.points != null ? `${hs.points} pts` : "—";
    const extra = hs.respects != null ? `${hs.respects} respects` : "—";
    lines.push(
      `| [Hack The Box](${htb.profileUrl}) | ${progress} | ${rank} | ${tier} | ${points} | ${extra} |`,
    );
  }

  if (pwn.enabled && pwn.username && !pwn.username.startsWith("YOUR_")) {
    const ranked = ps.ranked || ps.rank != null;
    const rank = ranked ? fmtRank(ps.rank) : "—";
    const pts = ps.points != null ? `${ps.points} pts` : "—";
    const solves = ps.solves != null ? `${ps.solves} solves` : "—";
    const extra = ps.percentile != null ? `top ${ps.percentile}%` : "—";
    lines.push(`| [pwn.college](${pwn.profileUrl}) | ${solves} | ${rank} | — | ${pts} | ${extra} |`);
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
    const username = config.tryhackme.username;
    let thm = mergeThmStats(
      await fetchThmPublicProfileApi(username),
      await fetchThmLegacyStats(username),
      await scrapeThmProfile(username),
    );

    const thmPublicId = secret("THM_USER_PUBLIC_ID") ?? config.tryhackme?.userPublicId ?? thm.userPublicId;
    if (thmPublicId) {
      const badge = await fetchThmBadgeStats(thmPublicId);
      thm = mergeThmStats(thm, badge);
    }

    const thmProfileHash = secret("THM_PROFILE_HASH") ?? config.tryhackme?.profileHash;
    if (thmProfileHash) {
      const rooms = await fetchThmCompletedRooms(thmProfileHash);
      thm = mergeThmStats(thm, rooms);
      if (!config.tryhackme.profileHash) {
        config.tryhackme.profileHash = thmProfileHash;
        configDirty = true;
      }
    }

    thm = applyThmStatsOverride(thm, config.tryhackme.statsOverride);

    platformStats.tryhackme = thm;
    writeThmCard(username, thm);
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
    htb = applyHtbStatsOverride(htb, config.hackthebox.statsOverride);
    platformStats.hackthebox = htb;
    writeHtbCard(config.hackthebox.username, htb);
  }

  if (config.pwncollege?.enabled && config.pwncollege.username && !config.pwncollege.username.startsWith("YOUR_")) {
    let pwn = await fetchPwnCollege(config.pwncollege.username);
    pwn = applyPwnStatsOverride(pwn, config.pwncollege.statsOverride);
    platformStats.pwncollege = pwn;
    writePwnCard(config.pwncollege.username, pwn);
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
