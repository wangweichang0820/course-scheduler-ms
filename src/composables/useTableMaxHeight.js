/**
 * 表格可视高度：让 el-table 的 max-height 跟随视口，而不是写死某个数字。
 * 写死的后果是高分屏上表格提前截断、内部再滚一次，而页面下方还空着一大片。
 * 多个表格共享同一个 resize 监听，最后一个使用者卸载时自动解绑。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'

const HAS_WIN = typeof window !== 'undefined'
const viewportH = ref(HAS_WIN ? window.innerHeight : 900)
const onResize = () => { viewportH.value = window.innerHeight }
let users = 0

/**
 * @param offset 视口高度里被页头、工具条、内边距等占掉的部分
 * @param min    矮屏上的保底表高，避免算出只剩一两行的高度
 */
export function useTableMaxHeight(offset = 300, min = 300) {
  onMounted(() => { if (users++ === 0 && HAS_WIN) window.addEventListener('resize', onResize) })
  onUnmounted(() => { if (--users === 0 && HAS_WIN) window.removeEventListener('resize', onResize) })
  return computed(() => Math.max(min, viewportH.value - offset))
}
