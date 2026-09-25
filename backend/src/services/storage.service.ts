import fs from 'fs';
import path from 'path';
import stream from 'stream';
import { env } from '../config/env';

export interface StorageFileDescriptor {
  key: string;
  buffer?: Buffer;
  stream?: stream.Readable;
  mimeType?: string;
  size?: number;
}

export interface IStorageService {
  put(key: string, data: Buffer, mimeType: string): Promise<string>;
  getStream(key: string): Promise<{ stream: stream.Readable; size: number; mimeType?: string } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  resolveLocalPath?(key: string): string;
}

/**
 * Local filesystem implementation of IStorageService.
 * In a future cloud environment (S3 / GCS), this class can be swapped
 * via dependency injection / factory pattern without altering application controllers.
 */
export class LocalDiskStorageService implements IStorageService {
  private baseDir: string;

  constructor(baseDir: string = env.uploadDir) {
    this.baseDir = path.resolve(baseDir);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  resolveLocalPath(key: string): string {
    // Prevent directory traversal
    if (key.includes('..') || path.isAbsolute(key)) {
      throw new Error('SECURITY_PATH_TRAVERSAL_DETECTED');
    }
    const resolved = path.resolve(this.baseDir, key);
    const normalizedBase = path.resolve(this.baseDir);
    if (!resolved.startsWith(normalizedBase)) {
      throw new Error('SECURITY_PATH_TRAVERSAL_DETECTED');
    }
    return resolved;
  }

  async put(key: string, data: Buffer, _mimeType: string): Promise<string> {
    const fullPath = this.resolveLocalPath(key);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(fullPath, data);
    return key;
  }

  async getStream(key: string): Promise<{ stream: stream.Readable; size: number; mimeType?: string } | null> {
    const fullPath = this.resolveLocalPath(key);
    if (!fs.existsSync(fullPath)) return null;
    const stat = await fs.promises.stat(fullPath);
    if (!stat.isFile()) return null;
    const readStream = fs.createReadStream(fullPath);
    return {
      stream: readStream,
      size: stat.size,
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      const fullPath = this.resolveLocalPath(key);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const fullPath = this.resolveLocalPath(key);
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }
    } catch (e) {
      // ignore
    }
  }
}

export const storageService = new LocalDiskStorageService();

export interface StorageReport {
  generatedAt: string;
  database: {
    name: string;
    collections: number;
    objects: number;
  };
  usage: {
    dataSize: number;
    indexSize: number;
    totalSize: number;
    mb: number;
    percent: number;
    level: 'normal' | 'warning' | 'elevated' | 'critical';
    thresholds: {
      warningPercent: number;
      elevatedPercent: number;
      criticalPercent: number;
    };
  };
  collections: Array<{
    collection: string;
    documents: number;
    dataSize: number;
    indexSize: number;
    totalSize: number;
  }>;
  recommendations: string[];
}

export async function getStorageReport(): Promise<StorageReport> {
  const db = (await import('mongoose')).default.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }
  const dbStats = await db.command({ dbStats: 1 });
  const dataSize = dbStats.dataSize || 0;
  const indexSize = dbStats.indexSize || 0;
  const totalSize = dataSize + indexSize;
  const budgetBytes = 512 * 1024 * 1024;
  const mb = totalSize / (1024 * 1024);
  const percent = (totalSize / budgetBytes) * 100;

  let level: 'normal' | 'warning' | 'elevated' | 'critical' = 'normal';
  if (percent >= 90) level = 'critical';
  else if (percent >= 80) level = 'elevated';
  else if (percent >= 70) level = 'warning';

  const collList = await db.listCollections().toArray();
  const collections: StorageReport['collections'] = [];

  for (const c of collList) {
    if (c.name.startsWith('system.')) continue;
    try {
      const cStats = await db.command({ collStats: c.name });
      collections.push({
        collection: c.name,
        documents: cStats.count || 0,
        dataSize: cStats.size || 0,
        indexSize: cStats.totalIndexSize || 0,
        totalSize: (cStats.size || 0) + (cStats.totalIndexSize || 0),
      });
    } catch {
      // ignore
    }
  }

  collections.sort((a, b) => b.totalSize - a.totalSize);

  const recommendations: string[] = [];
  if (percent > 70) {
    recommendations.push('Run retention cleanup on compact logs (notifications, auditlogs).');
  } else {
    recommendations.push('MongoDB usage is within normal operational limits.');
  }

  return {
    generatedAt: new Date().toISOString(),
    database: {
      name: db.databaseName,
      collections: dbStats.collections || collList.length,
      objects: dbStats.objects || 0,
    },
    usage: {
      dataSize,
      indexSize,
      totalSize,
      mb,
      percent,
      level,
      thresholds: {
        warningPercent: 70,
        elevatedPercent: 80,
        criticalPercent: 90,
      },
    },
    collections,
    recommendations,
  };
}

