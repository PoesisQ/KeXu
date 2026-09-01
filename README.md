<p align="center">
  <img src="public/icon-kexu.png" width="128" height="128" alt="KeXu icon" />
</p>

<h1 align="center">KeXu</h1>

<p align="center">
  <a href="https://github.com/PoesisQ/KeXu/actions/workflows/ci.yml"><img src="https://github.com/PoesisQ/KeXu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/platform-Android%20%7C%20PWA-34443E" alt="Platform" />
  <img src="https://img.shields.io/badge/data-local--first-F5F1E8" alt="Local first" />
</p>

KeXu 是一款无广告、本地优先、专注课程表本身的 Android / PWA 应用。它希望把“导入、查看、修改、提醒”这条最常用的路径做得足够快、清楚且可控，而不是把课表塞进社交、成绩查询或内容社区中。

当前版本：`0.9.3`

## 设计原则

- **课表优先**：启动后直接进入周课表，没有信息流和广告。
- **本地优先**：课程、设置、壁纸和修改记录默认只保存在设备上。
- **修改可控**：区分仅本次、从某周起、本安排和整门课，避免逐节修改。
- **信息清楚**：课程名、实验标识和地点具有明确层级；非本周课程只显示颜色条，点开后再查看完整信息。
- **导入可复核**：自动识别结果必须经过预览确认才会写入学期。

## 主要功能

### 周课表与单日视图

- 支持 1–12 节课程，其中第 9–12 节默认为：

  | 节次 | 时间 |
  | --- | --- |
  | 9 | 19:00–19:45 |
  | 10 | 19:55–20:40 |
  | 11 | 20:50–21:35 |
  | 12 | 21:40–22:25 |

- 周课表左右拖动实时跟手，使用速度投影判断翻页；快速甩动更容易切换周次。
- 纵向滚动完全交给 Android WebView 合成线程处理，避免脚本惯性与系统惯性互相干扰造成闪动。
- 同一时段跨周出现多门课程时，课表只显示对应课程颜色条；点击后列出该时段的全部本周与非本周课程。
- 点击空白节次添加课程，点击课程进入完整详情。
- Android 系统返回键与边缘返回手势按界面层级回退：先关闭展开内容和选择面板，再关闭详情页，不会误退出应用。

<p align="center">
  <img src="docs/screenshots/week-light.png" width="260" alt="KeXu 周课表浅色界面" />
</p>

截图仅用于展示界面，已检查不包含真实姓名、账号、API Key 等个人信息。

单日页面使用一条跨屏宽稳定居中的日期选择器，支持日期、按钮与课程内容整体跟手左右滑动；偏离今天时提供“回到今天”。

<p align="center">
  <img src="docs/screenshots/day-light.png" width="260" alt="KeXu 单日课程界面" />
</p>

### 课程编辑

- 修改范围：仅本次、从当前周起、本安排、整门课。
- “整门课”可把地点同步到同一课程的全部分散安排，同时保留各安排原有时间和周次。
- 支持课程名称、教师、学分、类型、周次、星期、节次、地点和颜色。
- 支持成绩构成、点名情况、备注，以及考试、答辩和 DDL。
- 地点可显示完整地址、仅校区或仅教室；原始地址不会被显示偏好破坏。

### 学期与导入

- 课程按学期隔离保存，并记录第一周周一。
- 设置页提供“新建学期并导入”入口；识别完成后可明确选择合并到已有学期或创建独立新学期。
- 内置 PDF 文本层读取、Adobe 中文 CMap、页面坐标解析和本地 Tesseract OCR。
- 支持 PDF、PNG 和 JPG。
- 识别课程名、教师、学分、周次、星期、节次和地点，并区分理论课与实验课。
- 重新导入时合并已有学期，保留手动课程、课程详情、里程碑和用户修改。
- 可选 DeepSeek API 仅用于用户主动触发的 OCR 文本结构化校对。

### 提醒、壁纸与数据

- Android 端可在课前指定分钟数发送高优先级通知，显示课程、时间和完整地址。
- 支持通知权限、精确闹钟权限和应用系统设置跳转。
- OriginOS / vivo 对原子岛或锁屏形态的呈现由系统版本与通知策略决定；KeXu 提供公开通知信息，但不依赖私有系统接口。
- 自定义壁纸支持适应、填充、宽度适配、拉伸、位置、缩放、亮度、模糊和 `5%–100%` 可见度。
- 提供浅色与暗色两套界面主题，设置项使用统一的动画选择面板。
- 支持导出格式化 JSON 备份。

<p align="center">
  <img src="docs/screenshots/settings-dark.png" width="230" alt="KeXu 暗色设置界面" />
  <img src="docs/screenshots/settings-picker.png" width="230" alt="KeXu 自定义设置选择面板" />
</p>

## 技术栈

- React 18
- Vite 6
- Capacitor 7 / Android
- Vitest
- PDF.js、Tesseract.js
- vite-plugin-pwa
- 原生 Java 通知与 AlarmManager 调度

PDF/OCR 模块采用动态导入，不进入日常查看课表的首屏加载路径。

## 项目结构

