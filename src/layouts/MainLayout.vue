<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark">MEM</span>
        <div class="brand-text">
          <div class="brand-title">北交大 · 研究生排课工作台</div>
          <div class="brand-sub">Qoder 高校创造力大赛 · StudyHack 参赛版</div>
        </div>
      </div>
      <div class="header-tools" v-if="store.ready">
        <el-select v-model="store.currentSemester" size="small" style="width: 160px">
          <el-option v-for="s in store.semesterOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-select v-model="store.currentClassForm" size="small" style="width: 140px">
          <el-option v-for="f in store.classFormOptions" :key="f.value" :label="f.label" :value="f.value" />
        </el-select>
        <el-button size="small" type="warning" plain @click="onReset">重置演示数据</el-button>
      </div>
    </header>

    <aside class="app-side">
      <el-menu :default-active="route.name" router class="side-menu">
        <el-menu-item v-for="r in menuRoutes" :key="r.name" :index="r.name" :route="r.path ? { name: r.name } : { path: '/' }">
          <el-icon><component :is="r.meta.icon" /></el-icon>
          <span>{{ r.meta.title }}</span>
        </el-menu-item>
      </el-menu>
      <div class="side-footer">
        <div>IndexedDB · 无后端</div>
        <div>{{ statText }}</div>
      </div>
    </aside>

    <main class="app-main">
      <router-view v-if="store.ready" />
      <div v-else class="loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在初始化本地数据库...</span>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useDataStore } from '@/stores/data'

const store = useDataStore()
const route = useRoute()
const router = useRouter()

const menuRoutes = router.getRoutes().filter((r) => r.meta && r.meta.title)

const statText = computed(() => {
  if (!store.ready) return ''
  return `${store.teachingTasks.length} 任务 · ${store.scheduleSlots.length} 排课`
})

async function onReset() {
  try {
    await ElMessageBox.confirm(
      '将清空 IndexedDB 中所有本地数据并重新播种 demo，是否继续？',
      '重置演示数据',
      { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' }
    )
    await store.resetDemo()
    ElMessage.success('已恢复到出厂 demo 数据')
  } catch (e) { /* 用户取消 */ }
}
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 210px 1fr;
  grid-template-rows: 60px 1fr;
  grid-template-areas: 'header header' 'side main';
  height: 100vh;
  background: var(--bg, #f5f7fa);
}
.app-header {
  grid-area: header;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; background: linear-gradient(90deg, #003690 0%, #1c5cbf 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 54, 144, 0.15);
  z-index: 10;
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand-mark {
  width: 36px; height: 36px; border-radius: 6px;
  background: #fff; color: #003690;
  font-weight: 800; display: flex; align-items: center; justify-content: center;
  letter-spacing: 1px; font-size: 12px;
}
.brand-title { font-size: 15px; font-weight: 600; letter-spacing: 0.5px; }
.brand-sub { font-size: 11px; opacity: 0.75; margin-top: 2px; }
.header-tools { display: flex; align-items: center; gap: 10px; }
.header-tools :deep(.el-input__wrapper) {
  background: rgba(255,255,255,0.14) !important;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.25) inset !important;
}
.header-tools :deep(.el-select__placeholder),
.header-tools :deep(.el-input__inner) { color: #fff !important; }
.app-side {
  grid-area: side;
  background: #fff;
  border-right: 1px solid var(--border, #e5e9f0);
  display: flex; flex-direction: column; justify-content: space-between;
}
.side-menu { border-right: none !important; }
.side-footer { padding: 12px 16px; font-size: 11px; color: var(--text-soft, #8a94a6); border-top: 1px dashed #eef1f6; }
.app-main { grid-area: main; overflow: auto; padding: 16px 20px 24px; }
.loading { display: flex; align-items: center; gap: 8px; padding: 40px; color: var(--text-soft); }
</style>
