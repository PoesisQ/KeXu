const SHEET_EXTENSIONS = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'log']);
const XML_EXTENSIONS = new Set(['xml']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);
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

function normalizedNodeText(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  clone.querySelectorAll?.('br').forEach((br) => br.replaceWith('\n'));
  clone.querySelectorAll?.('p,div,li').forEach((block) => block.append('\n'));
  return String(clone.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' / ').replace(/(?:\s*\/\s*){2,}/g, ' / ').trim();
}

function tableToTopology(table, tableIndex = 0) {
  const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
  const occupied = [];
  const records = [];
  let columnCount = 0;
  rows.forEach((row, rowIndex) => {
    occupied[rowIndex] ||= [];
    let columnIndex = 0;
    Array.from(row.children).filter((cell) => /^(TD|TH)$/i.test(cell.tagName)).forEach((cell) => {
      while (occupied[rowIndex][columnIndex]) columnIndex += 1;
      const rowSpan = Math.max(1, Number(cell.getAttribute('rowspan')) || 1);
      const columnSpan = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
      const text = normalizedNodeText(cell);
      records.push(`[行${rowIndex + 1} 列${columnIndex + 1} 占${rowSpan}行×${columnSpan}列] ${text || '（空）'}`);
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        occupied[r] ||= [];
        for (let c = columnIndex; c < columnIndex + columnSpan; c += 1) occupied[r][c] = true;
      }
      columnIndex += columnSpan;
      columnCount = Math.max(columnCount, columnIndex);
    });
  });
  if (!records.length) return '';
  return `表格${tableIndex + 1}：${rows.length} 行 × ${columnCount} 个逻辑列。单元格坐标从 1 开始，“占N行×M列”表示合并范围；星期标题覆盖的所有子列都属于该星期，节次单元格覆盖的所有子行都属于该节次。\n${records.join('\n')}`;
}

export function htmlTablesToTopology(html) {
  if (typeof DOMParser === 'undefined') return '';
  const documentNode = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return Array.from(documentNode.querySelectorAll('table')).map(tableToTopology).filter(Boolean).join('\n\n');
}

function htmlParagraphText(html) {
  if (typeof DOMParser === 'undefined') return String(html || '').replace(/<[^>]+>/g, ' ');
  const documentNode = new DOMParser().parseFromString(String(html || ''), 'text/html');
  documentNode.querySelectorAll('script,style,noscript').forEach((node) => node.remove());
  return normalizedNodeText(documentNode.body);
}

