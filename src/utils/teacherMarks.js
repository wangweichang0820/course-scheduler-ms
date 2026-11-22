/**
 * 教师周次标注：管理员给指定老师的指定时段叠一个色块（如「本科课程」）。
 *
 * 标注存在独立表里，不是排课记录 —— 这里只负责把它翻译成课表组件认识的
 * 「伪条目」（day_of_week / start_period / week_pattern 同名字段），
 * 于是简版课表、逐周网格、导出都能按同一套渲染逻辑处理。
 */
import { patternToWeeks, weeksToText } from '@/utils/weeks'

export const DEFAULT_MARK_COLOR = '#64748b'

/** 一条标注在第 week 周是否出现（只看周次位图，与课表逐周口径一致） */
export function markOnWeek(mark, week) {
  return patternToWeeks(mark.week_pattern).includes(Number(week))
}

/**
 * 标注 -> 课表条目。
 * `totalWeeks` 用来把位图长度补齐，导出/展示都靠 weeks_text 说明占用的周次。
 */
export function markEntry(mark) {
  const weeks = patternToWeeks(mark.week_pattern)
  const start = Number(mark.start_period) || 1
  // 外部课表导入的标注：课程明细存 extra JSON，标签固定「其他」，
  // 课程名位置显示真实课程名（手工标注仍显示标签文本）
  const extra = mark.extra || {}
  const imported = extra.source === 'import'
  return {
    id: `mark-${mark.id}`,
    mark: true,
    mark_id: mark.id,
    teacher_id: mark.teacher_id,
    teacher_name: mark.teacher_name || '',
    label: mark.label || '',
    color: mark.color || DEFAULT_MARK_COLOR,
    remark: mark.remark || '',
    day_of_week: Number(mark.day_of_week) || 1,
    start_period: start,
    end_period: Number(mark.end_period) || start,
    week_pattern: mark.week_pattern || '',
    weeks_text: weeksToText(weeks, { prefix: '第', unit: '周' }),
    // 网格/简表里课程名位置：导入课程用真实课程名，手工标注用标签，复用既有渲染分支
    course_name: (imported ? extra.course_name : '') || mark.label || '',
    course_code: extra.course_code || '',
    section_no: extra.section_no || '',
    location: extra.location || '',
    source: extra.source || '',
    // 与系统排课的教师时间冲突清单（后端 list_marks 附载），课表色块标「冲突」
    conflicts: mark.conflicts || []
  }
}

/**
 * 按老师筛出可见标注并转成条目。
 * `teacherIds` 传数组：只保留这些老师的标注（班级卡片按卡片内出现的老师过滤）；
 * 传 null 表示不限老师。`week` 传数字时只保留该周占用的标注。
 */
export function markEntries(marks, teacherIds = null, week = null) {
  const wanted = teacherIds === null || teacherIds === undefined ? null : new Set(
    [...teacherIds].map(Number).filter((n) => Number.isFinite(n))
  )
  return (marks || [])
    .filter((m) => (wanted ? wanted.has(Number(m.teacher_id)) : true))
    .filter((m) => (week == null ? true : markOnWeek(m, week)))
    .map(markEntry)
}

/** 从课表条目里收集出现的老师 id（含多教师课程） */
export function teacherIdsOfItems(items) {
  const out = new Set()
  for (const it of items || []) {
    // 遮盖记录不含教师信息（后端已清空），这里天然不会漏出他人标注
    for (const tid of it.teacher_ids || []) {
      if (Number.isFinite(Number(tid))) out.add(Number(tid))
    }
    if (Number.isFinite(Number(it.teacher_id))) out.add(Number(it.teacher_id))
  }
  return [...out]
}
