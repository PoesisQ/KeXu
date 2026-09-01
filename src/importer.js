import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { COLORS } from './data';
import { WEEKDAYS, parseWeekSpec } from './schedule';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const id = (prefix = 'item') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function normalizeText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[－—–]/g, '-')
    .replace(/[，、]/g, ',')
    .replace(/：/g, ':')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0))
    .replace(/(\d)\s*[一~至]\s*(\d)/g, '$1-$2')
    .replace(/周\s*\n\s*\((单|双)\)/g, '周($1)')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function cleanTitle(value) {
  return value
    .replace(/^.*学分\s*:?\s*\d+(?:\.\d+)?/g, '')
    .replace(/^.*总学时\s*:?\s*\d+/g, '')
    .replace(/^.*(?:星期[一二三四五六日]|节次)\s*/g, '')
    .replace(/^[\s,;:，。]+/g, '')
    .replace(/[\d\s|｜]+$/g, '')
    .trim()
    .slice(-36);
}

function usefulTitle(value) {
  return value.length >= 2
    && !/^[/:：]/.test(value)
    && !/^[\d.]+$/.test(value)
    && !/[/,;]/.test(value)
    && !/(课表|时间段|上午|下午|晚上|学号|学年|学期|星期|节次|学时|教学班|考核方式|选课备注|校区|场地|教师|学分|组成\s*:|^分\s*:)/.test(value);
}

function extractNearby(block, label, fallback = '') {
  const compact = String(block || '').replace(/\s*\n\s*/g, '');
  const patterns = {
    teacher: /(?:教师|老师)\s*[:：]?\s*([^/\n,]{2,12})/,
    location: /(?:校区\s*[:：]?\s*)?([^/\n,]{0,20}(?:校区|园区))?\s*[/,]?\s*(?:场地|教室)\s*[:：]?\s*([^/\n,]{2,24})/,
    credits: /学分\s*[:：]?\s*(\d+(?:\.\d+)?)/,
    assessment: /考核方式\s*[:：]?\s*([^/,;]{2,10})/
  };
  const match = compact.match(patterns[label]);
  if (!match) return fallback;
  if (label === 'location') return [match[1], match[2]].filter(Boolean).join('/场地:');
  return match[1].trim();
}

function relationId(title) {
  return title.toLowerCase().replace(/\s/g, '').replace(/实验|实践|实训|课程设计/g, '');
}

function occurrenceCategory(title, location, assessment) {
  if (/实验|实践|实训|课程设计/.test(title)) return '实验';
  if (/未\s*排\s*地点/.test(location)) return '实验';
  if (assessment && !/^考试$/.test(assessment)) return '实验';
  return '理论';
}

