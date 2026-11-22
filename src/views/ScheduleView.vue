<template>
  <div class="sched">
    <div class="topbar">
      <el-select v-model="sheetId" placeholder="选择排课单" style="width: 260px" @change="onSheetChange">
        <el-option v-for="s in sheets" :key="s.id" :label="s.name" :value="s.id">
          <div class="sheet-opt">
            <span>{{ s.name }}</span>
            <el-tag size="small" :type="tagType(s.class_form)">{{ shortForm(s.class_form) }}</el-tag>
          </div>
        </el-option>
      </el-select>
      <el-button @click="newSheet">新建排课单</el-button>
      <div class="divider"></div>
      <el-button type="warning" @click="autoSchedule" :disabled="!currentSheet || !pendingTasks.length">
        ⚡ 一键自动排课（待排 {{ pendingTasks.length }}）
      </el-button>
      <el-button @click="clearDraft" :disabled="!dirty">放弃改动</el-button>
      <el-button type="primary" @click="commitDraft" :disabled="!dirty">
        💾 保存（{{ draftAddCount }} 新 / {{ draftModCount }} 改 / {{ draftDelCount }} 删）
      </el-button>
      <el-button @click="openExport">导出 xlsx</el-button>
      <div class="spacer"></div>
      <el-tag v-if="dirty" type="warning" effect="dark">未保存的改动</el-tag>
    </div>

    <div class="body" v-if="currentSheet">
      <!-- 左侧：任务列表 -->
      <aside class="task-side">
        <div class="side-title">可选教学任务（{{ sideTasks.length }}）</div>
        <div class="task-search">
          <el-input v-model="taskKw" placeholder="搜索任务" clearable size="small" />
        </div>
        <div class="task-list">
          <div v-for="t in sideTasks" :key="t.id" class="task-item"
               :class="{ active: activeTaskId === t.id, done: isTaskScheduled(t) }"
               @click="pickTask(t)">
            <div class="task-item-color" :style="{ background: taskColor(t.id).solid }"></div>
            <div class="task-item-body">
              <div class="task-item-name">{{ courseName(t.course_id) }}</div>
              <div class="task-item-meta">
                <span>{{ teacherName(t.teacher_id) }}</span>
                <el-tag size="small" type="info" effect="plain">{{ t.section_no }}</el-tag>
              </div>
              <div class="task-item-weeks">{{ weeksText(t.week_pattern) }}</div>
            </div>
            <div class="task-item-right">
              <el-tag v-if="isTaskScheduled(t)" size="small" type="success" effect="plain">已排</el-tag>
            </div>
          </div>
        </div>
        <div class="side-tip">💡 选中任务后，点击右侧网格即可排课；再次点击卡片可换到下一门任务；拖拽卡片可直接移动</div>
      </aside>

      <!-- 主区：网格 -->
      <section class="grid-area">
        <div class="grid-head">
          <h3>{{ currentSheet.name }} · {{ className(currentSheet.class_id) }}</h3>
          <div class="legend">
            <span><em class="lg-current"></em>当前任务</span>
            <span><em class="lg-normal"></em>其他课程</span>
            <span class="lg-draft">+</span> 待保存 · <span class="lg-del">-</span> 待删除
          </div>
        </div>
        <ScheduleGrid
          :week="isConcentrated ? activeWeek : null"
          :days="gridDays"
          :day-offset="dayOffset"
          :timeslots="timeslotsFor"
          :draft="draft"
          :highlight-task-id="activeTaskId"
          :editable="true"
          @cell-click="onCellClick"
          @card-click="onCardClick"
          @card-drop="onCardDropProxy"
          @loc-click="onCellClick"
        />
        <div v-if="isConcentrated" class="week-nav">
          <el-button-group>
            <el-button size="small" :disabled="activeWeek <= weekStart" @click="activeWeek--">← 上一个</el-button>
            <el-button size="small" v-for="w in visibleWeeks" :key="w"
                       :type="activeWeek === w ? 'primary' : 'default'"
                       @click="activeWeek = w">第 {{ w }} 周</el-button>
            <el-button size="small" :disabled="activeWeek >= weekEnd" @click="activeWeek++">下一个 →</el-button>
          </el-button-group>
        </div>
      </section>

      <!-- 抽屉：slot 快速编辑 -->
      <el-drawer v-model="editDrawer.open" title="排课详情" size="380px" :append-to-body="true">
        <el-descriptions :column="1" border size="small" v-if="editDrawer.slot">
          <el-descriptions-item label="课程">{{ courseNameByTask(editDrawer.slot.task_id) }}</el-descriptions-item>
          <el-descriptions-item label="星期">{{ dayName(editDrawer.slot.day_of_week) }}</el-descriptions-item>
          <el-descriptions-item label="节次">{{ editDrawer.slot.start_period }}-{{ editDrawer.slot.end_period }}</el-descriptions-item>
          <el-descriptions-item label="周次">{{ weeksText(editDrawer.slot.week_pattern) }}</el-descriptions-item>
          <el-descriptions-item label="教室">{{ editDrawer.slot.room_name || editDrawer.slot.class_location || '未设置' }}</el-descriptions-item>
        </el-descriptions>
        <div class="drawer-actions">
          <el-select v-model="editDrawer.venueId" placeholder="选择教室" clearable @change="applyVenue">
            <el-option v-for="v in store.venues" :key="v.id" :label="`${v.room_no} (${v.building})`" :value="v.id" />
          </el-select>
          <el-input v-model="editDrawer.onlineUrl" placeholder="线上会议链接" @change="applyOnline" />
          <el-button type="danger" plain @click="removeCurrentSlot">🗑 删除这条排课</el-button>
        </div>
      </el-drawer>
    </div>

    <el-empty v-else description="请选择或新建一张排课单开始工作" />

    <!-- 新建排课单弹窗 -->
    <el-dialog v-model="newSheetDialog.open" title="新建排课单" width="420px">
      <el-form label-width="90px">
        <el-form-item label="班级">
          <el-select v-model="newSheetDialog.class_id" filterable @change="syncSheetName">
            <el-option v-for="c in store.classRooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="newSheetDialog.name" /></el-form-item>
        <el-form-item label="学期"><el-input :model-value="store.currentSemester" disabled /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newSheetDialog.open = false">取消</el-button>
        <el-button type="primary" @click="confirmNewSheet">创建</el-button>
      </template>
    </el-dialog>

    <!-- 导出弹窗 -->
    <el-dialog v-model="exportDialog.open" title="导出课表 xlsx" width="520px">
      <p style="color: #6b7280; font-size: 13px">简版：单表全周次合并；分周版：每周单独一组。A4 横向、教务格式。</p>
      <div class="export-actions">
        <el-button @click="doExport('compact')">导出本排课单 · 简版</el-button>
        <el-button @click="doExport('week')">导出本排课单 · 分周版</el-button>
        <el-button @click="doExport('all')">导出本学期 · 全部排课单 zip</el-button>
      </div>
      <template #footer>
        <el-button @click="exportDialog.open = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useRoute } from 'vue-router'
