/* Source-to-source build: the original game remains readable and editable. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const babel = require('@babel/core');
const postcss = require('postcss');
const preset = require('postcss-preset-env');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'dist/windows-legacy/app');
const source = path.join(root, 'src-windows/legacy');
const config = { presets: [[require.resolve('@babel/preset-env'), { targets: { chrome: '50' }, modules: false }]], sourceType: 'script', comments: true, compact: false };
async function build() {
  fs.mkdirSync(out, { recursive: true });
  const scripts = ['app.js', ...fs.readdirSync(path.join(root, 'src/engine')).filter(f => f.endsWith('.js')).map(f => 'src/engine/' + f)];
  for (const file of scripts) {
    const target = path.join(out, file); fs.mkdirSync(path.dirname(target), { recursive: true });
    const result = babel.transformFileSync(path.join(root, file), config);
    fs.writeFileSync(target, result.code.replace(/\.style\.display = ['\"]grid['\"]/g, ".style.display = 'flex'") + '\n');
  }
  fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
  fs.cpSync(path.join(root, 'data'), path.join(out, 'data'), { recursive: true });
  fs.copyFileSync(require.resolve('core-js-bundle/minified.js'), path.join(out, 'polyfills.js'));
  for (const f of ['desktop.js', 'smoke.js']) fs.copyFileSync(path.join(source, f), path.join(out, f));
  let css = fs.readFileSync(path.join(root, 'style.css'), 'utf8').replace(/(\d+(?:\.\d+)?)dvh/g, '$1vh');
  const ast = postcss.parse(css);
  ast.walkDecls('display', d => { if (d.value === 'grid') d.value = 'block'; });
  const result = await postcss([preset({ browsers: 'Chrome 50', stage: 2, features: { 'custom-properties': { preserve: false } } })]).process(ast, { from: undefined });
  fs.writeFileSync(path.join(out, 'style.css'), result.css + '\n' + fs.readFileSync(path.join(source, 'layout.css'), 'utf8'));
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace('<script src="data/teams_data.js">', '<script src="desktop.js"></script>\n  <script src="polyfills.js"></script>\n  <script src="data/teams_data.js">');
  html = html.replace('</body>', '<script src="smoke.js"></script>\n</body>');
  fs.writeFileSync(path.join(out, 'index.html'), html);
  const manifest = {
    name: 'brasfoot-revenge-legacy', version: '1.1.0', main: 'index.html',
    description: 'Brasfoot Revenge - Windows XP SP3 x86 e posteriores (edicao legada offline)',
    window: { title: 'Brasfoot Revenge — Edição Legada', width: 1100, height: 760, min_width: 800, min_height: 600, toolbar: false, icon: 'assets/icons/ic_champion.png' },
    'chromium-args': '--disable-background-networking --disable-component-update --disable-sync --disable-gpu --disable-translate'
  };
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(out, 'source-manifest.json'), JSON.stringify({ runtime: 'NW.js 0.14.7 ia32 / Chromium 50', files: Object.fromEntries(scripts.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex')])) }, null, 2));
  console.log('PASS: legacy scripts, polyfills, CSS and local data built in ' + out);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
