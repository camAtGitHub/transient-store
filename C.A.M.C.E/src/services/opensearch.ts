import type { Finding, Alert, ThreatIntelFinding, ConnectionSettings } from '@/types';

class OpenSearchService {
  private baseUrl: string = '';
  private auth: { username: string; password: string } | null = null;
  private demoMode: boolean = false;

  setConnection(settings: ConnectionSettings) {
    this.baseUrl = settings.host;
    this.auth = settings.username && settings.password
      ? { username: settings.username, password: settings.password }
      : null;
    this.demoMode = settings.demoMode;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (this.demoMode) {
      throw new Error('Demo mode - no API calls');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.headers) {
      const opts = options.headers as Record<string, string>;
      Object.keys(opts).forEach(key => {
        headers[key] = opts[key];
      });
    }

    if (this.auth) {
      const credentials = btoa(`${this.auth.username}:${this.auth.password}`);
      headers['Authorization'] = `Basic ${credentials}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        mode: 'cors'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('OpenSearch API error:', error);
      throw error;
    }
  }

  async getFindings(params: {
    detectorId?: string;
    detectorType?: string;
    severity?: string;
    detectionType?: 'rule' | 'threat';
    sortOrder?: 'asc' | 'desc';
    size?: number;
    startIndex?: number;
  } = {}): Promise<{ findings: Finding[]; total_findings: number }> {
    const queryParams = new URLSearchParams();
    
    if (params.detectorId) queryParams.set('detector_id', params.detectorId);
    if (params.detectorType) queryParams.set('detectorType', params.detectorType);
    if (params.severity) queryParams.set('severity', params.severity);
    if (params.detectionType) queryParams.set('detectionType', params.detectionType);
    if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
    if (params.size) queryParams.set('size', params.size.toString());
    if (params.startIndex) queryParams.set('startIndex', params.startIndex.toString());

    const endpoint = `/_plugins/_security_analytics/findings/_search?${queryParams.toString()}`;
    return this.request(endpoint);
  }

  async getAlerts(params: {
    detectorId?: string;
    detectorType?: string;
    severityLevel?: string;
    alertState?: string;
    sortString?: string;
    sortOrder?: 'asc' | 'desc';
    size?: number;
    startIndex?: number;
    searchString?: string;
  } = {}): Promise<{ alerts: Alert[]; total_alerts: number; detectorType?: string }> {
    const queryParams = new URLSearchParams();
    
    if (params.detectorId) queryParams.set('detector_id', params.detectorId);
    if (params.detectorType) queryParams.set('detectorType', params.detectorType);
    if (params.severityLevel) queryParams.set('severityLevel', params.severityLevel);
    if (params.alertState) queryParams.set('alertState', params.alertState);
    if (params.sortString) queryParams.set('sortString', params.sortString);
    if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
    if (params.size) queryParams.set('size', params.size.toString());
    if (params.startIndex) queryParams.set('startIndex', params.startIndex.toString());
    if (params.searchString) queryParams.set('searchString', params.searchString);

    const endpoint = `/_plugins/_security_analytics/alerts?${queryParams.toString()}`;
    return this.request(endpoint);
  }

  async getThreatIntelFindings(params: {
    sortOrder?: 'asc' | 'desc';
    size?: number;
    startIndex?: number;
    startTime?: number;
    endTime?: number;
  } = {}): Promise<{ ioc_findings: ThreatIntelFinding[]; total_findings: number }> {
    const queryParams = new URLSearchParams();
    
    if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
    if (params.size) queryParams.set('size', params.size.toString());
    if (params.startIndex !== undefined) queryParams.set('startIndex', params.startIndex.toString());
    if (params.startTime) queryParams.set('startTime', params.startTime.toString());
    if (params.endTime) queryParams.set('endTime', params.endTime.toString());

    const endpoint = `/_plugins/_security_analytics/threat_intel/findings/_search?${queryParams.toString()}`;
    return this.request(endpoint);
  }

  async acknowledgeAlerts(detectorId: string, alertIds: string[]): Promise<any> {
    const endpoint = `/_plugins/_security_analytics/detectors/${detectorId}/_acknowledge/alerts`;
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify({ alerts: alertIds })
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request('/_cluster/health');
      return true;
    } catch {
      return false;
    }
  }
}

export const openSearchService = new OpenSearchService();
