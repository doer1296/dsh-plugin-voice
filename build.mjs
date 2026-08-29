/**
 * 构建脚本：生成 lib/ 发布产物（本地 esbuild API）。
 * 沿用 dsh-plugin-notify 的双 bundle 模式：
 *   - host 端：ESM bundle（lib/index.js）
 *   - client bundle：CJS + __ModuleLoader__ 包装（lib/client.js）
 */
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'

const ID = 'dsh-plugin-voice'
// 构建时注入插件版本号（客户端 bundle 无法运行时读 package.json，用 define 替换）
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const VERSION = pkg.version || '0.0.0'
const define = { __VOICE_PLUGIN_VERSION__: JSON.stringify(VERSION) }

// esbuild 是 devDependency——git 安装场景（pnpm/npm 装 git 依赖不装 devDeps）下不可用。
// lib/ 已提交进仓库，此时跳过构建直接用仓库内产物，避免现场构建触发 pnpm
// ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED / allowBuilds 拦截。
let esbuild
try {
  esbuild = await import('esbuild')
} catch {
  if (existsSync('lib/index.js') && existsSync('lib/client.js')) {
    console.log('esbuild 不可用（git 安装无 devDependencies），跳过构建，使用仓库内 lib/')
    process.exit(0)
  }
  console.error('esbuild 不可用且仓库无 lib/ 产物，无法继续')
  process.exit(1)
}

rmSync('lib', { recursive: true, force: true })
mkdirSync('lib', { recursive: true })

// host 端：ESM bundle
await esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  define,
  external: ['node:fs', 'node:path', 'node:url', 'node:child_process', 'node:http', 'node:https', '@deepseek-ai/*'],
  outfile: 'lib/index.js',
})

// client bundle：CJS + load 包装
const banner = `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`
const footer = `return module.exports; } });`
await esbuild.build({
  entryPoints: ['src/client-source.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  define,
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/*'],
  // 源文件用 module.exports（CJS 习惯）而 package.json type:module → esbuild 会告警，
  // bundle 输出由 banner/footer 显式包装，行为正确，静音即可
  logOverride: { 'commonjs-variable-in-esm': 'silent' },
  banner: { js: banner },
  footer: { js: footer },
  outfile: 'lib/client.js',
})

// 校验
const host = readFileSync('lib/index.js', 'utf8')
const client = readFileSync('lib/client.js', 'utf8')
if (!host.includes('dsh-plugin-voice')) throw new Error('host bundle 缺关键符号')
if (!client.includes('__ModuleLoader__.load')) throw new Error('client bundle 缺 load 包装')
if (!readFileSync('notify.ps1', 'utf8').includes('DSH_VOICE_PAYLOAD')) throw new Error('ps1 文件异常')
if (!readFileSync('idle.ps1', 'utf8').includes('idle_seconds')) throw new Error('idle.ps1 文件异常')
console.log('构建完成：lib/index.js + lib/client.js')
