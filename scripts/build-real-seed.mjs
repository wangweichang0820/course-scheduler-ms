/**
 * 一次性把「软著申报」加工数据从 MySQL dump 转成本项目 IndexedDB 播种用 JSON。
 *
 * 输入：
 *   - d:/project/Sch_Clas_MS/backup/local_sync/stuinfo_20261023_181617.sql
 *   - d:/project/Sch_Clas_MS/output/软著申请/_anon/mapping.json （姓名/工号/班级/校区/楼名/课号 脱敏映射）
 *
 * 输出：src/seed/real-data.json（按 Dexie 表结构组织）
 *
 * 用法：node scripts/build-real-seed.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SQL_PATH = 'd:/project/Sch_Clas_MS/backup/local_sync/stuinfo_20261023_181617.sql'
const MAP_PATH = 'd:/project/Sch_Clas_MS/output/软著申请/_anon/mapping.json'
const OUT_PATH = resolve(ROOT, 'src/seed/real-data.json')

const sql = readFileSync(SQL_PATH, 'utf8')
const rawMap = JSON.parse(readFileSync(MAP_PATH, 'utf8'))

// ---- 通用 SQL 解析 -------------------------------------------------------

/** 从 CREATE TABLE `t` (...) 抠出列名（按声明顺序，仅取字段行，跳过主键/索引/约束） */
function parseColumns(table) {
  const m = sql.match(new RegExp(`CREATE TABLE \\\`${table}\\\` \\(([\\s\\S]+?)\\)\\s*ENGINE`))
  if (!m) throw new Error(`未找到 CREATE TABLE ${table}`)
  const cols = []
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim()
    const c = line.match(/^`([^`]+)`\s+/)
    if (!c) continue
    if (/^(PRIMARY|UNIQUE|KEY|CONSTRAINT|INDEX|FOREIGN|CHECK)\b/i.test(line)) continue
    cols.push(c[1])
  }
  return cols
}

/** 从 INSERT INTO `t` VALUES (row),(row); 抠出所有 row，返回 array of array */
function parseInsert(table) {
  const cols = parseColumns(table)
  const m = sql.match(new RegExp(`INSERT INTO \\\`${table}\\\` VALUES ([\\s\\S]+?);\\r?\\n`))
  if (!m) return { cols, rows: [] }
  const rows = []
  for (const tuple of splitTuples(m[1])) {
    const values = splitValues(tuple)
    const obj = {}
    cols.forEach((c, i) => { obj[c] = values[i] })
    rows.push(obj)
  }
  return { cols, rows }
}

/** 扫描 "(...),(...),...)"，返回每个括号内的原始字符串（不含最外层括号） */
function splitTuples(s) {
  const out = []
  let depth = 0
  let inStr = false
  let esc = false
  let buf = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      buf += ch
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === "'") inStr = false
      continue
    }
    if (ch === "'") { inStr = true; buf += ch; continue }
    if (ch === '(') {
      depth++
      if (depth === 1) { buf = ''; continue }
      buf += ch
      continue
    }
    if (ch === ')') {
      depth--
      if (depth === 0) { out.push(buf); buf = ''; continue }
      buf += ch
      continue
    }
    if (depth >= 1) buf += ch
  }
  return out
}

/** 拆分单条 VALUES (a,b,'c,d',NULL,...) 里的字段 */
function splitValues(tuple) {
  const out = []
  let buf = ''
  let inStr = false
  let esc = false
  let depth = 0
  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i]
    if (inStr) {
      if (esc) { buf += ch; esc = false; continue }
      if (ch === '\\') { buf += ch; esc = true; continue }
      if (ch === "'") { inStr = false; buf += ch; continue }
      buf += ch
      continue
    }
    if (ch === "'") { inStr = true; buf += ch; continue }
    if (ch === '(') { depth++; buf += ch; continue }
    if (ch === ')') { depth--; buf += ch; continue }
    if (ch === ',' && depth === 0) { out.push(castValue(buf)); buf = ''; continue }
    buf += ch
  }
  if (buf.length) out.push(castValue(buf))
  return out
}

