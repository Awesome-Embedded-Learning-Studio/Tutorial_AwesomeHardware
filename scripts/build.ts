/**
 * scripts/build.ts —— 分段构建（segmented build）
 *
 * 为什么需要分段构建：
 *   markdown-it-mathjax3 在 build 时为每个公式调 mathjax 渲染。本站有 1.5 万条公式，
 *   而 mathjax-full 的渲染管线存在不可消除的内存泄漏（约 2.5KB/公式，GC 无法回收，
 *   重置 adaptor/jax/document 都无济于事）。单进程把全部 184 篇一次性渲染会把堆顶到
 *   4GB+ 然后 OOM（即使去掉 juice、改成单例 adaptor 也一样）。
 *
 * 解法（同 Tutorial_AwesomeModernCPP）：把内容按章节组切成若干块，每块用一个**独立的
 * vitepress build 子进程**构建。每个子进程只渲染自己那几千条公式，泄漏量小（<10MB），
 * 进程结束内存即被操作系统回收。最后把各块产物合并成一个完整站点：
 *   1. 合并 dist 目录（各块页面路径不重叠）；
 *   2. 合并本地搜索索引（minisearch），让全站搜索能命中所有块；
 *   3. 统一 __VP_HASH_MAP__ / __VP_SITE_DATA__，让 SPA 跨块路由 / 导航不 404。
 *
 * 每块的临时 config 直接 `import` 真实 config.ts 并 spread（defineConfig 是直通函数），
 * 仅覆盖 srcDir / outDir / ignoreDeadLinks——所以主题、插件（转义 / 公式容错 / math fence）、
 * 侧边栏、base 等都和正式配置完全一致，不做重复声明。
 */
import { execFile } from 'child_process'
import {
  cpSync, mkdirSync, rmSync, writeFileSync, readdirSync,
  readFileSync, existsSync, symlinkSync, statSync,
} from 'fs'
import { join, resolve, relative, basename } from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// ── 路径 ────────────────────────────────────────────────────
const PROJECT_ROOT = resolve(import.meta.dirname, '..')
const TUTORIALS = join(PROJECT_ROOT, 'tutorials')
const MAIN_VP = join(PROJECT_ROOT, 'site', '.vitepress')
const BUILD_TMP = join(MAIN_VP, '.build-tmp')
const DIST_FINAL = join(MAIN_VP, 'dist')
const REAL_CONFIG = join(MAIN_VP, 'config.ts')
const VITEPRESS_BIN = join(resolve(require.resolve('vitepress/package.json'), '..'), 'bin', 'vitepress.js')

// ── 内容分块（按章节号前缀，覆盖 chXX.md 与 chXX_Y.md）─────
interface Chunk { id: string; chapters: string[] }
const CHUNKS: Chunk[] = [
  { id: 'g1', chapters: ['01', '02', '03', '04', '05'] },
  { id: 'g2', chapters: ['06', '07', '08', '09'] },
  { id: 'g3', chapters: ['10', '11', '12'] },
  { id: 'g4', chapters: ['13', '14', '15', '16', '17'] },
  { id: 'g5', chapters: ['18', '19'] },
  { id: 'g6', chapters: ['20', '21', '22', '23'] },
]

// ── 日志 / 工具 ─────────────────────────────────────────────
function log(msg: string) { console.log(msg) }
function logStep(msg: string) { console.log(`\n── ${msg} ${'─'.repeat(Math.max(0, 64 - msg.length))}`) }

function ensureClean(dir: string) {
  if (existsSync(dir)) rmSync(dir, { recursive: true })
  mkdirSync(dir, { recursive: true })
}
function symlinkDir(target: string, link: string) {
  if (existsSync(link)) rmSync(link, { recursive: true })
  symlinkSync(target, link, 'dir')
}

function execFileAsync(file: string, args: string[], opts: { cwd?: string } = {}): Promise<void> {
  return new Promise((resolveP, reject) => {
    execFile(file, args, { cwd: opts.cwd ?? PROJECT_ROOT }, (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)
      if (err) reject(err); else resolveP()
    })
  })
}