import ScheduleGrid from '@/components/ScheduleGrid.vue'
import { taskColor } from '@/utils/taskColor'
import { patternToWeeks, weeksToText } from '@/utils/weeks'
import { filterVisibleDays, buildDisplayTimeslots, locationRoom } from '@/utils/schedule'
import { TIMESLOTS, DAYS } from '@/seed/demo-data'
import { detectConflicts } from '@/engine/conflicts'
import { buildCompactModel } from '@/utils/compactGrid'
import { compactXlsxBuffer, downloadXlsxBuffer, exportWeeksXlsx } from '@/utils/exportTimetable'
import JSZip from 'jszip'
import { scheduleCellKey } from '@/utils/schedule'

const store = useDataStore()
const route = useRoute()

const sheets = computed(() =>
  store.sheetsBySemester(store.currentSemester)
    .map((s) => ({ ...s, class_form: store.classMap.get(s.class_id)?.class_form || '' }))
)

const sheetId = ref(null)
const currentSheet = computed(() => sheets.value.find((s) => s.id === sheetId.value) || null)
const isConcentrated = computed(() => currentSheet.value?.class_form === '非全日制集中班')

const activeTaskId = ref(null)
const taskKw = ref('')
const activeWeek = ref(1)

// 草稿：Map<cellKey, Array<card>>；卡片带 _state='new'|'mod'|'del'
const draft = reactive({})
const baseSlots = ref([])

