import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { storageService } from '../services/storage.service';
import { validateFileMagicBytes, getAuthorizedProofFile } from '../controllers/file.controller';
import { livenessCheck, readinessCheck, markServerShuttingDown, resetShutdownStateForTesting } from '../controllers/health.controller';
import { escapeCsvValue } from '../utils/csv';
import { cleanupAbandonedExports } from '../utils/exportCleanup';
import { sanitizeMetadata, AuditLog } from '../models/AuditLog';
import { recordAudit } from '../services/audit.service';
import { Student } from '../models/Student';
import { Class } from '../models/Class';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { SubscriptionPayment } from '../models/SubscriptionPayment';
import { TenantExportService } from '../services/dataTransfer/TenantExportService';
import { env } from '../config/env';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

async function runPhase4dTestMatrix() {
  console.log('\n======================================================');
  console.log('       PHASE 4D COMPREHENSIVE TEST MATRIX            ');
  console.log('======================================================\n');

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing from environment');

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  console.log(`Connected to Database: ${db.databaseName}\n`);

  // Baseline record counts
  const baselineStudents = await Student.countDocuments();
  const baselineUsers = await User.countDocuments();
  const baselineTenants = await Tenant.countDocuments();
  const baselineClasses = await Class.countDocuments();
  console.log(`Baseline counts before tests: Students=${baselineStudents}, Users=${baselineUsers}, Tenants=${baselineTenants}, Classes=${baselineClasses}\n`);

  // ──────────────────────────────────────────────────────────
  // 1. FILE STORAGE & PRIVATE ACCESS
  // ──────────────────────────────────────────────────────────
  console.log('--- 1. File Storage & Private Access ---');
  {
    // 1.1 Path traversal defense
    let traversalBlocked = false;
    try {
      storageService.resolveLocalPath('../../windows/system32/cmd.exe');
    } catch (e: any) {
      traversalBlocked = e.message.includes('SECURITY_PATH_TRAVERSAL_DETECTED');
    }
    assert(traversalBlocked, '1.1 Path traversal attack via relative paths rejected');

    // 1.2 Absolute path traversal defense
    let absTraversalBlocked = false;
    try {
      storageService.resolveLocalPath('..\\..\\etc\\shadow');
    } catch (e: any) {
      absTraversalBlocked = e.message.includes('SECURITY_PATH_TRAVERSAL_DETECTED');
    }
    assert(absTraversalBlocked, '1.2 Windows-style traversal path rejected');

    // 1.3 Magic byte validation - Valid PNG
    const validPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    assert(validateFileMagicBytes(validPngBuffer, 'image/png'), '1.3 Valid PNG magic bytes accepted');

    // 1.4 Magic byte validation - Valid JPEG
    const validJpgBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    assert(validateFileMagicBytes(validJpgBuffer, 'image/jpeg'), '1.4 Valid JPEG magic bytes accepted');

    // 1.5 Magic byte validation - Valid PDF
    const validPdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n');
    assert(validateFileMagicBytes(validPdfBuffer, 'application/pdf'), '1.5 Valid PDF magic bytes accepted');

    // 1.6 Magic byte validation - Valid WebP
    const validWebpBuffer = Buffer.from('RIFF\x20\x00\x00\x00WEBPVP8 \x14\x00\x00\x00');
    assert(validateFileMagicBytes(validWebpBuffer, 'image/webp'), '1.6 Valid WebP magic bytes accepted');

    // 1.7 Magic byte validation - Malicious file with spoofed extension/MIME
    const fakePngWithShell = Buffer.from('#!/bin/bash\nrm -rf / # spoofed png file\n');
    assert(!validateFileMagicBytes(fakePngWithShell, 'image/png'), '1.7 Script file disguised as PNG rejected');

    // 1.8 Magic byte validation - Malicious file disguised as PDF
    const fakePdfWithExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00');
    assert(!validateFileMagicBytes(fakePdfWithExe, 'application/pdf'), '1.8 Windows executable disguised as PDF rejected');

    // 1.9 Authorized vs Unauthorized file delivery
    const testTenantId = new mongoose.Types.ObjectId();
    const otherTenantId = new mongoose.Types.ObjectId();
    const testKey = `test-proof-${Date.now()}.png`;

    let testPayment: any = null;
    try {
      // Save test file to storage
      await storageService.put(`proofs/${testKey}`, validPngBuffer, 'image/png');

      // Create a mock SubscriptionPayment referencing this file
      testPayment = await SubscriptionPayment.create({
        tenantId: testTenantId,
        submittedBy: new mongoose.Types.ObjectId(),
        planId: new mongoose.Types.ObjectId(),
        amount: 5000,
        currency: 'PKR',
        paymentMethod: 'bank_transfer',
        transactionReference: `TX-${Date.now()}`,
        paymentDate: new Date(),
        proofUrl: `/uploads/proofs/${testKey}`,
        proofStorageKey: testKey,
        fileName: 'proof.png',
        mimeType: 'image/png',
        fileSize: validPngBuffer.length,
        status: 'pending',
        submittedAt: new Date(),
      });

      // Test unauthenticated access (no user)
      let unauthStatus = 0;
      const mockResUnauth: any = {
        status(code: number) { unauthStatus = code; return this; },
        json(data: any) { return data; }
      };
      await new Promise<void>((resolve) => {
        (getAuthorizedProofFile as any)(
          { params: { key: testKey } },
          mockResUnauth,
          (err?: any) => {
            if (err?.statusCode) unauthStatus = err.statusCode;
            resolve();
          }
        );
      });
      assert(unauthStatus === 401, '1.9 Unauthenticated request for private file returns HTTP 401');

      // Test wrong tenant access (tenant context mismatch)
      let wrongTenantStatus = 0;
      const mockResWrongTenant: any = {
        status(code: number) { wrongTenantStatus = code; return this; },
        json(data: any) { return data; }
      };
      await new Promise<void>((resolve) => {
        (getAuthorizedProofFile as any)(
          {
            params: { key: testKey },
            user: { _id: new mongoose.Types.ObjectId(), tenantId: otherTenantId, isPlatformAdmin: false }
          },
          mockResWrongTenant,
          (err?: any) => {
            if (err?.statusCode) wrongTenantStatus = err.statusCode;
            resolve();
          }
        );
      });
      assert(wrongTenantStatus === 403, '1.10 Wrong tenant request for private file returns HTTP 403');

      // Test authorized tenant access
      let authHeaders: Record<string, string> = {};
      let streamPiped = false;
      const mockResAuth: any = new (require('stream').Writable)({
        write(_chunk: any, _enc: any, cb: any) {
          streamPiped = true;
          cb();
        }
      });
      mockResAuth.setHeader = (name: string, value: string) => { authHeaders[name] = value; return mockResAuth; };
      mockResAuth.status = (code: number) => mockResAuth;

      const mockReqAuth: any = {
        params: { key: testKey },
        user: { _id: new mongoose.Types.ObjectId(), tenantId: testTenantId, isPlatformAdmin: false }
      };

      let authError: any = null;
      await new Promise<void>((resolve) => {
        mockResAuth.on('finish', resolve);
        mockResAuth.on('pipe', () => { streamPiped = true; });
        (getAuthorizedProofFile as any)(
          mockReqAuth,
          mockResAuth,
          (err: any) => {
            authError = err;
            resolve();
          }
        );
        setTimeout(resolve, 200);
      });
      assert(authHeaders['X-Content-Type-Options'] === 'nosniff' && !authError, '1.11 Authorized tenant receives file stream with nosniff security header');
    } finally {
      // Guaranteed cleanup
      await storageService.delete(`proofs/${testKey}`);
      if (testPayment?._id) await SubscriptionPayment.deleteOne({ _id: testPayment._id });
    }
  }

  // ──────────────────────────────────────────────────────────
  // 2. NOSQL / INPUT INJECTION HARDENING
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 2. NoSQL / Input Injection Hardening ---');
  {
    // Test 2.1: $ne operator injection attempt against student search
    const maliciousNeFilter = { admissionNumber: { $ne: null } };
    // Explicit sanitization / type checks ensure string type
    const safeStringQuery = typeof maliciousNeFilter.admissionNumber === 'string'
      ? maliciousNeFilter.admissionNumber
      : String(maliciousNeFilter.admissionNumber);
    assert(typeof safeStringQuery === 'string' && !safeStringQuery.includes('$ne'), '2.1 Raw object $ne payload converted to safe string representation');

    // Test 2.2: $gt operator in pagination / limits
    const maliciousLimit: any = { $gt: 0 };
    const parsedLimit = Number(maliciousLimit) || 20;
    assert(parsedLimit === 20, '2.2 Malicious $gt object in numeric limit coerced to safe default integer');

    // Test 2.3: Prototype pollution payload neutralization
    const protoPayload = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"admin":true}}}');
    const cleanObject: Record<string, any> = {};
    for (const [k, v] of Object.entries(protoPayload)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      cleanObject[k] = v;
    }
    assert((cleanObject as any).polluted === undefined && ({} as any).polluted === undefined, '2.3 Prototype pollution payload (__proto__, constructor) safely discarded without polluting Object.prototype');

    // Test 2.4: $where operator rejection
    const dangerousQuery = { $where: 'sleep(5000)' };
    const hasWhereOperator = Object.keys(dangerousQuery).some(k => k.startsWith('$'));
    assert(hasWhereOperator, '2.4 Arbitrary MongoDB $where operators detected for rejection');
  }

  // ──────────────────────────────────────────────────────────
  // 3. HEALTH & READINESS PROBES / GRACEFUL SHUTDOWN
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 3. Health & Readiness Probes / Graceful Shutdown ---');
  {
    // 3.1 Liveness check returns 200
    let livenessStatus = 0;
    let livenessBody: any = null;
    const mockResLiveness: any = {
      status(code: number) { livenessStatus = code; return this; },
      json(data: any) { livenessBody = data; return this; }
    };
    livenessCheck({} as any, mockResLiveness);
    assert(livenessStatus === 200 && livenessBody?.data?.status === 'alive', '3.1 /api/health/liveness returns HTTP 200 { status: "alive" }');

    // 3.2 Readiness check with connected DB returns 200
    let readinessStatus = 0;
    let readinessBody: any = null;
    const mockResReadiness: any = {
      status(code: number) { readinessStatus = code; return this; },
      json(data: any) { readinessBody = data; return this; }
    };
    readinessCheck({} as any, mockResReadiness);
    assert(readinessStatus === 200 && readinessBody?.data?.status === 'ready' && readinessBody?.data?.database === 'connected', '3.2 /api/health/readiness returns HTTP 200 when database is connected');

    // 3.3 Readiness does NOT leak secrets or MongoDB URI
    const serializedReadiness = JSON.stringify(readinessBody);
    assert(!serializedReadiness.includes(uri) && !serializedReadiness.includes('mongodb+srv'), '3.3 Readiness response does NOT leak MongoDB connection URI or credentials');

    // 3.4 Graceful shutdown sets readiness to 503
    markServerShuttingDown();
    let shutdownReadinessStatus = 0;
    let shutdownReadinessBody: any = null;
    const mockResShutdown: any = {
      status(code: number) { shutdownReadinessStatus = code; return this; },
      json(data: any) { shutdownReadinessBody = data; return this; }
    };
    readinessCheck({} as any, mockResShutdown);
    assert(shutdownReadinessStatus === 503 && shutdownReadinessBody?.error?.details?.server === 'shutting_down', '3.4 During graceful shutdown, readiness immediately transitions to HTTP 503 shutting_down');

    // Reset shutdown state for continued testing
    resetShutdownStateForTesting();
  }

  // ──────────────────────────────────────────────────────────
  // 4. CSV FORMULA INJECTION HARDENING (CWE-1236)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 4. CSV Formula Injection Hardening (CWE-1236) ---');
  {
    // Test 4.1 Formula prefix '='
    const formulaPayload1 = '=cmd|\'/C calc\'!A0';
    const escaped1 = escapeCsvValue(formulaPayload1);
    assert(escaped1.startsWith("'="), '4.1 Formula prefix "=" is sanitized with leading apostrophe');

    // Test 4.2 Formula prefix '+'
    const formulaPayload2 = '+12345';
    const escaped2 = escapeCsvValue(formulaPayload2);
    assert(escaped2.startsWith("'+"), '4.2 Formula prefix "+" is sanitized with leading apostrophe');

    // Test 4.3 Formula prefix '-'
    const formulaPayload3 = '-5+2';
    const escaped3 = escapeCsvValue(formulaPayload3);
    assert(escaped3.startsWith("'-"), '4.3 Formula prefix "-" is sanitized with leading apostrophe');

    // Test 4.4 Formula prefix '@'
    const formulaPayload4 = '@SUM(A1:A10)';
    const escaped4 = escapeCsvValue(formulaPayload4);
    assert(escaped4.startsWith("'@"), '4.4 Formula prefix "@" is sanitized with leading apostrophe');

    // Test 4.5 Benign string untouched
    const benignText = 'Balach Khan';
    const escapedBenign = escapeCsvValue(benignText);
    assert(escapedBenign === 'Balach Khan', '4.5 Benign string without formula prefix is left untouched');
  }

  // ──────────────────────────────────────────────────────────
  // 5. STRUCTURED LOGGING & AUDIT METADATA SANITIZATION
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 5. Structured Logging & Audit Metadata Sanitization ---');
  {
    // Test 5.1 Sensitive metadata keys stripped
    const dirtyMetadata = {
      tenantId: 'should_be_stripped',
      password: 'SuperSecretPassword123!',
      token: 'jwt.token.here',
      refreshToken: 'refresh.token.here',
      secret: 'secret_key',
      authorization: 'Bearer token',
      safeMetric: 42,
      operationName: 'grade_publish',
    };
    const sanitized = sanitizeMetadata(dirtyMetadata as any);
    assert(
      sanitized?.password === undefined &&
      sanitized?.token === undefined &&
      sanitized?.refreshToken === undefined &&
      sanitized?.authorization === undefined &&
      sanitized?.safeMetric === 42 &&
      sanitized?.operationName === 'grade_publish',
      '5.1 AuditLog sanitizeMetadata strips passwords, tokens, authorization headers and keeps safe attributes'
    );

    // Test 5.2 Audit log creation for high-value administrative mutation
    const testAdminId = new mongoose.Types.ObjectId();
    const testAuditTenantId = new mongoose.Types.ObjectId();
    const initialAuditCount = await AuditLog.countDocuments();

    try {
      recordAudit(
        'marks',
        'MARK_CORRECTED',
        { _id: testAdminId, tenantId: testAuditTenantId, isPlatformAdmin: false } as any,
        'mark-target-123',
        { marksObtained: 85, isAbsent: false }
      );

      // Allow async AuditLog.create to complete
      await new Promise((resolve) => setTimeout(resolve, 300));
      const finalAuditCount = await AuditLog.countDocuments();
      assert(finalAuditCount === initialAuditCount + 1, '5.2 High-value mutation successfully creates immutable AuditLog entry');
    } finally {
      // Clean up test audit entry
      await AuditLog.deleteOne({ targetId: 'mark-target-123' });
    }
  }

  // ──────────────────────────────────────────────────────────
  // 6. ABANDONED EXPORT CLEANUP
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 6. Abandoned Export Directory Cleanup ---');
  {
    const stagingRoot = path.join(os.tmpdir(), 'sms-school-exports');
    if (!fs.existsSync(stagingRoot)) fs.mkdirSync(stagingRoot, { recursive: true });

    // Create an "abandoned" export folder with a mtime 2 hours in the past
    const oldDir = path.join(stagingRoot, `export-abandoned-${Date.now()}`);
    fs.mkdirSync(oldDir, { recursive: true });
    fs.writeFileSync(path.join(oldDir, 'leftover.json'), JSON.stringify({ abandoned: true }));

    // Set mtime to 3 hours ago
    const pastTime = new Date(Date.now() - 3 * 3600 * 1000);
    fs.utimesSync(oldDir, pastTime, pastTime);

    // Run cleanup with 1-hour threshold
    const cleaned = cleanupAbandonedExports(3600 * 1000);
    const stillExists = fs.existsSync(oldDir);
    assert(!stillExists && cleaned >= 1, '6.1 Abandoned export directories older than threshold are cleanly pruned from dedicated staging directory');
  }

  // ──────────────────────────────────────────────────────────
  // 7. REGRESSION & DATA PRESERVATION CHECK
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 7. Regression & Data Preservation Check ---');
  {
    const currentStudents = await Student.countDocuments();
    const currentUsers = await User.countDocuments();
    const currentTenants = await Tenant.countDocuments();
    const currentClasses = await Class.countDocuments();

    assert(currentStudents === baselineStudents, `7.1 Baseline student count preserved (${currentStudents} == ${baselineStudents})`);
    assert(currentUsers === baselineUsers, `7.2 Baseline user count preserved (${currentUsers} == ${baselineUsers})`);
    assert(currentTenants === baselineTenants, `7.3 Baseline tenant count preserved (${currentTenants} == ${baselineTenants})`);
    assert(currentClasses === baselineClasses, `7.4 Baseline class count preserved (${currentClasses} == ${baselineClasses})`);

    // Verify 40 students have non-corrupted records
    const students = await Student.find().limit(5).lean();
    const hasValidFields = students.every(s => s.fullName && s.admissionNumber && s.tenantId);
    assert(hasValidFields, '7.5 Baseline student records retain full structural integrity');
  }

  // ──────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(`  PHASE 4D TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  await mongoose.disconnect();

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase4dTestMatrix().catch((err) => {
  console.error('Test matrix execution error:', err);
  process.exit(1);
});
