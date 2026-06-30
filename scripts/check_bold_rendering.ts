#!/usr/bin/env tsx
/**
 * check_bold_rendering.ts — 检测 markdown 加粗(**)渲染失败。
 *
 * 背景:VitePress 用 markdown-it 渲染。按 CommonMark 的 flanking 规则,当 `**` 的一
 * 侧紧贴中文全角标点(「」（））。、！等)、另一侧紧贴汉字/字母/数字时,`**` 不构成
 * emphasis delimiter,会以字面 `**` 残留(加粗失效)。最典型:`**术语（english）**`
 * ——结尾全角 ） 致闭合 `**` 失效;`是**「词」**`——opening `汉字**标点` 失效。
 *
 * 原理:用与 VitePress 同源的裸 markdown-it(无 attrs/mathjax 等插件)逐行 renderInline,
 * 剥掉 inline code 后,若仍含字面 `**` → 该行有渲染失败。
 *
 * 注:不用 vitepress 的 createMarkdownRenderer —— 它带的 markdown-it-attrs 插件在逐行
 * parseInline 时会崩(getMatchingOpeningToken 抛错)。本项目已在 devDep 显式装 markdown-it,
 * 用裸实例即可,emphasis 行为与线上一致。
 *
 * 用法:tsx scripts/check_bold_rendering.ts
 * 退出码:0 通过,1 有失败(pre-commit / CI 友好)。
 */
import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const require = createRequire(import.meta.url)
// 裸 markdown-it(不带 attrs/mathjax):emphasis 行为与线上一致,且不会在逐行 parseInline 时崩。
const MarkdownIt = require('markdown-it')
const md = new MarkdownIt({ html: true, typographer: false })

const ROOT = join(process.cwd(), 'tutorials')

interface Hit { rel: string; line: number; text: string }

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (e.name.endsWith('.md')) acc.push(p)
  }
  return acc
}

function scanFile(file: string): Hit[] {
  const lines = readFileSync(file, 'utf-8').split('\n')
  const hits: Hit[] = []
  const rel = relative(ROOT, file)
  let inFence = false, fenceCh: string | null = null, yaml = false, yd = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 跳过 YAML frontmatter(文件首部 --- ... ---)
    if (!yd) {
      if (i === 0 && line.trim() === '---') { yaml = true; continue }
      if (yaml) { if (line.trim() === '---') { yaml = false; yd = true } continue }
      else yd = true
    }
    // 跳过代码围栏 ``` / ~~~
    const fm = line.match(/^\s*(`{3,}|~{3,})/)
    if (fm) {
      const c = fm[1][0]
      if (!inFence) { inFence = true; fenceCh = c }
      else if (c === fenceCh) { inFence = false; fenceCh = null }
      continue
    }
    if (inFence) continue
    // 跳过单独成行的主题分隔线(thematic break:*** / --- / ___,3+ 个,可间空格)。
    // 它们在 block 解析时是 <hr>,不是加粗;逐行 renderInline 会把它误报为 `**` 残留。
    if (/^\s*(\*\s*){3,}$/.test(line) || /^\s*(-\s*){3,}$/.test(line) || /^\s*(_\s*){3,}$/.test(line)) continue
    if (/^\t/.test(line)) continue // 缩进代码块
    // 整行渲染 → 剥 inline code → 若残留字面 ** 即失败
    const rendered = md.renderInline(line).replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, '')
    if (rendered.includes('**')) hits.push({ rel, line: i + 1, text: line.slice(0, 120) })
  }
  return hits
}

const hits = walk(ROOT).sort().flatMap(scanFile)

if (hits.length === 0) {
  console.log('✓ 加粗渲染检查通过:无 `**` 残留失败。')
  process.exit(0)
}

console.error(`✗ 发现 ${hits.length} 行加粗渲染失败(\`**\` 因标点边界未渲染为 <strong>,字面残留):\n`)
for (const h of hits) console.error(`  ${h.rel}:L${h.line}  ${h.text}`)
console.error(`
修法:让 \`**\` 边界落在文字字符上,把中文标点移到 \`**\` 外侧。例如:
  **术语(english)**    → **术语**(english)    (括号移出加粗)
  **「词」**             → 「**词**」           (引号移到外侧)
  **…句末标点!**        → **…**!              (句末标点移出)
详见 .claude/prompts.md 与 memory: markdown-bold-cjk-pitfall。`)
process.exit(1)