/** 生成某块的临时 config.ts：spread 真实 config，仅覆盖 srcDir/outDir/ignoreDeadLinks。 */
function writeChunkConfig(tmpSiteVp: string, absSrcDir: string, absOutDir: string) {
  // 相对路径（从临时 config.ts 指向真实 config.ts），便于产物可移植。
  const relConfig = relative(tmpSiteVp, REAL_CONFIG).replace(/\\/g, '/')
  const config = `import { defineConfig } from 'vitepress'
import base from '${relConfig}'

// 分段构建生成的临时配置：复用真实 config 的全部设置（主题 / 插件 / 侧边栏 / base），
// 只覆盖源目录、输出目录，并忽略跨块死链（合并阶段会统一 hash map 让 SPA 路由生效）。
export default defineConfig({
  ...base,
  srcDir: ${JSON.stringify(absSrcDir.replace(/\\/g, '/'))},
  outDir: ${JSON.stringify(absOutDir.replace(/\\/g, '/'))},
  ignoreDeadLinks: true,
})
`
  writeFileSync(join(tmpSiteVp, 'config.ts'), config)
}

/** 构建单块：准备临时 src + 临时 site，跑 vitepress build，返回该块输出目录。 */
async function buildChunk(kind: 'root' | 'mcu' | { id: string; chapters: string[] }): Promise<string> {
  const id = kind === 'root' ? 'root' : kind === 'mcu' ? 'mcu' : kind.id
  const srcDir = join(BUILD_TMP, `src-${id}`)
  const tmpSite = join(BUILD_TMP, `site-${id}`)
  const tmpSiteVp = join(tmpSite, '.vitepress')
  const output = join(BUILD_TMP, 'output', id)

  // 准备源文件
  ensureClean(srcDir)
  if (kind === 'root') {
    for (const f of ['index.md', 'about.md']) {
      const s = join(TUTORIALS, f)
      if (existsSync(s)) cpSync(s, join(srcDir, f))
    }
  } else if (kind === 'mcu') {
    // 单片机硬件版块：整目录拷贝（体量小，不按章节号过滤）。
    mkdirSync(join(srcDir, 'mcu'), { recursive: true })
    const mcuSrc = join(TUTORIALS, 'mcu')
    for (const f of readdirSync(mcuSrc)) {
      cpSync(join(mcuSrc, f), join(srcDir, 'mcu', f))
    }
    const n = readdirSync(join(srcDir, 'mcu')).length
    log(`  ${id}: ${n} files`)
  } else {
    mkdirSync(join(srcDir, 'power-electronics'), { recursive: true })
    for (const f of readdirSync(join(TUTORIALS, 'power-electronics'))) {
      // 形如 ch01.md 或 chXX_Y.md；chapter 前缀落在本块范围内才纳入
      const chap = f.match(/^ch(\d{2})/)?.[1]
      if (chap && kind.chapters.includes(chap)) {
        cpSync(join(TUTORIALS, 'power-electronics', f), join(srcDir, 'power-electronics', f))
      }
    }
    const n = readdirSync(join(srcDir, 'power-electronics')).length
    log(`  ${id}: ${n} files`)
  }

  // 准备临时 site：config + theme/public 软链到真实目录
  ensureClean(tmpSiteVp)
  writeChunkConfig(tmpSiteVp, srcDir, output)
  symlinkDir(join(MAIN_VP, 'theme'), join(tmpSiteVp, 'theme'))
  if (existsSync(join(MAIN_VP, 'public'))) symlinkDir(join(MAIN_VP, 'public'), join(tmpSiteVp, 'public'))

  await execFileAsync(process.execPath, [VITEPRESS_BIN, 'build', tmpSite])
  if (!existsSync(output)) throw new Error(`${id}: 构建后未找到输出目录`)
  return output
}

// ── 本地搜索索引合并（移植自 Tutorial_AwesomeModernCPP，单语言简化）──
function findSearchIndexFiles(dir: string): string[] {
  const chunksDir = join(dir, 'assets', 'chunks')
  if (!existsSync(chunksDir)) return []
  return readdirSync(chunksDir)
    .filter((f) => /^@localSearchIndexroot\.[^.]+\.js$/.test(f))
    .map((f) => join(chunksDir, f))
}

type SerializedSearchIndex = {
  documentCount: number
  nextId: number
  documentIds: Record<string, string>
  fieldIds: Record<string, number>
  fieldLength: Record<string, number[]>
  averageFieldLength: number[]
  storedFields: Record<string, Record<string, unknown>>
  dirtCount: number
  index: Array<[string, Record<string, Record<string, number>>]>
  serializationVersion: number
}

