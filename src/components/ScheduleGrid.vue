<template>
  <div class="tt-grid" :style="gridStyle">
    <div class="tt-corner">节次</div>
    <div v-for="(d, di) in days" :key="d" class="tt-head" :style="{ gridColumn: di + 2 }">{{ d }}</div>

    <template v-for="p in timeslots" :key="`${gridKey}-${p.period}`">
      <div class="tt-period">
        <div class="tt-period-label">{{ p.label }}</div>
        <div class="tt-period-time">{{ p.start }}-{{ p.end }}</div>
        <div class="tt-period-hours">{{ rowHours(p) }}课时</div>
      </div>
      <div
        v-for="(d, di) in days"
        :key="`${gridKey}-${p.period}-${di}`"
        class="tt-cell"
        :class="{ 'drop-hover': dropKey === cellKeyOf(di, p) }"
        :style="{ gridColumn: di + 2 }"
        @click="emit('cell-click', week, dayOf(di), rowStart(p), rowEnd(p))"
        @dragover="onDragOver($event, di, p)"
        @dragleave="onDragLeave(di, p)"
        @drop="onDrop($event, di, p)"
      >
        <div
          v-for="c in cellOf(dayOf(di), p)"
          :key="c._locUid"
          class="tt-card"
          :class="{ current: isCurrent(c) }"
          :style="cellStyle(c)"
          :draggable="editable"
          @dragstart="onDragStart(c, $event)"
          @dragend="onDragEnd"
          @click.stop="onCardClick(week, dayOf(di), rowStart(p), rowEnd(p), c)"
        >
          <div v-if="isCurrent(c)" class="tt-card-badge">当前</div>
          <div class="tt-card-title">
            <span class="tt-card-name">{{ c.course_name }}</span>
            <span class="tt-card-code">{{ courseCode(c) }}</span>
            <el-tooltip v-if="c.is_merged" :content="mergedTip(c)" placement="top">
              <span class="tt-card-merged">合班</span>
            </el-tooltip>
          </div>
          <div class="tt-card-line2">
            <span class="tt-card-teacher">{{ c.teacher_names || '—' }}</span>
            <span v-if="weeksLabel(c)" class="tt-card-weeks">{{ weeksLabel(c) }}</span>
            <span
              v-if="hasLocation(c) && !c.id && editable && isCurrent(c)"
              class="tt-card-loc tt-card-loc-set"
              @click.stop="emit('loc-click', c)"
            >{{ locationRoom(c) }}</span>
            <span v-else-if="hasLocation(c)" class="tt-card-loc">{{ locationRoom(c) }}</span>
            <el-link
              v-else-if="editable && isCurrent(c)"
              type="warning"
              :underline="false"
              class="tt-card-loc-empty"
              @click.stop="emit('loc-click', c)"
            >暂未设置上课地点</el-link>
            <span v-else class="tt-card-loc tt-card-loc-none">暂未设置上课地点</span>
          </div>
          <div v-if="c._state === 'new'" class="tt-card-flag">新增</div>
        </div>
        <span v-if="!cellOf(dayOf(di), p).length" class="tt-cell-add">+</span>
      </div>
    </template>

    <div v-if="emptyText && !timeslots.length && !loading" class="tt-empty">{{ emptyText }}</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { taskColor } from '@/utils/taskColor'
import { draggingCard } from '@/utils/cardDrag'
import { courseCode, hasLocation, locationRoom, periodHours, scheduleCellKey } from '@/utils/schedule'
import { patternToWeeks } from '@/utils/weeks'

const props = defineProps({
  /** 集中班：该网格对应的周次；普通周课表为 null */
  week: { type: Number, default: null },
  days: { type: Array, default: () => [] },
  /** 星期列起始偏移：周末班只展示周六、周日时传 5 */
  dayOffset: { type: Number, default: 0 },
  timeslots: { type: Array, default: () => [] },
  /** 草稿：key = scheduleCellKey(week, day, period) -> 卡片数组 */
  draft: { type: Object, default: () => ({}) },
  /** 需要高亮的教学任务 id；null 表示未进入排课模式 */
  highlightTaskId: { type: Number, default: null },
  editable: { type: Boolean, default: true },
  loading: { type: Boolean, default: false },
  emptyText: { type: String, default: '' }
})
const emit = defineEmits(['cell-click', 'card-click', 'loc-click', 'card-drop'])