function castValue(raw) {
  const v = raw.trim()
  if (v === 'NULL') return null
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v.startsWith("'") && v.endsWith("'")) {
    return unescapeMysql(v.slice(1, -1))
  }
  return v
}

function unescapeMysql(s) {
  return s.replace(/\\(.)/g, (_, c) => {
    switch (c) {
      case 'n': return '\n'
      case 't': return '\t'
      case 'r': return '\r'
      case '0': return '\0'
      case '\\': return '\\'
      case "'": return "'"
      case '"': return '"'
      case 'b': return '\b'
      case 'Z': return '\x1a'
      default: return c
    }
  })
}

// ---- 脱敏映射 ------------------------------------------------------------

function anonPerson(s) { return rawMap.person[s] || s }
function anonEmpNo(s) { const k = String(s || ''); return rawMap.emp_no[k] || k }
function anonClass(s) { return rawMap.class[s] || s }
function anonCampus(s) { return rawMap.campus[s] || s }
function anonBuilding(s) { return rawMap.building[s] || s }
function anonBuildingShort(s) { return rawMap.building_prefix[s] || rawMap.building_short[s] || s }
function anonCourseCode(s) { return rawMap.course_code[s] || s }
/** 自由文本中的校区 / 教学楼 / 班级 / 人名 依次替换（长串优先） */
function anonText(s) {
  if (!s) return s
  let out = String(s)
  const replaceAll = (map) => {
    for (const [k, v] of Object.entries(map).sort((a, b) => b[0].length - a[0].length)) {
      out = out.split(k).join(v)
    }
  }
  replaceAll(rawMap.person)
  replaceAll(rawMap.class)
  replaceAll(rawMap.campus)
  replaceAll(rawMap.building)
  replaceAll(rawMap.course_code)
  return out
}

// ---- 读取 & 转换 ---------------------------------------------------------

const TABLES = ['semesters','campuses','buildings','classrooms','courses','teachers','venues','time_slots','holidays','teaching_tasks','teaching_task_classes','teaching_task_teachers','schedule_sheets','schedule_sheet_tasks','schedule_slots','schedule_week_groups']
const src = {}
for (const t of TABLES) src[t] = parseInsert(t).rows
const count = Object.fromEntries(Object.entries(src).map(([k, v]) => [k, v.length]))
console.log('SQL 抽取行数：', count)

// semester：保留 code 与 weeks 用于本学期上限；is_current 供 store.init 默认选中
const semesters = src.semesters
  .filter((r) => r.code && !['2025-2026 秋季','2025-2026 春季'].includes(r.code)) // 25 年数据太旧，跳过
  .map((r) => ({
    id: r.id,
    code: r.code,
    academic_year: r.academic_year,
    term_no: r.term_no,
    term_name: r.term_name,
    weeks: r.weeks,
    start_date: r.start_date,
    end_date: r.end_date,
    is_current: r.is_current ? 1 : 0,
    remark: anonText(r.remark || '')
  }))

const campuses = src.campuses.map((r) => ({
  id: r.id,
  name: anonCampus(r.name),
  short_name: anonText(r.short_name || '')
}))

const buildings = src.buildings.map((r) => ({
  id: r.id,
  campus_id: r.campus_id,
  name: anonBuilding(r.name),
  short_name: anonBuildingShort(r.short_name) || anonBuilding(r.short_name)
}))

// classRooms：Dexie 里就叫 classRooms，字段沿用旧系统的 classrooms
const classRooms = src.classrooms.map((r) => ({
  id: r.id,
  code: r.code,
  name: anonClass(r.name),
  grade: r.grade,
  major: anonClass(r.major || ''),
  enroll_year: r.enroll_year,
  capacity: r.capacity,
  study_mode: r.study_mode,
  class_form: r.class_form || r.study_mode,
  remark: anonText(r.remark || '')
}))

