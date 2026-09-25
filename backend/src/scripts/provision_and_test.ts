import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getTenantConnection } from '../services/TenantConnectionManager';
import { getTenantModels } from '../services/TenantModelRegistry';
import { TenantProvisioningService } from '../services/TenantProvisioningService';
import { hashPassword } from '../utils/security';

dotenv.config();

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolsghar');
    const masterDb = mongoose.connection.useDb('schoolsghar_master');
    const TenantModel = masterDb.collection('tenants');

    let bkm = await TenantModel.findOne({ slug: 'bkm' });
    if (!bkm) {
      console.log("BKM tenant not found, creating dummy.");
      bkm = {
        _id: new mongoose.Types.ObjectId(),
        name: 'BKM School',
        slug: 'bkm',
        ownerUserId: new mongoose.Types.ObjectId(),
        status: 'active'
      };
      await TenantModel.insertOne(bkm);
    }

    // Set new DB name and provision
    const dbName = `school_bkm_${Date.now()}`;
    await TenantModel.updateOne({ _id: bkm._id }, {
      $set: {
        databaseName: dbName,
        isDatabaseProvisioned: false
      }
    });

    bkm.databaseName = dbName;
    bkm.isDatabaseProvisioned = false;

    console.log(`Provisioning BKM dedicated DB: ${dbName}...`);
    const passwordHash = await hashPassword('password123');
    await TenantProvisioningService.provisionTenant(
      bkm as any,
      'BKM Admin',
      'admin@bkm.com',
      passwordHash
    );

    // After provisioning, update to true
    await TenantModel.updateOne({ _id: bkm._id }, {
      $set: { isDatabaseProvisioned: true }
    });

    console.log("BKM successfully provisioned.");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
