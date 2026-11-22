<template>
  <div class="tt-legend">
    <span><i class="dot kept" />已保存</span>
    <span><i class="dot new" />本次新增</span>
    <span class="text-soft">· <slot /></span>
  </div>
</template>

<style scoped>
.tt-legend {
  display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
  margin-bottom: 10px; font-size: 12px; color: var(--text-soft);
}
.dot {
  display: inline-block; width: 9px; height: 9px; border-radius: 2px;
  margin-right: 4px; vertical-align: middle;
}
.dot.kept { background: var(--el-color-primary-light-8); }
.dot.new { background: #bbf7d0; }
</style>
