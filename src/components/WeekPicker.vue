<template>
  <div class="week-picker">
    <div class="week-actions">
      <template v-if="!allowedWeeks">
        <el-button link type="primary" @click="setWeeks(1, 16)">第1-16周</el-button>
        <el-button link type="primary" @click="setWeeks(1, 8)">第1-8周</el-button>
        <el-button link type="primary" @click="setWeeks(9, 16)">第9-16周</el-button>
      </template>
      <el-button link type="primary" @click="pickAllWeeks">全选</el-button>
      <el-button link type="info" @click="clearWeeks">清空</el-button>
      <span class="week-sum">{{ summary }}</span>
    </div>
    <el-checkbox-group v-model="selection" class="week-grid" @change="emitPattern">
      <el-checkbox v-for="w in WEEK_NUMBERS" :key="w" :value="w" :label="w" />
    </el-checkbox-group>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { patternToWeeks, weeksToPattern, weeksToText } from '@/utils/weeks'

const props = defineProps({
  /** 周次位图串，第 i 位为 '1' 表示第 i 周上课 */
  modelValue: { type: String, default: '' },
  /** 学期总周数（位图长度上限） */
  total: { type: Number, default: 24 },
  /** 限定可勾选的周次（如集中班只允许排课单指定周次）；null 表示不限 */
  allowedWeeks: { type: Array, default: null }
})
const emit = defineEmits(['update:modelValue'])

/** 周次上限：与后端 week_pattern 位图长度一致；有 allowedWeeks 时只列允许周次 */
const WEEK_NUMBERS = computed(() => {
  if (props.allowedWeeks) {
    return [...new Set(props.allowedWeeks.map(Number))]
      .filter((w) => w >= 1 && w <= props.total)
      .sort((a, b) => a - b)
  }
  return Array.from({ length: props.total }, (_, i) => i + 1)
})

const selection = ref(patternToWeeks(props.modelValue))

watch(() => props.modelValue, (v) => { selection.value = patternToWeeks(v) })
// 学期总周数 / 允许周次变化（如切换学期）时同步可勾选范围
watch([() => props.total, () => props.allowedWeeks], () => {
  selection.value = patternToWeeks(props.modelValue).filter((w) => WEEK_NUMBERS.value.includes(w))
})

function emitPattern() {
  emit('update:modelValue', weeksToPattern(selection.value, props.total))
}

function setWeeks(from, to) {
  selection.value = WEEK_NUMBERS.value.filter((w) => w >= from && w <= to)
  emitPattern()
}

function pickAllWeeks() {
  selection.value = [...WEEK_NUMBERS.value]
  emitPattern()
}

function clearWeeks() {
  selection.value = []
  emitPattern()
}

/** 已选周次的可读摘要：连续周次合并为区间 */
const summary = computed(() =>
  weeksToText(selection.value, { prefix: '第', empty: '未选择' })
)
</script>

<style scoped>
.week-picker { width: 100%; }
.week-actions {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px;
}
.week-sum { font-size: 12px; color: var(--text-soft); margin-left: 4px; }
.week-grid {
  display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 2px 4px;
  border: 1px solid var(--border); border-radius: 6px; padding: 8px;
}
.week-grid :deep(.el-checkbox) {
  margin-right: 0; height: 26px;
}
.week-grid :deep(.el-checkbox__label) { font-size: 12px; padding-left: 4px; }
@media (max-width: 900px) {
  .week-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
}
</style>