export function parseRecognizedText(rawText) {
  const text = normalizeText(rawText);
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const courses = new Map();
  const lastTitleByDay = new Map();
  const occurrence = /\(?\s*(\d{1,2})\s*[-~至一]\s*(\d{1,2})\s*节\)?\s*([\d,\-~至单双周 ()]{1,48})/g;

  let currentDay = 1;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const dayHeader = line.match(/^星期([一二三四五六日])$/);
    if (dayHeader) { currentDay = '一二三四五六日'.indexOf(dayHeader[1]) + 1; continue; }
    occurrence.lastIndex = 0;
    let match;
    while ((match = occurrence.exec(line))) {
      let title = cleanTitle(line.slice(0, match.index));
      if (!usefulTitle(title)) {
        const fragments = [];
        for (let back = 1; back <= 3; back += 1) {
          const candidate = cleanTitle(lines[lineIndex - back] || '');
          if (!usefulTitle(candidate)) {
            if (fragments.length) break;
            continue;
          }
          fragments.unshift(candidate);
        }
        if (fragments.length) title = fragments.join('').slice(-36);
      }
      const context = lines.slice(lineIndex, lineIndex + 28).join('\n');
      const day = currentDay;
      const teacher = extractNearby(context, 'teacher').replace(/^[:：]/, '');
      if (!usefulTitle(title)) {
        const inferred = [...courses.values()].findLast?.((course) => teacher && course.teacher === teacher);
        if (inferred) title = inferred.title;
        else title = lastTitleByDay.get(day) || '';
      }
      if (!usefulTitle(title)) continue;
      lastTitleByDay.set(day, title);
      const location = extractNearby(context, 'location');
      const assessment = extractNearby(context, 'assessment');
      const category = occurrenceCategory(title, location, assessment);
      const relation = relationId(title);
      const key = `${title.toLowerCase().replace(/\s/g, '')}::${category}`;
      const existing = courses.get(key) || {
        id: id('course'), title, teacher, credits: extractNearby(context, 'credits'),
        color: COLORS[courses.size % COLORS.length], source: 'import', category,
        relatedId: relation, gradeComposition: '', rollCall: '未知', notes: '', meetings: [], milestones: []
      };
      existing.meetings.push({
        id: id('meeting'), day, start: Number(match[1]), end: Number(match[2]),
        weeks: parseWeekSpec(match[3]), location
      });
      courses.set(key, existing);
    }
  }
  const result = [...courses.values()];
  const relationColors = new Map();
  result.forEach((course) => {
    if (!relationColors.has(course.relatedId)) relationColors.set(course.relatedId, course.color);
    course.color = relationColors.get(course.relatedId);
  });
  return result;
}

export async function pageText(page, knownHeaders = []) {
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const positioned = content.items
    .filter((item) => item.str?.trim())
    .map((item) => {
      const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      return { text: item.str.trim(), x, y, width: item.width || 0 };
    });
  const ownHeaders = positioned
    .filter((item) => /^星期[一二三四五六日]$/.test(item.text))
    .sort((a, b) => a.x - b.x);
  const headers = ownHeaders.length >= 5 ? ownHeaders : knownHeaders;
  if (headers.length < 5) return { text: positioned.map((item) => item.text).join('\n'), headers: knownHeaders, dayBlocks: [] };
  const dayBlocks = headers.map((header, dayIndex) => {
    const left = dayIndex === 0 ? header.x - (headers[1].x - header.x) / 2 : (headers[dayIndex - 1].x + header.x) / 2;
    const right = dayIndex === headers.length - 1 ? header.x + (header.x - headers[dayIndex - 1].x) / 2 : (header.x + headers[dayIndex + 1].x) / 2;
    const column = positioned
      .filter((item) => item.x >= left && item.x < right && item.y > (ownHeaders.length >= 5 ? header.y + 3 : 0) && !/^星期/.test(item.text))
      .sort((a, b) => Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x);
    const lines = [];
    column.forEach((item) => {
      const last = lines[lines.length - 1];
      if (!last || Math.abs(last.y - item.y) > 2.2) lines.push({ y: item.y, parts: [item] });
      else last.parts.push(item);
    });
    return [header.text, ...lines.map((line) => line.parts.sort((a, b) => a.x - b.x).map((item) => item.text).join(''))].join('\n');
  });
  return { text: dayBlocks.join('\n\n'), dayBlocks, headers: headers.map(({ text, x, y }) => ({ text, x, y })) };
}

export function mergePageTextPages(pages) {
  const dayParts = Array.from({ length: 7 }, () => []);
  pages.forEach((page) => page.dayBlocks?.forEach((block, dayIndex) => {
    const content = block.replace(/^星期[一二三四五六日]\s*\n?/, '').trim();
    if (content) dayParts[dayIndex].push(content);
  }));
  return dayParts.map((parts, dayIndex) => `星期${WEEKDAYS[dayIndex]}\n${parts.join('\n')}`).join('\n\n');
}

async function ocrCanvas(canvas, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('chi_sim+eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text') onProgress?.(message.progress);
    }
  });
  const result = await worker.recognize(canvas);
  await worker.terminate();
  return result.data.text;
}

async function renderPage(page, scale = 2.25) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

