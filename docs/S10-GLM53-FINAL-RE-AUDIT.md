# S10 GLM 5.3 — FINAL INDEPENDENT FORENSIC RE-AUDIT

**Checkpoint diaudit**: `2940d7638d6b2b7da97ce978838312c97a2190b6`
**Auditor**: GLM 5.3 (independent forensic auditor)
**Tarikh**: 2026-08-19/20 (Session 2 + penutup)
**Mod**: READ-ONLY mutlak — tiada fix/commit/push/deploy/migrate ke prod. Semua DB forensik adalah disposable dan dibuang selepas audit.

---

## 1. Executive Summary

Re-audit S10 pada checkpoint `2940d76` selepas remediation `73e941e` (0026/0027) dan final remediation `2940d76` (0028 + drift reconciliation + trust-proxy hardening).

**Keputusan**: Semua finding S10 audit pertama (REJECT) telah **FIXED dan dibuktikan secara independent** — D-01 developer staff privilege escalation tertutup pada DB/RLS layer; drift dev-vs-replay tertutup pada peringkat definisi penuh; registration, refresh-token matrix, rate limiting, trust-proxy, RBAC, IDOR, multi-tenant isolation, E2E dan suite 561/561 semuanya terbukti berfungsi pada sistem sebenar.

Dapatan baharu: **tiada CRITICAL, tiada HIGH**. Enam (6) finding baharu direkodkan — 2 MEDIUM (satu test-infra reproducibility, satu defense-in-depth gap warisan S8), 3 LOW, dan beberapa INFO. None adalah production blocker.

**VERDICT AKHIR: 🟢 APPROVE FOR CHATGPT S10 GOVERNANCE REVIEW** — dengan 2 condition pre-deploy (F-03 TRUSTED_PROXIES, F-01 test fixture self-containment) yang tidak menghalang governance review.

---

## 2. Audit Scope

S10 T1 (Frontend↔Backend), T2 (Production Foundation), T3 (Security+E2E), T4 (Staging+Production Readiness). Fokus forensik pada remediation 0026–0028 dan semua tuntutan laporan `S10-FINAL-REMEDIATION-REPORT.md`.

Kaedah: actual-behaviour-first. Probe RLS melalui `SET ROLE medini_app` + GUC `app.role/app.staff_id/app.org_id` dalam transaksi ROLLBACK (bukan superuser BYPASSRLS). Replay bersih tanpa patch manual. HTTP probes live terhadap `node dist/main.js`. Evidence hierarchy: actual behaviour > DB/RLS > source > tests > claims.

---

## 3. Repository State

| Item | Hasil |
|---|---|
| HEAD | `2940d76` = checkpoint yang dituntut ✅ |
| Working tree | Bersih ✅ |
| Branch | `main`, **ahead 2** (`73e941e`, `2940d76` — belum push) ℹ️ F-08 |
| dist/main.js | Fresh vs src (22:13 vs 21:40) ✅ |
| Journal | idx 27 (`0028_s10_d01_staff_deny`), kontiguiti penuh ✅ |

## 4. S8/S9 Baseline Integrity — PASS

MD5 0020–0024 vs git blob pada S9 lock `7cca0b3`:

```
0020 b01c426296d300781a6f6d2d14e8f189  IDENTICAL
0021 e82dc531895e29d7fccd48ae17371972  IDENTICAL
0022 a9cec5f7d40f21166f10367f6a132df8  IDENTICAL
0023 ba770b07ac370d155c62fb8c311f0d0a  IDENTICAL
0024 46db1f4afd2b167ae3dd91014519af0b  IDENTICAL
```

`git diff 7cca0b3..HEAD -- backend/drizzle` = hanya tambahan 0025–0028 + journal. **Immutable ✅**.

## 5. Migration Replay — PASS

`CREATE DATABASE medini_s10r` (dan kemudian `medini_replay_0028`); 28 migrasi (0000→0028) via `sed 's/--> statement-breakpoint//g' | psql -v ON_ERROR_STOP=1 -q` — **0 error, 0 patch manual**.

## 6. S10-03 DB Drift — FIXED (definisi penuh, bukan count)

| Aspek | dev | replay | Keputusan |
|---|---|---|---|
| pg_policies (count) | 294 | 294 | IDENTIKAL |
| Policies full-def md5 | `5c311f288a…` | `5c311f288a…` | **IDENTIKAL** |
| Columns / Constraints / Indexes | — | — | IDENTIKAL |
| Grants / Enums / Triggers | — | — | IDENTIKAL |
| RLS state (70 tables, force flag) | — | — | IDENTIKAL |
| Functions | 6 | 6 | ℹ️ komen sahaja (F-08) |

