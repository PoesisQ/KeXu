import { describe, expect, it } from 'vitest';
import { readDocumentFile, rowsToScheduleText } from './documentImporter';
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
});
