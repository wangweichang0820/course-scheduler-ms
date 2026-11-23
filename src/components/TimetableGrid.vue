<template>
  <div v-if="!timeslots.length || !days.length" class="tt-loading"><el-skeleton :rows="10" animated /></div>
  <div v-else class="tt-grid" :style="gridStyle">
    <div class="tt-corner" style="grid-column: 1; grid-row: 1">节次</div>
    <div v-for="(d, di) in days" :key="d" class="tt-head" :style="{ gridColumn: di + 2, gridRow: 1 }">{{ d }}</div>
    <template v-for="(p, pi) in timeslots" :key="p.period">
      <div class="tt-period" :style="{ gridColumn: 1, gridRow: pi + 2 }">
        <div class="tt-period-label">{{ p.label }}</div>
        <div class="tt-period-time">{{ p.start }}-{{ p.end }}</div>
        <div class="tt-period-credit">{{ periodCredit(p) }}课时</div>
      </div>
      <div v-for="(d, di) in days" :key="`${p.period}-${di}`" class="tt-cell"
        :class="{ 'tt-cell-stack': stacked }"
        :style="{ gridColumn: di + 2, gridRow: pi + 2 }" @click="emit('cell-click', dayOf(di), p.period)">
        <template v-if="stacked">
          <!-- 周次标注（如「本科课程」）：管理员叠的色块，不属于排课数据，逐周视图已按周筛过；
               导入的「其他」标注在色块里带上课程名 -->
          <div v-for="m in cellMarks(dayOf(di), p)" :key="m.id" class="tt-stack-mark"
            :class="{ 'tt-mark-conflict': m.conflicts && m.conflicts.length }"
            :style="{ backgroundColor: m.color }" :title="markTitle(m)">{{ m.label }}<template
              v-if="m.source === 'import' && m.course_name"> · {{ m.course_name }}</template><template
              v-if="m.conflicts && m.conflicts.length"> · 冲突</template></div>
          <div v-for="s in cellSlots(dayOf(di), p)" :key="s.id" class="tt-card tt-card-stack"
            :class="cardClass(s)" :style="stackStyle(s)" :title="cardTitle(s)">
            <template v-if="s.masked">
              <div class="tt-mask-text">其他教师课程</div>
            </template>
            <template v-else>
              <div class="tt-stack-name" :style="{ color: taskColor(s.task_id).solid }">
                {{ s.course_name }}<template v-if="s.teacher_names || s.teacher_name"> -{{ s.teacher_names || s.teacher_name }}</template><span
                  v-if="s.section_no" class="tt-stack-sec"> [{{ s.section_no }}]</span><span
                  v-if="s.is_merged" class="tt-merged-pill" :title="mergedTip(s)">合班</span>
              </div>
              <div class="tt-stack-meta">
                <span v-if="hasLocation(s)">{{ locationText(s) }}</span>
                <span v-else class="tt-stack-noloc">未设置地点</span>
              </div>
            </template>
          </div>
        </template>
      </div>
    </template>
    <div v-for="s in stacked ? [] : slots" :key="s.id" class="tt-card"
      :class="cardClass(s)" :style="cardStyle(s)"
      :title="cardTitle(s)" @click="!s.masked && emit('card-click', s)">
      <template v-if="s.masked">
        <div class="tt-mask-bar"></div>
        <div class="tt-mask-text">其他教师课程</div>
      </template>
      <template v-else-if="simple">
        <div class="tt-card-title">{{ s.course_name }}{{ s.section_no ? ' ' + s.section_no : '' }}<span
          v-if="s.is_merged" class="tt-merged-pill" :title="mergedTip(s)">合班</span></div>
        <div class="tt-card-meta">{{ s.teacher_names || s.teacher_name }}</div>
        <div v-if="hasLocation(s)" class="tt-card-meta">{{ locationText(s) }}</div>
        <el-link v-else-if="editable" type="warning" :underline="false" class="tt-loc-empty"
          @click.stop="emit('location-edit', s)">暂未设置上课地点</el-link>
        <span v-else class="tt-card-meta">暂未设置上课地点</span>
      </template>
      <template v-else>
        <div class="tt-card-title">{{ s.course_name }}<span
          v-if="s.is_merged" class="tt-merged-pill" :title="mergedTip(s)">合班</span></div>
        <div class="tt-card-meta">{{ classDisplayName(s) }}</div>
        <div class="tt-card-meta">{{ s.teacher_names || s.teacher_name }}</div>
        <div v-if="hasLocation(s)" class="tt-card-meta">{{ locationText(s) }}</div>
        <el-link v-else-if="editable" type="warning" :underline="false" class="tt-loc-empty"
          @click.stop="emit('location-edit', s)">暂未设置上课地点</el-link>
        <span v-else class="tt-card-meta">暂未设置上课地点</span>
        <div class="tt-card-meta">{{ s.weeks_text }}</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { taskColor, slotMatches } from '@/utils/taskColor'
