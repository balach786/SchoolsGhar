import fs from 'fs';
import path from 'path';
import { PERMISSION_CATALOG } from '../config/permissions';

async function audit() {
  console.log('=== PERMISSION & LIMIT AUDIT ===\n');

  // 1. Audit Permissions
  const routesDir = path.join(__dirname, '../routes');
  const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.ts'));

  const usedPermissions = new Set<string>();
  const reportRoutePermissions: { route: string; perm: string; file: string }[] = [];

  for (const file of routeFiles) {
    const filePath = path.join(routesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // requirePermission('module', 'action')
    const reqPermMatches = content.matchAll(/requirePermission\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of reqPermMatches) {
      const key = `${match[1]}:${match[2]}`;
      usedPermissions.add(key);
      if (file.includes('finance') || file.includes('report') || file.includes('exam') || content.includes('/reports') || content.includes('/finance/reports')) {
        reportRoutePermissions.push({ route: match[0], perm: key, file });
      }
    }

    // requireAnyPermission(['mod', 'act'], ['mod2', 'act2'])
    const anyPermMatches = content.matchAll(/requireAnyPermission\(([^)]+)\)/g);
    for (const match of anyPermMatches) {
      const inner = match[1];
      const tupleMatches = inner.matchAll(/\[\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\]/g);
      for (const tm of tupleMatches) {
        const key = `${tm[1]}:${tm[2]}`;
        usedPermissions.add(key);
        reportRoutePermissions.push({ route: `requireAnyPermission(${tm[0]})`, perm: key, file });
      }
    }
  }

  // Catalog valid map
  const catalogMap = new Map<string, Set<string>>();
  for (const entry of PERMISSION_CATALOG) {
    catalogMap.set(entry.module, new Set(entry.actions));
  }

  console.log('Total unique permissions used in routes:', usedPermissions.size);

  const missing: string[] = [];
  const invalidSynonyms: string[] = [];
  const readViewDrift: string[] = [];

  for (const perm of usedPermissions) {
    const [mod, act] = perm.split(':');
    if (act === 'read') {
      readViewDrift.push(perm);
    }
    const validActions = catalogMap.get(mod);
    if (!validActions) {
      missing.push(`Module not in catalog: ${mod} (in ${perm})`);
    } else if (!validActions.has(act as any)) {
      invalidSynonyms.push(`Action "${act}" not allowed for module "${mod}"`);
    }
  }

  console.log('--- Permission Reconciliation Results ---');
  console.log('Missing modules/actions:', missing.length, missing);
  console.log('Invalid synonyms:', invalidSynonyms.length, invalidSynonyms);
  console.log('Read/View drift:', readViewDrift.length, readViewDrift);

  // Reporting route permissions summary
  console.log('\nReporting Routes unique permissions:');
  const reportingUniquePerms = Array.from(new Set(reportRoutePermissions.map((r) => r.perm))).sort();
  for (const p of reportingUniquePerms) {
    console.log(`  - ${p}`);
  }

  // 2. Audit remaining .limit( and .slice( in reporting controllers
  console.log('\n--- Reporting Limits Audit ---');
  const controllersDir = path.join(__dirname, '../controllers');
  const reportControllers = [
    'finance.controller.ts',
    'reports.controller.ts',
    'examReports.controller.ts',
  ];

  for (const cFile of reportControllers) {
    const cPath = path.join(controllersDir, cFile);
    if (!fs.existsSync(cPath)) continue;
    const lines = fs.readFileSync(cPath, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('.limit(') || line.includes('.slice(')) {
        console.log(`${cFile}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
}

audit().catch(console.error);
