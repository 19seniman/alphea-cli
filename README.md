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

## 5) Foreground session & quests

```bash
node alphea.js session start        # mulai sesi kontribusi
node alphea.js session watch        # heartbeat tiap 60 detik (Ctrl+C = stop rapi)
node alphea.js session stop
node alphea.js session status
node alphea.js quests               # daftar quest + progres
node alphea.js checkin              # klaim quest harian yang bisa diklaim
```

`session watch` mengirim `SubmitHeartbeat` berkala dan menutup sesi dengan `EndForegroundSession` saat kamu tekan Ctrl+C.

Opsi: `--interval 60` (detik heartbeat), `--json` untuk keluaran mentah.

## Perintah lain

| Perintah | Fungsi |
|---|---|
| `otp` | kirim kode OTP saja, tanpa langsung login |
| `profile` | profil dari ProfileService |
| `history` | riwayat poin |
| `rounds` | daftar reward round |
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
