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

  lines.push("## 🏴 Siber Platform İlerlemesi", "");
  lines.push("> Platform kullanıcı adlarını `config/platforms.json` dosyasında güncelleyin. İstatistikler günlük GitHub Action ile yenilenir.", "");

  // TryHackMe
  lines.push("### TryHackMe");
  if (thm.enabled && thm.username && !thm.username.startsWith("YOUR_")) {
    lines.push(`[![TryHackMe](https://img.shields.io/badge/TryHackMe-${encodeURIComponent(thm.username)}-212C42?style=for-the-badge&logo=tryhackme&logoColor=white)](${thm.profileUrl})`, "");
    const s = platformStats.tryhackme;
    if (s?.rank != null || s?.rooms != null) {
      lines.push("| Metrik | Değer |", "| :--- | ---: |");
      if (s.rank != null) lines.push(`| Sıra | #${s.rank.toLocaleString("tr-TR")} |`);
      if (s.rooms != null) lines.push(`| Tamamlanan oda | ${s.rooms} |`);
      if (s.streak) lines.push(`| Seri | ${s.streak} |`);
      if (s.level) lines.push(`| Seviye | ${s.level} |`);
      lines.push("");
    } else if (s?.profileTitle) {
      lines.push(`Profil: **${s.profileTitle}** · [Profili aç](${thm.profileUrl})`, "");
    } else {
      lines.push(`[Profili aç](${thm.profileUrl}) · THM rozet API'si için \`userPublicId\` ekleyin (TryHackMe profil embed kodundan).`, "");
    }
  } else {
    lines.push("<!-- THM: config/platforms.json → tryhackme.enabled=true ve username doldurun -->");
    lines.push("[![TryHackMe](https://img.shields.io/badge/TryHackMe-yapılandırılmadı-6a7d8a?style=flat-square&logo=tryhackme)](https://tryhackme.com/)", "");
  }

  // Hack The Box
  lines.push("### Hack The Box");
  if (htb.enabled && htb.userId) {
    const badge = `https://www.hackthebox.eu/badge/image/${htb.userId}`;
    lines.push(`<a href="${htb.profileUrl}"><img src="${badge}" alt="Hack The Box" height="120"/></a>`, "");
    lines.push(`Profil: [@${htb.username}](${htb.profileUrl}) · Rozet HTB sunucularından canlı güncellenir.`, "");
  } else if (htb.enabled && htb.username && !htb.username.startsWith("YOUR_")) {
    lines.push(`[![HackTheBox](https://img.shields.io/badge/HackTheBox-${encodeURIComponent(htb.username)}-9FEF00?style=for-the-badge&logo=hackthebox&logoColor=111)](${htb.profileUrl})`, "");
    lines.push("HTB rozet görseli için profil ayarlarından **user ID** alıp `config/platforms.json` → `hackthebox.userId` alanına yazın.", "");
  } else {
    lines.push("<!-- HTB: config/platforms.json → hackthebox.enabled=true, username ve userId -->");
    lines.push("[![HackTheBox](https://img.shields.io/badge/HackTheBox-yapılandırılmadı-6a7d8a?style=flat-square&logo=hackthebox)](https://www.hackthebox.com/)", "");
  }

  // pwn.college
  lines.push("### pwn.college");
  if (pwn.enabled && pwn.username && !pwn.username.startsWith("YOUR_")) {
    lines.push(`[![pwn.college](https://img.shields.io/badge/pwn.college-${encodeURIComponent(pwn.username)}-111?style=for-the-badge)](${pwn.profileUrl})`, "");
    const s = platformStats.pwncollege;
    if (s?.ranked) {
      lines.push("| Metrik | Değer |", "| :--- | ---: |", `| Sıra | #${s.rank} |`, `| Puan | ${s.points} |`, "");
    } else if (s?.error) {
      lines.push(`_${s.error}_ · [Profili aç](${pwn.profileUrl})`, "");
    } else {
      lines.push(`Henüz sıralamada değil · [Profili aç](${pwn.profileUrl})`, "");
    }
  } else {
    lines.push("<!-- pwn: config/platforms.json → pwncollege.enabled=true ve username -->");
    lines.push("[![pwn.college](https://img.shields.io/badge/pwn.college-yapılandırılmadı-6a7d8a?style=flat-square)](https://pwn.college/)", "");
  }

  return lines.join("\n");
}

function durumSection(config, profileStats) {
  const lines = [];
  lines.push("## 📈 Durum Paneli İstatistikleri", "");
  lines.push(`Model **${profileStats?.model ?? "2.1"}** · Son güncelleme: ${profileStats?.exportedAt ? new Date(profileStats.exportedAt).toLocaleDateString("tr-TR") : "—"}`, "");
  lines.push(`👉 **[Canlı panel](${config.durum.liveUrl})** · [Kaynak kod](${config.durum.repoUrl})`, "");
  lines.push("<details open><summary><b>Grafikler</b> (SVG — README için statik, panel canlı)</summary>", "");
  lines.push('<p align="center">', "");
  lines.push('<img src="./assets/durum-summary.svg" alt="Durum R skoru ve boyutlar" width="520"/>', "");
  lines.push("</p>", "");
  lines.push('<p align="center">', "");
  lines.push('<img src="./assets/durum-skills.svg" alt="Beceri özeti" width="520"/>', "");
  lines.push('<img src="./assets/durum-gates.svg" alt="Kapı hattı" width="520"/>', "");
  lines.push("</p>", "</details>", "");

  if (profileStats) {
    lines.push("| Boyut | Skor | Hedef |", "| :--- | ---: | ---: |");
    for (const b of profileStats.boyutlar ?? []) {
      lines.push(`| ${b.ad} (${b.key}) | ${b.v} | ${b.hedef} |`);
    }
    lines.push("", `**R:** ${profileStats.R} (${profileStats.band}) · **Seri:** ${profileStats.streak} gün · **Son 7 gün:** ${profileStats.saat7} sa`, "");
    if (profileStats.gateOzet) lines.push(`Kapılar: ${profileStats.gateOzet}`, "");
  } else {
    lines.push("_Durum verisi yok — `data/durum-backup.json` dışa aktarın veya CI çalıştırın._", "");
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