Drift asal (dev 288 vs replay 289) telah di-reconcile oleh 0028 §4: `n9_staff_worker_exclusion` (INSERT) di-drop secara deterministik; `n9_staff_human_all` kehilangan WITH CHECK di-encode; `s10_staff_registration_update` di-encode tanpa WITH CHECK. Baki: 2 baris **komen** dalam badan `register_staff_with_token` di dev tiada dalam replay + whitespace `app_org_id` — kosmetik, tiada logik (ℹ️).

## 7. S10-01 Registration — FIXED ✅

**DB layer (replay murni)**: token sah → `(id,'Pending')`; luput → `P0002 Invitation has expired`; tidak sah → `P0002 Invalid or expired invitation`; status bukan `Invited` → `P0001 already used`; selepas commit: role kekal, status Pending, `invite_token=NULL`, hash ditetapkan; reuse → error; **tiada parameter role** (tiada self-escalation). SECURITY DEFINER owner=medini, EXECUTE grant medini_app.

**LIVE HTTP (backend dist, medini_dev)**: `/api/v1/auth/register` dengan invite token sebenar → `201 {staffId, status:"Pending"}`; DB mengesahkan **Argon2id** + token NULL; reuse → `401 Invitation has expired`; login pending user → `401` generic.

**Suite**: `s10-registration-replay.spec.ts` 3/3 PASS atas replay fixture (11 langkah penuh: invite→register→Argon2→token cleared→single-use→approve→Active→login→tokens).

## 8. S10-02 Refresh Tokens — FIXED ✅ (matriks penuh)

| Probe (sebagai medini_app + GUC) | Hasil |
|---|---|
| doctor SELECT own token | ALLOW (by contract) |
| doctor SELECT/UPDATE token HQ | 0 rows / UPDATE 0 |
| doctor INSERT arbitrary | **DENIED** (RLS) |
| doctor DELETE | **permission denied** |
| hq SELECT token doctor | 0 rows (own-only, bukan org-wide) |
| hq INSERT arbitrary | **DENIED** |
| developer SELECT/INSERT/UPDATE | 0 rows / **DENIED** / 0 |
| worker | full service access (by design) |
| GUC org salah | 0 rows (org isolation) |

Token disimpan sebagai **hash**; tiada policy FOR ALL luas selain RESTRICTIVE org-isolation; tiada plaintext. LIVE: refresh rotation berfungsi, **old-token reuse → 401**, refresh selepas logout → 401.

## 9. D-01 Developer Staff Privilege Escalation — FIXED ✅

0028 mencipta `s10_developer_staff_write_deny` (RESTRICTIVE FOR ALL), `s10_developer_staff_read_deny` (RESTRICTIVE SELECT), `s10_developer_ra_deny` (role_assignments), + org/branch/audit_log deny. Semua menggunakan `COALESCE(app_role(),'')` supaya laluan pre-auth login (no-GUC) kekal berfungsi.

**Matriks live (replay murni, SET ROLE medini_app)**: INSERT staff (role='hq', Active, developer) → **42501 DENIED**; UPDATE doctor→hq / status→Active / invite_token / password_hash → **UPDATE 0** (rows tidak wujud untuk developer); DELETE → **permission denied**; SELECT staff/pwd_hash/invite_token/role_assignments/orgs/branches/audit_log → **0 rows**.

**Positive controls**: doctor baca own row ✅; HQ baca+update staff ✅; **no-GUC login lookup = 1 row** (auth pipeline tidak pecah) ✅; worker 0 rows ✅.

**LIVE HTTP**: `s10-developer-systemadmin.spec.ts` 4/4 PASS — HQ invite → developer register (link) → HQ approve → developer refresh lifecycle.

## 10. S10-05 Rate Limiting — FIXED ✅ (LIVE)

| Route | Tingkah laku diperhatikan |
|---|---|
| POST /auth/login | 401×4 → **429** pada ke-5 (5/min) |
| POST /auth/register | 401×3 → **429** pada ke-4 (3/min) |
| POST /auth/refresh | 401×10 → **429** pada ke-11 (10/min) |
| GET /health/live ×15 | 200 semua (route tanpa @Throttle tidak terjejas) |

429 body: `{"error":{"code":"THROTTLER","message":"ThrottlerException: Too Many Requests","correlationId":…}}`. Pemulihan selepas window 60s disahkan (E2E re-run lulus selepas reset).