import { locationRoom } from '@/utils/schedule'

const props = defineProps({
  /** 节次配置：[{ period, label, start, end }] */
  timeslots: { type: Array, default: () => [] },
  /** 星期表头：['周一', ...] */
  days: { type: Array, default: () => [] },
  /** 表头首列对应的真实星期几（非全日制周末班只展示周六、周日时传 5） */
  dayOffset: { type: Number, default: 0 },
  /** 列表模式：同一格的多门课纵向逐条排列（只读查看用，不做并排卡片） */
  stacked: { type: Boolean, default: false },
  /** 排课卡片：后端 serialize_slot 的输出 */
  slots: { type: Array, default: () => [] },
  /** 周次标注（markEntries 的输出）：只在列表模式下叠加显示 */
  marks: { type: Array, default: () => [] },
  /** 精简模式：只展示课程名+课序号、教师、教室 */
  simple: { type: Boolean, default: false },
  /** 需要高亮（色块提醒）的教学任务 id（单个） */
  highlightTaskId: { type: Number, default: null },
  /** 需要高亮的教学任务 id 列表（多个） */
  highlightTaskIds: { type: Array, default: () => [] },
  /** 检索关键词：命中教学任务的卡片高亮，未命中的变暗 */
  searchText: { type: String, default: '' },
  /** 是否允许点击「暂未设置上课地点」打开编辑（管理员可编辑，教师/只读关闭） */
  editable: { type: Boolean, default: true }
})
const emit = defineEmits(['cell-click', 'card-click', 'location-edit'])

/** 该排课记录是否已有上课地点 */
function hasLocation(s) {
  return !!(s.class_location || s.room_name || s.venue_name)
}
function locationText(s) {
  // 周课表只显示房间号；完整「校区 教学楼 房号」保留在 cardTitle 悬停提示里
  return locationRoom(s)
}

const gridStyle = computed(() => ({
  // 节次列宽度走 CSS 变量：手机端横向滑动时可改成更窄的 72px（默认 96px 不变）
  gridTemplateColumns: `var(--tt-first-col, 96px) repeat(${Math.max(props.days.length, 1)}, minmax(0, 1fr))`
}))

/** 表头第 di 列对应的真实星期几 */
function dayOf(di) {
  return di + 1 + Number(props.dayOffset || 0)
}

/** 列表模式下某个节次行/星期下的排课（按课程名排序）；连排块按区间重叠匹配，跨到的每行都显示 */
function cellSlots(day, p) {
  const start = Number(p.periodStart ?? p.period)
  const end = Number(p.periodEnd ?? p.period)
  return props.slots
    .filter((s) => Number(s.day_of_week) === Number(day)
      && Number(s.start_period) <= end && Number(s.end_period || s.start_period) >= start)
    .sort((a, b) => String(a.course_name || '').localeCompare(String(b.course_name || ''), 'zh')
      || String(a.section_no || '').localeCompare(String(b.section_no || ''), 'zh'))
}

/** 该格（星期 × 显示行）里的周次标注：按起始节次归入所在显示行 */
function cellMarks(day, p) {
  const start = Number(p.periodStart ?? p.period)
  const end = Number(p.periodEnd ?? p.period)
  return (props.marks || []).filter((m) => Number(m.day_of_week) === Number(day)
    && Number(m.start_period) >= start && Number(m.start_period) <= end)
}

function markTitle(m) {
  const course = m.source === 'import'
    ? [m.course_name, m.course_code && `${m.course_code}${m.section_no ? ` [${m.section_no}]` : ''}`]
    : []
  const conflict = (m.conflicts || []).map((c) => c.message).join('；')
  return [...course, m.label, m.weeks_text, m.location, m.remark, conflict && `冲突：${conflict}`]
    .filter(Boolean).join(' · ')
}

/** 实际节次 -> 显示行号（非全日制合并节次行时多对一） */
const rowIndex = computed(() => {
  const map = new Map()
  props.timeslots.forEach((p, i) => {
    const start = Number(p.periodStart ?? p.period)
    const end = Number(p.periodEnd ?? p.period)
    for (let n = start; n <= end; n++) map.set(n, i + 1)
  })
  return map
})
function startRow(s) {
  return rowIndex.value.get(Number(s.start_period)) || 1
}
function endRow(s) {
  return rowIndex.value.get(Number(s.end_period || s.start_period)) || startRow(s)
}

