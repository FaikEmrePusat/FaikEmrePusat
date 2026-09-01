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

**Without secrets:** the script tries to scrape https://tryhackme.com/p/YOUR_USERNAME. TryHackMe often blocks automated requests (Vercel Security Checkpoint / HTTP 429). When blocked, the card still renders with your username and a *Scrape blocked* status.

**Optional fallbacks** (when scrape is blocked):

| Secret / config field | Purpose |
| :--- | :--- |
| `THM_USER_PUBLIC_ID` (secret or `config/platforms.json`) | Badge iframe API — rank, rooms, level, streak |
| `THM_PROFILE_HASH` (secret or `config/platforms.json`) | Completed-rooms API — room count + recent list in the stats table |

### Get `userPublicId` (one-time)

1. Log in at https://tryhackme.com
2. Open your profile → **Share profile** / **Embed badge**
3. Copy the iframe URL — it contains `userPublicId=1234567`
4. GitHub secret: **`THM_USER_PUBLIC_ID`** = that number, or add `"userPublicId": 1234567` to `config/platforms.json`

**Alternative:** browser DevTools → Network → filter `userPublicId` on the profile page.

### Optional — recent rooms in the stats table

GitHub secret: **`THM_PROFILE_HASH`** (24-char hash from `completed-rooms?user=` in the Network tab)

## After adding secrets

Run **Actions → Update profile stats → Run workflow** once, then rely on the daily schedule.

Update `data/durum-backup.json` from durum-web **Log → Download full backup** when your R score changes.