const courses = src.courses
  // TMP0001/2 是"待补充"占位课程，与真实数据混淆，剔除
  .filter((r) => !String(r.code).startsWith('TMP'))
  .map((r) => ({
    id: r.id,
    code: anonCourseCode(r.code),
    name: anonText(r.name),
    course_type: r.course_type,
    credit: Number(r.credit) || 0,
    hours: Number(r.hours) || 0,
    exam_type: r.exam_type,
    teaching_mode: r.teaching_mode || '线下',
    level: r.course_type || '必修',
    remark: anonText(r.remark || '')
  }))
const courseCodeMap = new Map(src.courses.map((r) => [r.id, r.code]))

const teachers = src.teachers.map((r) => ({
  id: r.id,
  teacher_no: anonEmpNo(r.teacher_no),
  name: anonPerson(r.name),
  gender: r.gender,
  title: r.title,
  department: anonText(r.department || ''),
  office: anonText(r.office || ''),
  is_mentor: r.is_mentor ? 1 : 0,
  max_students: r.max_students,
  remark: anonText(r.remark || '')
}))

// venues：连接 buildings + campuses 拼出 building / campus 字符串
const buildingById = new Map(buildings.map((b) => [b.id, b]))
const campusById = new Map(campuses.map((c) => [c.id, c]))
const venues = src.venues
  // 排除 room_no 为空的空占位教室
  .filter((r) => r.room_no)
  .map((r) => {
    const b = r.building_id ? buildingById.get(r.building_id) : null
    const c = b ? campusById.get(b.campus_id) : null
    return {
      id: r.id,
      room_no: anonText(r.room_no),
      room_type: r.room_type,
      capacity: r.capacity,
      is_available: r.is_available ? 1 : 0,
      building: b ? b.name : '',
      building_short: b ? b.short_name : '',
      campus: c ? c.name : '',
      campus_short: c ? c.short_name : ''
    }
  })

const timeslots = src.time_slots
  .sort((a, b) => Number(a.period) - Number(b.period))
  .map((r) => ({
    period: Number(r.period),
    label: r.label,
    start: r.start,
    end: r.end,
    section: r.section
  }))

const holidays = src.holidays
  .filter((r) => r.day)
  .map((r) => ({
    id: r.id,
    day: r.day,
    name: r.name,
    kind: r.kind,
    year: r.year,
    remark: r.remark || '',
    is_workday: r.kind === '调休上班日' ? 1 : 0
  }))

// teaching_tasks：合班 / 多教师分别走 teaching_task_classes / teaching_task_teachers 关联表
const taskClasses = new Map()
for (const r of src.teaching_task_classes) {
  const arr = taskClasses.get(r.task_id) || []
  arr.push(r.class_id)
  taskClasses.set(r.task_id, arr)
}
const taskTeachers = new Map()
for (const r of src.teaching_task_teachers) {
  const arr = taskTeachers.get(r.task_id) || []
  arr.push({ id: r.teacher_id, role: r.role, sort: r.sort_order })
  taskTeachers.set(r.task_id, arr)
}

// 参照完整性集合：用于剔除 course/teacher/class 外键已失的任务
const courseIdSet = new Set(courses.map((c) => c.id))
const teacherIdSet = new Set(teachers.map((t) => t.id))
const classIdSet = new Set(classRooms.map((c) => c.id))

