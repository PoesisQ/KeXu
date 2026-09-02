import { describe, expect, it } from 'vitest';
import { readDocumentFile, rowsToScheduleText, supportedDocumentKind, xmlToStructuredText } from './documentImporter';
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
});
