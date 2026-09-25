const fs = require('fs');

let lines = fs.readFileSync('c:/Users/BK Magsi/Downloads/school-management-system/frontend/src/pages/FeeSetupPage.tsx', 'utf8').split('\n');

// 1. Remove "The above content does NOT show..."
lines = lines.filter(l => !l.includes('The above content does NOT show') && !l.includes('<EPHEMERAL_MESSAGE>') && !l.includes('</EPHEMERAL_MESSAGE>') && !l.includes('<planning_mode>') && !l.includes('</planning_mode>') && !l.includes('<bash_command_reminder>') && !l.includes('</bash_command_reminder>') && !l.includes('<SYSTEM_MESSAGE>') && !l.includes('</SYSTEM_MESSAGE>'));

// Let's just find the start of the garbage in try block of handleSaveStructure
const saveStart = lines.findIndex(l => l.includes('setBusy(true);'));
if (saveStart !== -1) {
    // Look ahead to find 'basePayload.effectiveFromMonth'
    const nextCode = lines.findIndex((l, idx) => idx > saveStart && l.includes('basePayload.effectiveFromMonth ='));
    if (nextCode !== -1) {
        // Remove everything between saveStart and nextCode except the try block start
        const tryBlock = `
    try {
      const hasDueDate = formFeeType === 'monthly_tuition' || formFeeType === 'monthly_transport' || formFeeType === 'hostel_fee';
      const basePayload: any = {
        title: formTitle,
        description: formDesc,
      };

      if (formFeeType === 'monthly_tuition' || formFeeType === 'monthly_transport' || formFeeType === 'hostel_fee') {
        basePayload.month = formMonth || null;
      }
`;
        lines.splice(saveStart + 1, nextCode - saveStart - 1, ...tryBlock.split('\n'));
    }
}

// Fix the missing closing tags for the button and div in columns!
const btnIdx = lines.findIndex(l => l.includes('className="h-8 gap-1 text-xs border-primary/40 text-primary hover:bg-primary/5"'));
if (btnIdx !== -1) {
    // Check if next lines are closed
    const nextLine = lines[btnIdx + 1];
    if (nextLine && nextLine.includes('return (')) {
        // insert the closing tags before return (
        lines.splice(btnIdx + 1, 0, '              <Calendar className="h-3.5 w-3.5" /> Generate', '            </Button>', '          )}', '        </div>', '      ),', '    },', '  ];');
    }
}

fs.writeFileSync('c:/Users/BK Magsi/Downloads/school-management-system/frontend/src/pages/FeeSetupPage.tsx', lines.join('\n'));
