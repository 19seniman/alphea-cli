# CLI untuk ALPHEA

Script Node.js tanpa dependency untuk login **email + kode OTP** ke akun ALPHEA, dengan email dan token disimpan di `.env`.

Butuh Node.js 18+ · tidak perlu `npm install`.

# 1) Jalankan sekali

```bash
node alphea.js
```

Perintah ini membuat `.env` berisi template.

# 2) Isi email

```bash
nano .env
```

Atau tanpa editor (sekaligus kirim kode OTP):

```bash
node alphea.js setup --email emailkamu@mail.com
```

# 3) Login

```bash
node alphea.js login
```

Kode OTP dikirim ke email, lalu dimasukkan di terminal. Tanpa password.

Kalau kodenya sudah ada di inbox:

```bash
node alphea.js login --otp 123456
```

Kalau kode kedaluwarsa:

```bash
node alphea.js login --resend
```

# 4) Cek akun & poin

```bash
node alphea.js me
node alphea.js points
```

## 5) Jalankan otomatis (session + quests + daily check-in)

```bash
node alphea.js auto
```

Satu perintah ini sudah mengerjakan semuanya:

- `StartForegroundSession` (kalau belum ada sesi)
- `SubmitHeartbeat` tiap 60 detik → menambah `VALID_FOREGROUND_SECONDS`
- klaim otomatis setiap 5 menit untuk semua quest yang `CLAIMABLE`, termasuk **Daily Check-In**
- klaim terakhir + `EndForegroundSession` saat Ctrl+C
- default berhenti setelah 12 jam; pakai `--hours 0` untuk jalan terus

Berhenti hanya karena: `Ctrl+C`, `--hours` tercapai, atau token mati dan refresh gagal (exit 3).

Opsi:

```bash
node alphea.js auto --hours 12       # batas durasi (default)
node alphea.js auto --hours 0        # tanpa batas, jalan terus lintas hari
node alphea.js auto --interval 60    # detik antar heartbeat
node alphea.js auto --claim-every 5  # menit antar pengecekan klaim
node alphea.js auto --once           # satu heartbeat + klaim, lalu keluar
node alphea.js auto --dry-run        # tidak mengirim apa pun
```

Jalan terus di Termux:

```bash
termux-wake-lock
nohup node alphea.js auto >> alphea-auto.log 2>&1 &
tail -f alphea-auto.log
```

### Manual, kalau perlu

```bash
node alphea.js session start | stop | ping | watch | status
node alphea.js quests      # daftar + progres
node alphea.js checkin     # klaim yang bisa diklaim saja
```

## Perintah lain

| Perintah | Fungsi |
|---|---|
| `otp` | kirim kode OTP saja, tanpa langsung login |
| `profile` | profil dari ProfileService |
| `history` | riwayat poin |
| `rounds` | daftar reward round |
| `auto` | otomatis: sesi + heartbeat + klaim quest (termasuk daily check-in) |
| `session` | foreground contribution: `start` / `stop` / `ping` / `watch` / `status` |
| `quests` | daftar quest + progres |
| `checkin` | klaim quest harian |
| `probe` | cek endpoint gateway mana yang hidup untuk akunmu |
| `setup` | isi `.env` tanpa editor |
| `edit` | buka `.env` di nano/Notepad |
| `env` | lihat isi `.env` (disamarkan) |
| `logout` | hapus token dari `.env` |
| `get` / `post` | panggil endpoint gateway apa pun |
| `about` | info script & author |

## Catatan

- Login memakai `AuthService` di gateway `https://edge.alphea.ai`: `RequestEmailChallenge` lalu `VerifyEmailChallenge`. Tanpa password.
- Access token diperbarui otomatis lewat `RefreshSession` saat server membalas 401.
- Email baru disimpan setelah kode berhasil dikirim; token baru disimpan setelah verifikasi berhasil.
- `.env` dibuat dengan permission `600` dan masuk `.gitignore`.
- Detail teknis & daftar service ada di [NOTES.md](NOTES.md).

## Author

19Seniman · Traktir ☕

BSC · ETH · Hype

```
0xf01fb9a6855f175d3f3e28e00fa617009c38ef59
```

Tampil juga di script: `node alphea.js about`
