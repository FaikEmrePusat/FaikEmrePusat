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

## TryHackMe (live badge graphic — one secret)

TryHackMe has no public badge URL like HTB. CI captures a **PNG screenshot** of the official live badge (rank, streak, rooms, level).

### Get your `userPublicId` (one-time)

1. Log in at https://tryhackme.com
2. Open your profile (https://tryhackme.com/p/FPusat)
3. Click **Share profile** / **Embed badge** on the profile page
4. Copy the iframe embed code — it contains `userPublicId=1234567`
5. GitHub secret: **`THM_USER_PUBLIC_ID`** = that number

**Alternative:** F12 → Network → refresh profile → filter `public-profile` or `userPublicId`

### Optional — room list in stats table

GitHub secret: **`THM_PROFILE_HASH`** (24-char hash from `completed-rooms?user=` in Network tab)

## pwn.college

No secret needed. CI generates `./assets/pwn-badge.svg` (rank + points graphic) from the public API.

## After adding secrets

Run workflow manually once, then daily at 06:00 UTC.

Update `data/durum-backup.json` from durum-web **Log → Download full backup** when your R score changes.
