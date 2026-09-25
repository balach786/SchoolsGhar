const fs = require('fs');
const lines = fs.readFileSync('frontend/src/pages/LandingPage/index.tsx', 'utf8').split('\n');

const btnImportIdx = lines.findIndex(l => l.includes('import { Button }'));
if(btnImportIdx !== -1) {
  lines.splice(btnImportIdx, 0, 'import { InteractiveFeaturesSection } from \'./components/InteractiveFeaturesSection\';');
}

const featureStartIdx = lines.findIndex(l => l.includes('const features = ['));
const featureEndIdx = lines.findIndex((l, idx) => idx > featureStartIdx && l === '];');
if (featureStartIdx !== -1 && featureEndIdx !== -1) {
  lines.splice(featureStartIdx, featureEndIdx - featureStartIdx + 1);
}

const sectionStartIdx = lines.findIndex(l => l.includes('<section id=\"features\"'));
let sectionEndIdx = lines.findIndex((l, idx) => idx > sectionStartIdx && l.includes('</section>'));

if (sectionStartIdx !== -1 && sectionEndIdx !== -1) {
  lines.splice(sectionStartIdx, sectionEndIdx - sectionStartIdx + 1, 
    '        <InteractiveFeaturesSection />',
    '        <CurvedSectionDivider from=\"#ffffff\" to=\"#F0F7FF\" height={100} />'
  );
}

fs.writeFileSync('frontend/src/pages/LandingPage/index.tsx', lines.join('\n'));
console.log('Successfully updated index.tsx');