function extractSearchIndex(indexPath: string): SerializedSearchIndex | null {
  const content = readFileSync(indexPath, 'utf-8')
  const assignment = content.match(/^const\s+\w+\s*=\s*/)
  let exportStart = -1
  for (const m of content.matchAll(/;?\s*export\s*\{/g)) exportStart = m.index!
  if (!assignment || exportStart === -1) return null
  let expr = content.slice(assignment[0].length, exportStart).trim()
  if (expr.endsWith(';')) expr = expr.slice(0, -1).trim()
  const jsonStr: string = new Function(`return (${expr})`)()
  return JSON.parse(jsonStr)
}

function mergeSerializedSearchIndexes(indexes: SerializedSearchIndex[]): SerializedSearchIndex {
  const fieldIds = indexes[0].fieldIds
  const fieldCount = Object.keys(fieldIds).length
  const merged: SerializedSearchIndex = {
    documentCount: 0, nextId: 0, documentIds: {}, fieldIds,
    fieldLength: {}, averageFieldLength: Array(fieldCount).fill(0),
    storedFields: {}, dirtCount: 0, index: [], serializationVersion: indexes[0].serializationVersion,
  }
  const termIndex = new Map<string, Record<string, Record<string, number>>>()
  const fieldLengthSums = Array(fieldCount).fill(0)

  for (const data of indexes) {
    const localToGlobal = new Map<string, string>()
    const fieldMap = new Map<string, string>()
    for (const [fieldName, localFieldId] of Object.entries(data.fieldIds)) {
      const t = fieldIds[fieldName]
      if (t === undefined) throw new Error(`不兼容的搜索字段：${fieldName}`)
      fieldMap.set(String(localFieldId), String(t))
    }
    for (const [localId, url] of Object.entries(data.documentIds)) {
      const globalId = String(merged.nextId++)
      localToGlobal.set(localId, globalId)
      merged.documentIds[globalId] = url
      merged.storedFields[globalId] = data.storedFields[localId] || {}
      const lengths = data.fieldLength[localId] || []
      merged.fieldLength[globalId] = Array(fieldCount).fill(0)
      for (const [lf, tf] of fieldMap) {
        const len = lengths[Number(lf)] || 0
        merged.fieldLength[globalId][Number(tf)] = len
        fieldLengthSums[Number(tf)] += len
      }
    }
    merged.dirtCount += data.dirtCount || 0
    for (const [term, postings] of data.index) {
      const mp = termIndex.get(term) || {}
      for (const [lf, docs] of Object.entries(postings)) {
        const tf = fieldMap.get(lf)
        if (tf === undefined) continue
        const fp = mp[tf] || {}
        for (const [li, freq] of Object.entries(docs)) {
          const gi = localToGlobal.get(li)
          if (gi === undefined) continue
          fp[gi] = (fp[gi] || 0) + freq
        }
        mp[tf] = fp
      }
      termIndex.set(term, mp)
    }
  }
  merged.documentCount = Object.keys(merged.documentIds).length
  merged.averageFieldLength = fieldLengthSums.map((s) => (merged.documentCount > 0 ? s / merged.documentCount : 0))
  merged.index = [...termIndex.entries()]
  return merged
}

/** 合并所有块的本地搜索索引为一份，其余块的同名文件改为 re-export 桩。 */
function mergeSearchIndexes(chunkOutputs: string[], finalDist: string) {
  const indexes: SerializedSearchIndex[] = []
  const targets: string[] = []
  for (const dir of chunkOutputs) {
    for (const ip of findSearchIndexFiles(dir)) {
      const idx = extractSearchIndex(ip)
      if (!idx) continue
      indexes.push(idx)
      const target = join(finalDist, 'assets', 'chunks', basename(ip))
      if (existsSync(target)) targets.push(target)
    }
  }
  if (indexes.length <= 1) { log(`  搜索索引：${indexes.length} 份，无需合并`); return }
  const merged = mergeSerializedSearchIndexes(indexes)
  const js = `const e=${JSON.stringify(JSON.stringify(merged))};export{e as default};`
  if (targets.length === 0) { log('  ⚠ 未找到最终 dist 里的搜索索引文件'); return }
  writeFileSync(targets[0], js)
  const canonical = basename(targets[0])
  for (let i = 1; i < targets.length; i++) writeFileSync(targets[i], `export{default}from"./${canonical}";`)
  log(`  搜索索引：合并 ${merged.documentCount} 篇文档 → 1 份规范 + ${targets.length - 1} 桩`)
}

// ── 跨块 hash map / 站点数据统一（移植自 Tutorial_AwesomeModernCPP）──
function unifyCrossChunkData(distDir: string) {
  const htmlFiles: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.html')) htmlFiles.push(full)
    }
  }
  walk(distDir)

  const mergedHashMap: Record<string, string> = {}
  let rootSiteDataExpr = ''
  for (const f of htmlFiles) {
    const c = readFileSync(f, 'utf-8')
    const hm = c.match(/__VP_HASH_MAP__\s*=\s*JSON\.parse\("(.+?)"\)/)
    if (hm) {
      try { Object.assign(mergedHashMap, JSON.parse(new Function(`return "${hm[1]}"`)())) } catch { /* skip */ }
    }
    if (f === join(distDir, 'index.html')) {
      const sd = c.match(/__VP_SITE_DATA__\s*=\s*JSON\.parse\("(.+?)"\)/)
      if (sd) rootSiteDataExpr = sd[1]
    }
  }
  log(`  hash map：合并 ${Object.keys(mergedHashMap).length} 条${rootSiteDataExpr ? '，站点数据：root' : '，站点数据：缺失'}`)

  const hmJsLiteral = JSON.stringify(JSON.stringify(mergedHashMap))
  let patched = 0
  for (const f of htmlFiles) {
    let c = readFileSync(f, 'utf-8')
    let changed = false
    const hmReplace = c.replace(/__VP_HASH_MAP__\s*=\s*JSON\.parse\(".+?"\)/, `__VP_HASH_MAP__=JSON.parse(${hmJsLiteral})`)
    if (hmReplace !== c) { c = hmReplace; changed = true }
    if (rootSiteDataExpr && f !== join(distDir, 'index.html')) {
      const sdReplace = c.replace(/__VP_SITE_DATA__\s*=\s*JSON\.parse\(".+?"\)/, `__VP_SITE_DATA__=JSON.parse("${rootSiteDataExpr}")`)
      if (sdReplace !== c) { c = sdReplace; changed = true }
    }
    if (changed) { writeFileSync(f, c); patched++ }
  }
  log(`  统一：修补 ${patched} 个 HTML`)
}

