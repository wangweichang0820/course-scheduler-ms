/**
 * 学期全量体检：从原后端 audit.py（778 行 / 20 条规则）精简到 12 条核心规则，
 * 覆盖 8 项错误 + 4 项提醒，纯前端在 IndexedDB 数据上跑。
 *
 * 输入：slots / tasks / classes / teachers / venues / sheets / semester(总周数)
 * 输出：{ summary, items, byType }
 */
import { patternsOverlap, patternToWeeks } from '@/utils/weeks'

const WEEKEND_FORM = '非全日制周末班'
const CONCENTRATED_FORM = '非全日制集中班'

export const TYPE_META = {
  teacher: ['教师时间冲突', 'error'],
  venue: ['教室占用冲突', 'error'],
  duplicate_task: ['教学任务重复排课', 'error'],
  merged_mismatch: ['合班课程时间/地点不一致', 'error'],
  weeks_out_of_range: ['周次超出学期', 'error'],
  weeks_missing: ['周次缺失', 'error'],
  period_invalid: ['节次或星期非法', 'error'],
  hours_over: ['超出总课时', 'error'],
  weekend_rule: ['周末班排在工作日', 'warning'],
  hours_under: ['课时未排满', 'warning'],
  task_no_teacher: ['教学任务无任课老师', 'warning'],
  sheet_no_semester: ['排课单未绑定学期', 'warning']
}

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function periodText(s, e) {
  if (s == null) return ''
  return s === e ? `第${s}节` : `第${s}-${e}节`
}

function dayText(d) {
  return DAYS[Number(d) - 1] || `星期${d}`
}

function weeksText(pattern) {
  const ws = patternToWeeks(pattern)
  if (!ws.length) return '无周次'
  const segs = []
  for (const w of ws) {
    if (segs.length && w === segs[segs.length - 1][1] + 1) segs[segs.length - 1][1] = w
    else segs.push([w, w])
  }
  return '第' + segs.map(([a, b]) => a === b ? `${a}` : `${a}-${b}`).join(', ') + '周'
}

function timeOverlap(a, b) {
  if (Number(a.day_of_week) !== Number(b.day_of_week)) return false
  const as = Number(a.start_period), ae = Number(a.end_period ?? a.start_period)
  const bs = Number(b.start_period), be = Number(b.end_period ?? b.start_period)
  if (as > be || bs > ae) return false
  return patternsOverlap(a.week_pattern || '', b.week_pattern || '')
}

function teacherSet(task) {
  const s = new Set()
  if (task?.teacher_id) s.add(Number(task.teacher_id))
  if (task?.teacher2_id) s.add(Number(task.teacher2_id))
  return s
}

function hoursPerSession(sp, ep) {
  // 与原后端一致：1-6 节每节 2 课时，7 节起 1 课时；这里比赛版按 5 行网格简化
  return 2 * (Number(ep) - Number(sp) + 1)
}

function slotHours(slot, timeslotHours = 2) {
  const weeks = patternToWeeks(slot.week_pattern).length
  const span = Number(slot.end_period ?? slot.start_period) - Number(slot.start_period) + 1
  return weeks * span * timeslotHours
}

function buildRef(slot, ctx) {
  const task = ctx.tasks.get(Number(slot.task_id))
  const cls = ctx.classes.get(Number(slot.class_id || task?.class_id))
  const course = ctx.courses.get(Number(task?.course_id))
  const teacherIds = [...teacherSet(task)]
  const teacherNames = teacherIds.map((tid) => ctx.teachers.get(tid)?.name || String(tid)).join('、')
  return {
    slot_id: slot.id,
    sheet_id: slot.sheet_id,
    task_id: slot.task_id,
    course_name: course?.name || taskLabel(task, ctx) || '未命名',
    class_id: cls?.id || null,
    class_name: cls?.name || '',
    class_form: cls?.class_form || task?.class_form || '',
    teacher_ids: teacherIds,
    teacher_names: teacherNames,
    day_of_week: Number(slot.day_of_week),
    day_text: dayText(slot.day_of_week),
    start_period: Number(slot.start_period),
    end_period: Number(slot.end_period ?? slot.start_period),
    period_text: periodText(slot.start_period, slot.end_period ?? slot.start_period),
    week_pattern: slot.week_pattern || '',
    weeks_text: weeksText(slot.week_pattern),
    venue_id: slot.venue_id || null,
    room_no: slot.room_name || ctx.venues.get(Number(slot.venue_id))?.room_no || '',
    online_url: slot.online_url || ''
  }
}