/**
 * 同一(星期, 起始节) 的多张卡片分组编号：同一格的卡片按 slot.id 排序后，
 * 分配 0..n-1 的横向子列，配合 CSS 变量 --lane / --lanes 让该格宽度均分，
 * 避免多张卡片完全重叠。不修改原始 slot 对象，用 Map 缓存。
 */
const laneMap = computed(() => {
  const buckets = new Map()
  for (const s of props.slots || []) {
    const key = `${s.day_of_week}-${startRow(s)}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(s)
  }
  const map = new Map()
  for (const list of buckets.values()) {
    list.sort((a, b) => (a.id || 0) - (b.id || 0))
    list.forEach((s, i) => map.set(s, { lane: i, lanes: list.length }))
  }
  return map
})

/**
 * 高亮集合：检索关键词优先（检索是一次性动作，优先级最高），
 * 其次用显式指定的 id 列表 / 单个 id。
 */
const highlightIds = computed(() => {
  const kw = (props.searchText || '').trim()
  if (kw) {
    const ids = new Set()
    for (const s of props.slots) {
      if (slotMatches(s, kw)) ids.add(Number(s.task_id))
    }
    return [...ids]
  }
  if (Array.isArray(props.highlightTaskIds) && props.highlightTaskIds.length) {
    return props.highlightTaskIds.map(Number)
  }
  if (props.highlightTaskId) return [Number(props.highlightTaskId)]
  return []
})
const hasHighlight = computed(() => highlightIds.value.length > 0)

/** 该排课记录是否属于被高亮的教学任务（遮盖卡片不参与高亮） */
function isHi(s) {
  if (s.masked) return false
  return hasHighlight.value && highlightIds.value.includes(Number(s.task_id))
}

function cardClass(s) {
  return {
    conflict: s.conflicts?.length,
    masked: s.masked,
    'tt-card--hi': isHi(s),
    'tt-card--dim': hasHighlight.value && !isHi(s)
  }
}

/** 按节次显示行折算课时：合并行用后端/显示行给出的课时数 */
function periodCredit(p) {
  if (p.hours != null) return p.hours
  return (p.period || 0) <= 6 ? 2 : 1
}

function cardStyle(s) {
  const start = startRow(s)
  const span = Math.max(endRow(s) - start + 1, 1)
  const lane = laneMap.value.get(s) || { lane: 0, lanes: 1 }
  // 同一格多卡：把该格宽度按 lanes 等分，卡片落在自己的子列并留出 4px 间隔
  const base = {
    gridColumn: `${Number(s.day_of_week) - Number(props.dayOffset || 0) + 1}`,
    gridRow: `${start + 1} / span ${span}`,
    '--lane': lane.lane,
    '--lanes': lane.lanes,
    marginLeft: lane.lanes > 1 ? `calc((100% + 4px) / ${lane.lanes} * ${lane.lane})` : '0',
    width: lane.lanes > 1 ? `calc((100% - 4px) / ${lane.lanes})` : '100%',
    zIndex: 2
  }
  if (!isHi(s)) return base
  const c = taskColor(s.task_id)
  return {
    ...base,
    background: c.bgStrong,
    borderColor: c.border,
    // 左侧粗色条 + 实色外框，命中卡片醒目可辨
    boxShadow: `inset 5px 0 0 ${c.solid}, 0 0 0 2px ${c.border}`
  }
}

/** 列表模式卡片样式：命中检索时只加淡色底与左色条，保持逐行文本观感 */
function stackStyle(s) {
  if (!isHi(s)) return {}
  const c = taskColor(s.task_id)
  return { background: c.bg, boxShadow: `inset 3px 0 0 ${c.solid}` }
}

function cardTitle(s) {
  if (s.masked) return '该时段为其他教师的课程，详情已隐藏'
  const c = (s.conflicts || []).map((x) => x.label || x.message).join('、')
  return `${s.course_name} ${s.teacher_names || s.teacher_name} ${s.class_location || s.room_name || s.venue_name} ${s.weeks_text}${c ? '｜冲突：' + c : ''}`
}

/**
 * 去掉班级名称里重复的课程名，避免卡片上出现「工程伦理 / A203005B-09 工程伦理」这种重复。
 * 例如 class_name 为「A203005B-09 工程伦理」、course_name 为「工程伦理」时，返回「A203005B-09」。
 */
function classDisplayName(s) {
  const name = String(s.class_name || '').trim()
  if (!name) return ''
  const course = String(s.course_name || '')
  if (!course || !name.includes(course)) return name
  let cleaned = name.replaceAll(course, '').trim()
  cleaned = cleaned.replace(/^[\-—–]\s*/, '').replace(/\s*[\-—–]$/, '').trim()
  return cleaned || name
}

/** 合班提示：列出该课程合开的全部班级 */
function mergedTip(s) {
  const names = (s.open_class_names || []).join('、')
  return names ? `合班课程，开课班级：${names}` : '合班课程（多个班级合开，时间地点同步）'
}
</script>

<style scoped>
.tt-loading { padding: 12px; }
.tt-grid { display: grid; gap: 4px; }
.tt-corner, .tt-head { background: #f4f6fa; padding: 6px; text-align: center; font-size: 12px; font-weight: 600; border-radius: 4px; }
.tt-period { background: #f4f6fa; padding: 4px 6px; border-radius: 4px; text-align: center; }
.tt-period-label { font-size: 11px; font-weight: 600; }
.tt-period-time { font-size: 10px; color: var(--text-soft); }
.tt-period-credit { font-size: 10px; color: #2563eb; font-weight: 600; }
.tt-cell { min-height: 54px; border: 1px dashed var(--border); border-radius: 4px; cursor: pointer; }
.tt-cell:hover { border-color: var(--brand); background: var(--brand-soft); }
/* 列表模式：同格课程纵向逐条排列，像纸质课表一样 */
.tt-cell-stack {
  display: flex; flex-direction: column; gap: 2px;
  padding: 3px 4px; align-items: stretch; cursor: default;
}
.tt-card.tt-card-stack {
  position: static; padding: 1px 3px; border: none; border-radius: 3px;
  background: transparent; box-shadow: none; cursor: default;
}
.tt-stack-name { font-size: 11px; font-weight: 600; line-height: 1.35; word-break: break-all; }
.tt-stack-sec { color: #64748b; font-weight: 500; }
.tt-stack-meta { font-size: 10px; color: var(--text-soft); line-height: 1.3; }
.tt-stack-noloc { color: #b0b8c4; }
/* 周次标注：小色块（实底白字），与课程文本行区分开 */
.tt-stack-mark {
  align-self: flex-start;
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
  word-break: break-all;
}
/* 与系统排课教师时间冲突：红描边提醒，title 里有冲突明细 */
.tt-mark-conflict { box-shadow: 0 0 0 2px #f56c6c; }
.tt-card {
  border-radius: 6px; padding: 4px 6px; overflow: hidden; cursor: pointer; z-index: 1;
  display: flex; flex-direction: column; gap: 1px;
  background: linear-gradient(135deg, var(--brand-soft), var(--brand-softer)); border: 1px solid var(--el-color-primary-light-7);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7);
}
.tt-card-title { font-size: 11px; font-weight: 600; line-height: 1.25; }
/* 合班小标注：品牌蓝浅底 pill，提示该课程多班级合开、时间地点同步 */
.tt-merged-pill {
  display: inline-block; margin-left: 4px; padding: 0 4px; vertical-align: middle;
  font-size: 9px; line-height: 1.5; font-weight: 700; white-space: nowrap; cursor: default;
  color: var(--brand); background: var(--brand-soft);
  border: 1px solid var(--el-color-primary-light-7); border-radius: 3px;
}
.tt-card-meta { font-size: 10px; color: var(--text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt-card.conflict { background: linear-gradient(135deg, #ffecec, #fff6f6); border-color: #f3b2b2; }
.tt-card.masked {
  cursor: default; align-items: center; justify-content: center;
  background: repeating-linear-gradient(135deg, #eceff3, #eceff3 6px, #e3e7ed 6px, #e3e7ed 12px);
  border: 1px dashed #c3cad4;
}
.tt-mask-bar { width: 60%; height: 4px; border-radius: 2px; background: #c3cad4; }
.tt-mask-text { font-size: 10px; color: #9aa4b1; letter-spacing: 1px; }
/* 检索/高亮：命中的卡片用醒目色块标注（背景/边框/左侧色条由 cardStyle 内联设置）；
   未命中的仅轻微降透明，保持内容清晰可读，不做模糊处理 */
.tt-card.tt-card--hi { font-weight: 600; }
.tt-card.tt-card--hi .tt-card-title { color: #1f2d3d; }
.tt-card.tt-card--hi .tt-card-meta { color: #33475b; }
.tt-card.tt-card--dim { opacity: 0.62; }
/* 未设置上课地点：可点击提醒；避免被 flex 列容器拉伸成整行导致文字居中 */
.tt-loc-empty { font-size: 10px; line-height: 1.25; align-self: flex-start; text-align: left; }
</style>
