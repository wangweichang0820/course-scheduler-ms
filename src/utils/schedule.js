/** 排课网格的公共小工具（周课表编辑 / 课表展示共用）。 */

/** 草稿格子键：集中班按周区分，普通周课表不区分周 */
export function scheduleCellKey(week, day, period) {
  return week == null ? `${day}-${period}` : `w${week}|${day}|${period}`
}

/** 课程编码 + 课序号，如 A203005B-09 */
export function courseCode(item) {
  if (!item) return ''
  return `${item.course_code || ''}${item.section_no ? '-' + item.section_no : ''}`.trim()
}

/** 节次对应课时数：1-6节为2课时，第7节起为1课时 */
export function periodHours(period) {
  return Number(period) <= 6 ? 2 : 1
}

export const WEEKEND_FORM = '非全日制周末班'
export const CONCENTRATED_FORM = '非全日制集中班'
export const PART_TIME_FORMS = [WEEKEND_FORM, CONCENTRATED_FORM]

/**
 * 按班型过滤课表可见星期列（纯展示，存储的 day_of_week 仍是真实星期）。
 * - 全日制：周一~周五
 * - 非全日制周末班：周六、周日
 * - 非全日制集中班：周四~周日
 * 班型缺失或未来新增班型时保持全部星期列。
 */
export function filterVisibleDays(days, form) {
  const list = days || []
  if (form === '全日制') {
    return list.filter((d) => d !== '周六' && d !== '周日')
  }
  if (form === WEEKEND_FORM) {
    return list.filter((d) => d === '周六' || d === '周日')
  }
  if (form === CONCENTRATED_FORM) {
    return list.filter((d) => !['周一', '周二', '周三'].includes(d))
  }
  return list
}

/**
 * 非全日制（周末班/集中班）课程连排块。
 * 晚上第6节（19:00-20:50，2 课时）与第7节（21:00-21:50，1 课时）分开排课，
 * 不再合成 6-7 节的 3 课时块。
 */
const PART_TIME_BLOCKS = [
  [1, 2],
  [3, 3],
  [4, 5],
  [6, 6],
  [7, 7]
]

export function isPartTimeForm(form) {
  return PART_TIME_FORMS.includes(String(form || ''))
}

/**
 * 隐藏节次：本专业排课不使用第3节（12:10-14:00），课表与排课网格都不再显示这一行。
 * 只影响展示层——作息配置、存储的 start_period、课时口径都保持原样；
 * 以后要排第3节，把这里的 3 去掉即可恢复。
 */
export const HIDDEN_PERIODS = [3]

export function isHiddenPeriod(period) {
  return HIDDEN_PERIODS.includes(Number(period))
}

/** 去掉隐藏节次后的原始作息列表（供直接渲染节次行的页面 / 导出使用） */
export function visibleTimeslots(list) {
  return (list || []).filter((p) => !isHiddenPeriod(p.period))
}

/**
 * 原始作息节次 -> 网格显示行（隐藏节次不出行）。
 * 非全日制把连排块合成一行（1-2 / 4-5 各 4 课时，晚上第6、7节各一行；第3节已隐藏），
 * 返回行序号 period，以及该行对应的实际节次范围 periodStart / periodEnd。
 */
export function buildDisplayTimeslots(timeslots, form) {
  const list = visibleTimeslots(timeslots)
  if (!isPartTimeForm(form)) {
    return list.map((p) => ({
      ...p,
      periodStart: Number(p.period),
      periodEnd: Number(p.period)
    }))
  }
  const byPeriod = new Map(list.map((p) => [Number(p.period), p]))
  const rows = []
  for (const [start, end] of PART_TIME_BLOCKS) {
    const periods = []
    for (let n = start; n <= end; n++) {
      if (byPeriod.has(n)) periods.push(byPeriod.get(n))
    }
    if (!periods.length) continue
    const first = periods[0]
    const last = periods[periods.length - 1]
    rows.push({
      period: rows.length + 1,
      periodStart: Number(first.period),
      periodEnd: Number(last.period),
      label: first.period === last.period ? first.label : `第${first.period}-${last.period}节`,
      start: first.start,
      end: last.end,
      hours: periods.reduce((sum, p) => sum + periodHours(p.period), 0)
    })
  }
  return rows
}

/** 是否已有上课地点（新老字段兼容） */
export function hasLocation(item) {
  if (!item) return false
  return !!(item.class_location || item.room_name || item.venue_name)
}

export function locationText(item) {
  return item?.class_location || item?.room_name || item?.venue_name || ''
}

/** 上课地点只取房间号（如 Z109 / DQ304）：优先 room_name；
 *  老数据只有 class_location（「校区 楼 房号」）时取末段；线上/实践等无房号结构时回退原文。 */
export function locationRoom(item) {
  if (!item) return ''
  if (item.room_name) return item.room_name
  const full = String(item.class_location || item.venue_name || '').trim()
  if (!full) return ''
  const parts = full.split(/\s+/)
  return parts[parts.length - 1] || full
}

/** 教师名集合：teacher_names 形如「张三、李四」 */
export function teacherNameSet(item) {
  const raw = item?.teacher_names || item?.teacher_name || ''
  return new Set(String(raw).split(/[、,，]/).map((s) => s.trim()).filter(Boolean))
}

/** 两条安排时间是否重叠：同一天且节次区间相交；byWeek 时还要求同一周 */
export function timeOverlap(a, b, byWeek = false) {
  if (!a || !b) return false
  if (byWeek && Number(a.week) !== Number(b.week)) return false
  if (Number(a.day_of_week) !== Number(b.day_of_week)) return false
  const as = Number(a.start_period)
  const ae = Number(a.end_period ?? a.start_period)
  const bs = Number(b.start_period)
  const be = Number(b.end_period ?? b.start_period)
  return as <= be && bs <= ae
}
