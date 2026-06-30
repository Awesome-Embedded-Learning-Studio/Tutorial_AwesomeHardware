// 单片机硬件版块侧边栏 —— 运行时扫描 tutorials/mcu 自动生成。
// 对齐 Tutorial_AwesomeModernCPP 的 scanDir 思路:章/节标题都从各自 md 的 frontmatter
// title(回退 h1)取,单一数据源——加节只需新建 chXX_N.md 并设好 title,侧边栏自动跟上,
// 概览页与本文件都无需手维护。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SidebarItem } from 'vitepress'

const MCU_DIR = join(import.meta.dirname, '../../../tutorials/mcu')

// 标题:优先 frontmatter title,回退 h1。
function titleOf(file: string): string {
  try {
    const c = readFileSync(join(MCU_DIR, file), 'utf-8')
    const fm = c.match(/^---[\s\S]*?^title:\s*['"]?(.+?)['"]?\s*$/m)
    if (fm) return fm[1]
    const h1 = c.match(/^#\s+(.+)$/m)
    if (h1) return h1[1].replace(/\{.*?\}/g, '').trim()
  } catch { /* ignore */ }
  return file
}

// 节:同一章的 chXX_N.md,title 从各自 frontmatter 取,按 N 排序,标题前自动加 "章.节" 编号。
function sectionsOf(chNum: number): { text: string; link: string }[] {
  const padded = String(chNum).padStart(2, '0')
  const re = new RegExp(`^ch${padded}_(\\d+)\\.md$`)
  let files: { n: number; f: string }[]
  try {
    files = readdirSync(MCU_DIR)
      .map(f => ({ f, m: f.match(re) }))
      .filter(x => x.m)
      .map(x => ({ f: x.f, n: parseInt(x.m![1]) }))
  } catch { return [] }
  return files
    .sort((a, b) => a.n - b.n)
    .map(({ n, f }) => ({
      text: `${chNum}.${n} ${titleOf(f)}`,
      link: `/mcu/ch${padded}_${n}`,
    }))
}

// 章:chXX.md(无下划线)。
function buildChapters(): SidebarItem[] {
  let chapters: string[]
  try {
    chapters = readdirSync(MCU_DIR)
      .filter(f => /^ch\d+\.md$/.test(f))
      .sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]))
  } catch { return [] }

  return chapters.map(ch => {
    const num = parseInt(ch.match(/\d+/)![0])
    const padded = String(num).padStart(2, '0')
    return {
      text: `第 ${num} 章 ${titleOf(ch)}`,
      collapsed: false,
      items: [
        { text: '章节概览', link: `/mcu/ch${padded}` },
        ...sectionsOf(num),
      ],
    }
  })
}

export const mcuSidebar: SidebarItem[] = [
  {
    text: '单片机硬件入门',
    collapsed: false,
    items: buildChapters(),
  },
]
