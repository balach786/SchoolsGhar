import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger';

/**
 * Periodically cleans abandoned export directories from the dedicated export staging root.
 * Only targets the subdirectories under os.tmpdir()/sms-school-exports older than maxAgeMs.
 * Never touches arbitrary paths or unrelated temporary files.
 */
export function cleanupAbandonedExports(maxAgeMs: number = 60 * 60 * 1000): number {
  try {
    const exportRoot = path.join(os.tmpdir(), 'sms-school-exports');
    if (!fs.existsSync(exportRoot)) return 0;

    const now = Date.now();
    const entries = fs.readdirSync(exportRoot, { withFileTypes: true });

    let cleanedCount = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(exportRoot, entry.name);
        try {
          const stats = fs.statSync(dirPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.rmSync(dirPath, { recursive: true, force: true });
            cleanedCount++;
          }
        } catch {}
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} abandoned export staging directories`);
    }
    return cleanedCount;
  } catch (err) {
    logger.warn('Error during export staging cleanup:', err);
    return 0;
  }
}
