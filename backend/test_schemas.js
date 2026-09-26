const { createFeeStructureSchema, updateFeeStructureSchema } = require('./build/validators/finance.validators.js');
const mongoose = require('mongoose');

function testSchemas() {
  console.log("Testing POST validation:");
  const postResult = createFeeStructureSchema.safeParse({
    sessionId: new mongoose.Types.ObjectId().toString(),
    classId: new mongoose.Types.ObjectId().toString(),
    feeType: 'monthly_tuition',
    title: 'Test Fee',
    amount: 150000,
    effectiveFromMonth: 1,
    effectiveFromYear: 2026
  });
  console.log(postResult.success ? "POST Validation Success" : "POST Validation Failed: " + JSON.stringify(postResult.error.issues));

  console.log("\nTesting PATCH validation:");
  const patchResult = updateFeeStructureSchema.safeParse({
    effectiveFromMonth: 2,
    effectiveFromYear: 2026
  });
  console.log(patchResult.success ? "PATCH Validation Success" : "PATCH Validation Failed: " + JSON.stringify(patchResult.error.issues));
}

testSchemas();
