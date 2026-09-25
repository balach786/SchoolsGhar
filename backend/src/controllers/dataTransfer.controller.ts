import { Response } from 'express';
import { AuthRequest } from '../types';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { ExportService } from '../services/dataTransfer/export.service';
import { ImportService } from '../services/dataTransfer/import.service';
import { buildErrorSheetWorkbook } from '../services/dataTransfer/spreadsheet.utils';
import { TenantExportService } from '../services/dataTransfer/TenantExportService';
import { getTenantModels } from '../services/TenantModelRegistry';
import { recordAudit } from '../services/audit.service';
import { logger } from '../utils/logger';

export class DataTransferController {
  /**
   * Download a blank import template (.xlsx or .csv) with instructions.
   */
  static async downloadTemplate(req: AuthRequest, res: Response) {
    try {
      const { module } = req.params;
      const format = (req.query.format as 'xlsx' | 'csv') || 'xlsx';
      const tenantId = (req as any).user?.tenantId;
      const classId = req.query.classId as string | undefined;
      const className = req.query.className as string | undefined;
      const sectionName = req.query.sectionName as string | undefined;

      const { buffer, fileName } = await ImportService.generateTemplate(module, format, tenantId, {
        classId,
        className,
        sectionName,
      });

      const mimeType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(buffer);
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message || 'Failed to generate template' });
    }
  }

  /**
   * Export filtered data on demand.
   */
  static async exportData(req: AuthRequest, res: Response) {
    try {
      const tenantId = (req as any).user?.tenantId;
      const userId = (req as any).user?._id;
      const { module } = req.params;
      const format = (req.query.format as 'xlsx' | 'csv') || 'xlsx';

      if (!tenantId) {
        return res.status(403).json({ success: false, message: 'Tenant context required' });
      }

      let exportResult;

      switch (module) {
        case 'students':
          exportResult = await ExportService.exportStudents(
            req.tenantDb,
            tenantId,
            {
              sessionId: req.query.sessionId as string,
              classId: req.query.classId as string,
              sectionId: req.query.sectionId as string,
              status: req.query.status as any,
              gender: req.query.gender as any,
              admissionDateFrom: req.query.admissionDateFrom as string,
              admissionDateTo: req.query.admissionDateTo as string,
            },
            format
          );
          break;

        case 'staff':
          exportResult = await ExportService.exportStaff(
            req.tenantDb,
            tenantId,
            {
              role: req.query.role as string,
              status: req.query.status as any,
            },
            format
          );
          break;

        case 'fees':
          exportResult = await ExportService.exportMonthlyFees(
            req.tenantDb,
            tenantId,
            {
              sessionId: req.query.sessionId as string,
              month: req.query.month ? Number(req.query.month) : undefined,
              classId: req.query.classId as string,
              sectionId: req.query.sectionId as string,
              status: req.query.status as any,
            },
            format
          );
          break;

        case 'examFees':
          exportResult = await ExportService.exportExamFees(
            req.tenantDb,
            tenantId,
            {
              examId: req.query.examId as string,
              classId: req.query.classId as string,
              status: req.query.status as any,
            },
            format
          );
          break;

        case 'marks':
          exportResult = await ExportService.exportMarksEntrySheet(
            req.tenantDb,
            tenantId,
            {
              examId: req.query.examId as string,
              classId: req.query.classId as string,
              sectionId: req.query.sectionId as string,
              subjectId: req.query.subjectId as string,
            },
            format
          );
          break;

        case 'results':
          exportResult = await ExportService.exportResults(
            req.tenantDb,
            tenantId,
            {
              examId: req.query.examId as string,
              classId: req.query.classId as string,
              sectionId: req.query.sectionId as string,
            },
            format
          );
          break;

        case 'attendance':
          exportResult = await ExportService.exportAttendance(
            req.tenantDb,
            tenantId,
            {
              startDate: req.query.startDate as string,
              endDate: req.query.endDate as string,
              classId: req.query.classId as string,
              sectionId: req.query.sectionId as string,
              status: req.query.status as string,
            },
            format
          );
          break;

        case 'academic':
          exportResult = await ExportService.exportAcademicSetup(req.tenantDb, tenantId, format);
          break;

        default:
          return res.status(400).json({ success: false, message: `Unsupported export module: ${module}` });
      }

      // Log compact export history (no file binary stored)
      const { DataHistory } = getTenantModels(req.tenantDb as mongoose.Connection);
      await DataHistory.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        type: 'export',
        module: module as any,
        format,
        fileName: exportResult.fileName,
        recordCount: exportResult.recordCount,
        status: 'completed',
        filtersSummary: exportResult.filtersSummary,
        performedBy: new mongoose.Types.ObjectId(userId),
      });

      const mimeType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.fileName}"`);
      return res.send(exportResult.buffer);
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message || 'Export failed' });
    }
  }

  /**
   * Preview and validate spreadsheet rows (READ-ONLY).
   */
  static async previewImport(req: AuthRequest, res: Response) {
    try {
      const tenantId = (req as any).user?.tenantId;
      const { module } = req.params;
      const file = req.file;

      if (!tenantId) return res.status(403).json({ success: false, message: 'Tenant context required' });
      if (!file) return res.status(400).json({ success: false, message: 'Please upload an .xlsx or .csv file' });

      const skipDuplicates = req.body.skipDuplicates === 'true' || req.body.skipDuplicates === true;

      const preview = await ImportService.previewImport(
        (req as any).tenantDb as mongoose.Connection,
        tenantId,
        module,
        file.buffer,
        file.originalname,
        { skipDuplicates }
      );

      return res.json({ success: true, data: preview });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message || 'Import preview failed' });
    }
  }

  /**
   * Confirm and commit valid rows to the database.
   */
  static async confirmImport(req: AuthRequest, res: Response) {
    try {
      const tenantId = (req as any).user?.tenantId;
      const userId = (req as any).user?._id;
      const { module } = req.params;
      const file = req.file;

      if (!tenantId) return res.status(403).json({ success: false, message: 'Tenant context required' });
      if (!file) return res.status(400).json({ success: false, message: 'Please provide the file to import' });

      const skipDuplicates = req.body.skipDuplicates === 'true' || req.body.skipDuplicates === true;
      const examId = req.body.examId as string;
      const subjectId = req.body.subjectId as string;

      const result = await ImportService.executeImport(
        (req as any).tenantDb as mongoose.Connection,
        tenantId,
        userId,
        module,
        file.buffer,
        file.originalname,
        { skipDuplicates, examId, subjectId }
      );

      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message || 'Import execution failed' });
    }
  }

  /**
   * Generate downloadable error sheet for rejected rows.
   */
  static async downloadErrorSheet(req: AuthRequest, res: Response) {
    try {
      const { errors, format = 'xlsx' } = req.body;
      if (!Array.isArray(errors) || errors.length === 0) {
        return res.status(400).json({ success: false, message: 'No errors to generate report for' });
      }

      const buffer = await buildErrorSheetWorkbook(errors, format);
      const fileName = `Import_Errors_${new Date().toISOString().slice(0, 10)}.${format}`;

      const mimeType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(buffer);
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message || 'Failed to build error sheet' });
    }
  }

  /**
   * Get transfer history (imports and exports) for current tenant.
   */
  static async getHistory(req: AuthRequest, res: Response) {
    try {
      const tenantId = (req as any).user?.tenantId;
      if (!tenantId) return res.status(403).json({ success: false, message: 'Tenant context required' });

      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const type = req.query.type as string;

      const query: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };
      if (type === 'import' || type === 'export') query.type = type;

      const tenantDb = (req as any).tenantDb as mongoose.Connection;
      if (!tenantDb) {
        throw new Error('Tenant database connection missing');
      }
      const { DataHistory } = getTenantModels(tenantDb);

      const [total, records] = await Promise.all([
        DataHistory.countDocuments(query),
        DataHistory.find(query)
          .populate('performedBy', 'name email role')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
      ]);

      return res.json({
        success: true,
        data: {
          records,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message || 'Failed to load history' });
    }
  }

  /**
   * List saved export presets.
   */
  static async getPresets(req: AuthRequest, res: Response) {
    try {
      const tenantId = (req as any).user?.tenantId;
      if (!tenantId) return res.status(403).json({ success: false, message: 'Tenant context required' });

      const tenantDb = (req as any).tenantDb as mongoose.Connection;
      if (!tenantDb) {
        throw new Error('Tenant database connection missing');
      }
      const { ExportPreset } = getTenantModels(tenantDb);

      const presets = await ExportPreset.find({ tenantId }).sort({ createdAt: -1 }).lean();
      return res.json({ success: true, data: presets });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message || 'Failed to load presets' });
    }
  }

  /**
   * Save an export preset.
   */
  static async savePreset(req: AuthRequest, res: Response) {
    try {
      const tenantId = (req as any).user?.tenantId;
      const userId = (req as any).user?._id;
      const { name, module, format = 'xlsx', filters = {} } = req.body;

      if (!name || !module) {
        return res.status(400).json({ success: false, message: 'Preset name and module are required' });
      }

      const tenantDb = (req as any).tenantDb as mongoose.Connection;
      if (!tenantDb) {
        throw new Error('Tenant database connection missing');
      }
      const { ExportPreset } = getTenantModels(tenantDb);

      const preset = await ExportPreset.findOneAndUpdate(
        { tenantId, name },
        {
          tenantId,
          name,
          module,
          format,
          filters,
          createdBy: userId,
        },
        { upsert: true, new: true }
      );

      return res.json({ success: true, data: preset });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message || 'Failed to save preset' });
    }
  }

  /**
   * Delete an export preset.
   */
  static async deletePreset(req: AuthRequest, res: Response) {
    try {
      const tenantId = (req as any).user?.tenantId;
      const { id } = req.params;

      const tenantDb = (req as any).tenantDb as mongoose.Connection;
      if (!tenantDb) {
        throw new Error('Tenant database connection missing');
      }
      const { ExportPreset } = getTenantModels(tenantDb);

      await ExportPreset.findOneAndDelete({ _id: id, tenantId });
      return res.json({ success: true, message: 'Preset deleted' });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message || 'Failed to delete preset' });
    }
  }

  /**
   * Mode A: Customer-facing School Data Export (.tar.gz)
   * RBAC: Authorized School Admin / Principal or Platform Super Admin.
   * Denied by default: Teacher, Student, Parent, Accountant, Receptionist.
   */
  static async exportTenantSchoolData(req: AuthRequest, res: Response) {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Explicit RBAC check: deny non-admin roles by default
    const deniedRoles = ['teacher', 'student', 'parent', 'accountant', 'receptionist'];
    if (!user.isPlatformAdmin && (deniedRoles.includes(user.role) || !['super_admin', 'admin'].includes(user.role))) {
      return res.status(403).json({ success: false, message: 'Export access denied for this role', code: 'EXPORT_ACCESS_DENIED' });
    }

    let targetTenantId: string | undefined = user.tenantId;
    if (user.isPlatformAdmin && req.query.tenantId) {
      targetTenantId = String(req.query.tenantId);
    }

    if (!targetTenantId) {
      return res.status(400).json({ success: false, message: 'Tenant context required' });
    }

    const exportId = crypto.randomUUID();
    const tempExportDir = path.join(os.tmpdir(), 'sms-school-exports', exportId);

    const cleanup = () => {
      try {
        if (fs.existsSync(tempExportDir)) {
          fs.rmSync(tempExportDir, { recursive: true, force: true });
        }
      } catch (e) {
        logger.warn(`Failed to cleanup temp export dir ${tempExportDir}:`, e);
      }
    };

    try {
      const tenantObjId = new mongoose.Types.ObjectId(targetTenantId);
      const manifest = await TenantExportService.exportTenant(tenantObjId, 'school_data', tempExportDir, {
        sessionId: req.query.sessionId as string,
        classId: req.query.classId as string,
        sectionId: req.query.sectionId as string,
      });

      const archiveFileName = `school-data-${targetTenantId}-${Date.now()}.tar.gz`;
      const archivePath = path.join(tempExportDir, archiveFileName);
      await TenantExportService.packDirectoryToTarGz(tempExportDir, archivePath);

      recordAudit(
        'dataManagement',
        'export',
        user,
        exportId,
        {
          mode: 'SCHOOL_DATA_EXPORT',
          exportId,
          documentCount: manifest.totalExportedDocuments,
          status: 'completed',
        },
        'tenant',
        user.isPlatformAdmin ? targetTenantId : undefined
      );

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${archiveFileName}"`);

      res.on('finish', cleanup);
      res.on('close', cleanup);

      const readStream = fs.createReadStream(archivePath);
      readStream.on('error', (err) => {
        cleanup();
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Failed to stream export archive' });
        }
      });
      return readStream.pipe(res);
    } catch (err: any) {
      cleanup();
      recordAudit(
        'dataManagement',
        'export',
        user,
        exportId,
        {
          mode: 'SCHOOL_DATA_EXPORT',
          exportId,
          status: 'failed',
          error: err.message,
        },
        user.tenantId ? 'tenant' : 'platform',
        user.isPlatformAdmin ? targetTenantId : undefined
      );
      return res.status(500).json({ success: false, message: err.message || 'School data export failed' });
    }
  }

  /**
   * Mode B: Authenticated Encrypted Disaster Recovery Backup (.tar.gz)
   * RBAC: Platform Super Admin ONLY.
   */
  static async exportTenantInternalRecovery(req: AuthRequest, res: Response) {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!user.isPlatformAdmin && user.role !== 'platform_admin') {
      return res.status(403).json({
        success: false,
        message: 'Internal recovery backup requires Platform Super Admin privileges',
        code: 'PLATFORM_ADMIN_REQUIRED',
      });
    }

    const targetTenantId = req.query.tenantId as string;
    if (!targetTenantId) {
      return res.status(400).json({ success: false, message: 'Target tenantId parameter required' });
    }

    const exportId = crypto.randomUUID();
    const tempExportDir = path.join(os.tmpdir(), 'sms-recovery-backups', exportId);

    const cleanup = () => {
      try {
        if (fs.existsSync(tempExportDir)) {
          fs.rmSync(tempExportDir, { recursive: true, force: true });
        }
      } catch (e) {
        logger.warn(`Failed to cleanup temp export dir ${tempExportDir}:`, e);
      }
    };

    try {
      const tenantObjId = new mongoose.Types.ObjectId(targetTenantId);
      const manifest = await TenantExportService.exportTenant(tenantObjId, 'internal_recovery', tempExportDir, {
        sessionId: req.query.sessionId as string,
        classId: req.query.classId as string,
        sectionId: req.query.sectionId as string,
      });

      const archiveFileName = `internal-recovery-${targetTenantId}-${Date.now()}.tar.gz`;
      const archivePath = path.join(tempExportDir, archiveFileName);
      await TenantExportService.packDirectoryToTarGz(tempExportDir, archivePath);

      recordAudit(
        'dataManagement',
        'export',
        user,
        exportId,
        {
          mode: 'INTERNAL_TENANT_RECOVERY_BACKUP',
          exportId,
          documentCount: manifest.totalExportedDocuments,
          status: 'completed',
        },
        'tenant',
        targetTenantId
      );

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${archiveFileName}"`);

      res.on('finish', cleanup);
      res.on('close', cleanup);

      const readStream = fs.createReadStream(archivePath);
      readStream.on('error', (err) => {
        cleanup();
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Failed to stream recovery archive' });
        }
      });
      return readStream.pipe(res);
    } catch (err: any) {
      cleanup();
      recordAudit(
        'dataManagement',
        'export',
        user,
        exportId,
        {
          mode: 'INTERNAL_TENANT_RECOVERY_BACKUP',
          exportId,
          status: 'failed',
          error: err.message,
        },
        'platform'
      );
      return res.status(500).json({ success: false, message: err.message || 'Internal recovery export failed' });
    }
  }
}