const gridKey = computed(() => (props.week == null ? 'range' : `w${props.week}`))
const gridStyle = computed(() => ({
  gridTemplateColumns: `110px repeat(${Math.max(props.days.length, 1)}, minmax(0, 1fr))`
}))

/** 显示列 -> 实际星期（周末班只留周六、周日时从 6 开始） */
function dayOf(di) {
  return di + 1 + Number(props.dayOffset || 0)
}

/** 显示行的实际节次范围 */
function rowStart(p) {
  return Number(p.periodStart ?? p.period)
}
function rowEnd(p) {
  return Number(p.periodEnd ?? p.period)
}
function rowHours(p) {
  return p.hours ?? periodHours(rowStart(p))
}

/** 拖动中的落点高亮格子的键 */
const dropKey = ref('')
/** 拖动结束后抑制一次 click，避免落点误触卡片点击 */
let suppressClick = false

function cellKeyOf(di, p) {
  return `${props.week}-${dayOf(di)}-${rowStart(p)}`
}

function onDragStart(card, ev) {
  if (!props.editable) return
  draggingCard.value = card
  suppressClick = true
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'move'
    // Firefox 需要写入数据才能发起拖动
    ev.dataTransfer.setData('text/plain', String(card._locUid || ''))
  }
}

function onDragEnd() {
  draggingCard.value = null
  dropKey.value = ''
  setTimeout(() => { suppressClick = false }, 0)
}

function onCardClick(week, day, start, end, card) {
  if (suppressClick) return
  emit('card-click', week, day, start, end, card)
}

function onDragOver(ev, di, p) {
  if (!props.editable || !draggingCard.value) return
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  dropKey.value = cellKeyOf(di, p)
}

function onDragLeave(di, p) {
  if (dropKey.value === cellKeyOf(di, p)) dropKey.value = ''
}

function onDrop(ev, di, p) {
  if (!props.editable || !draggingCard.value) return
  ev.preventDefault()
  const card = draggingCard.value
  draggingCard.value = null
  dropKey.value = ''
  // 保持连排长度：目标行起始节 + 原长度超出最大节次时前移起始节
  const span = Number(card.end_period ?? card.start_period) - Number(card.start_period)
  const maxPeriod = Math.max(...props.timeslots.map((t) => rowEnd(t)), 1)
  let start = rowStart(p)
  if (start + span > maxPeriod) start = Math.max(1, maxPeriod - span)
  emit('card-drop', props.week, dayOf(di), start, start + span, card)
}

/** 某格起始节落在该显示行范围内的卡片（连排只在起始行展示） */
function cellOf(day, p) {
  const out = []
  for (let n = rowStart(p); n <= rowEnd(p); n++) {
    const list = props.draft[scheduleCellKey(props.week, day, n)]
    if (list) out.push(...list.filter((item) => Number(item.start_period) === n))
  }
  return out
}

function isCurrent(item) {
  return item != null && props.highlightTaskId != null
    && Number(item.task_id) === Number(props.highlightTaskId)
}

/** 合班标签提示：列出该课程合开的全部班级 */
function mergedTip(c) {
  const names = (c.open_class_names || []).join('、')
  return names ? `合班课程，开课班级：${names}` : '合班课程（多个班级合开，时间地点同步）'
}

/**
 * 卡片周次文本：
 * - 集中班逐周网格（week 非空）不重复展示，网格标题已有周次；
 * - 已保存的排课直接用后端 weeks_text（如「第09-16周」）；
 * - 本次新点放的卡片只有位图，按后端同样式折算。
 */
function weeksLabel(c) {
  if (props.week != null) return ''
  if (c.weeks_text) return c.weeks_text
  const weeks = patternToWeeks(c.week_pattern)
  if (!weeks.length) return ''
  const segs = []
  for (const w of weeks) {
    if (segs.length && w === segs[segs.length - 1][1] + 1) segs[segs.length - 1][1] = w
    else segs.push([w, w])
  }
  const pad = (n) => String(n).padStart(2, '0')
  const parts = segs.map(([a, b]) => (a === b ? pad(a) : `${pad(a)}-${pad(b)}`))
  return `第${parts.join(', ')}周`
}