const dirty = computed(() => Object.values(draft).some((list) => list.some((c) => c._state && c._state !== 'orig')))
const draftAddCount = computed(() => countState('new'))
const draftModCount = computed(() => countState('mod'))
const draftDelCount = computed(() => countState('del'))
function countState(s) {
  let n = 0
  for (const list of Object.values(draft)) for (const c of list) if (c._state === s) n++
  return n
}

const dayOffset = computed(() => {
  const days = DAYS
  const visible = filterVisibleDays(days, currentSheet.value?.class_form || '')
  const idx = visible[0] ? days.indexOf(visible[0]) : 0
  return idx > 0 ? idx : 0
})
const gridDays = computed(() => filterVisibleDays(DAYS, currentSheet.value?.class_form || ''))
const timeslotsFor = computed(() => buildDisplayTimeslots(TIMESLOTS, currentSheet.value?.class_form || ''))

const weekList = computed(() => patternToWeeks(currentSheet.value?.week_pattern || '1'.repeat(store.totalWeeks)))
const weekStart = computed(() => weekList.value[0] || 1)
const weekEnd = computed(() => weekList.value[weekList.value.length - 1] || store.totalWeeks)
const visibleWeeks = computed(() => {
  const list = weekList.value
  if (list.length <= 8) return list
  const start = Math.max(0, list.indexOf(activeWeek.value) - 4)
  return list.slice(start, start + 8)
})

const tasksForSheet = computed(() => {
  if (!currentSheet.value) return []
  const cls = store.classMap.get(currentSheet.value.class_id)
  if (!cls) return []
  return store.tasksBySemester(store.currentSemester).filter((t) => {
    const ids = (t.class_ids && t.class_ids.length ? t.class_ids : [t.class_id]).map(Number)
    return ids.includes(Number(cls.id)) && t.class_form === cls.class_form
  })
})

const sideTasks = computed(() => {
  const kw = taskKw.value.trim().toLowerCase()
  const list = tasksForSheet.value
  if (!kw) return list
  return list.filter((t) =>
    courseName(t.course_id).toLowerCase().includes(kw) ||
    teacherName(t.teacher_id).toLowerCase().includes(kw) ||
    (t.section_no || '').toLowerCase().includes(kw)
  )
})

const pendingTasks = computed(() => tasksForSheet.value.filter((t) => !isTaskScheduled(t)))

function courseName(id) { return store.courseMap.get(Number(id))?.name || '未命名' }
function teacherName(id) { return store.teacherMap.get(Number(id))?.name || '' }
function className(id) { return store.classMap.get(Number(id))?.name || '' }
function courseNameByTask(tid) { const t = store.taskMap.get(Number(tid)); return t ? courseName(t.course_id) : '' }
function dayName(d) { return DAYS[Number(d) - 1] || '' }
function weeksText(p) { return weeksToText(patternToWeeks(p), { prefix: '第', unit: '周' }) || '—' }
function isTaskScheduled(t) {
  return store.scheduleSlots.some((s) => Number(s.task_id) === Number(t.id) && Number(s.sheet_id) === Number(sheetId.value)) ||
    Object.values(draft).some((list) => list.some((c) => Number(c.task_id) === Number(t.id) && c._state !== 'del'))
}
function shortForm(f) { return (f || '').replace('非全日制', '') || '—' }
function tagType(f) {
  if (f === '全日制') return 'success'
  if (f === '非全日制周末班') return 'warning'
  if (f === '非全日制集中班') return ''
  return 'info'
}

function pickTask(t) { activeTaskId.value = activeTaskId.value === t.id ? null : t.id }

function loadSheetSlots() {
  const slots = store.scheduleSlots.filter((s) => Number(s.sheet_id) === Number(sheetId.value))
  baseSlots.value = JSON.parse(JSON.stringify(slots))
  Object.keys(draft).forEach((k) => delete draft[k])
  for (const s of slots) {
    const key = scheduleCellKey(isConcentrated.value ? null : null, s.day_of_week, s.start_period)
    pushCard(s, 'orig')
  }
  if (isConcentrated.value) {
    activeWeek.value = weekStart.value
    // 集中班按 week 分组：每条 slot 拆到 week_pattern 每一位
    Object.keys(draft).forEach((k) => delete draft[k])
    for (const s of slots) {
      const weeks = patternToWeeks(s.week_pattern)
      for (const w of weeks) {
        const key = scheduleCellKey(w, s.day_of_week, s.start_period)
        pushCard({ ...s, week: w }, 'orig', key)
      }
    }
  }
}

