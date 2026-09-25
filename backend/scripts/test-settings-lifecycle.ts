import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { updateSettingsSchema } from '../src/validators/settings.validators';
import { SchoolSettings } from '../src/models/SchoolSettings';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  console.log('Connected to DB');

  // 1. Zod parsing
  const payload = {
    phone: '03001234567',
    website: 'https://example.com',
    schoolLogoUrl: 'https://example.com/logo.png',
  };
  
  console.log('1. Raw Payload:', payload);
  const parsed = updateSettingsSchema.parse(payload);
  console.log('2. Zod Parsed Payload:', parsed);

  // 2. Controller Assignment
  const tenantId = new mongoose.Types.ObjectId('000000000000000000000000'); // Dummy tenant
  let doc = await SchoolSettings.findOne({ tenantId });
  if (!doc) {
    doc = new SchoolSettings({
      _id: String(tenantId),
      tenantId,
      schoolName: 'Test School',
    });
  }

  const scalars = ['schoolName', 'schoolLogoUrl', 'address', 'phone', 'email', 'website', 'principalName', 'currency', 'receiptPrefix'] as const;
  for (const key of scalars) {
    if (parsed[key] !== undefined) (doc as any)[key] = parsed[key];
  }
  
  console.log('3. Document Before Save:', { phone: doc.phone, website: doc.website, logo: doc.schoolLogoUrl });
  
  await doc.save();
  console.log('4. Document Saved.');

  // 3. Read again
  const savedDoc = await SchoolSettings.findOne({ tenantId });
  console.log('5. Fetched Document from DB:', { phone: savedDoc?.phone, website: savedDoc?.website, logo: savedDoc?.schoolLogoUrl });
  
  // 4. Map for GET Response
  const mapped = {
    phone: savedDoc?.phone ?? null,
    website: savedDoc?.website ?? null,
    schoolLogoUrl: savedDoc?.schoolLogoUrl ?? null,
  };
  console.log('6. Mapped GET Response:', mapped);

  await mongoose.disconnect();
}

run().catch(console.error);
