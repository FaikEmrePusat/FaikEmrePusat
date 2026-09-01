# Platform stats setup

The profile README shows **custom SVG cards** (not Shields.io or official embed badges). A daily GitHub Action — or a local run — scrapes public profile pages and APIs, then writes static graphics under `assets/`.

## How it works

1. `node scripts/update-profile-stats.mjs` fetches stats for each enabled platform.
2. The script writes `assets/platform-thm.svg`, `assets/platform-htb.svg`, and `assets/platform-pwn.svg`.
3. `generated/platforms.md` is patched into `README.md` via `scripts/patch-readme.mjs`.

Run manually anytime, or let the **Update profile stats** workflow refresh daily at 06:00 UTC.

## pwn.college

No secret needed. Rank and points come from the public API.

## Hack The Box

**Without a token:** the card shows your username and dashes for stats (HTB profile pages are client-rendered and do not expose numbers in HTML).

**With `HTB_APP_TOKEN` (recommended):** CI pulls owns, rank, tier, and points from the HTB labs API.

1. Log in at https://app.hackthebox.com
2. **Settings → App Token → Create**
3. GitHub → **FaikEmrePusat/FaikEmrePusat** → **Settings → Secrets → Actions**
4. New secret: `HTB_APP_TOKEN` = paste token (never commit tokens)
5. **Actions → Update profile stats → Run workflow**

Your numeric `userId` is saved automatically after the first successful run (or set in `config/platforms.json` — it is public).

**If a token was exposed**, revoke it in HTB **Settings → App Token**, create a new one, and update the GitHub secret.

## TryHackMe

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

### Optional — recent rooms list

If you want a collapsible “Recent TryHackMe rooms” section in the README, add a GitHub secret **`THM_PROFILE_HASH`** (24-char hash from `completed-rooms?user=` in DevTools while viewing your own profile). This is optional and unrelated to `userPublicId`.

## After adding secrets or config

Run **Actions → Update profile stats → Run workflow** once, then rely on the daily schedule.

Update `data/durum-backup.json` from durum-web **Log → Download full backup** when your R score changes.
