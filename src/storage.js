import { BUNDLED_SEMESTERS, COLORS, makeInitialState, normalizeWeekFontSize } from './data';
import { normalizeCourseTitle } from './textNormalization';

const STORAGE_KEY = 'kexu-state-v1';

function normalizeCourse(course) {
  if (!course || typeof course !== 'object') return null;
  return {
    ...course,
    title: course.source === 'import' ? normalizeCourseTitle(course.title || '未命名课程') : String(course.title || '未命名课程'),
    meetings: Array.isArray(course.meetings) ? course.meetings.filter((meeting) => meeting && typeof meeting === 'object') : [],
    milestones: Array.isArray(course.milestones) ? course.milestones.filter((item) => item && typeof item === 'object') : []
  };
}

function normalizeSemester(semester) {
  if (!semester || typeof semester !== 'object' || !semester.id) return null;
  return {
    ...semester,
    weekCount: Math.max(1, Number(semester.weekCount) || 20),
    courses: Array.isArray(semester.courses) ? semester.courses.map(normalizeCourse).filter(Boolean) : []
  };
}

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.semesters)) {
      const initial = makeInitialState();
      const paletteHistory = [
        ['#E76F51', '#4F83CC', '#5A9A88', '#D79A3D', '#9A6FC8', '#D06F93', '#6176A6', '#7A9B4F'],
        ['#F09A8D', '#91B9F2', '#8ECBB2', '#F3C875', '#BBA7E8', '#EFA9C5', '#8BC6D4', '#B4CF83']
      ];
      const remapCourse = (course) => {
        const savedColor = String(course.color || '').toUpperCase();
        const paletteIndex = paletteHistory.reduce((found, palette) => found >= 0 ? found : palette.indexOf(savedColor), -1);
        const title = course.source === 'import' && course.title === '数学系统设计' ? '数字系统设计' : course.title;
        return { ...course, title, color: paletteIndex >= 0 ? COLORS[paletteIndex] : course.color };
      };
      const normalizedTitle = (course) => String(course?.title || '').toLowerCase().replace(/\s/g, '');
      const semesters = saved.semesters.map(normalizeSemester).filter(Boolean).map((semester) => {
        const bundled = BUNDLED_SEMESTERS.find((item) => item.id === semester.id);
        let courses = semester.courses?.length ? semester.courses.map(remapCourse) : (bundled?.courses || []);
        if (bundled && Number(saved.version || 0) < 4) {
          const savedById = new Map(courses.map((course) => [course.id, course]));
          const repairedTitles = new Set(bundled.courses.map(normalizedTitle));
          const repaired = bundled.courses.map((course) => {
            const previous = savedById.get(course.id);
            if (!previous) return course;
            return {
              ...course,
              gradeComposition: previous.gradeComposition || course.gradeComposition,
              rollCall: previous.rollCall && previous.rollCall !== '未知' ? previous.rollCall : course.rollCall,
              notes: previous.notes || course.notes,
              milestones: previous.milestones?.length ? previous.milestones : course.milestones
            };
          });
          const custom = courses.filter((course) => course.source === 'manual' || !repairedTitles.has(normalizedTitle(course)));
          courses = [...repaired, ...custom];
        }
        return { ...bundled, ...semester, weekCount: Math.max(semester.weekCount || 0, bundled?.weekCount || 0), courses };
      });
      BUNDLED_SEMESTERS.forEach((bundled) => {
        if (!semesters.some((semester) => semester.id === bundled.id)) semesters.push(bundled);
      });
      if (!semesters.length) return initial;
      const activeSemesterId = semesters.some((semester) => semester.id === saved.activeSemesterId)
        ? saved.activeSemesterId
        : semesters[0].id;
      return {
        ...initial,
        ...saved,
        activeSemesterId,
        version: initial.version,
        semesters,
        settings: {
          ...initial.settings,
          ...saved.settings,
          weekFontSize: normalizeWeekFontSize(saved.settings?.weekFontSize)
        }
      };
    }
  } catch {
    // Damaged local data should never prevent opening the timetable.
  }
  return makeInitialState();
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportState(state) {
  return new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
}
