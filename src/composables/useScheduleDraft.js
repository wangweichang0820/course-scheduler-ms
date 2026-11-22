import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { mergePatterns, patternToWeeks, patternsOverlap, singleWeekPattern, weeksToPattern } from '@/utils/weeks'
import { scheduleCellKey, teacherNameSet, timeOverlap } from '@/utils/schedule'

let uidSeq = 0

function newUid() {
  return `u${++uidSeq}`
}

/** range 模式周次是否相交：周次不相交不算同一时间（与后端 time_overlap 口径一致）；
 *  任一侧位图为空时保守视为相交 */
function weeksClash(a, b) {
  const s = String(a || '')
  const t = String(b || '')
  if (!s || !t) return true
  return patternsOverlap(s, t)
}

/** 地点标识：优先 venue_id，否则文字地点；空串表示未设置 */
function locationKey(c) {
  if (c.venue_id != null) return `v${c.venue_id}`
  return String(c.room_name || c.class_location || '')
}

/** 两张卡片地点能否合并：双方都设了不同地点时不合并（保留各自记录） */
function locationCompatible(a, b) {
  const ka = locationKey(a)
  const kb = locationKey(b)
  return !ka || !kb || ka === kb
}

/**
 * 周课表草稿状态：把「已保存排课 + 本次点选」统一成网格卡片，保存时输出
 * delete_ids / create 清单。range（全日制按周次区间）与 weeks（集中班逐周）共用。
 */
