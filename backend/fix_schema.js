const fs = require('fs');
const content = fs.readFileSync('src/models/Result.ts', 'utf-8');

const updated = content.replace(
  "examName: { type: String, required: true, trim: true },\n      examTypeName: { type: String, trim: true },",
  "examName: { type: String, required: true, trim: true },\n      examDate: { type: String, default: null },\n      examTypeName: { type: String, trim: true },"
);

fs.writeFileSync('src/models/Result.ts', updated);
