# Platform stats setup

The profile README shows **custom SVG cards** (not Shields.io or official embed badges). A daily GitHub Action — or a local run — scrapes public profile pages and APIs, then writes static graphics under `assets/`.

## How it works

1. `node scripts/update-profile-stats.mjs` fetches stats for each enabled platform.
2. The script writes `assets/platform-thm.svg`, `assets/platform-htb.svg`, and `assets/platform-pwn.svg`.
3. `generated/platforms.md` is patched into `README.md` via `scripts/patch-readme.mjs`.

Run manually anytime, or let the **Update profile stats** workflow refresh daily at 06:00 UTC.

## pwn.college

No secret needed. Rank and points come from the public API. Optional **`statsOverride`** fills in solves or percentile when you want them on the card:

```json
"pwncollege": {
  "enabled": true,
  "username": "Pusat",
  "profileUrl": "https://pwn.college/hacker/Pusat",
  "statsOverride": {
    "rank": 17800,
    "points": 129,
    "solves": null,
    "percentile": null
  }
}
```

API values are merged first; any non-null override field wins.

## Hack The Box

**Without a token:** the card shows your username and dashes for stats (HTB profile pages are client-rendered and do not expose numbers in HTML). Use **`statsOverride`** to display progress manually:

```json
"hackthebox": {
  "enabled": true,
  "username": "FEPusa7",
  "userId": 514589,
  "profileUrl": "https://app.hackthebox.com/profile/FEPusa7",
  "statsOverride": {
    "userOwns": 0,
    "systemOwns": 0,
    "rank": "Noob",
    "ranking": null,
    "points": 0,
    "respects": null
  }
}
```

| Field | Meaning |
| :--- | :--- |
| `userOwns` | User-owned machines |
| `systemOwns` | Root-owned machines |
| `rank` | Tier name (e.g. Noob, Hacker) |
| `ranking` | Global leaderboard position |
| `points` | Total points |
| `respects` | Respects received (optional) |

**With `HTB_APP_TOKEN` (recommended):** CI pulls owns, rank, tier, and points from the HTB labs API. Override values still win when set.

1. Log in at https://app.hackthebox.com
2. **Settings → App Token → Create**
3. GitHub → **FaikEmrePusat/FaikEmrePusat** → **Settings → Secrets → Actions**
4. New secret: `HTB_APP_TOKEN` = paste token (never commit tokens)
5. **Actions → Update profile stats → Run workflow**

Your numeric `userId` is saved automatically after the first successful run (or set in `config/platforms.json` — it is public).

**If a token was exposed**, revoke it in HTB **Settings → App Token**, create a new one, and update the GitHub secret.

## TryHackMe

### Why we do not use `p4p1/tryhackme-badge-workflow`

[p4p1/tryhackme-badge-workflow](https://github.com/p4p1/tryhackme-badge-workflow) is a third-party GitHub Action that downloads TryHackMe's official badge PNG and commits it to your repo. We reviewed it in September 2026 and **kept our custom SVG approach** instead.

| Aspect | p4p1 workflow | This repo (`update-profile-stats.mjs`) |
| :--- | :--- | :--- |
| **Default mode** | Static PNG from `tryhackme-badges.s3.amazonaws.com/{username}.png` | Custom SVG card with rank, rooms, level |
| **Username only?** | Yes for static mode — **but** the S3 file must already exist | Yes — username-based APIs + HTML scrape |
| **`userPublicId`?** | Only if `use_static_image: false` (dynamic/Puppeteer mode) | Optional; not required for the card |
| **Works for `FPusat`?** | **No** — S3 returns `403 Access Denied` (no badge file on THM's bucket) | Yes — card renders; use `statsOverride` when CI is blocked |
| **Maintenance** | Author archived the project (README: "moving away from tryhackme") | Maintained in this repo |
| **Multi-platform** | TryHackMe only | THM + HTB + pwn.college in one workflow |

**How p4p1 works (two modes):**

1. **Static (default, `use_static_image: true`)** — fetches `https://tryhackme-badges.s3.amazonaws.com/FPusat.png`. No `userPublicId` needed, but THM must have generated and uploaded that PNG. Tested 2026-09-01: `FPusat.png` → 403; `p4p1.png` (author) → 200. Most new users have no S3 badge unless they triggered regeneration on tryhackme.com (see [issue #4](https://github.com/p4p1/tryhackme-badge-workflow/issues/4)).
2. **Dynamic (`use_static_image: false`)** — fetches `https://tryhackme.com/api/v2/badges/public-profile?userPublicId=…`, renders HTML with Puppeteer, saves PNG. **Requires `user_public_id`**, which is not shown in the current TryHackMe UI.

**Bottom line:** For username `FPusat` without `userPublicId`, the p4p1 action fails in both practical paths (no S3 file; dynamic mode needs the missing ID). Our SVG cards plus optional `statsOverride` are simpler and match the rest of the profile design.

---

**Only your username is required.** Set it in `config/platforms.json`:

```json
"tryhackme": {
  "enabled": true,
  "username": "FPusat",
  "profileUrl": "https://tryhackme.com/p/FPusat",
  "statsOverride": {
    "rank": null,
    "rooms": null,
    "level": null,
    "streak": null
  }
}
```

The script fetches stats automatically using these **username-based** sources (in order):

1. `https://tryhackme.com/api/v2/public-profile?username=YOUR_USERNAME` — rank, rooms, level
2. Legacy APIs: `/api/user/rank/USERNAME` and `/api/no-completed-rooms-public/USERNAME`
3. Public profile page HTML (`/p/USERNAME`) including embedded `__NEXT_DATA__`

You do **not** need to hunt for `userPublicId`, embed-badge iframes, or DevTools network filters. Those IDs are not shown in the current TryHackMe UI.

**Ignore `data-dpl-id` on `<html>`** — it is TryHackMe’s Vercel/Next.js deployment ID (same for every visitor), not your username or profile stats key.

### When GitHub Actions is blocked (HTTP 429)

TryHackMe sits behind Vercel bot protection. Datacenter IPs (including GitHub Actions runners) are often challenged, so live API calls may fail even though your profile is public in a browser.

**Fallback — paste stats once from your THM dashboard:**

1. Open https://tryhackme.com while logged in
2. Note your **global rank**, **completed rooms**, **level** (e.g. `[0x5]`), and **streak** from the dashboard
3. Fill `statsOverride` in `config/platforms.json`:

```json
"statsOverride": {
  "rank": 123456,
  "rooms": 42,
  "level": "[0x5]",
  "streak": "7 days"
}
```

4. Push — the SVG card and README table render these values until the API works again.

Update the numbers whenever you want the card to reflect new progress (monthly is fine).

### statsOverride fields (TryHackMe)

| Field | Meaning |
| :--- | :--- |
| `rank` | Global rank (number) |
| `rooms` | Completed rooms |
| `level` | Level badge (e.g. `[0x9][MAGE]`) |
| `streak` | Login streak (e.g. `103 days`) |

### Optional — recent rooms list

If you want a collapsible “Recent TryHackMe rooms” section in the README, add a GitHub secret **`THM_PROFILE_HASH`** (24-char hash from `completed-rooms?user=` in DevTools while viewing your own profile). This is optional and unrelated to `userPublicId`.

## After adding secrets or config

Run **Actions → Update profile stats → Run workflow** once, then rely on the daily schedule.

Update `data/durum-backup.json` from durum-web **Log → Download full backup** when your R score changes.
