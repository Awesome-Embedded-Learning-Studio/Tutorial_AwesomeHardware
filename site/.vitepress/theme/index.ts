import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import FontSizeSwitcher from './components/FontSizeSwitcher.vue'
import ResizableSidebar from './components/ResizableSidebar.vue'
import './style.css'
import './mathjax-svg.css'

// 对齐 Tutorial_AwesomeModernCPP 的体验组件：
// - ResizableSidebar：注入 layout-top，给左导航/右大纲栏加可拖拽手柄（宽度持久化）。
// - FontSizeSwitcher：注入顶栏 nav-bar-content-after，A-/A+ 五档字号（zoom 整页缩放）。
export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-top': () => h(ResizableSidebar),
      'nav-bar-content-after': () => h(FontSizeSwitcher),
      'nav-screen-content-after': () => h(FontSizeSwitcher),
    })
  },
} satisfies Theme
