# Silent Log Source Detector

Ever had a server quietly stop sending logs — no error, no alert, just silence? This tool catches that. It queries your OpenSearch cluster for every host it has seen recently, checks when each one last sent a log, and raises an alert for anything that has gone quiet longer than you're comfortable with.

It runs as a simple Python script. No agents, no sidecars, no dashboards required — just a config file, a cron job or a daemon loop, and a destination index for the alerts.

---

## What it does

1. **Queries OpenSearch** for every unique host identifier seen in a configurable baseline window (e.g. the last 30 days).
2. **Compares last-seen timestamps** against a silence threshold (e.g. 24 hours). If a host hasn't sent a log in that long, it's flagged.
3. **Filters exclusions** — hosts or patterns you've deliberately silenced (e.g. decommissioned servers, known-offline relays) are skipped, with optional expiry dates so the exclusions clean themselves up.
4. **Writes alert documents** to an OpenSearch index via the `_bulk` API, ready to query or visualise in Dashboards.
5. **Loops as a daemon** (optional) — reload config, run, sleep, repeat. Or run once as a cron job and exit.

---

## Requirements

- Python 3.9 or newer
- Network access to your OpenSearch cluster
- Two third-party packages (everything else is stdlib):

```bash
pip install requests pyyaml
```

---

## Quick start

```bash
# One-shot scan — run once and exit
python silent_log_detector.py \
  --opensearch-url https://opensearch.example.com \
  --user myuser \
  --pass mypassword \
  --config ./silent-log-detector.yaml

# Daemon mode — run every hour (overrides the config sleep value)
python silent_log_detector.py \
  --opensearch-url https://opensearch.example.com \
  --user myuser \
  --pass mypassword \
  --config ./silent-log-detector.yaml \
  --sleep 1h

# Try it without writing anything
python silent_log_detector.py \
  --opensearch-url https://opensearch.example.com \
  --user myuser \
  --pass mypassword \
  --dry-run
```

---

## CLI reference

