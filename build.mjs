// src → dist: 앱마다 스크립트·스타일을 index.html 한 파일로 인라인하고 PWA 파일을 복사
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const src = (f) => readFileSync(new URL(`./src/${f}`, import.meta.url), 'utf8');
const strip = (code) => code
  .split(/\r?\n/)
  .filter(line => !/^import\s.+\sfrom\s.+;\s*$/.test(line))
  .map(line => line.replace(/^export\s+(?=(async\s+)?function|const|let|class)/, ''))
  .join('\n');

const APPS = [
  { out: 'dist/', prefix: 'rb-', html: 'index.html', css: 'style.css', manifest: 'manifest.webmanifest',
    scripts: ['calc.js', 'store.js', 'app.js'] },
  { out: 'dist/v2/', prefix: 'rb2-', html: 'v2/index.html', css: 'v2/style.css', manifest: 'v2/manifest.webmanifest',
    scripts: ['calc.js', 'v2/inverse.js', 'v2/app.js'] },
];

for (const app of APPS) {
  const script = app.scripts.map(f => `// ---- ${f} ----\n${strip(src(f))}`).join('\n');
  if (/^\s*(import|export)\s/m.test(script)) throw new Error(`${app.out}: 인라인 스크립트에 import/export가 남아 있음`);

  const html = src(app.html)
    .replace('<!--STYLE-->', () => `<style>\n${src(app.css)}</style>`)
    .replace('<!--SCRIPT-->', () => `<script>\n"use strict";\n${script}\n</script>`);
  const manifest = src(app.manifest), icon = src('icon.svg'), sw = src('sw.js');

  // 캐시 버전: 배포되는 모든 파일 기준
  const version = createHash('sha256').update(html).update(manifest).update(icon).update(sw).digest('hex').slice(0, 8);
  const out = new URL(`./${app.out}`, import.meta.url);
  mkdirSync(out, { recursive: true });
  writeFileSync(new URL('index.html', out), html);
  writeFileSync(new URL('manifest.webmanifest', out), manifest);
  writeFileSync(new URL('icon.svg', out), icon);
  writeFileSync(new URL('sw.js', out), sw.replace('__PREFIX__', app.prefix).replace('__VERSION__', version));
  console.log(`${app.out} 생성 (version ${app.prefix}${version}, index.html ${(html.length / 1024).toFixed(1)} KB)`);
}
