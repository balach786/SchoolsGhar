import re

with open('backend/src/controllers/resultV2.controller.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'throw new ApiError(409, MIXED_SNAPSHOT_CONFIG: Student \ has a divergent Grade Scale (\) compared to cohort (\).);',
    'throw new ApiError(409, MIXED_SNAPSHOT_CONFIG: Student  has a divergent Grade Scale () compared to cohort ().);'
)

content = content.replace(
    'throw new ApiError(409, MIXED_SNAPSHOT_CONFIG: Subject \ config diverges for student \. Expected Max \/\, got \/\);',
    'throw new ApiError(409, MIXED_SNAPSHOT_CONFIG: Subject  config diverges for student . Expected Max /, got /);'
)

with open('backend/src/controllers/resultV2.controller.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed syntax errors')
