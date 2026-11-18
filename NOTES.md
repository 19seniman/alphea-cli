# Catatan teknis

## Sumber

- `https://alphea.ai` — situs marketing (Vite SPA)
- `https://hub.alphea.ai` — ALPHEA Hub (web app), bundle + chunk `PointsPage`, `ReferralPage`, `ClaimPage`, `RedeemPage`
- `https://edge.alphea.ai` — gateway RPC (dipakai SDK `@alphea/connect`)
- `https://docs.alphea.ai` — dokumentasi

SDK memanggil gateway dalam bentuk **RPC**: `POST {edge}/alphea.connect.v1.<Service>/<Method>` dengan body JSON dan `Authorization: Bearer <accessToken>`.

## Login (terverifikasi ke server)

```
POST /alphea.connect.v1.AuthService/RequestEmailChallenge
{"email":"…","delivery":"EMAIL_DELIVERY_OTP"}
→ {"challengeId":"3509d0d2-…","serverTime":"2026-11-18T14:43:17Z"}

POST /alphea.connect.v1.AuthService/VerifyEmailChallenge
{"email":"…","code":"123456","challenge_id":"<challengeId>"}
→ sesi (token)
```

Kode salah → `{"code":"invalid_argument","message":"verification failed"}`.

Catatan penting: `auth.alphea.ai` (GoTrue/Supabase) **bukan** jalur yang dipakai Hub — Hub memakai `AuthService` di gateway. `/otp` di GoTrue tetap menjawab 200, jadi mudah salah kira.

## Service & method yang tersedia (dari peta kontrak di bundel Hub)

| Service | Method |
|---|---|
| **AuthService** | RequestEmailChallenge, ResendEmailChallenge, VerifyEmailChallenge, CurrentSession, RefreshSession, Logout, GoogleLogin |
| **BootstrapService** | DiscoverEdge |
| **ProfileService** | GetProfile, ListEntitlements, SubmitStorePurchase |
| **RewardService** | GetPointSummary, GetClaimableRewards, GetClaimProof, GetRedeemStatus, CreateRedeemRequest, RepinRedeemWallet, GetRewardRound, ListRewardRounds, GetRoundStatus, WithdrawFromRound, JoinSponsoredClaimQueue, LeaveSponsoredClaimQueue, GetSponsoredClaimQueueStatus, GetSponsoredClaimStatus, GetSponsoredClaimOperationByRound, SubmitSponsoredClaim, ResetSponsoredClaim |
| **WalletService** | GetPointBalance, GetPointHistory, ListWallets, LinkWalletChallenge, LinkWalletVerify, UnlinkWallet |
| **ReferralService** | GetReferralCode, ListFriends, GetReferralRewards, GetInviterBonus, ClaimInviterBonus, ClaimCompletionBonus, ClaimReferralReward, RedeemInvitation |

Total 42 method. `BootstrapService/DiscoverEdge` bisa dipanggil tanpa token dan mengembalikan node edge + target klaim hadiah:

```
{"nodeId":"edge-kr-seoul-1","rpcUrl":"https://edge.alphea.ai","region":"kr-seoul",
 "rewardClaimTargets":[{"chainId":"56","distributor":"0x3e7fa0d430b9735ccc94a35b6e0b1b4ee401f539",
 "tokenAddress":"0xc63961bf9a7d6bb5844524851d04fbd76dbe915b","tokenDecimals":18}]}
```

## Foreground session & quests (dari bundle APK ALPHEA Connect)

APK resmi (22,9 MB, React Native + Hermes 5,68 MB) memuat 40 path RPC. Yang relevan:

```
alphea.connect.v1.ActivityService/StartForegroundSession
alphea.connect.v1.ActivityService/SubmitHeartbeat
alphea.connect.v1.ActivityService/EndForegroundSession
alphea.connect.v1.QuestService/ListQuests
alphea.connect.v1.QuestService/ClaimQuest
```

Semuanya menjawab 401 `{"code":"unauthenticated","message":"connect identity not accepted"}` tanpa token — jadi path-nya benar.

Enum yang dipakai app:

| Enum | Nilai |
|---|---|
| `QUEST_STATE_*` | `UNSPECIFIED`, `LOCKED`, `IN_PROGRESS`, `CLAIMABLE`, `CLAIMED` |
| `QUEST_PERIOD_*` | `UNSPECIFIED`, `DAILY` |
| `QUEST_METRIC_*` | `UNSPECIFIED`, `VALID_FOREGROUND_SECONDS`, `AUTHENTICATED_LOGIN_COUNT`, `VALID_INVITEE_COUNT` |

`QUEST_METRIC_VALID_FOREGROUND_SECONDS` inilah penghubung antara dua misi: quest harian menghitung **detik foreground valid** yang dikumpulkan lewat sesi kontribusi. Jadi `session watch` yang rajin = progres quest harian naik.

