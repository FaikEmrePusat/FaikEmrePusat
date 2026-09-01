# Platform stats setup (one-time, ~3 minutes)

Real badges and activity tables need **GitHub Secrets** — platforms no longer expose public IDs in the UI.

## Hack The Box (recommended — easiest)

Shows **live HTB badge**, user/root owns, rank, and points.

1. Log in at https://app.hackthebox.com
2. **Settings → App Token → Create**
3. Copy the token
4. GitHub → **FaikEmrePusat/FaikEmrePusat** → **Settings → Secrets → Actions**
5. New secret: `HTB_APP_TOKEN` = paste token (never commit tokens to the repo)
6. **Actions → Update profile stats → Run workflow**

Your numeric `userId` is saved automatically after the first run (or set in `config/platforms.json` — it is public).

**If a token was exposed** (e.g. pasted in chat), revoke it in HTB **Settings → App Token**, create a new one, and update the `HTB_APP_TOKEN` GitHub secret.

## TryHackMe (optional, for live badge + room count)

### Option A — profile hash (completed rooms + recent activity)

1. Log in at https://tryhackme.com and open your profile
2. Press **F12** → **Network** tab → refresh page
3. Filter by `completed-rooms`
4. Copy the `user=` value from the URL (24-character hash)
5. GitHub secret: `THM_PROFILE_HASH` = that hash

### Option B — live badge image (rank, streak, rooms on badge PNG)

1. Same Network tab on your profile — look for `userPublicId=` in any request, **or** embed/badge iframe URL
2. GitHub secret: `THM_USER_PUBLIC_ID` = the number

With `THM_USER_PUBLIC_ID` set, CI captures `./assets/thm-badge.png` via Playwright.

## pwn.college

No secret needed — rank and points update from your username automatically.

## After adding secrets

Run workflow manually once, then daily at 06:00 UTC.

Update `data/durum-backup.json` from durum-web **Log → Download full backup** when your R score changes.
