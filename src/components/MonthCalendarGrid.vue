<template>
  <div ref="calendarRef" v-loading="loading" class="month-grid">
    <!-- 图例：颜色语义不再依赖 hover title 才能看懂 -->
    <div class="legend">
      <span class="lg"><i class="dot dot-holiday" />法定假日</span>
      <span class="lg"><i class="dot dot-makeup" />调休上班日</span>
      <span class="lg"><i class="dot dot-weekend" />周末</span>
      <span class="lg"><i class="dot dot-outside" />学期外</span>
      <span class="lg"><i class="dot dot-today" />今天</span>
    </div>

    <div v-for="m in months" :key="`${m.year}-${m.month}`" class="month-card"
      :class="{ 'current-month': isCurrentMonth(m) }">
      <div class="month-head">
        <span class="month-title">{{ m.label }}</span>
        <!-- 节假日维护统一在页面右上角入口，月份卡片只留假期数量 -->
        <span v-if="m.holiday_count" class="holiday-count">{{ m.holiday_count }} 天假期</span>
      </div>
      <div class="week-head">
        <span class="week-col" />
        <span v-for="w in WEEK_LABELS" :key="w">{{ w }}</span>
      </div>
      <div class="day-grid">
        <!-- 必须按行显式渲染：每行 = 行首周次标 + 该行 7 个日期格（空位补 null）。
             若把周次标和日期各自平铺成两个 v-for，CSS Grid 会按顺序填格，
             所有周次标挤进第一行、整月日期的星期对位全乱。 -->
        <template v-for="(row, r) in monthRows(m)" :key="`r${m.year}-${m.month}-${r}`">
          <span class="week-col" :class="{ filled: row.label }">{{ row.label }}</span>
          <template v-for="(cell, c) in row.cells" :key="cell ? cell.day : `e${r}-${c}`">
            <span v-if="!cell" class="day-cell empty" />
            <div v-else class="day-cell" :class="[cellClass(cell), { today: cell.is_today }]"
              :title="dayTitle(cell)">
              <span class="day-num">{{ dayNum(cell) }}</span>
              <span v-if="cell.name" class="day-name">{{ cell.name }}</span>
              <span v-else-if="cell.festival" class="day-name festival">{{ cell.festival }}</span>
            </div>
          </template>
        </template>
      </div>
    </div>
    <div v-if="!months.length && !loading" class="empty-tip">
      {{ readonly
        ? '该学期未设置开学日期，无法生成校历。请管理员在「学年学期与校历」中补充开学日期。'
        : '该学期未设置开学日期，无法生成校历。请双击上方学期卡片进行编辑，补充开学日期。' }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

defineProps({
  /** 后端 month_calendar 的月份列表 */
  months: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  /** 只读模式（教师角色）：空状态文案按只读口径提示 */
  readonly: { type: Boolean, default: false }
})

const calendarRef = ref(null)

/** 是否当前月（含今天），用于高亮与「回到本月」定位 */
function isCurrentMonth(m) {
  return m.days.some((d) => d.is_today)
}

function dayNum(d) {
  return d.day ? Number(d.day.slice(8)) : ''
}

function cellClass(d) {
  if (!d.in_term) return ['outside']
  if (d.kind === '法定假日') return ['holiday']
  if (d.kind === '调休上班日') return ['makeup']
  if (d.weekday >= 5) return ['weekend']
  return ['workday']
}

function dayTitle(d) {
  const parts = [d.day]
  // 顺延区间内的日期 week 为 0（不计教学周次），标题里不再显示「第 0 周」
  if (d.in_term && d.week) parts.push(`第 ${d.week} 周`)
  else if (!d.in_term) parts.push('不在本学期内')
  parts.push(d.kind)
  if (d.name) parts.push(d.name)
  if (d.festival) parts.push(d.festival)
  return parts.join(' · ')
}

/** 月份首日之前补空格子，使日期落在正确的星期列 */
function padding(m) {
  return m.days[0] ? m.days[0].weekday : 0
}

/**
 * 把一个月切成若干行：每行 = 行首周次标 + 7 个日期格（无日期的位置为 null）。
 * 周次标取该行第一个「学期内」日期的周号（真实校历表的行首样式）；
 * 整行都在学期外（月初月末）时留空。
 */
function monthRows(m) {
  const p = padding(m)
  const rows = []
  for (let r = 0; r * 7 < p + m.days.length; r++) {
    let label = ''
    for (let i = r * 7 - p; i < r * 7 - p + 7; i++) {
      const d = m.days[i]
      if (d && d.in_term && d.week) {
        label = `第${d.week}周`
        break
      }
    }
    const cells = []
    for (let c = 0; c < 7; c++) {
      const i = r * 7 - p + c
      cells.push(i >= 0 && i < m.days.length ? m.days[i] : null)
    }
    rows.push({ label, cells })
  }
  return rows
}

function gotoCurrentMonth() {
  const el = calendarRef.value?.querySelector('.month-card.current-month')
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}

defineExpose({ gotoCurrentMonth })
</script>

<style scoped>
/* 月份平铺：固定等宽卡片、整行居中 */
.month-grid {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 14px; margin-bottom: 4px; min-height: 200px;
}

/* ---------- 图例：单独占满一行放在月份卡上方右侧 ---------- */
.legend {
  flex-basis: 100%; display: flex; justify-content: flex-end; align-items: center;
  gap: 16px; padding: 2px 6px 6px; font-size: 12px; color: var(--text-soft);
}
.lg { display: inline-flex; align-items: center; gap: 6px; line-height: 1; }
.dot { width: 12px; height: 12px; border-radius: 3px; flex: none; }
.dot-holiday { background: #fee2e2; box-shadow: inset 0 0 0 1px #fca5a5; }
.dot-makeup { background: #fef3c7; box-shadow: inset 0 0 0 1px #fcd34d; }
.dot-weekend { background: #eef2f7; }
.dot-outside { background: #fff; box-shadow: inset 0 0 0 1px var(--border); }
.dot-today { background: var(--brand); }

/* ---------- 月份卡片 ---------- */
.month-card {
  flex: 0 0 292px; background: #fff; border: 1px solid var(--border);
  border-radius: 10px; padding: 12px 14px 14px;
}
/* 当前月：品牌色描边突出 */
.month-card.current-month { border-color: var(--brand); box-shadow: 0 0 0 1px var(--brand); }
.month-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.month-title { font-weight: 700; font-size: 14.5px; color: var(--text); }
.current-month .month-title { color: var(--brand); }
.holiday-count { font-size: 12px; color: #b91c1c; background: #fef2f2; border-radius: 10px; padding: 2px 8px; }

/* 星期表头 + 日期网格：首列是周次 */
.week-head, .day-grid {
  display: grid; grid-template-columns: 30px repeat(7, 1fr); gap: 3px;
}
.week-head { margin-bottom: 4px; }
.week-head span:not(.week-col) { text-align: center; font-size: 11px; color: var(--text-soft); }

/* 行首周次标号（真实校历的行首样式） */
.week-col {
  display: flex; align-items: center; justify-content: center;
  font-size: 10.5px; color: #c3cbd6; line-height: 1.2;
}
.week-col.filled { color: var(--brand-light); font-weight: 600; background: var(--brand-softer); border-radius: 6px; }

.day-cell {
  min-height: 36px; border-radius: 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  padding: 2px; cursor: default;
}
.day-cell.empty { background: transparent; }
/* 无边框浅底色块：法定假日 / 调休 / 周末用底色区分，学期外整体淡化 */
.day-cell.weekend { background: #eef2f7; }
.day-cell.holiday { background: #fee2e2; }
.day-cell.makeup { background: #fef3c7; }
.day-cell.outside { opacity: 0.38; }
.day-cell.today { background: var(--brand); }
.day-num { font-size: 13px; font-weight: 600; line-height: 1.15; color: var(--text); }
.day-cell.weekend .day-num { color: #7c8698; }
.day-cell.holiday .day-num { color: #dc2626; }
.day-cell.makeup .day-num { color: #b45309; }
.day-cell.today .day-num { color: #fff; }
.day-name {
  font-size: 10px; line-height: 1.15; text-align: center; max-width: 100%;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #b91c1c;
}
.day-cell.makeup .day-name { color: #92400e; }
.day-cell.today .day-name { color: rgba(255, 255, 255, 0.92); }
/* 中国传统节日：橙色区分于法定假日 */
.day-name.festival { color: #c2410c; }

.empty-tip { grid-column: 1 / -1; text-align: center; color: var(--text-soft); font-size: 13px; padding: 40px 0; }

/* ---------- 移动端：月份卡一行一张占满宽，图例换行靠左 ---------- */
@media (max-width: 768px) {
  .month-grid { gap: 10px; }
  .legend { justify-content: flex-start; flex-wrap: wrap; gap: 8px 12px; padding: 2px 2px 6px; }
  .month-card { flex: 1 1 100%; max-width: 360px; padding: 10px 10px 12px; }
  .week-head, .day-grid { grid-template-columns: 26px repeat(7, 1fr); gap: 2px; }
  .day-cell { min-height: 34px; }
  .week-col { font-size: 9.5px; }
}
</style>