## 11. D-07 Trust Proxy / Caddy — FIXED ✅ (fail-closed)

- `TRUSTED_PROXIES` kosong (default) → XFF **diabaikan sepenuhnya**; tracker = socket peer.
- **Ujian spoof LIVE**: rotasi `X-Forwarded-For: 1.2.3.0→1.2.3.3` atas bucket exhausted → **429 berterusan** — leftmost-XFF rotation gagal bypass.
- Kod: rightmost-untrusted entry bila peer dipercayai; IPv4 CIDR allowlist; fail-safe (satu bucket) bukan fail-open.
- Caddyfile: `header_up X-Forwarded-For {remote_host}` — Caddy **replace** (bukan append), yang menghapuskan nilai client-supplied sepenuhnya (komen kod mengatakan "append" — doc mismatch kecil ℹ️ F-07).
- 🔵 **F-03**: `TRUSTED_PROXIES` tidak diset dalam `docker-compose.prod.yml`/`staging.env` — selamat (fail-closed) tetapi per-IP throttling tidak aktif di sebalik Caddy sehingga ops menetapkannya. **Mesti diset semasa deploy.**

## 12. RBAC — PASS

- `/api/system-admin/{overview,health,readiness}`: unauth=**401**, JWT invalid/tampered/garbage=**401**, hq/manager/doctor/reception=**403 semua** (developer-only by design; tiada akaun developer di dev DB — provisioning out-of-band).
- `ROLE_DOMAIN_MATRIX` source review: doctor patients=view-only; reception (branch_admin) patients CRUD branch-scope.
- LIVE: doctor create patient → **403** (betul); reception create own-branch → **201**; reception create branch lain → **403**; reports HQ-only (doctor=403); unauth semua=401.

## 13. RLS Multi-Tenant Isolation — PASS

Diverifikasi melalui ujian langsung di atas (refresh_tokens org-isolation, staff read/write denies, worker exclusion) + 82 fail integration test lain termasuk S8 cross-org/cross-branch worker denies (F-13 spec PASS). Org A/B, branch A/B, user A/B isolation pada SELECT/INSERT/UPDATE/DELETE disemak di layer DB, bukan API sahaja.

## 14. IDOR / API Security — PASS

- Doctor baca patient ciptaan reception (branch berbeza) → **404 invisible** (bukan 403 leak).
- Fake UUID → 404; unauth → 401; tampered JWT signature → **401**.
- Refresh token orang lain → tidak wujud (0 rows RLS).

## 15. Authentication / User Lifecycle — PASS

Login 200 dengan shape selamat (`accessToken/refreshToken/tokenType/expiresIn/user` — user tanpa hash/token); 401 **generic identical** untuk user-tak-wujud vs password-salah (tiada enumeration); pending user tidak boleh login; logout 200 + refresh revoke; rotation + reuse-detection berfungsi. (ℹ️ F-06: access token stateless kekal valid sehingga expiry selepas logout — trade-off direkodkan.)

## 16. Developer / System Admin — PASS

Semak §9 (D-01) + §12. `/system-admin/*` read-only (overview/health/readiness sahaja — tiada operasi destruktif dalam controller). Developer = technical-only: 0 akses staff/org/branch/audit_log pada RLS.

## 17. First-HQ Bootstrap — PASS (documented, by design)

`docs/S10-FIRST-HQ-BOOTSTRAP.md` (118 baris): one-shot (guard count Active hq), CSPRNG token + SHA-256 at-rest, out-of-band delivery, dual-control activation, audit-logged, failure matrix. Skrip **sengaja tidak diimplementasi** sehingga deployment pertama dijadualkan (§6, didokumenkan; constraint S10: perubahan mesti map kepada finding). Cukup untuk production; tidak ditolak.

## 18. Frontend — PASS dengan nota

- **ESLint: 14 errors, 0 warnings** — konsisten claim baseline 14. Semua di `src/components/ui/*` (react-refresh) + `db/seed.ts` (no-explicit-any/unused) — **tiada S10-related**.
- **`vite build`: PASS** (44.9s, EXIT 0).
- 🔵 **F-04**: `tsc -b` (npm run check) FAIL 42 errors — 40 di `db/seed.ts` (luar tsconfig.app include "src"), **2 dalam src**: `AppLayout.tsx:349 user?.email` (AuthUser tiada email) + `api.ts` erasableSyntaxOnly. Vite tidak typecheck jadi build lulus. Hygiene; bukan blocker.

## 19. Browser E2E — PASS (dengan test-design note)

Playwright 1.62, chromium, backend :3000 + vite :5173 live:

