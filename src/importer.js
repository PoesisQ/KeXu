import { COLORS } from './data';
import { readDocumentFile } from './documentImporter';
import { WEEKDAYS, parseWeekSpec } from './schedule';
import { normalizeCourseTitle, restoreEnglishWordBoundaries } from './textNormalization';

let pdfjsPromise;
async function loadPdfJs() {
  if (!pdfjsPromise) pdfjsPromise = Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

const id = (prefix = 'item') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function normalizeText(text) {
  return restoreEnglishWordBoundaries(String(text || '')
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
    .replace(/\n{3,}/g, '\n\n'));
}

function cleanTitle(value) {
  return normalizeCourseTitle(value
    .replace(/^.*学分\s*:?\s*\d+(?:\.\d+)?/g, '')
    .replace(/^.*总学时\s*:?\s*\d+/g, '')
    .replace(/^.*(?:星期[一二三四五六日]|节次)\s*/g, '')
    .replace(/^[\s,;:，。]+/g, '')
    .replace(/[\d\s|｜]+$/g, '')
    .trim())
    .slice(-60);
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
        if (fragments.length) title = normalizeCourseTitle(fragments.join(' ')).slice(-60);
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
    return [header.text, ...lines.map((line) => {
      const parts = line.parts.sort((a, b) => a.x - b.x);
      return parts.reduce((text, item, index) => {
        if (!index) return item.text;
        const previous = parts[index - 1];
        const previousEnd = previous.x + previous.width;
        const averageWidth = previous.width / Math.max(1, previous.text.length);
        const gap = item.x - previousEnd;
        const latinBoundary = /[A-Za-z0-9]$/.test(previous.text) && /^[A-Za-z0-9]/.test(item.text);
        return `${text}${latinBoundary && gap > Math.max(.6, averageWidth * .16) ? ' ' : ''}${item.text}`;
      }, '');
    })].join('\n');
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

const IMAGE_PATTERN = /\.(png|jpe?g|webp|bmp|gif)$/i;

function isImageFile(file) {
  return Boolean(file?.type?.startsWith('image/') || IMAGE_PATTERN.test(file?.name || ''));
}

function abortError() {
  return new DOMException('识别已取消', 'AbortError');
}

function ensureNotAborted(signal) {
  if (signal?.aborted) throw abortError();
}

async function imageCanvas(file, maxDimension = 0) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = maxDimension > 0 ? Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight)) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function createOcrSession(signal, onInitialize = () => {}) {
  ensureNotAborted(signal);
  const { createWorker } = await import('tesseract.js');
  let progressListener = onInitialize;
  const worker = await createWorker('chi_sim+eng', 1, {
    logger: (message) => {
      const initialization = {
        'loading tesseract core': 0.04,
        'initializing tesseract': 0.08,
        'loading language traineddata': 0.14,
        'initializing api': 0.22
      }[message.status];
      if (initialization) progressListener(initialization, message.status);
      if (message.status === 'recognizing text') progressListener(0.25 + message.progress * 0.75, message.status);
    }
  });
  const abort = () => worker.terminate().catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });
  return {
    async recognize(canvas, onProgress) {
      progressListener = onProgress || (() => {});
      ensureNotAborted(signal);
      const result = await worker.recognize(canvas);
      ensureNotAborted(signal);
      return result.data.text;
    },
    async close() {
      progressListener = () => {};
      signal?.removeEventListener('abort', abort);
      await worker.terminate().catch(() => {});
    }
  };
}

