import mongoose from 'mongoose';
import { StudentFee } from './src/models/StudentFee';
import { Payment } from './src/models/Payment';
import { ExamFeePayment } from './src/models/ExamFeePayment';
import { Expense } from './src/models/Expense';
import { Income } from './src/models/Income';
import { SalaryRecord } from './src/models/SalaryRecord';

async function testModel(modelName, ModelCls, fieldName) {
  let intPassed = false;
  let fracPassed = false;
  
  // Test integer
  try {
    const doc1 = new ModelCls({ [fieldName]: 1000 });
    const err = doc1.validateSync();
    if (!err || !err.errors[fieldName]) {
      intPassed = true;
    }
  } catch (e) {
    intPassed = true; // Error wasn't in fieldName
  }

  // Test fractional
  try {
    const doc2 = new ModelCls({ [fieldName]: 1000.5 });
    const err = doc2.validateSync();
    if (err && err.errors[fieldName] && err.errors[fieldName].message.includes('integer paisa')) {
      fracPassed = true;
    }
  } catch (e) {}

  console.log(${modelName} integer =, intPassed ? 'PASS' : 'FAIL');
  console.log(${modelName} fractional =, fracPassed ? 'ValidationError' : 'FAIL');
}

async function run() {
  await testModel('StudentFee', StudentFee, 'originalAmount');
  await testModel('Payment', Payment, 'amount');
  await testModel('ExamFeePayment', ExamFeePayment, 'amount');
  await testModel('Expense', Expense, 'amount');
  await testModel('Income', Income, 'amount');
  await testModel('SalaryRecord', SalaryRecord, 'baseAmount');
  process.exit(0);
}
run();
