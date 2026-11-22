/**
 * 简版课表模型：把「排课记录 + 周次标注」压成一张 `星期-显示行 -> 条目数组` 的网格。
 *
 * 页面（CompactTimetable.vue）和批量导出（exportTimetable.js）共用这里，
 * 保证导出的表格与系统里看到的完全一致：同样的星期列、同样的合并节次行、
 * 同格同地点的课程周次合并、同样的标注置顶。
 */
import { patternToWeeks, weeksToText } from '@/utils/weeks'
import { buildDisplayTimeslots, filterVisibleDays, locationRoom } from '@/utils/schedule'
import { markEntries } from '@/utils/teacherMarks'

/** 班型对应的可见星期列，以及首列对应的真实星期偏移（周末班从周六开始 → 5） */
export function visibleDayWindow(days, classForm) {
  const visibleDays = filterVisibleDays(days, classForm)
  const first = visibleDays[0]
  const idx = first ? days.indexOf(first) : -1
  return { visibleDays, dayOffset: idx > 0 ? idx : 0 }
}

/** 排课条目在第 week 周是否上课（位图优先，缺失回退起止周） */
export function slotOnWeek(s, week) {
  const ws = patternToWeeks(s.week_pattern)
  if (ws.length) return ws.includes(Number(week))
  const start = Number(s.start_week) || 1
  const end = Number(s.end_week) || start
  return Number(week) >= start && Number(week) <= end
}

/** 周次集合 -> 可读文本，与本人课程同一口径（`1-8周、10周`） */
function textOf(weekSet) {
  return weeksToText([...(weekSet || [])], { prefix: '', unit: '周' })
}

/**
 * 构建简版课表网格。
 * @param {object} data
 *   items 排课记录（serialize_slot 输出，可含 masked）；timeslots/days 作息与星期；
 *   classForm 班型（决定星期列与合并行）；marks 周次标注（原始记录，内部转条目）
 * @returns {{timeslots: Array, visibleDays: Array, dayOffset: number, grid: Object}}
 */
export function buildCompactModel({ items = [], timeslots = [], days = [], classForm = '', marks = [] }) {
  const { visibleDays, dayOffset } = visibleDayWindow(days, classForm)
  const rows = [...buildDisplayTimeslots(timeslots, classForm)].sort(
    (a, b) => (a.period || 0) - (b.period || 0)
  )
  // 实际节次 -> 显示行行号（合并行时多对一）
  const rowPeriodOf = new Map()
  for (const p of rows) {
    for (let n = Number(p.periodStart ?? p.period); n <= Number(p.periodEnd ?? p.period); n++) {
      rowPeriodOf.set(n, p.period)
    }
  }

  const map = new Map()
  for (const s of items) {
    const day = Number(s.day_of_week)
    const startPeriod = Number(s.start_period)
    if (!day || !startPeriod) continue
    const endPeriod = Number(s.end_period || startPeriod)
    // 连排块（周末/集中班 1-2、4-5 节）要铺满跨到的每个显示行：
    // 合并行下多节映射到同一行、去重后仍是一条；不合并行（如教师跨班型）则逐行显示，避免只占一节
    const periods = new Set()
    for (let n = startPeriod; n <= endPeriod; n++) {
      const r = rowPeriodOf.get(n)
      if (r != null) periods.add(r)
    }
    if (!periods.size) periods.add(rowPeriodOf.get(startPeriod) || startPeriod)
    const location = locationRoom(s) // 周课表只显示房间号，校区/教学楼全文不占格子
    const ws = patternToWeeks(s.week_pattern)
    let weekList = ws
    if (!weekList.length) {
      const sw = Number(s.start_week) || 1
      const ew = Number(s.end_week) || sw
      weekList = []
      for (let w = sw; w <= ew; w++) weekList.push(w)
    }
    for (const period of periods) {
      const key = s.masked ? `mask-${day}-${period}-${s.id}` : `${day}-${period}-${s.task_id}-${location}`
      let item = map.get(key)
      if (!item) {
        // 他人课程只保留时间位置与周次（身份字段后端已清空），周次用来在色块上标注占用区间
        item = s.masked
          ? { key, day, period, masked: true, weekSet: new Set() }
          : {
              key,
              day,
              period,
              task_id: s.task_id,
              course_name: s.course_name || s.task_name || '未命名课程',
              teachers: String(s.teacher_names || s.teacher_name || '').replaceAll('、', ' -'),
              section_no: s.section_no || '',
              location,
              weekSet: new Set()
            }
        map.set(key, item)
      }
      for (const w of weekList) item.weekSet.add(w)
    }
  }

  const grid = {}
  for (const it of [...map.values()].map((it) => ({ ...it, weeks_text: textOf(it.weekSet) }))) {
    ;(grid[`${it.day}-${it.period}`] ||= []).push(it)
  }
  const firstWeek = (it) => {
    let min = Infinity
    for (const w of it.weekSet || []) if (w < min) min = w
    return min === Infinity ? 0 : min
  }
  for (const [key, list] of Object.entries(grid)) {
    const own = list.filter((it) => !it.masked)
    if (own.length) {
      // 同一格有本人课程时只显示本人课程
      grid[key] = own
      continue
    }
    // 只剩他人课程：整格并成一个色块，块上写全部占用周次的并集（一门课一段会很难读）
    const { day, period } = list[0]
    const union = new Set()
    for (const it of list) for (const w of it.weekSet) union.add(w)
    grid[key] = [{
      key: `${key}-mask`, day, period, masked: true, weekSet: union, weeks_text: textOf(union)
    }]
  }
  for (const list of Object.values(grid)) {
    list.sort((a, b) =>
      firstWeek(a) - firstWeek(b) ||
      String(a.course_name || '').localeCompare(String(b.course_name || ''), 'zh') ||
      String(a.section_no || '').localeCompare(String(b.section_no || ''), 'zh')
    )
  }

  // 周次标注置顶显示：它是管理员叠的占用标识，不该被课程挤出视野；跨节次的标注同样铺满每个显示行
  for (const m of markEntries(marks)) {
    const ms = Number(m.start_period)
    const me = Number(m.end_period || ms)
    const periods = new Set()
    for (let n = ms; n <= me; n++) {
      const r = rowPeriodOf.get(n)
      if (r != null) periods.add(r)
    }
    if (!periods.size) periods.add(rowPeriodOf.get(ms) || ms)
    for (const period of periods) {
      const key = `${m.day_of_week}-${period}`
      ;(grid[key] ||= []).unshift({ ...m, key: `${m.id}-${period}` })
    }
  }
  return { timeslots: rows, visibleDays, dayOffset, grid }
}

/**
 * 逐周展开：返回 [{ week, slots, marks }]，只保留有课或有标注的周。
 * 只看周次位图，不看节假日校历（与后端、页面口径一致）。
 */
export function buildWeekModel({ items = [], marks = [], totalWeeks = 0 }) {
  const list = []
  const allMarks = markEntries(marks)
  for (let w = 1; w <= Number(totalWeeks) || 0; w++) {
    const slots = items.filter((s) => slotOnWeek(s, w))
    const weekMarks = allMarks.filter((m) => patternToWeeks(m.week_pattern).includes(w))
    if (!slots.length && !weekMarks.length) continue
    list.push({
      week: w,
      slots,
      marks: weekMarks,
      own: slots.filter((s) => !s.masked).length,
      total: slots.length
    })
  }
  return list
}