async function ocrCanvas(canvas, onProgress, signal) {
  const session = await createOcrSession(signal, onProgress);
  try {
    return await session.recognize(canvas, onProgress);
  } finally {
    await session.close();
  }
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

async function recognizeLocalImageFiles(files, onProgress, signal) {
  const textParts = [];
  const session = await createOcrSession(signal, (progress, status) => onProgress({
    stage: 'ocr', page: 1, total: files.length,
    progress: progress / files.length,
    detail: status === 'loading language traineddata' ? '首次使用正在准备中文识别模型' : '正在初始化本地 OCR'
  }));
  try {
    for (let index = 0; index < files.length; index += 1) {
      ensureNotAborted(signal);
      const canvas = await imageCanvas(files[index]);
      const text = await session.recognize(canvas, (progress, status) => onProgress({
        stage: 'ocr', page: index + 1, total: files.length,
        progress: (index + progress) / files.length,
        detail: status === 'loading language traineddata' ? '首次使用正在准备中文识别模型' : '正在识别文字'
      }));
      textParts.push(`图片 ${index + 1}\n${text}`);
    }
  } finally {
    await session.close();
  }
  return { rawText: textParts.join('\n\n'), method: files.length > 1 ? `本地 OCR · ${files.length} 张拼图` : '本地 OCR', pageCount: files.length };
}

export function deepSeekErrorMessage(status, body = '') {
  if (status === 402) return 'DeepSeek 账户余额不足（402）。已保留本地识别结果；充值后可使用视觉版面识别。';
  if (status === 401) return 'DeepSeek API Key 无效或已失效（401），请在设置中重新填写。';
  if (status === 429) return 'DeepSeek 请求过于频繁（429），请稍后重试。';
  if (status === 503) return 'DeepSeek 当前繁忙（503），请稍后重试。';
  const detail = String(body || '').slice(0, 180).replace(/\s+/g, ' ');
  return `DeepSeek 请求失败（${status}）${detail ? `：${detail}` : ''}`;
}

async function fetchDeepSeek(payload, apiKey, signal, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const abort = () => controller.abort('cancelled');
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const error = new Error(deepSeekErrorMessage(response.status, body));
      error.status = response.status;
      throw error;
    }
    return response.json();
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (controller.signal.aborted) throw new Error('DeepSeek 连接超过 120 秒，已停止等待。');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function parseModelJson(content) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text || '{}');
}

function cropImageDataUrl(image, source, maxDimension, quality) {
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext('2d', { alpha: false }).drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

async function imageVisionParts(file, signal) {
  ensureNotAborted(signal);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    ensureNotAborted(signal);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const full = { x: 0, y: 0, width, height };
    const parts = [{ label: '全图概览', url: cropImageDataUrl(image, full, 1500, 0.8) }];
    // Vision models resize each image before inference. Overlapping crops keep
    // small timetable text legible without losing the whole-page context.
    if (height / width > 1.35) {
      const cropHeight = Math.ceil(height * 0.58);
      parts.push({ label: '上半部分细节', url: cropImageDataUrl(image, { x: 0, y: 0, width, height: cropHeight }, 1900, 0.86) });
      parts.push({ label: '下半部分细节', url: cropImageDataUrl(image, { x: 0, y: height - cropHeight, width, height: cropHeight }, 1900, 0.86) });
    } else if (width / height > 1.65) {
      const cropWidth = Math.ceil(width * 0.58);
      parts.push({ label: '左半部分细节', url: cropImageDataUrl(image, { x: 0, y: 0, width: cropWidth, height }, 1900, 0.86) });
      parts.push({ label: '右半部分细节', url: cropImageDataUrl(image, { x: width - cropWidth, y: 0, width: cropWidth, height }, 1900, 0.86) });
    }
    return parts;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function recognizeImagesWithDeepSeek(files, apiKey, onProgress = () => {}, signal) {
  if (!apiKey) throw new Error('未配置 DeepSeek API Key');
  const content = [{
    type: 'text',
    text: `这些图片按上传顺序共同组成一张或多张大学课表，可能是同一张长课表的连续截图。每张原图后可能附带有重叠的局部细节图；它们是同一张图的裁切，不能重复计课。

先在内部完成以下检查再输出：1. 找到星期列标题与节次/时间行锚点；2. 按课程色块的空间边界确定 day、start、end，跨行色块不能只取文字所在一行；3. 区分字段语义：课程名称通常是色块主标题，教师应是人名或带“教师/老师”的字段，学分是小数，地点包含校区/楼栋/教室，培养方案或备注不能当课程名；4. 将同一课程同一属性的重复安排合并；5. 检查晚间 9-12 节和图片衔接处是否遗漏。

只输出 JSON：{"courses":[{"title":"","teacher":"","credits":"","category":"理论","relatedId":"","confidence":0.9,"recognitionNote":"","meetings":[{"day":1,"start":1,"end":2,"weeks":"1-16","location":""}]}],"issues":[]}。day 为周一 1 到周日 7，节次为 1 到 12。同一课程的理论、实验或实践分别建 course，但 relatedId 相同；考核不是考试或地点为“未排地点”的安排优先判断为实验。英文课程名恢复单词空格。任何字段无法确定就留空，并在 recognitionNote 或 issues 说明，不要用相邻文字猜测教师或课程名。`
  }];
  let encodedSize = 0;
  for (let index = 0; index < files.length; index += 1) {
    onProgress({ stage: 'vision-prepare', page: index + 1, total: files.length, progress: (index + 0.2) / (files.length + 1), detail: '正在压缩图片，保留文字清晰度' });
    const parts = await imageVisionParts(files[index], signal);
    content.push({ type: 'text', text: `第 ${index + 1} 张原始截图（共 ${files.length} 张），下面 ${parts.length} 幅为同一截图的概览与细节：` });
    parts.forEach((part) => {
      encodedSize += part.url.length;
      content.push({ type: 'text', text: `第 ${index + 1} 张 · ${part.label}` });
      content.push({ type: 'image_url', image_url: { url: part.url, detail: 'original' } });
    });
    if (encodedSize > 45 * 1024 * 1024) throw new Error('所选图片压缩后仍超过视觉接口限制，请减少张数或先裁掉无关区域。');
  }
  onProgress({ stage: 'vision', page: files.length, total: files.length, progress: 0.7, detail: '正在理解星期列、节次行与跨图衔接' });
  const data = await fetchDeepSeek({
    model: 'deepseek-v4-flash-vision-exp',
    temperature: 0,
    thinking: { type: 'disabled' },
    max_tokens: 12000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content }]
  }, apiKey, signal);
  const raw = data.choices?.[0]?.message?.content || '{}';
  const parsed = parseModelJson(raw);
  const courses = normalizeAIResult(parsed);
  const qualityWarnings = modelQualityWarnings(parsed, courses);
  return { rawText: raw, courses, warning: qualityWarnings, method: `DeepSeek 视觉版面识别 · ${files.length} 张`, pageCount: files.length };
}