export function useScheduleDraft(options) {
  const {
    mode = 'range',
    slots,
    weeks = () => [],
    currentTask = () => null,
    /** 批量模式：勾选的多个任务，点击空格一次全部放入（周末班批量排课） */
    batchTasks = () => [],
    highlightTaskId = () => null,
    weekPattern = () => '',
    browseHint = ''
  } = options
  const byWeek = mode === 'weeks'

  const draft = ref({})
  const dirty = ref(false)
  /** 本次被点掉、待保存时真正删除的已保存排课 id */
  const removedIds = ref(new Set())

  /** 当前排课 / 高亮任务：普通课表优先显式高亮，集中班取排课模式任务 */
  const activeTaskId = computed(() => {
    if (!byWeek && highlightTaskId() != null) return Number(highlightTaskId())
    const t = currentTask()
    return t ? Number(t.id) : null
  })

  const isCurrent = (item) =>
    item != null && activeTaskId.value != null && Number(item.task_id) === activeTaskId.value

  /** 已保存排课 -> 草稿：集中班把一条排课展开到它覆盖的每个指定周次 */
  watch(slots, (list) => {
    const next = {}
    for (const s of list || []) {
      const targetWeeks = byWeek
        ? patternToWeeks(s.week_pattern).filter((w) => weeks().includes(w))
        : [null]
      for (const w of targetWeeks) {
        const key = scheduleCellKey(w, s.day_of_week, s.start_period)
        if (!next[key]) next[key] = []
        next[key].push({
          ...s,
          ...(byWeek ? { week: w } : {}),
          _locUid: s.id != null ? `s${s.id}${byWeek ? '-' + w : ''}` : newUid(),
          _state: 'kept'
        })
      }
    }
    // range 模式：同任务同星期同节次块、周次不相交的多条记录合并成一张卡片（位图取并集），
    // 保存时按「删旧 + 建新」归并为一条记录；_mergedIds 记录覆盖的原记录 id
    let mergedAny = false
    if (!byWeek) {
      for (const [key, list] of Object.entries(next)) {
        const merged = []
        for (const item of list) {
          const hit = merged.find((m) => Number(m.task_id) === Number(item.task_id)
            && Number(m.end_period ?? m.start_period) === Number(item.end_period ?? item.start_period)
            && m.week_pattern && item.week_pattern
            && locationCompatible(m, item))
          if (!hit) {
            merged.push(item)
            continue
          }
          mergedAny = true
          hit.week_pattern = mergePatterns([hit.week_pattern, item.week_pattern])
          hit._mergedIds = [...(hit._mergedIds || [hit.id]), item.id]
          if (!locationKey(hit)) {
            for (const k of ['venue_id', 'campus', 'building', 'room_name', 'class_location']) hit[k] = item[k]
          }
          hit.locked = (Number(hit.locked || 0) || Number(item.locked || 0)) ? 1 : 0
          if (!hit.remark && item.remark) hit.remark = item.remark
          if (!hit.online_url && item.online_url) hit.online_url = item.online_url
        }
        next[key] = merged
      }
    }
    draft.value = next
    removedIds.value = new Set()
    dirty.value = mergedAny
  }, { immediate: true, deep: true })

  /** 某格起始节的卡片（连排只在起始节展示） */
  function cellOf(week, period, day) {
    const list = draft.value[scheduleCellKey(week, day, period)]
    return list ? list.filter((item) => Number(item.start_period) === Number(period)) : []
  }

  /** 是否同一条排课的草稿实例：集中班一条记录会展开到多个周格子（已保存按 id，拆分重建的按 _groupId） */
  function sameRecord(a, b) {
    if (!a || !b) return false
    if (a._locUid === b._locUid) return true
    if (a._groupId && a._groupId === b._groupId) return true
    return a._state === 'kept' && b._state === 'kept' && a.id != null && a.id === b.id
  }

  function findPlaceConflict(task, week, day, period, endPeriod = period, exclude = null, pattern = '') {
    if (!task) return { type: '' }
    const mine = { week, day_of_week: day, start_period: period, end_period: endPeriod }
    const myTeachers = teacherNameSet(task)
    for (const list of Object.values(draft.value)) {
      for (const c of list || []) {
        if (exclude && sameRecord(c, exclude)) continue
        if (!timeOverlap(mine, c, byWeek)) continue
        // range 模式同星期同节次但周次不相交时允许并存（同一课程可按周次段拆多条）
        if (!byWeek && !weeksClash(pattern, c.week_pattern)) continue
        if (Number(c.task_id) === Number(task.id)) return { type: 'dup' }
        const hit = [...myTeachers].find((n) => teacherNameSet(c).has(n))
        if (hit) return { type: 'teacher' }
      }
    }
    return { type: '' }
  }

  function placeTask(week, day, periodNo, endPeriodNo, t) {
    const key = scheduleCellKey(week, day, periodNo)
    const next = { ...draft.value }
    const list = [...(next[key] || [])]
    list.push({
      _locUid: newUid(),
      _state: 'new',
      ...(byWeek ? { week } : {}),
      task_id: t.id,
      course_name: t.course_name,
      course_code: t.course_code,
      section_no: t.section_no,
      teacher_names: t.teacher_names,
      // 合班标注：新放置卡片也带上开课班级，网格据此打「合班」标签
      is_merged: (t.open_classes?.length || 0) >= 2,
      open_class_names: t.open_class_names || [],
      week_pattern: byWeek ? singleWeekPattern(week, weeks()) : (weekPattern() || t.week_pattern),
      day_of_week: day,
      start_period: periodNo,
      end_period: endPeriodNo ?? periodNo
    })
    next[key] = list
    draft.value = next
    dirty.value = true
  }

  /** 放置预检：同一课程同时间重复排（硬限制）；教师冲突已在网格中直放，不再拦截 */
  function tryPlace(week, day, periodNo, endPeriodNo = periodNo) {
    // 批量模式：一次放入全部勾选任务，该时间已排过的自动跳过
    const batch = batchTasks()
    if (batch.length) {
      let placed = 0
      let skipped = 0
      for (const t of batch) {
        const pat = byWeek ? singleWeekPattern(week, weeks()) : (weekPattern() || t.week_pattern)
        const src = { task_id: t.id, day_of_week: day, start_period: periodNo, end_period: endPeriodNo ?? periodNo, week_pattern: pat }
        const target = findMergeTarget(src)
        if (target) {
          // 同任务同时间：周次直接并入（相交也合并，课时超耗由保存确认与冲突校验提示）
          if (mergePatterns([target.week_pattern, pat]) === String(target.week_pattern)) {
            skipped++
            continue
          }
          mergeIntoCard(target, src)
          placed++
          continue
        }
        if (findPlaceConflict(t, week, day, periodNo, endPeriodNo, null, pat).type === 'dup') {
          skipped++
          continue
        }
        placeTask(week, day, periodNo, endPeriodNo, t)
        placed++
      }
      if (!placed) ElMessage.info('勾选的课程在该时间均已排课')
      else if (skipped) ElMessage.success(`已放入 ${placed} 门课程，${skipped} 门该时间已排，自动跳过`)
      return
    }
    const t = currentTask()
    if (!t) {
      if (browseHint) ElMessage.info(browseHint)
      return
    }
    const pat = byWeek ? singleWeekPattern(week, weeks()) : (weekPattern() || t.week_pattern)
    // 同任务同时间已有记录：周次并入（相交也合并），不另建记录也不拦截
    const src = { task_id: t.id, day_of_week: day, start_period: periodNo, end_period: endPeriodNo ?? periodNo, week_pattern: pat }
    const target = findMergeTarget(src)
    if (target) {
      if (mergePatterns([target.week_pattern, pat]) === String(target.week_pattern)) {
        ElMessage.info(`「${t.course_name || ''}」该时间已排课，所选周次已包含`)
        return
      }
      mergeIntoCard(target, src)
      return
    }
    if (findPlaceConflict(t, week, day, periodNo, endPeriodNo, null, pat).type === 'dup') {
      const scope = byWeek ? `第 ${week} 周` : ''
      ElMessage.warning(`「${t.course_name || ''}」${scope}该时间已有排课，同一课程不能重复排`)
      return
    }
    placeTask(week, day, periodNo, endPeriodNo, t)
  }

  function toggleCell(week, day, period, endPeriod = period) {
    tryPlace(week, day, period, endPeriod)
  }

  /** 从草稿中移除一张卡片：本次新增的直接丢弃；已保存的记入待删除清单。
   *  多周展开的同组实例（_groupId）一并移除，避免残留重复。 */
  function removeCard(card) {
    if (card._state !== 'kept') {
      // 合并行里卡片实际起始节可能不是行首，按 uid / 组 id 全表定位后再删除
      const next = {}
      for (const [key, list] of Object.entries(draft.value)) {
        const kept = (list || []).filter((c) => c._locUid !== card._locUid
          && !(card._groupId && c._groupId === card._groupId))
        if (kept.length) next[key] = kept
      }
      draft.value = next
      dirty.value = true
      return
    }
    for (const id of card._mergedIds || [card.id]) removedIds.value.add(id)
    const next = {}
    for (const [key, list] of Object.entries(draft.value)) {
      const kept = (list || []).filter((c) => !(c._state === 'kept' && c.id === card.id))
      if (kept.length) next[key] = kept
    }
    draft.value = next
    dirty.value = true
  }

  /**
   * 点击卡片：
   * - 批量模式：勾选任务的卡片直接删除，其余卡片视为空格子（放入全部勾选任务）；
   * - 单任务模式：非当前任务视为点击该行放入当前任务（合并行按整块起止节次排课）；
   * - 本次新增：直接丢弃；已保存：整条记录待删除，集中班多周渲染的卡片一并移出。
   */
  function toggleCard(week, day, period, endPeriod, card) {
    if (!card) return
    const batch = batchTasks()
    if (batch.length) {
      const inBatch = batch.some((t) => Number(t.id) === Number(card.task_id))
      if (!inBatch) {
        tryPlace(week, day, period, endPeriod ?? period)
        return
      }
      removeCard(card)
      return
    }
    if (activeTaskId.value == null) {
      ElMessage.info(browseHint || '当前为浏览模式：请先点击上方教学任务进入排课模式')
      return
    }
    if (Number(card.task_id) !== activeTaskId.value) {
      tryPlace(week, day, period, endPeriod ?? period)
      return
    }
    removeCard(card)
  }

  /** 教室占用冲突：同一时间（集中班还需同一周）的其他卡片是否已占用同一教室 */
  function findVenueClash(card) {
    if (!card?.venue_id) return null
    for (const list of Object.values(draft.value)) {
      for (const c of list || []) {
        if (sameRecord(c, card)) continue
        if (Number(c.venue_id) !== Number(card.venue_id)) continue
        if (!timeOverlap(card, c, byWeek)) continue
        if (!byWeek && !weeksClash(card.week_pattern, c.week_pattern)) continue
        return c
      }
    }
    return null
  }

  /** 移动 / 编辑已保存卡片时需要原样带走的字段（删旧建新不丢地点 / 锁定 / 备注） */
  const COPY_KEYS = [
    'task_id', 'course_name', 'course_code', 'section_no', 'teacher_names',
    'is_merged', 'open_class_names', 'venue_id', 'campus', 'building',
    'room_name', 'class_location', 'locked', 'remark', 'online_url'
  ]
  function copyFields(c) {
    const out = {}
    for (const k of COPY_KEYS) if (c[k] !== undefined) out[k] = c[k]
    return out
  }

  /** 往草稿指定格子放一张新卡片（移动 / 编辑已保存记录时重建用）；
   *  同一条记录展开到多个周格子时传同一 groupId，保证后续编辑 / 删除整组联动 */
  function insertNewCard(fields, week, day, start, end, pattern, groupId = null) {
    const key = scheduleCellKey(week, day, start)
    const next = { ...draft.value }
    const list = [...(next[key] || [])]
    const card = {
      ...fields,
      _locUid: newUid(),
      _state: 'new',
      ...(groupId ? { _groupId: groupId } : {}),
      ...(byWeek ? { week } : {}),
      day_of_week: day,
      start_period: start,
      end_period: end,
      week_pattern: pattern
    }
    list.push(card)
    next[key] = list
    draft.value = next
    dirty.value = true
    return card
  }

  /** range 模式同任务同星期同节次块应只有一条记录：找可并入的已有卡片
   *  （周次相交也合并取并集；地点不同不合并，重复排由冲突检查拦截） */
  function findMergeTarget(src, exclude = null) {
    if (byWeek || !src.week_pattern) return null
    for (const list of Object.values(draft.value)) {
      for (const c of list || []) {
        if (exclude && sameRecord(c, exclude)) continue
        if (Number(c.task_id) !== Number(src.task_id)) continue
        if (Number(c.day_of_week) !== Number(src.day_of_week)) continue
        if (Number(c.start_period) !== Number(src.start_period)) continue
        if (Number(c.end_period ?? c.start_period) !== Number(src.end_period ?? src.start_period)) continue
        if (!c.week_pattern) continue
        if (!locationCompatible(c, src)) continue
        return c
      }
    }
    return null
  }

  /** 把 src 的周次 / 字段并入目标卡片：已保存的删旧建新，本次新增的就地改位图 */
  function mergeIntoCard(target, src) {
    const pattern = mergePatterns([target.week_pattern, src.week_pattern])
    const fields = { ...copyFields(target) }
    if (!locationKey(target)) {
      for (const k of ['venue_id', 'campus', 'building', 'room_name', 'class_location']) {
        if (src[k] !== undefined) fields[k] = src[k]
      }
    }
    fields.locked = (Number(target.locked || 0) || Number(src.locked || 0)) ? 1 : 0
    if (!fields.remark && src.remark) fields.remark = src.remark
    if (!fields.online_url && src.online_url) fields.online_url = src.online_url
    if (target._state === 'kept') {
      const day = Number(target.day_of_week)
      const start = Number(target.start_period)
      const end = Number(target.end_period ?? target.start_period)
      removeCard(target)
      insertNewCard(fields, null, day, start, end, pattern)
    } else {
      const next = {}
      for (const [k, l] of Object.entries(draft.value)) {
        next[k] = (l || []).map((c) => (c._locUid === target._locUid ? { ...c, ...fields, week_pattern: pattern } : c))
      }
      draft.value = next
      dirty.value = true
    }
    return pattern
  }

  /**
   * 拖动卡片到目标格子：保持连排长度与周次位图不变，只改星期 / 节次（集中班可跨周）。
   * 已保存记录拆成「删旧 + 建新」；集中班一条记录覆盖多周时，
   * 源周移走后剩余周次按原时间保留。
   */
  function moveCard(card, targetWeek, day, startPeriod, endPeriod) {
    if (!card) return false
    const dayNo = Number(day)
    const start = Number(startPeriod)
    const end = Number(endPeriod ?? startPeriod)
    const srcWeek = byWeek ? Number(card.week) : null
    if (Number(card.day_of_week) === dayNo && Number(card.start_period) === start
      && Number(card.end_period ?? card.start_period) === end
      && (!byWeek || srcWeek === Number(targetWeek))) return true
    const fields = copyFields(card)
    const oldPattern = String(card.week_pattern || '')
    const oldDay = Number(card.day_of_week)
    const oldStart = Number(card.start_period)
    const oldEnd = Number(card.end_period ?? card.start_period)
    const mergeSrc = { ...fields, day_of_week: dayNo, start_period: start, end_period: end, week_pattern: oldPattern }
    const mergeTarget = byWeek ? null : findMergeTarget(mergeSrc, card)
    // 可归并时周次相交也合并；不可归并（节次块/地点不同）才按重复排拦截
    if (!mergeTarget) {
      const dup = findPlaceConflict(
        { id: card.task_id }, byWeek ? Number(targetWeek) : null, dayNo, start, end, card,
        oldPattern
      )
      if (dup.type === 'dup') {
        const scope = byWeek ? `第 ${targetWeek} 周` : ''
        ElMessage.warning(`「${card.course_name || ''}」${scope}该时间已有排课，同一课程不能重复排`)
        return false
      }
    }
    removeCard(card)
    if (byWeek) {
      const target = Number(targetWeek)
      // 多周记录（含拆分后的剩余周卡片）：源周移走后，剩余周次按原时间保留
      const remaining = patternToWeeks(oldPattern).filter((w) => w !== srcWeek)
      if (remaining.length) {
        const remPattern = weeksToPattern(remaining, oldPattern.length)
        const gid = newUid()
        for (const w of remaining.filter((x) => weeks().includes(x))) {
          insertNewCard(fields, w, oldDay, oldStart, oldEnd, remPattern, gid)
        }
      }
      insertNewCard(fields, target, dayNo, start, end, singleWeekPattern(target, weeks()))
    } else if (mergeTarget) {
      // 目标格已有同任务同时间记录且周次不相交：并入周次，不另建记录
      mergeIntoCard(mergeTarget, mergeSrc)
    } else {
      insertNewCard(fields, null, dayNo, start, end, oldPattern)
    }
    return true
  }

  /** 调整后的时间是否与该任务其他排课重叠（排除被编辑卡片自身；
   *  集中班按新位图逐周判，range 模式按周次位图相交判） */
  function findUpdateConflict(card, day, start, end, pattern) {
    const targetWeeks = byWeek ? patternToWeeks(pattern).filter((w) => weeks().includes(w)) : []
    for (const list of Object.values(draft.value)) {
      for (const c of list || []) {
        if (sameRecord(c, card)) continue
        if (Number(c.task_id) !== Number(card.task_id)) continue
        if (Number(c.day_of_week) !== Number(day)) continue
        const cs = Number(c.start_period)
        const ce = Number(c.end_period ?? c.start_period)
        if (!(start <= ce && cs <= end)) continue
        if (!byWeek) {
          // 同星期同节次块且地点兼容：走归并（周次取并集），相交也不拦；
          // 课时超耗由保存时二次确认与冲突校验 hours_over 提示
          const mergeable = !!c.week_pattern
            && Number(c.start_period) === start
            && Number(c.end_period ?? c.start_period) === end
            && locationCompatible(c, card)
          if (mergeable) continue
          if (!weeksClash(pattern, c.week_pattern)) continue
          return c
        }
        if (targetWeeks.includes(Number(c.week))) return c
      }
    }
    return null
  }

  /**
   * 快捷编辑框确认：改星期 / 节次 / 周次 / 锁定。
   * 已保存记录同样拆成删旧建新；集中班按新位图重新展开到各周格子。
   */
  function updateCard(card, changes) {
    if (!card) return false
    const day = Number(changes.day_of_week ?? card.day_of_week)
    const start = Number(changes.start_period ?? card.start_period)
    const end = Number(changes.end_period ?? card.end_period ?? start)
    const pattern = changes.week_pattern != null ? String(changes.week_pattern) : String(card.week_pattern || '')
    const locked = changes.locked != null ? (changes.locked ? 1 : 0) : Number(card.locked || 0)
    const unchanged = day === Number(card.day_of_week) && start === Number(card.start_period)
      && end === Number(card.end_period ?? card.start_period)
      && pattern === String(card.week_pattern || '') && locked === Number(card.locked || 0)
    if (unchanged) return true
    const newWeeks = patternToWeeks(pattern)
    if (!newWeeks.length) {
      ElMessage.warning('请至少选择一个上课周次')
      return false
    }
    const targets = byWeek ? newWeeks.filter((w) => weeks().includes(w)) : [null]
    if (!targets.length) {
      ElMessage.warning('所选周次不在该排课单的排课周次内')
      return false
    }
    if (findUpdateConflict(card, day, start, end, pattern)) {
      ElMessage.warning(`「${card.course_name || ''}」调整后的时间已有排课，同一课程不能重复排`)
      return false
    }
    const fields = { ...copyFields(card), locked }
    const mergeSrc = { ...fields, day_of_week: day, start_period: start, end_period: end, week_pattern: pattern }
    const mergeTarget = byWeek ? null : findMergeTarget(mergeSrc, card)
    removeCard(card)
    if (mergeTarget) {
      mergeIntoCard(mergeTarget, mergeSrc)
      return true
    }
    const gid = newUid()
    for (const w of targets) insertNewCard(fields, w, day, start, end, pattern, gid)
    return true
  }

  /** 草稿选完教室：写回卡片（多周展开的同组实例一并同步）；同时间教室已被占用则撤销本次选择 */
  function applyLocation(updated) {
    if (!updated || updated.id) return
    const week = byWeek ? updated.week : null
    const key = scheduleCellKey(week, updated.day_of_week, updated.start_period)
    const list = draft.value[key] || []
    const target = list.find((c) => c._locUid === updated._locUid)
    if (!target) return
    const loc = {
      venue_id: updated.venue_id ?? null,
      campus: updated.campus || '',
      building: updated.building || '',
      room_name: updated.room_name || '',
      class_location: updated.class_location || ''
    }
    // 合并卡（覆盖多条原记录）：地点变更走删旧建新，保存排课时一并写库
    if (target._state === 'kept' && (target._mergedIds || []).length) {
      const clash = findVenueClash({ ...target, ...loc })
      if (clash) {
        ElMessage.warning(
          `教室「${loc.class_location || loc.room_name || ''}」在该时间已被「${clash.course_name || ''}」占用，请更换教室`
        )
        return
      }
      removeCard(target)
      insertNewCard({ ...copyFields(target), ...loc }, null, Number(target.day_of_week),
        Number(target.start_period), Number(target.end_period ?? target.start_period), target.week_pattern)
      return
    }
    const writeLoc = (loc) => {
      const next = {}
      for (const [k, l] of Object.entries(draft.value)) {
        next[k] = (l || []).map((c) => (sameRecord(c, target) ? { ...c, ...loc } : c))
      }
      draft.value = next
    }
    writeLoc(loc)
    const clash = findVenueClash({ ...target, ...loc })
    if (!clash) return
    writeLoc({ venue_id: null, campus: '', building: '', room_name: '', class_location: '' })
    ElMessage.warning(
      `教室「${updated.class_location || updated.room_name || ''}」在该时间已被「${clash.course_name || ''}」占用，请更换教室`
    )
  }

  /** 生成提交给后端的删除 / 新增清单（网格直放模式：force 跳过教师/课时拦截） */
  function buildPayload() {
    const create = []
    const del = new Set(removedIds.value)
    const payloadOf = (item) => ({
      task_id: item.task_id,
      day_of_week: item.day_of_week,
      start_period: item.start_period,
      end_period: item.end_period,
      week_pattern: item.week_pattern || '',
      venue_id: item.venue_id ?? null,
      campus: item.campus || '',
      building: item.building || '',
      room_name: item.room_name || '',
      class_location: item.class_location || '',
      locked: item.locked ? 1 : 0,
      remark: item.remark || '',
      online_url: item.online_url || ''
    })
    // 多周展开的同组新卡片只提交一条（各周格子只是同一条记录的渲染实例）
    const seenGroups = new Set()
    for (const list of Object.values(draft.value)) {
      for (const item of list || []) {
        // 合并卡：即使本次无其他改动，保存时也删旧建新归并为一条记录
        if (item._state === 'kept' && (item._mergedIds || []).length) {
          for (const id of item._mergedIds) del.add(id)
          create.push(payloadOf(item))
          continue
        }
        if (item._state !== 'new') continue
        if (item._groupId) {
          if (seenGroups.has(item._groupId)) continue
          seenGroups.add(item._groupId)
        }
        create.push(payloadOf(item))
      }
    }
    return { delete_ids: [...del], create, force: true }
  }

  return {
    draft,
    dirty,
    activeTaskId,
    cellOf,
    isCurrent,
    toggleCell,
    toggleCard,
    removeCard,
    moveCard,
    updateCard,
    applyLocation,
    buildPayload
  }
}
