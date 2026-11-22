/**
 * Demo 种子数据 · 北交大 MEM 2026-2027 秋季
 *
 * 数据源：`scripts/build-real-seed.mjs` 从原 Sch_Clas_MS 项目 mysqldump 抽取
 * 并按软著申报脱敏映射（`_anon/mapping.json`）替换后的 `real-data.json`：
 *   - 2 学期 / 4 校区 / 2 教学楼 / 9 班级 / 53 课程 / 50 教师 / 6 场地
 *   - 7 作息节次 / 51 节假日 / 73 教学任务 / 1 排课单 / 16 slot / 3 周组
 *   - 教师姓名 / 工号 / 班级 / 校区 / 教学楼 / 课程号 全部走映射表，不含真实信息
 *
 * 视图与 store 都从这里拿数据；`TIMESLOTS` / `DAYS` 是模块级 export，供
 * TimetableView、ScheduleView 直接 import 用于渲染节次行与星期列。
 */
import realData from './real-data.json'
import { periodHours } from '@/utils/schedule'

export const SEED_VERSION = 'real-v1'
const CURRENT_SEMESTER = '2026-2027 秋季'

// ---- 作息节次：直接来自申报数据（1-6 节各 2 课时，第 7 节 1 课时；第 3 节展示层隐藏） ----
export const TIMESLOTS = (realData.timeslots || []).map((t) => ({
  period: Number(t.period),
  label: t.label,
  start: t.start,
  end: t.end,
  section: t.section,
  hours: periodHours(t.period)
}))

export const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/**
 * 播种入口：把 real-data.json 按 Dexie schema 逐表写入 IndexedDB。
 * 保留原 SQL 主键 id，方便视图从 slot 反查 task/course；
 * 未预置排课单的班级会自动补一张空白 sheet，让 8 个 MEM 班型都能进入排课页；
 * holiday 表的 SQL 字段 `day` 在写入前统一改名为 schema 里的 `date`。
 */
export async function seedDemo(db) {
  const data = realData

  await db.semesters.bulkAdd(data.semesters)
  await db.campuses.bulkAdd(data.campuses || [])
  await db.buildings.bulkAdd(data.buildings || [])
  await db.classRooms.bulkAdd(data.classRooms)
  await db.courses.bulkAdd(data.courses)
  await db.teachers.bulkAdd(data.teachers)
  await db.venues.bulkAdd(data.venues)
  await db.timeslots.bulkAdd(data.timeslots)

  // holidays：源字段 day -> schema 字段 date
  await db.holidays.bulkAdd((data.holidays || []).map((h) => ({
    id: h.id,
    date: h.day,
    name: h.name,
    kind: h.kind,
    year: h.year,
    remark: h.remark || '',
    is_workday: h.is_workday
  })))

  await db.teachingTasks.bulkAdd(data.teachingTasks)

  // 已存在的排课单
  const sheets = (data.scheduleSheets || []).map((s) => ({ ...s }))
  await db.scheduleSheets.bulkAdd(sheets)

  // 为还没有排课单的班级补一张空白 sheet，避免排课页选中后无内容
  const haveClassIds = new Set(sheets.map((s) => Number(s.class_id)))
  const missingSheets = data.classRooms
    .filter((c) => !haveClassIds.has(Number(c.id)))
    .map((c) => ({
      semester: CURRENT_SEMESTER,
      class_id: c.id,
      name: `${c.name} · 排课单`,
      week_pattern: '',
      remark: '自动补建的空白排课单，等待排课',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))
  if (missingSheets.length) await db.scheduleSheets.bulkAdd(missingSheets)

  await db.scheduleSlots.bulkAdd(data.scheduleSlots || [])
  await db.weekGroups.bulkAdd(data.weekGroups || [])
  await db.sheetTasks.bulkAdd(data.sheetTasks || [])

  // 已排 slot 的任务标 "部分已排"，其他保持源 status（多为 "待排"）
  const scheduledTaskIds = new Set((data.scheduleSlots || []).map((s) => Number(s.task_id)))
  for (const id of scheduledTaskIds) {
    await db.teachingTasks.update(id, { status: '部分已排' })
  }

  return {
    semesters: data.semesters.length,
    classRooms: data.classRooms.length,
    courses: data.courses.length,
    teachers: data.teachers.length,
    venues: data.venues.length,
    holidays: (data.holidays || []).length,
    teachingTasks: data.teachingTasks.length,
    scheduleSheets: sheets.length + missingSheets.length,
    scheduleSlots: (data.scheduleSlots || []).length,
    weekGroups: (data.weekGroups || []).length,
    sheetTasks: (data.sheetTasks || []).length
  }
}
