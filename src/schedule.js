export const DEFAULT_PERIODS = [
  ['08:50', '09:35'], ['09:40', '10:25'], ['10:40', '11:25'], ['11:30', '12:15'],
  ['14:00', '14:45'], ['14:50', '15:35'], ['15:45', '16:30'], ['16:35', '17:20'],
  ['19:00', '19:45'], ['19:55', '20:40'], ['20:50', '21:35'], ['21:40', '22:25']
];

// Kept as a stable export for existing callers and third-party imports.
export const PERIODS = DEFAULT_PERIODS;

const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function normalizePeriodTimes(value) {
  if (!Array.isArray(value) || value.length !== DEFAULT_PERIODS.length) return DEFAULT_PERIODS.map((period) => [...period]);
  return value.map((period, index) => {
    const fallback = DEFAULT_PERIODS[index];
    if (!Array.isArray(period)) return [...fallback];
    const start = CLOCK_PATTERN.test(String(period[0] || '')) ? String(period[0]) : fallback[0];
    const end = CLOCK_PATTERN.test(String(period[1] || '')) ? String(period[1]) : fallback[1];
    return [start, end];
  });
}

export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function parseLocalDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toISODate(date) {
  const d = parseLocalDate(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(date, days) {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function shiftSemesterStart(semester, nextFirstMonday) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(semester?.firstMonday || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(nextFirstMonday || ''))) return semester;
  const next = toISODate(nextFirstMonday);
  const previous = toISODate(semester?.firstMonday);
  if (next === previous) return semester;
  const dayDelta = Math.round((parseLocalDate(next) - parseLocalDate(previous)) / 86400000);
  return {
    ...semester,
    firstMonday: next,
    courses: (semester?.courses || []).map((course) => ({
      ...course,
      // Meetings are stored as teaching-week numbers, so changing week one
      // already moves them on the calendar. Milestones use absolute dates and
      // must be shifted explicitly by the same amount.
      milestones: (course.milestones || []).map((item) => ({
        ...item,
        date: item.date ? toISODate(addDays(item.date, dayDelta)) : item.date
      }))
    }))
  };
}

export function currentAcademicWeek(firstMonday, today = new Date()) {
  const diff = parseLocalDate(today) - parseLocalDate(firstMonday);
  return Math.floor(diff / 604800000) + 1;
}

export function datesForWeek(firstMonday, week) {
  const monday = addDays(firstMonday, (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function parseWeekSpec(spec, maxWeeks = 30) {
  if (Array.isArray(spec)) return [...new Set(spec.map(Number).filter(Boolean))].sort((a, b) => a - b);
  const normalized = String(spec || '').replace(/[周第\s]/g, '').replace(/，/g, ',');
  if (!normalized) return Array.from({ length: maxWeeks }, (_, index) => index + 1);
  const numbers = new Set();
  normalized.split(',').forEach((originalPart) => {
    const parity = originalPart.includes('单') ? 'odd' : originalPart.includes('双') ? 'even' : null;
    const part = originalPart.replace(/[单双]/g, '');
    const match = part.match(/(\d+)\s*[-~至]\s*(\d+)/);
    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      for (let value = start; value <= end && value <= maxWeeks; value += 1) {
        if (!parity || (parity === 'odd' ? value % 2 : !(value % 2))) numbers.add(value);
      }
    } else {
      const single = part.match(/\d+/);
      if (single) numbers.add(Number(single[0]));
    }
  });
  return [...numbers].sort((a, b) => a - b);
}

export function formatWeekSpec(weeks) {
  const values = [...new Set(weeks)].sort((a, b) => a - b);
  if (!values.length) return '未设周次';
  const groups = [];
  let start = values[0];
  let previous = values[0];
  for (let index = 1; index <= values.length; index += 1) {
    const value = values[index];
    if (value === previous + 1) {
      previous = value;
      continue;
    }
    groups.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = value;
    previous = value;
  }
  return `第${groups.join('、')}周`;
}

export function isMeetingActive(meeting, week) {
  return parseWeekSpec(meeting.weeks).includes(Number(week));
}

export function formatPeriodRange(start, end, periods = DEFAULT_PERIODS) {
  const normalized = normalizePeriodTimes(periods);
  const first = normalized[start - 1] || normalized[0];
  const last = normalized[end - 1] || first;
  return `${first[0]}-${last[1]}`;
}

export function roomOnly(location = '') {
  const explicit = location.match(/(?:场地|教室)\s*[:：]?\s*([^/，,]+)/i);
  if (explicit) return explicit[1].trim();
  const room = location.match(/(?:^|[\s/，,·:：-])((?:[A-Z]\d?[-－]?[a-zA-Z]?\d{2,4}|[东西南北]?\d+[A-Z]?[-－]\d+|未排地点))$/i);
  return room ? room[1].replace('－', '-') : location.replace(/^.*(?:校区|园区)\s*/i, '').trim();
}

export function campusOnly(location = '') {
  const match = location.match(/([^/，,]*(?:校区|园区))/);
  return match ? match[1].replace(/^校区\s*[:：]?\s*/, '') : location;
}

export function displayLocation(location, mode = 'room') {
  if (!location) return '地点待定';
  if (mode === 'full') return location.replace(/(?:校区|场地|教室)\s*[:：]\s*/g, '').replace(/\//g, ' · ');
  if (mode === 'campus') return campusOnly(location);
  return roomOnly(location);
}

const LOCATION_WRAP_SEPARATOR = /^[-－–—/／·・,，;；|｜]$/;

export function locationWrapParts(location = '') {
  return String(location).trim().split(/([-－–—/／·・,，;；|｜])/).filter(Boolean)
    .map((text) => ({ text, breakAfter: LOCATION_WRAP_SEPARATOR.test(text) }));
}

export function cardLocationLayout(location, mode = 'room') {
  const text = displayLocation(location, mode);
  if (mode !== 'full') return { text, context: '' };
  const room = roomOnly(location);
  if (!room || room === location || !text.endsWith(room)) return { text, context: '' };
  const context = text.slice(0, -room.length).replace(/[-－–—/／·・,，;；|｜\s]+$/g, '').trim();
  return context ? { text: room, context } : { text, context: '' };
}

export function shouldForceRoomWrap(location = '') {
  const text = String(location).trim();
  return text.length >= 7 && /^[A-Z0-9]{1,4}[-－][A-Z0-9]{3,}$/i.test(text);
}

export function meetingKey(meetingId, week) {
  return `${meetingId}@${week}`;
}

export function resolveMeeting(meeting, week, overrides = {}) {
  return { ...meeting, ...(overrides[meetingKey(meeting.id, week)] || {}) };
}

export function splitMeetingFromWeek(meeting, fromWeek, patch) {
  const weeks = parseWeekSpec(meeting.weeks);
  const before = weeks.filter((week) => week < fromWeek);
  const after = weeks.filter((week) => week >= fromWeek);
  const pieces = [];
  if (before.length) pieces.push({ ...meeting, weeks: before });
  if (after.length) pieces.push({ ...meeting, ...patch, id: `${meeting.id}-w${fromWeek}`, weeks: after });
  return pieces;
}

export function occurrencesForWeek(semester, week, overrides = {}) {
  const courses = Array.isArray(semester?.courses) ? semester.courses : [];
  const regular = courses.flatMap((course) => (course.meetings || []).map((meeting) => ({
    course,
    meeting: resolveMeeting(meeting, week, overrides),
    active: isMeetingActive(meeting, week),
    kind: 'course'
  })));
  const dates = datesForWeek(semester.firstMonday, week).map(toISODate);
  const milestones = courses.flatMap((course) => (course.milestones || [])
    .filter((item) => dates.includes(item.date))
    .map((item) => ({
      course,
      meeting: {
        id: item.id,
        day: dates.indexOf(item.date) + 1,
        start: item.period || 9,
        end: item.endPeriod || item.period || 10,
        location: item.location || '',
        weeks: [week],
        title: item.title
      },
      active: true,
      milestone: item,
      kind: 'milestone'
    })));
  return [...regular, ...milestones];
}

// Collapse connected, overlapping blocks on the same day into one visual slot.
// The original occurrences stay intact so the slot sheet can expose every course.
export function groupOverlappingOccurrences(items) {
  const groups = [];
  const ordered = [...items].sort((a, b) => (
    a.meeting.day - b.meeting.day
    || a.meeting.start - b.meeting.start
    || a.meeting.end - b.meeting.end
  ));
  ordered.forEach((item) => {
    const last = groups.at(-1);
    if (last && last.day === item.meeting.day && item.meeting.start <= last.end) {
      last.items.push(item);
      last.start = Math.min(last.start, item.meeting.start);
      last.end = Math.max(last.end, item.meeting.end);
      return;
    }
    groups.push({
      day: item.meeting.day,
      start: item.meeting.start,
      end: item.meeting.end,
      items: [item]
    });
  });
  return groups;
}

export function courseFingerprint(course) {
  // Imported relatedId values may come from a model and are not guaranteed to
  // be stable. The normalized title is the durable identity; it also folds the
  // usual “课程 / 课程实验” pair into one course with multiple arrangements.
  const identitySource = course?.source === 'import'
    ? (course.title || course.relatedId || '')
    : (course?.relatedId || course?.title || '');
  const source = String(identitySource).toLowerCase()
    .replace(/[（(]\s*(?:实验|实践|实训|课程设计)\s*[)）]\s*$/u, '')
    .replace(/(?:实验|实践|实训|课程设计)(?:课|课程)?\s*$/u, '')
    .replace(/^\s*(?:实验|实践|实训)(?:课|课程)?[\s·:：-]+/u, '');
  return source.replace(/[\s·:：()（）_-]/g, '');
}

function importedMeetingFingerprint(meeting) {
  return [
    meeting.day,
    meeting.start,
    meeting.end,
    meeting.category || '',
    String(meeting.teacher || '').trim().toLowerCase(),
    normalizedLocationPart(meeting.location)
  ].join('|');
}

function arrangementSlotFingerprint(meeting) {
  return [
    Number(meeting?.day) || 0,
    Number(meeting?.start) || 0,
    Number(meeting?.end) || Number(meeting?.start) || 0,
    String(meeting?.category || '理论').trim()
  ].join('|');
}

function normalizedWeekKey(meeting) {
  return parseWeekSpec(meeting?.weeks).join(',');
}

function isPlaceholderLocation(location) {
  const value = String(location || '').replace(/[\s·:：/_-]/g, '');
  return !value || /(?:未排地点|地点待定|待定|未安排|暂无|无)$/.test(value);
}

function normalizedLocationPart(value) {
  return String(value || '').trim().toLowerCase().replace(/[－–—]/g, '-').replace(/\s+/g, '');
}

function explicitCampus(location) {
  return normalizedLocationPart(String(location || '').match(/([^/，,]*(?:校区|园区))/)?.[1]);
}

function locationsEquivalent(first, second) {
  const left = normalizedLocationPart(first);
  const right = normalizedLocationPart(second);
  if (left === right) return true;
  if (!left || !right || isPlaceholderLocation(first) || isPlaceholderLocation(second)) return false;
  const leftRoom = normalizedLocationPart(roomOnly(first));
  const rightRoom = normalizedLocationPart(roomOnly(second));
  if (!leftRoom || leftRoom !== rightRoom) return false;
  const leftCampus = explicitCampus(first);
  const rightCampus = explicitCampus(second);
  return !leftCampus || !rightCampus || leftCampus === rightCampus;
}

function moreCompleteLocation(first, second) {
  if (isPlaceholderLocation(first)) return second || first;
  if (isPlaceholderLocation(second)) return first || second;
  const left = String(first || '').trim();
  const right = String(second || '').trim();
  const leftScore = (explicitCampus(left) ? 100 : 0) + left.length;
  const rightScore = (explicitCampus(right) ? 100 : 0) + right.length;
  return rightScore > leftScore ? right : left;
}

function mergeTeacherNames(first, second) {
  const left = String(first || '').trim();
  const right = String(second || '').trim();
  if (!left) return right;
  if (!right || left === right || left.includes(right)) return left;
  if (right.includes(left)) return right;
  return `${left}、${right}`;
}

function teacherValuesConflict(first, second) {
  const left = String(first || '').trim();
  const right = String(second || '').trim();
  return Boolean(left && right && left !== right && !left.includes(right) && !right.includes(left));
}

function weekSetsOverlap(first, second) {
  const left = new Set(parseWeekSpec(first?.weeks));
  return parseWeekSpec(second?.weeks).some((week) => left.has(week));
}

function appendImportedMeeting(targetMeetings, meeting) {
  const exact = targetMeetings.find((current) => (
    arrangementSlotFingerprint(current) === arrangementSlotFingerprint(meeting)
    && locationsEquivalent(current.location, meeting.location)
    && (!teacherValuesConflict(current.teacher, meeting.teacher) || weekSetsOverlap(current, meeting))
  ));
  if (exact) {
    exact.weeks = [...new Set([...parseWeekSpec(exact.weeks), ...parseWeekSpec(meeting.weeks)])].sort((a, b) => a - b);
    exact.teacher = mergeTeacherNames(exact.teacher, meeting.teacher);
    exact.location = moreCompleteLocation(exact.location, meeting.location);
    return;
  }

  // Some imports describe the same lab twice: once with “未排地点” and once
  // with the actual room. Only collapse them when their week sets are exactly
  // equal, otherwise the room may genuinely change during the semester.
  const betterLocationMatch = targetMeetings.find((current) => (
    arrangementSlotFingerprint(current) === arrangementSlotFingerprint(meeting)
    && normalizedWeekKey(current) === normalizedWeekKey(meeting)
    && isPlaceholderLocation(current.location) !== isPlaceholderLocation(meeting.location)
  ));
  if (betterLocationMatch) {
    if (isPlaceholderLocation(betterLocationMatch.location)) betterLocationMatch.location = meeting.location;
    betterLocationMatch.teacher = mergeTeacherNames(betterLocationMatch.teacher, meeting.teacher);
    return;
  }
  const next = { ...meeting };
  if (next.id && targetMeetings.some((current) => current.id === next.id)) {
    next.id = `${next.id}-variant-${targetMeetings.length + 1}`;
  }
  targetMeetings.push(next);
}

function mergeMilestones(first = [], second = []) {
  const seen = new Set();
  return [...first, ...second].filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const key = item.id || [item.type, item.title, item.date, item.time, item.period, item.endPeriod, item.location].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Repairs model/import duplicates without touching manual or bundled courses.
 * Exact arrangements are folded together and their teaching weeks are united;
 * genuinely different days, periods, rooms, teachers or categories remain as
 * separate arrangements under the same course.
 */
export function mergeDuplicateImportedCourses(inputCourses) {
  const result = [];
  const byIdentity = new Map();
  (Array.isArray(inputCourses) ? inputCourses : []).forEach((sourceCourse) => {
    if (!sourceCourse || typeof sourceCourse !== 'object') return;
    if (sourceCourse.source !== 'import') {
      result.push(sourceCourse);
      return;
    }
    const identity = courseFingerprint(sourceCourse);
    if (!identity) {
      result.push(sourceCourse);
      return;
    }
    const normalizedMeetings = (Array.isArray(sourceCourse.meetings) ? sourceCourse.meetings : []).map((meeting) => ({
      ...meeting,
      category: meeting.category || sourceCourse.category || '理论',
      teacher: meeting.teacher || sourceCourse.teacher || '',
      weeks: parseWeekSpec(meeting.weeks)
    }));
    const target = byIdentity.get(identity);
    if (!target) {
      const course = {
        ...sourceCourse,
        relatedId: identity,
        meetings: [],
        milestones: mergeMilestones(sourceCourse.milestones || [], [])
      };
      normalizedMeetings.forEach((meeting) => appendImportedMeeting(course.meetings, meeting));
      byIdentity.set(identity, course);
      result.push(course);
      return;
    }

    normalizedMeetings.forEach((meeting) => appendImportedMeeting(target.meetings, meeting));
    if (String(sourceCourse.title || '').length < String(target.title || '').length) target.title = sourceCourse.title;
    if (!target.teacher && sourceCourse.teacher) target.teacher = sourceCourse.teacher;
    if (!target.credits && sourceCourse.credits) target.credits = sourceCourse.credits;
    if (!target.notes && sourceCourse.notes) target.notes = sourceCourse.notes;
    if (!target.gradeComposition && sourceCourse.gradeComposition) target.gradeComposition = sourceCourse.gradeComposition;
    if ((!target.rollCall || target.rollCall === '未知') && sourceCourse.rollCall) target.rollCall = sourceCourse.rollCall;
    target.milestones = mergeMilestones(target.milestones, sourceCourse.milestones || []);
    target.recognitionNote = [...new Set([target.recognitionNote, sourceCourse.recognitionNote].filter(Boolean))].join('；');
    const confidenceValues = [target.recognitionConfidence, sourceCourse.recognitionConfidence].map(Number).filter(Number.isFinite);
    if (confidenceValues.length) target.recognitionConfidence = Math.min(...confidenceValues);
    target.category = target.category === '理论'
      || sourceCourse.category === '理论'
      || target.meetings.some((meeting) => meeting.category === '理论') ? '理论' : (target.category || sourceCourse.category || '实验');
  });
  return result;
}

export function mergeImportedSemester(existing, imported) {
  const incomingCourses = mergeDuplicateImportedCourses(imported?.courses || []);
  if (!existing) return { ...imported, courses: incomingCourses };
  const existingCourses = mergeDuplicateImportedCourses(existing.courses || []);
  const oldByFingerprint = new Map();
  existingCourses.forEach((course) => {
    const fingerprint = courseFingerprint(course);
    oldByFingerprint.set(fingerprint, [...(oldByFingerprint.get(fingerprint) || []), course]);
  });
  const importedFingerprints = new Set(incomingCourses.map(courseFingerprint));
  const merged = incomingCourses.map((course) => {
    const previousCourses = oldByFingerprint.get(courseFingerprint(course)) || [];
    if (!previousCourses.length) return course;
    const previous = previousCourses[0];
    const previousMeetings = previousCourses.flatMap((item) => item.meetings || []);
    const previousByMeeting = new Map(previousMeetings.map((meeting) => [importedMeetingFingerprint(meeting), meeting]));
    const claimedPreviousMeetingIds = new Set();
    return {
      ...course,
      id: previous.id,
      color: previousCourses.find((item) => item.color)?.color || course.color,
      notes: previousCourses.find((item) => item.notes)?.notes || '',
      gradeComposition: previousCourses.find((item) => item.gradeComposition)?.gradeComposition || '',
      rollCall: previousCourses.find((item) => item.rollCall && item.rollCall !== '未知')?.rollCall || '未知',
      milestones: previousCourses.flatMap((item) => item.milestones || []),
      meetings: course.meetings.map((meeting, index) => ({
        ...meeting,
        id: (() => {
          const exact = previousByMeeting.get(importedMeetingFingerprint(meeting));
          const slotCandidates = previousMeetings.filter((candidate) => (
            arrangementSlotFingerprint(candidate) === arrangementSlotFingerprint(meeting)
            && !claimedPreviousMeetingIds.has(candidate.id)
          ));
          const matched = exact && !claimedPreviousMeetingIds.has(exact.id)
            ? exact
            : slotCandidates.length === 1 ? slotCandidates[0] : null;
          const fallback = previousMeetings[index];
          const id = matched?.id
            || (fallback && !claimedPreviousMeetingIds.has(fallback.id) ? fallback.id : meeting.id);
          if (id) claimedPreviousMeetingIds.add(id);
          return id;
        })()
      }))
    };
  });
  existingCourses
    .filter((course) => course.source === 'manual' || !importedFingerprints.has(courseFingerprint(course)))
    .forEach((course) => merged.push(course));
  return { ...existing, ...imported, courses: mergeDuplicateImportedCourses(merged) };
}