function pushCard(s, state, key) {
  const k = key || scheduleCellKey(isConcentrated.value ? null : null, s.day_of_week, s.start_period)
  const list = draft[k] || (draft[k] = [])
  list.push({
    ...s,
    _state: state,
    _locUid: 'u' + Math.random().toString(36).slice(2, 10),
    course_name: courseNameByTask(s.task_id),
    teacher_names: teacherName(store.taskMap.get(Number(s.task_id))?.teacher_id),
    section_no: store.taskMap.get(Number(s.task_id))?.section_no || '',
    weeks_text: s.weeks_text || weeksText(s.week_pattern),
    location: locationRoom(s)
  })
}

function onSheetChange() {
  activeTaskId.value = null
  loadSheetSlots()
}

// ---- 网格交互 ----
function onCellClick(week, day, sp, ep) {
  if (!activeTaskId.value) return
  const task = store.taskMap.get(Number(activeTaskId.value))
  if (!task) return
  const period = timeslotsFor.value.find((t) => t.periodStart === sp || t.period === sp)
  const span = Number(task.periods_per_session || 1)
  const end = Math.min(sp + span - 1, 5)
  const sheetWeekPattern = currentSheet.value.week_pattern || '1'.repeat(store.totalWeeks)
  const rowKey = scheduleCellKey(week, day, sp)
  const list = draft[rowKey] || (draft[rowKey] = [])
  const card = {
    sheet_id: sheetId.value,
    task_id: activeTaskId.value,
    class_id: currentSheet.value.class_id,
    semester: store.currentSemester,
    day_of_week: day,
    start_period: sp,
    end_period: end,
    week_pattern: task.week_pattern || sheetWeekPattern,
    venue_id: null,
    room_name: '',
    _state: 'new',
    _locUid: 'u' + Math.random().toString(36).slice(2, 10),
    course_name: courseName(task.course_id),
    teacher_names: teacherName(task.teacher_id),
    section_no: task.section_no || '',
    weeks_text: weeksText(task.week_pattern || sheetWeekPattern),
    location: ''
  }
  list.push(card)
  ElMessage.success(`已放置：${card.course_name} ${dayName(day)} ${sp}-${end} 节（保存前不落盘）`)
}

function onCardClick(week, day, sp, ep, card) {
  editDrawer.open = true
  editDrawer.slot = card
  editDrawer.venueId = card.venue_id || null
  editDrawer.onlineUrl = card.online_url || ''
}

const cardsCache = ref([])

function _flattenCards() {
  const arr = []
  for (const list of Object.values(draft)) arr.push(...list)
  return arr
}

function onCardDropProxy(week, day, sp, ep, card) {
  card.day_of_week = day
  card.start_period = sp
  card.end_period = sp + (Number(card.end_period) - Number(card.start_period))
  if (isConcentrated.value) card.week = week
  if (card._state === 'orig') card._state = 'mod'
  const all = _flattenCards().filter((c) => c !== card)
  Object.keys(draft).forEach((k) => delete draft[k])
  const put = (c) => {
    const k = scheduleCellKey(isConcentrated.value ? c.week : null, c.day_of_week, c.start_period)
    ;(draft[k] ||= []).push(c)
  }
  all.forEach(put); put(card)
}

function clearDraft() {
  ElMessageBox.confirm('放弃本次所有未保存的改动？', '确认', { type: 'warning' }).then(() => {
    loadSheetSlots()
    ElMessage.info('已恢复')
  }).catch(() => {})
}

