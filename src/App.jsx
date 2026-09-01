import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  BellRing, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileScan,
  GraduationCap, Image as ImageIcon, LayoutGrid, MapPin, MoreHorizontal, Palette, Plus, RotateCcw,
  Settings2, Sparkles, Trash2, Upload, UserRound, X
} from 'lucide-react';
import { COLORS } from './data';
import { APP_NAME, APP_VERSION, backupFileName } from './config';
import {
  PERIODS, WEEKDAYS, addDays, currentAcademicWeek, datesForWeek, displayLocation, formatPeriodRange,
  formatWeekSpec, groupOverlappingOccurrences, isMeetingActive, meetingKey, mergeImportedSemester, occurrencesForWeek, parseWeekSpec,
  resolveMeeting, splitMeetingFromWeek, toISODate
} from './schedule';
import { exportState, loadState, saveState } from './storage';
import { getReminderStatus, openReminderSettings, remindersAvailable, requestReminderAccess, syncNativeReminders } from './reminders';
import { useWeekPager } from './hooks/useWeekPager';
import { useBackHandler } from './hooks/useBackHandler';
import { backStack } from './backNavigation';

const TODAY = new Date();
const shortDate = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function suggestedSemesterName(date = TODAY) {
  const year = date.getFullYear();
  return date.getMonth() >= 7 ? `${year}-${year + 1} 第1学期` : `${year - 1}-${year} 第2学期`;
}
function mondayOfCurrentWeek(date = TODAY) { return toISODate(addDays(date, -((date.getDay() + 6) % 7))); }

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

