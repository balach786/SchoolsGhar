const fs = require('fs');

const featuresArray = \`
const features = [
  {
    icon: Users,
    title: 'Student Management',
    text: 'Comprehensive student records, admissions, rosters, and academic tracking.',
    tag: 'Admissions · Directory · Records',
    cardBg: 'bg-[#F0F9FF] hover:bg-[#E0F2FE]/80 border-[#BAE6FD]/90',
    iconBg: 'bg-blue-600 text-white shadow-sm',
    numColor: 'text-blue-500/80',
    titleColor: 'text-blue-950',
    textColor: 'text-blue-900/75',
    tagBg: 'bg-white/80 text-blue-800 border-blue-200/90 shadow-2xs',
    footerBorder: 'border-blue-200/80',
    badgeText: 'Students Directory',
  },
  {
    icon: GraduationCap,
    title: 'Teacher Management',
    text: 'Manage faculty profiles, academic qualifications, and teaching assignments.',
    tag: 'Faculty · Staff · Roster',
    cardBg: 'bg-[#EEF2FF] hover:bg-[#E0E7FF]/80 border-[#C7D2FE]/90',
    iconBg: 'bg-indigo-600 text-white shadow-sm',
    numColor: 'text-indigo-500/80',
    titleColor: 'text-indigo-950',
    textColor: 'text-indigo-900/75',
    tagBg: 'bg-white/80 text-indigo-800 border-indigo-200/90 shadow-2xs',
    footerBorder: 'border-indigo-200/80',
    badgeText: 'Faculty & Staff',
  },
  {
    icon: CalendarCheck,
    title: 'Daily Attendance',
    text: 'Record daily attendance quickly and review automated monthly registers.',
    tag: 'Roll-Call · Leaves · Reports',
    cardBg: 'bg-[#ECFDF5] hover:bg-[#D1FAE5]/80 border-[#A7F3D0]/90',
    iconBg: 'bg-emerald-600 text-white shadow-sm',
    numColor: 'text-emerald-500/80',
    titleColor: 'text-emerald-950',
    textColor: 'text-emerald-900/75',
    tagBg: 'bg-white/80 text-emerald-800 border-emerald-200/90 shadow-2xs',
    footerBorder: 'border-emerald-200/80',
    badgeText: 'Daily Overview',
  },
  {
    icon: BookOpen,
    title: 'Academic Management',
    text: 'Plan academic sessions, manage classes, and organize subject rosters.',
    tag: 'Sessions · Classes · Subjects',
    cardBg: 'bg-[#FDF4FF] hover:bg-[#FAE8FF]/80 border-[#F5D0FE]/90',
    iconBg: 'bg-fuchsia-600 text-white shadow-sm',
    numColor: 'text-fuchsia-500/80',
    titleColor: 'text-fuchsia-950',
    textColor: 'text-fuchsia-900/75',
    tagBg: 'bg-white/80 text-fuchsia-800 border-fuchsia-200/90 shadow-2xs',
    footerBorder: 'border-fuchsia-200/80',
    badgeText: 'Academic Sessions',
  },
  {
    icon: ClipboardCheck,
    title: 'Exam Management',
    text: 'Schedule exams, configure grading scales, and automatically generate seating plans.',
    tag: 'Schedules · Grading · Seating',
    cardBg: 'bg-[#FAF5FF] hover:bg-[#F3E8FF]/80 border-[#E9D5FF]/90',
    iconBg: 'bg-violet-600 text-white shadow-sm',
    numColor: 'text-violet-500/80',
    titleColor: 'text-violet-950',
    textColor: 'text-violet-900/75',
    tagBg: 'bg-white/80 text-violet-800 border-violet-200/90 shadow-2xs',
    footerBorder: 'border-violet-200/80',
    badgeText: 'Exam Management Overview',
  },
  {
    icon: Wallet,
    title: 'Finance',
    text: 'Track fee collections, manage expenses, and keep a real-time view of your financial health.',
    tag: 'Payments · Receipts · Ledgers',
    cardBg: 'bg-[#FFFBEB] hover:bg-[#FEF3C7]/80 border-[#FDE68A]/90',
    iconBg: 'bg-amber-600 text-white shadow-sm',
    numColor: 'text-amber-600/80',
    titleColor: 'text-amber-950',
    textColor: 'text-amber-900/75',
    tagBg: 'bg-white/80 text-amber-900 border-amber-200/90 shadow-2xs',
    footerBorder: 'border-amber-200/80',
    badgeText: 'Fee Collection',
  },
  {
    icon: BookMarked,
    title: 'Assignments',
    text: 'Keep teaching and learning connected with submissions and useful feedback.',
    tag: 'Homework · Submissions · Reviews',
    cardBg: 'bg-[#FFF7ED] hover:bg-[#FFEDD5]/80 border-[#FED7AA]/90',
    iconBg: 'bg-orange-600 text-white shadow-sm',
    numColor: 'text-orange-500/80',
    titleColor: 'text-orange-950',
    textColor: 'text-orange-900/75',
    tagBg: 'bg-white/80 text-orange-800 border-orange-200/90 shadow-2xs',
    footerBorder: 'border-orange-200/80',
    badgeText: 'Course Syllabus',
  },
  {
    icon: BarChart3,
    title: 'Meaningful reports',
    text: 'Turn your everyday school records into a clearer view of school performance.',
    tag: 'Attendance · Exams · Workload',
    cardBg: 'bg-[#F0FDFA] hover:bg-[#CCFBF1]/80 border-[#99F6E4]/90',
    iconBg: 'bg-teal-600 text-white shadow-sm',
    numColor: 'text-teal-500/80',
    titleColor: 'text-teal-950',
    textColor: 'text-teal-900/75',
    tagBg: 'bg-white/80 text-teal-800 border-teal-200/90 shadow-2xs',
    footerBorder: 'border-teal-200/80',
    badgeText: 'Audit & Analytics',
  },
];
\`;

const featuresSectionCode = \`        {/* Features Section (White Background) */}
        <section id="features" className="w-full bg-white">
          <div className="marketing-section pb-16">
            <Reveal className="section-heading">
              <span className="eyebrow">LESS FRICTION. MORE FOCUS.</span>
              <h2>
                Everything your school needs.
                <br />
                Finally, in one place.
              </h2>
              <p>Thoughtful tools for the people who keep your school moving.</p>
            </Reveal>
            <StaggerContainer className="feature-grid">
              {features.map((item, i) => {
                const Icon = item.icon;
                const tagChips = item.tag.split(' · ');
                return (
                  <StaggerItem
                    key={item.title}
                    className={cn(
                      'feature-card group flex flex-col justify-between p-6 sm:p-7 rounded-3xl border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl cursor-pointer',
                      item.cardBg
                    )}
                  >
                    <div>
                      <div className="feature-card-top flex items-center justify-between mb-5">
                        <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:scale-105', item.iconBg)}>
                          <Icon className="h-6 w-6" />
                        </span>
                        <small className={cn('text-xs font-black tracking-widest', item.numColor)}>
                          0{i + 1}
                        </small>
                      </div>
                      <h3 className={cn('text-lg sm:text-xl font-extrabold tracking-tight', item.titleColor)}>
                        {item.title}
                      </h3>
                      <p className={cn('text-xs sm:text-sm leading-relaxed mt-2.5 mb-5', item.textColor)}>
                        {item.text}
                      </p>
                    </div>

                    {/* Filled Bottom with Tag Badges & Status Row */}
                    <div className={cn('mt-auto pt-4 border-t space-y-2.5', item.footerBorder)}>
                      <div className="flex flex-wrap gap-1.5">
                        {tagChips.map((chip) => (
                          <span
                            key={chip}
                            className={cn(
                              'inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border shadow-2xs',
                              item.tagBg
                            )}
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                      <div className={cn('flex items-center justify-between text-[11px] font-bold pt-1', item.titleColor)}>
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                          {item.badgeText}
                        </span>
                        <ArrowRight size={14} className="opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>

          {/* 2. Seamless Wavy Transition from Features (White) into Solutions (Soft Blue #F0F7FF) */}
          <CurvedSectionDivider from="#ffffff" to="#F0F7FF" height={100} />
        </section>\`;

const lines = fs.readFileSync('frontend/src/pages/LandingPage/index.tsx', 'utf8').split('\\n');

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
  lines.splice(compIdx, 2, featuresSectionCode);
}

fs.writeFileSync('frontend/src/pages/LandingPage/index.tsx', lines.join('\\n'));
console.log('Reverted successfully!');
