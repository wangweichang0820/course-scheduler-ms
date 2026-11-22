<template>
  <div class="sem-slider">
    <el-button class="slide-btn" circle :icon="'ArrowLeft'" :disabled="!canSlideLeft"
      @click="slide(-1)" />
    <div ref="scrollRef" class="sem-chips" @scroll.passive="updateSlideState">
      <div v-for="s in semesters" :key="s.id" class="sem-chip"
        :class="{ active: s.code === activeCode, current: s.is_current }"
        :title="readonly ? '单击查看校历' : '单击查看校历，双击编辑学期'"
        @click="emit('select', s.code)" @dblclick="onDblClick(s)">
        <div class="chip-name">
          <span class="chip-title">{{ s.code }}</span>
          <el-tag v-if="s.is_current" size="small" type="primary" effect="dark">当前</el-tag>
          <!-- 双击编辑不可发现：管理员 hover 卡片时给出显式编辑入口 -->
          <button v-if="!readonly" class="chip-edit" title="编辑学期" aria-label="编辑学期"
            @click.stop="emit('edit', s)">
            <el-icon><Edit /></el-icon>
          </button>
        </div>
        <div class="chip-meta">
          {{ s.weeks }} 周 · {{ s.start_date || '未设开学日' }}{{ s.end_date ? ' ~ ' + s.end_date : '' }}
        </div>
      </div>
    </div>
    <el-button class="slide-btn" circle :icon="'ArrowRight'" :disabled="!canSlideRight"
      @click="slide(1)" />
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  /** 学期列表（按开学时间正序） */
  semesters: { type: Array, default: () => [] },
  /** 当前选中的学期标识 */
  activeCode: { type: String, default: '' },
  /** 只读模式（教师角色）：双击不进入学期编辑 */
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['select', 'edit'])

const scrollRef = ref(null)
const canSlideLeft = ref(false)
const canSlideRight = ref(false)

function onDblClick(s) {
  if (props.readonly) return
  emit('edit', s)
}

/** 一次滑动一页 */
function slide(step) {
  const el = scrollRef.value
  if (!el) return
  el.scrollBy({ left: step * el.clientWidth, behavior: 'smooth' })
}

function updateSlideState() {
  const el = scrollRef.value
  if (!el) return
  canSlideLeft.value = el.scrollLeft > 2
  canSlideRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}

/** 让当前选中的学期卡片滚动到可视区域 */
function scrollActiveIntoView() {
  nextTick(() => {
    const el = scrollRef.value
    if (!el) return
    el.querySelector('.sem-chip.active')?.scrollIntoView({
      behavior: 'smooth', block: 'nearest', inline: 'center'
    })
    updateSlideState()
  })
}

watch(() => props.semesters, () => { scrollActiveIntoView(); updateSlideState() }, { deep: false })
watch(() => props.activeCode, scrollActiveIntoView)

defineExpose({ scrollActiveIntoView })
</script>

<style scoped>
/* 学期滑窗：单行展示，左右箭头 + 横向滚动，内容整体居中 */
.sem-slider { display: flex; gap: 8px; align-items: stretch; justify-content: center; margin-bottom: 16px; }
.slide-btn { flex: none; }
.sem-chips {
  flex: 1; min-width: 0; display: flex; gap: 10px; align-items: stretch;
  /* 卡片不足一页时整体居中；超出时可正常横向滚动（safe 回退为左对齐） */
  justify-content: safe center;
  overflow-x: auto; scroll-behavior: smooth; padding-bottom: 2px;
  scrollbar-width: thin;
}
.sem-chips::-webkit-scrollbar { height: 6px; }
.sem-chips::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
.sem-chip {
  /* 一页固定展示 4 张卡片（扣除 3 个间距） */
  flex: 0 0 calc((100% - 30px) / 4); cursor: pointer; padding: 11px 14px 10px;
  border: 1px solid var(--border); border-radius: 10px; background: #fff;
  transition: border-color .15s, background-color .15s, box-shadow .15s;
  text-align: left;
}
.sem-chip:hover { border-color: var(--brand-light); background: var(--brand-softer); }
/* 正在进行中的学期：品牌蓝浅底；正在查看的学期：品牌蓝描边——两个语义都在蓝色系里分层 */
.sem-chip.current { border-color: var(--brand-light); background: var(--brand-soft); }
.sem-chip.current:hover { border-color: var(--brand); }
.sem-chip.active { border-color: var(--brand); background: #fff; box-shadow: inset 0 0 0 1px var(--brand); }
.chip-name {
  font-size: 15px; font-weight: 600; color: var(--text);
  display: flex; align-items: center; gap: 6px; line-height: 24px;
}
.sem-chip.active .chip-title { color: var(--brand); }
.chip-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* 编辑入口：hover 浮现，避免与选中点击冲突 */
.chip-edit {
  margin-left: auto; flex: none; width: 24px; height: 24px; padding: 0;
  border: none; border-radius: 6px; background: transparent; color: var(--text-soft);
  display: grid; place-items: center; cursor: pointer;
  opacity: 0; transition: opacity .15s, background-color .15s, color .15s;
}
.sem-chip:hover .chip-edit { opacity: 1; }
.chip-edit:hover { background: var(--brand-soft); color: var(--brand); }
.chip-meta {
  font-size: 12px; color: var(--text-soft); margin-top: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ---------- 移动端：一屏两张学期卡，手指横滑；箭头收起 ---------- */
@media (max-width: 768px) {
  .slide-btn { display: none; }
  .sem-slider { margin-bottom: 12px; }
  .sem-chip { flex: 0 0 calc((100% - 10px) / 2); min-width: 0; padding: 10px 12px 9px; }
  .chip-name { font-size: 14px; }
  .chip-meta { font-size: 11px; }
}
/* 触屏没有 hover：编辑入口常驻可见（仅管理员会渲染该按钮） */
@media (hover: none) {
  .chip-edit { opacity: 1; }
}
</style>
