/**
 * IndexedDB 数据层：基于 Dexie。
 *
 * 与原后端 SQLAlchemy 模型一一对应，去掉鉴权、审计档案、导入批次、留言、
 * 教师标注等比赛版不需要的表，保留排课主链：
 *   semester / classRoom / course / teacher / venue / teachingTask /
 *   scheduleSheet / scheduleSlot / holiday
 *
 * 所有表都在 `stores/*.js` 里通过 Dexie CRUD 访问，视图层不直接依赖本文件。
 */
import Dexie from 'dexie'

export const db = new Dexie('bjtu-mem-scheduler')

/** 种子版本号：与 demo-data.js 里的 SEED_VERSION 对应；变化时自动 wipe + 重播 */
export const SEED_VERSION = 'real-v1'

db.version(2).stores({
  // 主键 id 自增；其余字段建索引以支持筛选
  semesters: '++id, code, academic_year, term_name, is_current',
  campuses: '++id, name',
  buildings: '++id, name, campus_id',
  classRooms: '++id, code, class_form, study_mode',
  courses: '++id, code, teaching_mode, level',
  teachers: '++id, name, title, department',
  venues: '++id, room_no, building, campus, is_available',
  timeslots: 'period',
  teachingTasks: '++id, course_id, semester, class_form, *class_ids, *teacher_ids',
  scheduleSheets: '++id, semester, class_id',
  scheduleSlots: '++id, sheet_id, task_id, semester, class_id, day_of_week',
  weekGroups: '++id, sheet_id',
  sheetTasks: '++id, sheet_id, task_id',
  holidays: '++id, date, is_workday',
  meta: 'key'
})

/** 判断是否首次使用；首次使用或种子版本变化时重新播种 */
export async function ensureSeeded(seedFn, version = SEED_VERSION) {
  const flag = await db.meta.get('seeded')
  if (flag && flag.value === version) return false
  // 版本切换：先清空旧数据（比如从手写 demo 切到真实脱敏种子数据）
  await wipeAll()
  await seedFn(db)
  await db.meta.put({ key: 'seeded', value: version, at: Date.now() })
  return true
}

/** 一键清空（评委演示时可用来恢复出厂） */
export async function wipeAll() {
  await Promise.all([
    db.semesters.clear(),
    db.campuses.clear(),
    db.buildings.clear(),
    db.classRooms.clear(),
    db.courses.clear(),
    db.teachers.clear(),
    db.venues.clear(),
    db.timeslots.clear(),
    db.teachingTasks.clear(),
    db.scheduleSheets.clear(),
    db.scheduleSlots.clear(),
    db.weekGroups.clear(),
    db.sheetTasks.clear(),
    db.holidays.clear(),
    db.meta.clear()
  ])
}

/** 常用 id -> entity 索引，视图层用 */
export async function indexById(table) {
  const rows = await db.table(table).toArray()
  const map = new Map()
  for (const r of rows) map.set(r.id, r)
  return map
}
