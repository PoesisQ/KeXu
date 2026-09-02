import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  BellRing, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileScan,
  GraduationCap, Image as ImageIcon, LayoutGrid, MapPin, MoreHorizontal, Palette, Plus,
  Settings2, Sparkles, Trash2, Upload, UserRound, X
} from 'lucide-react';
import { COLORS, normalizeWeekFontSize } from './data';
import { IMPORT_ACCEPT } from './importFormats';
import { APP_NAME, APP_VERSION, backupFileName } from './config';
import {
  DEFAULT_PERIODS, WEEKDAYS, addDays, cardLocationLayout, currentAcademicWeek, datesForWeek, displayLocation, formatPeriodRange,
  formatWeekSpec, groupOverlappingOccurrences, isMeetingActive, locationWrapParts, meetingKey, mergeImportedSemester, occurrencesForWeek, parseWeekSpec,
  normalizePeriodTimes, resolveMeeting, shiftSemesterStart, shouldForceRoomWrap, splitMeetingFromWeek, toISODate
} from './schedule';
import { exportState, loadState, saveState } from './storage';
import { getReminderStatus, openBatterySettings, openReminderSettings, remindersAvailable, requestReminderAccess, sendTestReminder, syncNativeReminders } from './reminders';
import { useWeekPager } from './hooks/useWeekPager';
import { useBackHandler } from './hooks/useBackHandler';
import { backStack } from './backNavigation';
import { groupBadgeLabel } from './presentation';
import { pointerVelocity, resolveRevealSwipe } from './gesture';

const SystemAppearance = globalThis.__kexuSystemAppearancePlugin
  || (globalThis.__kexuSystemAppearancePlugin = registerPlugin('SystemAppearance'));
