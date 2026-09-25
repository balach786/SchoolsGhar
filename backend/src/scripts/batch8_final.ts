import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { getTenantModels } from '../services/TenantModelRegistry';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runTest() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  console.log('=== BATCH 8 ISOLATION PROOF ===');

  const tenantDb1 = mongoose.connection.useDb('tenant_database_re_1');
  const tenantDb2 = mongoose.connection.useDb('tenant_database_re_2');

  const models1 = getTenantModels(tenantDb1);
  const models2 = getTenantModels(tenantDb2);

  // 1. Create a Notice in Tenant 1
  const notice1 = await models1.Notice.create({
    tenantId: new mongoose.Types.ObjectId(),
    title: 'Tenant 1 Notice',
    content: 'T1',
    audienceType: 'all',
    status: 'published',
    createdBy: new mongoose.Types.ObjectId()
  });
  console.log(`Notice created in Tenant 1: ${notice1._id}`);

  // 2. Query Tenant 2 Notice Collection
  const t2Notices = await models2.Notice.find({ _id: notice1._id });
  console.log(`Notice found in Tenant 2? ${t2Notices.length > 0}`);

  // 3. Check Notification creation
  const notification1 = await models1.Notification.create({
    tenantId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    title: 'T1 Notification',
    message: 'T1',
    type: 'notice'
  });
  console.log(`Notification created in Tenant 1: ${notification1._id}`);
  const t2Notifications = await models2.Notification.find({ _id: notification1._id });
  console.log(`Notification found in Tenant 2? ${t2Notifications.length > 0}`);

  // 4. Check AuditLog creation
  const audit1 = await models1.AuditLog.create({
    tenantId: new mongoose.Types.ObjectId(),
    module: 'notices',
    action: 'NOTICE_CREATED',
    scope: 'tenant'
  });
  console.log(`AuditLog created in Tenant 1: ${audit1._id}`);
  const t2Audits = await models2.AuditLog.find({ _id: audit1._id });
  console.log(`AuditLog found in Tenant 2? ${t2Audits.length > 0}`);

  console.log('=== VERIFICATION COMPLETE ===');
  process.exit(0);
}

runTest().catch(console.error);
