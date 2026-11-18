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

Field JSON ber-camelCase: `questId`, `sessionId`, `deviceId`. Karena bentuk respons belum terlihat dengan akun nyata, `quests` membaca `quests`/`items`/`data` dan `checkin` memakai `period` + `state` apa adanya; kalau kosong, script mencetak respons mentah.

## Fitur yang TIDAK ada di API Hub

- **Foreground Contribution Session** — tidak ada service/method-nya di Hub (tidak ada `SessionService`, `ContributionService`, `QuestService`; semua 404).
- **Quests / daily check-in** — tidak ada method quest/check-in di 42 method di atas. Kata "quest" yang banyak muncul di bundel marketing ternyata sebagian besar potongan kata "re**quest**".

Keduanya fitur aplikasi **ALPHEA Connect (Android)**. Untuk memetakan endpoint-nya perlu APK resmi; tidak ada tautan APK di situs, hanya Play Store.

## Guard

Jeda 2,5 detik ±25% antar request tulis, retry 3× backoff eksponensial, hormati `Retry-After`, timeout 20 detik.