const teachingTasks = src.teaching_tasks
  // 只保留当前展示学期相关任务：与 semesters 里的 code 交集
  .filter((r) => semesters.some((s) => s.code === r.semester))
  // 参照完整性：course_id 必须在最终 courses 集里（TMP 占位行已剔除，不能留孤儿任务）
  .filter((r) => r.course_id == null || courseIdSet.has(Number(r.course_id)))
  .map((r) => {
    const extraClassIds = taskClasses.get(r.id) || []
    const teacherIds = (taskTeachers.get(r.id) || []).sort((a, b) => a.sort - b.sort).map((x) => x.id)
    return {
      id: r.id,
      semester: r.semester,
      course_id: r.course_id,
      teacher_id: r.teacher_id,
      teacher2_id: r.teacher2_id,
      class_id: r.class_id,
      class_ids: [...new Set([r.class_id, ...extraClassIds].filter((x) => x != null))],
      teacher_ids: teacherIds.length ? teacherIds : [r.teacher_id, r.teacher2_id].filter((x) => x != null),
      task_name: anonText(r.task_name || ''),
      student_count: r.student_count,
      total_hours: r.total_hours,
      weekly_hours: r.weekly_hours,
      sessions_per_week: r.sessions_per_week,
      periods_per_session: r.periods_per_session,
      start_week: r.start_week,
      end_week: r.end_week,
      week_type: r.week_type,
      week_pattern: r.week_pattern || '',
      room_type_required: r.room_type_required,
      status: r.status,
      section_no: r.section_no || '',
      class_form: r.class_form || '',
      study_mode: r.study_mode || '',
      exam_type: r.exam_type || '',
      remark: anonText(r.remark || '')
    }
  })

const scheduleSheets = src.schedule_sheets
  .filter((r) => semesters.some((s) => s.code === r.semester))
  .map((r) => ({
    id: r.id,
    semester: r.semester,
    class_id: r.class_id,
    name: anonText(r.name),
    week_pattern: r.week_pattern || '',
    remark: anonText(r.remark || ''),
    created_at: r.created_at,
    updated_at: r.updated_at
  }))

const scheduleSlots = src.schedule_slots
  .filter((r) => semesters.some((s) => s.code === r.semester))
  .map((r) => {
    const v = r.venue_id ? venues.find((x) => x.id === r.venue_id) : null
    return {
      id: r.id,
      sheet_id: r.sheet_id,
      task_id: r.task_id,
      semester: r.semester,
      class_id: r.class_id,
      day_of_week: r.day_of_week,
      start_period: r.start_period,
      end_period: r.end_period,
      start_week: r.start_week,
      end_week: r.end_week,
      week_type: r.week_type,
      week_pattern: r.week_pattern || '',
      venue_id: r.venue_id,
      room_no: v ? v.room_no : '',
      room_name: v ? v.room_no : '',
      building: v ? v.building : '',
      campus: v ? v.campus : '',
      class_location: anonText(r.class_location || ''),
      online_url: r.online_url || '',
      locked: r.locked ? 1 : 0,
      source: r.source || 'manual',
      remark: anonText(r.remark || '')
    }
  })

const weekGroups = src.schedule_week_groups.map((r) => ({
  id: r.id,
  sheet_id: r.sheet_id,
  name: anonText(r.name || ''),
  week_pattern: r.week_pattern || '',
  sort_order: r.sort_order
}))

const sheetTasks = src.schedule_sheet_tasks

// ---- 输出 ----------------------------------------------------------------

const output = {
  _meta: {
    source_sql: SQL_PATH,
    source_mapping: MAP_PATH,
    generated_at: new Date().toISOString(),
    counts: {
      semesters: semesters.length,
      campuses: campuses.length,
      buildings: buildings.length,
      classRooms: classRooms.length,
      courses: courses.length,
      teachers: teachers.length,
      venues: venues.length,
      timeslots: timeslots.length,
      holidays: holidays.length,
      teachingTasks: teachingTasks.length,
      scheduleSheets: scheduleSheets.length,
      scheduleSlots: scheduleSlots.length,
      weekGroups: weekGroups.length,
      sheetTasks: sheetTasks.length
    }
  },
  semesters,
  campuses,
  buildings,
  classRooms,
  courses,
  teachers,
  venues,
  timeslots,
  holidays,
  teachingTasks,
  scheduleSheets,
  scheduleSlots,
  weekGroups,
  sheetTasks
}

mkdirSync(dirname(OUT_PATH), { recursive: true })
writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8')
console.log('已写入', OUT_PATH)
console.log('表条目数：', output._meta.counts)