export async function recognizeScheduleFile(file, onProgress = () => {}) {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  let rawText = '';
  let method = '本地 OCR';
  let pageCount = 1;
  if (isPdf) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const document = await pdfjs.getDocument({
      data: bytes,
      cMapUrl: `${window.location.origin}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${window.location.origin}/standard_fonts/`
    }).promise;
    pageCount = document.numPages;
    const textParts = [];
    let headerLayout = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const extracted = await pageText(page, headerLayout);
      headerLayout = extracted.headers;
      textParts.push(extracted);
      onProgress({ stage: 'text', page: pageNumber, total: pageCount, progress: pageNumber / pageCount });
    }
    const nativeText = textParts.some((part) => part.dayBlocks?.length)
      ? mergePageTextPages(textParts)
      : textParts.map((part) => part.text).join('\n');
    const chineseCount = (nativeText.match(/[\u3400-\u9fff]/g) || []).length;
    if (nativeText.length > 250 && chineseCount > 30) {
      rawText = nativeText;
      method = 'PDF 文本层';
    } else {
      const ocrParts = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const canvas = await renderPage(page);
        ocrParts.push(await ocrCanvas(canvas, (progress) => onProgress({ stage: 'ocr', page: pageNumber, total: pageCount, progress })));
      }
      rawText = ocrParts.join('\n\n');
    }
  } else {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    rawText = await ocrCanvas(canvas, (progress) => onProgress({ stage: 'ocr', page: 1, total: 1, progress }));
    URL.revokeObjectURL(image.src);
  }
  return { rawText, courses: parseRecognizedText(rawText), method, pageCount };
}

function normalizeAIResult(result) {
  const courses = Array.isArray(result?.courses) ? result.courses : [];
  const normalized = courses.map((course, courseIndex) => ({
    id: id('course'),
    title: String(course.title || '未命名课程'),
    teacher: String(course.teacher || ''),
    credits: String(course.credits || ''),
    color: COLORS[courseIndex % COLORS.length],
    source: 'import',
    category: /实验|实践|设计/.test(course.category || course.title) ? '实验' : '理论',
    relatedId: String(course.relatedId || course.title || courseIndex).replace(/实验|实践|课程设计/g, ''),
    gradeComposition: '', rollCall: '未知', notes: '', milestones: [],
    meetings: (course.meetings || []).map((meeting) => ({
      id: id('meeting'), day: Math.min(7, Math.max(1, Number(meeting.day) || 1)),
      start: Math.min(12, Math.max(1, Number(meeting.start) || 1)),
      end: Math.min(12, Math.max(1, Number(meeting.end) || Number(meeting.start) || 1)),
      weeks: parseWeekSpec(meeting.weeks), location: String(meeting.location || '')
    }))
  })).filter((course) => course.meetings.length);
  const relationColors = new Map();
  normalized.forEach((course) => {
    if (!relationColors.has(course.relatedId)) relationColors.set(course.relatedId, course.color);
    course.color = relationColors.get(course.relatedId);
  });
  return normalized;
}

export async function refineWithDeepSeek(rawText, apiKey) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat', temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你是大学课表结构化助手。只输出 JSON。不要臆造 OCR 中没有的信息。必须逐条排课判断：考核方式不是“考试”，或者场地为“未排地点”的排课写为实验；其余写为理论。同名课程同时含理论和实验排课时拆成两个 course，但 title 可以相同，relatedId 必须相同。不能遗漏第9-12节或跨页续写的排课。' },
        { role: 'user', content: `把下面 OCR 文本整理为 {"courses":[{"title":"","teacher":"","credits":"","category":"理论","relatedId":"","meetings":[{"day":1,"start":1,"end":2,"weeks":"1-16","location":""}]}]}。day 为周一1到周日7，节次1到12，完整保留校区和场地。\n\n${rawText.slice(0, 60000)}` }
      ]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek 返回 ${response.status}`);
  const data = await response.json();
  return normalizeAIResult(JSON.parse(data.choices?.[0]?.message?.content || '{}'));
}