- `journey-a-login-patients.spec.ts`: **3/3 PASS** (login→dashboard, wrong-password stays /login, patients page).
- `journeys-b-h.spec.ts`: **9/9 PASS secara individual/subset** (B patient CRUD, C appointments, D clinical, E finance, F reports, G administration+invite dialog, H multi-branch RBAC).
- **Full-file run**: gagal deterministik pada test #6–#9 — punca: setiap test login `hq` sekali; 9 login berturut > **5/min/IP** → 429 → kekal /login. Ini rate-limiter **bekerja seperti direka**; kegagalan adalah artefak reka bentuk test (tiada storageState sharing / SkipThrottle). Direkodkan 🔵 F-09 (test-infra), bukan defect produk.

## 20. Docker / Caddy / HTTPS — PASS

Prod compose: postgres/redis **tiada public port** (internal network sahaja), Redis requirepass + appendonly, healthchecks semua service, restart unless-stopped, Caddy 80/443 auto-HTTPS + security headers (HSTS preload, XFO, nosniff) + `-Server`, /metrics→404 dari internet, backup sidecar cron 02:00. Dev compose didokumenkan "dev/test only".

## 21. Metrics — PASS

`/metrics` LIVE 200 (Prometheus, @Public by design — S9 Q6 governance decision; network-restricted di prod via Caddy 404). `/health/live` + `/health/ready` public-safe.

## 22. Backup / Restore — PASS (documented + implemented)

`backup/backup.sh` (pg_dump --clean --if-exists gzip → volume, retention 30d, log pruning) + `restore-rehearsal.sh` wujud. Berjalan sebagai sidecar cron. (Restore rehearsal penuh atas prod-scale data tidak dijalankan dalam sesi ini — ℹ️ direkodkan.)

## 23. RPO / RTO — INFO

Backup harian 02:00 → RPO 24h (didokumenkan di S10 T2). RTO bergantung pada prosedur restore manual — tiada SLA automatik. Cukup untuk skop S10; dinilai semula pada go-live.

## 24. Power BI / Integrations — INFO (out of launch scope)

`power-bi/` wujud; WAHA dev-only (port 3001, dikomen keluar dalam prod compose). Tiada API-key production committed. Cross-org leak tidak mungkin melalui RLS (tenant isolation di DB).

## 25. Secrets — PASS dengan nota

- `.env` dalam `.gitignore`; `.env.example` placeholder; kredensial dev (medini_dev_password) hanya dalam dev compose (didokumenkan dev-only).
- `staging.env` **committed** mengandungi JWT_SECRET/DB password — nilai kelihatan dev-grade (ℹ️ F-08: klasifikasi placeholder; disahkan bukan production secret, tetapi fail bernama "staging" sepatutnya tidak committed dengan nilai sebenar — cadang pindah ke secret manager).

## 26. Audit Logging — PASS

`audit_log` persist: `auth_login_success` (416), `auth_login_failure` (330), `auth_logout`, `patient_created`, `appointment_booked` — termasuk entri dari probe auditor hari ini. Kolum: actor_id, actor_role, org/branch, action, entity, before/after, correlation_id, timestamp. Tiada secret dalam payload.

## 27. Test Suite — 561/561 CONFIRMED (conditional)

Run pertama: **554 passed / 7 skipped / 2 failed files**. Punca kegagalan: 2 spec (`s10-developer-systemadmin`, `s10-registration-replay`) bersambung ke DB `medini_replay_0028` yang **tidak dicipta oleh mana-mana kod** — laporan remediation mengesahkan ia di-drop selepas evidence. Auditor mencipta semula fixture (replay 28 migrasi), rerun: **7/7 PASS** → **jumlah 561 passed / 0 failed = claim TERSAHKAN**.

🟡 **F-01 (MEDIUM)**: suite tidak self-contained — "561/0" hanya achievable dengan fixture manual yang tidak didokumenkan sebagai langkah wajib. Remediation: auto-create fixture dalam beforeAll, atau skip-if-absent dengan sebab jelas, atau dokumentasi prosedur. **Tidak blocker security; blocker reproducibility CI.**

Evolusi angka (491/41 → 524/8 → 532/0 → 561): pertumbuhan test S10 + dbIt conditional-skip — konsisten; tiada test didisable secara senyap (semua 7 "skip" dalam run pertama adalah fail-to-connect, bukan skip yang disembunyikan).

## 28. S8/S9 Regression — PASS

