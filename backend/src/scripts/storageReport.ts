/**
 * CLI: npm run storage:report
 * Prints live MongoDB usage against the 512 MB budget with 70/80/90 % thresholds.
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { getStorageReport } from '../services/storage.service';

const MB = 1024 * 1024;

async function main(): Promise<void> {
  await connectDatabase();
  const report = await getStorageReport();

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  MongoDB Storage Report (512 MB budget)');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Generated:      ${report.generatedAt}`);
  console.log(`  Database:       ${report.database.name}`);
  console.log(`  Collections:    ${report.database.collections}   Objects: ${report.database.objects}`);
  console.log('──────────────────────────────────────────────────────────');
  console.log(`  Data size:      ${(report.usage.dataSize / MB).toFixed(2)} MB`);
  console.log(`  Index size:     ${(report.usage.indexSize / MB).toFixed(2)} MB`);
  console.log(`  Total (data+idx): ${report.usage.mb.toFixed(2)} MB`);
  console.log(`  Budget used:    ${report.usage.percent.toFixed(1)} %   [level: ${report.usage.level.toUpperCase()}]`);
  console.log(
    `  Thresholds:     70% warning · 80% elevated · 90% critical  (${report.usage.thresholds.warningPercent}/${report.usage.thresholds.elevatedPercent}/${report.usage.thresholds.criticalPercent})`
  );
  console.log('──────────────────────────────────────────────────────────');
  console.log('  Per-collection usage (largest first):');
  for (const c of report.collections) {
    console.log(
      `    ${c.collection.padEnd(22)} docs=${String(c.documents).padStart(6)}  data=${(c.dataSize / MB).toFixed(2).padStart(7)} MB  idx=${(c.indexSize / MB).toFixed(2).padStart(7)} MB  total=${(c.totalSize / MB).toFixed(2).padStart(7)} MB`
    );
  }
  console.log('──────────────────────────────────────────────────────────');
  console.log('  Recommendations:');
  for (const r of report.recommendations) console.log(`    • ${r}`);
  console.log('══════════════════════════════════════════════════════════\n');

  await disconnectDatabase();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('storage:report failed', err);
    process.exit(1);
  });
