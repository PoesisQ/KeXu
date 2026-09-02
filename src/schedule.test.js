import { describe, expect, it } from 'vitest';
import { cardLocationLayout, displayLocation, formatPeriodRange, groupOverlappingOccurrences, locationWrapParts, mergeImportedSemester, normalizePeriodTimes, parseWeekSpec, shiftSemesterStart, shouldForceRoomWrap, splitMeetingFromWeek } from './schedule';
import { coalesceImportedCourses, deepSeekErrorMessage, parseRecognizedText } from './importer';
import { makeInitialState } from './data';
import { buildReminderPayload } from './reminders';
import { loadState } from './storage';
import { horizontalPagerMotion, pointerVelocity, resolveRevealSwipe, resolveWeekSwipe, verticalMomentumDistance } from './gesture';
import { groupBadgeLabel } from './presentation';

describe('week specifications', () => {
  it('parses ranges and parity', () => {
    expect(parseWeekSpec('1-8周,11-15周(单)')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 11, 13, 15]);
  });

  it('splits a recurring meeting without losing weeks', () => {
    const meeting = { id: 'm1', weeks: [1, 2, 3, 4], location: 'A' };
    expect(splitMeetingFromWeek(meeting, 3, { location: 'B' })).toEqual([
      { ...meeting, weeks: [1, 2] },
      { ...meeting, id: 'm1-w3', weeks: [3, 4], location: 'B' }
    ]);
  });
});

describe('semester calendar correction', () => {
  it('moves absolute milestones while retaining teaching-week meetings', () => {
    const semester = {
      firstMonday: '2026-08-31',
      courses: [{ meetings: [{ id: 'm1', weeks: [1, 2], day: 2 }], milestones: [{ id: 'e1', date: '2026-09-15' }] }]
    };
    const shifted = shiftSemesterStart(semester, '2026-09-07');
    expect(shifted.firstMonday).toBe('2026-09-07');
    expect(shifted.courses[0].meetings).toEqual(semester.courses[0].meetings);
    expect(shifted.courses[0].milestones[0].date).toBe('2026-09-22');
  });
});

describe('custom class times', () => {
  it('normalizes damaged saved values and formats custom periods', () => {
    const periods = normalizePeriodTimes(Array.from({ length: 12 }, (_, index) => index === 0 ? ['09:05', '09:50'] : ['bad', 'bad']));
    expect(periods[0]).toEqual(['09:05', '09:50']);
    expect(periods[1]).toEqual(['09:40', '10:25']);
    expect(formatPeriodRange(1, 2, periods)).toBe('09:05-10:25');
  });
});

describe('location display', () => {
  it('can retain only the room', () => {
    expect(displayLocation('示例校区/场地:A2-301', 'room')).toBe('A2-301');
  });

  it('adds optional wrap points for room, campus and mixed-format addresses', () => {
    expect(locationWrapParts('F3-a315')).toEqual([
      { text: 'F3', breakAfter: false }, { text: '-', breakAfter: true }, { text: 'a315', breakAfter: false }
    ]);
    expect(locationWrapParts('广州国际校区 · F3-a315').filter((part) => part.breakAfter).map((part) => part.text)).toEqual(['·', '-']);
    expect(locationWrapParts('North Campus/Science Center-A315').filter((part) => part.breakAfter).map((part) => part.text)).toEqual(['/', '-']);
    expect(cardLocationLayout('广州国际校区/场地:F3-a315', 'full')).toEqual({ text: 'F3-a315', context: '广州国际校区' });
    expect(cardLocationLayout('North Campus/Science Center-A315', 'full')).toEqual({ text: 'A315', context: 'North Campus · Science Center' });
    expect(shouldForceRoomWrap('F3-a315')).toBe(true);
    expect(shouldForceRoomWrap('A2-301')).toBe(false);
  });
});

describe('weekly slot groups', () => {
  it('collapses connected overlaps on one day without swallowing adjacent classes', () => {
    const item = (id, day, start, end) => ({ course: { id }, meeting: { id, day, start, end } });
    const groups = groupOverlappingOccurrences([
      item('theory', 3, 2, 4),
      item('lab', 3, 1, 4),
      item('next', 3, 5, 6),
      item('other-day', 4, 2, 4)
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ day: 3, start: 1, end: 4 });
    expect(groups[0].items.map((value) => value.course.id)).toEqual(['lab', 'theory']);
    expect(groups[1].items[0].course.id).toBe('next');
    expect(groups[2].items[0].course.id).toBe('other-day');
  });

  it('never announces an impossible zero hidden-course count', () => {
    expect(groupBadgeLabel(1, 2)).toBe('另有1门');
    expect(groupBadgeLabel(2, 2)).toBe('同有2门');
    expect(groupBadgeLabel(1, 1)).toBe('1门课程');
  });
});

