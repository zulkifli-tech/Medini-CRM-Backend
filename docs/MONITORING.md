# Medini CRM — Production Monitoring & Alerting (Tier 1, P7-F8)

**Status:** IMPLEMENTED (config) · **Finding:** P7-F8 (monitoring/alerting = operational prerequisite) · **Tier:** 1

Implements the observability architecture already specified in
`docs/OBSERVABILITY.md` (S9 ADR-008: Prometheus metrics, KISS, no
over-engineering). No new stack was invented — Prometheus + Alertmanager +
Grafana is the architecturally-sanctioned choice.

---

## 1. Stack (all internal-only, NO public ports)

| Service | Image | Role |
|---|---|---|
| prometheus | prom/prometheus:v2.53.0 | metrics TSDB + alert evaluation (30d retention) |
| alertmanager | prom/alertmanager:v0.27.0 | alert routing/notification |
| blackbox | prom/blackbox-exporter:v0.25.0 | HTTP probes (health/readiness/WAHA) |
| postgres-exporter | prometheuscommunity/postgres-exporter:v0.15.0 | `pg_up`, DB stats |
| redis-exporter | oliver006/redis_exporter:v1.62.0 | `redis_up`, queue/cache stats |
| node-exporter | prom/node-exporter:v1.8.1 | host disk/CPU/mem + textfile (backup/WAL) |
| cadvisor | gcr.io/cadvisor/cadvisor:v0.49.1 | container restart-loop / resources |
| grafana | grafana/grafana:10.4.2 | optional operator dashboards |

All attach to `medini-internal` (`internal: true`) — **no internet egress, no
host port mappings**. The backend `/metrics` endpoint is already `@Public` but
Caddy returns **404 from the internet** (unchanged); Prometheus reaches it over
the Docker network only.

## 2. The 10 mandated monitoring areas → alert mapping

| # | Area | Alert | Signal source |
|---|---|---|---|
| 1 | Backend unavailable | `BackendDown` (critical) | `up{job="medini-backend"}==0` |
| 2 | PostgreSQL unavailable | `PostgresDown` (critical) + `BackendNotReady` | `pg_up==0`, `/health/ready` probe |
| 3 | Redis unavailable | `RedisDown` (critical) | `redis_up==0` |
| 4 | Backup failure | `BackupStale` (high) + `WalArchiveStale` (medium) | textfile heartbeat / newest-WAL mtime |
| 5 | Disk/storage pressure | `DiskPressure` (high) | node-exporter root FS >85% |
| 6 | Excessive API 5xx | `Api5xxRate` (high) | `http_requests_total{status=~"5.."}` |
| 7 | Auth failure spike | `AuthFailureSpike` (high) | login 4xx rate |
| 8 | Excessive latency | `ApiLatencyHigh` (medium) | p95 `http_request_duration_seconds` |
| 9 | Container restart loop | `ContainerRestartLoop` (high) | cadvisor `container_start_time_seconds` churn |
| 10 | WAHA availability/session | `WahaDown` (high) | blackbox probe of `/api/sessions` |

Plus retained S9 hooks: `OutboxBacklog` (A1), `WorkerFailureStorm` (A2).

## 3. Verification (deploy-time checklist)

Monitoring is **config-verified** here; live scrape/alert verification requires
the production/staging deployment (no prod containers run in this environment).
Exact verification steps are in `docs/STAGING-TLS-VERIFICATION-RUNBOOK.md` §D:

- [ ] `prometheus:9090/targets` → all jobs `UP` (backend, postgres, redis, node, cadvisor, blackbox probes).
- [ ] `pg_up==1`, `redis_up==1`, `probe_success==1` for live/ready.
- [ ] Force-test an alert (e.g. `docker stop backend`) → `BackendDown` fires → routed to the configured receiver.
- [ ] No secrets in any metrics payload (label discipline: no org/branch/patient IDs — enforced by `s9-observability.spec.ts`).

## 4. Secrets & fail-safe properties

- **No secrets in monitoring config.** `DATA_SOURCE_NAME`/`REDIS_PASSWORD` use
  `${VAR}` injection at deploy (Docker Compose performs the expansion, not
  Alertmanager). `GRAFANA_ADMIN_PASSWORD` is env-injected, never committed.
- **F11-1 remediation:** Alertmanager configuration is fully STATIC — no
  runtime environment interpolation, no shell-style `${VAR:-default}`
  expansion (Alertmanager does not support it). The default receiver is a
  harmless localhost blackhole; alerts still **fire** and are visible in the
  Prometheus/Alertmanager UI, so monitoring never silently disables itself.
- **Optional webhook:** to enable a real notification channel, copy
  `monitoring/alertmanager.yml` to an override file, replace the blackhole
  URL with the real webhook URL, and update the compose volume mount. Never
  commit real webhook URLs or secrets.
- **Inhibit rule:** when the backend is down, downstream 5xx/readiness/latency
  noise is suppressed so the operator sees one actionable critical.
