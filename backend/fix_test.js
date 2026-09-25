const fs = require('fs');
const content = fs.readFileSync('tests/invariant.test.ts', 'utf-8');

const updated = content.replace(
  "await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sms-test-invariant');",
  const dbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/sms-test-invariant';
  if (!dbUri.includes('test')) {
    throw new Error('REFUSING TO RUN DESTRUCTIVE TEST OUTSIDE TEST DATABASE');
  }
  await mongoose.connect(dbUri);
).replace(
  "await Exam.deleteMany({});\n  await Result.deleteMany({});",
  "await Exam.deleteMany({ tenantId });\n  await Result.deleteMany({ tenantId });"
);

fs.writeFileSync('tests/invariant.test.ts', updated);
