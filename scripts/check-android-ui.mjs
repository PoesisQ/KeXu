import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const css = read('src/styles.css');
const app = read('src/App.jsx');
const mainActivity = read('android/app/src/main/java/com/poesis/kexu/MainActivity.java');
const systemBars = read('android/app/src/main/java/com/poesis/kexu/SystemBars.java');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const styles = read('android/app/src/main/res/values/styles.xml');
const styles35 = read('android/app/src/main/res/values-v35/styles.xml');
const viewport = read('index.html');
const buildGradle = read('android/app/build.gradle');
const gitignore = read('.gitignore');
const documentImporter = read('src/documentImporter.js');
const importFormats = read('src/importFormats.js');
const importer = read('src/importer.js');
const reminders = read('src/reminders.js');
const reminderPlugin = read('android/app/src/main/java/com/poesis/kexu/ReminderPlugin.java');
const reminderScheduler = read('android/app/src/main/java/com/poesis/kexu/ReminderScheduler.java');
const schedule = read('src/schedule.js');
const packageJson = read('package.json');

const checks = [
  ['WebView 文字缩放锁定', css.includes('-webkit-text-size-adjust: 100%') && css.includes('text-size-adjust: 100%')],
  ['国产 Android 字体回退', /HarmonyOS Sans SC/.test(css) && /HONOR Sans CN/.test(css) && /MiSans/.test(css)],
  ['窄卡标题完整行截断', /course-card\[data-periods="2"\] \.card-title \{ -webkit-line-clamp: 3; \}/.test(css)],
  ['彩色提示条无阴影描边', /\.inactive-color-strip[^}]+border: 0;[^}]+box-shadow: none;/.test(css)],
  ['Android 原生布局标识', app.includes("Capacitor.getPlatform() === 'android' ? 'native-android' : ''")],
  ['主题同步到原生系统栏', app.includes('SystemAppearance.setTheme({ dark })') && mainActivity.includes('SystemAppearancePlugin.class')],
  ['Android 顶栏禁用 OEM 模糊合成', /\.native-android \.topbar[^}]+backdrop-filter: none/.test(css)],
  ['Android 顶栏使用显式文字颜色', /\.native-android \.week-title[^}]+-webkit-text-fill-color/.test(css)],
  ['Android 加号使用显式 SVG 描边', /\.native-android \.top-actions \.icon-button\.filled svg[^}]+stroke: #fff/.test(css)],
  ['Android 固定背景层降级', css.includes('.native-android.view-week .wallpaper') && css.includes('position: absolute')],
  ['状态栏与导航栏同步', systemBars.includes('setAppearanceLightStatusBars(!dark)') && systemBars.includes('setAppearanceLightNavigationBars(!dark)')],
  ['Android 15 非预期边到边防护', styles35.includes('windowOptOutEdgeToEdgeEnforcement')],
  ['启动阶段不创建原生标题栏', manifest.includes('android:theme="@style/AppTheme.NoActionBar"') && !styles.includes('Theme.SplashScreen')],
  ['运行时移除 OEM 标题栏', mainActivity.includes('getSupportActionBar()') && mainActivity.includes('action_bar_container')],
  ['签名配置与源码解耦', buildGradle.includes("rootProject.file('signing.properties')") && gitignore.includes('android/signing.properties')],
  ['文档解析器按需加载', documentImporter.includes("import('xlsx')") && documentImporter.includes("import('mammoth')")],
  ['Word 视觉模式保留表格版面', documentImporter.includes('renderDocxPages') && documentImporter.includes("import('html2canvas')") && importer.includes("sourceLabel = '课表截图'") && importer.includes('Word 文档渲染页面')],
  ['Word 合并单元格保留表格拓扑', documentImporter.includes('htmlTablesToTopology') && documentImporter.includes('占${rowSpan}行×${columnSpan}列') && importer.includes('layoutContext')],
  ['XML 与网页表格按需解析', documentImporter.includes('readXml') && documentImporter.includes('readHtml') && importFormats.includes("'.xml'") && importFormats.includes("'.html'")],
  ['多图视觉模型按需调用', importer.includes('deepseek-v4-flash-vision-exp') && app.includes('multiple ref={fileInput}')],
  ['单选手机可分批追加图片', app.includes('pendingFiles') && app.includes('继续添加图片') && app.includes('重复添加')],
  ['文本文档交给结构化模型而非 OCR', importer.includes('structureTextWithDeepSeek(local.rawText') && importer.includes('输入来自 Word/HTML 合并表格拓扑、Excel/XML 行列结构')],
  ['低置信度导入必须提示复核', importer.includes('recognitionConfidence') && app.includes('confidence-badge')],
  ['跨日理论实验归并为课程安排', importer.includes('coalesceImportedCourses') && importer.includes('meeting.category') && app.includes('meeting.category || course.category')],
  ['导入可选择学期周数', app.includes('SEMESTER_WEEK_OPTIONS') && app.includes("title: '选择学期周数'") && app.includes('weekCount: clamp(Number(weekCount)')],
  ['学期支持跟手左滑与二次确认删除', app.includes('SemesterSwipeRow') && app.includes('resolveRevealSwipe') && app.includes("onDelete({ id: option.value, name: option.label })") && app.includes('ConfirmSheet') && /\.semester-swipe-surface[^}]+touch-action: pan-y/.test(css)],
  ['学期起始日可无损平移', app.includes('SemesterStartSheet') && schedule.includes('shiftSemesterStart') && schedule.includes('milestones: (course.milestones || []).map')],
  ['选择学期使用圆角跟手抽屉', css.includes('.semester-current-mark') && css.includes('border-radius: 18px') && app.includes('transform = `translate3d(${-reveal}px,0,0)`') && app.includes('if (offset > 0) offset = 0')],
  ['学期抽屉短距离滑动可展开', app.includes('Math.abs(dy) * 1.08') && read('src/gesture.js').includes('Math.min(22, safeWidth * 0.3)')],
  ['Android 遮罩避免高成本模糊', css.includes('.native-android .modal-backdrop') && css.includes('.nested-modal .modal-backdrop') && app.includes('Never keep two full-screen modal backdrops mounted at once')],
  ['学期滑动取消不会吞掉后续点击', app.includes('suppressClickUntilRef') && app.includes('onPointerCancel={(event) => finishGesture(event, true)}') && app.includes('onLostPointerCapture')],
  ['课程编辑不再使用原生下拉', !app.includes('<select') && app.includes('form-select-trigger')],
  ['编辑输入与自定义选择字形统一', /\.form-select-trigger span[^}]+font-size: 16px;[^}]+font-weight: 500/.test(css)],
  ['自定义节次时间进入提醒链路', app.includes('PeriodTimeSheet') && read('src/reminders.js').includes('settings?.periodTimes')],
  ['通知提供即时自检与后台诊断', reminders.includes('sendTestReminder') && reminderPlugin.includes('sendTest') && reminderPlugin.includes('backgroundRestricted')],
  ['授权返回后原生重建闹钟', mainActivity.includes('ReminderScheduler.rescheduleStored(this)')],
  ['提醒逐项容错并记录下次触发', reminderScheduler.includes('nextNotifyAt') && reminderScheduler.includes('A malformed occurrence must not prevent all later reminders')],
  ['原生备份使用系统保存与分享', packageJson.includes('@capacitor/filesystem') && packageJson.includes('@capacitor/share') && app.includes("import('@capacitor/filesystem')") && app.includes('Share.share')],
  ['跨日自动校准到今天', app.includes('armMidnightRefresh') && app.includes("document.addEventListener('visibilitychange', onVisibility)" )],
  ['设置内容与固定壁纸分层滚动', css.includes('.app-shell.view-settings { height: 100dvh') && /\.settings-view[^}]+overflow-y: auto/.test(css)],
  ['安全区 viewport', viewport.includes('viewport-fit=cover')]
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? '✓' : '✗'} ${name}`);
if (failed.length) {
  console.error(`\nAndroid UI 守卫失败：${failed.map(([name]) => name).join('、')}`);
  process.exit(1);
}
