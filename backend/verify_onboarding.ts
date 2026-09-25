import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("No MONGODB_URI");
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    if (!db) {
        throw new Error("No DB");
    }

    const collections = await db.listCollections().toArray();
    console.log("=== COLLECTIONS ===");
    const counts: Record<string, number> = {};
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      counts[col.name] = count;
      if (count > 0) {
        console.log(`- ${col.name}: ${count} documents`);
      }
    }

    console.log("\n=== TENANT (SCHOOL) ===");
    const tenants = await db.collection('tenants').find({}).toArray();
    console.log(`Found ${tenants.length} tenant(s).`);
    let tenantId = null;
    if (tenants.length > 0) {
      tenantId = tenants[0]._id;
      console.log(`Tenant Name: ${tenants[0].name}`);
      console.log(`Tenant ID: ${tenantId}`);
      console.log(`Tenant Onboarding Status: ${tenants[0].status}`);
    }

    console.log("\n=== USERS (PRIMARY ADMIN) ===");
    const users = await db.collection('users').find({}).toArray();
    console.log(`Found ${users.length} user(s).`);
    let roleId = null;
    if (users.length > 0) {
      console.log(`User Name: ${users[0].name}`);
      console.log(`User Email: ${users[0].email}`);
      console.log(`User Tenant ID: ${users[0].tenantId}`);
      console.log(`Linked to correct tenant? ${String(users[0].tenantId) === String(tenantId)}`);
      roleId = users[0].roleId;
    }

    console.log("\n=== ROLES & PERMISSIONS ===");
    const roles = await db.collection('roles').find({}).toArray();
    console.log(`Found ${roles.length} role(s) total.`);
    if (roleId) {
      const userRole = roles.find(r => String(r._id) === String(roleId));
      if (userRole) {
        console.log(`Admin Role Slug: ${userRole.slug}`);
        console.log(`Admin Role belongs to tenant? ${String(userRole.tenantId) === String(tenantId)}`);
        console.log(`Admin Permissions count: ${userRole.permissions ? userRole.permissions.length : 0} modules`);
      }
    }

    console.log("\n=== SCHOOL SETTINGS ===");
    const settings = await db.collection('schoolsettings').find({}).toArray();
    console.log(`Found ${settings.length} settings document(s).`);
    if (settings.length > 0) {
       console.log(`Settings Tenant ID matches? ${String(settings[0].tenantId) === String(tenantId)}`);
    }

    console.log("\n=== SUBSCRIPTIONS ===");
    const subscriptions = await db.collection('subscriptions').find({}).toArray();
    console.log(`Found ${subscriptions.length} subscription(s).`);
    if (subscriptions.length > 0) {
       console.log(`Subscription Tenant ID matches? ${String(subscriptions[0].tenantId) === String(tenantId)}`);
       console.log(`Subscription Status: ${subscriptions[0].status}`);
       console.log(`Subscription Plan: ${subscriptions[0].planType}`);
    }

    console.log("\n=== COUNTERS (SEQUENCE GENERATION) ===");
    const counters = await db.collection('counters').find({}).toArray();
    console.log(`Found ${counters.length} counter(s).`);

    console.log("\n=== ACADEMIC SESSIONS ===");
    const sessions = await db.collection('academicsessions').find({}).toArray();
    console.log(`Found ${sessions.length} session(s).`);

    console.log("\n=== DUMMY DATA CHECK ===");
    const students = counts['students'] || 0;
    const classes = counts['classes'] || 0;
    const staff = counts['staff'] || 0;
    console.log(`Students: ${students}`);
    console.log(`Classes: ${classes}`);
    console.log(`Staff: ${staff}`);

    process.exit(0);
  } catch(e: any) {
    console.error('ERROR', e.message);
    process.exit(1);
  }
}
run();