async function recognizeSingleFile(file, onProgress = () => {}, signal) {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  let rawText = '';
  let method = '本地 OCR';
  let pageCount = 1;
  const documentResult = await readDocumentFile(file, onProgress);
  if (documentResult) {
    ({ rawText, method, pageCount } = documentResult);
  } else if (isPdf) {
    const pdfjs = await loadPdfJs();
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
      ocrParts.push(await ocrCanvas(canvas, (progress, status) => onProgress({ stage: 'ocr', page: pageNumber, total: pageCount, progress, detail: status === 'loading language traineddata' ? '首次使用正在准备中文识别模型' : '正在识别文字' }), signal));
      }
      rawText = ocrParts.join('\n\n');
    }
  } else if (isImageFile(file)) {
    const result = await recognizeLocalImageFiles([file], onProgress, signal);
    ({ rawText, method, pageCount } = result);
  } else throw new Error('暂不支持这种文件格式');
  return { rawText, courses: parseRecognizedText(rawText), method, pageCount };
}

export async function recognizeScheduleFiles(inputFiles, options = {}, onProgress = () => {}, signal) {
  const files = Array.from(inputFiles || []).filter(Boolean);
  if (!files.length) throw new Error('请选择至少一个课表文件');
  if (files.length > 8) throw new Error('一次最多选择 8 张课表图片');
  const allImages = files.every(isImageFile);
  if (files.length > 1 && !allImages) throw new Error('多文件导入仅支持图片；PDF、Excel 或 Word 请单独选择');
  if (allImages && options.apiKey && options.preferVision !== false) {
    try {
      return await recognizeImagesWithDeepSeek(files, options.apiKey, onProgress, signal);
    } catch (visionError) {
      if (visionError.name === 'AbortError') throw visionError;
      onProgress({ stage: 'fallback', page: 0, total: files.length, progress: 0, detail: `${visionError.message} 正在改用本地 OCR。` });
      const local = await recognizeLocalImageFiles(files, onProgress, signal);
      return { ...local, courses: parseRecognizedText(local.rawText), warning: visionError.message };
    }
  }
  if (allImages) {
    const local = await recognizeLocalImageFiles(files, onProgress, signal);
    return { ...local, courses: parseRecognizedText(local.rawText), warning: '当前使用免费本地 OCR；复杂课表只能按文字线索整理，版面还原能力有限。' };
  }
  const local = await recognizeSingleFile(files[0], onProgress, signal);
  if (options.apiKey && options.preferVision !== false) {
    try {
      onProgress({ stage: 'ai', page: 1, total: 1, progress: 0.62, detail: '正在区分课程、教师、地点与描述字段' });
      const structured = await structureTextWithDeepSeek(local.rawText, options.apiKey, signal);
      return { ...local, courses: structured.courses, method: `${local.method} + DeepSeek 结构化`, warning: structured.warning };
    } catch (modelError) {
      if (modelError.name === 'AbortError') throw modelError;
      return { ...local, warning: `${modelError.message} 已保留本地文档解析结果。` };
    }
  }
  return local;
}