| Flag | Default | Description |
|------|---------|-------------|
| `--opensearch-url URL` | *(required)* | Base URL of the OpenSearch cluster, e.g. `https://opensearch.example.com` |
| `--config PATH` | `./silent-log-detector.yaml` | Path to the YAML config file |
| `--user USER` | — | OpenSearch username (see [authentication](#authentication)) |
| `--pass PASSWORD` | — | OpenSearch password |
| `--ca-cert PATH` | — | Path to a custom CA certificate for SSL verification |
| `--insecure` | `false` | Disable SSL certificate verification. Prints a warning to stderr — never silent |
| `--sleep DURATION` | *(from config)* | Override the sleep interval between cycles. Accepts `24h`, `30m`, or raw seconds like `3600`. Use `0` to run once and exit |
| `--dry-run` | `false` | Detect silences and log what would be written, but don't actually write to OpenSearch |
| `--verbose` / `-v` | `false` | Enable DEBUG-level logging |
| `--version` | — | Print version and exit |

### Authentication

Credentials are resolved in this order:

1. **CLI flags** — `--user` and `--pass` (both must be provided together)
2. **Environment variables** — `OPENSEARCH_USER` and `OPENSEARCH_PASSWORD` (both must be set)
3. **Interactive prompt** — if neither CLI nor environment variables are present, you'll be prompted

The password is never written to logs, at any level.

---

## Config file

The config file is a YAML file that defines which indexes to monitor, what counts as "silent", and where to write alerts.

### Minimal example

```yaml
environment: production
sleep_after_run_seconds: 3600   # run every hour; set to 0 for run-once

alerts:
  opensearch_index: silent-log-alerts

defaults:
  host_field: host.hostname.keyword
  baseline_days: 30
  silence_hours: 24

indexes:
  - name: "logs-*"
```

That's genuinely all you need to get started. The detector will query `logs-*`, look for any host that sent a log in the last 30 days but hasn't sent one in the last 24 hours, and write an alert document to `silent-log-alerts`.

### Full example with all options

```yaml
# Which environment this is — included in every alert document
environment: production

# Tags attached to every alert document — useful for filtering in Dashboards
tags:
  - infra
  - log-monitoring

# How long to sleep between detection cycles (seconds).
# 0 = run once and exit. Overridden by --sleep on the CLI.
sleep_after_run_seconds: 3600

# Where to write alert documents. Set to null (or omit the alerts block)
# if you only want dry-run / logging output.
alerts:
  opensearch_index: silent-log-alerts

# Optional: a separate file of exclusion patterns (see Exclusions section below)
exclusions_file: /etc/silent-log-detector/exclusions.txt

# Default values inherited by every index unless overridden
defaults:
  # The field that holds the host identifier (keyword field)
  host_field: host.hostname.keyword

  # Optional second field — useful if some hosts log their IP instead of hostname.
  # Both fields are queried; the more recent last_seen wins on a per-host basis.
  secondary_host_field: host.ip

  # How far back to look for "known" hosts
  baseline_days: 30

  # Hours without a log before a host is flagged
  silence_hours: 24

  # Exclusions that apply to all indexes (unless a per-index exclusions list overrides them)
  exclusions:
    - pattern: "dev-*"          # all dev hosts — permanent exclusion
    - pattern: "backup-relay-*"
      expires: "2026-06-01"     # only excluded until this date

indexes:
  # This index inherits everything from defaults
  - name: "logs-*"

  # This one has a longer silence threshold and its own exclusions list.
  # Note: providing an exclusions list here *replaces* the defaults.exclusions list
  # for this index — they are not merged. Use exclusions_file for shared patterns.
  - name: "metrics-*"
    silence_hours: 48
    exclusions:
      - pattern: "metrics-collector-standby"

  # Security logs — shorter threshold, secondary IP field, shorter baseline
  - name: "security-logs-*"
    host_field: source.hostname.keyword
    secondary_host_field: source.ip
    baseline_days: 14
    silence_hours: 6
```

### Config fields reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `environment` | string | `""` | Written into every alert document |
| `tags` | list of strings | `[]` | Written into every alert document |
| `sleep_after_run_seconds` | integer | `0` | Sleep between daemon cycles. `0` = run once |
| `alerts.opensearch_index` | string or null | `null` | Index to write alerts to. Omit to disable writes |
| `exclusions_file` | path or null | `null` | Path to a shared exclusions text file |
| `defaults.host_field` | string | `host.hostname.keyword` | Primary host identifier field |
| `defaults.secondary_host_field` | string or null | `null` | Secondary host identifier field |
| `defaults.baseline_days` | integer | `30` | Days to look back for known hosts |
| `defaults.silence_hours` | number | `24` | Hours of silence before flagging |
| `defaults.exclusions` | list | `[]` | Exclusion patterns applied to all indexes |
| `indexes[].name` | string | *(required)* | Index or index pattern, e.g. `logs-*` |
| `indexes[].host_field` | string | *(from defaults)* | Override per index |
| `indexes[].secondary_host_field` | string or null | *(from defaults)* | Override per index |
| `indexes[].baseline_days` | integer | *(from defaults)* | Override per index |
| `indexes[].silence_hours` | number | *(from defaults)* | Override per index |
| `indexes[].exclusions` | list | *(from defaults)* | Override per index — **replaces**, does not merge |

---

## Exclusions

Exclusions let you say "I know this host is offline — don't keep alerting me about it."

### Inline exclusions (in the config file)

```yaml
defaults:
  exclusions:
    - pattern: "dev-*"              # wildcard — all hosts starting with "dev-"
    - pattern: "*.staging.example.com"
    - pattern: "old-relay-01"       # exact match
    - pattern: "backup-*"
      expires: "2026-06-01"         # stop excluding after this date
```

Patterns use Unix shell-style glob matching (`*` matches anything within a name, `?` matches a single character). If you need to exclude a specific host, just use its exact name.

### Exclusions file

For exclusions shared across many config files, or managed by a separate process, you can use a dedicated text file:

```
# Lines starting with # are comments — ignored entirely

# Permanent exclusions
old-relay-01
*.decommissioned.example.com

# Temporary exclusion — stops applying after 1 April 2026
maintenance-host-07 expires:2026-04-01

# Another temporary one
backup-relay-* expires:2026-06-15
```

Point to it from the config:

```yaml
exclusions_file: /etc/silent-log-detector/exclusions.txt
```

Lines from the exclusions file are appended to whichever inline exclusions are active for each index. They apply globally (to all indexes) — think of the file as a shared override list.

### How expiry works

An exclusion with `expires: 2026-06-01` is active *through* 1 June 2026 and stops being active from 2 June 2026 onwards. Dates are evaluated in UTC. Expired exclusions are filtered silently at the start of each cycle, so you can leave them in the file and they'll just stop doing anything.

---

## Dual host-field detection

Some environments have hosts that log their hostname in one field and their IP in another — or different applications use different conventions. The `secondary_host_field` option handles this.

When configured, the detector runs two queries per index: one for the primary field, one for the secondary. Results are merged by identifier string. If the same string appears in both (e.g. a host that logs both its hostname and IP with the same value, which is rare but possible), the more recent `last_seen` timestamp wins.

```yaml
defaults:
  host_field: host.hostname.keyword
  secondary_host_field: host.ip
```

Each alert document records which field the identifier came from (`identifier_type: "primary"` or `"secondary"`).

---

## Alert documents

Each silent host produces one alert document written to OpenSearch. Here's what a document looks like:

```json
{
  "@timestamp": "2026-03-24T10:00:00Z",
  "hostname": "db-01.prod.example.com",
  "silence_hours": 31.4,
  "last_seen": "2026-03-22T18:33:12.000Z",
  "source_index_pattern": "logs-*",
  "host_field": "host.hostname.keyword",
  "identifier_type": "primary",
  "environment": "production",
  "tags": ["infra", "log-monitoring"],
  "alert_type": "silent_log_source",
  "detection_run_id": "20260324-100000"
}
```

| Field | Description |
|-------|-------------|
| `@timestamp` | When the alert was generated (UTC) |
| `hostname` | The host identifier — hostname or IP depending on which field it came from |
| `silence_hours` | How long the host has actually been silent (not the threshold) |
| `last_seen` | The timestamp of the host's last observed log |
| `source_index_pattern` | Which index pattern triggered this alert |
| `host_field` | The OpenSearch field the identifier was read from |
| `identifier_type` | `"primary"` or `"secondary"` |
| `environment` | From config |
| `tags` | From config |
| `alert_type` | Always `"silent_log_source"` — useful for filtering |
| `detection_run_id` | Groups all alerts from a single detection cycle (`YYYYMMDD-HHMMSS` UTC) |

All alerts from a single run share the same `detection_run_id`, which makes it easy to query "show me everything from the last scan."

---

## Logging

Logs go to both the console and a rotating file (`silent_log_detector.log` by default, 10 MB per file, 10 backups kept).

The format is:

```
2026-03-24 09:15:32 UTC [INFO] Index logs-*: 3 silent identifier(s) detected.
2026-03-24 09:15:33 UTC [INFO] Detection cycle complete. Total silent: 5. detection_run_id=20260324-091530
2026-03-24 09:15:33 UTC [INFO] Sleeping for 3600s before next cycle...
```

When running in a terminal, INFO is white, WARNING is yellow, ERROR is red, and DEBUG is cyan. In a pipe or container (non-tty), plain text is output with no escape codes.

Add `--verbose` to see DEBUG output including how many hosts were found per index pass and which config values were inherited from defaults.

---

## Running as a daemon

Set `sleep_after_run_seconds` to a non-zero value in the config (e.g. `3600` for hourly), or use `--sleep` on the CLI:

```bash
# Run every 6 hours, override whatever the config says
python silent_log_detector.py \
  --opensearch-url https://opensearch.example.com \
  --user myuser \
  --pass mypassword \
  --sleep 6h
```

The config file is re-read at the start of every cycle, so you can update thresholds, add exclusions, or change which indexes are monitored without restarting the process.

### systemd unit example

```ini
[Unit]
Description=Silent Log Source Detector
After=network-online.target

[Service]
Type=simple
User=monitoring
WorkingDirectory=/opt/silent-log-detector
ExecStart=/usr/bin/python3 /opt/silent-log-detector/silent_log_detector.py \
    --opensearch-url https://opensearch.example.com \
    --config /etc/silent-log-detector/config.yaml
Environment=OPENSEARCH_USER=sld-service
Environment=OPENSEARCH_PASSWORD=changeme
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

### Running as a cron job

If you'd rather keep it stateless and drive the schedule externally, set `sleep_after_run_seconds: 0` and let cron handle it:

```cron
0 * * * * /usr/bin/python3 /opt/silent-log-detector/silent_log_detector.py \
    --opensearch-url https://opensearch.example.com \
    --config /etc/silent-log-detector/config.yaml >> /var/log/silent-log-detector.log 2>&1
```

---

## SSL and self-signed certificates

For clusters with a trusted CA certificate:

```bash
python silent_log_detector.py \
  --opensearch-url https://opensearch.example.com \
  --ca-cert /etc/ssl/certs/my-internal-ca.pem \
  ...
```

For development environments with self-signed certs where you just want to skip verification:

```bash
python silent_log_detector.py \
  --opensearch-url https://opensearch.local:9200 \
  --insecure \
  ...
```

`--insecure` always prints a warning to stderr. It won't silently disable SSL — you'll know it's happening.

---

## Troubleshooting

**"No silent sources detected" but I'm sure something is offline**

- Check `baseline_days`. A host has to have sent at least one log within that window to be tracked. If a server has been offline for longer than `baseline_days`, it won't appear in the baseline query at all.
- Use `--verbose` to see exactly how many hosts were returned by each query pass.
- Check that your `host_field` matches the actual field name and type in your index (it must be a keyword field, not a text field).

**Alerts are firing for hosts I want to ignore**

- Add the host to the `exclusions` list in the config, or to the `exclusions_file`.
- Use `*` wildcards to cover a group: `"dev-*"` or `"*.staging.example.com"`.
- Set an `expires:` date if the exclusion is temporary.

**The script exits immediately with "Failed to load config"**

- Check the YAML is valid. Even one bad indent will cause a parse error.
- Check the path passed to `--config` (or the default `./silent-log-detector.yaml`) actually exists.

**HTTP 400 or 401 errors in the logs**

- `401` means authentication failed — double-check your username and password.
- `400` often means the `host_field` doesn't exist in the index, or is not a keyword type. Check with `GET /your-index/_mapping`.
