import { defineConfig } from 'vitepress'
import mathjax3 from 'markdown-it-mathjax3'
import { viteHardwareEscape } from './plugins/vite-escape-hardware'
import { fencePlugin } from './plugins/fence-plugin'
import { mathjaxSafe } from './plugins/mathjax-safe'
import { sidebar } from './config/sidebar'

export default defineConfig({
  lang: 'zh-CN',
  // 部署到 GitHub Pages 项目页 Charliechen114514.github.io/Tutorial_AwesomeHardware/
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
      { text: '关于本站', link: '/about' },
    ],

    sidebar: {
      '/power-electronics/': sidebar,
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

    socialLinks: [{ icon: 'github', link: 'https://github.com/' }],

    footer: {
      message: '面向嵌入式学习者的硬件学习笔记',
      copyright:
        '本站内容为结合个人理解整理的学习笔记，不涉及对原书的复制或翻译。',
    },
  },
})