function decodeXmlEntities(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return String(value || '').replace(/&(#x?[\da-f]+|amp|lt|gt|quot|apos);/gi, (_, key) => {
    if (key[0] === '#') {
      const hexadecimal = key[1]?.toLowerCase() === 'x';
      const code = Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return entities[key.toLowerCase()] || '';
  });
}

function xmlTagBlocks(source, localName) {
  const tag = String(localName || '').replace(/[^a-z0-9_-]/gi, '');
  if (!tag) return [];
  return Array.from(String(source || '').matchAll(new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[\\s\\S]*?<\\/(?:[\\w.-]+:)?${tag}\\s*>`, 'gi')), (match) => match[0]);
}

function xmlAttribute(fragment, localName) {
  const openingTag = String(fragment || '').slice(0, Math.max(0, String(fragment || '').indexOf('>') + 1));
  const attribute = String(localName || '').replace(/[^a-z0-9_-]/gi, '');
  if (!attribute) return '';
  const match = openingTag.match(new RegExp(`(?:[\\w.-]+:)?${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return decodeXmlEntities(match?.[1] ?? match?.[2] ?? '');
}

function wordXmlCellText(cellXml) {
  const paragraphs = xmlTagBlocks(cellXml, 'p').map((paragraph) => {
    const withSeparators = paragraph
      .replace(/<(?:[\w.-]+:)?tab\b[^>]*\/?\s*>/gi, ' ')
      .replace(/<(?:[\w.-]+:)?(?:br|cr)\b[^>]*\/?\s*>/gi, ' / ');
    return Array.from(withSeparators.matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t\s*>/gi), (match) => decodeXmlEntities(match[1]))
      .join('').replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
  return paragraphs.join('/');
}

function wordXmlCell(cellXml, column) {
  const spanMatch = cellXml.match(/<(?:[\w.-]+:)?gridSpan\b[^>]*(?:[\w.-]+:)?val\s*=\s*["'](\d+)["'][^>]*\/?\s*>/i);
  const mergeMatch = cellXml.match(/<(?:[\w.-]+:)?vMerge\b([^>]*)\/?\s*>/i);
  const mergeValue = mergeMatch ? xmlAttribute(`<vMerge ${mergeMatch[1]}>`, 'val') : '';
  return {
    column,
    span: Math.max(1, Number(spanMatch?.[1]) || 1),
    merge: mergeMatch ? (/restart/i.test(mergeValue) ? 'restart' : 'continue') : '',
    text: wordXmlCellText(cellXml)
  };
}

function wordXmlRows(tableXml) {
  return xmlTagBlocks(tableXml, 'tr').map((rowXml) => {
    let column = 0;
    const cells = xmlTagBlocks(rowXml, 'tc').map((cellXml) => {
      const cell = wordXmlCell(cellXml, column);
      column += cell.span;
      return cell;
    });
    const periodCell = cells.find((cell) => /第\s*\d{1,2}\s*节/.test(cell.text));
    return { cells, period: Number(periodCell?.text.match(/第\s*(\d{1,2})\s*节/)?.[1]) || 0 };
  });
}

function wordXmlCourseFields(cellText) {
  const parts = String(cellText || '').split(/\s*\/\s*/).map((part) => part.trim());
  const weekMatch = parts[0]?.match(/(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s*(?:每?周)?/);
  if (!weekMatch || !parts[1]) return null;
  const title = parts[1]
    .replace(/^(?:本|专|硕|博)?\s*[（(][^）)]{1,16}[）)]\s*/u, '')
    .replace(/^课程\s*[:：]\s*/u, '').trim();
  if (title.length < 2 || /^(?:课程|教师|地点|人数)$/.test(title)) return null;
  const startWeek = Number(weekMatch[1]);
  const endWeek = Number(weekMatch[2] || weekMatch[1]);
  if (!startWeek || endWeek < startWeek) return null;
  return {
    title,
    weeks: `${startWeek}-${endWeek}周`,
    teacher: String(parts[2] || '').replace(/[,，、]+/g, ' ').replace(/\s+/g, ' ').trim(),
    location: String(parts[3] || '').trim()
  };
}

function wordXmlDocumentPart(xml) {
  if (!/schemas\.microsoft\.com\/office\/2006\/xmlPackage/i.test(xml)) return '';
  return xmlTagBlocks(xml, 'part').find((part) => xmlAttribute(part, 'name').replace(/\\/g, '/') === '/word/document.xml') || '';
}

/**
 * Restores a timetable from Word 2007 Flat OPC XML. These files are XML-wrapped
 * .docx documents: weekday ownership is expressed by gridSpan and period length
 * by vMerge, so flattening their text destroys the schedule.
 */
export function flatOpcWordToScheduleText(xml) {
  const documentPart = wordXmlDocumentPart(String(xml || ''));
  if (!documentPart) return '';
  const records = [];
  for (const tableXml of xmlTagBlocks(documentPart, 'tbl')) {
    const rows = wordXmlRows(tableXml);
    const headerIndex = rows.findIndex((row) => row.cells.filter((cell) => canonicalDay(cell.text)).length >= 2);
    if (headerIndex < 0) continue;
    const dayByColumn = new Map();
    rows[headerIndex].cells.forEach((cell) => {
      const day = canonicalDay(cell.text);
      if (!day) return;
      for (let column = cell.column; column < cell.column + cell.span; column += 1) dayByColumn.set(column, day);
    });
    const periodRows = rows.slice(headerIndex + 1).filter((row) => row.period);
    periodRows.forEach((row, rowIndex) => row.cells.forEach((cell) => {
      if (!cell.text || cell.merge === 'continue') return;
      const course = wordXmlCourseFields(cell.text);
      if (!course) return;
      const days = [...new Set(Array.from({ length: cell.span }, (_, offset) => dayByColumn.get(cell.column + offset)).filter(Boolean))];
      if (!days.length) return;
      let endPeriod = row.period;
      if (cell.merge === 'restart') {
        for (let nextIndex = rowIndex + 1; nextIndex < periodRows.length; nextIndex += 1) {
          const continuation = periodRows[nextIndex].cells.find((candidate) => candidate.column === cell.column && candidate.span === cell.span);
          if (continuation?.merge !== 'continue') break;
          endPeriod = periodRows[nextIndex].period;
        }
      }
      days.forEach((day) => records.push({ day, start: row.period, end: endPeriod, ...course }));
    }));
  }
  if (!records.length) return '';
  return Array.from({ length: 7 }, (_, index) => {
    const day = index + 1;
    const lines = records.filter((record) => record.day === day).map((record) => {
      const details = [record.location && `场地:${record.location}`, record.teacher && `教师:${record.teacher}`].filter(Boolean);
      return `${record.title} (${record.start}-${record.end}节) ${record.weeks}${details.length ? `/${details.join('/')}` : ''}`;
    });
    return lines.length ? `星期${DAY_CHARS[index]}\n${lines.join('\n')}` : '';
  }).filter(Boolean).join('\n\n');
}

export function xmlToStructuredText(xml) {
  const source = String(xml || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const tokens = source.match(/<[^>]+>|[^<]+/g) || [];
  const stack = [];
  const output = [];
  const siblingCounts = [];
  for (const token of tokens) {
    if (/^<\?/.test(token) || /^<!/.test(token)) continue;
    const closing = token.match(/^<\/\s*([^>\s]+)[^>]*>/);
    if (closing) {
      stack.pop();
      siblingCounts.pop();
      continue;
    }
    const opening = token.match(/^<\s*([^\s/>]+)([\s\S]*?)(\/?)>/);
    if (opening) {
      const name = opening[1].replace(/^.*:/, '');
      const level = Math.max(0, stack.length);
      siblingCounts[level] ||= new Map();
      const occurrence = (siblingCounts[level].get(name) || 0) + 1;
      siblingCounts[level].set(name, occurrence);
      const segment = `${name}[${occurrence}]`;
      const path = [...stack, segment].join('/');
      const attributes = opening[2].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g);
      for (const attribute of attributes) {
        const key = attribute[1].replace(/^.*:/, '');
        const value = decodeXmlEntities(attribute[2] ?? attribute[3]);
        if (value.trim()) output.push(`${path}/@${key}: ${value.trim()}`);
      }
      if (!opening[3]) {
        stack.push(segment);
        siblingCounts.length = stack.length + 1;
      }
      continue;
    }
    const text = decodeXmlEntities(token).replace(/\s+/g, ' ').trim();
    if (text && stack.length) output.push(`${stack.join('/')}: ${text}`);
  }
  return output.slice(0, 12000).join('\n');
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
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const topology = htmlTablesToTopology(result.value);
  const paragraphText = htmlParagraphText(result.value);
  onProgress?.({ stage: 'document', page: 1, total: 1, progress: 1 });
  return {
    rawText: [topology && '【Word 表格拓扑】', topology, paragraphText && '【文档文字】', paragraphText].filter(Boolean).join('\n\n'),
    method: topology ? 'Word 表格拓扑' : 'Word 文本层', pageCount: 1
  };
}

function canvasToFile(canvas, name) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) reject(new Error('无法生成 Word 版面预览'));
    else resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
  }, 'image/jpeg', 0.9));
}

export async function renderDocxPages(file, onProgress = () => {}, signal) {
  const ensureActive = () => {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  };
  ensureActive();
  onProgress({ stage: 'document-render', page: 0, total: 1, progress: 0.08, detail: '正在保留 Word 表格与版面' });
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule.default || mammothModule;
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  ensureActive();

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-12000px;top:0;width:1280px;padding:42px;background:#fff;color:#111;font:18px/1.48 Arial,"Microsoft YaHei",sans-serif;box-sizing:border-box;z-index:-1;';
  host.innerHTML = `<style>
    table{width:max-content;min-width:100%;max-width:2400px;border-collapse:collapse;table-layout:auto;margin:12px 0}td,th{border:1px solid #777;padding:7px 9px;min-width:72px;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}p{margin:6px 0}img{max-width:100%;height:auto}h1,h2,h3{margin:12px 0 7px}
  </style>${result.value || '<p>文档中没有可读取的内容</p>'}`;
  document.body.appendChild(host);
  try {
    await document.fonts?.ready;
    const html2canvasModule = await import('html2canvas');
    const html2canvas = html2canvasModule.default || html2canvasModule;
    const contentHeight = Math.min(10000, Math.max(host.scrollHeight, 300));
    const scale = Math.min(1.55, Math.max(1, 5200 / contentHeight));
    const fullCanvas = await html2canvas(host, {
      backgroundColor: '#ffffff', logging: false, scale, useCORS: true,
      width: host.scrollWidth, height: contentHeight, windowWidth: 1024,
      onclone: (doc) => { doc.documentElement.style.background = '#fff'; }
    });
    ensureActive();
    const pageHeight = Math.min(fullCanvas.height, Math.round(fullCanvas.width * 1.42));
    const pageCount = Math.min(8, Math.ceil(fullCanvas.height / pageHeight));
    const pages = [];
    for (let index = 0; index < pageCount; index += 1) {
      ensureActive();
      const sourceY = index * pageHeight;
      const height = Math.min(pageHeight, fullCanvas.height - sourceY);
      const page = document.createElement('canvas');
      page.width = fullCanvas.width;
      page.height = height;
      page.getContext('2d', { alpha: false }).drawImage(fullCanvas, 0, sourceY, fullCanvas.width, height, 0, 0, fullCanvas.width, height);
      pages.push(await canvasToFile(page, `${file.name.replace(/\.docx$/i, '')}-page-${index + 1}.jpg`));
      onProgress({ stage: 'document-render', page: index + 1, total: pageCount, progress: 0.15 + ((index + 1) / pageCount) * 0.35, detail: `已保留第 ${index + 1}/${pageCount} 页版面` });
    }
    return pages;
  } finally {
    host.remove();
  }
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

async function readXml(file, onProgress) {
  onProgress?.({ stage: 'document', page: 1, total: 1, progress: 0.25, detail: '正在读取 XML 节点与表格关系' });
  const source = decodeText(await file.arrayBuffer());
  const wordSchedule = flatOpcWordToScheduleText(source);
  if (wordSchedule) {
    onProgress?.({ stage: 'document', page: 1, total: 1, progress: 1 });
    return { rawText: wordSchedule, method: 'Word XML 表格结构', pageCount: 1 };
  }
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(source, { type: 'string', cellDates: false, raw: false });
    const parts = workbook.SheetNames.map((name) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false, blankrows: false });
      return rowsToScheduleText(rows, name);
    }).filter(Boolean);
    if (parts.length && parts.some((part) => part.replace(/\s/g, '').length > 20)) {
      onProgress?.({ stage: 'document', page: 1, total: 1, progress: 1 });
      return { rawText: parts.join('\n\n'), method: 'Excel XML 表格结构', pageCount: workbook.SheetNames.length || 1 };
    }
  } catch { /* Generic XML is handled below without executing external entities. */ }
  const rawText = xmlToStructuredText(source);
  if (!rawText) throw new Error('XML 中没有找到可读取的课程或文本节点');
  onProgress?.({ stage: 'document', page: 1, total: 1, progress: 1 });
  return { rawText, method: 'XML 节点结构', pageCount: 1 };
}