const SEMESTER_WEEK_OPTIONS = Array.from({ length: 30 }, (_, index) => ({
  value: String(index + 1), label: `${index + 1} 周`
}));
const shortDate = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });
function CardLocation({ value, context = '', lines = 2, className = 'card-location', icon = true }) {
  const text = String(value || '地点待定').trim();
  const fullText = context ? `${context} · ${text}` : text;
  const forceRoomWrap = lines > 1 && !context && shouldForceRoomWrap(text);
  const renderText = (content) => locationWrapParts(content).map((part, index) => <React.Fragment key={`${part.text}-${index}`}>
    {part.text}{part.breakAfter && (forceRoomWrap && /^[-－]$/.test(part.text) ? <br /> : <wbr />)}
  </React.Fragment>);
  return <span className={`${className} location-lines-${lines} ${context ? 'location-stacked' : ''}`} title={fullText}>
    {icon && <MapPin size={10} />}
    {context ? <><span className="location-context">{context}</span><span className="location-room">{text}</span></> : renderText(text)}
  </span>;
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function suggestedSemesterName(date = new Date()) {
  const year = date.getFullYear();
  return date.getMonth() >= 7 ? `${year}-${year + 1} 第1学期` : `${year - 1}-${year} 第2学期`;
}
function mondayOfCurrentWeek(date = new Date()) { return toISODate(addDays(date, -((date.getDay() + 6) % 7))); }

function IconButton({ label, children, className = '', ...props }) {
  return <button type="button" aria-label={label} className={`icon-button ${className}`} {...props}>{children}</button>;
}

function TopBar({ semester, week, weekLabelRef, currentWeek, onNavigate, onPickWeek, openImport }) {
  const canReturn = currentWeek >= 1 && currentWeek <= semester.weekCount && week !== currentWeek;
  return (
    <header className="topbar">
      <div className="brand-block">
        <div>
          <div className="week-heading"><button className="week-title" aria-haspopup="dialog" onClick={onPickWeek}><span ref={weekLabelRef}>第{week}周</span><ChevronDown /></button>{canReturn && <button className="return-week" onClick={() => onNavigate(currentWeek, true)}>回本周</button>}</div>
          <div className="semester-caption">{semester.name}</div>
        </div>
      </div>
      <div className="top-actions">
        <IconButton label="上一周" onClick={() => onNavigate(-1)}><ChevronLeft /></IconButton>
        <IconButton label="下一周" onClick={() => onNavigate(1)}><ChevronRight /></IconButton>
        <IconButton label="导入或添加" className="filled" onClick={openImport}><Plus /></IconButton>
      </div>
    </header>
  );
}

function WeekDates({ semester, week, selectedDay, onSelectDay, today }) {
  const dates = datesForWeek(semester.firstMonday, week);
  return (
    <div className="week-dates">
      {dates.map((date, index) => {
        const isToday = toISODate(date) === toISODate(today);
        return (
          <button key={toISODate(date)} className={`date-head ${selectedDay === index + 1 ? 'selected' : ''} ${isToday ? 'today' : ''}`} onClick={() => onSelectDay(index + 1)}>
            <span>周{WEEKDAYS[index]}</span>
            <strong>{date.getDate()}</strong>
            {isToday && <i />}
          </button>
        );
      })}
    </div>
  );
}

function MonthCorner({ semester, week }) {
  const monthAt = (targetWeek) => targetWeek >= 1 && targetWeek <= semester.weekCount
    ? datesForWeek(semester.firstMonday, targetWeek)[0].getMonth() + 1
    : null;
  const current = monthAt(week);
  const previous = monthAt(week - 1);
  const next = monthAt(week + 1);
  const previousChanges = previous !== null && previous !== current;
  const nextChanges = next !== null && next !== current;
  return <div className={`month-corner-layer ${previousChanges ? 'month-change-previous' : ''} ${nextChanges ? 'month-change-next' : ''}`} aria-live="polite">
    <div className="month-corner-page month-current"><strong>{current}</strong><span>月</span></div>
    {previousChanges && <div className="month-corner-page month-previous" aria-hidden="true"><strong>{previous}</strong><span>月</span></div>}
    {nextChanges && <div className="month-corner-page month-next" aria-hidden="true"><strong>{next}</strong><span>月</span></div>}
  </div>;
}

function CourseCard({ item, week, locationMode, onOpen }) {
  const { course, meeting, active, kind, milestone } = item;
  const lab = (meeting.category || course.category) === '实验';
  const title = kind === 'milestone' ? `${milestone.type} · ${course.title}` : course.title;
  const locationLabel = displayLocation(meeting.location, locationMode);
  const locationLayout = cardLocationLayout(meeting.location, locationMode);
  const periodSpan = meeting.end - meeting.start + 1;
  const locationLines = periodSpan >= 2 ? 2 : 1;
  if (!active && kind === 'course') return (
    <button
      className="course-card inactive inactive-strip-card"
      data-periods={periodSpan}
      style={{ '--course': course.color, top: `${(meeting.start - 1) * 58 + 4}px`, height: `${(meeting.end - meeting.start + 1) * 58 - 7}px` }}
      onClick={(event) => { event.stopPropagation(); onOpen(item); }}
      aria-label={`${lab ? '实验 ' : ''}${course.title} ${locationLabel} 非本周`}
    >
      <span className="card-accent" aria-hidden="true" />
      <span className="inactive-strip-heading">非本周</span>
      <span className="inactive-color-strip" style={{ '--strip-color': course.color }} aria-hidden="true" />
      <CardLocation value={locationLayout.text} context={locationLayout.context} lines={locationLines} className="inactive-strip-location" icon={false} />
    </button>
  );
  return (
    <button
      className={`course-card ${active ? '' : 'inactive'} ${kind === 'milestone' ? 'milestone-card' : ''}`}
      data-periods={periodSpan}
      style={{ '--course': course.color, top: `${(meeting.start - 1) * 58 + 4}px`, height: `${(meeting.end - meeting.start + 1) * 58 - 7}px` }}
      onClick={(event) => { event.stopPropagation(); onOpen(item); }}
    >
      <span className="card-accent" />
      <span className={`card-title ${/[A-Za-z]{4}/.test(title) ? 'english-title' : ''}`}>
        {lab && <b className="type-tag">实验</b>}
        {kind === 'milestone' && <b className="type-tag warm">{milestone.type}</b>}
        {title}
      </span>
      <CardLocation value={locationLayout.text} context={locationLayout.context} lines={locationLines} />
      {!active && <span className="inactive-label">非本周</span>}
      {active && isMeetingActive(meeting, week) && <span className="active-dot" />}
    </button>
  );
}

function CourseGroupCard({ group, locationMode, onOpen }) {
  const activeItems = group.items.filter((item) => item.active);
  const primary = activeItems[0] || group.items[0];
  const { course, meeting } = primary;
  const locationLayout = cardLocationLayout(meeting.location, locationMode);
  const active = activeItems.length > 0;
  const periodSpan = group.end - group.start + 1;
  const inactiveItems = group.items.filter((item) => !item.active);
  const groupLabel = groupBadgeLabel(activeItems.length, group.items.length);
  if (!active) return (
    <button
      className="course-card inactive inactive-strip-card inactive-group-card"
      data-periods={periodSpan}
      style={{ '--course': course.color, top: `${(group.start - 1) * 58 + 4}px`, height: `${(group.end - group.start + 1) * 58 - 7}px` }}
      onClick={(event) => { event.stopPropagation(); onOpen(group); }}
      aria-label={`非本周课程，同一时段共${group.items.length}个安排，点开查看全部`}
    >
      <span className="card-accent" aria-hidden="true" />
      <span className="inactive-strip-heading">非本周</span>
      <span className="inactive-color-list" aria-hidden="true">
        {group.items.slice(0, 5).map((item) => <span className="inactive-color-strip" style={{ '--strip-color': item.course.color }} key={`${item.course.id}-${item.meeting.id}`} />)}
      </span>
      {group.items.length > 5 && <span className="inactive-strip-more" aria-hidden="true">+{group.items.length - 5}</span>}
    </button>
  );
  return (
    <button
      className={`course-card slot-group-card ${active ? '' : 'inactive'}`}
      data-periods={periodSpan}
      style={{ '--course': course.color, top: `${(group.start - 1) * 58 + 4}px`, height: `${(group.end - group.start + 1) * 58 - 7}px` }}
      onClick={(event) => { event.stopPropagation(); onOpen(group); }}
      aria-label={`${active ? '本周课程' : '非本周课程'}，同一时段共${group.items.length}个安排，点开查看全部`}
    >
      <span className="card-accent" />
      <span className="slot-count">{groupLabel}</span>
      <span className={`card-title ${/[A-Za-z]{4}/.test(course.title) ? 'english-title' : ''}`}>
        {(meeting.category || course.category) === '实验' && <b className="type-tag">实验</b>}
        {course.title}
      </span>
      {!!inactiveItems.length && <span className="inactive-color-list compact" aria-hidden="true">
        {inactiveItems.slice(0, 3).map((item) => <span className="inactive-color-strip" style={{ '--strip-color': item.course.color }} key={`${item.course.id}-${item.meeting.id}`} />)}
      </span>}
      <CardLocation value={locationLayout.text} context={locationLayout.context} lines={group.end - group.start + 1 >= 2 ? 2 : 1} />
      {!active && <span className="inactive-label">非本周</span>}
    </button>
  );
}

function WeekGrid({ semester, week, settings, overrides, onOpen, onAdd }) {
  const periods = normalizePeriodTimes(settings.periodTimes);
  const items = useMemo(() => occurrencesForWeek(semester, week, overrides)
    .filter((item) => !item.meeting.hidden && (settings.showInactive || item.active)), [semester, week, overrides, settings.showInactive]);
  const groups = useMemo(() => groupOverlappingOccurrences(items), [items]);
  return <>
        <div className="grid-surface">
          {periods.map((_, row) => Array.from({ length: 7 }, (_, day) => (
            <button aria-label={`周${WEEKDAYS[day]}第${row + 1}节添加`} className="empty-cell" key={`${row}-${day}`} onClick={() => onAdd(day + 1, row + 1)} />
          )))}
        </div>
        <div className="course-columns">
          {Array.from({ length: 7 }, (_, dayIndex) => (
            <div className="course-column" key={dayIndex}>
              {groups.filter((group) => group.day === dayIndex + 1).map((group) => group.items.length === 1 ? (
                <CourseCard key={`${group.items[0].kind}-${group.items[0].meeting.id}`} item={group.items[0]} week={week} locationMode={settings.locationMode} onOpen={onOpen} />
              ) : (
                <CourseGroupCard key={`group-${group.day}-${group.start}-${group.end}`} group={group} locationMode={settings.locationMode} onOpen={onOpen} />
              ))}
            </div>
          ))}
        </div>
  </>;
}

function PeriodRail({ periods }) {
  return <div className="period-rail" aria-label="上课时间">
    {periods.map(([start, end], index) => <div className="period-label" key={`${index}-${start}`}><strong>{index + 1}</strong><span>{start}<br />{end}</span></div>)}
  </div>;
}

function SlotSheet({ group, week, locationMode, periods, onClose, onChoose }) {
  useBackHandler(true, onClose);
  const ordered = [...group.items].sort((a, b) => Number(b.active) - Number(a.active) || a.meeting.start - b.meeting.start);
  return <div className="modal-root" role="dialog" aria-modal="true" aria-label="该时段全部课程">
    <button className="modal-backdrop" aria-label="关闭" onClick={onClose} />
    <section className="bottom-sheet slot-sheet">
      <div className="sheet-handle" />
      <div className="sheet-heading">
        <div><span className="eyebrow">第{week}周 · 周{WEEKDAYS[group.day - 1]} · 第{group.start}-{group.end}节</span><h2>该时段的全部课程</h2></div>
        <IconButton label="关闭" onClick={onClose}><X /></IconButton>
      </div>
      <div className="slot-course-list">
        {ordered.map((item) => <button key={`${item.kind}-${item.course.id}-${item.meeting.id}`} onClick={() => onChoose(item)}>
          <i style={{ background: item.course.color }} />
          <span className="slot-course-main">
            <span className="slot-course-title">{(item.meeting.category || item.course.category) === '实验' && <em>实验</em>}{item.kind === 'milestone' && <em>{item.milestone.type}</em>}{item.course.title}</span>
            <small>{formatWeekSpec(parseWeekSpec(item.meeting.weeks))} · 第{item.meeting.start}-{item.meeting.end}节 · {formatPeriodRange(item.meeting.start, item.meeting.end, periods)}</small>
            <small><MapPin size={12} />{displayLocation(item.meeting.location, locationMode)}</small>
          </span>
          <span className={`slot-status ${item.active ? 'active' : ''}`}>{item.active ? '本周' : '非本周'}</span>
          <ChevronRight />
        </button>)}
      </div>
    </section>
  </div>;
}

function WeekPicker({ semester, week, currentWeek, onSelect, onClose }) {
  useBackHandler(true, onClose);
  return <div className="modal-root" role="dialog" aria-modal="true" aria-label="选择周次">
    <button className="modal-backdrop" aria-label="关闭周次选择" onClick={onClose} />
    <section className="bottom-sheet week-picker-sheet">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">{semester.name}</span><h2>选择周次</h2></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></div>
      <div className="week-choice-grid">
        {Array.from({ length: semester.weekCount }, (_, index) => index + 1).map((value) => {
          const dates = datesForWeek(semester.firstMonday, value);
          const isCurrent = value === currentWeek;
          return <button aria-label={`第${value}周 ${shortDate.format(dates[0])}至${shortDate.format(dates[6])}`} className={`${value === week ? 'selected' : ''} ${isCurrent ? 'current' : ''}`} key={value} onClick={() => onSelect(value)}>
            <strong>{value}</strong>
            <span>{shortDate.format(dates[0])}–{shortDate.format(dates[6])}</span>
            {isCurrent && <em>本周</em>}
          </button>;
        })}
      </div>
    </section>
  </div>;
}

function dayMetaForIndex(semester, index) {
  if (index < 1 || index > semester.weekCount * 7) return null;
  const week = Math.floor((index - 1) / 7) + 1;
  const day = ((index - 1) % 7) + 1;
  const dates = datesForWeek(semester.firstMonday, week);
  return { index, week, day, date: dates[day - 1], dates };
}

function DayChrome({ semester, dayIndex, onSelectDate, onAdd, onToday, today }) {
  const current = dayMetaForIndex(semester, dayIndex);
  const previous = dayMetaForIndex(semester, dayIndex - 1);
  const next = dayMetaForIndex(semester, dayIndex + 1);
  const boundaryPrevious = current.day === 1 ? previous : null;
  const boundaryNext = current.day === 7 ? next : null;
  const summaryPages = [{ slot: -1, meta: previous }, { slot: 0, meta: current }, { slot: 1, meta: next }];
  const todayPages = [
    { className: 'today-current', meta: current, interactive: true },
    { className: 'today-previous', meta: previous, interactive: false },
    { className: 'today-next', meta: next, interactive: false }
  ];
  const selectionPages = [
    { className: 'selection-current', meta: current },
    { className: 'selection-previous', meta: previous || current },
    { className: 'selection-next', meta: next || current }
  ];
  const renderSelectionText = (meta, className) => <span className={`day-selection-text ${className}`} key={className}><small>{WEEKDAYS[meta.day - 1]}</small><b>{meta.date.getDate()}</b></span>;
  const renderDateLabels = (dates) => <div className="day-strip-labels">
    {dates.map((date, index) => <button type="button" key={toISODate(date)} aria-current={current.day === index + 1 ? 'date' : undefined} onClick={() => onSelectDate((current.week - 1) * 7 + index + 1)}><span>{WEEKDAYS[index]}</span><b>{date.getDate()}</b></button>)}
  </div>;

  return <section className="day-chrome">
    <div className="day-hero">
      <div className="day-summary-window" aria-live="polite">
        {summaryPages.map(({ slot, meta }) => meta && <div className="day-summary-slide" key={meta.index} aria-hidden={slot !== 0} style={{ '--summary-base': `${slot * 100}%` }}><span>第{meta.week}周 · 周{WEEKDAYS[meta.day - 1]}</span><h1>{shortDate.format(meta.date)}</h1></div>)}
      </div>
      <div className="day-hero-actions">
        <div className="today-control" aria-hidden={!onToday}>
          {onToday && todayPages.map(({ className, meta, interactive }) => meta && toISODate(meta.date) !== toISODate(today) && (interactive
            ? <button className={`soft-button today-button today-visual ${className}`} key={className} onClick={onToday}>回到今天</button>
            : <span className={`soft-button today-button today-visual ${className}`} key={className} aria-hidden="true">回到今天</span>))}
        </div>
        <button className="soft-button" onClick={() => onAdd(current.day, 1)}><Plus size={18} />添加</button>
      </div>
    </div>
    <div className="day-strip">
      <span className="day-selection-viewport" aria-hidden="true">
        <span className={`day-selection ${boundaryPrevious ? 'leaving-previous' : ''} ${boundaryNext ? 'leaving-next' : ''}`} style={{ '--selection-base': `${(current.day - 1) * 100}%` }}>
          {selectionPages.map(({ className, meta }) => renderSelectionText(meta, className))}
        </span>
        {boundaryPrevious && <span className="day-selection day-selection-wrap wrap-previous" style={{ '--selection-base': '700%' }}>{renderSelectionText(boundaryPrevious, 'selection-wrap-text')}</span>}
        {boundaryNext && <span className="day-selection day-selection-wrap wrap-next" style={{ '--selection-base': '-100%' }}>{renderSelectionText(boundaryNext, 'selection-wrap-text')}</span>}
      </span>
      {renderDateLabels(current.dates)}
    </div>
  </section>;
}

function DayAgenda({ semester, week, day, settings, overrides, onOpen }) {
  const periods = normalizePeriodTimes(settings.periodTimes);
  const items = occurrencesForWeek(semester, week, overrides)
    .filter((item) => item.meeting.day === day && item.active && !item.meeting.hidden)
    .sort((a, b) => a.meeting.start - b.meeting.start);
  return <section className="agenda">
        {!items.length && <div className="empty-day"><Sparkles /><h3>这天没有课</h3><p>留一点空白，也是一种安排。</p></div>}
        {items.map((item) => (
          <button className="agenda-item" key={item.meeting.id} onClick={() => onOpen(item)}>
            <div className="agenda-time"><strong>{periods[item.meeting.start - 1][0]}</strong><span>{periods[item.meeting.end - 1][1]}</span></div>
            <i style={{ background: item.course.color }} />
            <div className="agenda-main"><h3>{(item.meeting.category || item.course.category) === '实验' && <em>实验</em>}{item.kind === 'milestone' ? `${item.milestone.type} · ` : ''}{item.course.title}</h3><p><MapPin size={14} />{displayLocation(item.meeting.location, settings.locationMode)}</p><p><UserRound size={14} />{item.meeting.teacher || item.course.teacher || '教师待定'}</p></div>
            <ChevronRight size={19} />
          </button>
        ))}
      </section>;
}

function DayPage({ semester, week, day, settings, overrides, onOpen, className = '', style }) {
  return <section className={`day-page ${className}`} style={style}>
    <DayAgenda semester={semester} week={week} day={day} settings={settings} overrides={overrides} onOpen={onOpen} />
  </section>;
}

function ChoiceSheet({ title, value, options, onSelect, onClose, eyebrow = '请选择' }) {
  useBackHandler(true, onClose);
  return <div className="modal-root" role="dialog" aria-modal="true" aria-label={title}>
    <button className="modal-backdrop" aria-label="关闭选择" onClick={onClose} />
    <section className="bottom-sheet choice-sheet">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></div>
      <div className="choice-list">
        {options.map((option) => <button className={option.value === value ? 'selected' : ''} key={option.value} onClick={() => { onSelect(option.value); onClose(); }}>
          <span><b>{option.label}</b>{option.description && <small>{option.description}</small>}</span>
          <i>{option.value === value && <Check />}</i>
        </button>)}
      </div>
    </section>
  </div>;
}

const SEMESTER_ACTION_WIDTH = 78;

function SemesterSwipeRow({ option, selected, isOpen, onOpen, onSelect, onDelete }) {
  const surfaceRef = useRef(null);
  const actionRef = useRef(null);
  const gestureRef = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const applyOffset = useCallback((offset, animated) => {
    if (!surfaceRef.current || !actionRef.current) return;
    const reveal = clamp(-offset, 0, SEMESTER_ACTION_WIDTH);
    const progress = reveal / SEMESTER_ACTION_WIDTH;
    const transition = animated
      ? 'transform .34s cubic-bezier(.18,.84,.22,1), filter .26s ease'
      : 'none';
    surfaceRef.current.style.transition = transition;
    surfaceRef.current.style.clipPath = 'none';
    surfaceRef.current.style.transform = `translate3d(${-reveal}px,0,0)`;
    surfaceRef.current.style.filter = `brightness(${1 - progress * 0.015})`;
    actionRef.current.style.transition = animated
      ? 'opacity .24s ease, transform .36s cubic-bezier(.2,.82,.2,1)'
      : 'none';
    actionRef.current.style.opacity = String(Math.max(0, (progress - 0.06) / 0.94));
    actionRef.current.style.transform = `translate3d(${Math.round((1 - progress) * 18)}px,0,0) scale(${0.92 + progress * 0.08})`;
  }, []);
  useEffect(() => applyOffset(isOpen ? -SEMESTER_ACTION_WIDTH : 0, true), [applyOffset, isOpen]);
  const finishGesture = (event, cancelled = false) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const velocity = pointerVelocity(gesture.samples, 'x');
    const shouldOpen = !cancelled && gesture.axis === 'horizontal'
      ? resolveRevealSwipe({ offset: gesture.offset, velocity, width: SEMESTER_ACTION_WIDTH })
      : isOpen;
    onOpen(shouldOpen ? option.value : null);
    applyOffset(shouldOpen ? -SEMESTER_ACTION_WIDTH : 0, true);
    if (!cancelled && gesture.axis === 'horizontal') suppressClickUntilRef.current = performance.now() + 360;
    gestureRef.current = null;
    surfaceRef.current?.classList.remove('is-dragging');
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  };
  return <div className={`semester-swipe-row ${selected ? 'selected' : ''} ${isOpen ? 'open' : ''}`}>
    <button ref={actionRef} type="button" className="semester-delete-reveal" tabIndex={isOpen ? 0 : -1} aria-label={`删除学期 ${option.label}`} onClick={() => onDelete({ id: option.value, name: option.label })}><Trash2 /><span>删除</span></button>
    <button
      type="button"
      ref={surfaceRef}
      className="semester-swipe-surface"
      onPointerDown={(event) => {
        if ((event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;
        if (!isOpen) onOpen(null);
        surfaceRef.current?.classList.add('is-dragging');
        let captured = false;
        try { event.currentTarget.setPointerCapture(event.pointerId); captured = true; } catch {}
        gestureRef.current = { pointerId: event.pointerId, captured, x: event.clientX, y: event.clientY, startOffset: isOpen ? -SEMESTER_ACTION_WIDTH : 0, offset: isOpen ? -SEMESTER_ACTION_WIDTH : 0, axis: '', samples: [{ x: event.clientX, time: event.timeStamp }] };
      }}
      onPointerMove={(event) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 5) gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.08 ? 'horizontal' : 'vertical';
        if (gesture.axis !== 'horizontal') return;
        event.preventDefault();
        if (!gesture.captured) {
          try { event.currentTarget.setPointerCapture(event.pointerId); gesture.captured = true; } catch {}
        }
        let offset = gesture.startOffset + dx;
        // The card is the solid front of a one-sided drawer. Right swipes on a
        // closed row do not expose a destructive color on the wrong edge.
        if (offset > 0) offset = 0;
        if (offset < -SEMESTER_ACTION_WIDTH) offset = -SEMESTER_ACTION_WIDTH + (offset + SEMESTER_ACTION_WIDTH) * 0.14;
        gesture.offset = offset;
        gesture.samples.push({ x: event.clientX, time: event.timeStamp });
        if (gesture.samples.length > 7) gesture.samples.shift();
        applyOffset(offset, false);
      }}
      onPointerUp={finishGesture}
      onPointerCancel={(event) => finishGesture(event, true)}
      onLostPointerCapture={(event) => { if (gestureRef.current?.pointerId === event.pointerId) finishGesture(event, true); }}
      onClick={(event) => {
        if (performance.now() < suppressClickUntilRef.current) { event.preventDefault(); return; }
        if (isOpen) { onOpen(null); applyOffset(0, true); return; }
        onSelect(option.value);
      }}
    >
      <span className="semester-swipe-copy"><b>{option.label}</b><small>{option.description}</small></span>
      {selected && <span className="semester-current-mark">当前</span>}
    </button>
  </div>;
}

