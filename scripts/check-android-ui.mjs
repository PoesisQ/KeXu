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

const checks = [
  ['WebView 文字缩放锁定', css.includes('-webkit-text-size-adjust: 100%') && css.includes('text-size-adjust: 100%')],
  ['国产 Android 字体回退', /HarmonyOS Sans SC/.test(css) && /HONOR Sans CN/.test(css) && /MiSans/.test(css)],
  ['窄卡标题完整行截断', /course-card\[data-periods="2"\] \.card-title \{ -webkit-line-clamp: 3; \}/.test(css)],
  ['彩色提示条无阴影描边', /\.inactive-color-strip[^}]+border: 0;[^}]+box-shadow: none;/.test(css)],
  ['Android 原生布局标识', app.includes("Capacitor.getPlatform() === 'android' ? 'native-android' : ''")],
  ['主题同步到原生系统栏', app.includes('SystemAppearance.setTheme({ dark })') && mainActivity.includes('SystemAppearancePlugin.class')],
  ['Android 顶栏禁用 OEM 模糊合成', /\.native-android \.topbar[^}]+backdrop-filter: none/.test(css)],
  ['Android 顶栏使用显式文字颜色', /\.native-android \.week-title[^}]+-webkit-text-fill-color/.test(css)],
  ['Android 固定背景层降级', css.includes('.native-android.view-week .wallpaper') && css.includes('position: absolute')],
  ['状态栏与导航栏同步', systemBars.includes('setAppearanceLightStatusBars(!dark)') && systemBars.includes('setAppearanceLightNavigationBars(!dark)')],
  ['Android 15 非预期边到边防护', styles35.includes('windowOptOutEdgeToEdgeEnforcement')],
  ['启动阶段不创建原生标题栏', manifest.includes('android:theme="@style/AppTheme.NoActionBar"') && !styles.includes('Theme.SplashScreen')],
  ['运行时移除 OEM 标题栏', mainActivity.includes('getSupportActionBar()') && mainActivity.includes('action_bar_container')],
  ['安全区 viewport', viewport.includes('viewport-fit=cover')]
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? '✓' : '✗'} ${name}`);
if (failed.length) {
  console.error(`\nAndroid UI 守卫失败：${failed.map(([name]) => name).join('、')}`);
  process.exit(1);
}