async function readHtml(file, onProgress) {
  onProgress?.({ stage: 'document', page: 1, total: 1, progress: 0.45, detail: '正在读取网页表格结构' });
  const html = decodeText(await file.arrayBuffer());
  const topology = htmlTablesToTopology(html);
  const rawText = [topology, htmlParagraphText(html)].filter(Boolean).join('\n\n');
  if (!rawText.trim()) throw new Error('HTML 中没有找到可读取的课表内容');
  onProgress?.({ stage: 'document', page: 1, total: 1, progress: 1 });
  return { rawText, method: topology ? 'HTML 表格拓扑' : 'HTML 文本结构', pageCount: 1 };
}

export function supportedDocumentKind(file) {
  const extension = fileExtension(file);
  if (SHEET_EXTENSIONS.has(extension)) return 'spreadsheet';
  if (extension === 'docx') return 'docx';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  if (XML_EXTENSIONS.has(extension)) return 'xml';
  if (HTML_EXTENSIONS.has(extension)) return 'html';
  if (extension === 'doc') return 'legacy-doc';
  return '';
}

export async function readDocumentFile(file, onProgress) {
  const kind = supportedDocumentKind(file);
  if (kind === 'spreadsheet') return readSpreadsheet(file, onProgress);
  if (kind === 'docx') return readDocx(file, onProgress);
  if (kind === 'text') return readText(file, onProgress);
  if (kind === 'xml') return readXml(file, onProgress);
  if (kind === 'html') return readHtml(file, onProgress);
  if (kind === 'legacy-doc') throw new Error('暂不支持旧版 .doc，请在 Word 中另存为 .docx 后导入');
  return null;
}
