#!/usr/bin/env node
/**
 * CI 校验：确认这个包仍然是一个「可被 DSH 安装的 bundle + 浏览器插件」。
 * 不联网、不依赖任何第三方包。
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const problems = [];
const ok = [];

function check(condition, message) {
  (condition ? ok : problems).push(message);
}

const pkg = JSON.parse(read('package.json'));

check(typeof pkg.name === 'string' && pkg.name.length > 0, 'package.json 有 name');
check(pkg.version, `版本 ${pkg.version}`);
check(pkg.type === 'module', 'type 是 module');
check(pkg.private !== true, '不是 private（可发布）');
check((pkg.keywords || []).includes('dsh-plugin'), 'keywords 含 dsh-plugin');
check(pkg.license, `license 是 ${pkg.license}`);
check(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, '零运行时依赖');

// bundle 声明
const patchRel = pkg.dsh?.bundle?.patch;
check(typeof patchRel === 'string', 'dsh.bundle.patch 已声明');
if (typeof patchRel === 'string') {
  const patchPath = fileURLToPath(new URL(patchRel.replace(/^\.\//, ''), root));
  check(existsSync(patchPath), `bundle patch 存在：${patchRel}`);
  if (existsSync(patchPath)) {
    const patch = readFileSync(patchPath, 'utf8');
    check(/-\s*insert:/.test(patch), 'bundle patch 是 insert 列表');
    check(patch.includes(pkg.name), 'bundle patch 里的 name 指向本包');
  }
}

// 浏览器插件声明
const client = pkg.dsh?.client;
check(client?.platform === 'web', "dsh.client.platform 是 'web'");
check(Array.isArray(client?.inject), 'dsh.client.inject 是数组');
check(pkg.exports?.['./client'] !== undefined, 'exports 暴露了 "./client"');
check(pkg.exports?.['./package.json'] !== undefined, 'exports 暴露了 "./package.json"');
check(pkg.files?.includes('lib'), 'files 包含 lib');
check(pkg.files?.includes('cordis.patch.yml'), 'files 包含 cordis.patch.yml');

// 入口文件与 bundle 形态
check(existsSync(fileURLToPath(new URL('lib/index.js', root))), 'lib/index.js 存在');
check(existsSync(fileURLToPath(new URL('lib/client.js', root))), 'lib/client.js 存在');
const host = read('lib/index.js');
const browser = read('lib/client.js');
check(host.includes('export function apply'), 'Host 侧导出 apply');
check(/export const name/.test(host), 'Host 侧导出 name');
check(host.includes('webServer.register'), 'Host 侧注册了 webServer 路由');
check(browser.includes('window.__ModuleLoader__.load('), 'client 是 __ModuleLoader__ bundle');
check(browser.includes('settings.section'), 'client 注册了 settings.section');
check(!/\bimport\s+[^;]*from\s+['"][^./]/.test(browser), 'client 不引入第三方模块（除 react）');
check(!/\bfetch\(\s*['"]https?:/.test(browser), 'client 只请求同源接口');

for (const line of ok) console.log('  ok   ' + line);
for (const line of problems) console.error('  FAIL ' + line);

if (problems.length > 0) {
  console.error(`\n${problems.length} 项检查未通过`);
  process.exit(1);
}
console.log(`\n全部 ${ok.length} 项检查通过`);
