/**
 * 周次位图工具：第 i 位为 '1' 表示第 i 周有课（与后端 week_pattern 一致）。
 */

/** 位图串 -> 周次数组（1-based） */
export function patternToWeeks(pattern) {
  const s = String(pattern || '')
  const out = []
  for (let i = 0; i < s.length; i++) if (s[i] === '1') out.push(i + 1)
  return out
}

/** 周次数组 -> 位图串；长度取 total 与最大周次的较大值 */
export function weeksToPattern(weeks, total = 0) {
  const set = new Set((weeks || []).map(Number).filter((w) => w >= 1))
  const len = Math.max(Number(total) || 0, ...set, 1)
  return Array.from({ length: len }, (_, i) => (set.has(i + 1) ? '1' : '0')).join('')
}

/**
 * 周次数组 -> 「第1-8周、第10周」样式文本。
 * prefix/unit 可定制（如 prefix: '' 得到「1-8周」）。
 */
export function weeksToText(weeks, { prefix = '', unit = '周', empty = '' } = {}) {
  const list = [...new Set((weeks || []).map(Number).filter((w) => w >= 1))].sort((a, b) => a - b)
  if (!list.length) return empty
  const parts = []
  let start = list[0]
  let prev = list[0]
  for (const w of list.slice(1)) {
    if (w === prev + 1) {
      prev = w
      continue
    }
    parts.push(start === prev ? `${prefix}${start}${unit}` : `${prefix}${start}-${prev}${unit}`)
    start = prev = w
  }
  parts.push(start === prev ? `${prefix}${start}${unit}` : `${prefix}${start}-${prev}${unit}`)
  return parts.join('、')
}

/** 位图串 -> 可读文本 */
export function patternToText(pattern, options) {
  return weeksToText(patternToWeeks(pattern), options)
}

/**
 * 按周次范围排序：先看开始周，开始周相同再比结束周；未选周次的排最后。
 * 用于排课周次组列表，保证显示顺序与周次先后一致。
 */
export function sortByWeekRange(items, patternKey = 'week_pattern') {
  const range = (item) => {
    const weeks = patternToWeeks(item[patternKey])
    return weeks.length
      ? { start: weeks[0], end: weeks[weeks.length - 1] }
      : { start: Infinity, end: Infinity }
  }
  return [...(items || [])].sort((a, b) => {
    const ra = range(a)
    const rb = range(b)
    return ra.start - rb.start || ra.end - rb.end
  })
}

/** 两个周次位图是否有交集 */
export function patternsOverlap(a, b) {
  const s = String(a || '')
  const t = String(b || '')
  const len = Math.min(s.length, t.length)
  for (let i = 0; i < len; i++) {
    if (s[i] === '1' && t[i] === '1') return true
  }
  return false
}

/** 多个周次位图按位取并集（多选周次组时合并套用） */
export function mergePatterns(patterns) {
  const list = (patterns || []).map((p) => String(p || ''))
  const len = Math.max(...list.map((s) => s.length), 0)
  return Array.from({ length: len }, (_, i) => (list.some((s) => s[i] === '1') ? '1' : '0')).join('')
}

/** 只含某一周的位图；长度与给定周次列表保持一致，保证后端能解析 */
export function singleWeekPattern(week, weeks = []) {
  const target = Number(week)
  const len = Math.max(target || 0, ...(weeks || []).map(Number), 1)
  return Array.from({ length: len }, (_, i) => (i + 1 === target ? '1' : '0')).join('')
}