async function commitDraft() {
  const all = _flattenCards()
  const toSave = all.filter((c) => c._state !== 'del')
  const toDelete = all.filter((c) => c._state === 'del' && c.id)
  const ctx = { tasks: store.taskMap, teachers: store.teacherMap, venues: store.venueMap }
  const conflicts = []
  // 检查新/改动的卡片与已有 slot 集 + 草稿其它卡片的冲突
  const baseClone = baseSlots.value.map((s) => ({ ...s, week_pattern: s.week_pattern || '' }))
  for (const c of toSave) {
    if (c._state === 'orig') continue
    const list = [...baseClone.filter((x) => x.id !== c.id), ...toSave.filter((x) => x !== c && x._state !== 'orig')]
    const hits = detectConflicts(c, list, ctx, c.id || null)
    for (const h of hits) conflicts.push({ card: c, ...h })
  }
  if (conflicts.length) {
    const blocking = conflicts.filter((c) => c.severity === 'error')
    try {
      await ElMessageBox.confirm(
        `检测到 ${conflicts.length} 条冲突（其中 ${blocking.length} 条为硬冲突）：\n` +
        conflicts.slice(0, 5).map((c) => `· ${c.label}：${c.message}`).join('\n') +
        (conflicts.length > 5 ? '\n...' : '') +
        '\n\n是否仍要强制保存？',
        '保存冲突确认', { type: 'warning', confirmButtonText: '强制保存', cancelButtonText: '返回修改' }
      )
    } catch { return }
  }
  // 落盘
  const rows = toSave.map((c) => {
    const { _state, _locUid, course_name, teacher_names, section_no, weeks_text, location, ...rest } = c
    return rest
  })
  await store.bulkSaveSlots(rows)
  for (const d of toDelete) {
    if (d.id) await store.deleteSlot(d.id)
  }
  await store.reload()
  loadSheetSlots()
  ElMessage.success(`已保存：新增/修改 ${rows.length} · 删除 ${toDelete.length}`)
}

// ---- 编辑抽屉 ----
const editDrawer = reactive({ open: false, slot: null, venueId: null, onlineUrl: '' })
function applyVenue(id) {
  if (!editDrawer.slot) return
  const v = store.venueMap.get(Number(id))
  editDrawer.slot.venue_id = id
  editDrawer.slot.room_name = v?.room_no || ''
  editDrawer.slot.building = v?.building || ''
  editDrawer.slot.campus = v?.campus || ''
  editDrawer.slot.location = v?.room_no || ''
  if (editDrawer.slot._state === 'orig') editDrawer.slot._state = 'mod'
  ElMessage.success('已更新教室')
}
function applyOnline(url) {
  if (!editDrawer.slot) return
  editDrawer.slot.online_url = url
  if (editDrawer.slot._state === 'orig') editDrawer.slot._state = 'mod'
}
function removeCurrentSlot() {
  const c = editDrawer.slot
  if (!c) return
  if (c._state === 'new') {
    // 从 draft 里直接剔除
    for (const list of Object.values(draft)) {
      const i = list.indexOf(c)
      if (i >= 0) { list.splice(i, 1); break }
    }
  } else {
    c._state = 'del'
  }
  editDrawer.open = false
  ElMessage.success('已从本次改动中剔除')
}

// ---- 新建排课单 ----
const newSheetDialog = reactive({ open: false, class_id: null, name: '' })
function newSheet() {
  newSheetDialog.class_id = currentSheet.value?.class_id || store.classRooms[0]?.id || null
  newSheetDialog.name = ''
  newSheetDialog.open = true
  syncSheetName()
}
function syncSheetName() {
  const cls = store.classMap.get(newSheetDialog.class_id)
  if (cls) newSheetDialog.name = `${cls.name} · ${store.currentSemester}`
}
async function confirmNewSheet() {
  if (!newSheetDialog.class_id) return ElMessage.warning('请选择班级')
  const cls = store.classMap.get(newSheetDialog.class_id)
  const row = {
    class_id: newSheetDialog.class_id,
    name: newSheetDialog.name || '未命名排课单',
    semester: store.currentSemester,
    week_pattern: cls?.class_form === '非全日制集中班' ? '1'.repeat(12) + '0'.repeat(store.totalWeeks - 12) : '',
    updated_at: new Date().toISOString()
  }
  const created = await store.create('scheduleSheets', row)
  newSheetDialog.open = false
  sheetId.value = created.id
  loadSheetSlots()
  ElMessage.success('已新建')
}

