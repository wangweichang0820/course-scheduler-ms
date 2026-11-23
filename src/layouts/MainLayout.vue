<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <el-button v-if="isMobile" class="nav-toggle" text @click="navOpen = true" aria-label="打开导航菜单">
          <el-icon :size="20"><Menu /></el-icon>
        </el-button>
        <span class="brand-mark">MEM</span>
        <div class="brand-text">
          <div class="brand-title">研究生排课工作台</div>
        </div>
      </div>
      <div class="header-tools" v-if="store.ready">
        <el-select v-model="store.currentSemester" size="small" class="sel-semester">
          <el-option v-for="s in store.semesterOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-select v-model="store.currentClassForm" size="small" class="sel-form">
          <el-option v-for="f in store.classFormOptions" :key="f.value" :label="f.label" :value="f.value" />
        </el-select>
        <el-button size="small" type="warning" plain @click="onReset">重置演示数据</el-button>
      </div>
    </header>

    <!-- 宽屏：侧标常驻；窄屏：收进抽屉，避免 210px 永久占位挤掉内容区 -->
    <aside v-if="!isMobile" class="app-side">
      <SideNav />
    </aside>
    <el-drawer v-else v-model="navOpen" direction="ltr" size="232px" :with-header="false" class="nav-drawer">
      <SideNav @navigate="navOpen = false" />
    </el-drawer>

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
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useDataStore } from '@/stores/data'
import { useIsMobile } from '@/composables/useIsMobile'
import SideNav from './SideNav.vue'

const store = useDataStore()

const isMobile = useIsMobile()
const navOpen = ref(false)

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
  /* main.css 里全局写了 height: 60px，这里显式接管，否则窄屏换行后第二行会顶出盒子压在正文上 */
  height: 60px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; background: linear-gradient(90deg, #003690 0%, #1c5cbf 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 54, 144, 0.15);
  z-index: 10;
}
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.nav-toggle { color: #fff !important; margin-right: -4px; padding: 6px; }
.brand-mark {
  width: 36px; height: 36px; border-radius: 6px;
  background: #fff; color: #003690;
  font-weight: 800; display: flex; align-items: center; justify-content: center;
  letter-spacing: 1px; font-size: 12px;
}
.brand-title { font-size: 15px; font-weight: 600; letter-spacing: 0.5px; }
.header-tools { display: flex; align-items: center; gap: 10px; }
.sel-semester { width: 160px; }
.sel-form { width: 140px; }
/* Element Plus 2.4+ 起 el-select 不再包 el-input，触发器改叫 .el-select__wrapper；
   两个类名都要写，否则页头下拉会退回白底，配上白字就完全看不见选中值 */
.header-tools :deep(.el-input__wrapper),
.header-tools :deep(.el-select__wrapper) {
  background: rgba(255,255,255,0.14) !important;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.25) inset !important;
}
.header-tools :deep(.el-select__placeholder),
.header-tools :deep(.el-input__inner) { color: #fff !important; }
.header-tools :deep(.el-select__caret) { color: rgba(255, 255, 255, 0.85) !important; }
.app-side {
  grid-area: side;
  background: #fff;
  border-right: 1px solid var(--border, #e5e9f0);
  overflow: hidden;
}
.app-main { grid-area: main; overflow: auto; padding: 16px 20px 24px; }
.loading { display: flex; align-items: center; gap: 8px; padding: 40px; color: var(--text-soft); }

/* ---------- 窄屏（≤768px）：页头换行，侧标改抽屉 ----------
   页头不再固定 60px，工具区掉到第二行横向铺满；
   下拉改弹性宽度，不再把右侧按钮挤出可视区。
   注：本组件 scoped 规则优先级高于 main.css 里的同名全局规则，
   所以 .app-main 的窄屏内边距必须在这里覆盖，不能指望全局断点 */
@media (max-width: 768px) {
  .app-shell { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .app-header { flex-wrap: wrap; align-items: center; row-gap: 6px; padding: 8px 12px; height: auto; min-height: 60px; }
  .brand { flex: 1 1 auto; gap: 8px; }
  .brand-mark { width: 30px; height: 30px; border-radius: 5px; }
  .brand-title { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .header-tools { width: 100%; gap: 8px; }
  .sel-semester, .sel-form { flex: 1 1 120px; min-width: 0; width: auto; }
  .app-main { padding: 10px; }
}
</style>

<style>
/* 抽屉会被 teleport 到 body，scoped 规则穿不进去，这里重置默认内边距让菜单贴边 */
.nav-drawer .el-drawer__body { padding: 0; overflow: hidden; }
</style>
