import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import os from 'os';
import { EJSON } from 'bson';
import { logger } from '../../utils/logger';

export type ExportCategory =
  | 'TENANT_IDENTITY'
  | 'TENANT_BUSINESS_DATA'
  | 'TENANT_SAAS_DATA'
  | 'GLOBAL_PLATFORM_DATA'
  | 'SECURITY_DATA'
  | 'LEGACY_CONDITIONAL'
  | 'FUTURE_NOT_PRESENT';

export interface CollectionExportPolicy {
  collection: string;
  category: ExportCategory;
  includeInSchoolData: boolean;
  includeInInternalRecovery: boolean;
  idField: '_id' | 'tenantId';
  referencedAssetFields?: string[];
}

/**
 * Forbidden fields strictly redacted from customer-facing Mode A (School Data) exports.
 * Applied centrally across all collections.
 */
export const FORBIDDEN_MODE_A_FIELDS = [
  'passwordHash',
  'refreshTokenHash',
  'passwordResetToken',
  'passwordResetExpires',
  'storageKey',
  'proofStorageKey',
  '__v',
] as const;

/**
 * Sensitive audit telemetry stripped from customer-facing Mode A exports.
 */
export const SENSITIVE_AUDIT_FIELDS = [
  'ip',
  'userAgent',
  'ipAddress',
  'token',
  'authorization',
  'authHeader',
] as const;

/**
 * Centralized redaction policy for customer-facing Mode A exports.
 * Recursively removes forbidden credentials, internal storage keys, and telemetry.
 */
