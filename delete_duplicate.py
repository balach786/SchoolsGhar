with open('backend/src/controllers/resultV2.controller.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Delete lines 112 to 143 (index 112 to 143 inclusive is 112:144)
# Wait, let's just delete the exact block to be safe
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if line.startswith('export const getLatestPublishedResult = asyncHandler') and start_idx == -1:
        start_idx = i
        break

if start_idx != -1:
    for i in range(start_idx, len(lines)):
        if lines[i].startswith('});'):
            end_idx = i
            break

if start_idx != -1 and end_idx != -1:
    # Also remove the JSDoc above it
    doc_start = start_idx - 4
    if lines[doc_start].startswith('/**'):
        start_idx = doc_start
        
    del lines[start_idx:end_idx+1]

with open('backend/src/controllers/resultV2.controller.ts', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('Deleted successfully')