// ---- 一键自动排课（贪心） ----
async function autoSchedule() {
  const list = pendingTasks.value
  if (!list.length) return ElMessage.info('当前排课单没有待排任务')
  const busy = _flattenCards().filter((c) => c._state !== 'del')
  const slotsByDayPeriod = new Set(busy.map((c) => `${c.day_of_week}|${c.start_period}-${c.end_period}|${c.week_pattern}`))
  const teacherBusy = new Map()
  for (const c of busy) {
    const t = store.taskMap.get(Number(c.task_id))
    if (!t) continue
    const ids = [Number(t.teacher_id), Number(t.teacher2_id)].filter((x) => x)
    for (const tid of ids) {
      const arr = teacherBusy.get(tid) || []
      arr.push({ d: c.day_of_week, s: c.start_period, e: c.end_period, w: c.week_pattern })
      teacherBusy.set(tid, arr)
    }
  }
  const venues = store.venues.filter((v) => v.is_available)
  const venueBusy = []
  let placed = 0, failed = 0
  for (const t of list) {
    const span = Math.max(1, Number(t.sessions_per_week || 1))
    const rows = timeslotsFor.value
    const dayOptions = gridDays.value.map((d) => DAYS.indexOf(d) + 1 + dayOffset.value)
    let ok = false
    outer: for (let di = 0; di < dayOptions.length && !ok; di++) {
      const day = dayOptions[di]
      for (let pi = 0; pi + span - 1 < rows.length; pi += span) {
        const r1 = rows[pi], r2 = rows[pi + span - 1]
        if (!r1 || !r2) continue
        const sp = r1.periodStart, ep = r2.periodEnd
        const key = `${day}|${sp}-${ep}|${t.week_pattern}`
        if (slotsByDayPeriod.has(key)) continue
        // 教师空闲
        const tids = [Number(t.teacher_id), Number(t.teacher2_id)].filter((x) => x)
        const teacherOk = tids.every((tid) => {
          const arr = teacherBusy.get(tid) || []
          return !arr.some((x) => x.d === day && x.s <= ep && sp <= x.e && overlapPattern(x.w, t.week_pattern))
        })
        if (!teacherOk) continue
        // 找一个空教室
        const venue = venues.find((v) => !venueBusy.some((b) =>
          b.vid === v.id && b.day === day && b.s <= ep && sp <= b.e && overlapPattern(b.w, t.week_pattern)
        ))
        if (!venue) continue
        // 放置
        const card = {
          sheet_id: sheetId.value,
          task_id: t.id,
          class_id: currentSheet.value.class_id,
          semester: store.currentSemester,
          day_of_week: day,
          start_period: sp,
          end_period: ep,
          week_pattern: t.week_pattern,
          venue_id: venue.id,
          room_name: venue.room_no,
          building: venue.building,
          campus: venue.campus,
          _state: 'new',
          _locUid: 'u' + Math.random().toString(36).slice(2, 10),
          course_name: courseName(t.course_id),
          teacher_names: teacherName(t.teacher_id),
          section_no: t.section_no || '',
          weeks_text: weeksText(t.week_pattern),
          location: venue.room_no
        }
        const k = scheduleCellKey(isConcentrated.value ? patternToWeeks(t.week_pattern)[0] : null, day, sp)
        ;(draft[k] ||= []).push(card)
        slotsByDayPeriod.add(key)
        for (const tid of tids) {
          const arr = teacherBusy.get(tid) || []
          arr.push({ d: day, s: sp, e: ep, w: t.week_pattern })
          teacherBusy.set(tid, arr)
        }
        venueBusy.push({ vid: venue.id, day, s: sp, e: ep, w: t.week_pattern })
        placed++
        ok = true
        break outer
      }
    }
    if (!ok) failed++
  }
  ElMessage.success(`已自动放置 ${placed} 门任务${failed ? `，${failed} 门因约束未能放置` : ''}。请检查后点保存`)
}

function overlapPattern(a, b) {
  const s = String(a || ''); const t = String(b || '')
  const len = Math.min(s.length, t.length)
  for (let i = 0; i < len; i++) if (s[i] === '1' && t[i] === '1') return true
  return false
}

