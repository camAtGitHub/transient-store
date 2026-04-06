import type { Finding, Alert, ThreatIntelFinding, ParsedDocument } from '@/types';

// Generate realistic demo data for the correlation engine

const users = ['admin', 'jsmith', 'svc_backup', 'SYSTEM', 'jdoe', 'administrator', 'web_svc', 'db_svc', 'backup_svc'];
const hosts = ['srv-web-01', 'srv-db-01', 'srv-dc-01', 'ws-alex-44', 'srv-app-02', 'srv-mail-01', 'ws-sarah-12'];
const ips = ['10.0.1.15', '10.0.1.23', '10.0.2.45', '192.168.1.100', '10.0.3.78', '172.16.0.5', '10.0.4.12'];
const detectors = ['windows', 'linux', 'network', 'cloudtrail', 'ad_ldap'];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTimestamp(baseTime: number, offsetMinutes: number): number {
  return baseTime + offsetMinutes * 60 * 1000;
}

export function generateDemoFindings(count: number = 50): Finding[] {
  const baseTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
  const findings: Finding[] = [];

  // Create attack scenario: lateral movement
  const attackChain = [
    { time: 0, user: 'jsmith', host: 'ws-alex-44', ip: '10.0.4.12', severity: 'medium', type: 'windows' },
    { time: 15, user: 'jsmith', host: 'srv-web-01', ip: '10.0.1.15', severity: 'high', type: 'windows' },
    { time: 18, user: 'admin', host: 'srv-web-01', ip: '10.0.1.15', severity: 'critical', type: 'ad_ldap' },
    { time: 22, user: 'admin', host: 'srv-db-01', ip: '10.0.1.23', severity: 'critical', type: 'linux' },
    { time: 25, user: 'svc_backup', host: 'srv-db-01', ip: '10.0.1.23', severity: 'high', type: 'linux' },
    { time: 30, user: 'svc_backup', host: 'srv-dc-01', ip: '10.0.2.45', severity: 'critical', type: 'ad_ldap' },
    { time: 35, user: 'SYSTEM', host: 'srv-dc-01', ip: '10.0.2.45', severity: 'critical', type: 'windows' },
    { time: 40, user: 'administrator', host: 'srv-mail-01', ip: '192.168.1.100', severity: 'high', type: 'network' },
  ];

  // Generate attack chain findings
  attackChain.forEach((event, idx) => {
    const timestamp = generateTimestamp(baseTime, event.time);
    const doc: ParsedDocument = {
      '@timestamp': new Date(timestamp).toISOString(),
      event: { created: new Date(timestamp).toISOString() },
      related: {
        user: event.user,
        hosts: event.host,
        ip: event.ip
      },
      user: { name: event.user },
      host: { name: event.host },
      source: { ip: event.ip },
      event_type: 'authentication',
      outcome: idx > 3 ? 'failure' : 'success'
    };

    findings.push({
      id: `finding-attack-${idx}`,
      detectorId: `detector-${event.type}`,
      related_doc_ids: [`doc-attack-${idx}`],
      index: `logs-${event.type}`,
      queries: [{
        id: `query-${idx}`,
        name: `Suspicious ${event.type} activity`,
        fields: ['user.name', 'host.name', 'source.ip'],
        query: `user.name:${event.user} AND host.name:${event.host}`,
        tags: [event.severity, event.type]
      }],
      timestamp,
      document_list: [{
        index: `logs-${event.type}`,
        id: `doc-attack-${idx}`,
        found: true,
        document: JSON.stringify(doc)
      }]
    });
  });

  // Generate random background findings
  for (let i = attackChain.length; i < count; i++) {
    const offsetMinutes = Math.floor(Math.random() * 24 * 60);
    const timestamp = generateTimestamp(baseTime, offsetMinutes);
    const user = randomItem(users);
    const host = randomItem(hosts);
    const ip = randomItem(ips);
    const detector = randomItem(detectors);
    const severity = randomItem(['low', 'medium', 'high', 'critical']);

    const doc: ParsedDocument = {
      '@timestamp': new Date(timestamp).toISOString(),
      event: { created: new Date(timestamp).toISOString() },
      related: {
        user,
        hosts: host,
        ip
      },
      user: { name: user },
      host: { name: host },
      source: { ip: ip }
    };

    findings.push({
      id: `finding-${i}`,
      detectorId: `detector-${detector}-${Math.floor(Math.random() * 5)}`,
      related_doc_ids: [`doc-${i}`],
      index: `logs-${detector}`,
      queries: [{
        id: `query-${i}`,
        name: `${detector} detection`,
        fields: [],
        query: `severity:${severity}`,
        tags: [severity, detector]
      }],
      timestamp,
      document_list: [{
        index: `logs-${detector}`,
        id: `doc-${i}`,
        found: true,
        document: JSON.stringify(doc)
      }]
    });
  }

  return findings.sort((a, b) => a.timestamp - b.timestamp);
}

export function generateDemoAlerts(count: number = 20): Alert[] {
  const baseTime = Date.now() - 24 * 60 * 60 * 1000;
  const alerts: Alert[] = [];

  for (let i = 0; i < count; i++) {
    const offsetMinutes = Math.floor(Math.random() * 24 * 60);
    const timestamp = new Date(generateTimestamp(baseTime, offsetMinutes)).toISOString();
    
    alerts.push({
      id: `alert-${i}`,
      detector_id: `detector-${randomItem(detectors)}`,
      trigger_id: `trigger-${i}`,
      trigger_name: `Trigger ${i}`,
      finding_ids: [`finding-${i}`],
      related_doc_ids: [`doc-${i}`],
      state: randomItem(['ACTIVE', 'ACKNOWLEDGED', 'COMPLETED']),
      severity: randomItem(['1', '2', '3', '4']),
      start_time: timestamp,
      end_time: Math.random() > 0.5 ? timestamp : null,
      acknowledged_time: null
    });
  }

  return alerts;
}

export function generateDemoThreatIntel(count: number = 15): ThreatIntelFinding[] {
  const baseTime = Date.now() - 24 * 60 * 60 * 1000;
  const threats: ThreatIntelFinding[] = [];
  
  const threatIocs = [
    { value: '185.220.101.44', type: 'ipv4-addr' },
    { value: 'evil-c2.ru', type: 'domain-name' },
    { value: 'malware-hash-123', type: 'file-hash' },
    { value: 'phishing@badactor.com', type: 'email-addr' }
  ];

  for (let i = 0; i < count; i++) {
    const ioc = randomItem(threatIocs);
    const offsetMinutes = Math.floor(Math.random() * 24 * 60);
    
    threats.push({
      id: `threat-${i}`,
      related_doc_ids: [`doc-threat-${i}`],
      ioc_feed_ids: [{
        ioc_id: `ioc-${i}`,
        feed_id: 'alienvault_reputation',
        feed_name: 'AlienVault IP Reputation',
        index: ''
      }],
      monitor_id: `monitor-${i % 3}`,
      monitor_name: `Threat Intel Monitor ${i % 3}`,
      ioc_value: ioc.value,
      ioc_type: ioc.type,
      timestamp: generateTimestamp(baseTime, offsetMinutes),
      execution_id: `exec-${i}`
    });
  }

  return threats;
}

// Demo data service
class DemoDataService {
  getFindings(count: number = 50): Finding[] {
    return generateDemoFindings(count);
  }

  getAlerts(count: number = 20): Alert[] {
    return generateDemoAlerts(count);
  }

  getThreatIntel(count: number = 15): ThreatIntelFinding[] {
    return generateDemoThreatIntel(count);
  }
}

export const demoDataService = new DemoDataService();
