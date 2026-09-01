#!/usr/bin/env node
/**
 * Fetch platform stats + refresh generated markdown snippets for README.
 * Secrets (GitHub Actions): HTB_APP_TOKEN, THM_USER_PUBLIC_ID, THM_PROFILE_HASH
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, "config/platforms.json");
const GENERATED_DIR = resolve(ROOT, "generated");
const PROFILE_STATS_PATH = resolve(ROOT, "data/profile-stats.json");
const THM_BADGE = resolve(ROOT, "assets/thm-badge.png");

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

async function fetchThmBadgeStats(userPublicId) {
  const badgeUrl = `https://tryhackme.com/api/v2/badges/public-profile?userPublicId=${userPublicId}`;
  const res = await fetch(badgeUrl, {
    headers: { "User-Agent": "FaikEmrePusat-profile-stats/2.0" },
  });
  const html = await res.text();
  if (html.includes("Security Checkpoint") || html.includes("Vercel")) return null;
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
    headers: { "User-Agent": "FaikEmrePusat-profile-stats/2.0", Accept: "application/json" },
  });
  if (!res.ok) return null;
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

function shieldBadge({ label, message, color, logo, url }) {
  const enc = (s) => encodeURIComponent(s).replace(/%20/g, "%20");
  const logoPart = logo ? `&logo=${logo}${logo === "hackthebox" ? "&logoColor=black" : "&logoColor=white"}` : "";
  const src = `https://img.shields.io/badge/${enc(label)}-${enc(message)}-${color}?style=for-the-badge${logoPart}`;
  return `<a href="${url}"><img src="${src}" alt="${label} profile"/></a>`;
}

function platformSection(config, platformStats) {
  const lines = [];
  const thm = config.tryhackme;
  const htb = config.hackthebox;
  const pwn = config.pwncollege;
  const ts = platformStats.tryhackme ?? {};
  const hs = platformStats.hackthebox ?? {};
  const ps = platformStats.pwncollege ?? {};
  const htbUserId = hs.userId ?? htb.userId;
  const thmHasStats = ts.rooms != null || ts.total != null || ts.rank != null || ts.level;

  lines.push("## Platform Progress", "");

  const shieldCells = [];
  if (thm.enabled && thm.username && !thm.username.startsWith("YOUR_")) {
    shieldCells.push(
      shieldBadge({
        label: "TryHackMe",
        message: thm.username,
        color: "212C42",
        logo: "tryhackme",
        url: thm.profileUrl,
      }),
    );
  }
  if (htb.enabled && htb.username && !htb.username.startsWith("YOUR_")) {
    shieldCells.push(
      shieldBadge({
        label: "Hack The Box",
        message: htb.username,
        color: "9FEF00",
        logo: "hackthebox",
        url: htb.profileUrl,
      }),
    );
  }
  if (pwn.enabled && pwn.username && !pwn.username.startsWith("YOUR_")) {
    shieldCells.push(
      shieldBadge({
        label: "pwn.college",
        message: pwn.username,
        color: "5c2d91",
        url: pwn.profileUrl,
      }),
    );
  }
  if (shieldCells.length) {
    lines.push("<p align=\"center\">", shieldCells.join("\n&nbsp;&nbsp;\n"), "</p>", "");
  }

  const liveBadges = [];
  if (thm.enabled && thm.username && !thm.username.startsWith("YOUR_") && existsSync(THM_BADGE)) {
    liveBadges.push(
      `<a href="${thm.profileUrl}"><img src="./assets/thm-badge.png" alt="TryHackMe live badge" height="150"/></a>`,
    );
  }
  if (htb.enabled && htbUserId) {
    liveBadges.push(
      `<a href="${htb.profileUrl}"><img src="https://www.hackthebox.eu/badge/image/${htbUserId}" alt="Hack The Box live badge" height="150"/></a>`,
    );
  }
  if (liveBadges.length) {
    lines.push("<p align=\"center\">", liveBadges.join("\n&nbsp;&nbsp;\n"), "</p>", "");
  }

  lines.push("| Platform | Completed | Global rank | Level / points |", "| :--- | ---: | ---: | :--- |");

  if (thm.enabled && thm.username && !thm.username.startsWith("YOUR_") && thmHasStats) {
    const completed = ts.rooms ?? ts.total ?? "—";
    const rank = ts.rank != null ? `#${Number(ts.rank).toLocaleString("en-US")}` : "—";
    const extra = [ts.level, ts.streak].filter(Boolean).join(" · ") || "—";
    lines.push(`| [TryHackMe](${thm.profileUrl}) | ${completed} rooms | ${rank} | ${extra} |`);
  }

  if (htb.enabled && htb.username && !htb.username.startsWith("YOUR_")) {
    const completed =
      hs.userOwns != null || hs.systemOwns != null
        ? `${hs.userOwns ?? 0} user · ${hs.systemOwns ?? 0} root`
        : "—";
    const rank = hs.ranking != null ? `#${Number(hs.ranking).toLocaleString("en-US")}` : "—";
    const level = [hs.rank, hs.points != null ? `${hs.points} pts` : null].filter(Boolean).join(" · ") || "—";
    lines.push(`| [Hack The Box](${htb.profileUrl}) | ${completed} | ${rank} | ${level} |`);
  }

  if (pwn.enabled && pwn.username && !pwn.username.startsWith("YOUR_")) {
    const rank = ps.ranked ? `#${ps.rank}` : "—";
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

  const thmPublicId = secret("THM_USER_PUBLIC_ID") ?? config.tryhackme?.userPublicId;
  const thmProfileHash = secret("THM_PROFILE_HASH") ?? config.tryhackme?.profileHash;

  if (config.tryhackme?.enabled && config.tryhackme.username && !config.tryhackme.username.startsWith("YOUR_")) {
    if (thmPublicId) {
      platformStats.tryhackme = (await fetchThmBadgeStats(thmPublicId)) ?? {};
      if (!config.tryhackme.userPublicId && thmPublicId) {
        config.tryhackme.userPublicId = Number(thmPublicId) || thmPublicId;
        configDirty = true;
      }
    } else {
      platformStats.tryhackme = {};
    }
    if (thmProfileHash) {
      const rooms = await fetchThmCompletedRooms(thmProfileHash);
      if (rooms) {
        platformStats.tryhackme = { ...platformStats.tryhackme, ...rooms };
        if (!config.tryhackme.profileHash) {
          config.tryhackme.profileHash = thmProfileHash;
          configDirty = true;
        }
      }
    }
  }

  const htbToken = secret("HTB_APP_TOKEN");
  if (config.hackthebox?.enabled && htbToken) {
    platformStats.hackthebox = await fetchHtbStats(htbToken);
    if (platformStats.hackthebox?.userId && !config.hackthebox.userId) {
      config.hackthebox.userId = platformStats.hackthebox.userId;
      configDirty = true;
    }
  }

  if (config.pwncollege?.enabled && config.pwncollege.username && !config.pwncollege.username.startsWith("YOUR_")) {
    platformStats.pwncollege = await fetchPwnCollege(config.pwncollege.username);
  }

  if (configDirty) saveConfig(config);

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