describe('momentum gestures', () => {
  it('uses recent velocity to accept a short horizontal flick', () => {
    const velocity = pointerVelocity([
      { x: 200, y: 0, time: 0 },
      { x: 191, y: 0, time: 40 },
      { x: 180, y: 0, time: 80 }
    ], 'x');
    expect(resolveWeekSwipe({ offset: -20, velocity, width: 390, canPrevious: true, canNext: true })).toBe(1);
  });

  it('respects semester edges and caps vertical momentum', () => {
    expect(resolveWeekSwipe({ offset: 80, velocity: 1, width: 390, canPrevious: false, canNext: true })).toBe(0);
    expect(Math.abs(verticalMomentumDistance(10))).toBeLessThanOrEqual(560);
    expect(verticalMomentumDistance(0.1)).toBe(0);
  });

  it('opens swipe actions from either distance or a deliberate flick', () => {
    expect(resolveRevealSwipe({ offset: -42, velocity: 0, width: 76 })).toBe(true);
    expect(resolveRevealSwipe({ offset: -24, velocity: 0, width: 76 })).toBe(true);
    expect(resolveRevealSwipe({ offset: -15, velocity: 0, width: 76 })).toBe(false);
    expect(resolveRevealSwipe({ offset: -9, velocity: -0.45, width: 76 })).toBe(true);
    expect(resolveRevealSwipe({ offset: -18, velocity: 0.2, width: 76 })).toBe(false);
    expect(resolveRevealSwipe({ offset: -76, velocity: 0.7, width: 76 })).toBe(false);
  });

  it('normalizes pager progress and moves the day highlight opposite the finger', () => {
    expect(horizontalPagerMotion(-195, 390)).toEqual({ progress: -0.5, amount: 0.5, next: 0.5, previous: 0, highlight: 0.5 });
    expect(horizontalPagerMotion(195, 390)).toEqual({ progress: 0.5, amount: 0.5, next: 0, previous: 0.5, highlight: -0.5 });
    expect(horizontalPagerMotion(-800, 390).progress).toBe(-1);
    expect(horizontalPagerMotion(800, 0).progress).toBe(1);
  });
});

describe('imports', () => {
  it('explains DeepSeek balance errors instead of exposing a bare status code', () => {
    expect(deepSeekErrorMessage(402)).toContain('账户余额不足');
    expect(deepSeekErrorMessage(401)).toContain('API Key');
  });
  it('extracts a common timetable block', () => {
    const text = '示例课程 (2-4节) 1-4周,7-9周/校区:示例校区/场地:A2-301/教师:陈老师/学分:3.5';
    const [course] = parseRecognizedText(text);
    expect(course.title).toBe('示例课程');
    expect(course.meetings[0].start).toBe(2);
    expect(course.meetings[0].weeks).toContain(9);
  });

  it('keeps manual courses during a re-import', () => {
    const manual = { id: 'manual', title: '健身', teacher: '', source: 'manual', meetings: [] };
    const existing = { courses: [manual] };
    const imported = { courses: [{ id: 'new', title: '示例课程', teacher: '陈老师', source: 'import', meetings: [] }] };
    expect(mergeImportedSemester(existing, imported).courses.map((course) => course.title)).toEqual(['示例课程', '健身']);
  });

  it('coalesces cross-day theory and lab rows into one course with separate arrangements', () => {
    const [course] = coalesceImportedCourses([
      { id: 'theory', title: '示例课程', teacher: '陈老师', category: '理论', source: 'import', meetings: [{ id: 'm1', day: 2, start: 1, end: 2, weeks: [1, 2], location: 'A101' }] },
      { id: 'lab', title: '示例课程实验', teacher: '李老师', category: '实验', source: 'import', meetings: [{ id: 'm2', day: 3, start: 5, end: 6, weeks: [3, 4], location: 'Lab-2' }] }
    ]);
    expect(course.title).toBe('示例课程');
    expect(course.meetings).toHaveLength(2);
    expect(course.meetings.map((meeting) => meeting.category)).toEqual(['理论', '实验']);
    expect(course.meetings.map((meeting) => meeting.teacher)).toEqual(['陈老师', '李老师']);
  });

  it('does not treat a real course name beginning with 实验 as a generic lab prefix', () => {
    const courses = coalesceImportedCourses([
      { id: 'a', title: '实验心理学', category: '理论', meetings: [{ id: 'a1', day: 1, start: 1, end: 2, weeks: [1], location: '' }] },
      { id: 'b', title: '心理学', category: '理论', meetings: [{ id: 'b1', day: 2, start: 1, end: 2, weeks: [1], location: '' }] }
    ]);
    expect(courses.map((course) => course.title)).toEqual(['实验心理学', '心理学']);
  });

  it('keeps late classes and separates theory from lab meetings', () => {
    const text = `星期一
创意编程实践
(9-11节)1-8周/校区:示例校区/场地:Studio-01/教师:许老师/考核方式:考查/学分:2.0
星期三
示例课程
(1-4节)3-4周,9周,12周/校区:示例校区/场地:未排地点/教师:陈老师/考核方式:未安排/学分:3.5
示例课程
(2-4节)1-2周,7-8周,11-13周(单)/校区:示例校区/场地:A2-301/教师:陈老师/考核方式:考试/学分:3.5`;
    const courses = parseRecognizedText(text);
    const late = courses.find((course) => course.title === '创意编程实践');
    const operatingSystems = courses.find((course) => course.title === '示例课程');
    expect(late.category).toBe('实验');
    expect(late.meetings[0]).toMatchObject({ day: 1, start: 9, end: 11 });
    expect(operatingSystems.meetings.map((meeting) => meeting.category).sort()).toEqual(['实验', '理论']);
    expect(operatingSystems.meetings.find((meeting) => meeting.category === '实验').day).toBe(3);
    expect(operatingSystems.meetings.find((meeting) => meeting.category === '理论').weeks).toEqual([1, 2, 7, 8, 11, 13]);
  });
});

