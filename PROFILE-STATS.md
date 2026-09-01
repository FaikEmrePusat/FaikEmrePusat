# Profil İstatistikleri — Kurulum ve Güncelleme

Bu depo (`FaikEmrePusat/FaikEmrePusat`) GitHub profil README'nizi ve otomatik güncellenen istatistik kartlarını barındırır.

## Hızlı başlangıç

1. **`config/platforms.json`** dosyasını düzenleyin:
   - Her platform için `enabled: true`
   - `username` ve gerekli ID alanlarını doldurun
2. **Durum verisini** `data/durum-backup.json` dosyasına kopyalayın (durum-web → Log → Tam yedek dışa aktar)
3. Push edin veya **Actions → Update profile stats → Run workflow** ile manuel tetikleyin

## Platform yapılandırması

### TryHackMe

| Alan | Nereden bulunur |
| :--- | :--- |
| `username` | `https://tryhackme.com/p/KULLANICI` |
| `userPublicId` | Profil → Embed badge → iframe URL'sindeki `userPublicId=` değeri |

```json
"tryhackme": {
  "enabled": true,
  "username": "ornek",
  "userPublicId": 1234567,
  "profileUrl": "https://tryhackme.com/p/ornek"
}
```

**Not:** TryHackMe rozet API'si bazen bot koruması (Vercel checkpoint) nedeniyle CI'da yanıt vermeyebilir. Bu durumda profil linki ve kalkan rozeti yine görünür; tablo istatistikleri için `userPublicId` gerekir.

### Hack The Box

| Alan | Nereden bulunur |
| :--- | :--- |
| `username` | Profil URL'si |
| `userId` | Profil ayarları veya eski rozet URL'si: `hackthebox.eu/badge/image/USER_ID` |

HTB rozeti (`badge/image/{userId}`) HTB sunucularından **canlı** güncellenir — ek işlem gerekmez.

### pwn.college

| Alan | Nereden bulunur |
| :--- | :--- |
| `username` | `https://pwn.college/hacker/KULLANICI` |

Sıra ve puan `pwncollege_api/v1/score` üzerinden günlük çekilir.

## Durum paneli grafikleri

Grafikler React değil **SVG** olarak README'ye gömülür (GitHub profil kısıtı).

### Yerel güncelleme

```bash
cd durum-web
npm run profile:stats -- --input ../FaikEmrePusat/data/durum-backup.json --output ../FaikEmrePusat
```

Bu komut şunları üretir:

- `assets/durum-summary.svg` — R skoru + T/P/L/C boyutları
- `assets/durum-skills.svg` — beceri çubuk grafiği
- `assets/durum-gates.svg` — kapı hattı
- `data/profile-stats.json` — özet metrikler

### Otomatik güncelleme (GitHub Actions)

Workflow: `.github/workflows/update-profile-stats.yml`

- **Zamanlama:** Her gün 06:00 UTC
- **Manuel:** Actions sekmesinden `workflow_dispatch`
- `data/durum-backup.json` yoksa seed verisiyle demo kartlar üretilir

## Dosya yapısı

```
FaikEmrePusat/
├── README.md                 # Profil (AUTO bölümleri workflow ile güncellenir)
├── config/platforms.json     # Platform kullanıcı adları
├── data/
│   ├── durum-backup.json     # durum-web tam yedek (siz güncellersiniz)
│   └── profile-stats.json    # CI tarafından üretilen özet
├── assets/                   # SVG kartlar
├── generated/                # CI ara çıktıları
└── scripts/
    ├── update-profile-stats.mjs
    └── patch-readme.mjs
```

## Sınırlamalar

- GitHub README canlı React/iframe desteklemez — yalnızca statik görsel ve tablo
- TryHackMe API rate limit / bot koruması olabilir
- HTB detaylı istatistikler için resmi API token gerekir (bu kurulumda yalnızca rozet kullanılır)
- pwn.college kullanıcı adı yanlışsa API hata döner
- Kişisel strateji belgeleri veya Firebase anahtarları **commit edilmemelidir**