function SemesterChoiceSheet({ value, options, onSelect, onDelete, onClose }) {
  const [openId, setOpenId] = useState(null);
  useBackHandler(true, onClose);
  useEffect(() => { if (openId && !options.some((option) => option.value === openId)) setOpenId(null); }, [openId, options]);
  return <div className="modal-root" role="dialog" aria-modal="true" aria-label="选择学期">
    <button className="modal-backdrop" aria-label="关闭选择" onClick={onClose} />
    <section className="bottom-sheet choice-sheet semester-choice-sheet">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">左滑学期可管理</span><h2>选择学期</h2></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></div>
      <div className="semester-choice-list">
        {options.map((option) => <SemesterSwipeRow key={option.value} option={option} selected={option.value === value} isOpen={openId === option.value} onOpen={setOpenId} onSelect={(nextValue) => { onSelect(nextValue); onClose(); }} onDelete={onDelete} />)}
      </div>
    </section>
  </div>;
}

function ConfirmSheet({ title, description, confirmLabel, onConfirm, onClose }) {
  useBackHandler(true, onClose);
  return <div className="modal-root nested-modal" role="dialog" aria-modal="true" aria-label={title}>
    <button className="modal-backdrop" aria-label="取消" onClick={onClose} />
    <section className="bottom-sheet confirm-sheet">
      <div className="sheet-handle" />
      <div className="confirm-sheet-icon"><Trash2 /></div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="sheet-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="danger-button" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button></div>
    </section>
  </div>;
}

function SettingChoice({ value, onClick }) {
  return <button type="button" className="select-trigger" onClick={onClick}><span>{value}</span><ChevronDown /></button>;
}

function Field({ label, children, className = '' }) { return <label className={`field ${className}`}><span>{label}</span>{children}</label>; }

function PickerField({ label, value, onClick, className = '' }) {
  return <Field label={label} className={className}><button type="button" className="form-select-trigger" onClick={onClick}><span>{value}</span><ChevronDown /></button></Field>;
}

const padClock = (value) => String(value).padStart(2, '0');

function WheelColumn({ value, values, onChange, label }) {
  const ref = useRef(null);
  const frame = useRef(0);
  const interaction = useRef(false);
  const settleTimer = useRef(0);
  const itemHeight = 46;
  useEffect(() => {
    const index = Math.max(0, values.indexOf(value));
    if (ref.current) ref.current.scrollTop = index * itemHeight;
  }, [value, values]);
  const onScroll = () => {
    // WebView dispatches scroll events while the initial scrollTop and
    // scroll-snap position are settling. Only a real gesture may change time.
    if (!interaction.current) return;
    cancelAnimationFrame(frame.current);
    clearTimeout(settleTimer.current);
    frame.current = requestAnimationFrame(() => {
      const index = clamp(Math.round((ref.current?.scrollTop || 0) / itemHeight), 0, values.length - 1);
      if (values[index] !== value) onChange(values[index]);
    });
    settleTimer.current = setTimeout(() => { interaction.current = false; }, 160);
  };
  useEffect(() => () => { cancelAnimationFrame(frame.current); clearTimeout(settleTimer.current); }, []);
  return <div className="time-wheel-column-wrap">
    <div className="time-wheel-selection" aria-hidden="true" />
    <div className="time-wheel-column" ref={ref} onScroll={onScroll} onPointerDown={() => { interaction.current = true; }} onWheel={() => { interaction.current = true; }} role="listbox" aria-label={label}>
      {values.map((option) => <button type="button" role="option" aria-selected={option === value} className={option === value ? 'selected' : ''} key={option} onClick={() => { onChange(option); ref.current?.scrollTo({ top: values.indexOf(option) * itemHeight, behavior: 'smooth' }); }}>{option}</button>)}
    </div>
    <span>{label}</span>
  </div>;
}

function TimeWheelSheet({ title, value, onSelect, onClose }) {
  useBackHandler(true, onClose);
  const [hour, minute] = String(value || '09:00').split(':');
  const [draftHour, setDraftHour] = useState(padClock(Number(hour) || 0));
  const [draftMinute, setDraftMinute] = useState(padClock(Number(minute) || 0));
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => padClock(index)), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, index) => padClock(index)), []);
  return <div className="modal-root nested-modal" role="dialog" aria-modal="true" aria-label={title}>
    <button className="modal-backdrop" aria-label="关闭时间选择" onClick={onClose} />
    <section className="bottom-sheet time-wheel-sheet">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">时间设置</span><h2>{title}</h2></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></div>
      <div className="time-wheel-stage">
        <WheelColumn value={draftHour} values={hours} onChange={setDraftHour} label="时" />
        <strong className="time-wheel-colon">:</strong>
        <WheelColumn value={draftMinute} values={minutes} onChange={setDraftMinute} label="分" />
      </div>
      <div className="sheet-actions"><button className="soft-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => { onSelect(`${draftHour}:${draftMinute}`); onClose(); }}>完成</button></div>
    </section>
  </div>;
}

function addClockMinutes(value, delta) {
  const [hour, minute] = String(value).split(':').map(Number);
  const total = clamp((hour || 0) * 60 + (minute || 0) + delta, 0, 1439);
  return `${padClock(Math.floor(total / 60))}:${padClock(total % 60)}`;
}

function PeriodTimeSheet({ value, onSave, onClose }) {
  useBackHandler(true, onClose);
  const [draft, setDraft] = useState(() => normalizePeriodTimes(value));
  const [clockPicker, setClockPicker] = useState(null);
  const setClock = (index, side, clock) => setDraft((current) => current.map((period, periodIndex) => {
    if (periodIndex !== index) return period;
    const next = [...period];
    next[side] = clock;
    if (side === 0 && next[1] <= next[0]) next[1] = addClockMinutes(clock, 45);
    if (side === 1 && next[0] >= next[1]) next[0] = addClockMinutes(clock, -45);
    return next;
  }));
  return <div className="modal-root" role="dialog" aria-modal="true" aria-label="每节课时间">
    <button className="modal-backdrop" aria-label="关闭时间设置" onClick={onClose} />
    <section className="bottom-sheet period-time-sheet">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">默认节次</span><h2>每节课时间</h2></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></div>
      <p className="period-time-note">时间会同步用于周课表、每日课程和课前提醒。</p>
      <div className="period-time-list">
        {draft.map(([start, end], index) => <div className="period-time-row" key={index}>
          <strong>{index + 1}</strong>
          <button type="button" onClick={() => setClockPicker({ title: `第 ${index + 1} 节 · 上课`, value: start, index, side: 0 })}>{start}</button>
          <span>—</span>
          <button type="button" onClick={() => setClockPicker({ title: `第 ${index + 1} 节 · 下课`, value: end, index, side: 1 })}>{end}</button>
        </div>)}
      </div>
      <div className="sheet-actions"><button className="soft-button" onClick={() => setDraft(normalizePeriodTimes(DEFAULT_PERIODS))}>恢复默认</button><button className="primary-button" onClick={() => { onSave(draft); onClose(); }}>保存时间</button></div>
    </section>
    {clockPicker && <TimeWheelSheet title={clockPicker.title} value={clockPicker.value} onClose={() => setClockPicker(null)} onSelect={(clock) => setClock(clockPicker.index, clockPicker.side, clock)} />}
  </div>;
}

