const fs = require('fs');

const featuresArray = 
"const features = [\n" +
"  {\n" +
"    icon: Users,\n" +
"    title: 'Student Management',\n" +
"    text: 'Comprehensive student records, admissions, rosters, and academic tracking.',\n" +
"    tag: 'Admissions · Directory · Records',\n" +
"    cardBg: 'bg-[#F0F9FF] hover:bg-[#E0F2FE]/80 border-[#BAE6FD]/90',\n" +
"    iconBg: 'bg-blue-600 text-white shadow-sm',\n" +
"    numColor: 'text-blue-500/80',\n" +
"    titleColor: 'text-blue-950',\n" +
"    textColor: 'text-blue-900/75',\n" +
"    tagBg: 'bg-white/80 text-blue-800 border-blue-200/90 shadow-2xs',\n" +
"    footerBorder: 'border-blue-200/80',\n" +
"    badgeText: 'Students Directory',\n" +
"  },\n" +
"  {\n" +
"    icon: GraduationCap,\n" +
"    title: 'Teacher Management',\n" +
"    text: 'Manage faculty profiles, academic qualifications, and teaching assignments.',\n" +
"    tag: 'Faculty · Staff · Roster',\n" +
"    cardBg: 'bg-[#EEF2FF] hover:bg-[#E0E7FF]/80 border-[#C7D2FE]/90',\n" +
"    iconBg: 'bg-indigo-600 text-white shadow-sm',\n" +
"    numColor: 'text-indigo-500/80',\n" +
"    titleColor: 'text-indigo-950',\n" +
"    textColor: 'text-indigo-900/75',\n" +
"    tagBg: 'bg-white/80 text-indigo-800 border-indigo-200/90 shadow-2xs',\n" +
"    footerBorder: 'border-indigo-200/80',\n" +
"    badgeText: 'Faculty & Staff',\n" +
"  },\n" +
"  {\n" +
"    icon: CalendarCheck,\n" +
"    title: 'Daily Attendance',\n" +
"    text: 'Record daily attendance quickly and review automated monthly registers.',\n" +
"    tag: 'Roll-Call · Leaves · Reports',\n" +
"    cardBg: 'bg-[#ECFDF5] hover:bg-[#D1FAE5]/80 border-[#A7F3D0]/90',\n" +
"    iconBg: 'bg-emerald-600 text-white shadow-sm',\n" +
"    numColor: 'text-emerald-500/80',\n" +
"    titleColor: 'text-emerald-950',\n" +
"    textColor: 'text-emerald-900/75',\n" +
"    tagBg: 'bg-white/80 text-emerald-800 border-emerald-200/90 shadow-2xs',\n" +
"    footerBorder: 'border-emerald-200/80',\n" +
"    badgeText: 'Daily Overview',\n" +
"  },\n" +
"  {\n" +
"    icon: BookOpen,\n" +
"    title: 'Academic Management',\n" +
"    text: 'Plan academic sessions, manage classes, and organize subject rosters.',\n" +
"    tag: 'Sessions · Classes · Subjects',\n" +
"    cardBg: 'bg-[#FDF4FF] hover:bg-[#FAE8FF]/80 border-[#F5D0FE]/90',\n" +
"    iconBg: 'bg-fuchsia-600 text-white shadow-sm',\n" +
"    numColor: 'text-fuchsia-500/80',\n" +
"    titleColor: 'text-fuchsia-950',\n" +
"    textColor: 'text-fuchsia-900/75',\n" +
"    tagBg: 'bg-white/80 text-fuchsia-800 border-fuchsia-200/90 shadow-2xs',\n" +
"    footerBorder: 'border-fuchsia-200/80',\n" +
"    badgeText: 'Academic Sessions',\n" +
"  },\n" +
"  {\n" +
"    icon: ClipboardCheck,\n" +
"    title: 'Exam Management',\n" +
"    text: 'Schedule exams, configure grading scales, and automatically generate seating plans.',\n" +
"    tag: 'Schedules · Grading · Seating',\n" +
"    cardBg: 'bg-[#FAF5FF] hover:bg-[#F3E8FF]/80 border-[#E9D5FF]/90',\n" +
"    iconBg: 'bg-violet-600 text-white shadow-sm',\n" +
"    numColor: 'text-violet-500/80',\n" +
"    titleColor: 'text-violet-950',\n" +
"    textColor: 'text-violet-900/75',\n" +
"    tagBg: 'bg-white/80 text-violet-800 border-violet-200/90 shadow-2xs',\n" +
"    footerBorder: 'border-violet-200/80',\n" +
"    badgeText: 'Exam Management Overview',\n" +
"  },\n" +
"  {\n" +
"    icon: Wallet,\n" +
"    title: 'Finance',\n" +
"    text: 'Track fee collections, manage expenses, and keep a real-time view of your financial health.',\n" +
"    tag: 'Payments · Receipts · Ledgers',\n" +
"    cardBg: 'bg-[#FFFBEB] hover:bg-[#FEF3C7]/80 border-[#FDE68A]/90',\n" +
"    iconBg: 'bg-amber-600 text-white shadow-sm',\n" +
"    numColor: 'text-amber-600/80',\n" +
"    titleColor: 'text-amber-950',\n" +
"    textColor: 'text-amber-900/75',\n" +
"    tagBg: 'bg-white/80 text-amber-900 border-amber-200/90 shadow-2xs',\n" +
"    footerBorder: 'border-amber-200/80',\n" +
"    badgeText: 'Fee Collection',\n" +
"  },\n" +
"  {\n" +
"    icon: BookMarked,\n" +
"    title: 'Assignments',\n" +
"    text: 'Keep teaching and learning connected with submissions and useful feedback.',\n" +
"    tag: 'Homework · Submissions · Reviews',\n" +
"    cardBg: 'bg-[#FFF7ED] hover:bg-[#FFEDD5]/80 border-[#FED7AA]/90',\n" +
"    iconBg: 'bg-orange-600 text-white shadow-sm',\n" +
"    numColor: 'text-orange-500/80',\n" +
"    titleColor: 'text-orange-950',\n" +
"    textColor: 'text-orange-900/75',\n" +
"    tagBg: 'bg-white/80 text-orange-800 border-orange-200/90 shadow-2xs',\n" +
"    footerBorder: 'border-orange-200/80',\n" +
"    badgeText: 'Course Syllabus',\n" +
"  },\n" +
"  {\n" +
"    icon: BarChart3,\n" +
"    title: 'Meaningful reports',\n" +
"    text: 'Turn your everyday school records into a clearer view of school performance.',\n" +
"    tag: 'Attendance · Exams · Workload',\n" +
"    cardBg: 'bg-[#F0FDFA] hover:bg-[#CCFBF1]/80 border-[#99F6E4]/90',\n" +
"    iconBg: 'bg-teal-600 text-white shadow-sm',\n" +
"    numColor: 'text-teal-500/80',\n" +
"    titleColor: 'text-teal-950',\n" +
"    textColor: 'text-teal-900/75',\n" +
"    tagBg: 'bg-white/80 text-teal-800 border-teal-200/90 shadow-2xs',\n" +
"    footerBorder: 'border-teal-200/80',\n" +
"    badgeText: 'Audit & Analytics',\n" +
"  },\n" +
"];\n";

