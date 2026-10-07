// src → dist: 스크립트·스타일을 index.html 한 파일로 인라인하고 PWA 파일을 복사
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const src = (f) => readFileSync(new URL(`./src/${f}`, import.meta.url), 'utf8');
const strip = (code) => code
  .split(/\r?\n/)
  .filter(line => !/^import\s.+\sfrom\s.+;\s*$/.test(line))
  .map(line => line.replace(/^export\s+(?=(async\s+)?function|const|let|class)/, ''))
  .join('\n');

const script = ['calc.js', 'store.js', 'app.js'].map(f => `// ---- ${f} ----\n${strip(src(f))}`).join('\n');
if (/^\s*(import|export)\s/m.test(script)) throw new Error('인라인 스크립트에 import/export가 남아 있음');

const html = src('index.html')
  .replace('<!--STYLE-->', () => `<style>\n${src('style.css')}</style>`)
  .replace('<!--SCRIPT-->', () => `<script>\n"use strict";\n${script}\n</script>`);

const out = new URL('./dist/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('index.html', out), html);
// 캐시 버전: 배포되는 모든 파일 기준
const hash = createHash('sha256').update(html);
for (const f of ['sw.js', 'manifest.webmanifest', 'icon.svg']) hash.update(src(f));
const version = hash.digest('hex').slice(0, 8);
writeFileSync(new URL('sw.js', out), src('sw.js').replace('__VERSION__', version));
for (const f of ['manifest.webmanifest', 'icon.svg']) copyFileSync(new URL(`./src/${f}`, import.meta.url), new URL(f, out));
console.log(`dist/ 생성 (version ${version}, index.html ${(html.length / 1024).toFixed(1)} KB)`);
