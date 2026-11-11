import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publishPages = process.argv.includes('--pages');
const source = path.join(project, 'src');
const output = path.join(project, 'dist', publishPages ? 'pages' : '');
const read = (file) => fs.readFile(path.join(source, file), 'utf8');

const template = await read('index.html');
const style = await read('style.css');
const modules = [
  '01_core.js',
  '02_render.js',
  '03_editor.js',
  '04_move.js',
  '05_word.js',
  '06_word_modal.js',
  '07_sync_settings.js',
  '08_writing.js',
  '09_screenshot_data.js',
  '10_screenshot_import.js',
  '11_boot.js',
];
const script = (await Promise.all(modules.map((file) => read(path.join('js', file))))).join('');
if (!template.includes('__EN_STYLE__') || !template.includes('__EN_SCRIPT__')) {
  throw new Error('src/index.html is missing build placeholders');
}

function buildPagesScript(sourceScript) {
  const lines = sourceScript.split(/\r?\n/);
  const offlineLine = lines.findIndex(line => line.startsWith('const OFFLINE_FILE_MODE='));
  const seedPrefix = '  try{if(!localStorage.getItem(LS_KEY))localStorage.setItem(LS_KEY,JSON.stringify({';
  const seeds = lines.filter(line => line.startsWith(seedPrefix));
  if (offlineLine < 1 || !lines[offlineLine - 1].startsWith('/* Offline file mode:') ||
      lines[offlineLine + 1] !== 'if(OFFLINE_FILE_MODE){' || seeds.length !== 1 || lines[offlineLine + 2] !== seeds[0]) {
    throw new Error('Pages build could not isolate the local initialization data');
  }
  lines.splice(offlineLine - 1, 4, 'const OFFLINE_FILE_MODE=true;', 'if(OFFLINE_FILE_MODE){');
  return lines.join('\n')
    .replace(/  const f=\{id:'f_welcome'[\s\S]*?  return \{folders:/, '  return {folders:')
    .replace("document.title='英语学习笔记 · 离线文件版'", "document.title='英语学习笔记 · 在线版'")
    .replace('<b>离线文件：</b>表达、笔记、复习和编辑保存在当前手机浏览器。', '<b>在线版：</b>表达、笔记、复习和编辑保存在当前浏览器。');
}

const appScript = publishPages ? buildPagesScript(script) : script;
const html = template.replace('__EN_STYLE__', () => style).replace('__EN_SCRIPT__', () => appScript);
await fs.mkdir(output, { recursive: true });
const target = path.join(output, publishPages ? 'index.html' : '英语学习笔记.html');
await fs.writeFile(target, html, 'utf8');
console.log(`built ${target} (${Buffer.byteLength(html, 'utf8')} bytes)`);
