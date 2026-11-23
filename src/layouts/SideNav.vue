<template>
  <nav class="side-nav">
    <el-menu :default-active="route.name" router class="side-menu" @select="onSelect">
      <el-menu-item v-for="r in menuRoutes" :key="r.name" :index="r.name" :route="r.path ? { name: r.name } : { path: '/' }">
        <el-icon><component :is="r.meta.icon" /></el-icon>
        <span>{{ r.meta.title }}</span>
      </el-menu-item>
    </el-menu>
    <div class="side-footer">
      <div>IndexedDB · 无后端</div>
      <div>{{ statText }}</div>
    </div>
  </nav>
</template>

<script setup>
/**
 * 侧栏导航：桌面端直接放进 .app-side，窄屏端放进抽屉里，两处复用同一份菜单。
 * 移动端选完菜单需要收起抽屉，通过 navigate 事件通知父组件。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'

const emit = defineEmits(['navigate'])

const store = useDataStore()
const route = useRoute()
const router = useRouter()

const menuRoutes = router.getRoutes().filter((r) => r.meta && r.meta.title)

const statText = computed(() => {
  if (!store.ready) return ''
  return `${store.teachingTasks.length} 任务 · ${store.scheduleSlots.length} 排课`
})

function onSelect() {
  emit('navigate')
}
</script>

<style scoped>
.side-nav {
  display: flex; flex-direction: column; justify-content: space-between;
  height: 100%; background: #fff;
}
.side-menu { border-right: none !important; flex: 1; overflow: auto; }
.side-footer { padding: 12px 16px; font-size: 11px; color: var(--text-soft, #8a94a6); border-top: 1px dashed #eef1f6; }
</style>