```text
KeXu/
├─ .github/workflows/ci.yml      # GitHub Actions：测试与生产构建
├─ android/                      # Capacitor Android 工程与原生提醒插件
├─ public/
│  ├─ icon-kexu.png             # KeXu 应用图标源图
│  ├─ cmaps/                     # PDF 中文字体映射
│  └─ standard_fonts/            # PDF.js 标准字体资源
├─ scripts/
│  ├─ generate-android-assets.mjs
│  └─ build-apk-wsl.sh
├─ src/
│  ├─ components/AppErrorBoundary.jsx
│  ├─ hooks/useBackHandler.js    # Android 分层返回处理
│  ├─ hooks/useWeekPager.js      # 双轴手势、惯性与周切换状态
│  ├─ App.jsx                    # 页面与业务编排
│  ├─ backNavigation.js          # 弹层返回栈
│  ├─ config.js                  # 应用名与版本
│  ├─ data.js                    # 去标识化演示学期及默认设置
│  ├─ gesture.js                 # 可测试的速度/惯性纯函数
│  ├─ importer.js                # PDF、OCR、DeepSeek 结构化
│  ├─ reminders.js               # 提醒数据构建及原生桥接
│  ├─ schedule.js                # 周次、日期、课程合并与显示逻辑
│  ├─ storage.js                 # 本地持久化、迁移和损坏数据恢复
│  └─ schedule.test.js
├─ capacitor.config.json
├─ package.json
└─ vite.config.js
```

## 数据模型概览

```text
State
├─ activeSemesterId
├─ semesters[]
│  ├─ firstMonday / weekCount
│  └─ courses[]
│     ├─ title / teacher / credits / category / color
│     ├─ meetings[]  (day, start, end, weeks, location)
│     └─ milestones[]
├─ overrides          # meetingId@week -> 单周覆盖
└─ settings
```

手动修改不会直接破坏导入来源。单周差异存放在 `overrides` 中；重新导入时依据课程指纹合并，并保留用户字段。

## 本地开发

### 环境要求

- Node.js 20 或更高版本
- npm 10 或兼容版本
- 构建 Android 时需要 JDK 17、Android SDK 和 Gradle 环境

### 安装与运行

```bash
npm ci
npm run dev
```

Vite 默认监听所有本地接口，终端会显示访问地址。

### 质量检查

```bash
npm run check
```

该命令依次执行 `npm test` 和 `npm run build`。测试覆盖周次解析、跨周修改、课程时段分组、手势速度投影、夜间课程识别、实验课拆分、旧数据迁移、损坏数据恢复和提醒时间。

## Android 构建

先生成 Web 生产包、同步 Capacitor 并生成各密度图标和启动图：

```bash
npm run android:sync
```

然后在 Android 工程中构建：

```bash
cd android
./gradlew assembleDebug
```

APK 默认位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

已配置本项目专用 Android 工具链的 WSL 环境也可以运行：

```bash
bash scripts/build-apk-wsl.sh
```

脚本会根据 `package.json` 版本自动把结果复制到 `dist-apk/KeXu-v<版本>-debug.apk`。`dist-apk/` 不进入 Git，建议通过 GitHub Releases 发布 APK。

## Android 权限

| 权限 | 用途 |
| --- | --- |
| `POST_NOTIFICATIONS` | 显示课前通知 |
| `SCHEDULE_EXACT_ALARM` | 尽量准确地在课前触发提醒 |
| `RECEIVE_BOOT_COMPLETED` | 重启后恢复已保存提醒 |
| `VIBRATE` | 通知振动 |
| `INTERNET` | 可选 DeepSeek 请求、首次 OCR 资源及 Web 资源 |

不开启通知权限不会影响查看、导入和编辑课表。

## 隐私说明

- 课程数据、设置、壁纸和 API Key 保存在应用本地存储中。
- 公开仓库和新安装包只包含虚构演示课表；真实课程不会写入源码、截图或 Release。
- PDF 和图片优先在设备本地读取或 OCR，不会默认上传。
- 只有用户填写 DeepSeek API Key 并主动点击校对时，OCR 文本才会发送至 DeepSeek。
- 导出的 JSON 可能包含课程、教室和教师信息，请自行妥善保管。
- 当前 API Key 由本地 WebView 存储保存，并非硬件级加密保险库；不要在共享设备上配置私人 Key。

## 发布前检查

1. 运行 `npm ci`。
2. 运行 `npm run check`。
3. 在手机尺寸检查周切换、上下惯性、课程组弹层和详情编辑。
4. 运行 `npm run android:sync`。
5. 构建 APK 并在 Android 真机验证通知权限与提醒。
6. 使用 GitHub Release 上传 APK，不要把构建产物直接提交到仓库。

## 已知限制

- 不同学校 PDF 布局差异很大，导入后仍应核对周次、实验课和晚间节次。
- 浏览器/PWA 环境不能提供 Android 精确闹钟或 vivo 系统级展示。
- 原子岛的最终展示能力取决于 vivo / OriginOS 版本及系统公开能力。
- Debug APK 使用调试签名；公开发行前应配置自己的 release signing。

## 贡献

提交修改前请确保 `npm run check` 通过。涉及导入器时，请加入去标识化的最小 OCR 文本样例和对应测试；不要提交真实 API Key、完整个人课表、`tmp/` 内容或 APK。

## 许可证

仓库目前尚未附加开源许可证。在选择许可证前，默认保留所有权利；公开上传前可根据预期协作方式补充 MIT、Apache-2.0 或其他许可证。
