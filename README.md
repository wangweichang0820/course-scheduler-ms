# 北交大 MEM 研究生排课工作台

> 2026 Qoder 高校创造力大赛 · StudyHack 学习科研赛道 参赛项目
>
> 纯前端 · IndexedDB · 无后端 · 一条命令部署到 Qoder Sites

一个面向高校研究生教务的**轻量排课工作台**：把学期 / 班级 / 教师 / 教室 / 教学任务全部装进浏览器，用**拖拽网格 + 周次位图 + 冲突引擎**完成排课，一键导出教务可直接使用的 A4 横向 xlsx。

## ✨ 核心亮点

| # | 功能 | 一句话说明 |
|---|------|-----------|
| 1 | 拖拽网格排课 | 左侧点任务、右侧点格子即出草稿卡片；已排卡片可拖拽换格；保存前不落盘 |
| 2 | 位图周次引擎 | `week_pattern` 用 0/1 串表达 1-24 周上课分布，冲突判定 = 星期相同 ∧ 节次区间相交 ∧ 位图与运算非空 |
| 3 | 一键自动排课 | 贪心：按任务顺序遍历 (星期, 节次块, 教室) 三元组，避开教师 / 教室 / 同格占用 |
| 4 | 学期体检 · 12 条规则 | 8 条 error（教师冲突 / 教室冲突 / 任务重复 / 合班不一致 / 周次越界 / 缺失 / 节次非法 / 超课时）+ 4 条 warning |
| 5 | xlsx 一键导出 | ExcelJS 生成标准 OOXML：简版 / 分周版 / 全部班级 zip，A4 横向、冻结表头、可打印 |

## 🚀 快速开始

```bash
# 首次
npm install

# 开发（默认 http://localhost:5180）
npm run dev

# 生产构建（产物在 dist/）
npm run build

# 本地预览构建结果
npm run preview
```

首次进入会自动播种**真实脱敏种子数据**（来自原 Sch_Clas_MS MySQL 库 `stuinfo_20261023_181617.sql`，
经映射表 `_anon/mapping.json` 完整脱敏，教师 / 工号 / 班级 / 校区 / 教学楼 / 课程号 均为映射名）：

- 2 学期（当前：2026-2027 秋季 · 19 周）· 4 校区 · 2 教学楼 · **9 个 MEM 班级**
- **53 门课程 · 50 位教师 · 6 间场地 · 7 节作息 · 51 条节假日**
- **71 个教学任务 · 1 张已排排课单（16 slot + 3 周组）**，其余 8 个班自动补空白排课单，可一键 ⚡自动排课 或手动拖拽
- 覆盖三类班型（全日制 / 非全周末班 / 非全集中班），位图周次与三段重叠冲突判定均可直接演示

侧栏底部有「**重置演示数据**」按钮，可随时回到出厂状态。

## 🧭 使用路径（评委演示脚本）

1. **工作台总览** → 看数据规模、体检速览、5 大亮点入口
2. **基础信息** → 6 个 tab（班级 / 课程 / 教师 / 教室 / 学期 / 节假日）通用 CRUD
3. **教学任务** → 合班多选 + 位图周次选择器 + 已排课时回填
4. **排课工作台** → 选排课单 → 左侧点任务 → 网格上点格子放置 → ⚡一键自动排课 → 💾保存（弹冲突确认）
5. **学期体检** → 12 条规则扫描全学期 slot，可按级别 / 类型筛选，展开看冲突明细并跳转到对应排课单
6. **课表查看** → 班级视角 / 教师视角切换，简版 vs 逐周，导出 xlsx

## 📁 目录结构

```
src/
├── components/    9 个纯 props/emit 组件（从 Sch_Clas_MS 直接迁移）
│   ├── ScheduleGrid.vue      排课工作台主网格（拖拽、单元点击）
│   ├── CompactTimetable.vue  简版课表（同格周次合并）
│   ├── TimetableGrid.vue     逐周网格（stacked 模式）
│   ├── WeekPicker.vue        位图周次选择器
│   └── ...
├── views/         6 个页面（Home / Entities / Tasks / Schedule / Audit / Timetable）
├── engine/        冲突引擎 conflicts.js · 体检引擎 audit.js
├── utils/         11 个纯函数（weeks / schedule / compactGrid / exportTimetable ...）
├── stores/        Pinia 全局数据层（一次全量缓存 + CRUD action）
├── db/            Dexie (IndexedDB) schema · ensureSeeded · wipeAll
├── seed/          real-data.json 种子（旧系统真实业务数据 · 已脱敏）+ demo-data.js 播种逻辑
├── layouts/       MainLayout（header + side + main，学期/班型筛选器）
└── router/        6 个子路由 · hash 模式（Qoder Sites 直接托管零改写）
```

## 🛠 技术栈

- Vue 3.5 · Vite 6 · Pinia 2 · vue-router 4（hash 模式）
- Element Plus 2.9
- **Dexie 4** — IndexedDB ORM，取代原项目的 SQLAlchemy + MySQL
- **ExcelJS 4 + JSZip 3** — 浏览器端生成标准 xlsx 与批量 zip
- 无 Node 运行时 · 无外部 API · 打开即可用

## 📦 部署

见 [`docs/DEPLOY-QODER-SITES.md`](docs/DEPLOY-QODER-SITES.md)。一句话：`npm run build` → 对 Qoder 说「把 dist 发布成站点」→ 拿到公开链接。

## 📝 参赛帖素材

见 [`docs/参赛帖素材.md`](docs/参赛帖素材.md)。

---

**授权**：仅用于 2026 Qoder 高校创造力大赛参赛演示；核心算法与交互设计源自参赛者此前开发的 Sch_Clas_MS 项目，本工程为其纯前端重构版。
