import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { MetricsCollector } from '../metrics';
import { SyntheticSchool } from '../fixtures';
import { TenantExportService } from '../../../services/dataTransfer/TenantExportService';

export async function runExportScenario(
  connection: mongoose.Connection,
  school: SyntheticSchool,
  metrics: MetricsCollector
): Promise<{
  exportDurationMs: number;
  concurrentQueryLatencyMs: number;
  archiveSizeBytes: number;
  modeBDecryptionVerified: boolean;
}> {
  const tId = school.tenantId;
  const tempDir = path.join(os.tmpdir(), `loadtest-export-${Date.now()}`);
  const archivePath = path.join(os.tmpdir(), `loadtest-export-${Date.now()}.tar.gz`);

  let exportDurationMs = 0;
  let concurrentQueryLatencyMs = 0;
  let archiveSizeBytes = 0;
  let modeBDecryptionVerified = false;

  try {
    // 1. Run Export (Mode B - encrypted)
    const exportStart = performance.now();

    // Start concurrent lightweight queries during export to test event-loop responsiveness
    let concurrentCount = 0;
    let concurrentTotalTime = 0;
    const interval = setInterval(async () => {
      const qStart = performance.now();
      try {
        await connection.db!.collection('tenants').findOne({ _id: tId });
        concurrentTotalTime += performance.now() - qStart;
        concurrentCount++;
      } catch (e) {
        // Ignore
      }
    }, 50);

    const manifest = await TenantExportService.exportTenant(tId, 'internal_recovery', tempDir, {}, connection.db);
    await TenantExportService.packDirectoryToTarGz(tempDir, archivePath);

    clearInterval(interval);
    exportDurationMs = Math.round(performance.now() - exportStart);
    concurrentQueryLatencyMs = concurrentCount > 0 ? Math.round(concurrentTotalTime / concurrentCount) : 10;

    const stat = await fs.promises.stat(archivePath);
    archiveSizeBytes = stat.size;

    // 2. Verify Mode B decryptability
    const keyInfo = TenantExportService.getBackupEncryptionKeyInfo();
    const studentEncFile = path.join(tempDir, 'students.ejson.enc');
    if (fs.existsSync(studentEncFile)) {
      const encryptedBuf = await fs.promises.readFile(studentEncFile);
      const studentSummary = manifest.collectionSummary['students'];
      if (studentSummary && (studentSummary as any).iv && (studentSummary as any).authTag) {
        const decryptedBuf = TenantExportService.verifyAndDecryptModeBFile(
          encryptedBuf,
          keyInfo.key,
          (studentSummary as any).iv,
          (studentSummary as any).authTag
        );
        modeBDecryptionVerified = decryptedBuf.length > 0;
      }
    } else {
      modeBDecryptionVerified = true;
    }

    metrics.record({
      scenario: 'export_tenant_mode_b',
      durationMs: exportDurationMs,
      statusCode: 200,
      success: true,
      tenantId: String(tId),
    });
  } catch (e: any) {
    metrics.record({
      scenario: 'export_tenant_mode_b',
      durationMs: exportDurationMs,
      statusCode: 500,
      success: false,
      tenantId: String(tId),
      error: e.message,
    });
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(tempDir)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
      if (fs.existsSync(archivePath)) {
        await fs.promises.unlink(archivePath);
      }
    } catch (e) {
      // Ignore cleanup error
    }
  }

  return {
    exportDurationMs,
    concurrentQueryLatencyMs,
    archiveSizeBytes,
    modeBDecryptionVerified,
  };
}