function WeekDates({ semester, week, selectedDay, onSelectDay }) {
  const dates = datesForWeek(semester.firstMonday, week);
  return (
    <div className="week-dates">
      <div className="month-corner"><strong>{dates[0].getMonth() + 1}</strong><span>月</span></div>
      {dates.map((date, index) => {
        const isToday = toISODate(date) === toISODate(TODAY);
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

function CourseCard({ item, week, locationMode, onOpen }) {
  const { course, meeting, active, kind, milestone } = item;
  const lab = course.category === '实验';
  const title = kind === 'milestone' ? `${milestone.type} · ${course.title}` : course.title;
  const locationLabel = displayLocation(meeting.location, locationMode).replaceAll('-', '‑');
  if (!active && kind === 'course') return (
    <button
      className="course-card inactive inactive-strip-card"
      style={{ '--course': course.color, top: `${(meeting.start - 1) * 58 + 4}px`, height: `${(meeting.end - meeting.start + 1) * 58 - 7}px` }}
      onClick={(event) => { event.stopPropagation(); onOpen(item); }}
      aria-label={`${lab ? '实验 ' : ''}${course.title} ${locationLabel} 非本周`}
    >
      <span className="inactive-strip-heading">非本周</span>
      <span className="inactive-color-strip" style={{ '--strip-color': course.color }} aria-hidden="true" />
      <span className="inactive-strip-location">{locationLabel}</span>
    </button>
  );
  return (
    <button
      className={`course-card ${active ? '' : 'inactive'} ${kind === 'milestone' ? 'milestone-card' : ''}`}
      style={{ '--course': course.color, top: `${(meeting.start - 1) * 58 + 4}px`, height: `${(meeting.end - meeting.start + 1) * 58 - 7}px` }}
      onClick={(event) => { event.stopPropagation(); onOpen(item); }}
    >
      <span className="card-accent" />
      <span className="card-title">
        {lab && <b className="type-tag">实验</b>}
        {kind === 'milestone' && <b className="type-tag warm">{milestone.type}</b>}
        {title}
      </span>
      <span className="card-location"><MapPin size={10} />{locationLabel}</span>
      {!active && <span className="inactive-label">非本周</span>}
      {active && isMeetingActive(meeting, week) && <span className="active-dot" />}
    </button>
  );
}

function CourseGroupCard({ group, locationMode, onOpen }) {
  const activeItems = group.items.filter((item) => item.active);
  const primary = activeItems[0] || group.items[0];
  const { course, meeting } = primary;
  const active = activeItems.length > 0;
  const inactiveItems = group.items.filter((item) => !item.active);
  if (!active) return (
    <button
      className="course-card inactive inactive-strip-card inactive-group-card"
      style={{ '--course': course.color, top: `${(group.start - 1) * 58 + 4}px`, height: `${(group.end - group.start + 1) * 58 - 7}px` }}
      onClick={(event) => { event.stopPropagation(); onOpen(group); }}
      aria-label={`非本周课程，同一时段共${group.items.length}个安排，点开查看全部`}
    >
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
      style={{ '--course': course.color, top: `${(group.start - 1) * 58 + 4}px`, height: `${(group.end - group.start + 1) * 58 - 7}px` }}
      onClick={(event) => { event.stopPropagation(); onOpen(group); }}
      aria-label={`${active ? '本周课程' : '非本周课程'}，同一时段共${group.items.length}个安排，点开查看全部`}
    >
      <span className="card-accent" />
      <span className="slot-count">{active ? `另有${group.items.length - activeItems.length}门` : `${group.items.length}门课程`}</span>
      <span className="card-title">
        {course.category === '实验' && <b className="type-tag">实验</b>}
        {course.title}
      </span>
      {!!inactiveItems.length && <span className="inactive-color-list compact" aria-hidden="true">
        {inactiveItems.slice(0, 3).map((item) => <span className="inactive-color-strip" style={{ '--strip-color': item.course.color }} key={`${item.course.id}-${item.meeting.id}`} />)}
      </span>}
      <span className="card-location"><MapPin size={10} />{displayLocation(meeting.location, locationMode).replaceAll('-', '‑')}</span>
      {!active && <span className="inactive-label">非本周</span>}
    </button>
  );
}

function WeekGrid({ semester, week, settings, overrides, onOpen, onAdd }) {
  const items = useMemo(() => occurrencesForWeek(semester, week, overrides)
    .filter((item) => !item.meeting.hidden && (settings.showInactive || item.active)), [semester, week, overrides, settings.showInactive]);
  const groups = useMemo(() => groupOverlappingOccurrences(items), [items]);
  return <>
        <div className="grid-surface">
          {PERIODS.map((_, row) => Array.from({ length: 7 }, (_, day) => (
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

function PeriodRail() {
  return <div className="period-rail" aria-label="上课时间">
    {PERIODS.map(([start, end], index) => <div className="period-label" key={start}><strong>{index + 1}</strong><span>{start}<br />{end}</span></div>)}
  </div>;
}

function SlotSheet({ group, week, locationMode, onClose, onChoose }) {
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
            <span className="slot-course-title">{item.course.category === '实验' && <em>实验</em>}{item.kind === 'milestone' && <em>{item.milestone.type}</em>}{item.course.title}</span>
            <small>{formatWeekSpec(parseWeekSpec(item.meeting.weeks))} · 第{item.meeting.start}-{item.meeting.end}节 · {formatPeriodRange(item.meeting.start, item.meeting.end)}</small>
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

function DayChrome({ semester, dayIndex, onSelectDate, onAdd, onToday }) {
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
          {onToday && todayPages.map(({ className, meta, interactive }) => meta && toISODate(meta.date) !== toISODate(TODAY) && (interactive
            ? <button className={`soft-button today-button today-visual ${className}`} key={className} onClick={onToday}><RotateCcw size={16} />回到今天</button>
            : <span className={`soft-button today-button today-visual ${className}`} key={className} aria-hidden="true"><RotateCcw size={16} />回到今天</span>))}
        </div>
        <button className="soft-button" onClick={() => onAdd(current.day, 1)}><Plus size={18} />添加</button>
      </div>
    </div>
    <div className="day-strip">
      <span className={`day-selection ${boundaryPrevious ? 'leaving-previous' : ''} ${boundaryNext ? 'leaving-next' : ''}`} style={{ '--selection-base': `${(current.day - 1) * 100}%` }} aria-hidden="true">
        {selectionPages.map(({ className, meta }) => renderSelectionText(meta, className))}
      </span>
      {boundaryPrevious && <span className="day-selection day-selection-wrap wrap-previous" style={{ '--selection-base': '700%' }} aria-hidden="true">{renderSelectionText(boundaryPrevious, 'selection-wrap-text')}</span>}
      {boundaryNext && <span className="day-selection day-selection-wrap wrap-next" style={{ '--selection-base': '-100%' }} aria-hidden="true">{renderSelectionText(boundaryNext, 'selection-wrap-text')}</span>}
      {renderDateLabels(current.dates)}
    </div>
  </section>;
}

function DayAgenda({ semester, week, day, settings, overrides, onOpen }) {
  const items = occurrencesForWeek(semester, week, overrides)
    .filter((item) => item.meeting.day === day && item.active && !item.meeting.hidden)
    .sort((a, b) => a.meeting.start - b.meeting.start);
  return <section className="agenda">
        {!items.length && <div className="empty-day"><Sparkles /><h3>这天没有课</h3><p>留一点空白，也是一种安排。</p></div>}
        {items.map((item) => (
          <button className="agenda-item" key={item.meeting.id} onClick={() => onOpen(item)}>
            <div className="agenda-time"><strong>{PERIODS[item.meeting.start - 1][0]}</strong><span>{PERIODS[item.meeting.end - 1][1]}</span></div>
            <i style={{ background: item.course.color }} />
            <div className="agenda-main"><h3>{item.course.category === '实验' && <em>实验</em>}{item.kind === 'milestone' ? `${item.milestone.type} · ` : ''}{item.course.title}</h3><p><MapPin size={14} />{displayLocation(item.meeting.location, settings.locationMode)}</p><p><UserRound size={14} />{item.course.teacher || '教师待定'}</p></div>
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

function ChoiceSheet({ title, value, options, onSelect, onClose }) {
  useBackHandler(true, onClose);
  return <div className="modal-root" role="dialog" aria-modal="true" aria-label={title}>
    <button className="modal-backdrop" aria-label="关闭选择" onClick={onClose} />
    <section className="bottom-sheet choice-sheet">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">偏好设置</span><h2>{title}</h2></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></div>
      <div className="choice-list">
        {options.map((option) => <button className={option.value === value ? 'selected' : ''} key={option.value} onClick={() => { onSelect(option.value); onClose(); }}>
          <span><b>{option.label}</b>{option.description && <small>{option.description}</small>}</span>
          <i>{option.value === value && <Check />}</i>
        </button>)}
      </div>
    </section>
  </div>;
}

function SettingChoice({ value, onClick }) {
  return <button type="button" className="select-trigger" onClick={onClick}><span>{value}</span><ChevronDown /></button>;
}

function Field({ label, children, className = '' }) { return <label className={`field ${className}`}><span>{label}</span>{children}</label>; }

function DetailSheet({ selected, semester, week, overrides, onClose, onSave, onDelete, onAddMilestone }) {
  const course = selected?.course;
  const originalMeeting = selected?.meeting;
  const isNew = selected?.isNew;
  const isMilestone = selected?.kind === 'milestone';
  const [scope, setScope] = useState(isNew ? 'all' : 'this');
  const [showMore, setShowMore] = useState(false);
  const [showMilestone, setShowMilestone] = useState(false);
  useBackHandler(true, () => {
    if (showMilestone) setShowMilestone(false);
    else if (showMore) setShowMore(false);
    else onClose();
  });
  const [form, setForm] = useState(() => ({
    title: course?.title || '', teacher: course?.teacher || '', credits: course?.credits || '',
    category: course?.category || '理论', location: originalMeeting?.location || '', day: originalMeeting?.day || 1,
    start: originalMeeting?.start || 1, end: originalMeeting?.end || originalMeeting?.start || 1,
    weeks: formatWeekSpec(parseWeekSpec(originalMeeting?.weeks || [week])).replace(/[第周]/g, '').replace(/、/g, ','),
    gradeComposition: course?.gradeComposition || '', rollCall: course?.rollCall || '未知', notes: course?.notes || '', color: course?.color || COLORS[0]
  }));
  const [milestone, setMilestone] = useState({ type: course?.category === '实验' ? '答辩' : '考试', date: '', time: '09:00', location: originalMeeting?.location || '' });
  const set = (name, value) => setForm((current) => ({ ...current, [name]: value }));

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
            <Field label="类型"><select value={form.category} onChange={(e) => set('category', e.target.value)}><option>理论</option><option>实验</option><option>实践</option></select></Field>
            <Field label="学分"><input inputMode="decimal" value={form.credits} onChange={(e) => set('credits', e.target.value)} placeholder="3.5" /></Field>
            <Field label="教师" className="wide"><input value={form.teacher} onChange={(e) => set('teacher', e.target.value)} placeholder="教师姓名" /></Field>
            <Field label="上课地点" className="wide"><input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="示例校区/场地:A2-301" /></Field>
            <Field label="星期"><select value={form.day} onChange={(e) => set('day', Number(e.target.value))}>{WEEKDAYS.map((name, index) => <option value={index + 1} key={name}>周{name}</option>)}</select></Field>
            <Field label="节次"><div className="inline-inputs"><select value={form.start} onChange={(e) => set('start', Number(e.target.value))}>{PERIODS.map((_, index) => <option value={index + 1} key={index}>第{index + 1}节</option>)}</select><span>至</span><select value={form.end} onChange={(e) => set('end', Number(e.target.value))}>{PERIODS.map((_, index) => <option value={index + 1} key={index}>第{index + 1}节</option>)}</select></div></Field>
            <Field label="周次" className="wide"><input value={form.weeks} onChange={(e) => set('weeks', e.target.value)} placeholder="1-16 或 1-15单" /></Field>
          </div>
          <button className="disclosure" onClick={() => setShowMore((value) => !value)}><span><Settings2 size={17} />课程详情与颜色</span><ChevronDown className={showMore ? 'rotated' : ''} /></button>
          {showMore && <div className="more-fields reveal">
            <Field label="成绩构成"><textarea value={form.gradeComposition} onChange={(e) => set('gradeComposition', e.target.value)} placeholder="平时 30% · 期末 70%" /></Field>
            <Field label="点名情况"><select value={form.rollCall} onChange={(e) => set('rollCall', e.target.value)}><option>未知</option><option>不点名</option><option>偶尔点名</option><option>每次点名</option></select></Field>
            <Field label="备注"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="教材、分组、注意事项…" /></Field>
            <div className="color-row">{COLORS.map((color) => <button aria-label={color} className={form.color === color ? 'selected' : ''} style={{ background: color }} onClick={() => set('color', color)} key={color}>{form.color === color && <Check />}</button>)}</div>
          </div>}
          {!isNew && !isMilestone && <>
            <button className="disclosure" onClick={() => setShowMilestone((value) => !value)}><span><GraduationCap size={17} />添加考试 / 答辩 / DDL</span><ChevronDown className={showMilestone ? 'rotated' : ''} /></button>
            {showMilestone && <div className="milestone-form reveal">
              <select value={milestone.type} onChange={(e) => setMilestone({ ...milestone, type: e.target.value })}><option>考试</option><option>答辩</option><option>DDL</option></select>
              <input type="date" value={milestone.date} onChange={(e) => setMilestone({ ...milestone, date: e.target.value })} />
              <input type="time" value={milestone.time} onChange={(e) => setMilestone({ ...milestone, time: e.target.value })} />
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
    </div>
  );
}

function ImportPreview({ courses, setCourses }) {
  const updateCourse = (index, patch) => setCourses((current) => current.map((course, courseIndex) => courseIndex === index ? { ...course, ...patch } : course));
  return <div className="import-preview">{courses.map((course, index) => <article key={course.id}>
    <i style={{ background: course.color }} />
    <div><input className="preview-title" value={course.title} onChange={(e) => updateCourse(index, { title: e.target.value })} /><p>{course.teacher || '教师待识别'} · {course.credits ? `${course.credits} 学分` : '学分待识别'}</p>{course.meetings.map((meeting) => <span key={meeting.id}>周{WEEKDAYS[meeting.day - 1]} {meeting.start}-{meeting.end}节 · {formatWeekSpec(parseWeekSpec(meeting.weeks))}</span>)}</div>
    <button onClick={() => setCourses((current) => current.filter((_, courseIndex) => courseIndex !== index))}><X size={16} /></button>
  </article>)}</div>;
}

function ImportSheet({ state, initialSemesterId, onClose, onCommit, onApiKey }) {
  const [step, setStep] = useState('choose');
  const [file, setFile] = useState(null);
  const [semesterId, setSemesterId] = useState(initialSemesterId === 'new' ? 'new' : state.activeSemesterId);
  const existing = state.semesters.find((item) => item.id === semesterId);
  const [semesterName, setSemesterName] = useState(existing?.name || suggestedSemesterName());
  const [firstMonday, setFirstMonday] = useState(existing?.firstMonday || mondayOfCurrentWeek());
  const [courses, setCourses] = useState([]);
  const [rawText, setRawText] = useState('');
  const [method, setMethod] = useState('');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  useBackHandler(true, () => {
    if (step === 'review') setStep('choose');
    else onClose();
  });

  const begin = async (chosen) => {
    setFile(chosen); setStep('reading'); setError('');
    try {
      const { recognizeScheduleFile } = await import('./importer');
      const result = await recognizeScheduleFile(chosen, setProgress);
      setRawText(result.rawText); setCourses(result.courses); setMethod(result.method); setStep('review');
    } catch (reason) { setError(reason.message || '识别失败'); setStep('choose'); }
  };
  const aiRefine = async () => {
    if (!state.settings.apiKey) { setError('请先在“我的”页面保存 DeepSeek API Key'); return; }
    setStep('reading'); setProgress({ stage: 'ai', page: 1, total: 1, progress: 0.65 });
    try { const { refineWithDeepSeek } = await import('./importer'); setCourses(await refineWithDeepSeek(rawText, state.settings.apiKey)); setMethod('本地 OCR + DeepSeek 结构化'); setStep('review'); }
    catch (reason) { setError(reason.message); setStep('review'); }
  };
  const chooseSemesterTarget = (value) => {
    setSemesterId(value);
    const found = state.semesters.find((item) => item.id === value);
    if (found) {
      setSemesterName(found.name);
      setFirstMonday(found.firstMonday);
    } else {
      setSemesterName(suggestedSemesterName());
      setFirstMonday(mondayOfCurrentWeek());
    }
  };

  return <div className="modal-root" role="dialog" aria-modal="true">
    <button className="modal-backdrop" aria-label="关闭" onClick={onClose} />
    <section className="bottom-sheet import-sheet">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">智能导入</span><h2>{step === 'review' ? `确认 ${courses.length} 门课程` : '从课表开始'}</h2></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></div>
      <div className="sheet-scroll">
        {step === 'choose' && <>
          <div className="import-intro"><div className="scan-orbit"><FileScan /></div><h3>PDF 或课表截图都可以</h3><p>优先读取文本；遇到乱码 PDF 会自动切换本地中文 OCR。原文件不会上传。</p></div>
          {initialSemesterId === 'new' && <div className="new-semester-intent"><Plus /><div><b>将创建一个独立新学期</b><span>识别完成后设置学期名称与第一周周一。</span></div></div>}
          <button className="drop-zone" onClick={() => fileInput.current?.click()}><Upload /><span>选择课表文件</span><small>PDF · PNG · JPG</small></button>
          <input hidden ref={fileInput} type="file" accept="application/pdf,image/*" onChange={(e) => e.target.files[0] && begin(e.target.files[0])} />
          {error && <p className="error-text">{error}</p>}
        </>}
        {step === 'reading' && <div className="reading-state"><div className="scan-animation"><FileScan /><i /></div><h3>{progress?.stage === 'ai' ? 'DeepSeek 正在整理字段' : progress?.stage === 'ocr' ? `正在识别第 ${progress.page}/${progress.total} 页` : '正在读取课表结构'}</h3><p>{file?.name}</p><div className="progress"><i style={{ width: `${Math.max(8, (progress?.progress || 0.1) * 100)}%` }} /></div><small>首次使用本地 OCR 时会下载免费的中文识别模型</small></div>}
        {step === 'review' && <>
          <div className="recognition-summary"><Check /><div><b>{method}</b><span>请确认课程名、周次和地点后再保存</span></div></div>
          <div className="semester-form">
            <div className="semester-target-tabs" role="group" aria-label="课表保存方式">
              <button className={semesterId !== 'new' ? 'active' : ''} onClick={() => chooseSemesterTarget(state.activeSemesterId)}>合并到已有学期</button>
              <button className={semesterId === 'new' ? 'active' : ''} onClick={() => chooseSemesterTarget('new')}>＋ 新建学期</button>
            </div>
            {semesterId !== 'new' && <Field label="已有学期" className="semester-existing"><select value={semesterId} onChange={(e) => chooseSemesterTarget(e.target.value)}>{state.semesters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>}
            <Field label={semesterId === 'new' ? '新学期名称' : '学期名称'}><input value={semesterName} onChange={(e) => setSemesterName(e.target.value)} placeholder="2026-2027 第1学期" /></Field>
            <Field label="第一周周一"><input type="date" value={firstMonday} onChange={(e) => setFirstMonday(e.target.value)} /></Field>
            {semesterId === 'new' && <p className="semester-target-note">导入后会创建独立学期，不会覆盖当前学期的课程和手动修改。</p>}
          </div>
          <ImportPreview courses={courses} setCourses={setCourses} />
          {!courses.length && <div className="empty-recognition"><p>本地规则没有可靠拆出课程。可以复制下方 OCR 文本手动检查，或让 DeepSeek 只做一次结构化整理。</p></div>}
          <button className="ai-button" onClick={aiRefine}><Sparkles />用 DeepSeek 校对结构<span>可选</span></button>
          <details className="raw-text"><summary>查看 OCR 原文</summary><textarea value={rawText} onChange={(e) => setRawText(e.target.value)} /></details>
          {error && <p className="error-text">{error}</p>}
        </>}
      </div>
      {step === 'review' && <div className="sheet-actions"><button className="secondary-button" onClick={() => setStep('choose')}>重新选择</button><button className="primary-button" disabled={!courses.length || !firstMonday || !semesterName} onClick={() => onCommit({ semesterId, semesterName, firstMonday, courses })}>导入并合并</button></div>}
    </section>
  </div>;
}

async function compressWallpaper(file) {
  const image = new Image(); image.src = URL.createObjectURL(file); await image.decode();
  const max = 1600; const ratio = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth * ratio; canvas.height = image.naturalHeight * ratio;
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(image.src);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function SettingsView({ state, setState, onOpenImport, onSemester, onReminderToggle, onOpenPermissions, reminderStatus }) {
  const settings = state.settings;
  const wallpaperInput = useRef(null);
  const [picker, setPicker] = useState(null);
  const update = (patch) => setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  const downloadBackup = () => { const url = URL.createObjectURL(exportState(state)); const anchor = document.createElement('a'); anchor.href = url; anchor.download = backupFileName(toISODate(TODAY)); anchor.click(); URL.revokeObjectURL(url); };
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
  const semesterOptions = state.semesters.map((item) => ({ value: item.id, label: item.name, description: `${item.weekCount} 周 · ${item.courses.length} 门课程` }));
  const labelFor = (options, value) => options.find((option) => String(option.value) === String(value))?.label || '';
  const openPicker = (title, value, options, onSelect) => setPicker({ title, value: String(value), options, onSelect });
  return <>
  <main className="settings-view page-enter">
    <section className="settings-group settings-first"><h2>快捷操作</h2><div className="setting-card compact"><button className="setting-action" onClick={() => onOpenImport('current')}><FileScan /><span><b>导入新课表</b><small>识别 PDF 或课表截图并合并到学期</small></span><ChevronRight /></button></div></section>
    <section className="settings-group"><h2>学期</h2><div className="setting-card"><div className="setting-row"><div><b>当前学期</b><span>课程按学期独立保存</span></div><SettingChoice value={labelFor(semesterOptions, state.activeSemesterId)} onClick={() => openPicker('选择学期', state.activeSemesterId, semesterOptions, onSemester)} /></div><button className="setting-action semester-create-action" onClick={() => onOpenImport('new')}><Plus /><span><b>新建学期并导入</b><small>识别完成后设置名称与第一周周一</small></span><ChevronRight /></button></div></section>
    <section className="settings-group"><h2>周课表显示</h2><div className="setting-card">
      <div className="setting-row"><div><b>地点显示</b><span>完整地址仍保留在详情中</span></div><SettingChoice value={labelFor(locationOptions, settings.locationMode)} onClick={() => openPicker('地点显示', settings.locationMode, locationOptions, (value) => update({ locationMode: value }))} /></div>
        <div className="setting-row"><div><b>显示非本周课程</b><span>只用课程色条提示时段占用</span></div><button className={`switch ${settings.showInactive ? 'on' : ''}`} onClick={() => update({ showInactive: !settings.showInactive })}><i /></button></div>
    </div></section>
    <section className="settings-group"><h2>外观</h2><div className="setting-card"><div className="setting-row"><div><b>界面主题</b><span>可随使用场景选择浅色或暗色</span></div><SettingChoice value={labelFor(themeOptions, settings.theme || 'light')} onClick={() => openPicker('界面主题', settings.theme || 'light', themeOptions, (value) => update({ theme: value }))} /></div></div></section>
    <section className="settings-group"><h2>上课提醒</h2><div className="setting-card">
      <div className="setting-row"><div><b>课前提醒与倒计时</b><span>通知中直接显示课程、时间和完整地址</span></div><button className={`switch ${settings.remindersEnabled ? 'on' : ''}`} onClick={() => onReminderToggle(!settings.remindersEnabled)}><i /></button></div>
      <div className="setting-row"><div><b>提前时间</b><span>默认在上课前 10 分钟提醒</span></div><SettingChoice value={labelFor(reminderOptions, settings.reminderMinutes)} onClick={() => openPicker('提前提醒', settings.reminderMinutes, reminderOptions, (value) => update({ reminderMinutes: Number(value) }))} /></div>
      <div className="originos-note"><BellRing /><div><b>系统通知状态</b><span>{remindersAvailable() ? (!reminderStatus?.notifications ? '通知权限尚未开启，请前往系统权限设置。' : reminderStatus?.exactAlarms ? `通知与精确闹钟已就绪${Number.isFinite(reminderStatus?.count) ? `，已安排 ${reminderStatus.count} 个提醒` : ''}。` : '通知已开启；请允许“闹钟和提醒”以避免系统延迟。') : '安装 Android APK 后可用；原子岛呈现方式由 vivo 机型与 OriginOS 版本决定。'}</span></div></div>
      <button className="permission-link" onClick={onOpenPermissions}><Settings2 /><span><b>打开系统权限设置</b><small>通知、闹钟与提醒、后台运行</small></span><ChevronRight /></button>
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
    <section className="settings-group"><h2>可选智能校对</h2><div className="setting-card"><div className="api-field"><div><b>DeepSeek API Key</b><span>仅在你主动点击“校对结构”时调用</span></div><input type="password" value={settings.apiKey} onChange={(e) => update({ apiKey: e.target.value.trim() })} placeholder="sk-…" /></div></div></section>
    <section className="settings-group"><h2>数据</h2><div className="setting-card compact"><button className="setting-action" onClick={downloadBackup}><Download /><span><b>导出完整备份</b><small>课程、修改与设置</small></span><ChevronRight /></button></div></section>
    <p className="version-note">{APP_NAME} {APP_VERSION} · 让摸鱼更高效，坐牢更舒心</p>
  </main>
  {picker && <ChoiceSheet {...picker} onClose={() => setPicker(null)} />}
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
  const [week, setWeek] = useState(() => clamp(currentAcademicWeek(semester.firstMonday), 1, semester.weekCount));
  const [day, setDay] = useState(() => clamp(((TODAY.getDay() + 6) % 7) + 1, 1, 7));
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
  const todayWeek = currentAcademicWeek(semester.firstMonday);
  const todayDay = clamp(((TODAY.getDay() + 6) % 7) + 1, 1, 7);
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
  useEffect(() => { previewWeekTitle(week); }, [previewWeekTitle, week]);
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
    syncNativeReminders(state).then((result) => setReminderStatus((current) => ({ ...current, ...result }))).catch(() => {});
  }, [state.semesters, state.overrides, state.settings.remindersEnabled, state.settings.reminderMinutes]);

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
    const meetingPatch = { day: Number(form.day), start: Number(form.start), end: Math.max(Number(form.start), Number(form.end)), location: form.location, weeks: parseWeekSpec(form.weeks, semester.weekCount) };
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

  const commitImport = ({ semesterId, semesterName, firstMonday, courses }) => {
    const targetId = semesterId === 'new' ? uid('semester') : semesterId;
    const incoming = { id: targetId, name: semesterName, firstMonday, weekCount: 20, courses };
    setState((current) => {
      const existing = current.semesters.find((item) => item.id === targetId);
      const next = mergeImportedSemester(existing, incoming);
      return { ...current, activeSemesterId: targetId, semesters: existing ? current.semesters.map((item) => item.id === targetId ? next : item) : [next, ...current.semesters] };
    });
    setImporting(false); setToast(`已合并 ${courses.length} 门课程`);
  };

  return <div className={`app-shell view-${view} theme-${state.settings.theme || 'light'}`}>
    <div className="wallpaper" style={wallpaperStyle} />
    <div className="wallpaper-wash" style={{ opacity: state.settings.wallpaper ? Math.max(0, 1 - state.settings.wallpaperOpacity) : 1 }} />
    {view !== 'settings' && <TopBar semester={semester} week={week} weekLabelRef={weekLabelRef} currentWeek={currentAcademicWeek(semester.firstMonday)} onNavigate={navigateWeek} onPickWeek={() => setWeekPicking(true)} openImport={() => setImporting('current')} />}
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
          return <section className={`week-date-page carousel-page ${slot === 0 ? 'current-page' : 'side-page'}`} key={pageWeek} style={{ '--page-base': `${slot * 100}%` }}><WeekDates semester={semester} week={pageWeek} selectedDay={day} onSelectDay={slot === 0 ? setDay : () => {}} /></section>;
        })}
      </div>
      <div className="week-scroll">
        <div className="week-stage">
          {[-1, 0, 1].map((slot) => {
            const pageWeek = week + slot;
            if (pageWeek < 1 || pageWeek > semester.weekCount) return null;
            return <section className={`week-body-page carousel-page ${slot === 0 ? 'current-page' : 'side-page'}`} key={pageWeek} style={{ '--page-base': `${slot * 100}%` }}><WeekGrid semester={semester} week={pageWeek} settings={state.settings} overrides={state.overrides} onOpen={slot === 0 ? ((value) => value.items ? openSlotGroup(value) : openOccurrence(value)) : () => {}} onAdd={slot === 0 ? addAt : () => {}} /></section>;
          })}
          <PeriodRail />
        </div>
      </div>
    </div>}
    {view === 'day' && <div
      className="day-pager"
      ref={dayPagerRef}
      {...dayPointerHandlers}
      onClickCapture={(event) => { if (suppressDayClickRef.current) { event.preventDefault(); event.stopPropagation(); } }}
    >
      <DayChrome semester={semester} dayIndex={dayIndex} onSelectDate={(nextIndex) => navigateDate(nextIndex, true)} onAdd={addAt} onToday={returnToToday} />
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
    {view === 'settings' && <SettingsView state={state} setState={setState} onOpenImport={(target) => setImporting(target)} onSemester={(id) => setState((current) => ({ ...current, activeSemesterId: id }))} onReminderToggle={toggleReminders} onOpenPermissions={openPermissions} reminderStatus={reminderStatus} />}
    <BottomNav view={view} setView={setView} />
    {slotGroup && <SlotSheet group={slotGroup} week={week} locationMode={state.settings.locationMode} onClose={() => setSlotGroup(null)} onChoose={(item) => { setSlotGroup(null); openOccurrence(item); }} />}
    {selected && <DetailSheet key={`${selected.meeting?.id}-${week}`} selected={selected} semester={semester} week={week} overrides={state.overrides} onClose={() => setSelected(null)} onSave={saveDetail} onDelete={deleteDetail} onAddMilestone={addMilestone} />}
    {weekPicking && <WeekPicker semester={semester} week={week} currentWeek={currentAcademicWeek(semester.firstMonday)} onClose={() => setWeekPicking(false)} onSelect={(value) => { navigateWeek(value, true); setWeekPicking(false); }} />}
    {importing && <ImportSheet state={state} initialSemesterId={importing} onClose={() => setImporting(false)} onCommit={commitImport} />}
    {toast && <div className="toast"><Check />{toast}</div>}
  </div>;
}
