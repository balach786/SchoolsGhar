import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db';
import { ExamExpense } from '../src/models/ExamExpense';
import { Expense } from '../src/models/Expense';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(__dirname, '../.env') });

async function migrate() {
  try {
    await connectDatabase();
    console.log('Connected to DB');

    const examExpenses = await ExamExpense.find({});
    console.log(`Found ${examExpenses.length} ExamExpense records.`);

    if (examExpenses.length === 0) {
      console.log('No data to migrate. Exiting.');
      process.exit(0);
    }

    let success = 0;
    let failed = 0;

    for (const ee of examExpenses) {
      try {
        const existing = await Expense.findOne({
          tenantId: ee.tenantId,
          examId: ee.examId,
          title: ee.title,
          amount: ee.amount,
          date: ee.expenseDate
        });

        if (existing) {
          console.log(`Expense already exists for ${ee.title}, skipping.`);
          success++;
          continue;
        }

        const newExpense = new Expense({
          tenantId: ee.tenantId,
          sessionId: ee.sessionId,
          examId: ee.examId,
          category: 'Exam Expense',
          title: `[${ee.category}] ${ee.title}`,
          amount: ee.amount,
          date: ee.expenseDate,
          description: ee.description,
          reference: ee.reference,
          createdBy: ee.createdBy,
          isArchived: ee.isArchived,
          createdAt: ee.createdAt,
          updatedAt: ee.updatedAt
        });
        
        await newExpense.save();
        success++;
      } catch (err) {
        console.error(`Failed to migrate ${ee._id}:`, err);
        failed++;
      }
    }

    console.log(`Migration complete. Success: ${success}, Failed: ${failed}`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
