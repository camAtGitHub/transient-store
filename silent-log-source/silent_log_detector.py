#!/usr/bin/env python3
import argparse
import datetime
import fnmatch
import getpass
import json
import logging
import logging.handlers
import os
import sys
import time
from urllib.parse import quote

import requests
import yaml

__version__ = "1.0.0"

# ---------------------------------------------------------------------------
# CLI Parser
# ---------------------------------------------------------------------------

def _parse_sleep_duration(value: str) -> int:
    """Parse human-readable sleep duration. e.g. '24h' -> 86400, '30m' -> 1800."""
    value = value.strip()
    if value.endswith('h'):
        try:
            return int(value[:-1]) * 3600
        except ValueError:
            raise argparse.ArgumentTypeError(f"Invalid sleep duration: {value!r}")
    elif value.endswith('m'):
        try:
            return int(value[:-1]) * 60
        except ValueError:
            raise argparse.ArgumentTypeError(f"Invalid sleep duration: {value!r}")
    else:
        try:
            return int(value)
        except ValueError:
            raise argparse.ArgumentTypeError(f"Invalid sleep duration: {value!r}")


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments and return a Namespace object."""
    parser = argparse.ArgumentParser(
        description="Detect log sources that have gone silent in OpenSearch."
    )
    parser.add_argument(
        '--config',
        default='./silent-log-detector.yaml',
        help='Path to YAML config file (default: ./silent-log-detector.yaml)'
    )
    parser.add_argument(
        '--opensearch-url',
        required=True,
        help='Base URL of the OpenSearch cluster (required)'
    )
    parser.add_argument(
        '--user',
        default=None,
        help='OpenSearch username'
    )
    parser.add_argument(
        '--pass',
        dest='password',
        default=None,
        help='OpenSearch password'
    )
    parser.add_argument(
        '--ca-cert',
        default=None,
        help='Path to CA certificate for SSL verification'
    )
    parser.add_argument(
        '--insecure',
        action='store_true',
        default=False,
        help='Disable SSL certificate verification (prints warning)'
    )
    parser.add_argument(
        '--sleep',
        dest='sleep_seconds',
        type=_parse_sleep_duration,
        default=None,
        help='Override sleep duration between cycles (e.g. 24h, 30m, 3600)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        default=False,
        help='Log alerts but do not write to OpenSearch'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        default=False,
        help='Enable DEBUG logging'
    )
    parser.add_argument(
        '--version',
        action='version',
        version=f'silent_log_detector {__version__}'
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Logging Subsystem
# ---------------------------------------------------------------------------

class UTCFormatter(logging.Formatter):
    """Formats log records with UTC timestamps."""
    converter = time.gmtime  # Force UTC


class _ColourFormatter(UTCFormatter):
    """UTCFormatter with ANSI colour codes for console output."""
    _COLOURS = {
        logging.DEBUG:   '\033[36m',   # cyan
        logging.INFO:    '\033[0m',    # reset/white
        logging.WARNING: '\033[33m',   # yellow
        logging.ERROR:   '\033[31m',   # red
        logging.CRITICAL: '\033[31m',  # red (same as ERROR)
    }
    _RESET = '\033[0m'

    def format(self, record: logging.LogRecord) -> str:
        colour = self._COLOURS.get(record.levelno, '\033[0m')
        msg = super().format(record)
        return f"{colour}{msg}{self._RESET}"


def setup_logging(verbose: bool, log_file: str = "silent_log_detector.log") -> None:
    """Configure root logger with UTC timestamps, optional ANSI console colours,
    and a rotating file handler."""
    if not log_file:
        log_file = "silent_log_detector.log"

    level = logging.DEBUG if verbose else logging.INFO
    fmt = "%(asctime)s UTC [%(levelname)s] %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    root = logging.getLogger()
    root.setLevel(level)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    if sys.stdout.isatty():
        console_formatter = _ColourFormatter(fmt=fmt, datefmt=datefmt)
    else:
        console_formatter = UTCFormatter(fmt=fmt, datefmt=datefmt)
    console_handler.setFormatter(console_formatter)
    root.addHandler(console_handler)

    # Rotating file handler (plain text, no ANSI)
    file_handler = logging.handlers.RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=10
    )
    file_handler.setLevel(level)
    file_formatter = UTCFormatter(fmt=fmt, datefmt=datefmt)
    file_handler.setFormatter(file_formatter)
    root.addHandler(file_handler)


# ---------------------------------------------------------------------------
# Config Loader & Defaults Inheritance
# ---------------------------------------------------------------------------

def _parse_exclusions_file(filepath: str) -> list:
    """Parse an exclusions file. Returns list of {"pattern": str, "expires": date|None}.
    Lines starting with # are skipped. Malformed expires: values are logged as WARNING
    and treated as no expiry."""
    results = []
    with open(filepath) as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split()
            if not parts:
                continue
            pattern = parts[0]
            expires = None
            for part in parts[1:]:
                if part.startswith('expires:'):
                    date_str = part[len('expires:'):]
                    try:
                        expires = datetime.date.fromisoformat(date_str)
                    except ValueError:
                        logging.warning(
                            f"Malformed expires value {date_str!r} in exclusions file "
                            f"{filepath!r}; treating as no expiry."
                        )
                        expires = None
                    break
            if pattern:
                results.append({"pattern": pattern, "expires": expires})
    return results


def load_config(config_path: str) -> dict:
    """Load, resolve, and return fully-inherited config. Raises FileNotFoundError or
    yaml.YAMLError on bad input. Logs inheritance at DEBUG level."""
    with open(config_path) as f:
        raw = yaml.safe_load(f)

    defaults = raw.get('defaults', {})
    default_host_field = defaults.get('host_field', 'host.hostname')
    default_secondary = defaults.get('secondary_host_field', None)
    default_baseline_days = defaults.get('baseline_days', 30)
    default_silence_hours = defaults.get('silence_hours', 24)
    default_exclusions_raw = defaults.get('exclusions', [])

    # Parse default exclusions into standard format
    def _normalise_inline_exclusions(raw_list: list) -> list:
        result = []
        for item in raw_list:
            if isinstance(item, dict):
                pattern = item.get('pattern', '')
                expires_val = item.get('expires', None)
                if isinstance(expires_val, str):
                    try:
                        expires_val = datetime.date.fromisoformat(expires_val)
                    except ValueError:
                        logging.warning(
                            f"Malformed expires value {expires_val!r} in inline exclusions; "
                            "treating as no expiry."
                        )
                        expires_val = None
                elif isinstance(expires_val, datetime.date):
                    pass  # already a date
                else:
                    expires_val = None
                if pattern:
                    result.append({"pattern": pattern, "expires": expires_val})
            elif isinstance(item, str):
                if item:
                    result.append({"pattern": item, "expires": None})
        return result

    default_exclusions = _normalise_inline_exclusions(default_exclusions_raw)

    # Load optional exclusions_file
    exclusions_file_path = raw.get('exclusions_file', None)
    file_exclusions = []
    if exclusions_file_path:
        try:
            file_exclusions = _parse_exclusions_file(exclusions_file_path)
        except FileNotFoundError:
            logging.warning(
                f"exclusions_file {exclusions_file_path!r} not found; ignoring."
            )

    # Resolve indexes
    resolved_indexes = []
    for idx in raw.get('indexes', []):
        name = idx.get('name', '')

        # host_field
        if 'host_field' in idx:
            host_field = idx['host_field']
        else:
            host_field = default_host_field
            logging.debug(f"Inheriting host_field={host_field!r} from defaults for index {name}")

        # secondary_host_field
        if 'secondary_host_field' in idx:
            secondary_host_field = idx['secondary_host_field']
        else:
            secondary_host_field = default_secondary
            logging.debug(
                f"Inheriting secondary_host_field={secondary_host_field!r} from defaults for index {name}"
            )

        # baseline_days
        if 'baseline_days' in idx:
            baseline_days = idx['baseline_days']
        else:
            baseline_days = default_baseline_days
            logging.debug(
                f"Inheriting baseline_days={baseline_days} from defaults for index {name}"
            )

        # silence_hours
        if 'silence_hours' in idx:
            silence_hours = idx['silence_hours']
        else:
            silence_hours = default_silence_hours
            logging.debug(
                f"Inheriting silence_hours={silence_hours} from defaults for index {name}"
            )

        # exclusions: per-index REPLACES defaults if key is present
        if 'exclusions' in idx:
            inline_exclusions = _normalise_inline_exclusions(idx['exclusions'])
        else:
            inline_exclusions = list(default_exclusions)

        resolved_exclusions = inline_exclusions + file_exclusions

        resolved_indexes.append({
            'name': name,
            'host_field': host_field,
            'secondary_host_field': secondary_host_field,
            'baseline_days': int(baseline_days),
            'silence_hours': silence_hours,
            'exclusions': resolved_exclusions,
        })

    alerts_block = raw.get('alerts', {}) or {}
    alerts_index = alerts_block.get('opensearch_index', None) if alerts_block else None

    config = {
        'environment': raw.get('environment', ''),
        'tags': raw.get('tags', []) or [],
        'sleep_after_run_seconds': int(raw.get('sleep_after_run_seconds', 0)),
        'alerts': {
            'opensearch_index': alerts_index,
        },
        'indexes': resolved_indexes,
    }
    return config


# ---------------------------------------------------------------------------
# Exclusion Engine
# ---------------------------------------------------------------------------

def build_exclusion_set(raw_exclusions: list) -> list:
    """Filter expired entries. Return list of active glob pattern strings.
    Expiry comparison uses UTC today. Logs count of expired patterns filtered at DEBUG."""
    today = datetime.datetime.now(datetime.timezone.utc).date()
    active = []
    expired_count = 0
    for entry in raw_exclusions:
        expires = entry.get('expires', None)
        if expires is None or expires >= today:
            active.append(entry['pattern'])
        else:
            expired_count += 1
    if expired_count:
        logging.debug(f"Filtered {expired_count} expired exclusion pattern(s).")
    return active


def is_excluded(identifier: str, patterns: list) -> bool:
    """Return True if identifier matches any pattern via fnmatch.fnmatch."""
    for pattern in patterns:
        if fnmatch.fnmatch(identifier, pattern):
            return True
    return False


# ---------------------------------------------------------------------------
# OpenSearch Session Builder
# ---------------------------------------------------------------------------

def build_session(args: argparse.Namespace) -> tuple:
    """
    Resolve credentials (CLI → env → prompt), configure SSL, return (session, base_url).
    Prints a WARNING to sys.stderr if --insecure is used.
    Prompts interactively only if both CLI and env credentials are absent.
    """
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})

    # Credential resolution: CLI → env → prompt
    if args.user and args.password:
        username = args.user
        password = args.password
    else:
        env_user = os.environ.get('OPENSEARCH_USER', '')
        env_pass = os.environ.get('OPENSEARCH_PASSWORD', '')
        if env_user and env_pass:
            username = env_user
            password = env_pass
        else:
            username = input("OpenSearch username: ")
            password = getpass.getpass("OpenSearch password: ")

    session.auth = (username, password)

    # SSL configuration
    if args.insecure:
        if args.ca_cert:
            logging.warning(
                "--ca-cert and --insecure both supplied; --insecure takes precedence."
            )
        print(
            "WARNING: SSL verification disabled. Connection is not secure.",
            file=sys.stderr
        )
        session.verify = False
        requests.packages.urllib3.disable_warnings()
    elif args.ca_cert:
        session.verify = args.ca_cert
    # else: default (True) — system CA bundle

    base_url = args.opensearch_url.rstrip('/')
    return session, base_url


# ---------------------------------------------------------------------------
# Query Engine — Single Detection Pass
# ---------------------------------------------------------------------------

def run_index_pass(
    session: requests.Session,
    base_url: str,
    index_name: str,
    host_field: str,
    baseline_days: int,
    agg_size: int = 10000
) -> dict:
    """
    Run terms+max aggregation. Returns {identifier: last_seen_iso_string}.
    On HTTP error or exception: log ERROR and return {}.
    """
    query_body = {
        "size": 0,
        "query": {
            "range": {
                "@timestamp": {
                    "gte": f"now-{baseline_days}d/d",
                    "lt": "now/d"
                }
            }
        },
        "aggs": {
            "by_host": {
                "terms": {
                    "field": host_field,
                    "size": agg_size
                },
                "aggs": {
                    "last_seen": {
                        "max": {"field": "@timestamp"}
                    }
                }
            }
        }
    }

    encoded_index = quote(index_name, safe='')
    url = f"{base_url}/{encoded_index}/_search"

    try:
        response = session.post(url, json=query_body)
    except requests.RequestException as exc:
        logging.error(f"Request exception querying {index_name!r}: {exc}")
        return {}

    if response.status_code != 200:
        logging.error(
            f"Query failed for index {index_name!r}: HTTP {response.status_code} — {response.text}"
        )
        return {}

    try:
        data = response.json()
    except Exception as exc:
        logging.error(f"Failed to parse JSON response for {index_name!r}: {exc}")
        return {}

    results = {}
    buckets = data.get("aggregations", {}).get("by_host", {}).get("buckets", [])
    for bucket in buckets:
        identifier = bucket.get("key")
        last_seen_info = bucket.get("last_seen", {})
        ts = last_seen_info.get("value_as_string")
        if ts is None:
            logging.debug(
                f"Bucket for {identifier!r} in {index_name!r} has no value_as_string; skipping."
            )
            continue
        results[str(identifier)] = ts

    logging.debug(
        f"Loaded {len(results)} hosts from primary pass on {index_name}"
    )
    return results


# ---------------------------------------------------------------------------
# Dual-Field Consolidation
# ---------------------------------------------------------------------------

def consolidate_results(
    primary: dict,
    secondary: dict,
    silence_hours: float,
    index_name: str,
    now: datetime.datetime
) -> list:
    """
    Merge primary + secondary, deduplicate, filter by silence threshold.
    Returns list of silent identifier dicts (without host_field_used).
    """
    merged = {}  # identifier -> (iso_timestamp, identifier_type)

    for identifier, ts in primary.items():
        merged[identifier] = (ts, "primary")

    for identifier, ts in secondary.items():
        if identifier in merged:
            existing_ts, _ = merged[identifier]
            try:
                existing_dt = datetime.datetime.fromisoformat(
                    existing_ts.replace('Z', '+00:00')
                )
                new_dt = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
            except ValueError as exc:
                logging.warning(
                    f"Malformed timestamp for {identifier!r} in {index_name!r}: {exc}; skipping."
                )
                continue
            if new_dt > existing_dt:
                merged[identifier] = (ts, "secondary")
            # else keep existing primary entry
        else:
            merged[identifier] = (ts, "secondary")

    silent = []
    for identifier, (ts, id_type) in merged.items():
        try:
            last_seen_dt = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except ValueError as exc:
            logging.warning(
                f"Malformed timestamp {ts!r} for {identifier!r} in {index_name!r}: {exc}; skipping."
            )
            continue
        hours_silent = round((now - last_seen_dt).total_seconds() / 3600, 1)
        if hours_silent >= silence_hours:
            silent.append({
                "identifier": identifier,
                "last_seen": ts,
                "hours_silent": hours_silent,
                "identifier_type": id_type,
            })

    return silent


# ---------------------------------------------------------------------------
# Alert Document Builder
# ---------------------------------------------------------------------------

def build_alert_doc(
    entry: dict,
    index_config: dict,
    config: dict,
    detection_run_id: str,
    primary_host_field: str,
    secondary_host_field: "str | None",
    now: datetime.datetime
) -> dict:
    """Build and return a single alert document dict."""
    identifier_type = entry['identifier_type']
    if identifier_type == "primary":
        host_field_used = primary_host_field
    else:
        if secondary_host_field is None:
            logging.error(
                f"identifier_type is 'secondary' but secondary_host_field is None "
                f"for identifier {entry['identifier']!r}. Setting host_field to empty string."
            )
            host_field_used = ""
        else:
            host_field_used = secondary_host_field

    timestamp = now.strftime('%Y-%m-%dT%H:%M:%SZ')
    identifier = entry['identifier']
    hours_silent = entry['hours_silent']
    last_seen = entry['last_seen']

    return {
        "@timestamp": timestamp,
        "message": (
            f"Host {identifier} has been silent for {hours_silent} hours "
            f"(last seen: {last_seen})"
        ),
        "event": {
            "kind": "alert",
            "category": ["host"],
            "type": ["info"],
            "action": "silent_log_source",
        },
        "host": {
            "name": identifier,
        },
        "tags": config['tags'],
        "labels": {
            "environment": config['environment'],
            "detection_run_id": detection_run_id,
            "identifier_type": identifier_type,
        },
        "detection": {
            "silence_hours": hours_silent,
            "last_seen": last_seen,
            "source_index_pattern": index_config['name'],
            "host_field": host_field_used,
        },
    }


# ---------------------------------------------------------------------------
# Bulk Alert Indexer
# ---------------------------------------------------------------------------

def bulk_write_alerts(
    session: requests.Session,
    base_url: str,
    alert_index: str,
    alert_docs: list,
    dry_run: bool
) -> None:
    """
    Build NDJSON bulk payload, POST to _bulk. Log errors per document.
    If dry_run=True, log documents and return without posting.
    If alert_docs is empty, return immediately without posting.
    """
    if not alert_docs:
        return

    if dry_run:
        for doc in alert_docs:
            logging.info(f"[DRY-RUN] Alert document: {json.dumps(doc)}")
        return

    lines = []
    for doc in alert_docs:
        lines.append(json.dumps({"index": {"_index": alert_index}}))
        lines.append(json.dumps(doc))
    payload = "\n".join(lines) + "\n"

    url = f"{base_url}/_bulk"
    try:
        response = session.post(
            url,
            data=payload,
            headers={"Content-Type": "application/x-ndjson"}
        )
    except requests.RequestException as exc:
        logging.error(f"Bulk write request exception: {exc}")
        return

    if response.status_code >= 400:
        logging.error(
            f"Bulk write failed: HTTP {response.status_code} — {response.text}"
        )
        return

    try:
        body = response.json()
    except Exception as exc:
        logging.error(f"Failed to parse bulk response JSON: {exc} — raw: {response.text}")
        return

    if body.get("errors"):
        for item in body.get("items", []):
            op = item.get("index", {})
            if op.get("status", 0) >= 400:
                logging.error(f"Bulk index error for doc: {op.get('error')}")

    logging.info(f"Bulk write complete: {len(alert_docs)} document(s) sent to {alert_index!r}.")


# ---------------------------------------------------------------------------
# Per-Index Detection Orchestrator
# ---------------------------------------------------------------------------

def run_detection_cycle(
    session: requests.Session,
    base_url: str,
    config: dict,
    active_patterns: dict,
    args: argparse.Namespace
) -> int:
    """
    Run full detection cycle across all indexes.
    Returns total count of silent identifiers detected (for logging in daemon loop).
    Internally builds alert docs and calls bulk_write_alerts().
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    detection_run_id = now.strftime('%Y%m%d-%H%M%S')
    all_alert_docs = []

    for index_cfg in config['indexes']:
        index_name = index_cfg['name']
        primary_results = run_index_pass(
            session, base_url, index_name,
            index_cfg['host_field'], index_cfg['baseline_days']
        )
        secondary_results = {}
        if index_cfg['secondary_host_field']:
            secondary_results = run_index_pass(
                session, base_url, index_name,
                index_cfg['secondary_host_field'], index_cfg['baseline_days']
            )

        patterns = active_patterns.get(index_name, [])

        # Apply exclusions BEFORE consolidation
        primary_filtered = {
            k: v for k, v in primary_results.items()
            if not is_excluded(k, patterns)
        }
        secondary_filtered = {
            k: v for k, v in secondary_results.items()
            if not is_excluded(k, patterns)
        }

        silent = consolidate_results(
            primary_filtered, secondary_filtered,
            index_cfg['silence_hours'], index_name, now
        )

        logging.info(f"Index {index_name}: {len(silent)} silent identifier(s) detected.")

        for entry in silent:
            doc = build_alert_doc(
                entry, index_cfg, config, detection_run_id,
                index_cfg['host_field'], index_cfg['secondary_host_field'], now
            )
            all_alert_docs.append(doc)

    logging.info(
        f"Detection cycle complete. Total silent: {len(all_alert_docs)}. "
        f"detection_run_id={detection_run_id}"
    )

    alert_index = config['alerts']['opensearch_index']
    if alert_index is not None:
        bulk_write_alerts(session, base_url, alert_index, all_alert_docs, args.dry_run)

    return len(all_alert_docs)