function SemesterStartSheet({ semester, onSave, onClose }) {
  useBackHandler(true, onClose);
  const [firstMonday, setFirstMonday] = useState(semester.firstMonday);
  const changed = firstMonday && firstMonday !== semester.firstMonday;
  return <div className="modal-root" role="dialog" aria-modal="true" aria-label="调整学期起始日">
    <button className="modal-backdrop" aria-label="关闭学期起始日设置" onClick={onClose} />
    <section className="bottom-sheet semester-start-sheet">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">{semester.name}</span><h2>调整第一周周一</h2></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></div>
      <div className="semester-start-body">
        <p>如果导入时选错了日期，可在这里修正。课程仍保留原来的周次，并整体移动到新的教学周；考试、答辩和 DDL 日期也会同步平移。</p>
        <Field label="第一周周一"><input type="date" value={firstMonday} onChange={(event) => setFirstMonday(event.target.value)} /></Field>
        {changed && <div className="semester-shift-preview"><CalendarDays /><span><b>{semester.firstMonday}</b><ChevronRight /><b>{firstMonday}</b></span></div>}
      </div>
      <div className="sheet-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!changed} onClick={() => { onSave(firstMonday); onClose(); }}>保存并平移</button></div>
    </section>
  </div>;
}

function DetailSheet({ selected, semester, week, periods, overrides, onClose, onSave, onDelete, onAddMilestone }) {
  const course = selected?.course;
  const originalMeeting = selected?.meeting;
  const isNew = selected?.isNew;
  const isMilestone = selected?.kind === 'milestone';
  const [scope, setScope] = useState(isNew ? 'all' : 'this');
  const [showMore, setShowMore] = useState(false);
  const [showMilestone, setShowMilestone] = useState(false);
  const [picker, setPicker] = useState(null);
  const [timePicker, setTimePicker] = useState(null);
  useBackHandler(true, () => {
    if (showMilestone) setShowMilestone(false);
    else if (showMore) setShowMore(false);
    else onClose();
  });
  const [form, setForm] = useState(() => ({
    title: course?.title || '', teacher: originalMeeting?.teacher || course?.teacher || '', credits: course?.credits || '',
    category: originalMeeting?.category || course?.category || '理论', location: originalMeeting?.location || '', day: originalMeeting?.day || 1,
    start: originalMeeting?.start || 1, end: originalMeeting?.end || originalMeeting?.start || 1,
    weeks: formatWeekSpec(parseWeekSpec(originalMeeting?.weeks || [week])).replace(/[第周]/g, '').replace(/、/g, ','),
    gradeComposition: course?.gradeComposition || '', rollCall: course?.rollCall || '未知', notes: course?.notes || '', color: course?.color || COLORS[0]
  }));
  const [milestone, setMilestone] = useState({ type: (originalMeeting?.category || course?.category) === '实验' ? '答辩' : '考试', date: '', time: '09:00', location: originalMeeting?.location || '' });
  const set = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const openPicker = (title, value, options, onSelect) => setPicker({ title, value: String(value), options, onSelect, eyebrow: '课程编辑' });
  const typeOptions = ['理论', '实验', '实践'].map((value) => ({ value, label: value, description: value === '实验' ? '作为本课程的一项独立安排' : '' }));
  const dayOptions = WEEKDAYS.map((name, index) => ({ value: String(index + 1), label: `周${name}` }));
  const periodOptions = periods.map(([start, end], index) => ({ value: String(index + 1), label: `第 ${index + 1} 节`, description: `${start}–${end}` }));
  const rollCallOptions = ['未知', '不点名', '偶尔点名', '每次点名'].map((value) => ({ value, label: value }));
  const milestoneOptions = ['考试', '答辩', 'DDL'].map((value) => ({ value, label: value }));

  return (
    <div className="modal-root" role="dialog" aria-modal="true">
      <button className="modal-backdrop" aria-label="关闭" onClick={onClose} />
      <section className="bottom-sheet detail-sheet">
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div><span className="eyebrow">{isNew ? '新日程' : isMilestone ? selected.milestone.type : `第${week}周 · 周${WEEKDAYS[form.day - 1]}`}</span><h2>{isNew ? '添加课程' : course.title}</h2></div>
          <IconButton label="关闭" onClick={onClose}><X /></IconButton>
        </div>
        <div className="sheet-scroll">
          {!isNew && !isMilestone && (
            <div className="scope-tabs">
              <button className={scope === 'this' ? 'active' : ''} onClick={() => setScope('this')}>仅本次</button>
              <button className={scope === 'from' ? 'active' : ''} onClick={() => setScope('from')}>从第{week}周起</button>
              <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>本安排</button>
              <button className={scope === 'course' ? 'active' : ''} onClick={() => setScope('course')}>整门课</button>
            </div>
          )}
          {!isNew && !isMilestone && <p className="scope-help">{scope === 'course' ? '地点同步到这门课的全部分散安排；每个安排原有的时间和周次保持不变。' : scope === 'all' ? '修改当前这一组上课安排覆盖的全部周次。' : scope === 'from' ? `只修改当前安排第${week}周及之后的部分。` : '只修改现在选中的这一周。'}</p>}
          <div className="form-grid">
            <Field label="课程名称" className="wide"><input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="课程名称" /></Field>
            <PickerField label="类型" value={form.category} onClick={() => openPicker('课程类型', form.category, typeOptions, (value) => set('category', value))} />
            <Field label="学分"><input inputMode="decimal" value={form.credits} onChange={(e) => set('credits', e.target.value)} placeholder="3.5" /></Field>
            <Field label="教师" className="wide"><input value={form.teacher} onChange={(e) => set('teacher', e.target.value)} placeholder="教师姓名" /></Field>
            <Field label="上课地点" className="wide"><input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="示例校区/场地:A2-301" /></Field>
            <PickerField label="星期" value={`周${WEEKDAYS[form.day - 1]}`} onClick={() => openPicker('上课星期', form.day, dayOptions, (value) => set('day', Number(value)))} />
            <Field label="节次"><div className="inline-picker-inputs"><button type="button" className="form-select-trigger" onClick={() => openPicker('开始节次', form.start, periodOptions, (value) => set('start', Number(value)))}><span>第{form.start}节</span><ChevronDown /></button><span>至</span><button type="button" className="form-select-trigger" onClick={() => openPicker('结束节次', form.end, periodOptions, (value) => set('end', Number(value)))}><span>第{form.end}节</span><ChevronDown /></button></div></Field>
            <Field label="周次" className="wide"><input value={form.weeks} onChange={(e) => set('weeks', e.target.value)} placeholder="1-16 或 1-15单" /></Field>
          </div>
          <button className="disclosure" onClick={() => setShowMore((value) => !value)}><span><Settings2 size={17} />课程详情与颜色</span><ChevronDown className={showMore ? 'rotated' : ''} /></button>
          {showMore && <div className="more-fields reveal">
            <Field label="成绩构成"><textarea value={form.gradeComposition} onChange={(e) => set('gradeComposition', e.target.value)} placeholder="平时 30% · 期末 70%" /></Field>
            <PickerField label="点名情况" value={form.rollCall} onClick={() => openPicker('点名情况', form.rollCall, rollCallOptions, (value) => set('rollCall', value))} />
            <Field label="备注"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="教材、分组、注意事项…" /></Field>
            <div className="color-row">{COLORS.map((color) => <button aria-label={color} className={form.color === color ? 'selected' : ''} style={{ background: color }} onClick={() => set('color', color)} key={color}>{form.color === color && <Check />}</button>)}</div>
          </div>}
          {!isNew && !isMilestone && <>
            <button className="disclosure" onClick={() => setShowMilestone((value) => !value)}><span><GraduationCap size={17} />添加考试 / 答辩 / DDL</span><ChevronDown className={showMilestone ? 'rotated' : ''} /></button>
            {showMilestone && <div className="milestone-form reveal">
              <button type="button" className="form-select-trigger" onClick={() => openPicker('日程类型', milestone.type, milestoneOptions, (value) => setMilestone((current) => ({ ...current, type: value })))}><span>{milestone.type}</span><ChevronDown /></button>
              <input type="date" value={milestone.date} onChange={(e) => setMilestone({ ...milestone, date: e.target.value })} />
              <button type="button" className="time-trigger" onClick={() => setTimePicker({ title: `${milestone.type}时间`, value: milestone.time })}><Clock3 /><span>{milestone.time}</span><ChevronRight /></button>
              <input value={milestone.location} onChange={(e) => setMilestone({ ...milestone, location: e.target.value })} placeholder="地点" />
              <button className="soft-button" disabled={!milestone.date} onClick={() => { onAddMilestone(course.id, milestone); setShowMilestone(false); }}>添加到课表</button>
            </div>}
            {!!course.milestones?.length && <div className="milestone-list">{course.milestones.map((item) => <div key={item.id}><b>{item.type}</b><span>{item.date} · {item.time}</span></div>)}</div>}
          </>}
        </div>
        <div className="sheet-actions">
          {!isNew && <IconButton label="删除" className="danger" onClick={() => onDelete(scope)}><Trash2 /></IconButton>}
          <button className="primary-button" disabled={!form.title.trim()} onClick={() => onSave(form, scope)}>{isNew ? '添加到课表' : '保存修改'}</button>
        </div>
      </section>
      {picker && <ChoiceSheet {...picker} onClose={() => setPicker(null)} />}
      {timePicker && <TimeWheelSheet title={timePicker.title} value={timePicker.value} onClose={() => setTimePicker(null)} onSelect={(value) => setMilestone((current) => ({ ...current, time: value }))} />}
    </div>
  );
}

function ImportPreview({ courses, setCourses }) {
  const updateCourse = (index, patch) => setCourses((current) => current.map((course, courseIndex) => courseIndex === index ? { ...course, ...patch } : course));
  return <div className="import-preview">{courses.map((course, index) => <article key={course.id}>
    <i style={{ background: course.color }} />
    <div><input className="preview-title" value={course.title} onChange={(e) => updateCourse(index, { title: e.target.value })} /><p>{course.teacher || '教师待识别'} · {course.credits ? `${course.credits} 学分` : '学分待识别'}{course.recognitionConfidence < 0.72 && <em className="confidence-badge">需核对</em>}</p>{course.recognitionNote && <small className="recognition-note">{course.recognitionNote}</small>}{course.meetings.map((meeting) => <span key={meeting.id}>{meeting.category || course.category || '理论'} · 周{WEEKDAYS[meeting.day - 1]} {meeting.start}-{meeting.end}节 · {formatWeekSpec(parseWeekSpec(meeting.weeks))}</span>)}</div>
    <button onClick={() => setCourses((current) => current.filter((_, courseIndex) => courseIndex !== index))}><X size={16} /></button>
  </article>)}</div>;
}

