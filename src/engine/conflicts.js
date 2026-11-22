/**
 * 保存时硬冲突检测：从原后端 `services/scheduling/conflicts.py` 1:1 移植。
 *
 * 三段重叠判定：星期相同 + 节次区间相交 + 周次位图交集非空。
 * 三种硬冲突：教师时间冲突 / 教室占用冲突 / 同一教学任务在同一排课单内重复排课。
 *
 * 注：同一班级同一时间多门课属业务允许（学生按兴趣选课），不再判冲突。
 */
import { patternsOverlap } from '@/utils/weeks'

function parseWeeks(pattern) {
  const s = String(pattern || '')
  const set = new Set()
  for (let i = 0; i < s.length; i++) if (s[i] === '1') set.add(i + 1)
  return set
}

/** 两条排课是否在时间上重叠（三段判定） */
export function timeOverlap(a, b) {
  if (Number(a.day_of_week) !== Number(b.day_of_week)) return false
  const as = Number(a.start_period)
  const ae = Number(a.end_period ?? a.start_period)
  const bs = Number(b.start_period)
  const be = Number(b.end_period ?? b.start_period)
  if (as > be || bs > ae) return false
  return patternsOverlap(a.week_pattern || '', b.week_pattern || '')
}

function taskTeacherSet(task) {
  const ids = new Set()
  if (task?.teacher_id) ids.add(Number(task.teacher_id))
  if (task?.teacher2_id) ids.add(Number(task.teacher2_id))
  for (const tid of task?.teacher_ids || []) ids.add(Number(tid))
  return ids
}

/**
 * 检测候选 slot 与既有 slots 集合的硬冲突。
 * @param candidate 待保存的排课记录（含 task_id / venue_id / class_id 等）
 * @param existing  同一学期内的既有 slots
 * @param ctx       { tasks: Map<id, task>, teachers: Map<id, name>, venues: Map<id, venue> }
 * @param excludeId 更新时排除自身
 */
export function detectConflicts(candidate, existing, ctx, excludeId = null) {
  const out = []
  const ownTask = ctx.tasks.get(Number(candidate.task_id))
  const ownTeachers = taskTeacherSet(ownTask)
  for (const o of existing) {
    if (excludeId && o.id === excludeId) continue
    if (!timeOverlap(candidate, o)) continue
    const otherTask = ctx.tasks.get(Number(o.task_id))

    // 1) 教师时间冲突
    const otherTeachers = taskTeacherSet(otherTask)
    let hitTid = null
    for (const tid of ownTeachers) if (otherTeachers.has(tid)) { hitTid = tid; break }
    if (hitTid != null) {
      out.push({
        type: 'teacher',
        label: '教师时间冲突',
        severity: 'error',
        message: `${ctx.teachers.get(hitTid)?.name || '该教师'} 在同一时间已有课程`,
        with_slot_id: o.id,
        with_task_name: otherTask?.task_name || ''
      })
    }

    // 2) 教室占用冲突（仅当两端都绑定了同一 venue_id）
    if (candidate.venue_id && Number(candidate.venue_id) === Number(o.venue_id)) {
      out.push({
        type: 'venue',
        label: '教室占用冲突',
        severity: 'error',
        message: `教室「${ctx.venues.get(Number(o.venue_id))?.room_no || ''}」同一时间已被占用`,
        with_slot_id: o.id,
        with_task_name: otherTask?.task_name || ''
      })
    }

    // 3) 同一教学任务在同一排课单内重复
    if (
      candidate.sheet_id &&
      Number(candidate.sheet_id) === Number(o.sheet_id) &&
      Number(candidate.task_id) === Number(o.task_id)
    ) {
      out.push({
        type: 'duplicate_task',
        label: '教学任务重复排课',
        severity: 'error',
        message: '同一教学任务在同一排课单内重复排课',
        with_slot_id: o.id
      })
    }
  }
  return out
}

/** 只挑出硬冲突（保存拦截用） */
export const hasBlocking = (list) => list.some((c) => c.severity === 'error')