# ---------------------------------------------------------------------------
# Daemon Loop
# ---------------------------------------------------------------------------

def daemon_loop(
    args: argparse.Namespace,
    session: requests.Session,
    base_url: str
) -> None:
    """
    Infinite loop (or single run) implementing config reload, detection, sleep.
    Exits via sys.exit(0) on run-once completion.
    On config load failure, logs CRITICAL and exits.
    """
    while True:
        try:
            config = load_config(args.config)
        except Exception as exc:
            logging.critical(f"Failed to load config: {exc}")
            sys.exit(1)

        sleep_secs = (
            args.sleep_seconds if args.sleep_seconds is not None
            else config['sleep_after_run_seconds']
        )

        active_patterns = {}
        for index_cfg in config['indexes']:
            active_patterns[index_cfg['name']] = build_exclusion_set(
                index_cfg['exclusions']
            )

        run_detection_cycle(session, base_url, config, active_patterns, args)

        if sleep_secs == 0:
            sys.exit(0)

        logging.info(f"Sleeping for {sleep_secs}s before next cycle...")
        time.sleep(sleep_secs)


# ---------------------------------------------------------------------------
# main() Entry Point
# ---------------------------------------------------------------------------

def main() -> None:
    args = parse_args()
    setup_logging(args.verbose)
    session, base_url = build_session(args)
    daemon_loop(args, session, base_url)


if __name__ == "__main__":
    main()
