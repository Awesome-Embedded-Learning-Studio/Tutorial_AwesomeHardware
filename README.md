# AwesomeHardware

> 面向嵌入式学习者的硬件学习笔记站——把抽象概念砸进脑子，而不是把公式塞满屏幕。

🌐 **在线站点**：https://awesome-embedded-learning-studio.github.io/Tutorial_AwesomeHardware/
![Deploy](https://github.com/Awesome-Embedded-Learning-Studio/Tutorial_AwesomeHardware/actions/workflows/deploy.yml/badge.svg)

## 这是什么

一个"补课型"技术博主整理的硬件学习笔记站。这里**不是教材搬运工**，而是把补短板时学懂的东西，用**重新理解后的话**重新讲一遍：大量原创比喻、踩坑直觉、"为什么这么设计"的来龙去脉。

## 内容

| 板块 | 状态 | 说明 |
|------|:----:|------|
| ⚡ 电源与功率变换 | ✅ | 稳态分析、开关实现、建模、磁元件、闭环控制、谐波、整流、谐振与软开关（23 章） |
| 🔌 电路基础 | 🚧 | 规划中 |
| 📈 模拟电子 | 🚧 | 规划中 |
| 🔢 数字电子 | 🚧 | 规划中 |
| 🟩 PCB 入门 | 🚧 | 规划中 |
| 🌡️ 传感器 | 🚧 | 规划中 |
| 🔁 接口协议 | 🚧 | 规划中 |
| 🛠️ 板级调试 | 🚧 | 规划中 |

## 技术栈

- [VitePress](https://vitepress.dev) 1.6 · [Vue 3](https://vuejs.org)
- [markdown-it-mathjax3](https://www.npmjs.com/package/markdown-it-mathjax3) + [MathJax](https://www.mathjax.org) 渲染 LaTeX 公式
- pnpm 包管理

## 目录结构

```
.
├── site/                    # VitePress 站点（仅配置，不放内容）
│   └── .vitepress/
│       ├── config.ts        # 站点配置
│       ├── config/sidebar.ts# 侧边栏（自动生成）
│       ├── plugins/         # 转义/围栏/mathjax 容错插件
│       ├── theme/           # 主题 + mathjax SVG 样式
│       └── public/          # favicon 等静态资源
├── tutorials/               # 内容总库（srcDir 指向这里）
│   ├── index.md             # 首页
│   ├── about.md             # 关于
│   └── power-electronics/   # 电力电子板块（184 篇）
├── scripts/
│   ├── build.ts             # 分段构建（规避 mathjax 内存泄漏）
│   └── gen-sidebar.sh       # 侧边栏生成脚本
├── .github/workflows/       # GitHub Pages 自动部署
└── package.json
```

## 本地开发

```bash
pnpm install
pnpm dev          # 启动开发服务器（热更新）
```

## 构建与预览

```bash
pnpm build        # 分段构建（生产）→ site/.vitepress/dist
pnpm build:single # 单进程构建（小规模调试用）
pnpm preview      # 预览构建产物
```

> `pnpm build` 采用**分段构建**：MathJax 存在不可消除的公式级内存泄漏，单进程构建上万公式会 OOM，所以按章节分组各自独立子进程再合并 dist 与搜索索引。

## 侧边栏

侧边栏是**自动生成**的（`site/.vitepress/config/sidebar.ts`），节标题取自各章目录页 `chXX.md` 的 `[N.M 标题](./chXX_N.md)` 链接文本。内容增删章节后一键重生：

```bash
bash scripts/gen-sidebar.sh
```

## 部署

推送到 `main` 分支即自动触发 GitHub Actions 构建并部署到 GitHub Pages。仓库需在 **Settings → Pages → Source** 选「GitHub Actions」。

## 致谢

感谢提供读书笔记的同学。
