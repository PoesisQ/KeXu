<p align="center">
  <img src="public/icon-kexu.png" width="128" height="128" alt="KeXu icon" />
</p>

<h1 align="center">KeXu</h1>

<p align="center">
  <a href="https://github.com/PoesisQ/KeXu/actions/workflows/ci.yml"><img src="https://github.com/PoesisQ/KeXu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/PoesisQ/KeXu/releases/latest"><img src="https://img.shields.io/github/v/release/PoesisQ/KeXu?label=release&color=76A995" alt="Latest release" /></a>
  <img src="https://img.shields.io/badge/platform-Android%20%7C%20PWA-34443E" alt="Platform" />
  <img src="https://img.shields.io/badge/data-local--first-F5F1E8" alt="Local first" />
</p>

KeXu 是一款无广告、本地优先、专注课程表本身的 Android / PWA 应用。它希望把“导入、查看、修改、提醒”这条最常用的路径做得足够快、清楚且可控，而不是把课表塞进社交、成绩查询或内容社区中。

当前版本：`0.9.19` · [下载最新 Android APK](https://github.com/PoesisQ/KeXu/releases/latest)

## 获取与开始使用

1. 从 [Releases](https://github.com/PoesisQ/KeXu/releases/latest) 下载最新的 `KeXu-v*.apk` 并安装。
2. 打开“我的 → 导入新课表”，选择 PDF、图片、Excel、Word 或文本文件；连续截图可以逐张追加。
3. 在识别预览中核对课程、安排、第一周周一和学期周数，再写入现有学期或创建新学期。
4. 如需课前提醒，在“我的”中开启提醒、授权通知与精确闹钟，并先发送一条测试通知。

从早期非统一签名版本升级时若 Android 提示“开发者签名冲突”，请先导出完整备份，再卸载旧包并安装新版；`0.9.16` 及之后的官方 Release 使用同一发布证书，可直接覆盖升级。

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

- 周课表左右拖动实时跟手，使用速度投影判断翻页；日期与课程同步切换，左侧节次时间标尺固定并保持纵向对齐，月份角标仅在跨月时跟手换入。
- 纵向滚动完全交给 Android WebView 合成线程处理，避免脚本惯性与系统惯性互相干扰造成闪动。
- 同一时段跨周出现多门课程时，课表只显示对应课程颜色条；点击后列出该时段的全部本周与非本周课程。
- 窄课程卡片中的地址支持两行语义换行；完整地址优先分层显示校区/场地与教室号。
- 设置页可选择紧凑、标准或较大三档课程卡片字号；课程名、标签和地点联动缩放，并针对窄屏与两节课卡片分别限制行数和留白。
- Android WebView 会关闭 OEM 自动文字放大，并为 HarmonyOS、MagicOS、MIUI/HyperOS 与 ColorOS/OriginOS 补充字体回退；状态栏和导航栏会随浅色/暗色主题同步。
- 点击空白节次添加课程，点击课程进入完整详情。
- Android 系统返回键与边缘返回手势按界面层级回退：先关闭展开内容和选择面板，再关闭详情页，不会误退出应用。

<p align="center">
  <img src="docs/screenshots/week-light.png" width="260" alt="KeXu 周课表浅色界面" />
</p>

截图仅用于展示界面，已检查不包含真实姓名、账号、API Key 等个人信息。

单日页面使用一条跨屏宽稳定居中的日期选择器；外框与操作按钮保持稳定，大日期在窗口内跟手换入，黑色日期选框向手势反方向跨格移动，课程内容独立滑动；偏离今天时提供“回到今天”。

<p align="center">
  <img src="docs/screenshots/day-light.png" width="260" alt="KeXu 单日课程界面" />
</p>

### 课程编辑

- 修改范围：仅本次、从当前周起、本安排、整门课。
- “整门课”可把地点同步到同一课程的全部分散安排，同时保留各安排原有时间和周次。
- 支持课程名称、教师、学分、类型、周次、星期、节次、地点和颜色。
- 课程类型、星期、节次、点名情况和日程类型均使用统一的自定义动画选择面板，不依赖不同厂商样式不一的原生下拉框。
- 支持成绩构成、点名情况、备注，以及考试、答辩和 DDL。
- 设置页可逐节修改 1–12 节的上课与下课时间；滚轮选择带吸附、阻尼和选中放大效果，修改会同步到课表、单日视图与通知。
- 地点可显示完整地址、仅校区或仅教室；原始地址不会被显示偏好破坏。

### 学期与导入

- 课程按学期隔离保存，并记录第一周周一。
- 学期选择面板支持跟手左滑显露删除操作；点击删除后仍需二次确认，并同步清理课程、日程及单周修改。若删掉最后一个学期，会保留一个空白新学期，不会把演示数据重新塞回来。
- 设置页提供“新建学期并导入”入口；识别完成后可明确选择合并到已有学期或创建独立新学期，并同时设置第一周周一与 `1–30` 周的学期长度。
- 同一课程在周二、周三等多个时间出现时会归并为一门课程的多个安排；理论、实验和实践也使用同一课程实体，每个安排独立保留类型、教师、地点、周次和节次。这样修改整门课的颜色或地点时可以同步，编辑单次安排时又不会混淆属性。
- 内置 PDF 文本层读取、Adobe 中文 CMap、页面坐标解析和本地 Tesseract OCR；识别后会恢复常见英文课程名的单词边界。
- 图片支持最多 8 张联合识别；若手机文件选择器不支持多选，可以每次选择一张并反复点击“继续添加图片”。DeepSeek 视觉模式会把连续截图作为同一个课表理解星期列、节次行、跨行色块与跨图衔接。
- 为避免模型缩图后看不清小字，长图会在本地生成“全图概览 + 重叠细节裁片”，模型同时参考整体版面和局部文字，裁片不会重复计课。
- 支持 PDF、PNG/JPG/WebP、Excel（XLSX/XLS/XLSM/XLSB/ODS）、CSV/TSV、Word DOCX，以及 TXT/Markdown/JSON/LOG；旧版二进制 DOC 需先另存为 DOCX。
- 在 DeepSeek 精确模式下，Word、Excel、纯文本和带文本层 PDF 先在设备上抽取文字与表格结构，再直接交给文本模型整理字段，不经过 OCR；扫描 PDF 和图片才使用视觉模型或本地 OCR。
- 模型会以星期列、节次行和课程块为版面锚点，区分课程名、教师、学分、周次、节次、地点与描述；不确定的字段不再强猜，并在导入预览中标记“需核对”和具体原因。
- 重新导入时合并已有学期，保留手动课程、课程详情、里程碑和用户修改。
- DeepSeek API 仅在用户主动选择“DeepSeek 精确识别”或“校对结构”时调用。图片使用 `deepseek-v4-flash-vision-exp`，文档结构化使用 `deepseek-v4-flash`；402 会明确提示账户余额不足并保留可用的本地结果，识别页同时提供阶段进度、耗时和取消按钮。

<p align="center">
  <img src="docs/screenshots/semester-swipe.png" width="260" alt="KeXu 学期左滑管理" />
</p>

### 提醒、壁纸与数据

- Android 端可在课前指定分钟数发送高优先级通知，显示课程、时间和完整地址。
- 支持通知权限、通知渠道、精确闹钟权限和应用系统设置跳转；从系统授权页返回、应用重新进入前台、重启、升级或更改系统时间后都会重新安排提醒。
- 设置页提供即时“发送测试通知”和后台耗电设置入口，并显示已安排数量、下次触发、最近实际触发及后台限制状态，便于区分课程数据、权限和厂商省电策略问题。
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
- SheetJS、Mammoth.js
- vite-plugin-pwa
- 原生 Java 通知与 AlarmManager 调度

PDF、OCR、Excel 和 Word 解析器均采用动态导入，只在用户选择相应文件时加载，不进入日常查看课表的首屏执行路径；视觉模型和文档结构化模型只在一次导入过程中调用，不拖慢平常启动与看课表。导入结果还会经过本地确定性归并与去重，即使模型把跨日或理论/实验输出成多条课程，也会在写入前恢复为“课程 → 多安排”的结构。

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
│  ├─ check-android-ui.mjs      # 跨 Android WebView 的静态适配守卫
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
│  ├─ importer.js                # 导入编排、PDF/OCR、DeepSeek 结构化
│  ├─ documentImporter.js        # 按需 Excel、CSV、DOCX 与文本解析
│  ├─ textNormalization.js       # 中英文课程名清洗与词界恢复
│  ├─ presentation.js            # 课程卡片文案等显示纯函数
│  ├─ reminders.js               # 提醒数据构建及原生桥接
│  ├─ schedule.js                # 周次、日期、课程合并与显示逻辑
│  ├─ storage.js                 # 本地持久化、迁移和损坏数据恢复
│  ├─ data.test.js               # 设置默认值与兼容性测试
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

该命令依次执行单元测试、Android UI 静态适配守卫和生产构建。测试覆盖周次解析、跨周修改、课程时段分组、手势速度投影、夜间课程识别、跨日与理论/实验安排归并、学期删除后的持久化、旧数据迁移、损坏数据恢复和提醒时间；适配守卫还会检查自定义学期周数、分批多图、文档模型路径、字段置信度、统一表单字形、通知自检、授权返回重排以及 Android 15 边到边行为。

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
- 免费本地解析模式下，PDF、表格、文档与 OCR 均在设备端完成，不上传课表内容。
- 用户填写 DeepSeek API Key 并主动选择“DeepSeek 精确识别”后，本次所选图片会发送至 DeepSeek 视觉模型；Word、Excel、文本或带文本层 PDF 只发送在本地抽取出的文字/表格结构，不发送原文件。主动点击“校对结构”时也只发送识别文本，界面会在调用前明确提示。
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
- 仓库不包含发布私钥；官方 Release 使用仓库外的稳定签名配置。自行构建 release APK 时需要配置自己的 `android/signing.properties`，不同证书之间不能直接覆盖安装。

## 贡献

提交修改前请确保 `npm run check` 通过。涉及导入器时，请加入去标识化的最小 OCR 文本样例和对应测试；不要提交真实 API Key、完整个人课表、`tmp/` 内容或 APK。

## 许可证

仓库目前尚未附加开源许可证。在选择许可证前，默认保留所有权利；公开上传前可根据预期协作方式补充 MIT、Apache-2.0 或其他许可证。