export function sanitizeDocumentForModeA(doc: any, colName: string): any {
  if (!doc || typeof doc !== 'object') return doc;

  if (Array.isArray(doc)) {
    return doc.map((item) => sanitizeDocumentForModeA(item, colName));
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(doc)) {
    // 1. Forbidden fields removal
    if (FORBIDDEN_MODE_A_FIELDS.includes(key as any)) {
      continue;
    }

    // 2. AuditLog telemetry removal
    if (colName === 'auditlogs') {
      if (SENSITIVE_AUDIT_FIELDS.includes(key as any)) {
        continue;
      }
      if (key === 'metadata' && value && typeof value === 'object') {
        const cleanedMeta: Record<string, any> = {};
        for (const [metaKey, metaVal] of Object.entries(value as Record<string, any>)) {
          if (
            !SENSITIVE_AUDIT_FIELDS.includes(metaKey as any) &&
            !FORBIDDEN_MODE_A_FIELDS.includes(metaKey as any)
          ) {
            cleanedMeta[metaKey] = metaVal;
          }
        }
        sanitized.metadata = cleanedMeta;
        continue;
      }
    }

    // 3. Nested recursion (preserves Dates, BSON ObjectIds, etc.)
    if (value !== null && typeof value === 'object') {
      if (value instanceof Date || (value as any)._bsontype) {
        sanitized[key] = value;
      } else {
        sanitized[key] = sanitizeDocumentForModeA(value, colName);
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Registry of collections for tenant backup & export.
 */
export const TENANT_EXPORT_REGISTRY: CollectionExportPolicy[] = [
  // ── 1. TENANT IDENTITY ───────────────────────────────────
  {
    collection: 'tenants',
    category: 'TENANT_IDENTITY',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: '_id',
  },
  {
    collection: 'schoolsettings',
    category: 'TENANT_IDENTITY',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },

  // ── 2. TENANT BUSINESS DATA ──────────────────────────────
  {
    collection: 'academicsessions',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'classes',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'sections',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'subjects',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'students',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
    referencedAssetFields: ['profilePhotoUrl', 'documents.fileUrl'],
  },
  {
    collection: 'studenthistories',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'staff',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
    referencedAssetFields: ['profilePhotoUrl', 'documents.fileUrl'],
  },
  {
    collection: 'teachers',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: false, // Legacy compatibility collection; staff is canonical physical source
    includeInInternalRecovery: false,
    idField: 'tenantId',
    referencedAssetFields: ['profilePhotoUrl', 'documents.fileUrl'],
  },
  {
    collection: 'studentattendances',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'teacherattendances',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'feestructures',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'studentfees',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'payments',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
    referencedAssetFields: ['receiptPdfUrl'],
  },
  {
    collection: 'receiptcounters',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'examtypes',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'exams',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'examschedules',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'marks',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'gradescales',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'examattendances',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'results',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'admitcardoverrides',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'examfees',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'studentexamfees',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'examfeepayments',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'examexpenses',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'timetables',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'incomes',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'expenses',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
    referencedAssetFields: ['receiptUrl'],
  },
  {
    collection: 'salaryrecords',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'assignments',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
    referencedAssetFields: ['attachments.url'],
  },
  {
    collection: 'submissions',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
    referencedAssetFields: ['attachments.url'],
  },
  {
    collection: 'notices',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
    referencedAssetFields: ['attachments.url'],
  },
  {
    collection: 'notifications',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'leaverequests',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
    referencedAssetFields: ['attachmentUrl'],
  },
  {
    collection: 'schoolclosures',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'exportpresets',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'datahistories',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'users',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
    referencedAssetFields: ['profilePhotoUrl'],
  },
  {
    collection: 'tenantroleoverrides',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'auditlogs',
    category: 'TENANT_BUSINESS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },

  // ── 3. TENANT SAAS DATA ──────────────────────────────────
  {
    collection: 'subscriptionhistories',
    category: 'TENANT_SAAS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
  },
  {
    collection: 'subscriptionpayments',
    category: 'TENANT_SAAS_DATA',
    includeInSchoolData: true,
    includeInInternalRecovery: true,
    idField: 'tenantId',
    referencedAssetFields: ['paymentProofUrl'],
  },

  // ── 4. GLOBAL PLATFORM DATA (NEVER EXPORT IN TENANT BACKUP) ─
  {
    collection: 'subscriptionplans',
    category: 'GLOBAL_PLATFORM_DATA',
    includeInSchoolData: false,
    includeInInternalRecovery: false,
    idField: 'tenantId',
  },
  {
    collection: 'paymentmethods',
    category: 'GLOBAL_PLATFORM_DATA',
    includeInSchoolData: false,
    includeInInternalRecovery: false,
    idField: 'tenantId',
  },
  {
    collection: 'platformnotifications',
    category: 'GLOBAL_PLATFORM_DATA',
    includeInSchoolData: false,
    includeInInternalRecovery: false,
    idField: 'tenantId',
  },
  {
    collection: 'roles',
    category: 'GLOBAL_PLATFORM_DATA',
    includeInSchoolData: false,
    includeInInternalRecovery: false,
    idField: 'tenantId',
  },

  // ── 5. SECURITY DATA (NEVER EXPORT) ──────────────────────
  {
    collection: 'authsessions',
    category: 'SECURITY_DATA',
    includeInSchoolData: false,
    includeInInternalRecovery: false,
    idField: 'tenantId',
  },

  // ── 6. FUTURE ARCHITECTURE (NOT PRESENT YET) ─────────────
  {
    collection: 'staff',
    category: 'FUTURE_NOT_PRESENT',
    includeInSchoolData: false,
    includeInInternalRecovery: false,
    idField: 'tenantId',
  },
];

export interface ExportFilters {
  sessionId?: string;
  classId?: string;
  sectionId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface CollectionSummaryItem {
  count: number;
  file: string;
  sha256?: string;
  ciphertextSha256?: string;
  iv?: string;
  authTag?: string;
  algorithm?: string;
  keyId?: string;
}

export interface ExportManifest {
  manifestVersion: string;
  backupFormatVersion: string;
  applicationVersion: string;
  schemaVersion: string;
  mode: 'SCHOOL_DATA_EXPORT' | 'INTERNAL_TENANT_RECOVERY_BACKUP';
  tenantId: string;
  tenantName: string;
  exportedAt: string;
  filters: Record<string, any>;
  externalAssetsIncluded: boolean;
  externalAssetSummary: {
    referencedAssetsCount: number;
    description: string;
  };
  securityNote?: string;
  encryption?: {
    enabled: boolean;
    algorithm: string;
    keyId: string;
    ivLengthBytes: number;
    tagLengthBytes: number;
  };
  registeredCollectionsCount: number;
  exportedCollectionsCount: number;
  skippedCollectionsCount: number;
  failedCollectionsCount: number;
  totalExportedDocuments: number;
  collectionSummary: Record<string, CollectionSummaryItem>;
  failedCollections: string[];
}

export interface BackupKeyInfo {
  key: Buffer;
  keyId: string;
}

export class TenantExportService {
  /**
   * Resolves the 32-byte AES-256-GCM encryption key and its non-secret key identifier.
   * Encryption key is NEVER logged, stored in manifests, or committed to Git.
   */
  static getBackupEncryptionKeyInfo(): BackupKeyInfo {
    const rawKey = process.env.BACKUP_ENCRYPTION_KEY;
    let keyBuffer: Buffer;

    if (rawKey && rawKey.trim().length > 0) {
      const trimmed = rawKey.trim();
      if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        keyBuffer = Buffer.from(trimmed, 'hex');
      } else if (Buffer.from(trimmed, 'base64').length === 32) {
        keyBuffer = Buffer.from(trimmed, 'base64');
      } else if (Buffer.byteLength(trimmed, 'utf-8') === 32) {
        keyBuffer = Buffer.from(trimmed, 'utf-8');
      } else {
        throw new Error('BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes (hex, base64, or 32 raw UTF-8 chars)');
      }
    } else {
      // Deterministic node secret fallback for local / testing
      const secretSeed = process.env.JWT_ACCESS_SECRET || 'sms-fallback-recovery-key-salt';
      keyBuffer = crypto.createHash('sha256').update(secretSeed).digest();
    }

    const keyId = 'key-' + crypto.createHash('sha256').update(keyBuffer).digest('hex').slice(0, 16);
    return { key: keyBuffer, keyId };
  }

  /**
   * Decrypts and authenticates an encrypted Mode B backup file using AES-256-GCM.
   * Throws an error if ciphertext or auth tag is corrupted/tampered with.
   */
  static verifyAndDecryptModeBFile(
    ciphertextBuffer: Buffer,
    key: Buffer,
    ivHex: string,
    authTagHex: string
  ): Buffer {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
    return decrypted;
  }

  /**
   * Generates a POSIX UStar tar header for a file.
   */
  private static createTarHeader(name: string, size: number, mtime: Date = new Date()): Buffer {
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf-8');
    header.write('0000644\0', 100, 8, 'utf-8');
    header.write('0000000\0', 108, 8, 'utf-8');
    header.write('0000000\0', 116, 8, 'utf-8');
    header.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf-8');
    const mtimeOctal = Math.floor(mtime.getTime() / 1000).toString(8).padStart(11, '0') + '\0';
    header.write(mtimeOctal, 136, 12, 'utf-8');
    header.fill(' ', 148, 156);
    header.write('0', 156, 1, 'utf-8');
    header.write('ustar\0', 257, 6, 'utf-8');
    header.write('00', 263, 2, 'utf-8');

    let sum = 0;
    for (let i = 0; i < 512; i++) {
      sum += header[i];
    }
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf-8');
    return header;
  }

  /**
   * Packs a directory into a standard .tar.gz archive.
   */
  static async packDirectoryToTarGz(sourceDir: string, destTarGzPath: string): Promise<void> {
    const files = await fs.promises.readdir(sourceDir);
    const writeStream = fs.createWriteStream(destTarGzPath);
    const gzipStream = zlib.createGzip({ level: 6 });

    const pipePromise = new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
      gzipStream.on('error', reject);
    });

    gzipStream.pipe(writeStream);

    for (const fileName of files) {
      const filePath = path.join(sourceDir, fileName);
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) continue;

      const fileContent = await fs.promises.readFile(filePath);
      const header = this.createTarHeader(fileName, fileContent.length, stat.mtime);
      gzipStream.write(header);
      gzipStream.write(fileContent);

      const paddingSize = (512 - (fileContent.length % 512)) % 512;
      if (paddingSize > 0) {
        gzipStream.write(Buffer.alloc(paddingSize));
      }
    }

    // 2 x 512-byte zero blocks at end of tar archive
    gzipStream.write(Buffer.alloc(1024));
    gzipStream.end();

    await pipePromise;
  }

  /**
   * Performs an export for a tenant in either School Data Export or Internal Recovery mode.
   * Enforces server-side tenantId boundary unconditionally.
   */
  static async exportTenant(
    tenantObjectId: mongoose.Types.ObjectId,
    mode: 'school_data' | 'internal_recovery',
    outputDir: string,
    filters: ExportFilters = {},
    dbOverride?: any
  ): Promise<ExportManifest> {
    const db = dbOverride || mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const tenant = await db.collection('tenants').findOne({ _id: tenantObjectId });
    if (!tenant) throw new Error(`Tenant ${tenantObjectId} not found`);

    await fs.promises.mkdir(outputDir, { recursive: true });

    const isSchoolData = mode === 'school_data';
    const activePolicies = TENANT_EXPORT_REGISTRY.filter((p) =>
      isSchoolData ? p.includeInSchoolData : p.includeInInternalRecovery
    );

    let totalDocs = 0;
    let referencedAssetsCount = 0;
    const collectionSummary: Record<string, CollectionSummaryItem> = {};
    const failedCollections: string[] = [];

    const keyInfo = !isSchoolData ? this.getBackupEncryptionKeyInfo() : undefined;

    for (const policy of activePolicies) {
      const colName = policy.collection;
      const fileName = isSchoolData ? `${colName}.ejson` : `${colName}.ejson.enc`;
      const filePath = path.join(outputDir, fileName);

      try {
        let query: Record<string, any> = {};

        // Correction 3: ReceiptCounters have tenant identity encoded in _id prefix
        if (colName === 'receiptcounters') {
          query._id = { $regex: `^${tenantObjectId.toString()}:` };
        } else if (policy.idField === '_id') {
          query._id = tenantObjectId;
        } else {
          query.tenantId = tenantObjectId;
        }

        // Apply secondary filters safely WITHOUT ever replacing tenantId
        if (filters.sessionId && ['students', 'classes', 'sections', 'exams'].includes(colName)) {
          query.sessionId = new mongoose.Types.ObjectId(filters.sessionId);
        }
        if (filters.classId && ['students', 'sections', 'assignments'].includes(colName)) {
          query.classId = new mongoose.Types.ObjectId(filters.classId);
        }
        if (filters.sectionId && ['students', 'assignments'].includes(colName)) {
          query.sectionId = new mongoose.Types.ObjectId(filters.sectionId);
        }

        const cursor = db.collection(colName).find(query).batchSize(200);
        const docs: any[] = [];
        let colDocsCount = 0;

        while (await cursor.hasNext()) {
          let doc = await cursor.next();
          if (!doc) continue;

          // Step 4A.7: Mode A centralized redaction
          if (isSchoolData) {
            doc = sanitizeDocumentForModeA(doc, colName);
          }

          // Count external asset references
          if (policy.referencedAssetFields) {
            for (const field of policy.referencedAssetFields) {
              if (field.includes('.')) {
                const [arrKey, subKey] = field.split('.');
                const arr = (doc as any)[arrKey];
                if (Array.isArray(arr)) {
                  referencedAssetsCount += arr.filter((item) => Boolean(item?.[subKey])).length;
                }
              } else if ((doc as any)[field]) {
                referencedAssetsCount++;
              }
            }
          }

          docs.push(doc);
          colDocsCount++;
        }

        const serializedEjson = EJSON.stringify(docs, { relaxed: false });

        if (isSchoolData) {
          // Mode A: Plaintext sanitized EJSON
          await fs.promises.writeFile(filePath, serializedEjson, 'utf-8');
          const sha256 = crypto.createHash('sha256').update(serializedEjson).digest('hex');

          collectionSummary[colName] = {
            count: colDocsCount,
            file: fileName,
            sha256,
          };
        } else {
          // Step 4A.8: Mode B AES-256-GCM authenticated encryption (zero plaintext final file on disk)
          const iv = crypto.randomBytes(12); // Recommended 12-byte GCM IV
          const cipher = crypto.createCipheriv('aes-256-gcm', keyInfo!.key, iv);

          const plaintextBuf = Buffer.from(serializedEjson, 'utf-8');
          const ciphertext = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
          const authTag = cipher.getAuthTag(); // 16 bytes (128 bits)

          await fs.promises.writeFile(filePath, ciphertext);

          const ciphertextSha256 = crypto.createHash('sha256').update(ciphertext).digest('hex');

          collectionSummary[colName] = {
            count: colDocsCount,
            file: fileName,
            ciphertextSha256,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            algorithm: 'aes-256-gcm',
            keyId: keyInfo!.keyId,
          };
        }

        totalDocs += colDocsCount;
      } catch (err: any) {
        logger.error(`Export failed for collection ${colName}:`, err);
        failedCollections.push(colName);
      }
    }

    if (failedCollections.length > 0) {
      throw new Error(`Export failed on collections: ${failedCollections.join(', ')}`);
    }

    const manifest: ExportManifest = {
      manifestVersion: '1.0.0',
      backupFormatVersion: isSchoolData ? '2.0-ejson' : '2.0-ejson-aes256gcm',
      applicationVersion: '1.0.0',
      schemaVersion: '2026-09-13',
      mode: isSchoolData ? 'SCHOOL_DATA_EXPORT' : 'INTERNAL_TENANT_RECOVERY_BACKUP',
      tenantId: String(tenantObjectId),
      tenantName: tenant.name || 'Unknown',
      exportedAt: new Date().toISOString(),
      filters,
      externalAssetsIncluded: false,
      externalAssetSummary: {
        referencedAssetsCount,
        description:
          'Database export references external storage files. Binary assets are hosted externally and are not included in this EJSON dump.',
      },
      securityNote: isSchoolData
        ? 'Customer School Data Export: Authentication credentials, password hashes, and session tokens have been stripped for security. Restored users will require password reset.'
        : 'Internal Tenant Recovery Backup: Authenticated AES-256-GCM encrypted EJSON. Authentication tag verification required on restore.',
      ...(keyInfo
        ? {
            encryption: {
              enabled: true,
              algorithm: 'aes-256-gcm',
              keyId: keyInfo.keyId,
              ivLengthBytes: 12,
              tagLengthBytes: 16,
            },
          }
        : {}),
      registeredCollectionsCount: TENANT_EXPORT_REGISTRY.length,
      exportedCollectionsCount: Object.keys(collectionSummary).length,
      skippedCollectionsCount: TENANT_EXPORT_REGISTRY.length - Object.keys(collectionSummary).length,
      failedCollectionsCount: failedCollections.length,
      totalExportedDocuments: totalDocs,
      collectionSummary,
      failedCollections,
    };

    await fs.promises.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    return manifest;
  }
}
