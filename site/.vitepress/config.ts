import { defineConfig } from 'vitepress'
import { execFileSync } from 'node:child_process'
import mathjax3 from 'markdown-it-mathjax3'
import { viteHardwareEscape } from './plugins/vite-escape-hardware'
import { fencePlugin } from './plugins/fence-plugin'
import { mathjaxSafe } from './plugins/mathjax-safe'
import { sidebar } from './config/sidebar'
import { mcuSidebar } from './config/mcu-sidebar'
import { getBuildInfo } from './config/build-info'

// 模块加载时算一次（同一构建进程内一致）；非 git 仓库 / 无 tag 时回退 dev。
const buildInfo = getBuildInfo()

export default defineConfig({
  lang: 'zh-CN',
  // 部署到 GitHub Pages 项目页 awesome-embedded-learning-studio.github.io/Tutorial_AwesomeHardware/
  base: '/Tutorial_AwesomeHardware/',
  // 源文件在根 tutorials/（参考 Tutorial_AwesomeQt 的 srcDir:'../tutorial' 模式：
  // 内容目录在根，site/ 只放 .vitepress 配置，根无散落 md）
  srcDir: '../tutorials',
  title: 'AwesomeHardware',
  titleTemplate: '硬件学习笔记',
  description:
    '面向嵌入式学习者的硬件学习笔记站——电路基础、模电数电、PCB、传感器、接口协议与板级调试',
  lastUpdated: true,
  cleanUrls: true,

  vite: {
    plugins: [viteHardwareEscape()],
  },

  // mathjax 渲染产物是 <mjx-container>...</mjx-container>（含连字符）。Vue 模板编译器默认会把
  // 不认识的标签当「未注册组件」，SSR 时渲染成空 <!---->，公式就消失了。把含 `-` / `.` 的标签
  // 声明为自定义元素，Vue 才会原样保留 mathjax 输出（与姊妹项目 Tutorial_AwesomeModernCPP 一致）。
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.includes('-') || tag.includes('.'),
      },
    },
  },

  head: [
    ['meta', { name: 'theme-color', content: '#516be8' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    // 首屏立即应用字号档（从 localStorage 读，默认 normal），防刷新闪烁。
    // 与 FontSizeSwitcher.vue 的 STORAGE_KEY（'vp-font-size'）保持一致。
    [
      'script',
      {},
      `(function(){try{var s=localStorage.getItem('vp-font-size')||'normal';if(s!=='xxsmall'&&s!=='small'&&s!=='normal'&&s!=='large'&&s!=='xxlarge'){s='normal';}document.documentElement.dataset.fontSize=s;}catch(e){}})()`,
    ],
    // 首屏立即应用侧栏宽度（左导航 + 右大纲），防刷新闪烁。key 与 ResizableSidebar.vue 一致。
    [
      'script',
      {},
      `(function(){try{var w=parseInt(localStorage.getItem('vp-sidebar-width'));if(!w||w<200||w>480){w=272;}document.documentElement.style.setProperty('--vp-sidebar-width',w+'px');var a=parseInt(localStorage.getItem('vp-aside-width'));if(!a||a<180||a>360){a=256;}document.documentElement.style.setProperty('--vp-aside-width',a+'px');}catch(e){}})()`,
    ],
  ],

  markdown: {
    config(md) {
      // 公式：mathjax3 渲染，mathjaxSafe 给坏语法兜底（渲染失败降级为原文而非崩 build）。
      md.use(mathjax3)
      mathjaxSafe(md)
      // ```math → 交 mathjax；```spice → 纯文本标注（绕开 Shiki 的语言未加载警告）。
      md.use(fencePlugin)
    },
  },

  themeConfig: {
    siteTitle: 'AwesomeHardware · 硬件学习笔记',

    nav: [
      { text: '电源与功率变换', link: '/power-electronics/ch01' },
      { text: '单片机硬件', link: '/mcu/' },
      { text: '关于本站', link: '/about' },
    ],

    sidebar: {
      '/power-electronics/': sidebar,
      '/mcu/': mcuSidebar,
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索笔记', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '找不到结果',
            resetButtonTitle: '清除查询',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },

    outline: { label: '本页导航', level: [2, 3] },

    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdatedText: '最后更新',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Awesome-Embedded-Learning-Studio/Tutorial_AwesomeHardware' },
    ],

    editLink: {
      pattern:
        'https://github.com/Awesome-Embedded-Learning-Studio/Tutorial_AwesomeHardware/edit/main/tutorials/:path',
      text: '在 GitHub 上编辑此页',
    },

    footer: {
      message: `${buildInfo.version} · ${buildInfo.sha} · ${buildInfo.date}`,
      copyright: 'Copyright 2025-2026 AwesomeHardware · 结合个人理解整理的学习笔记',
    },
  },

  // VitePress 默认 lastUpdated 用 path.relative(root, file) 读 git;本站 srcDir 在 root 外
  // (../tutorials),得到 ../tutorials/... 路径,git log 拒绝(root 外相对路径),文档页底部
  // 「最后更新」不显示(issue #3)。这里用相对 cwd(root)的正确路径 tutorials/... 手动读,
  // 直接写入 pageData.lastUpdated(毫秒,顶层字段),覆盖失败的自动读取,让 VitePress 正常渲染。
  async transformPageData(pageData: { relativePath: string; lastUpdated?: number }) {
    const rel = pageData.relativePath // 相对 srcDir,如 mcu/ch01_1.md
    if (!rel) return
    try {
      const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', `tutorials/${rel}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (out) pageData.lastUpdated = parseInt(out, 10) * 1000
    } catch {
      // 非 git 环境(如本地无 git)→ 静默,不阻塞 build
    }
  },
})
