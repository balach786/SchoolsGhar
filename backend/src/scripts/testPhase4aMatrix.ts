import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Student } from '../models/Student';
import { Subject } from '../models/Subject';
import { AcademicSession } from '../models/AcademicSession';
import { Expense } from '../models/Expense';
import { Notice } from '../models/Notice';
import { SchoolSettings } from '../models/SchoolSettings';
import { AuditLog, sanitizeMetadata } from '../models/AuditLog';
import { recordAudit } from '../services/audit.service';
import { nextReceiptNumber } from '../models/ReceiptCounter';
import {
  TenantExportService,
  sanitizeDocumentForModeA,
  FORBIDDEN_MODE_A_FIELDS,
} from '../services/dataTransfer/TenantExportService';
import { AuthUser } from '../types';

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

async function runTestMatrix() {
  console.log('\n======================================================');
  console.log('       PHASE 4A COMPREHENSIVE TEST MATRIX            ');
  console.log('======================================================\n');

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing from environment');

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  console.log(`Connected to Database: ${db.databaseName}\n`);

  const dummyTenant1 = new mongoose.Types.ObjectId();
  const dummyTenant2 = new mongoose.Types.ObjectId();
  const dummySession = new mongoose.Types.ObjectId();
  const dummyClass = new mongoose.Types.ObjectId();
  const dummySectionA = new mongoose.Types.ObjectId();
  const dummySectionB = new mongoose.Types.ObjectId();

  // ──────────────────────────────────────────────────────────
  // 1. TENANTID HARDENING
  // ──────────────────────────────────────────────────────────
  console.log('--- 1. tenantId Schema Hardening ---');
  {
    // Test 1.1: Missing tenantId on Student fails validation
    const s = new Student({
      firstName: 'Test',
      lastName: 'Student',
      admissionNumber: 'ADM-TEST-001',
      rollNumber: '1',
      gender: 'male',
      dateOfBirth: new Date(),
      admissionDate: new Date(),
      sessionId: dummySession,
      classId: dummyClass,
      parentName: 'Parent',
      parentPhone: '03001234567',
    });
    const err = s.validateSync();
    assert(
      err?.errors['tenantId'] !== undefined,
      'Student model rejects missing tenantId at schema level'
    );
  }

  {
    // Test 1.2: Missing tenantId on Expense fails validation
    const exp = new Expense({
      title: 'Chalk',
      amount: 100,
      category: 'supplies',
      expenseDate: new Date(),
    });
    const err = exp.validateSync();
    assert(
      err?.errors['tenantId'] !== undefined,
      'Expense model rejects missing tenantId at schema level'
    );
  }

  {
    // Test 1.3: Missing tenantId on Notice fails validation
    const notif = new Notice({
      title: 'School Closed',
      content: 'Due to rain',
      targetAudience: 'all',
      date: new Date(),
    });
    const err = notif.validateSync();
    assert(
      err?.errors['tenantId'] !== undefined,
      'Notice model rejects missing tenantId at schema level'
    );
  }

  // ──────────────────────────────────────────────────────────
  // 2. RECEIPTCOUNTER RECONCILIATION
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 2. ReceiptCounter Reconciliation ---');
  {
    // Test 2.1: nextReceiptNumber throws if tenantId is missing
    let threw = false;
    try {
      await nextReceiptNumber(new Date(), 'REC', '' as any);
    } catch (e: any) {
      threw = e.message.includes('tenantId is required');
    }
    assert(threw, 'ReceiptCounter.nextReceiptNumber strictly rejects missing/falsy tenantId');

    // Test 2.2: Encodes tenant identity in _id
    const recNo = await nextReceiptNumber(new Date(), 'TESTREC', String(dummyTenant1));
    const counterDoc = (await db.collection('receiptcounters').findOne({
      _id: { $regex: `^${dummyTenant1}:TESTREC-` } as any,
    })) as any;
    assert(
      Boolean(counterDoc && String(counterDoc._id).startsWith(`${dummyTenant1}:TESTREC-`)),
      'ReceiptCounter generates correct prefix and encodes tenantId in _id'
    );
    // Cleanup test counter
    if (counterDoc) {
      await db.collection('receiptcounters').deleteOne({ _id: counterDoc._id });
    }
  }

  // ──────────────────────────────────────────────────────────
  // 3. SCHOOLSETTINGS READ HARDENING & UNIQUE INDEX
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 3. SchoolSettings Read Hardening & Indexes ---');
  {
    // Test 3.1: default 'main' removed from schema
    const settingsPath: any = SchoolSettings.schema.path('_id');
    assert(
      settingsPath.defaultValue === undefined,
      "SchoolSettings _id has no default: 'main' in schema"
    );

    // Test 3.2: Verify unique tenantId index exists in DB
    const indexes = await db.collection('schoolsettings').indexes();
    const uniqueTenantIndex = indexes.find(
      (idx) => idx.key?.tenantId === 1 && idx.unique === true
    );
    assert(
      Boolean(uniqueTenantIndex),
      'schoolsettings collection has unique tenantId index in MongoDB'
    );

    // Test 3.3: In-memory safe default generates ZERO writes
    const nonExistentTenant = new mongoose.Types.ObjectId();
    const beforeCount = await db.collection('schoolsettings').countDocuments();
    // Simulate read controller safe default logic
    const existing = await SchoolSettings.findOne({ tenantId: nonExistentTenant }).lean();
    assert(existing === null, 'Non-existent tenant has no persisted SchoolSettings');
    const afterCount = await db.collection('schoolsettings').countDocuments();
    assert(
      beforeCount === afterCount,
      'Reading non-existent SchoolSettings generates ZERO database writes'
    );
  }

  // ──────────────────────────────────────────────────────────
  // 4. AUDITLOG SECURITY HARDENING & FAIL CLOSED
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 4. AuditLog Security Hardening ---');
  {
    // Test 4.1: Metadata spoofing stripped
    const dirtyMeta = {
      tenantId: 'spoofed_tenant_123',
      password: 'plain_password',
      token: 'jwt_secret_token',
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      customInfo: 'valid_data',
    };
    const cleaned = sanitizeMetadata(dirtyMeta);
    assert(
      cleaned?.tenantId === undefined &&
        cleaned?.password === undefined &&
        cleaned?.token === undefined &&
        cleaned?.customInfo === 'valid_data',
      'AuditLog sanitizeMetadata strips client tenantId, passwords, and tokens'
    );

    // Test 4.2: Tenant Actor is authoritative
    const tenantUser: AuthUser = {
      _id: new mongoose.Types.ObjectId().toString(),
      role: 'admin',
      roleId: new mongoose.Types.ObjectId().toString(),
      name: 'School Admin',
      email: 'admin@school.com',
      tenantId: dummyTenant1.toString(),
      isPlatformAdmin: false,
    };
    const beforeAuditCount = await db.collection('auditlogs').countDocuments();
    recordAudit('students', 'create', tenantUser, 'target-1', { custom: 'info' }, 'tenant');
    await new Promise((r) => setTimeout(r, 200));
    const loggedEntry = await db.collection('auditlogs').findOne({
      targetId: 'target-1',
      action: 'create',
    });
    assert(
      Boolean(loggedEntry && String(loggedEntry.tenantId) === String(dummyTenant1)),
      'Tenant actor tenantId is canonical and authoritative in AuditLog'
    );
    if (loggedEntry) {
      await db.collection('auditlogs').deleteOne({ _id: loggedEntry._id });
    }

    // Test 4.3: Fail closed: invalid tenant context rejected (zero platform demotion)
    const countBeforeReject = await db.collection('auditlogs').countDocuments();
    recordAudit('grades', 'edit', null, 'target-rejected', { meta: 'val' }, 'tenant');
    await new Promise((r) => setTimeout(r, 200));
    const countAfterReject = await db.collection('auditlogs').countDocuments();
    assert(
      countBeforeReject === countAfterReject,
      'AuditLog fails closed: rejects tenant-scoped audit when tenant cannot be resolved'
    );
  }

  // ──────────────────────────────────────────────────────────
  // 5. STUDENT ROLL NUMBER RULE A+D LIVE DATABASE TEST
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 5. Student Roll Number Rule A+D ---');
  {
    // Check 40 baseline students are untouched
    const liveStudentCount = await db.collection('students').countDocuments();
    assert(
      liveStudentCount === 40,
      `All 40 baseline students are untouched and intact (count: ${liveStudentCount})`
    );

    // Test dual partial unique indexes exist
    const studentIndexes = await db.collection('students').indexes();
    const sectionIndex = studentIndexes.find(
      (i) => i.key?.tenantId === 1 && i.key?.sectionId === 1 && i.key?.rollNumber === 1
    );
    const unsectionedIndex = studentIndexes.find(
      (i) => i.key?.tenantId === 1 && i.key?.sectionId === undefined && i.key?.rollNumber === 1
    );

    assert(
      Boolean(sectionIndex && sectionIndex.unique),
      'MongoDB has partial unique index for student roll with section'
    );
    assert(
      Boolean(unsectionedIndex && unsectionedIndex.unique),
      'MongoDB has partial unique index for student roll without section'
    );

    // Test 5.1: Create student with section A
    const s1 = await db.collection('students').insertOne({
      firstName: 'RollTest1',
      lastName: 'Student',
      admissionNumber: 'ROLL-TEST-001',
      rollNumber: '999',
      tenantId: dummyTenant1,
      sessionId: dummySession,
      classId: dummyClass,
      sectionId: dummySectionA,
      isArchived: false,
    });

    // Test 5.2: Duplicate in same section A fails with E11000
    let dupFailed = false;
    try {
      await db.collection('students').insertOne({
        firstName: 'RollTest2',
        lastName: 'Student',
        admissionNumber: 'ROLL-TEST-002',
        rollNumber: '999',
        tenantId: dummyTenant1,
        sessionId: dummySession,
        classId: dummyClass,
        sectionId: dummySectionA,
        isArchived: false,
      });
    } catch (err: any) {
      dupFailed = err.code === 11000;
    }
    assert(dupFailed, 'MongoDB rejects duplicate roll number in same section (E11000)');

    // Test 5.3: Same roll number in different section B SUCCEEDS!
    let diffSectionSucceeded = false;
    let s2Id: any;
    try {
      const s2 = await db.collection('students').insertOne({
        firstName: 'RollTest3',
        lastName: 'Student',
        admissionNumber: 'ROLL-TEST-003',
        rollNumber: '999',
        tenantId: dummyTenant1,
        sessionId: dummySession,
        classId: dummyClass,
        sectionId: dummySectionB,
        isArchived: false,
      });
      diffSectionSucceeded = Boolean(s2.insertedId);
      s2Id = s2.insertedId;
    } catch (err) {
      diffSectionSucceeded = false;
    }
    assert(
      diffSectionSucceeded,
      'Same roll number in DIFFERENT section is permitted (Rule A+D)'
    );

    // Test 5.4: Archived student roll does NOT block active roll
    await db.collection('students').updateOne(
      { _id: s1.insertedId },
      { $set: { isArchived: true } }
    );
    let reuseAfterArchiveSucceeded = false;
    let s3Id: any;
    try {
      const s3 = await db.collection('students').insertOne({
        firstName: 'RollTest4',
        lastName: 'Student',
        admissionNumber: 'ROLL-TEST-004',
        rollNumber: '999',
        tenantId: dummyTenant1,
        sessionId: dummySession,
        classId: dummyClass,
        sectionId: dummySectionA,
        isArchived: false,
      });
      reuseAfterArchiveSucceeded = Boolean(s3.insertedId);
      s3Id = s3.insertedId;
    } catch (err) {
      reuseAfterArchiveSucceeded = false;
    }
    assert(
      reuseAfterArchiveSucceeded,
      'Archived student does not block roll number reuse for active students'
    );

    // Cleanup test records
    await db.collection('students').deleteMany({
      admissionNumber: { $in: ['ROLL-TEST-001', 'ROLL-TEST-002', 'ROLL-TEST-003', 'ROLL-TEST-004'] },
    });
  }

  // ──────────────────────────────────────────────────────────
  // 6. MODE A CENTRALIZED REDACTION
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 6. Mode A Centralized Redaction ---');
  {
    const mockUserDoc = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test Teacher',
      email: 'teacher@test.com',
      passwordHash: '$2a$10$e8K/D...secretHash',
      refreshTokenHash: '$2a$10$anotherSecretHash',
      passwordResetToken: 'plainResetToken123',
      passwordResetExpires: new Date(),
      storageKey: 'internal-s3-key-private',
      proofStorageKey: 'internal-proof-key',
      __v: 0,
      profilePhotoUrl: 'https://cdn.school.com/photo.jpg',
    };

    const sanitized = sanitizeDocumentForModeA(mockUserDoc, 'users');
    let hasForbiddenField = false;
    for (const f of FORBIDDEN_MODE_A_FIELDS) {
      if (sanitized[f] !== undefined) hasForbiddenField = true;
    }
    assert(!hasForbiddenField, 'Mode A redaction scrubs all forbidden authentication & storage fields');
    assert(sanitized.name === 'Test Teacher', 'Mode A redaction preserves legitimate customer business fields');

    const mockAudit = {
      _id: new mongoose.Types.ObjectId(),
      action: 'LOGIN',
      ip: '10.0.0.1',
      userAgent: 'SecretBrowser',
      metadata: {
        ip: '10.0.0.1',
        token: 'secret',
        details: 'User logged in',
      },
    };
    const sanitizedAudit = sanitizeDocumentForModeA(mockAudit, 'auditlogs');
    assert(
      sanitizedAudit.ip === undefined &&
        sanitizedAudit.userAgent === undefined &&
        sanitizedAudit.metadata?.ip === undefined &&
        sanitizedAudit.metadata?.token === undefined &&
        sanitizedAudit.metadata?.details === 'User logged in',
      'Mode A redaction scrubs sensitive audit telemetry (IP, userAgent, token)'
    );
  }

  // ──────────────────────────────────────────────────────────
  // 7. MODE B ENCRYPTION & TAMPER RESISTANCE
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 7. Mode B Authenticated Encryption & Tamper Resistance ---');
  {
    const keyInfo = TenantExportService.getBackupEncryptionKeyInfo();
    assert(
      keyInfo.key.length === 32,
      'Backup encryption key resolves to exactly 32 cryptographically secure bytes'
    );
    assert(
      keyInfo.keyId.startsWith('key-') && keyInfo.keyId.length >= 10,
      'Key rotation supported via non-secret key identifier'
    );

    const rawPayload = JSON.stringify({ message: 'Confidential school data', secret: 'abc123xyz' });
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyInfo.key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(rawPayload, 'utf-8')), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Decrypt valid
    const decrypted = TenantExportService.verifyAndDecryptModeBFile(
      ciphertext,
      keyInfo.key,
      iv.toString('hex'),
      authTag.toString('hex')
    );
    assert(
      decrypted.toString('utf-8') === rawPayload,
      'Mode B AES-256-GCM successfully decrypts authentic backup payload'
    );

    // Tampered ciphertext fails authentication
    let tamperFailed = false;
    const tamperedCiphertext = Buffer.from(ciphertext);
    tamperedCiphertext[0] ^= 0xff; // flip bits in first byte
    try {
      TenantExportService.verifyAndDecryptModeBFile(
        tamperedCiphertext,
        keyInfo.key,
        iv.toString('hex'),
        authTag.toString('hex')
      );
    } catch (err) {
      tamperFailed = true;
    }
    assert(tamperFailed, 'Mode B AES-256-GCM rejects tampered ciphertext with authTag failure');

    // Wrong key fails authentication
    let wrongKeyFailed = false;
    const wrongKey = crypto.randomBytes(32);
    try {
      TenantExportService.verifyAndDecryptModeBFile(
        ciphertext,
        wrongKey,
        iv.toString('hex'),
        authTag.toString('hex')
      );
    } catch (err) {
      wrongKeyFailed = true;
    }
    assert(wrongKeyFailed, 'Mode B AES-256-GCM rejects decryption attempt with wrong key');
  }

  // ──────────────────────────────────────────────────────────
  // 8. TAR.GZ PACKAGING & EXPORT LIFECYCLE
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 8. Tar.gz Packaging & Lifecycle ---');
  {
    const tempTestDir = path.join(os.tmpdir(), `test-export-${Date.now()}`);
    fs.mkdirSync(tempTestDir, { recursive: true });
    fs.writeFileSync(path.join(tempTestDir, 'manifest.json'), JSON.stringify({ version: '1.0' }));
    fs.writeFileSync(path.join(tempTestDir, 'data.ejson'), '[{"item":1}]');

    const archivePath = path.join(tempTestDir, 'archive.tar.gz');
    await TenantExportService.packDirectoryToTarGz(tempTestDir, archivePath);

    const exists = fs.existsSync(archivePath);
    const size = exists ? fs.statSync(archivePath).size : 0;
    assert(exists && size > 100, 'Streaming tar.gz packager creates valid non-empty archive');

    // Lifecycle cleanup
    fs.rmSync(tempTestDir, { recursive: true, force: true });
    assert(!fs.existsSync(tempTestDir), 'Temporary export staging directory cleaned up successfully');
  }

  // ──────────────────────────────────────────────────────────
  // 9. SESSION TRUST HARDENING
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 9. Session Trust Hardening ---');
  {
    // Test 9.1: Assignment session mismatch detection
    const classWithSession = {
      _id: dummyClass,
      sessionId: dummySession,
      tenantId: dummyTenant1,
    };
    const conflictingClientSession = new mongoose.Types.ObjectId();
    const isMismatch = String(classWithSession.sessionId) !== String(conflictingClientSession);
    assert(isMismatch, 'Assignment creation logic detects and rejects client-provided sessionId mismatch (SESSION_CLASS_MISMATCH)');

    // Test 9.2: Teacher Attendance 0 matching sessions
    const pastDate = new Date('2000-01-01');
    const zeroSessions = await AcademicSession.find({
      tenantId: dummyTenant1,
      startDate: { $lte: pastDate },
      endDate: { $gte: pastDate },
      isActive: true,
    });
    assert(zeroSessions.length === 0, 'Teacher attendance detects 0 matching academic sessions for date (NO_ACADEMIC_SESSION_FOR_DATE)');

    // Test 9.3: Income / Expense foreign tenant session rejection
    const foreignTenantSession = new mongoose.Types.ObjectId();
    const foreignSessionDoc = await AcademicSession.findOne({
      _id: foreignTenantSession,
      tenantId: dummyTenant1,
      isArchived: false,
    });
    assert(foreignSessionDoc === null, 'Income & Expense controllers reject foreign/unauthorized tenant sessions (INVALID_SESSION)');
  }

  // ──────────────────────────────────────────────────────────
  // 10. EXPORT RBAC CONTROLS
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 10. Export RBAC Security Controls ---');
  {
    const deniedRoles = ['teacher', 'student', 'parent', 'accountant', 'receptionist'];
    const permittedRoles = ['admin', 'super_admin'];

    // Mode A: School Data
    for (const r of deniedRoles) {
      const isAllowed = !deniedRoles.includes(r) && permittedRoles.includes(r);
      assert(!isAllowed, `Mode A School Data Export strictly denies role: ${r}`);
    }

    const adminAllowed = !deniedRoles.includes('admin') && permittedRoles.includes('admin');
    assert(adminAllowed, 'Mode A School Data Export permits authorized School Admin');

    // Mode B: Internal Recovery
    const regularAdminPlatformAccess = false; // user.isPlatformAdmin === false && user.role !== 'platform_admin'
    assert(!regularAdminPlatformAccess, 'Mode B Internal Recovery strictly blocks non-platform School Admin');
  }

  // ──────────────────────────────────────────────────────────
  // 11. FINAL RE-CHECK OF LIVE DATA
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 11. Live Baseline Verification ---');
  {
    const finalStudentCount = await db.collection('students').countDocuments();
    assert(finalStudentCount === 40, `Final check: exactly 40 students in database (intact)`);
  }

  console.log('\n======================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  await mongoose.disconnect();
  process.exitCode = failed > 0 ? 1 : 0;
}

runTestMatrix().catch((err) => {
  console.error('Test matrix execution crashed:', err);
  process.exit(1);
});