const featuresSectionCode = 
"        {/* Features Section (White Background) */}\n" +
"        <section id=\"features\" className=\"w-full bg-white\">\n" +
"          <div className=\"marketing-section pb-16\">\n" +
"            <Reveal className=\"section-heading\">\n" +
"              <span className=\"eyebrow\">LESS FRICTION. MORE FOCUS.</span>\n" +
"              <h2>\n" +
"                Everything your school needs.\n" +
"                <br />\n" +
"                Finally, in one place.\n" +
"              </h2>\n" +
"              <p>Thoughtful tools for the people who keep your school moving.</p>\n" +
"            </Reveal>\n" +
"            <StaggerContainer className=\"feature-grid\">\n" +
"              {features.map((item, i) => {\n" +
"                const Icon = item.icon;\n" +
"                const tagChips = item.tag.split(' · ');\n" +
"                return (\n" +
"                  <StaggerItem\n" +
"                    key={item.title}\n" +
"                    className={cn(\n" +
"                      'feature-card group flex flex-col justify-between p-6 sm:p-7 rounded-3xl border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl cursor-pointer',\n" +
"                      item.cardBg\n" +
"                    )}\n" +
"                  >\n" +
"                    <div>\n" +
"                      <div className=\"feature-card-top flex items-center justify-between mb-5\">\n" +
"                        <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:scale-105', item.iconBg)}>\n" +
"                          <Icon className=\"h-6 w-6\" />\n" +
"                        </span>\n" +
"                        <small className={cn('text-xs font-black tracking-widest', item.numColor)}>\n" +
"                          0{i + 1}\n" +
"                        </small>\n" +
"                      </div>\n" +
"                      <h3 className={cn('text-lg sm:text-xl font-extrabold tracking-tight', item.titleColor)}>\n" +
"                        {item.title}\n" +
"                      </h3>\n" +
"                      <p className={cn('text-xs sm:text-sm leading-relaxed mt-2.5 mb-5', item.textColor)}>\n" +
"                        {item.text}\n" +
"                      </p>\n" +
"                    </div>\n\n" +
"                    {/* Filled Bottom with Tag Badges & Status Row */}\n" +
"                    <div className={cn('mt-auto pt-4 border-t space-y-2.5', item.footerBorder)}>\n" +
"                      <div className=\"flex flex-wrap gap-1.5\">\n" +
"                        {tagChips.map((chip) => (\n" +
"                          <span\n" +
"                            key={chip}\n" +
"                            className={cn(\n" +
"                              'inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border shadow-2xs',\n" +
"                              item.tagBg\n" +
"                            )}\n" +
"                          >\n" +
"                            {chip}\n" +
"                          </span>\n" +
"                        ))}\n" +
"                      </div>\n" +
"                      <div className={cn('flex items-center justify-between text-[11px] font-bold pt-1', item.titleColor)}>\n" +
"                        <span className=\"flex items-center gap-1.5\">\n" +
"                          <span className=\"h-1.5 w-1.5 rounded-full bg-current animate-pulse\" />\n" +
"                          {item.badgeText}\n" +
"                        </span>\n" +
"                        <ArrowRight size={14} className=\"opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all\" />\n" +
"                      </div>\n" +
"                    </div>\n" +
"                  </StaggerItem>\n" +
"                );\n" +
"              })}\n" +
"            </StaggerContainer>\n" +
"          </div>\n\n" +
"          {/* 2. Seamless Wavy Transition from Features (White) into Solutions (Soft Blue #F0F7FF) */}\n" +
"          <CurvedSectionDivider from=\"#ffffff\" to=\"#F0F7FF\" height={100} />\n" +
"        </section>\n";

const lines = fs.readFileSync('frontend/src/pages/LandingPage/index.tsx', 'utf8').split('\n');

// 1. Remove import
const importIdx = lines.findIndex(l => l.includes('import { InteractiveFeaturesSection }'));
if (importIdx !== -1) lines.splice(importIdx, 1);

// 2. Add features array before the interface Plan
const planIdx = lines.findIndex(l => l.includes('interface Plan {'));
if (planIdx !== -1) {
  lines.splice(planIdx, 0, featuresArray.trim());
}

// 3. Revert <InteractiveFeaturesSection /> block
const compIdx = lines.findIndex(l => l.includes('<InteractiveFeaturesSection />'));
if (compIdx !== -1) {
  lines.splice(compIdx, 2, featuresSectionCode.trim());
}

fs.writeFileSync('frontend/src/pages/LandingPage/index.tsx', lines.join('\n'));
console.log('Reverted successfully!');