function ImportSheet({ state, initialSemesterId, onClose, onCommit, onApiKey }) {
  const [step, setStep] = useState('choose');
  const [files, setFiles] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [recognitionMode, setRecognitionMode] = useState(state.settings.apiKey ? 'vision' : 'local');
  const [semesterId, setSemesterId] = useState(initialSemesterId === 'new' ? 'new' : state.activeSemesterId);
  const existing = state.semesters.find((item) => item.id === semesterId);
  const [semesterName, setSemesterName] = useState(existing?.name || suggestedSemesterName());
  const [firstMonday, setFirstMonday] = useState(existing?.firstMonday || mondayOfCurrentWeek());
  const [weekCount, setWeekCount] = useState(existing?.weekCount || 20);
  const [courses, setCourses] = useState([]);
  const [rawText, setRawText] = useState('');
  const [method, setMethod] = useState('');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [picker, setPicker] = useState(null);
  const fileInput = useRef(null);
  const abortRef = useRef(null);
  useEffect(() => {
    if (step !== 'reading') { setElapsed(0); return undefined; }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [step]);
  const close = () => { abortRef.current?.abort(); onClose(); };
  const cancelReading = () => { abortRef.current?.abort(); abortRef.current = null; setStep('choose'); setError('已取消本次识别'); };
  useBackHandler(true, () => {
    if (step === 'review') setStep('choose');
    else if (step === 'reading') cancelReading();
    else close();
  });

  const isImage = (file) => Boolean(file?.type?.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file?.name || ''));
  const addFiles = (chosenFiles) => {
    const incoming = Array.from(chosenFiles || []).filter(Boolean);
    if (!incoming.length) return;
    setError('');
    const combined = [...pendingFiles, ...incoming];
    if (combined.length > 1 && !combined.every(isImage)) {
      setError('多次追加仅支持课表图片；PDF、Word、Excel、XML 或文本请单独导入。');
      if (!pendingFiles.length) setPendingFiles([incoming[0]]);
      return;
    }
    const unique = combined.filter((file, index, list) => list.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index);
    if (unique.length > 8) setError('最多保留前 8 张图片；可以删除不需要的截图后再添加。');
    setPendingFiles(unique.slice(0, 8));
  };
  const begin = async (chosenFiles = pendingFiles) => {
    const selectedFiles = Array.from(chosenFiles || []).slice(0, 8);
    if (!selectedFiles.length) return;
    if (recognitionMode === 'vision' && !state.settings.apiKey) {
      setError('DeepSeek 精确识别需要先在“我的”页面填写 API Key；也可以切换到免费本地解析。');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setFiles(selectedFiles); setStep('reading'); setError(''); setWarning(''); setProgress({ stage: 'prepare', page: 0, total: selectedFiles.length, progress: 0.02, detail: '正在准备解析器' });
    try {
      const { recognizeScheduleFiles } = await import('./importer');
      const result = await recognizeScheduleFiles(selectedFiles, { apiKey: recognitionMode === 'vision' ? state.settings.apiKey : '', preferVision: recognitionMode === 'vision' }, setProgress, controller.signal);
      setRawText(result.rawText); setCourses(result.courses); setMethod(result.method); setWarning(result.warning || ''); setStep('review');
    } catch (reason) {
      if (reason?.name !== 'AbortError') setError(reason.message || '识别失败');
      setStep('choose');
    } finally { if (abortRef.current === controller) abortRef.current = null; }
  };
  const aiRefine = async () => {
    if (!state.settings.apiKey) { setError('请先在“我的”页面保存 DeepSeek API Key'); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    setStep('reading'); setProgress({ stage: 'ai', page: 1, total: 1, progress: 0.65 });
    try { const { refineWithDeepSeek } = await import('./importer'); setCourses(await refineWithDeepSeek(rawText, state.settings.apiKey, controller.signal)); setMethod('本地结果 + DeepSeek 结构化'); setStep('review'); }
    catch (reason) { if (reason?.name !== 'AbortError') setError(reason.message); setStep('review'); }
    finally { if (abortRef.current === controller) abortRef.current = null; }
  };
  const chooseSemesterTarget = (value) => {
    setSemesterId(value);
    const found = state.semesters.find((item) => item.id === value);
    if (found) {
      setSemesterName(found.name);
      setFirstMonday(found.firstMonday);
      setWeekCount(found.weekCount);
    } else {
      setSemesterName(suggestedSemesterName());
      setFirstMonday(mondayOfCurrentWeek());
      setWeekCount(20);
    }
  };
  const semesterOptions = state.semesters.map((item) => ({ value: item.id, label: item.name, description: `${item.weekCount} 周 · ${item.courses.length} 门课程` }));
  const readingTitle = progress?.stage === 'vision' ? `正在理解 ${files.length} 张图片的版面`
    : progress?.stage === 'vision-prepare' ? `正在准备第 ${progress.page}/${progress.total} 张图片`
      : progress?.stage === 'document-render' ? '正在保留 Word 表格版面'
      : progress?.stage === 'fallback' ? '视觉识别不可用，正在安全回退'
        : progress?.stage === 'ai' ? 'DeepSeek 正在整理字段'
          : progress?.stage === 'ocr' ? `正在识别第 ${progress.page}/${progress.total} 张`
            : progress?.stage === 'document' ? '正在读取文档结构' : '正在准备课表识别';

  return <div className="modal-root" role="dialog" aria-modal="true">
    <button className="modal-backdrop" aria-label="关闭" onClick={close} />
    <section className="bottom-sheet import-sheet">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">智能导入</span><h2>{step === 'review' ? `确认 ${courses.length} 门课程` : '从课表开始'}</h2></div><IconButton label="关闭" onClick={close}><X /></IconButton></div>
      <div className="sheet-scroll">
        {step === 'choose' && <>
          <div className="import-intro"><div className="scan-orbit"><FileScan /></div><h3>导入一份课表</h3><p>选择课表截图、PDF 或文档。分段截图可以连续添加，识别后会先让你核对，再保存到学期。</p></div>
          {initialSemesterId === 'new' && <div className="new-semester-intent"><Plus /><div><b>将创建一个独立新学期</b><span>识别完成后设置学期名称与第一周周一。</span></div></div>}
          <div className="recognition-mode" role="group" aria-label="课表识别方式">
            <button type="button" className={recognitionMode === 'vision' ? 'active' : ''} onClick={() => setRecognitionMode('vision')}><Sparkles /><span><b>DeepSeek 版面识别</b><small>适合长截图、合并表格和复杂文档</small></span></button>
            <button type="button" className={recognitionMode === 'local' ? 'active' : ''} onClick={() => setRecognitionMode('local')}><FileScan /><span><b>本地识别</b><small>免费，适合清晰、规则的课表</small></span></button>
          </div>
          <button className={`drop-zone ${pendingFiles.length ? 'compact-drop-zone' : ''}`} onClick={() => fileInput.current?.click()}><Upload /><span>{pendingFiles.length ? '继续添加图片' : '选择课表文件或截图'}</span><small>{pendingFiles.length ? '即使手机每次只能选择一张，也可以重复添加' : 'PDF / 图片 / Excel / DOCX / XML / HTML / 文本'}</small></button>
          <input hidden multiple ref={fileInput} type="file" accept={IMPORT_ACCEPT} onChange={(e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ''; }} />
          {pendingFiles.length > 0 && <div className="pending-files"><div className="pending-files-title"><b>{pendingFiles.every(isImage) ? `${pendingFiles.length} 张截图，按下列顺序联合识别` : '已选择文件'}</b><button onClick={() => setPendingFiles([])}>清空</button></div>{pendingFiles.map((file, index) => <div className="pending-file" key={`${file.name}-${file.size}-${file.lastModified}`}><i>{index + 1}</i><span><b>{file.name}</b><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span><button aria-label={`移除 ${file.name}`} onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X /></button></div>)}<button className="primary-button start-recognition" onClick={() => begin()}>开始识别{pendingFiles.length > 1 ? ` ${pendingFiles.length} 张图片` : ''}</button></div>}
          {recognitionMode === 'vision' && <p className={`privacy-note ${!state.settings.apiKey ? 'key-required-note' : ''}`}>{state.settings.apiKey ? '将使用“我的”中已配置的 DeepSeek API Key。图片、文档版面与表格拓扑仅在本次识别时发送，KeXu 不保留文件副本。' : '使用 DeepSeek 识别前，请先在“我的”中填写 API Key；也可以先使用免费的本地识别。'}</p>}
          {error && <p className="error-text">{error}</p>}
        </>}
        {step === 'reading' && <div className="reading-state"><div className={`scan-animation ${progress?.stage?.startsWith('vision') ? 'vision-scan' : ''}`}>{progress?.stage?.startsWith('vision') ? <Sparkles /> : <FileScan />}<i /></div><h3>{readingTitle}</h3><p>{files.map((item) => item.name).join(' · ')}</p><div className="progress"><i style={{ width: `${Math.max(5, Math.min(100, (progress?.progress || 0.02) * 100))}%` }} /></div><small>{progress?.detail || (progress?.stage === 'ocr' ? '首次使用会下载免费的中文识别模型，请保持应用在前台' : '解析器只在本次导入期间运行')} · {elapsed} 秒</small><button className="cancel-reading" onClick={cancelReading}>取消识别</button></div>}
        {step === 'review' && <>
          <div className="recognition-summary"><Check /><div><b>{method}</b><span>请确认课程名、周次和地点后再保存</span></div></div>
          {warning && <div className="recognition-warning"><Sparkles /><span>{warning}</span></div>}
          <div className="semester-form">
            <div className="semester-target-tabs" role="group" aria-label="课表保存方式">
              <button className={semesterId !== 'new' ? 'active' : ''} onClick={() => chooseSemesterTarget(state.activeSemesterId)}>合并到已有学期</button>
              <button className={semesterId === 'new' ? 'active' : ''} onClick={() => chooseSemesterTarget('new')}>＋ 新建学期</button>
            </div>
            {semesterId !== 'new' && <PickerField label="已有学期" className="semester-existing" value={state.semesters.find((item) => item.id === semesterId)?.name || '选择学期'} onClick={() => setPicker({ title: '选择导入学期', value: semesterId, options: semesterOptions, onSelect: chooseSemesterTarget, eyebrow: '课表保存位置' })} />}
            <Field label={semesterId === 'new' ? '新学期名称' : '学期名称'} className="semester-name"><input value={semesterName} onChange={(e) => setSemesterName(e.target.value)} placeholder="2026-2027 第1学期" /></Field>
            <Field label="第一周周一"><input type="date" value={firstMonday} onChange={(e) => setFirstMonday(e.target.value)} /></Field>
            <PickerField label="学期周数" value={`${weekCount} 周`} onClick={() => setPicker({ title: '选择学期周数', value: String(weekCount), options: SEMESTER_WEEK_OPTIONS, onSelect: (value) => setWeekCount(Number(value)), eyebrow: '新学期范围' })} />
            {semesterId === 'new' && <p className="semester-target-note">导入后会创建独立学期，不会覆盖当前学期的课程和手动修改。</p>}
          </div>
          <ImportPreview courses={courses} setCourses={setCourses} />
          {!courses.length && <div className="empty-recognition"><p>当前结果没有可靠拆出课程。复杂截图建议重新选择“视觉版面识别”；本地 OCR 结果也可以继续交给 DeepSeek 做文字结构校对。</p></div>}
          <button className="ai-button" onClick={aiRefine}><Sparkles />用 DeepSeek 校对结构<span>可选</span></button>
          <details className="raw-text"><summary>查看识别原文与结构</summary><textarea value={rawText} onChange={(e) => setRawText(e.target.value)} /></details>
          {error && <p className="error-text">{error}</p>}
        </>}
      </div>
      {step === 'review' && <div className="sheet-actions"><button className="secondary-button" onClick={() => { setPendingFiles(files); setStep('choose'); }}>重新选择</button><button className="primary-button" disabled={!courses.length || !firstMonday || !semesterName || !weekCount} onClick={() => onCommit({ semesterId, semesterName, firstMonday, weekCount, courses })}>导入并合并</button></div>}
    </section>
    {picker && <ChoiceSheet {...picker} onClose={() => setPicker(null)} />}
  </div>;
}

async function compressWallpaper(file) {
  const image = new Image(); image.src = URL.createObjectURL(file); await image.decode();
  const max = 1600; const ratio = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth * ratio; canvas.height = image.naturalHeight * ratio;
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(image.src);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function SettingsView({ state, setState, onOpenImport, onSemester, onDeleteSemester, onShiftSemester, onReminderToggle, onOpenPermissions, onOpenBattery, onTestReminder, reminderStatus }) {
  const settings = state.settings;
  const wallpaperInput = useRef(null);
  const [picker, setPicker] = useState(null);
  const [semesterSheet, setSemesterSheet] = useState(false);
  const [timeSheet, setTimeSheet] = useState(false);
  const [semesterStartSheet, setSemesterStartSheet] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [exportStatus, setExportStatus] = useState('');
  const update = (patch) => setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  const downloadBackup = async () => {
    const filename = backupFileName(toISODate(new Date()));
    setExportStatus('正在准备备份…');
    try {
      const blob = exportState(state);
      if (Capacitor.isNativePlatform()) {
        const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
        const saved = await Filesystem.writeFile({ path: filename, data: await blob.text(), directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
        await Share.share({ title: '导出 KeXu 完整备份', text: '可保存到文件或发送到其他设备', url: saved.uri, dialogTitle: '保存或发送备份' });
        setExportStatus('备份已交给系统保存');
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = filename; anchor.style.display = 'none';
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setExportStatus('备份已下载');
      }
    } catch (reason) {
      setExportStatus(reason?.message?.includes('cancel') ? '已取消导出' : '导出失败，请重试');
    }
  };
  const locationOptions = [
    { value: 'room', label: '只显示教室', description: '例如 A2-301' },
    { value: 'campus', label: '只显示校区', description: '隐藏楼栋和教室' },
    { value: 'full', label: '完整地址', description: '保留校区、场地和教室' }
  ];
  const reminderOptions = [5, 10, 15, 20].map((value) => ({ value: String(value), label: `${value} 分钟`, description: value === 10 ? '推荐设置' : '' }));
  const themeOptions = [
    { value: 'light', label: '浅色', description: '明亮、柔和的日间界面' },
    { value: 'dark', label: '暗色', description: '降低夜间使用时的亮度' }
  ];
  const fontSizeOptions = [
    { value: 'compact', label: '紧凑', description: '显示更多文字，适合小屏幕' },
    { value: 'standard', label: '标准', description: '清晰度与信息量保持平衡' },
    { value: 'large', label: '较大', description: '课程名、标签和地点更醒目' }
  ];
  const semesterOptions = state.semesters.map((item) => ({ value: item.id, label: item.name, description: `${item.weekCount} 周 · ${item.courses.length} 门课程` }));
  const labelFor = (options, value) => options.find((option) => String(option.value) === String(value))?.label || '';
  const openPicker = (title, value, options, onSelect) => setPicker({ title, value: String(value), options, onSelect });
  const beginSemesterDelete = (target) => {
    // Never keep two full-screen modal backdrops mounted at once. Stacked
    // backdrop filters can stall Android WebView's compositor and leave a
    // temporary grey frame that also delays pointer events.
    setSemesterSheet(false);
    setDeleteTarget(target);
  };
  const closeSemesterDelete = () => {
    setDeleteTarget(null);
    setSemesterSheet(true);
  };
  return <>
  <main className="settings-view page-enter">
    <section className="settings-group settings-first"><h2>快捷操作</h2><div className="setting-card compact"><button className="setting-action" onClick={() => onOpenImport('current')}><FileScan /><span><b>导入新课表</b><small>支持截图、PDF、Word、Excel 与 XML</small></span><ChevronRight /></button></div></section>
    <section className="settings-group"><h2>学期</h2><div className="setting-card"><div className="setting-row"><div><b>当前学期</b><span>课程按学期独立保存，进入列表可左滑管理</span></div><SettingChoice value={labelFor(semesterOptions, state.activeSemesterId)} onClick={() => setSemesterSheet(true)} /></div><button className="setting-action" onClick={() => setSemesterStartSheet(true)}><CalendarDays /><span><b>调整第一周周一</b><small>{state.semesters.find((item) => item.id === state.activeSemesterId)?.firstMonday} · 同步平移课程计划</small></span><ChevronRight /></button><button className="setting-action semester-create-action" onClick={() => onOpenImport('new')}><Plus /><span><b>新建学期并导入</b><small>识别完成后设置名称与第一周周一</small></span><ChevronRight /></button></div></section>
    <section className="settings-group"><h2>周课表显示</h2><div className="setting-card">
      <div className="setting-row"><div><b>地点显示</b><span>完整地址仍保留在详情中</span></div><SettingChoice value={labelFor(locationOptions, settings.locationMode)} onClick={() => openPicker('地点显示', settings.locationMode, locationOptions, (value) => update({ locationMode: value }))} /></div>
        <div className="setting-row"><div><b>课程卡片字号</b><span>课程名、标签和地点会一起调整</span></div><SettingChoice value={labelFor(fontSizeOptions, normalizeWeekFontSize(settings.weekFontSize))} onClick={() => openPicker('课程卡片字号', normalizeWeekFontSize(settings.weekFontSize), fontSizeOptions, (value) => update({ weekFontSize: normalizeWeekFontSize(value) }))} /></div>
        <div className="setting-row"><div><b>显示非本周课程</b><span>只用课程色条提示时段占用</span></div><button className={`switch ${settings.showInactive ? 'on' : ''}`} onClick={() => update({ showInactive: !settings.showInactive })}><i /></button></div>
    </div></section>
    <section className="settings-group"><h2>上课时间</h2><div className="setting-card compact"><button className="setting-action" onClick={() => setTimeSheet(true)}><Clock3 /><span><b>每节课时间</b><small>自定义 1–12 节的上课与下课时间</small></span><ChevronRight /></button></div></section>
    <section className="settings-group"><h2>外观</h2><div className="setting-card"><div className="setting-row"><div><b>界面主题</b><span>可随使用场景选择浅色或暗色</span></div><SettingChoice value={labelFor(themeOptions, settings.theme || 'light')} onClick={() => openPicker('界面主题', settings.theme || 'light', themeOptions, (value) => update({ theme: value }))} /></div></div></section>
    <section className="settings-group"><h2>上课提醒</h2><div className="setting-card">
      <div className="setting-row"><div><b>课前提醒与倒计时</b><span>通知中直接显示课程、时间和完整地址</span></div><button className={`switch ${settings.remindersEnabled ? 'on' : ''}`} onClick={() => onReminderToggle(!settings.remindersEnabled)}><i /></button></div>
      <div className="setting-row"><div><b>提前时间</b><span>默认在上课前 10 分钟提醒</span></div><SettingChoice value={labelFor(reminderOptions, settings.reminderMinutes)} onClick={() => openPicker('提前提醒', settings.reminderMinutes, reminderOptions, (value) => update({ reminderMinutes: Number(value) }))} /></div>
      <div className="originos-note"><BellRing /><div><b>系统通知状态</b><span>{remindersAvailable() ? (!reminderStatus?.notifications ? '通知总权限尚未开启。' : reminderStatus?.channelEnabled === false ? '“上课提醒”通知渠道已被系统关闭。' : reminderStatus?.backgroundRestricted ? '应用处于严格后台限制，Android 可能完全不触发闹钟。' : !reminderStatus?.exactAlarms ? '通知已开启，但精确闹钟未授权，提醒可能延迟。' : `通知与精确闹钟已就绪${reminderStatus?.batteryOptimized ? '；系统仍在优化 KeXu 的后台耗电，建议设为不限制' : ''}${Number.isFinite(reminderStatus?.count) ? `；已安排 ${reminderStatus.count} 个提醒` : ''}${reminderStatus?.nextNotifyAt ? `；下次 ${new Date(reminderStatus.nextNotifyAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}${reminderStatus?.lastTriggeredAt ? `；最近触发 ${new Date(reminderStatus.lastTriggeredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}。`) : '安装 Android APK 后可用；原子岛呈现方式由 vivo 机型与 OriginOS 版本决定。'}</span></div></div>
      <button className="permission-link" onClick={onOpenPermissions}><Settings2 /><span><b>打开系统权限设置</b><small>通知、闹钟与提醒、后台运行</small></span><ChevronRight /></button>
      <div className="reminder-tools"><button onClick={onTestReminder}><BellRing />发送测试通知</button><button onClick={onOpenBattery}><Settings2 />检查后台限制</button></div>
    </div></section>
    <section className="settings-group"><h2>壁纸</h2><div className="setting-card wallpaper-settings">
      <button className="wallpaper-pick" onClick={() => wallpaperInput.current?.click()}>{settings.wallpaper ? <img src={settings.wallpaper} style={{ objectFit: settings.wallpaperFit === 'stretch' ? 'fill' : settings.wallpaperFit === 'cover' ? 'cover' : 'contain', objectPosition: `${settings.wallpaperPositionX}% ${settings.wallpaperPositionY}%` }} /> : <ImageIcon />}<span>{settings.wallpaper ? '更换壁纸' : '选择壁纸'}</span></button>
      <input hidden type="file" accept="image/*" ref={wallpaperInput} onChange={async (e) => e.target.files[0] && update({ wallpaper: await compressWallpaper(e.target.files[0]) })} />
      {settings.wallpaper && <>
        <div className="wallpaper-fit"><span>画面适配</span><div>
          {[['contain', '完整'], ['cover', '铺满'], ['width', '适应宽度'], ['stretch', '拉伸']].map(([value, label]) => <button className={settings.wallpaperFit === value ? 'active' : ''} key={value} onClick={() => update({ wallpaperFit: value })}>{label}</button>)}
        </div><small>{settings.wallpaperFit === 'contain' ? '显示完整图片，四周可能留白' : settings.wallpaperFit === 'cover' ? '铺满屏幕，可用位置滑杆选择裁切区域' : settings.wallpaperFit === 'width' ? '按屏幕宽度显示，保留更多纵向画面' : '不裁切，图片随屏幕比例拉伸'}</small></div>
        <Field label={`可见度 ${Math.round(settings.wallpaperOpacity * 100)}%`}><input type="range" min="0.05" max="1" step="0.01" value={settings.wallpaperOpacity} onChange={(e) => update({ wallpaperOpacity: Number(e.target.value) })} /></Field>
        <Field label={`缩放 ${Math.round(settings.wallpaperScale * 100)}%`}><input type="range" min="0.6" max="2" step="0.02" value={settings.wallpaperScale} onChange={(e) => update({ wallpaperScale: Number(e.target.value) })} /></Field>
        {settings.wallpaperFit !== 'stretch' && <div className="wallpaper-position-controls">
          <Field label={`水平位置 ${Math.round(settings.wallpaperPositionX)}%`}><input type="range" min="0" max="100" step="1" value={settings.wallpaperPositionX} onChange={(e) => update({ wallpaperPositionX: Number(e.target.value) })} /></Field>
          <Field label={`垂直位置 ${Math.round(settings.wallpaperPositionY)}%`}><input type="range" min="0" max="100" step="1" value={settings.wallpaperPositionY} onChange={(e) => update({ wallpaperPositionY: Number(e.target.value) })} /></Field>
        </div>}
        <Field label={`亮度 ${Math.round(settings.wallpaperBrightness * 100)}%`}><input type="range" min="0.55" max="1.35" step="0.01" value={settings.wallpaperBrightness} onChange={(e) => update({ wallpaperBrightness: Number(e.target.value) })} /></Field>
        <button className="text-button danger-text" onClick={() => update({ wallpaper: '' })}><Trash2 size={15} />移除壁纸</button>
      </>}
    </div></section>
    <section className="settings-group"><h2>可选视觉识别</h2><div className="setting-card"><div className="api-field"><div><b>DeepSeek API Key</b><span>仅在你主动选择“视觉识别”或“校对结构”时调用；402 表示账户余额不足</span></div><input type="password" value={settings.apiKey} onChange={(e) => update({ apiKey: e.target.value.trim() })} placeholder="sk-…" /></div></div></section>
    <section className="settings-group"><h2>数据</h2><div className="setting-card compact"><button className="setting-action" onClick={downloadBackup}><Download /><span><b>导出完整备份</b><small>{exportStatus || '课程、修改与设置，可保存或发送'}</small></span><ChevronRight /></button></div></section>
    <p className="version-note">{APP_NAME} {APP_VERSION} · 让摸鱼更高效，坐牢更舒心</p>
  </main>
  {picker && <ChoiceSheet {...picker} onClose={() => setPicker(null)} />}
  {semesterSheet && <SemesterChoiceSheet value={state.activeSemesterId} options={semesterOptions} onSelect={onSemester} onDelete={beginSemesterDelete} onClose={() => setSemesterSheet(false)} />}
  {timeSheet && <PeriodTimeSheet value={settings.periodTimes} onClose={() => setTimeSheet(false)} onSave={(periodTimes) => update({ periodTimes: normalizePeriodTimes(periodTimes) })} />}
  {semesterStartSheet && <SemesterStartSheet semester={state.semesters.find((item) => item.id === state.activeSemesterId)} onClose={() => setSemesterStartSheet(false)} onSave={onShiftSemester} />}
  {deleteTarget && <ConfirmSheet title={`删除“${deleteTarget.name}”？`} description="此操作会永久删除该学期的课程、考试日程和逐周修改。若这是最后一个学期，KeXu 会保留一个空白新学期。" confirmLabel="确认删除" onClose={closeSemesterDelete} onConfirm={() => onDeleteSemester(deleteTarget.id)} />}
  </>;
}

function BottomNav({ view, setView }) {
  return <nav className="bottom-nav">
    <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}><LayoutGrid /><span>周课表</span></button>
    <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}><CalendarDays /><span>今天</span></button>
    <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><Settings2 /><span>我的</span></button>
  </nav>;
}

export default function App() {
  const [state, setState] = useState(loadState);
  const semester = state.semesters.find((item) => item.id === state.activeSemesterId) || state.semesters[0];
  const periods = useMemo(() => normalizePeriodTimes(state.settings.periodTimes), [state.settings.periodTimes]);
  const [today, setToday] = useState(() => new Date());
  const [week, setWeek] = useState(() => clamp(currentAcademicWeek(semester.firstMonday), 1, semester.weekCount));
  const [day, setDay] = useState(() => clamp(((new Date().getDay() + 6) % 7) + 1, 1, 7));
  const [view, setView] = useState('week');
  const [selected, setSelected] = useState(null);
  const [slotGroup, setSlotGroup] = useState(null);
  const [importing, setImporting] = useState(false);
  const [weekPicking, setWeekPicking] = useState(false);
  const [toast, setToast] = useState('');
  const [reminderStatus, setReminderStatus] = useState(null);
  const viewRef = useRef(view);
  const weekLabelRef = useRef(null);
  viewRef.current = view;
  const todayWeek = currentAcademicWeek(semester.firstMonday, today);
  const todayDay = clamp(((today.getDay() + 6) % 7) + 1, 1, 7);
  const semesterContainsToday = todayWeek >= 1 && todayWeek <= semester.weekCount;
  const previewWeekTitle = useCallback((nextWeek) => {
    if (weekLabelRef.current) weekLabelRef.current.textContent = `第${nextWeek}周`;
  }, []);
  const { pagerRef, suppressClickRef, navigateWeek, resetPager, pointerHandlers } = useWeekPager({
    week,
    weekCount: semester.weekCount,
    onWeekChange: setWeek,
    onTransitionStart: previewWeekTitle
  });
  const dayIndex = (week - 1) * 7 + day;
  const setDateIndex = useCallback((nextIndex) => {
    setWeek(Math.floor((nextIndex - 1) / 7) + 1);
    setDay(((nextIndex - 1) % 7) + 1);
  }, []);
  const {
    pagerRef: dayPagerRef,
    suppressClickRef: suppressDayClickRef,
    navigateWeek: navigateDate,
    resetPager: resetDayPager,
    pointerHandlers: dayPointerHandlers
  } = useWeekPager({
    week: dayIndex,
    weekCount: semester.weekCount * 7,
    onWeekChange: setDateIndex,
    onTransitionStart: (nextIndex) => previewWeekTitle(Math.floor((nextIndex - 1) / 7) + 1)
  });
  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => {
    const dark = (state.settings.theme || 'light') === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101512' : '#f7f3f1');
    if (Capacitor.isNativePlatform()) SystemAppearance.setTheme({ dark }).catch(() => {});
  }, [state.settings.theme]);
  useEffect(() => { previewWeekTitle(week); }, [previewWeekTitle, week]);
  useEffect(() => {
    let midnightTimer;
    const refreshToday = () => {
      const next = new Date();
      setToday((current) => {
        if (toISODate(current) === toISODate(next)) return current;
        resetPager();
        resetDayPager();
        setWeek(clamp(currentAcademicWeek(semester.firstMonday, next), 1, semester.weekCount));
        setDay(clamp(((next.getDay() + 6) % 7) + 1, 1, 7));
        return next;
      });
    };
    const armMidnightRefresh = () => {
      clearTimeout(midnightTimer);
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      midnightTimer = setTimeout(() => { refreshToday(); armMidnightRefresh(); }, Math.max(1000, nextMidnight - now));
    };
    const onVisibility = () => { if (!document.hidden) refreshToday(); };
    document.addEventListener('visibilitychange', onVisibility);
    armMidnightRefresh();
    return () => { clearTimeout(midnightTimer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [resetDayPager, resetPager, semester.firstMonday, semester.weekCount]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let disposed = false;
    let listener;
    NativeApp.addListener('backButton', () => {
      if (backStack.dispatch()) return;
      if (viewRef.current !== 'week') setView('week');
      else NativeApp.exitApp();
    }).then((handle) => {
      if (disposed) handle.remove();
      else listener = handle;
    });
    return () => {
      disposed = true;
      listener?.remove();
    };
  }, []);
  useEffect(() => {
    resetPager();
    resetDayPager();
    setWeek(clamp(currentAcademicWeek(semester.firstMonday), 1, semester.weekCount));
  }, [resetDayPager, resetPager, semester.firstMonday, semester.id, semester.weekCount]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    getReminderStatus().then(setReminderStatus).catch(() => {});
    const refresh = () => {
      if (document.hidden) return;
      getReminderStatus().then(setReminderStatus).catch(() => {});
      if (state.settings.remindersEnabled) syncNativeReminders(state).catch(() => {});
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [state.settings.remindersEnabled]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let disposed = false;
    let listener;
    NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      getReminderStatus().then(setReminderStatus).catch(() => {});
      if (state.settings.remindersEnabled) {
        syncNativeReminders(state).then((result) => setReminderStatus((current) => ({ ...current, ...result }))).catch(() => {});
      }
    }).then((handle) => {
      if (disposed) handle.remove();
      else listener = handle;
    });
    return () => {
      disposed = true;
      listener?.remove();
    };
  }, [state]);
  useEffect(() => {
    syncNativeReminders(state).then((result) => setReminderStatus((current) => ({ ...current, ...result }))).catch(() => {});
  }, [state.semesters, state.overrides, state.settings.remindersEnabled, state.settings.reminderMinutes, state.settings.periodTimes]);

  const toggleReminders = async (enabled) => {
    if (enabled) {
      try {
        const status = await requestReminderAccess();
        setReminderStatus(status);
      } catch {
        setToast('未获得通知权限，可稍后重试');
      }
    }
    setState((current) => ({ ...current, settings: { ...current.settings, remindersEnabled: enabled } }));
    setToast(enabled ? '已开启课前提醒' : '已关闭课前提醒');
  };

  const openPermissions = async () => {
    try {
      const result = await openReminderSettings();
      if (!result?.native) setToast('请在安装 APK 后使用系统权限设置');
    } catch {
      setToast('暂时无法打开系统设置');
    }
  };

  const testReminder = async () => {
    try {
      const currentStatus = await getReminderStatus();
      if (!currentStatus?.notifications) await requestReminderAccess();
      const result = await sendTestReminder();
      setReminderStatus((current) => ({ ...current, ...result }));
      setToast(result?.delivered ? '测试通知已发送' : '测试通知未能显示，请检查通知渠道');
    } catch (reason) {
      setToast(reason?.message || '测试通知发送失败');
    }
  };

  const openBattery = async () => {
    try {
      await openBatterySettings();
      setToast('请将 KeXu 的后台耗电设为允许或不限制');
    } catch {
      setToast('暂时无法打开后台设置');
    }
  };

  const deleteSemester = (semesterId) => {
    setState((current) => {
      const removed = current.semesters.find((item) => item.id === semesterId);
      if (!removed) return current;
      const meetingIds = new Set((removed.courses || []).flatMap((course) => (course.meetings || []).map((meeting) => meeting.id)));
      let semesters = current.semesters.filter((item) => item.id !== semesterId);
      if (!semesters.length) semesters = [{ id: uid('semester'), name: '新学期', firstMonday: mondayOfCurrentWeek(), weekCount: 20, courses: [] }];
      const activeSemesterId = current.activeSemesterId === semesterId ? semesters[0].id : current.activeSemesterId;
      const overrides = Object.fromEntries(Object.entries(current.overrides || {}).filter(([key]) => ![...meetingIds].some((id) => key.startsWith(`${id}@`))));
      return { ...current, semesters, activeSemesterId, overrides };
    });
    setToast('学期已删除');
  };

  const shiftActiveSemester = (firstMonday) => {
    setState((current) => ({
      ...current,
      semesters: current.semesters.map((item) => item.id === current.activeSemesterId ? shiftSemesterStart(item, firstMonday) : item)
    }));
    setToast('学期日期与课程计划已同步平移');
  };

  const wallpaperFit = state.settings.wallpaperFit || 'contain';
  const wallpaperStyle = state.settings.wallpaper ? {
    backgroundImage: `url(${state.settings.wallpaper})`, opacity: state.settings.wallpaperOpacity,
    backgroundSize: wallpaperFit === 'stretch' ? '100% 100%' : wallpaperFit === 'width' ? '100% auto' : wallpaperFit,
    backgroundPosition: `${state.settings.wallpaperPositionX ?? 50}% ${state.settings.wallpaperPositionY ?? 50}%`,
    transform: `scale(${state.settings.wallpaperScale})`,
    transformOrigin: `${state.settings.wallpaperPositionX ?? 50}% ${state.settings.wallpaperPositionY ?? 50}%`,
    filter: `brightness(${state.settings.wallpaperBrightness}) blur(${state.settings.wallpaperBlur}px)`
  } : {};

  const openOccurrence = (item) => {
    const resolved = resolveMeeting(item.meeting, week, state.overrides);
    setSelected({ ...item, meeting: resolved });
  };
  const openSlotGroup = (group) => setSlotGroup(group);
  const returnToToday = semesterContainsToday ? () => {
    if (view === 'day') navigateDate((todayWeek - 1) * 7 + todayDay, true);
    else { navigateWeek(todayWeek, true); setDay(todayDay); }
  } : null;
  const addAt = (selectedDay, period) => setSelected({ isNew: true, kind: 'course', meeting: { id: uid('meeting'), day: selectedDay, start: period, end: period, weeks: [week], location: '' } });
  const updateSemester = (updater) => setState((current) => ({ ...current, semesters: current.semesters.map((item) => item.id === semester.id ? updater(item) : item) }));

  const saveDetail = (form, scope) => {
    const meetingPatch = {
      day: Number(form.day), start: Number(form.start), end: Math.max(Number(form.start), Number(form.end)),
      location: form.location, category: form.category, teacher: form.teacher,
      weeks: parseWeekSpec(form.weeks, semester.weekCount)
    };
    if (selected.isNew) {
      const courseId = uid('course');
      const relation = form.title.replace(/实验|实践|课程设计/g, '').trim();
      const course = { id: courseId, title: form.title.trim(), teacher: form.teacher, credits: form.credits, category: form.category, relatedId: relation, color: form.color, source: 'manual', gradeComposition: form.gradeComposition, rollCall: form.rollCall, notes: form.notes, meetings: [{ ...selected.meeting, ...meetingPatch }], milestones: [] };
      updateSemester((current) => ({ ...current, courses: [...current.courses, course] }));
    } else if (selected.kind === 'milestone') {
      setSelected(null); return;
    } else {
      const basePatch = { title: form.title.trim(), teacher: form.teacher, credits: form.credits, category: form.category, color: form.color, gradeComposition: form.gradeComposition, rollCall: form.rollCall, notes: form.notes };
      if (scope === 'this') {
        setState((current) => ({
          ...current,
          overrides: { ...current.overrides, [meetingKey(selected.meeting.id, week)]: meetingPatch },
          semesters: current.semesters.map((item) => item.id !== semester.id ? item : {
            ...item,
            courses: item.courses.map((course) => course.id === selected.course.id ? { ...course, ...basePatch } : course)
          })
        }));
      } else if (scope === 'course') {
        const meetingIds = new Set(selected.course.meetings.map((meeting) => meeting.id));
        setState((current) => ({
          ...current,
          overrides: Object.fromEntries(Object.entries(current.overrides).map(([key, value]) => {
            const belongsToCourse = [...meetingIds].some((id) => key.startsWith(`${id}@`));
            return [key, belongsToCourse ? { ...value, location: form.location } : value];
          })),
          semesters: current.semesters.map((item) => item.id !== semester.id ? item : {
            ...item,
            courses: item.courses.map((course) => course.id !== selected.course.id ? course : {
              ...course,
              ...basePatch,
              meetings: course.meetings.map((meeting) => meeting.id === selected.meeting.id ? { ...meeting, ...meetingPatch } : { ...meeting, location: form.location })
            })
          })
        }));
      } else updateSemester((current) => ({ ...current, courses: current.courses.map((course) => {
        if (course.id !== selected.course.id) return course;
        const meetings = course.meetings.flatMap((meeting) => meeting.id !== selected.meeting.id ? [meeting] : scope === 'from' ? splitMeetingFromWeek(meeting, week, meetingPatch) : [{ ...meeting, ...meetingPatch }]);
        return { ...course, ...basePatch, meetings };
      }) }));
    }
    setSelected(null); setToast('已保存');
  };

  const deleteDetail = (scope) => {
    if (scope === 'this') {
      setState((current) => ({ ...current, overrides: { ...current.overrides, [meetingKey(selected.meeting.id, week)]: { hidden: true } } }));
    } else {
      updateSemester((current) => ({ ...current, courses: current.courses.map((course) => {
        if (course.id !== selected.course.id) return course;
        if (scope === 'course') return null;
        if (scope === 'all') {
          const meetings = course.meetings.filter((meeting) => meeting.id !== selected.meeting.id);
          return meetings.length ? { ...course, meetings } : null;
        }
        return { ...course, meetings: course.meetings.map((meeting) => meeting.id === selected.meeting.id ? { ...meeting, weeks: parseWeekSpec(meeting.weeks).filter((value) => value < week) } : meeting).filter((meeting) => parseWeekSpec(meeting.weeks).length) };
      }).filter(Boolean) }));
    }
    setSelected(null); setToast('已移除');
  };

  const addMilestone = (courseId, item) => {
    updateSemester((current) => ({ ...current, courses: current.courses.map((course) => course.id === courseId ? { ...course, milestones: [...(course.milestones || []), { ...item, id: uid('milestone'), title: item.type, period: 1, endPeriod: 2 }] } : course) }));
    setToast('已添加到课表');
  };

  const commitImport = ({ semesterId, semesterName, firstMonday, weekCount, courses }) => {
    const targetId = semesterId === 'new' ? uid('semester') : semesterId;
    const incoming = { id: targetId, name: semesterName, firstMonday, weekCount: clamp(Number(weekCount) || 20, 1, 30), courses };
    setState((current) => {
      const existing = current.semesters.find((item) => item.id === targetId);
      const next = mergeImportedSemester(existing, incoming);
      return { ...current, activeSemesterId: targetId, semesters: existing ? current.semesters.map((item) => item.id === targetId ? next : item) : [next, ...current.semesters] };
    });
    setImporting(false); setToast(`已合并 ${courses.length} 门课程`);
  };

  return <div className={`app-shell view-${view} theme-${state.settings.theme || 'light'} week-font-${normalizeWeekFontSize(state.settings.weekFontSize)} ${Capacitor.getPlatform() === 'android' ? 'native-android' : ''}`}>
    <div className="wallpaper" style={wallpaperStyle} />
    <div className="wallpaper-wash" style={{ opacity: state.settings.wallpaper ? Math.max(0, 1 - state.settings.wallpaperOpacity) : 1 }} />
    {view !== 'settings' && <TopBar semester={semester} week={week} weekLabelRef={weekLabelRef} currentWeek={currentAcademicWeek(semester.firstMonday, today)} onNavigate={navigateWeek} onPickWeek={() => setWeekPicking(true)} openImport={() => setImporting('current')} />}
    {view === 'week' && <div
      className="week-pager"
      ref={pagerRef}
      {...pointerHandlers}
      onClickCapture={(event) => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); } }}
    >
      <div className="week-dates-carousel">
        {[-1, 0, 1].map((slot) => {
          const pageWeek = week + slot;
          if (pageWeek < 1 || pageWeek > semester.weekCount) return null;
          return <section className={`week-date-page carousel-page ${slot === 0 ? 'current-page' : 'side-page'}`} key={pageWeek} style={{ '--page-base': `${slot * 100}%` }}><WeekDates semester={semester} week={pageWeek} selectedDay={day} onSelectDay={slot === 0 ? setDay : () => {}} today={today} /></section>;
        })}
        <MonthCorner semester={semester} week={week} />
      </div>
      <div className="week-scroll">
        <div className="week-stage">
          {[-1, 0, 1].map((slot) => {
            const pageWeek = week + slot;
            if (pageWeek < 1 || pageWeek > semester.weekCount) return null;
            return <section className={`week-body-page carousel-page ${slot === 0 ? 'current-page' : 'side-page'}`} key={pageWeek} style={{ '--page-base': `${slot * 100}%` }}><WeekGrid semester={semester} week={pageWeek} settings={state.settings} overrides={state.overrides} onOpen={slot === 0 ? ((value) => value.items ? openSlotGroup(value) : openOccurrence(value)) : () => {}} onAdd={slot === 0 ? addAt : () => {}} /></section>;
          })}
          <PeriodRail periods={periods} />
        </div>
      </div>
    </div>}
    {view === 'day' && <div
      className="day-pager"
      ref={dayPagerRef}
      {...dayPointerHandlers}
      onClickCapture={(event) => { if (suppressDayClickRef.current) { event.preventDefault(); event.stopPropagation(); } }}
    >
      <DayChrome semester={semester} dayIndex={dayIndex} onSelectDate={(nextIndex) => navigateDate(nextIndex, true)} onAdd={addAt} onToday={returnToToday} today={today} />
      <div className="day-carousel-window">
        {[-1, 0, 1].map((slot) => {
          const pageIndex = dayIndex + slot;
          if (pageIndex < 1 || pageIndex > semester.weekCount * 7) return null;
          const pageWeek = Math.floor((pageIndex - 1) / 7) + 1;
          const pageDay = ((pageIndex - 1) % 7) + 1;
          return <DayPage key={pageIndex} semester={semester} week={pageWeek} day={pageDay} settings={state.settings} overrides={state.overrides} onOpen={slot === 0 ? openOccurrence : () => {}} className={`carousel-page ${slot === 0 ? 'current-page' : 'side-page'}`} style={{ '--page-base': `${slot * 100}%` }} />;
        })}
      </div>
    </div>}
    {view === 'settings' && <SettingsView state={state} setState={setState} onOpenImport={(target) => setImporting(target)} onSemester={(id) => setState((current) => ({ ...current, activeSemesterId: id }))} onDeleteSemester={deleteSemester} onShiftSemester={shiftActiveSemester} onReminderToggle={toggleReminders} onOpenPermissions={openPermissions} onOpenBattery={openBattery} onTestReminder={testReminder} reminderStatus={reminderStatus} />}
    <BottomNav view={view} setView={setView} />
    {slotGroup && <SlotSheet group={slotGroup} week={week} locationMode={state.settings.locationMode} periods={periods} onClose={() => setSlotGroup(null)} onChoose={(item) => { setSlotGroup(null); openOccurrence(item); }} />}
    {selected && <DetailSheet key={`${selected.meeting?.id}-${week}`} selected={selected} semester={semester} week={week} periods={periods} overrides={state.overrides} onClose={() => setSelected(null)} onSave={saveDetail} onDelete={deleteDetail} onAddMilestone={addMilestone} />}
    {weekPicking && <WeekPicker semester={semester} week={week} currentWeek={currentAcademicWeek(semester.firstMonday, today)} onClose={() => setWeekPicking(false)} onSelect={(value) => { navigateWeek(value, true); setWeekPicking(false); }} />}
    {importing && <ImportSheet state={state} initialSemesterId={importing} onClose={() => setImporting(false)} onCommit={commitImport} />}
    {toast && <div className="toast"><Check />{toast}</div>}
  </div>;
}