82/84 fail lulus pada run pertama (2 fail = F-01 fixture, bukan regresi); spec S8 (F-13 whatsapp worker cross-org/cross-branch DENY, worker read/write separation) PASS; MD5 0020–0024 immutable; audit logging berfungsi; RBAC matrix S9 reports (HQ-only) dihormati live (doctor=403).

## 29. Findings Register

| ID | Sev | Ringkas | Lokasi | Blok S10? |
|---|---|---|---|---|
| F-01 | 🟡 MEDIUM | Suite 561 tidak self-contained — fixture `medini_replay_0028` mesti wujud tetapi tiada auto-create | `backend/test/integration/s10-*.spec.ts` | Tidak (fix sebelum CI final) |
| F-02 | 🟡 MEDIUM | Doctor/manager boleh `UPDATE staff SET role='hq'` + tulis password_hash orang lain di DB layer (`n9_staff_human_all` PERMISSIVE ALL, warisan 0023/S8, terkunci sebelum S10). API menghalang; DB tidak. Pre-existing, bukan regresi S10. Cadang 0029: deny perubahan role/password_hash melainkan HQ+admin | `0023` → policy `n9_staff_human_all` | Tidak (backlog S11) |
| F-03 | 🔵 LOW | `TRUSTED_PROXIES` tiada dalam prod env template — fail-closed (satu bucket semua client) tetapi per-IP limit tidak aktif di sebalik Caddy | docker-compose.prod.yml / staging.env | Tidak (deploy checklist WAJIB) |
| F-04 | 🔵 LOW | `tsc -b` gagal 42 err (2 dalam src: AppLayout email, api.ts erasableSyntaxOnly); vite build lulus kerana tiada typecheck | app/src | Tidak |
| F-05 | 🔵 LOW | `register_staff_with_token` SECURITY DEFINER tanpa `SET search_path` — tidak boleh dieksploitasi (medini_app tiada CREATE pada mana-mana schema) | 0026 | Tidak |
| F-06 | ℹ️ INFO | Access token kekal valid sehingga expiry selepas logout (stateless JWT; logout revoke refresh sahaja) | auth design | Tidak |
| F-07 | ℹ️ INFO | Komen guard menyatakan Caddy "append" XFF; sebenarnya replace (`{remote_host}`) — lebih selamat; doc mismatch | auth-throttler.guard.ts | Tidak |
| F-08 | ℹ️ INFO | Repo ahead-2 unpushed; komen-drift fungsi dev-vs-replay (kosmetik); staging.env committed dengan nilai dev-grade | repo | Tidak |
| F-09 | 🔵 LOW | E2E full-file run melanggar rate-limit 5/min sendiri (9 login berurutan) — perlu storageState/SkipThrottle dalam test design | app/e2e | Tidak |

**Status findings audit pertama (S10-REJECT)**: S10-01 **FIXED** · S10-02 **FIXED** · S10-03 **FIXED** · S10-04 (integration) **FIXED** · S10-05 **FIXED** · D-01 **FIXED** · D-07 trust-proxy **FIXED (hardened)**.

## 30. Final Verdict

### 🟢 APPROVE FOR CHATGPT S10 GOVERNANCE REVIEW

**Justifikasi**: Semua kawalan keselamatan S10 yang diperlukan telah diverifikasi secara independent pada sistem sebenar — replay deterministik 0000→0028, dev/replay reconciled pada peringkat definisi, D-01 tertutup pada DB layer dengan positive controls, matriks refresh-token & registration & rate-limit & trust-proxy & RBAC & IDOR & multi-tenant lulus live, frontend build lulus, E2E lulus (individual), suite 561/561 disahkan, S8/S9 intact.

**Conditions pre-deploy (tidak menghalang governance review, WAJIB sebelum go-live)**:
1. F-03 — set `TRUSTED_PROXIES` kepada alamat Caddy dalam environment production.
2. F-01 — jadikan 2 spec S10 self-contained (atau dokumentasikan fixture procedure dalam CI).
3. Push kedua-dua commit kepada origin/main.

**Boundary governance**: Kelulusan ini bermaksud GLM 5.3 menganggap `2940d76` sedia memasuki ChatGPT S10 Governance Review — BUKAN lock akhir, BUKAN deploy, BUKAN go-live. Sequence: GLM approval → ChatGPT review → Final S0–S10 audit → Bos sign-off → GitHub lock → Production go-live.

---

*Audit selesai. Semua DB forensik (medini_s10r, medini_replay_0028) di-drop, backend temporary dihentikan, dan artifak probe dibuang selepas laporan ini ditulis (lihat §Cleanup dalam transcript audit). HARD STOP.*
