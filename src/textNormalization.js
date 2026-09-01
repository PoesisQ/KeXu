const COURSE_WORDS = [
  'administration', 'algorithm', 'architecture', 'artificial', 'automation', 'communication',
  'compiler', 'computer', 'circuits', 'database', 'development', 'digital', 'electronics',
  'engineering', 'fundamentals', 'graphics', 'information', 'intelligence', 'interaction',
  'introduction', 'language', 'learning', 'management', 'mathematics', 'microcomputer',
  'multimedia', 'network', 'operating', 'organization', 'physics', 'principles', 'processing',
  'programming', 'security', 'software', 'structure', 'systems', 'technology', 'theory',
  'analysis', 'design', 'image', 'logic', 'machine', 'practice', 'project', 'science',
  'advanced', 'application', 'data', 'embedded', 'linear', 'methods', 'mobile', 'visual'
].sort((left, right) => right.length - left.length);

function preserveWordCase(word, source) {
  if (source === source.toUpperCase()) return word.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) return `${word[0].toUpperCase()}${word.slice(1)}`;
  return word;
}

function splitKnownEnglishRun(source) {
  if (source.length < 8 || !/^[A-Za-z]+$/.test(source)) return source;
  const lower = source.toLowerCase();
  const best = Array(lower.length + 1).fill(null);
  best[0] = [];
  for (let index = 0; index < lower.length; index += 1) {
    if (!best[index]) continue;
    for (const word of COURSE_WORDS) {
      if (!lower.startsWith(word, index)) continue;
      const next = index + word.length;
      const candidate = [...best[index], word];
      if (!best[next] || candidate.length < best[next].length) best[next] = candidate;
    }
  }
  const parts = best[lower.length];
  if (!parts || parts.length < 2) return source;
  return parts.map((word) => preserveWordCase(word, source)).join(' ');
}

export function restoreEnglishWordBoundaries(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
    .replace(/[A-Za-z]{8,}/g, splitKnownEnglishRun)
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();
}

export function normalizeCourseTitle(value) {
  return restoreEnglishWordBoundaries(value)
    .replace(/\s+/g, ' ')
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/\s+([,.;:!?，。；：！？])/g, '$1')
    .replace(/([（(])\s+/g, '$1')
    .replace(/\s+([）)])/g, '$1')
    .trim();
}
