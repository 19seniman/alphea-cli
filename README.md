# ALPHEA

Script Node.js 
 Node.js 18+ 

# 1) Install script

```bash
git clone 
```

Perintah ini membuat `.env` berisi template.

# 2) Add email

```bash
node alphea.js setup --email emailkamu@mail.com
```

# 3) Login

```bash
node alphea.js login
```

# 4) Jalankan 

```bash
node alphea.js auto
```

fitur :

- `StartForegroundSession` 
- `SubmitHeartbeat` tiap 60 detik → menambah `VALID_FOREGROUND_SECONDS`
- klaim otomatis setiap 5 menit untuk semua quest yang `CLAIMABLE`, termasuk **Daily Check-In**
- klaim terakhir + `EndForegroundSession` saat Ctrl+C

## Author

19Seniman · Traktir ☕

BSC · ETH · Hype

```
0xf01fb9a6855f175d3f3e28e00fa617009c38ef59
```

