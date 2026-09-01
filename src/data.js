export const COLORS = ['#FF9D91', '#86C4FF', '#76D8B0', '#FFD36B', '#C4A5FF', '#FF9FC8', '#70D2E1', '#B9DE78'];
export const WEEK_FONT_SIZES = ['compact', 'standard', 'large'];

export function normalizeWeekFontSize(value) {
  return WEEK_FONT_SIZES.includes(value) ? value : 'standard';
}

const span = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index);

// Only fictional demo data ships with the public project. Imported schedules,
// edits, wallpapers and API keys stay in the device's private local storage.
const demoSemester = {
  id: 'demo-2026-autumn',
  name: '演示学期 · 2026 秋',
  firstMonday: '2026-08-31',
  weekCount: 18,
  courses: [
    {
      id: 'demo-data-structures', title: '数据结构与算法', teacher: '陈老师', credits: '3.5', color: COLORS[1],
      source: 'demo', category: '理论', relatedId: 'demo-data-structures', gradeComposition: '平时 30% · 期末 70%', rollCall: '偶尔点名', notes: '',
      meetings: [
        { id: 'demo-data-tue', day: 2, start: 2, end: 4, weeks: span(1, 16), location: '示例校区/场地:A2-301' },
        { id: 'demo-data-thu', day: 4, start: 3, end: 4, weeks: span(1, 16), location: '示例校区/场地:A2-301' }
      ],
      milestones: [{ id: 'demo-data-exam', type: '考试', title: '期末考试', date: '2026-12-22', time: '19:00', period: 9, endPeriod: 10, location: '待通知' }]
    },
    {
      id: 'demo-data-lab', title: '数据结构与算法', teacher: '陈老师', credits: '1.0', color: COLORS[1],
      source: 'demo', category: '实验', relatedId: 'demo-data-structures', gradeComposition: '实验报告 60% · 答辩 40%', rollCall: '每次点名', notes: '',
      meetings: [{ id: 'demo-data-lab-fri', day: 5, start: 5, end: 6, weeks: [2, 4, 6, 8, 10, 12, 14, 16], location: '示例校区/场地:Lab-204' }], milestones: []
    },
    {
      id: 'demo-interaction', title: '人机交互设计', teacher: '林老师', credits: '2.5', color: COLORS[2],
      source: 'demo', category: '理论', relatedId: 'demo-interaction', gradeComposition: '课堂项目 50% · 期末作品 50%', rollCall: '不定期', notes: '',
      meetings: [
        { id: 'demo-interaction-mon', day: 1, start: 5, end: 6, weeks: span(1, 12), location: '示例校区/场地:B1-112' },
        { id: 'demo-interaction-wed', day: 3, start: 5, end: 6, weeks: span(1, 12), location: '示例校区/场地:B1-112' }
      ], milestones: []
    },
    {
      id: 'demo-network', title: '计算机网络', teacher: '周老师', credits: '3.0', color: COLORS[3],
      source: 'demo', category: '理论', relatedId: 'demo-network', gradeComposition: '', rollCall: '未知', notes: '',
      meetings: [
        { id: 'demo-network-wed', day: 3, start: 1, end: 2, weeks: span(3, 17), location: '示例校区/场地:C3-205' },
        { id: 'demo-network-fri', day: 5, start: 3, end: 4, weeks: span(3, 17), location: '示例校区/场地:C3-205' }
      ], milestones: []
    },
    {
      id: 'demo-creative-coding', title: '创意编程实践', teacher: '许老师', credits: '1.5', color: COLORS[4],
      source: 'demo', category: '实验', relatedId: 'demo-creative-coding', gradeComposition: '作品 70% · 答辩 30%', rollCall: '每次点名', notes: '',
      meetings: [
        { id: 'demo-creative-night', day: 1, start: 9, end: 11, weeks: span(1, 8), location: '示例校区/场地:Studio-01' },
        { id: 'demo-creative-alt', day: 1, start: 5, end: 8, weeks: [9, 11, 13, 15], location: '示例校区/场地:未排地点' }
      ], milestones: []
    },
    {
      id: 'demo-design-thinking', title: '设计思维', teacher: '宋老师', credits: '2.0', color: COLORS[0],
      source: 'demo', category: '实践', relatedId: 'demo-design-thinking', gradeComposition: '', rollCall: '未知', notes: '',
      meetings: [{ id: 'demo-design-sun', day: 7, start: 7, end: 8, weeks: [4, 6, 8, 10, 12], location: '示例校区/场地:Workshop-3' }], milestones: []
    }
  ]
};

export const BUNDLED_SEMESTERS = [demoSemester];

export function makeInitialState() {
  return {
    version: 5,
    activeSemesterId: demoSemester.id,
    semesters: BUNDLED_SEMESTERS,
    overrides: {},
    settings: {
      theme: 'light',
      locationMode: 'room',
      weekFontSize: 'standard',
      showInactive: true,
      wallpaper: '',
      wallpaperOpacity: 0.24,
      wallpaperFit: 'contain',
      wallpaperScale: 1,
      wallpaperPositionX: 50,
      wallpaperPositionY: 50,
      wallpaperBrightness: 1,
      wallpaperBlur: 0,
      apiKey: '',
      remindersEnabled: false,
      reminderMinutes: 10
    }
  };
}
