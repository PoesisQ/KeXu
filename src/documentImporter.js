const SHEET_EXTENSIONS = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'log']);
const DAY_CHARS = '一二三四五六日';

export function fileExtension(file) {
  return String(file?.name || '').toLowerCase().split('.').pop() || '';
}

function canonicalDay(value) {
  const text = String(value ?? '').trim();
  const chinese = text.match(/(?:星期|周)?([一二三四五六日])/);
  if (chinese) return DAY_CHARS.indexOf(chinese[1]) + 1;
  const number = /^\s*[1-7]\s*$/.test(text) ? Number(text) : 0;
  return number >= 1 && number <= 7 ? number : 0;
}

function headerKey(value) {
  const text = String(value ?? '').trim().replace(/[\s_/-]+/g, '').toLowerCase();
  const aliases = [
    ['title', /^(课程名称|课程名|课程|科目|subject|coursename|course)$/],
    ['day', /^(星期|周几|上课日|day|weekday)$/],
    ['period', /^(节次|上课节次|时间段|课节|period|periods|slot)$/],
    ['start', /^(开始节次|开始节|start|startperiod)$/],
    ['end', /^(结束节次|结束节|end|endperiod)$/],
    ['weeks', /^(周次|上课周次|教学周|weeks|week)$/],
    ['location', /^(上课地点|地点|教室|场地|location|room)$/],
    ['teacher', /^(教师|老师|讲师|teacher|lecturer)$/],
    ['credits', /^(学分|credits|credit)$/],
    ['assessment', /^(考核方式|考核|assessment|exam)$/]
  ];
  return aliases.find(([, pattern]) => pattern.test(text))?.[0] || '';
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r/g, '').trim();
}

function canonicalRecord(row, columns) {
  const get = (key) => cellText(row[columns[key]]);
  const title = get('title');
  const day = canonicalDay(get('day'));
  const explicitPeriod = get('period');
  const range = explicitPeriod.match(/(\d{1,2})\s*[-~至一,，]\s*(\d{1,2})/)
    || [null, get('start').match(/\d{1,2}/)?.[0], get('end').match(/\d{1,2}/)?.[0]];
  if (!title || !day || !range?.[1]) return '';
  const start = range[1];
  const end = range[2] || start;
  const weeks = get('weeks') || '1-20周';
  const details = [
    get('location') && `场地:${get('location')}`,
    get('teacher') && `教师:${get('teacher')}`,
    get('credits') && `学分:${get('credits')}`,
    get('assessment') && `考核方式:${get('assessment')}`
  ].filter(Boolean);
  return `星期${DAY_CHARS[day - 1]}\n${title} (${start}-${end}节) ${weeks}${details.length ? `/${details.join('/')}` : ''}`;
}

export function rowsToScheduleText(rows, sheetName = '') {
  const normalizedRows = rows.map((row) => Array.isArray(row) ? row : []).filter((row) => row.some((cell) => cellText(cell)));
  if (!normalizedRows.length) return '';

  const structuredHeaderIndex = normalizedRows.findIndex((row) => {
    const keys = row.map(headerKey).filter(Boolean);
    return keys.includes('title') && keys.includes('day') && (keys.includes('period') || keys.includes('start'));
  });
  if (structuredHeaderIndex >= 0) {
    const columns = {};
    normalizedRows[structuredHeaderIndex].forEach((cell, index) => {
      const key = headerKey(cell);
      if (key && columns[key] === undefined) columns[key] = index;
    });
    const records = normalizedRows.slice(structuredHeaderIndex + 1).map((row) => canonicalRecord(row, columns)).filter(Boolean);
    if (records.length) return records.join('\n');
  }

  const weekdayHeaderIndex = normalizedRows.findIndex((row) => row.filter((cell) => canonicalDay(cell)).length >= 2);
  if (weekdayHeaderIndex >= 0) {
    const headers = normalizedRows[weekdayHeaderIndex]
      .map((cell, column) => ({ day: canonicalDay(cell), column }))
      .filter((item) => item.day);
    const blocks = headers.map(({ day, column }) => {
      const cells = normalizedRows.slice(weekdayHeaderIndex + 1).map((row) => cellText(row[column])).filter(Boolean);
      return `星期${DAY_CHARS[day - 1]}\n${cells.join('\n')}`;
    });
    if (blocks.some((block) => block.split('\n').length > 1)) return blocks.join('\n\n');
  }

  const lines = normalizedRows.flatMap((row) => row.map(cellText).filter(Boolean));
  return [sheetName && `工作表:${sheetName}`, ...lines].filter(Boolean).join('\n');
}

async function readSpreadsheet(file, onProgress) {
  onProgress?.({ stage: 'document', page: 1, total: 1, progress: 0.25 });
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: false, raw: false });
  const parts = workbook.SheetNames.map((name, index) => {
    onProgress?.({ stage: 'document', page: index + 1, total: workbook.SheetNames.length, progress: (index + 1) / workbook.SheetNames.length });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false, blankrows: false });
    return rowsToScheduleText(rows, name);
  }).filter(Boolean);
  return { rawText: parts.join('\n\n'), method: '表格文本结构', pageCount: workbook.SheetNames.length || 1 };
}

async function readDocx(file, onProgress) {
  onProgress?.({ stage: 'document', page: 1, total: 1, progress: 0.35 });
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule.default || mammothModule;
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  onProgress?.({ stage: 'document', page: 1, total: 1, progress: 1 });
  return { rawText: result.value, method: 'Word 文本层', pageCount: 1 };
}

function decodeText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030').decode(bytes); }
}

async function readText(file, onProgress) {
  onProgress?.({ stage: 'document', page: 1, total: 1, progress: 0.5 });
  let rawText = decodeText(await file.arrayBuffer());
  if (fileExtension(file) === 'json') {
    try {
      const parsed = JSON.parse(rawText);
      const rows = Array.isArray(parsed) && parsed.every((item) => item && typeof item === 'object')
        ? [Object.keys(parsed[0]), ...parsed.map((item) => Object.keys(parsed[0]).map((key) => item[key]))]
        : null;
      if (rows) rawText = rowsToScheduleText(rows, 'JSON');
    } catch { /* Keep the original text so the review step can show the problem. */ }
  }
  onProgress?.({ stage: 'document', page: 1, total: 1, progress: 1 });
  return { rawText, method: '本地文本文档', pageCount: 1 };
}

export function supportedDocumentKind(file) {
  const extension = fileExtension(file);
  if (SHEET_EXTENSIONS.has(extension)) return 'spreadsheet';
  if (extension === 'docx') return 'docx';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  if (extension === 'doc') return 'legacy-doc';
  return '';
}

export async function readDocumentFile(file, onProgress) {
  const kind = supportedDocumentKind(file);
  if (kind === 'spreadsheet') return readSpreadsheet(file, onProgress);
  if (kind === 'docx') return readDocx(file, onProgress);
  if (kind === 'text') return readText(file, onProgress);
  if (kind === 'legacy-doc') throw new Error('暂不支持旧版 .doc，请在 Word 中另存为 .docx 后导入');
  return null;
}