// ---- xlsx 导出 ----
const exportDialog = reactive({ open: false })
function openExport() { exportDialog.open = true }
async function doExport(kind) {
  if (!currentSheet.value) return
  const slots = store.scheduleSlots
    .filter((s) => Number(s.sheet_id) === Number(sheetId.value))
    .map((s) => store.enrichSlot(s))
  const cls = store.classMap.get(currentSheet.value.class_id)
  const model = buildCompactModel({
    items: slots,
    timeslots: TIMESLOTS,
    days: DAYS,
    classForm: cls?.class_form || '',
    marks: []
  })
  const title = `${cls?.name || ''} · ${store.currentSemester}`
  if (kind === 'compact') {
    const buf = await compactXlsxBuffer({ ...model, days: DAYS, title })
    downloadXlsxBuffer(title, buf)
  } else if (kind === 'week') {
    await exportWeeksXlsx(title, {
      timeslots: TIMESLOTS, days: DAYS,
      weeks: (() => {
        const arr = []
        for (let w = 1; w <= store.totalWeeks; w++) {
          const s = slots.filter((x) => {
            const p = patternToWeeks(x.week_pattern)
            return p.includes(w)
          })
          if (s.length) arr.push({ week: w, slots: s, marks: [] })
        }
        return arr
      })(),
      title
    })
  } else if (kind === 'all') {
    const zip = new JSZip()
    for (const s of sheets.value) {
      const cls2 = store.classMap.get(s.class_id)
      const sc = store.scheduleSlots
        .filter((x) => Number(x.sheet_id) === Number(s.id))
        .map((x) => store.enrichSlot(x))
      const m = buildCompactModel({ items: sc, timeslots: TIMESLOTS, days: DAYS, classForm: cls2?.class_form || '', marks: [] })
      const buf = await compactXlsxBuffer({ ...m, days: DAYS, title: `${cls2?.name} · ${store.currentSemester}` })
      zip.file(`${cls2?.name || 'sheet' + s.id}.xlsx`, buf)
    }
    const out = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(out)
    const a = document.createElement('a')
    a.href = url; a.download = `本学期全部课表.zip`
    a.click(); URL.revokeObjectURL(url)
  }
  exportDialog.open = false
}

// ---- 生命周期 ----
onMounted(() => {
  const q = Number(route.query.sheet)
  sheetId.value = (q && sheets.value.some((s) => s.id === q)) ? q : (sheets.value[0]?.id || null)
  if (sheetId.value) loadSheetSlots()
})

watch(() => store.currentSemester, () => {
  sheetId.value = sheets.value[0]?.id || null
  if (sheetId.value) loadSheetSlots()
})

watch(() => store.currentClassForm, () => {
  const cur = sheets.value.find((s) => s.id === sheetId.value)
  if (!cur) {
    sheetId.value = sheets.value[0]?.id || null
    if (sheetId.value) loadSheetSlots()
  }
})
</script>

<style scoped>
.sched { display: flex; flex-direction: column; height: calc(100vh - 96px); min-height: 500px; }
.topbar {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  background: #fff; border-radius: 8px; margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.divider { width: 1px; height: 22px; background: #e5e9f0; }
.spacer { flex: 1; }
.body { display: grid; grid-template-columns: 300px 1fr; gap: 12px; flex: 1; min-height: 0; }
.task-side {
  background: #fff; border-radius: 8px; padding: 12px; overflow: hidden;
  display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.side-title { font-size: 13px; font-weight: 600; color: #1f2d3d; margin-bottom: 8px; }
.task-search { margin-bottom: 6px; }
.task-list { overflow: auto; flex: 1; }
.task-item {
  display: flex; gap: 8px; padding: 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid transparent; margin-bottom: 6px; background: #f9fafb;
}
.task-item:hover { background: #eff3fa; }
.task-item.active { border-color: #2563eb; background: #eef2ff; }
.task-item.done .task-item-name { color: #16a34a; }
.task-item-color { width: 4px; border-radius: 2px; }
.task-item-body { flex: 1; min-width: 0; }
.task-item-name { font-size: 13px; font-weight: 600; color: #1f2d3d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-item-meta { font-size: 11px; color: #6b7280; margin-top: 2px; display: flex; gap: 6px; align-items: center; }
.task-item-weeks { font-size: 11px; color: #2563eb; margin-top: 2px; }
.side-tip { font-size: 11px; color: #8a94a6; padding: 8px 4px 0; border-top: 1px dashed #eef1f6; margin-top: 8px; }
.grid-area {
  background: #fff; border-radius: 8px; padding: 12px 14px;
  overflow: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.grid-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.grid-head h3 { margin: 0; font-size: 15px; color: #003690; }
.legend { font-size: 11px; color: #6b7280; display: flex; gap: 10px; align-items: center; }
.legend em { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: middle; margin-right: 4px; }
.lg-current { background: #fde68a; border: 1.5px solid #f59e0b; }
.lg-normal { background: #dbeafe; border: 1px solid #93c5fd; }
.lg-draft { color: #16a34a; font-weight: 700; }
.lg-del { color: #dc2626; font-weight: 700; }
.week-nav { margin-top: 12px; text-align: center; }
.drawer-actions { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.export-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
</style>