/** 每张卡片按教学任务稳定上色：不同课程不同底色，便于肉眼区分；
 *  当前正在放置的任务用更饱和底色 + 实色描边进一步凸显。 */
function cellStyle(item) {
  const c = taskColor(item.task_id)
  if (isCurrent(item)) {
    return {
      background: c.bgStrong,
      borderColor: c.solid,
      boxShadow: `0 0 0 1.5px ${c.solid}, 0 1px 4px rgba(0, 0, 0, 0.08)`
    }
  }
  return { background: c.bg, borderColor: c.solid }
}
</script>

<style scoped>
/* 网格布局：行 = 节次，列 = 星期 */
.tt-grid { display: grid; gap: 4px; }
.tt-corner, .tt-head {
  background: #f4f6fa; padding: 6px; text-align: center;
  font-size: 12px; font-weight: 600; border-radius: 4px;
}
.tt-period {
  background: #f4f6fa; padding: 4px 6px; border-radius: 4px;
  text-align: center; grid-column: 1;
}
.tt-period-label { font-size: 11px; font-weight: 600; }
.tt-period-time { font-size: 10px; color: var(--text-soft); }
.tt-period-hours { font-size: 10px; color: #16a34a; font-weight: 600; margin-top: 1px; }

.tt-cell {
  min-height: 60px; border: 1px dashed var(--border); border-radius: 4px;
  cursor: pointer; position: relative;
  display: flex; flex-direction: column; gap: 4px; padding: 3px;
}
.tt-cell:hover { border-color: var(--brand); background: var(--brand-soft); }
/* 拖动落点高亮：虚线变实线，提示可放置 */
.tt-cell.drop-hover { border-style: solid; border-color: var(--brand); background: var(--brand-soft); }
.tt-cell-add { color: #c0c4cc; font-size: 18px; }

.tt-card {
  width: 100%; border-radius: 6px; padding: 6px 8px;
  background: var(--brand-soft); /* 兜底底色，实际按课程由 cellStyle 内联 */
  border: 1px solid var(--el-color-primary-light-7); overflow: hidden;
  display: flex; flex-direction: column; gap: 4px;
}
.tt-card[draggable='true'] { cursor: grab; }
.tt-card[draggable='true']:active { cursor: grabbing; }
/* 当前正在排的教学任务：专属底色与描边（由 cellStyle 内联设置） */
.tt-card.current { position: relative; }
.tt-card-badge {
  position: absolute; top: 3px; right: 4px; font-size: 10px; line-height: 1;
  padding: 2px 5px; border-radius: 3px; color: #fff; background: #f59e0b; font-weight: 700;
}
/* 第一行：课程名 + 课程号-课序号 同行 */
.tt-card-title {
  display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
  font-size: 13px; font-weight: 600; line-height: 1.4; color: #1f2d3d;
}
.tt-card-code { font-size: 12px; font-weight: 500; color: var(--text-soft); white-space: nowrap; }
/* 合班标签：交大蓝浅底小 pill，提示该课程多班级合开、时间地点同步 */
.tt-card-merged {
  font-size: 10px; line-height: 1; font-weight: 700; white-space: nowrap;
  padding: 2px 5px; border-radius: 3px; cursor: default;
  color: var(--brand); background: var(--brand-soft); border: 1px solid var(--el-color-primary-light-7);
}
/* 第二行：教师 + 周次 + 房号 同行 */
.tt-card-line2 {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  font-size: 12px; line-height: 1.5; color: var(--text-soft);
}
.tt-card-weeks { color: #2563eb; white-space: nowrap; }
.tt-card-loc { font-weight: 600; color: #334155; white-space: nowrap; }
.tt-card-loc-none { font-weight: 400; color: var(--text-soft); }
.tt-card-loc-empty { font-size: 12px; align-self: flex-start; text-align: left; }
.tt-card-loc-set { cursor: pointer; text-decoration: underline dotted; }
.tt-card-flag { font-size: 11px; color: #16a34a; font-weight: 600; }

.tt-empty { grid-column: 1 / -1; padding: 30px 0; text-align: center; color: var(--text-soft); font-size: 13px; }
</style>