Teks UI pendukung: "Active today · Resets daily", layar `DailyQuestScreen`, `DailyQuestCard`, `ActivityUnavailable`.

Bentuk respons `ListQuests` (terlihat 18 Nov 2026):

```json
{
  "quests": [{
    "questId": "daily-login-1",
    "metric": "QUEST_METRIC_AUTHENTICATED_LOGIN_COUNT",
    "period": "QUEST_PERIOD_DAILY",
    "targetValue": "1",          // string, bukan number
    "measuredValue": "1",        // string
    "reward": { "micros": "600000000" },   // 1 poin = 1.000.000 micros → 600 pts
    "state": "QUEST_STATE_CLAIMABLE",
    "periodKey": "2026-11-18",
    "resetAt": "2026-11-19T00:00:00Z"
  }],
  "serverTime": "…",
  "questDisplayNames": {
    "daily-login-1": { "names": { "en": "Daily Check-In" } }
  }
}
```

Nama quest **tidak** ada di dalam objek quest — harus diambil dari `questDisplayNames[questId].names.en`.

Period yang dipakai: `QUEST_PERIOD_DAILY` dan `QUEST_PERIOD_LIFETIME` (bukan hanya DAILY).
Metric yang dipakai: `VALID_FOREGROUND_SECONDS`, `AUTHENTICATED_LOGIN_COUNT`, `ACTIVE_INVITEE_COUNT`, `VALID_INVITEE_COUNT`.

Daftar quest harian + reward di akun contoh:

| Quest | Syarat | Reward |
|---|---|---|
| Daily Check-In | 1 login | 600 |
| 1H Contribution Time | 3.600 detik | 800 |
| 3H Contribution Time | 10.800 detik | 1.300 |
| 6H Contribution Time | 21.600 detik | 1.800 |
| 12H Contribution Time | 43.200 detik | 2.500 |
| 5–1.000 Active Referrals | referral aktif | 200–600 |
| 1–100 Qualified Referral (lifetime) | referral valid | 1.000–50.000 |

Field JSON ber-camelCase: `questId`, `sessionId`, `deviceId`. Karena bentuk respons belum terlihat dengan akun nyata, `quests` membaca `quests`/`items`/`data` dan `checkin` memakai `period` + `state` apa adanya; kalau kosong, script mencetak respons mentah.

## Bentuk data profil

`CurrentSession` membalas `{user:{…}, sessionId, expiresAt}` dengan **camelCase** (`userId`, `createdAt`, `lastSignInAt`, `emailVerified`), bukan snake_case gaya GoTrue. `printUser()` sekarang mencetak semua field skalar apa adanya, jadi kalau ada field baru langsung kelihatan tanpa perlu ubah kode.

## 503 dari gateway

`RequestEmailChallenge` kadang dibalas **HTTP 503** sebelum berhasil. Itu kondisi gateway (bukan body salah) dan script menanganinya dengan backoff: 6s → 8s → 25s, lalu sukses. Kalau 503 terus muncul, tunggu 1–2 menit; jangan spam karena memperpanjang cooldown.

## Perilaku `auto`

Satu proses menjalankan tiga hal sekaligus:

1. `StartForegroundSession` bila belum ada `ALPHEA_SESSION_ID` di `.env` (kalau ada, dilanjutkan).
2. Loop `SubmitHeartbeat` tiap `--interval` detik (default 60) + jitter 0–4 detik, sehingga `measuredValue` pada quest `VALID_FOREGROUND_SECONDS` bertambah.
3. Tiap `--claim-every` menit (default 5) memanggil `ListQuests` lalu `ClaimQuest` untuk setiap state `QUEST_STATE_CLAIMABLE` — ini yang membuat **Daily Check-In** terklaim tanpa perintah manual.

Penghentian: `Ctrl+C`/SIGTERM → klaim terakhir + `EndForegroundSession`. Batas durasi `--hours` (default 12) agar tidak menggantung; 12 jam juga menutup tier tertinggi `12H Contribution Time` (43.200 detik).

Kalau heartbeat membalas 401, script mencoba `RefreshSession`; kalau tetap gagal, sesi ditutup dan keluar dengan kode 3 (perlu `login` OTP lagi).

## Fitur yang TIDAK ada di API Hub

- **Foreground Contribution Session** — tidak ada service/method-nya di Hub (tidak ada `SessionService`, `ContributionService`, `QuestService`; semua 404).
- **Quests / daily check-in** — tidak ada method quest/check-in di 42 method di atas. Kata "quest" yang banyak muncul di bundel marketing ternyata sebagian besar potongan kata "re**quest**".

Keduanya fitur aplikasi **ALPHEA Connect (Android)**. Untuk memetakan endpoint-nya perlu APK resmi; tidak ada tautan APK di situs, hanya Play Store.

## Guard

Jeda 2,5 detik ±25% antar request tulis, retry 3× backoff eksponensial, hormati `Retry-After`, timeout 20 detik.
