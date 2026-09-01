import { Capacitor, registerPlugin } from '@capacitor/core';
import { PERIODS, addDays, displayLocation, parseWeekSpec, resolveMeeting } from './schedule';

const ClassReminders = registerPlugin('ClassReminders');

function occurrenceTime(semester, week, day, period) {
  const date = addDays(semester.firstMonday, (week - 1) * 7 + day - 1);
  const [hours, minutes] = PERIODS[period - 1][0].split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes).getTime();
}

export function buildReminderPayload(state, now = Date.now()) {
  const leadMinutes = Math.max(0, Number(state?.settings?.reminderMinutes || 10));
  const latest = now + 1000 * 60 * 60 * 24 * 730;
  const reminders = [];
  (state?.semesters || []).forEach((semester) => (semester.courses || []).forEach((course) => (course.meetings || []).forEach((baseMeeting) => {
    parseWeekSpec(baseMeeting.weeks, semester.weekCount).forEach((week) => {
      const meeting = resolveMeeting(baseMeeting, week, state.overrides);
      if (meeting.hidden || meeting.start < 1 || meeting.start > PERIODS.length) return;
      const startAt = occurrenceTime(semester, week, meeting.day, meeting.start);
      const notifyAt = startAt - leadMinutes * 60_000;
      if (notifyAt <= now || notifyAt > latest) return;
      reminders.push({
        id: `${semester.id}-${baseMeeting.id}-${week}`,
        title: course.category === '实验' ? `实验 · ${course.title}` : course.title,
        teacher: course.teacher || '教师待定',
        location: displayLocation(meeting.location, 'full'),
        startClock: PERIODS[meeting.start - 1][0],
        startAt,
        notifyAt,
        leadMinutes
      });
    });
  })));
  return reminders;
}

export function remindersAvailable() {
  return Capacitor.isNativePlatform();
}

export async function requestReminderAccess() {
  if (!remindersAvailable()) return { native: false };
  return ClassReminders.requestAccess();
}

export async function syncNativeReminders(state) {
  if (!remindersAvailable()) return { native: false, count: 0 };
  const reminders = state.settings.remindersEnabled ? buildReminderPayload(state) : [];
  return ClassReminders.sync({ reminders });
}

export async function getReminderStatus() {
  if (!remindersAvailable()) return { native: false, notifications: false, exactAlarms: false };
  return ClassReminders.getStatus();
}

export async function openReminderSettings() {
  if (!remindersAvailable()) return { native: false };
  return ClassReminders.openAppSettings();
}
