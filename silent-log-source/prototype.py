#!/usr/bin/env python3

import os
import getpass
import requests
import argparse
import logging
import datetime
import sys
from urllib.parse import quote_plus

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

def parse_args():
    parser = argparse.ArgumentParser(description="Detect silent log sources in OpenSearch")
    parser.add_argument('--index', default='logs-*', help='Index pattern to query (default: logs-*)')
    parser.add_argument('--baseline-days', type=int, default=30, help='Lookback for known hosts (default: 30)')
    parser.add_argument('--silence-hours', type=int, default=24, help='Hours without logs to consider silent (default: 24)')
    parser.add_argument('--exclude-file', help='File with one host per line to exclude')
    parser.add_argument('--webhook', help='Webhook URL to POST alerts to (e.g. Slack)')
    parser.add_argument('--alert-index', help='Index to write alert documents to (e.g. silent-sources-alerts)')
    parser.add_argument('--dry-run', action='store_true', help='Show alerts but do not send/post')
    parser.add_argument('--size', type=int, default=10000, help='Terms aggregation size (max unique hosts)')
    return parser.parse_args()

def load_excludes(filename):
    if not filename:
        return set()
    try:
        with open(filename) as f:
            return {line.strip() for line in f if line.strip()}
    except Exception as e:
        logging.warning(f"Could not load exclude file {filename}: {e}")
        return set()

def build_last_seen_query(index, days, agg_size):
    return {
        "size": 0,
        "query": {
            "range": {
                "@timestamp": {
                    "gte": f"now-{days}d/d",
                    "lt": "now/d"
                }
            }
        },
        "aggs": {
            "by_host": {
                "terms": {
                    "field": "host.hostname.keyword",
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

def get_hosts_with_last_seen(session, url, index, query):
    response = session.post(f"{url}/{quote_plus(index)}/_search", json=query)
    if response.status_code != 200:
        raise RuntimeError(f"Query failed ({response.status_code}): {response.text}")

    data = response.json()
    hosts = {}
    for bucket in data.get("aggregations", {}).get("by_host", {}).get("buckets", []):
        host = bucket["key"]
        last_seen_iso = bucket["last_seen"]["value_as_string"]
        hosts[host] = last_seen_iso  # e.g., "2026-01-08T15:42:31.123Z"
    return hosts

def post_to_webhook(webhook_url, session, payload):
    if args.dry_run:
        logging.info(f"[DRY-RUN] Would POST to webhook: {payload}")
        return
    resp = session.post(webhook_url, json=payload)
    if resp.status_code >= 400:
        logging.error(f"Webhook failed ({resp.status_code}): {resp.text}")
    else:
        logging.info("Webhook alert sent.")

def index_alert(session, url, alert_index, alert_doc):
    if args.dry_run:
        logging.info(f"[DRY-RUN] Would index alert: {alert_doc}")
        return
    resp = session.post(f"{url}/{quote_plus(alert_index)}/_doc", json=alert_doc)
    if resp.status_code not in (200, 201):
        logging.error(f"Failed to index alert ({resp.status_code}): {resp.text}")
    else:
        logging.info(f"Alert indexed for {alert_doc['host']}")

def main():
    global args
    args = parse_args()

    username = os.environ.get('USER')
    if not username:
        logging.error("Environment variable USER not set")
        sys.exit(1)

    password = getpass.getpass(prompt='Enter OpenSearch password: ')
    os_url = 'https://logsearch-api.acme.edu.au'

    session = requests.Session()
    session.auth = (username, password)
    session.headers.update({'Content-Type': 'application/json'})
    session.verify = True  # Set to False if self-signed cert issues

    excludes = load_excludes(args.exclude_file)

    # Use timezone-aware UTC now
    now = datetime.datetime.now(datetime.timezone.utc)

    logging.info(f"Fetching hosts seen in last {args.baseline_days} days...")
    query = build_last_seen_query(args.index, args.baseline_days, args.size)
    all_hosts_last_seen = get_hosts_with_last_seen(session, os_url, args.index, query)

    logging.info(f"Found {len(all_hosts_last_seen)} unique hosts in baseline.")

    silent_hosts = []
    for host, last_seen_str in all_hosts_last_seen.items():
        if host in excludes:
            continue
        if not last_seen_str:  # No logs in baseline (unlikely with max agg)
            continue
        # Parse the ISO string from OpenSearch (always Z/UTC)
        last_seen = datetime.datetime.fromisoformat(last_seen_str.replace('Z', '+00:00'))
        hours_silent = (now - last_seen).total_seconds() / 3600

        if hours_silent >= args.silence_hours:
            silent_hosts.append({
                "host": host,
                "last_seen": last_seen_str,
                "hours_silent": round(hours_silent, 1)
            })

    if not silent_hosts:
        logging.info("No silent sources detected.")
        return

    logging.warning(f"Detected {len(silent_hosts)} silent source(s)!")

    # Sort by most silent first
    silent_hosts.sort(key=lambda x: x['hours_silent'], reverse=True)

    # Pretty print
    for entry in silent_hosts:
        logging.warning(f"  - {entry['host']}: last seen {entry['last_seen']} ({entry['hours_silent']}h ago)")

    # Webhook alert (Slack-friendly example)
    if args.webhook:
        text_lines = [f"*Silent Log Sources Detected ({len(silent_hosts)})*"]
        for e in silent_hosts[:20]:  # limit if too many
            text_lines.append(f"• `{e['host']}` — last log {e['hours_silent']}h ago ({e['last_seen']})")
        if len(silent_hosts) > 20:
            text_lines.append(f"... and {len(silent_hosts)-20} more.")

        payload = {"text": "\n".join(text_lines)}
        post_to_webhook(args.webhook, session, payload)

    # Index each as a document
    if args.alert_index:
        for entry in silent_hosts:
            doc = {
                "@timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds') + 'Z',
                "host": entry['host'],
                "last_seen": entry['last_seen'],
                "hours_silent": entry['hours_silent'],
                "alert_type": "silent_source"
            }
            index_alert(session, os_url, args.alert_index, doc)

if __name__ == "__main__":
    main()
