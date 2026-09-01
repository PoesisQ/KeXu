import { describe, expect, it } from 'vitest';
import { cardLocationLayout, displayLocation, groupOverlappingOccurrences, locationWrapParts, mergeImportedSemester, parseWeekSpec, shouldForceRoomWrap, splitMeetingFromWeek } from './schedule';
import { parseRecognizedText } from './importer';
import { makeInitialState } from './data';
import { buildReminderPayload } from './reminders';
import { loadState } from './storage';
import { horizontalPagerMotion, pointerVelocity, resolveWeekSwipe, verticalMomentumDistance } from './gesture';

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

  it('normalizes pager progress and moves the day highlight opposite the finger', () => {
    expect(horizontalPagerMotion(-195, 390)).toEqual({ progress: -0.5, amount: 0.5, next: 0.5, previous: 0, highlight: 0.5 });
    expect(horizontalPagerMotion(195, 390)).toEqual({ progress: 0.5, amount: 0.5, next: 0, previous: 0.5, highlight: -0.5 });
    expect(horizontalPagerMotion(-800, 390).progress).toBe(-1);
    expect(horizontalPagerMotion(800, 0).progress).toBe(1);
  });
});

describe('imports', () => {
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

  it('does not merge same-name theory and lab courses back together', () => {
    const imported = { courses: [
      { id: 'theory', title: '示例课程', teacher: '陈老师', category: '理论', source: 'import', meetings: [] },
      { id: 'lab', title: '示例课程', teacher: '陈老师', category: '实验', source: 'import', meetings: [] }
    ] };
    expect(mergeImportedSemester({ courses: [] }, imported).courses.map((course) => course.category)).toEqual(['理论', '实验']);
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
    const operatingSystems = courses.filter((course) => course.title === '示例课程');
    expect(late.category).toBe('实验');
    expect(late.meetings[0]).toMatchObject({ day: 1, start: 9, end: 11 });
    expect(operatingSystems.map((course) => course.category).sort()).toEqual(['实验', '理论']);
    expect(operatingSystems.find((course) => course.category === '实验').meetings[0].day).toBe(3);
    expect(operatingSystems.find((course) => course.category === '理论').meetings[0].weeks).toEqual([1, 2, 7, 8, 11, 13]);
    expect(new Set(operatingSystems.map((course) => course.color)).size).toBe(1);
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
    expect(migrated.version).toBe(5);
    expect(migratedCurrent.courses.some((course) => course.id === 'manual-reading')).toBe(true);
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
});