export async function recognizeScheduleFile(file, onProgress = () => {}) {
  return recognizeScheduleFiles([file], {}, onProgress);
}

function normalizeAIResult(result) {
  const courses = Array.isArray(result?.courses) ? result.courses : [];
  const normalized = courses.map((course, courseIndex) => {
    const notes = [];
    let teacher = String(course.teacher || '').trim();
    if (teacher.length > 24 || /课程|学分|周次|星期|考核方式|上课地点|教学班/.test(teacher)) {
      notes.push('教师字段疑似混入其他描述，已留空');
      teacher = '';
    }
    const category = course.category === '实践' ? '实践' : /实验|实训|设计/.test(course.category || course.title) ? '实验' : '理论';
    return ({
    id: id('course'),
    title: normalizeCourseTitle(course.title || '未命名课程'),
    teacher,
    credits: String(course.credits || ''),
    color: COLORS[courseIndex % COLORS.length],
    source: 'import',
    category,
    relatedId: String(course.relatedId || course.title || courseIndex).replace(/实验|实践|课程设计/g, ''),
    recognitionConfidence: Math.min(1, Math.max(0, Number(course.confidence) || 0.65)),
    recognitionNote: [course.recognitionNote, ...notes].filter(Boolean).join('；'),
    gradeComposition: '', rollCall: '未知', notes: '', milestones: [],
    meetings: (course.meetings || []).map((meeting) => ({
      id: id('meeting'), day: Math.min(7, Math.max(1, Number(meeting.day) || 1)),
      start: Math.min(12, Math.max(1, Number(meeting.start) || 1)),
      end: Math.min(12, Math.max(1, Number(meeting.end) || Number(meeting.start) || 1)),
      weeks: parseWeekSpec(meeting.weeks), location: String(meeting.location || '')
    }))
  }); }).filter((course) => course.meetings.length);
  const relationColors = new Map();
  normalized.forEach((course) => {
    if (!relationColors.has(course.relatedId)) relationColors.set(course.relatedId, course.color);
    course.color = relationColors.get(course.relatedId);
  });
  return normalized;
}

function modelQualityWarnings(result, courses) {
  const issues = Array.isArray(result?.issues) ? result.issues.map(String).filter(Boolean) : [];
  const lowConfidence = courses.filter((course) => course.recognitionConfidence < 0.72 || course.recognitionNote).length;
  if (lowConfidence) issues.unshift(`${lowConfidence} 门课程存在低置信度或字段疑点，已在预览中标记，请重点核对。`);
  return issues.slice(0, 6).join(' ');
}

async function structureTextWithDeepSeek(rawText, apiKey, signal) {
  const data = await fetchDeepSeek({
    model: 'deepseek-v4-flash', temperature: 0, thinking: { type: 'disabled' }, max_tokens: 12000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: '你是大学课表结构化与数据质检助手。输入是从 Word、Excel、PDF 文本层或纯文本直接提取的内容，不是 OCR 图片。利用字段标签、表头、行列标记和语义同时判断，绝不能把教师、专业描述、培养方案、考核说明或地点当作课程名。任何不确定字段留空并降低 confidence，不要猜测。只输出 JSON。' },
      { role: 'user', content: `整理为 {"courses":[{"title":"","teacher":"","credits":"","category":"理论","relatedId":"","confidence":0.9,"recognitionNote":"","meetings":[{"day":1,"start":1,"end":2,"weeks":"1-16","location":""}]}],"issues":[]}。day 为周一1到周日7，节次1到12。必须检查第9-12节、跨页续写、同名理论与实验；英文课程名恢复单词空格。考核不是考试或地点是未排地点的安排优先作为实验。\n\n原始文档结构：\n${String(rawText || '').slice(0, 90000)}` }
    ]
  }, apiKey, signal);
  const parsed = parseModelJson(data.choices?.[0]?.message?.content);
  const courses = normalizeAIResult(parsed);
  return { courses, warning: modelQualityWarnings(parsed, courses) };
}

export async function refineWithDeepSeek(rawText, apiKey, signal) {
  return (await structureTextWithDeepSeek(rawText, apiKey, signal)).courses;
}
