const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  return resolve.call(this, request.startsWith('@/') ? path.resolve(__dirname, '../src', request.slice(2)) : request, parent, ...rest);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText, file);
const render = (C, p) => renderToStaticMarkup(React.createElement(C, p));
const { DashboardAnalytics } = require('../src/components/DashboardAnalytics.tsx');
const { DataTable } = require('../src/components/DataTable.tsx');
const { Badge } = require('../src/components/ui/badge.tsx');
const { formatCurrency, formatDate } = require('../src/lib/format.ts');
test('empty analytics show helpful states without invalid values', () => {
  const html = render(DashboardAnalytics, { attendance: { present: 0, absent: 0, late: 0, leave: 0, total: 0 }, monthly: [] });
  assert.match(html, /No attendance marked today/);
  assert.match(html, /Your collection story starts here/);
  assert.doesNotMatch(html, /NaN|undefined|Infinity/);
});
test('attendance includes all four statuses in its accessible summary', () => {
  const html = render(DashboardAnalytics, { attendance: { present: 18, absent: 1, late: 1, leave: 0, total: 20 }, monthly: [] });
  assert.match(html, /90% present/);
  assert.match(html, /18 present, 1 absent, 1 late, 0 leave/);
});
test('table loading state hides stale records and empty state is readable', () => {
  const props = { columns: [{ key: 'name', header: 'Name', cell: r => r.name }], data: [], rowKey: r => r.id };
  assert.match(render(DataTable, props), /No records found/);
  assert.doesNotMatch(render(DataTable, { ...props, loading: true, data: [{ id: '1', name: 'Stale record' }] }), /Stale record/);
});
test('pagination clamps its last range and labels its controls', () => {
  const html = render(DataTable, { columns: [{ key: 'name', header: 'Name', cell: r => r.name }], data: [{ id: 'a', name: 'A' }], rowKey: r => r.id, pagination: { page: 3, limit: 10, total: 21, totalPages: 3 } });
  assert.match(html, /Showing 21–21 of 21 records/);
  assert.match(html, /aria-label="Next page"[^>]*disabled/);
  assert.match(html, /aria-label="First page"/);
});
test('badges have valid inline semantics', () => assert.match(render(Badge, { children: 'Paid', variant: 'success' }), /^<span/));
test('currency preserves the paisa contract and dates reject invalid values', () => {
  assert.match(formatCurrency(1140000), /11,400/);
  assert.equal(formatCurrency(NaN), '—');
  assert.equal(formatDate('not-a-date'), '—');
});
