import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = 'C:/Users/19394/Documents/Projects/english-notes';
const source = path.join(project, 'src');
const output = path.join(project, 'dist');
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

const html = template.replace('__EN_STYLE__', () => style).replace('__EN_SCRIPT__', () => script);
await fs.mkdir(output, { recursive: true });
const target = path.join(output, '英语学习笔记.html');
await fs.writeFile(target, html, 'utf8');
console.log(`built ${target} (${Buffer.byteLength(html, 'utf8')} bytes)`);
