<template>
  <nav class="side-nav">
    <el-menu :default-active="route.name" router class="side-menu" @select="onSelect">
      <el-menu-item v-for="r in menuRoutes" :key="r.name" :index="r.name" :route="r.path ? { name: r.name } : { path: '/' }">
        <el-icon><component :is="r.meta.icon" /></el-icon>
        <span>{{ r.meta.title }}</span>
      </el-menu-item>
    </el-menu>
  </nav>
</template>

<script setup>
/**
 * 侧栏导航：桌面端直接放进 .app-side，窄屏端放进抽屉里，两处复用同一份菜单。
 * 移动端选完菜单需要收起抽屉，通过 navigate 事件通知父组件。
 */
import { useRoute, useRouter } from 'vue-router'

const emit = defineEmits(['navigate'])

const route = useRoute()
const router = useRouter()

const menuRoutes = router.getRoutes().filter((r) => r.meta && r.meta.title)

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
</style>
