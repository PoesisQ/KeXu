import { Capacitor, registerPlugin } from '@capacitor/core';
import { DEFAULT_PERIODS, addDays, displayLocation, normalizePeriodTimes, parseWeekSpec, resolveMeeting } from './schedule';

const ClassReminders = globalThis.__kexuClassRemindersPlugin
  || (globalThis.__kexuClassRemindersPlugin = registerPlugin('ClassReminders'));

function occurrenceTime(semester, week, day, period, periods = DEFAULT_PERIODS) {
  const date = addDays(semester.firstMonday, (week - 1) * 7 + day - 1);
  const [hours, minutes] = periods[period - 1][0].split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes).getTime();
}

export function buildReminderPayload(state, now = Date.now()) {
  const leadMinutes = Math.max(0, Number(state?.settings?.reminderMinutes || 10));
  const periods = normalizePeriodTimes(state?.settings?.periodTimes);
  // Avoid OEM per-app alarm quotas. The app resynchronizes on every launch,
  // data change and package update, so one academic year is ample coverage.
  const latest = now + 1000 * 60 * 60 * 24 * 370;
  const reminders = [];
  (state?.semesters || []).forEach((semester) => (semester.courses || []).forEach((course) => (course.meetings || []).forEach((baseMeeting) => {
    parseWeekSpec(baseMeeting.weeks, semester.weekCount).forEach((week) => {
      const meeting = resolveMeeting(baseMeeting, week, state.overrides);
      if (meeting.hidden || meeting.start < 1 || meeting.start > periods.length) return;
      const startAt = occurrenceTime(semester, week, meeting.day, meeting.start, periods);
      const notifyAt = startAt - leadMinutes * 60_000;
      if (notifyAt <= now || notifyAt > latest) return;
      reminders.push({
        id: `${semester.id}-${baseMeeting.id}-${week}`,
        title: (meeting.category || course.category) === '实验' ? `实验 · ${course.title}` : course.title,
        teacher: meeting.teacher || course.teacher || '教师待定',
        location: displayLocation(meeting.location, 'full'),
        startClock: periods[meeting.start - 1][0],
        startAt,
        notifyAt,
        leadMinutes
      });
    });
  })));
  return reminders.sort((a, b) => a.notifyAt - b.notifyAt).slice(0, 400);
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

export async function openBatterySettings() {
  if (!remindersAvailable()) return { native: false };
  return ClassReminders.openBatterySettings();
}

export async function sendTestReminder() {
  if (!remindersAvailable()) return { native: false, delivered: false };
  return ClassReminders.sendTest();
}