describe('demo state and reminders', () => {
  it('defaults wallpaper to full-image fitting with adjustable crop position', () => {
    const { settings } = makeInitialState();
    expect(settings.wallpaperFit).toBe('contain');
    expect([settings.wallpaperPositionX, settings.wallpaperPositionY]).toEqual([50, 50]);
  });

  it('ships only fictional demo courses including evening and related lab arrangements', () => {
    const state = makeInitialState();
    expect(state.semesters).toHaveLength(1);
    const semester = state.semesters[0];
    const late = semester.courses.find((course) => course.id === 'demo-creative-coding');
    expect(late.meetings).toContainEqual(expect.objectContaining({ day: 1, start: 9, end: 11 }));
    expect(semester.courses.filter((course) => course.title === '数据结构与算法').map((course) => course.category).sort()).toEqual(['实验', '理论']);
    expect(JSON.stringify(state)).not.toMatch(/真实姓名|真实学号/);
  });

  it('migrates existing installs without losing locally stored courses', () => {
    const saved = structuredClone(makeInitialState());
    saved.version = 4;
    const current = saved.semesters[0];
    current.courses.push({ id: 'manual-reading', title: '自主学习', source: 'manual', category: '理论', meetings: [] });
    globalThis.localStorage = { getItem: () => JSON.stringify(saved) };
    const migrated = loadState();
    delete globalThis.localStorage;
    const migratedCurrent = migrated.semesters.find((semester) => semester.id === current.id);
    expect(migrated.version).toBe(6);
    expect(migratedCurrent.courses.some((course) => course.id === 'manual-reading')).toBe(true);
  });

  it('does not silently restore a bundled semester after the user deletes it', () => {
    const saved = makeInitialState();
    saved.semesters = [{ id: 'kept', name: '保留学期', firstMonday: '2026-09-07', weekCount: 18, courses: [] }];
    saved.activeSemesterId = 'kept';
    globalThis.localStorage = { getItem: () => JSON.stringify(saved) };
    const loaded = loadState();
    delete globalThis.localStorage;
    expect(loaded.semesters.map((semester) => semester.id)).toEqual(['kept']);
  });

  it('recovers from malformed nested saved data instead of crashing', () => {
    globalThis.localStorage = { getItem: () => JSON.stringify({
      version: 4,
      activeSemesterId: 'missing',
      semesters: [null, { id: 'safe', name: '测试学期', firstMonday: '2026-09-07', weekCount: '20', courses: [null, { id: 'course', title: null, meetings: null }] }]
    }) };
    const recovered = loadState();
    delete globalThis.localStorage;
    expect(recovered.activeSemesterId).toBe('safe');
    expect(recovered.semesters.find((semester) => semester.id === 'safe').courses[0]).toMatchObject({ title: '未命名课程', meetings: [] });
  });

  it('creates a reminder ten minutes before class with the full address', () => {
    const state = makeInitialState();
    const now = new Date(2026, 7, 31, 0, 0).getTime();
    const reminder = buildReminderPayload(state, now).find((item) => item.id === 'demo-2026-autumn-demo-data-tue-1');
    expect(reminder.notifyAt).toBe(reminder.startAt - 10 * 60_000);
    expect(reminder.location).toContain('A2-301');
  });

  it('uses custom period times for notifications', () => {
    const state = makeInitialState();
    state.settings.periodTimes[1] = ['10:00', '10:45'];
    const now = new Date(2026, 7, 31, 0, 0).getTime();
    const reminder = buildReminderPayload(state, now).find((item) => item.id === 'demo-2026-autumn-demo-data-tue-1');
    expect(reminder.startClock).toBe('10:00');
  });
});
