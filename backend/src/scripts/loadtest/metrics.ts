export interface RequestMetric {
  scenario: string;
  durationMs: number;
  statusCode: number;
  success: boolean;
  tenantId?: string;
  error?: string;
}

export interface MetricSummary {
  scenario: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  errorRatePercent: number;
  rps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  minMs: number;
}

export class MetricsCollector {
  private metrics: RequestMetric[] = [];
  private startTime: number = Date.now();
  private endTime: number = Date.now();

  start(): void {
    this.metrics = [];
    this.startTime = Date.now();
  }

  stop(): void {
    this.endTime = Date.now();
  }

  record(metric: RequestMetric): void {
    this.metrics.push(metric);
  }

  getSummary(scenarioName?: string): MetricSummary {
    const list = scenarioName
      ? this.metrics.filter((m) => m.scenario === scenarioName)
      : this.metrics;

    if (list.length === 0) {
      return {
        scenario: scenarioName || 'ALL',
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        errorRatePercent: 0,
        rps: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
        minMs: 0,
      };
    }

    const durations = list.map((m) => m.durationMs).sort((a, b) => a - b);
    const successCount = list.filter((m) => m.success).length;
    const errorCount = list.length - successCount;
    const totalDurationSec = Math.max(1, (this.endTime - this.startTime) / 1000);

    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    return {
      scenario: scenarioName || 'ALL',
      totalRequests: list.length,
      successCount,
      errorCount,
      errorRatePercent: Math.round((errorCount / list.length) * 10000) / 100,
      rps: Math.round((list.length / totalDurationSec) * 10) / 10,
      p50Ms: Math.round(durations[p50Index] * 10) / 10,
      p95Ms: Math.round(durations[Math.min(p95Index, durations.length - 1)] * 10) / 10,
      p99Ms: Math.round(durations[Math.min(p99Index, durations.length - 1)] * 10) / 10,
      maxMs: Math.round(durations[durations.length - 1] * 10) / 10,
      minMs: Math.round(durations[0] * 10) / 10,
    };
  }

  getAllMetrics(): RequestMetric[] {
    return this.metrics;
  }
}