function mkItem(type, refs, message, subject = '') {
  const [label, severity] = TYPE_META[type]
  const key = `${type}:${refs.map((r) => r.slot_id).sort().join('-')}`
  return { key, type, label, severity, message, subject, slots: refs.slice(0, 6), slot_count: refs.length }
}

/** 任务展示名：申报加工数据里 task_name 常为空，回退到关联 course.name。
 *  先取 task.task_name，再取 course.name，最后兜底 "任务#<id>"。 */
function taskLabel(task, ctx) {
  if (!task) return ''
  if (task.task_name) return task.task_name
  const c = ctx?.courses?.get(Number(task.course_id))
  if (c?.name) return c.name
  return `任务#${task.id ?? '?'}`
}

export function auditSemester({ slots = [], tasks = [], classes = [], teachers = [], venues = [], courses = [], sheets = [], totalWeeks = 24 }) {
  const ctx = {
    tasks: new Map(tasks.map((t) => [Number(t.id), t])),
    classes: new Map(classes.map((c) => [Number(c.id), c])),
    teachers: new Map(teachers.map((t) => [Number(t.id), t])),
    venues: new Map(venues.map((v) => [Number(v.id), v])),
    courses: new Map(courses.map((c) => [Number(c.id), c])),
    sheets: new Map(sheets.map((s) => [Number(s.id), s]))
  }
  const refs = slots.map((s) => buildRef(s, ctx))
  const items = []

  // --- 单条检查 ---
  for (const r of refs) {
    // 节次/星期非法
    if (!(r.day_of_week >= 1 && r.day_of_week <= 7) || r.start_period < 1 || r.end_period < r.start_period) {
      items.push(mkItem('period_invalid', [r], `星期${r.day_of_week} ${r.period_text} 不合法`, r.course_name))
    }
    // 周次缺失 / 越界
    const weeks = patternToWeeks(r.week_pattern)
    if (!weeks.length) {
      items.push(mkItem('weeks_missing', [r], '排课没有有效周次，课表不会显示', r.course_name))
    } else if (Math.max(...weeks) > totalWeeks) {
      items.push(mkItem('weeks_out_of_range', [r], `排课到第 ${Math.max(...weeks)} 周，超出学期总周数 ${totalWeeks}`, r.course_name))
    }
    // 周末班排在工作日
    if (r.class_form === WEEKEND_FORM && r.day_of_week >= 1 && r.day_of_week <= 5) {
      items.push(mkItem('weekend_rule', [r], `非全日制周末班排在了${r.day_text}`, r.class_name || r.course_name))
    }
    // 排课单未绑定学期
    const sheet = ctx.sheets.get(Number(r.sheet_id))
    if (sheet && !String(sheet.semester || '').trim()) {
      items.push(mkItem('sheet_no_semester', [r], `排课单「${sheet.name}」未绑定学期`, sheet.name))
    }
  }

  // --- 两两冲突 ---
  const seen = new Set()
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const a = refs[i], b = refs[j]
      if (!timeOverlap(a, b)) continue

      // 教师时间冲突（不同任务）
      if (a.task_id !== b.task_id) {
        const ta = ctx.tasks.get(Number(a.task_id))
        const tb = ctx.tasks.get(Number(b.task_id))
        const shared = [...teacherSet(ta)].filter((x) => teacherSet(tb).has(x))
        if (shared.length) {
          const names = shared.map((tid) => ctx.teachers.get(tid)?.name || '').join('、')
          items.push(mkItem('teacher', [a, b],
            `教师「${names}」在${a.day_text} ${a.period_text} ${a.weeks_text} 同时上「${a.course_name}」和「${b.course_name}」`, names))
        }
      } else if (a.sheet_id && Number(a.sheet_id) === Number(b.sheet_id)) {
        // 同一任务在同一排课单内重复
        const sig = `${a.slot_id}-${b.slot_id}`
        if (!seen.has(sig)) {
          seen.add(sig)
          items.push(mkItem('duplicate_task', [a, b], `同一教学任务在同一排课单内重复排课：${a.day_text} ${a.period_text}`, a.course_name))
        }
      }

      // 教室占用冲突
      if (a.venue_id && Number(a.venue_id) === Number(b.venue_id)) {
        items.push(mkItem('venue', [a, b],
          `教室「${a.room_no}」在${a.day_text} ${a.period_text} 被「${a.course_name}」和「${b.course_name}」同时占用`, a.room_no))
      }
    }
  }

  // --- 合班课程一致性 ---
  const mergedByTask = new Map()
  for (const r of refs) {
    const t = ctx.tasks.get(Number(r.task_id))
    if (!t || !Array.isArray(t.class_ids) || t.class_ids.length < 2) continue
    if (!mergedByTask.has(t.id)) mergedByTask.set(t.id, [])
    mergedByTask.get(t.id).push(r)
  }
  for (const [tid, group] of mergedByTask) {
    if (group.length < 2) continue
    const sig = (r) => `${r.day_of_week}-${r.start_period}-${r.end_period}-${r.week_pattern}|${r.room_no}`
    const set = new Set(group.map(sig))
    if (set.size > 1) {
      const task = ctx.tasks.get(Number(tid))
      const name = taskLabel(task, ctx)
      items.push(mkItem('merged_mismatch', group,
        `合班课程「${name}」在多个班级的时间/地点不一致`, name))
    }
  }

  // --- 教学任务无任课老师 ---
  for (const t of tasks) {
    if (!t.teacher_id && !t.teacher2_id && !(t.teacher_ids || []).length) {
      const group = refs.filter((r) => Number(r.task_id) === Number(t.id))
      if (!group.length) continue
      const name = taskLabel(t, ctx)
      items.push(mkItem('task_no_teacher', group,
        `教学任务「${name}」没有任课老师`, name))
    }
  }

  // --- 课时超/欠：按任务汇总 ---
  const byTask = new Map()
  const seenSessions = new Set()
  for (const slot of slots) {
    const key = `${slot.task_id}|${slot.day_of_week}|${slot.start_period}|${slot.end_period}|${slot.week_pattern}`
    if (seenSessions.has(key)) continue
    seenSessions.add(key)
    byTask.set(slot.task_id, (byTask.get(slot.task_id) || 0) + slotHours(slot))
  }
  for (const t of tasks) {
    const plan = Number(t.total_hours || 0)
    if (!plan) continue
    const done = byTask.get(t.id) || 0
    const group = refs.filter((r) => Number(r.task_id) === Number(t.id))
    if (!group.length) continue
    if (done > plan) {
      items.push(mkItem('hours_over', group,
        `已排 ${done} 课时，超出总课时 ${plan}`, taskLabel(t, ctx)))
    } else if (done < plan) {
      items.push(mkItem('hours_under', group,
        `已排 ${done}/${plan} 课时，还差 ${plan - done}`, taskLabel(t, ctx)))
    }
  }

  // --- 汇总 ---
  const byType = {}
  for (const it of items) byType[it.type] = (byType[it.type] || 0) + 1
  const errorCount = items.filter((i) => i.severity === 'error').length
  const warnCount = items.filter((i) => i.severity === 'warning').length

  // 排序：error 优先，其次按 TYPE_META 顺序
  const order = Object.keys(TYPE_META).reduce((m, k, i) => (m[k] = i, m), {})
  items.sort((a, b) =>
    (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) ||
    (order[a.type] - order[b.type]) ||
    (a.slots[0]?.day_of_week || 0) - (b.slots[0]?.day_of_week || 0)
  )

  return {
    summary: {
      error: errorCount,
      warning: warnCount,
      slot_count: slots.length,
      task_count: tasks.length,
      hit_slot_count: new Set(items.flatMap((i) => i.slots.map((s) => s.slot_id))).size
    },
    byType,
    items,
    typeOptions: Object.entries(TYPE_META).map(([k, v]) => ({ value: k, label: v[0], severity: v[1] }))
  }
}
