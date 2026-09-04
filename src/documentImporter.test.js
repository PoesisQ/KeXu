import { describe, expect, it } from 'vitest';
import { flatOpcWordToScheduleText, readDocumentFile, rowsToScheduleText, supportedDocumentKind, xmlToStructuredText } from './documentImporter';
import { parseRecognizedText } from './importer';

describe('document timetable extraction', () => {
  it('reads weekday-oriented spreadsheet grids column by column', () => {
    const text = rowsToScheduleText([
      ['', '星期一', '星期二'],
      ['', 'ComputerNetwork (1-2节) 1-16周/场地:A2-301/教师:陈老师', '数字逻辑 (3-4节) 2-8周/场地:B1-112/教师:李老师']
    ], '课表');
    const courses = parseRecognizedText(text);
    expect(courses.find((course) => course.title === 'Computer Network')?.meetings[0].day).toBe(1);
    expect(courses.find((course) => course.title === '数字逻辑')?.meetings[0].day).toBe(2);
  });

  it('converts record-oriented spreadsheets into the canonical local parser format', () => {
    const text = rowsToScheduleText([
      ['课程名称', '星期', '节次', '周次', '教室', '教师', '学分', '考核方式'],
      ['DigitalLogicCircuits', '周三', '5-6', '1-12周', 'F3-b308', '许老师', '3', '考试']
    ]);
    const [course] = parseRecognizedText(text);
    expect(course).toMatchObject({ title: 'Digital Logic Circuits', teacher: '许老师', credits: '3' });
    expect(course.meetings[0]).toMatchObject({ day: 3, start: 5, end: 6, location: 'F3-b308' });
  });

  it('loads real XLSX bytes only when a spreadsheet is selected', async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['课程名称', '星期', '节次', '周次', '地点'],
      ['ComputerNetwork', '星期四', '9-10', '3-9周', 'Lab-204']
    ]), '课表');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = { name: 'schedule.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', arrayBuffer: async () => bytes };
    const result = await readDocumentFile(file);
    expect(result.method).toBe('表格文本结构');
    expect(parseRecognizedText(result.rawText)[0]).toMatchObject({ title: 'Computer Network' });
  });

  it('preserves repeated XML course nodes, attributes and their paths for structuring', () => {
    const text = xmlToStructuredText(`<?xml version="1.0"?><schedule semester="秋"><course id="A"><name>数据结构</name><meeting day="2" start="3" end="4"><room>A2-301</room></meeting></course><course id="B"><name>植物营养学</name><meeting day="5" start="1" end="2" /></course></schedule>`);
    expect(text).toContain('schedule[1]/@semester: 秋');
    expect(text).toContain('course[1]/name[1]: 数据结构');
    expect(text).toContain('course[2]/name[1]: 植物营养学');
    expect(text).toContain('/@day: 5');
  });

  it('accepts XML and HTML timetable documents as lazy document imports', () => {
    expect(supportedDocumentKind({ name: 'schedule.xml' })).toBe('xml');
    expect(supportedDocumentKind({ name: 'schedule.html' })).toBe('html');
  });

  it('reads generic XML as paths without routing it through image OCR', async () => {
    const bytes = new TextEncoder().encode('<schedule><course><name>形势与政策</name><teacher>何老师</teacher><meeting day="6" start="5" end="6"><weeks>1-8</weeks><room>东教学楼-2-102</room></meeting></course></schedule>');
    const file = { name: 'schedule.xml', type: 'application/xml', arrayBuffer: async () => bytes.buffer };
    const result = await readDocumentFile(file);
    expect(result.method).toBe('XML 节点结构');
    expect(result.rawText).toContain('course[1]/name[1]: 形势与政策');
    expect(result.rawText).toContain('/@start: 5');
  });

  it('restores weekday columns and vertically merged periods from Word Flat OPC XML', async () => {
    const xml = `<?xml version="1.0"?>
      <pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage" xmlns:w="urn:word">
        <pkg:part pkg:name="/word/document.xml"><pkg:xmlData><w:document><w:body><w:tbl>
          <w:tr><w:tc><w:p/></w:tc><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>星期一</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>星期二</w:t></w:r></w:p></w:tc></w:tr>
          <w:tr><w:tc><w:p><w:r><w:t>第3节</w:t></w:r></w:p><w:p><w:r><w:t>10:10~10:55</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>1-8每周</w:t></w:r></w:p><w:p><w:r><w:t>本(专必)先进封装技术</w:t></w:r></w:p><w:p><w:r><w:t>牟运</w:t></w:r></w:p><w:p><w:r><w:t>深圳校区-东2-104</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc><w:tc><w:p><w:r><w:t>9-9每周</w:t></w:r></w:p><w:p><w:r><w:t>本(公必)形势与政策</w:t></w:r></w:p><w:p><w:r><w:t>何老师</w:t></w:r></w:p><w:p/></w:tc></w:tr>
          <w:tr><w:tc><w:p><w:r><w:t>第4节</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>
        </w:tbl></w:body></w:document></pkg:xmlData></pkg:part>
      </pkg:package>`;
    const text = flatOpcWordToScheduleText(xml);
    const courses = parseRecognizedText(text);
    expect(text).toContain('先进封装技术 (3-4节) 1-8周');
    expect(courses.find((course) => course.title === '先进封装技术')?.meetings[0]).toMatchObject({ day: 1, start: 3, end: 4, location: '深圳校区-东2-104' });
    expect(courses.find((course) => course.title === '形势与政策')?.meetings[0]).toMatchObject({ day: 2, start: 3, end: 3, location: '', teacher: '何老师' });

    const bytes = new TextEncoder().encode(xml);
    const result = await readDocumentFile({ name: 'word-package.xml', type: 'application/xml', arrayBuffer: async () => bytes.buffer });
    expect(result.method).toBe('Word XML 表格结构');
    expect(parseRecognizedText(result.rawText)).toHaveLength(2);
  });
});