// ── 主流程 ──────────────────────────────────────────────────
async function main() {
  const start = Date.now()
  logStep('分段构建：VitePress 按章节组分别构建')
  log(`  项目：${PROJECT_ROOT}`)
  log(`  分块：root + ${CHUNKS.length} 个章节组`)

  ensureClean(BUILD_TMP)
  ensureClean(DIST_FINAL)
  mkdirSync(join(BUILD_TMP, 'output'), { recursive: true })

  const chunkOutputs: string[] = []

  // 1) root
  logStep('构建 root（index / about）')
  const rootOut = await buildChunk('root')
  cpSync(rootOut, DIST_FINAL, { recursive: true })
  chunkOutputs.push(rootOut)
  log('  root ✓')

  // 1.5) mcu（单片机硬件版块）
  logStep('构建 mcu（单片机硬件）')
  const mcuOut = await buildChunk('mcu')
  cpSync(mcuOut, DIST_FINAL, { recursive: true })
  chunkOutputs.push(mcuOut)
  log('  mcu ✓')

  // 2) 各章节组（串行，单进程峰值最低、最稳）
  for (const chunk of CHUNKS) {
    logStep(`构建 ${chunk.id}（ch ${chunk.chapters.join(', ')}）`)
    const out = await buildChunk(chunk)
    cpSync(out, DIST_FINAL, { recursive: true })
    chunkOutputs.push(out)
    log(`  ${chunk.id} ✓`)
  }

  // 3) 合并搜索索引
  logStep('合并本地搜索索引')
  mergeSearchIndexes(chunkOutputs, DIST_FINAL)

  // 4) 统一跨块 hash map / 站点数据
  logStep('统一跨块 hash map 与站点数据')
  unifyCrossChunkData(DIST_FINAL)

  // 4.5) 静态资源：VitePress 的 publicDir 解析到 srcDir/public（分块 srcDir 里没有），
  //      所以这里显式把 site/.vitepress/public 拷进最终 dist（favicon 等）。
  const publicDir = join(MAIN_VP, 'public')
  if (existsSync(publicDir)) cpSync(publicDir, DIST_FINAL, { recursive: true })

  // 5) 收尾
  rmSync(BUILD_TMP, { recursive: true })

  const htmlCount = (() => { let n = 0; const w = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) w(join(d, e.name)); else if (e.name.endsWith('.html')) n++ } }; w(DIST_FINAL); return n })()
  logStep('完成')
  log(`  状态：✓ SUCCESS`)
  log(`  耗时：${((Date.now() - start) / 1000).toFixed(1)}s`)
  log(`  产物：${relative(PROJECT_ROOT, DIST_FINAL)}（${htmlCount} 个 HTML）`)
}

main().catch((err) => {
  console.error('\n构建失败：', err)
  process.exit(1)
})
