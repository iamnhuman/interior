import './style.css';
import * as THREE from 'three';
import { createIcons, ArrowUpRight, Box, Check, Focus, Grid2x2, Image, Info, Layers, Layers2, MousePointer2, Orbit, Paintbrush, Palette, Plus, RotateCcw, Ruler, ScanLine, Search, ShieldCheck, Slice, Trash2, TriangleAlert, Upload, X } from 'lucide';
import { ModelViewer, meters } from './viewer.js';
import { finishes } from './textures.js';
import { unpackIfc } from './lib/ifc.mjs';
import { pageAssetUrl } from './lib/urls.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icons = { ArrowUpRight, Box, Check, Focus, Grid2x2, Image, Info, Layers, Layers2, MousePointer2, Orbit, Paintbrush, Palette, Plus, RotateCcw, Ruler, ScanLine, Search, ShieldCheck, Slice, Trash2, TriangleAlert, Upload, X };
const refreshIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.65 } });
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastTimer, busy = false, currentModel = 'ifc', viewer;
const uploads = new Map();
function toast(message) {$('#toast').textContent = message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200);}
function setBusy(value, label = 'Открываем пространство') {
  busy = value;$('#loading-overlay').hidden = !value;$('#loading-label').textContent = label;$('#loading-progress').style.width = '15%';
  $$('.model-card, #upload-button, #apply-palette, .finish-card, #upload-texture').forEach(b => {b.disabled = value;});
  if (value) {$('#error-panel').hidden = true;$('#loading-detail').textContent = 'Геометрия и структура модели';}
}
function showError(error) {console.error(error);$('#error-message').textContent = error.message || 'Неизвестная ошибка';$('#error-panel').hidden = false;$('#status-text').textContent = 'Ошибка открытия файла';}
async function get(path, type = 'json') {const response = await fetch(pageAssetUrl(path));if (!response.ok) throw new Error(`Не удалось загрузить файл (${response.status}).`);return type === 'json' ? response.json() : response.arrayBuffer();}
function syncMode() {$$('[data-mode]').forEach(b => {const active = b.dataset.mode === viewer.settings.mode;b.classList.toggle('active', active);b.setAttribute('aria-pressed', active);});}
function shortLayer(name) {const label = name.replace(/^(Конструктив|Интерьер|Отделка|Элемент Модели)\s*-\s*/i, '');return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();}
function renderLayers() {
  const query = $('#layer-search').value.toLowerCase();
  const layers = [...viewer.layers.values()];
  $('#layers-list').innerHTML = layers.map((layer, i) => `<label class="layer-row ${layer.visible ? '' : 'layer-hidden'}" title="${escapeHtml(layer.name)}" ${!layer.name.toLowerCase().includes(query) ? 'hidden' : ''}><input type="checkbox" data-layer-index="${i}" ${layer.visible ? 'checked' : ''} /><span class="layer-check"><i data-lucide="check"></i></span><span class="layer-copy">${escapeHtml(shortLayer(layer.name))}</span><span class="layer-count">${layer.count}</span></label>`).join('') || '<p class="muted">Слои не найдены</p>';
  if (layers.length && !layers.some(l => l.name.toLowerCase().includes(query))) $('#layers-list').insertAdjacentHTML('beforeend', '<p class="muted">Ничего не найдено</p>');
  const ceiling = layers.find(l => /потолок/i.test(l.name));$('#ceiling-note').hidden = !ceiling || ceiling.visible;
  $$('[data-layer-index]').forEach(input => input.addEventListener('change', () => viewer.setLayer(layers[Number(input.dataset.layerIndex)].name, input.checked)));
  refreshIcons();
}
function updateSelection(element) {
  $('#selection-empty').hidden = !!element;$('#selection-detail').hidden = !element;$('#deselect-button').hidden = !element;
  if (!element) {$$('.finish-card').forEach(b => b.classList.remove('selected'));return;}
  $('#element-name').textContent = element.name;
  $('#element-type').textContent = element.type;
  $('#element-layer').textContent = shortLayer(element.layer);
  $('#element-size').textContent = viewer.boxFor(element).getSize(new THREE.Vector3()).toArray().map(x => x.toLocaleString('ru-RU', { maximumFractionDigits: 3 })).join(' × ');
  $('#element-id').textContent = `#${element.id}`;
  const materials = [...new Set(element.meshes.map(m => m.userData.baseMaterial.name).filter(Boolean))];
  $('#element-material').textContent = viewer.settings.mode === 'finish' && element.override ? element.override.name : materials.join(', ') || 'Материал модели';
  const scale = element.override?.scale || 1;$('#texture-scale').value = Math.round(scale * 100);$('#texture-scale-value').textContent = meters(scale);
  $$('.finish-card').forEach(b => b.classList.toggle('selected', element.override?.texture === b.dataset.finish));
}
async function loadModel(id) {
  if (busy) return;
  setBusy(true, id === 'skp' ? 'Открываем SketchUp' : 'Открываем пространство');
  try {
    if (id === 'ifc') {
      const [manifest, buffer] = await Promise.all([get('models/T2_Ap.ifc.json'), get('models/T2_Ap.ifc.bin', 'buffer')]);
      $('#loading-progress').style.width = '75%';viewer.loadIfc(unpackIfc(manifest, buffer));
    } else if (id === 'skp') await viewer.loadGlb(await get('models/T2_Ap-skp.glb', 'buffer'));
    else {const custom = uploads.get(id);if (custom.format === 'ifc') viewer.loadIfc(custom.data);else await viewer.loadGlb(custom.data);}
    currentModel = id;setModelDetails(id);syncMode();renderLayers();
  } catch (error) {showError(error);} finally {setBusy(false);}
}
function setModelDetails(id) {
  const custom = uploads.get(id);
  const name = custom?.name || (id === 'skp' ? 'T2_Ap+.skp' : 'T2_Ap.ifc');
  $('#model-title').textContent = name;$('#format-chip').textContent = custom ? custom.format.toUpperCase() : id === 'skp' ? 'SKP → GLB' : 'IFC 2×3';
  $('#floor-label').textContent = custom ? 'Все элементы' : '1-й этаж';
  $('#status-text').textContent = id === 'skp' ? 'Модель готова · 2 исходные текстуры' : id === 'ifc' ? 'Модель готова · исходные цвета IFC' : 'Локальная модель готова';
  $$('.model-card').forEach(b => {const active = b.dataset.model === id;b.classList.toggle('active', active);b.setAttribute('aria-pressed', active);});
}
function parseInWorker(buffer, format) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./model.worker.js', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => {worker.terminate();reject(new Error('Обработка заняла больше двух минут. Попробуйте подготовить модель в GLB.'));}, 120000);
    const done = () => {clearTimeout(timeout);worker.terminate();};
    worker.onmessage = ({ data }) => {
      if (data.progress !== undefined) {$('#loading-progress').style.width = `${20 + data.progress * 0.65}%`;$('#loading-detail').textContent = `Чтение модели · ${data.progress}%`;return;}
      done();if (data.error) reject(new Error(data.error));else resolve(data.result);
    };
    worker.onerror = event => {done();reject(new Error(event.message || 'Не удалось запустить обработку модели.'));};
    worker.postMessage({ buffer, format }, [buffer]);
  });
}

$('#finish-library').innerHTML = finishes.map(f => `<button class="finish-card" data-finish="${f.id}" title="Применить: ${f.name}"><span class="finish-swatch swatch-${f.id}"><span class="swatch-check"><i data-lucide="check"></i></span></span><strong>${f.name}</strong><small>${f.detail}</small></button>`).join('');
refreshIcons();

try {
  viewer = new ModelViewer($('#viewport'));
  viewer.addEventListener('loaded', ({ detail }) => {
    $('#element-count').textContent = `${detail.elements.toLocaleString('ru-RU')} элементов`;
    $('#triangle-count').textContent = `${detail.triangles.toLocaleString('ru-RU')} треугольников`;
    renderLayers();
  });
  viewer.addEventListener('select', ({ detail }) => updateSelection(detail));
  viewer.addEventListener('layers', renderLayers);
  viewer.addEventListener('view', ({ detail }) => {
    $$('[data-view]').forEach(b => {const active = b.dataset.view === detail;b.classList.toggle('active', active);b.setAttribute('aria-pressed', active);});
    $('#view-label').textContent = { iso: 'Аксонометрия', top: 'Ортогональный план', front: 'Фасад', side: 'Боковой фасад' }[detail];
  });
  viewer.addEventListener('tool', ({ detail }) => {
    $('#measure-panel').hidden = detail !== 'measure';
    for (const tool of ['orbit', 'measure']) {const button = $(`#${tool}-tool`);button.classList.toggle('active', detail === tool);button.setAttribute('aria-pressed', detail === tool);}
  });
  viewer.addEventListener('measure', ({ detail }) => {
    $('#measure-instruction').textContent = detail.step === 1 ? 'Теперь выберите вторую точку' : detail.distance ? `${meters(detail.distance)} · выберите новую пару` : 'Выберите первую точку';
    $('#clear-measures').disabled = !detail.count && !detail.step;
  });
  viewer.addEventListener('section', ({ detail }) => {$('#section-height').textContent = meters(detail.height);});
  $$('[data-model]').forEach(b => b.addEventListener('click', () => loadModel(b.dataset.model)));
  $$('[data-view]').forEach(b => b.addEventListener('click', () => viewer.setView(b.dataset.view)));
  $$('[data-mode]').forEach(b => b.addEventListener('click', () => {viewer.setSetting('mode', b.dataset.mode);syncMode();if (viewer.selected) updateSelection(viewer.selected);if (b.dataset.mode === 'finish' && !viewer.elements.some(e => e.override)) toast('Выберите объект и материал или примените готовую палитру справа.');}));
  for (const key of ['textures', 'edges', 'dimensions']) $(`#${key}-toggle`).addEventListener('change', event => viewer.setSetting(key, event.target.checked));
  $('#orbit-tool').addEventListener('click', () => viewer.setTool('orbit'));
  $('#measure-tool').addEventListener('click', () => {viewer.setTool(viewer.tool === 'measure' ? 'orbit' : 'measure');if (viewer.tool === 'measure') toast('Нажмите на две поверхности. Рядом с вершиной включается привязка.');});
  $('#clear-measures').addEventListener('click', () => viewer.clearMeasurements());
  $('#fit-button').addEventListener('click', () => viewer.fit());
  $('#focus-selected').addEventListener('click', () => {if (viewer.selected) viewer.fit(viewer.boxFor(viewer.selected));});
  $('#grid-button').addEventListener('click', () => {const active = !viewer.settings.grid;viewer.setSetting('grid', active);$('#grid-button').classList.toggle('active', active);$('#grid-button').setAttribute('aria-pressed', active);});
  const toggleSection = active => {viewer.setSetting('section', active);$('#section-panel').hidden = !active;$('#section-tool').classList.toggle('active', active);$('#section-tool').setAttribute('aria-pressed', active);};
  $('#section-tool').addEventListener('click', () => toggleSection(!viewer.settings.section));$('#section-close').addEventListener('click', () => toggleSection(false));
  $('#section-range').addEventListener('input', event => viewer.setSetting('sectionValue', Number(event.target.value)));
  $('#section-axis').addEventListener('change', event => viewer.setSetting('sectionAxis', event.target.value));
  $('#layer-search').addEventListener('input', renderLayers);
  $('#show-layers').addEventListener('click', () => {for (const layer of viewer.layers.values()) viewer.setLayer(layer.name, true);});
  $('#deselect-button').addEventListener('click', () => viewer.select(null));
  $$('.finish-card').forEach(button => button.addEventListener('click', () => {
    const finish = finishes.find(f => f.id === button.dataset.finish);
    const count = viewer.applyFinish(finish, $('#material-scope').value, Number($('#texture-scale').value) / 100);
    if (!count) return toast('Сначала выберите элемент: нажмите на него в модели.');
    syncMode();toast(`${finish.name} · ${count === 1 ? 'материал применён' : `обновлено элементов: ${count}`}`);
  }));
  $('#apply-palette').addEventListener('click', () => {viewer.applyPalette();syncMode();toast('Готово: дуб на перекрытиях, светлые стены и микроцемент на колоннах.');});
  $('#reset-finish').addEventListener('click', () => {if (!viewer.selected) return toast('Выберите элемент модели.');viewer.resetFinish($('#material-scope').value);toast('Исходное оформление восстановлено.');});
  let scaleFrame;
  $('#texture-scale').addEventListener('input', event => {const value = Number(event.target.value) / 100;$('#texture-scale-value').textContent = meters(value);cancelAnimationFrame(scaleFrame);scaleFrame = requestAnimationFrame(() => viewer.setTextureScale(value, $('#material-scope').value));});
  $('#upload-texture').addEventListener('click', () => {if (!viewer.selected) return toast('Выберите поверхность в модели перед загрузкой текстуры.');$('#texture-input').click();});
  $('#texture-input').addEventListener('change', async event => {
    const file = event.target.files[0];event.target.value = '';if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast('Используйте изображение PNG, JPG или WebP.');
    if (file.size > 15 * 1024 * 1024) return toast('Размер изображения должен быть меньше 15 МБ.');
    const url = URL.createObjectURL(file);
    try {
      const texture = await new THREE.TextureLoader().loadAsync(url);texture.colorSpace = THREE.SRGBColorSpace;texture.wrapS = texture.wrapT = THREE.RepeatWrapping;texture.anisotropy = 8;viewer.customTextures.add(texture);
      viewer.applyFinish({ texture, name: file.name, color: '#d8d3c8' }, $('#material-scope').value, Number($('#texture-scale').value) / 100);syncMode();toast(`Текстура «${file.name}» применена.`);
    } catch {toast('Не удалось прочитать изображение.');} finally {URL.revokeObjectURL(url);}
  });
  $('#upload-button').addEventListener('click', () => $('#model-input').click());
  $('#model-input').addEventListener('change', async event => {
    const file = event.target.files[0];event.target.value = '';if (!file || busy) return;
    const format = file.name.split('.').pop().toLowerCase();
    if (!['ifc', 'skp', 'glb'].includes(format)) return toast('Поддерживаются IFC, SKP и GLB.');
    if (file.size > 300 * 1024 * 1024) return toast('Для этой локальной версии используйте модель меньше 300 МБ.');
    setBusy(true, `Читаем ${file.name}`);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = format === 'glb' ? buffer : await parseInWorker(buffer, format);
      const data = format === 'ifc' ? parsed : format === 'skp' ? parsed.glb.buffer : parsed;
      if (format === 'ifc') viewer.loadIfc(data);else await viewer.loadGlb(data);
      const id = `upload-${Date.now()}`;uploads.set(id, { name: file.name, format, data });currentModel = id;
      const button = document.createElement('button');button.className = 'model-card';button.dataset.model = id;
      button.innerHTML = `<span class="file-symbol">${format.toUpperCase()}</span><span class="model-copy"><strong>${escapeHtml(file.name)}</strong><small>Открыт локально</small></span><span class="model-radio"></span>`;
      button.addEventListener('click', () => loadModel(id));$('#custom-models').append(button);setModelDetails(id);syncMode();renderLayers();toast('Модель открыта.');
    } catch (error) {showError(error);} finally {setBusy(false);}
  });
  window.addEventListener('keydown', event => {
    if ($('#about-dialog').open || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) return;
    if (event.key.toLowerCase() === 'f') {event.preventDefault();viewer.fit();}
    if (event.key.toLowerCase() === 'm') viewer.setTool(viewer.tool === 'measure' ? 'orbit' : 'measure');
    if (event.key === 'Escape') {viewer.setTool('orbit');viewer.select(null);}
    if (event.key === '/') {event.preventDefault();$('#layer-search').focus();}
    if (event.key === '1') viewer.setView('iso');if (event.key === '2') viewer.setView('top');
  });
  loadModel('ifc');
} catch (error) {setBusy(false);showError(new Error(`3D-просмотр недоступен: ${error.message}. Проверьте поддержку WebGL 2 и аппаратное ускорение в браузере.`));}

$('#error-close').addEventListener('click', () => {$('#error-panel').hidden = true;if (!viewer?.elements.length && viewer) loadModel(currentModel);else if (viewer?.elements.length) setModelDetails(currentModel);});
$('#about-button').addEventListener('click', () => $('#about-dialog').showModal());$('#about-close').addEventListener('click', () => $('#about-dialog').close());
$('#about-dialog').addEventListener('click', e => {if (e.target === $('#about-dialog')) {const r = e.target.getBoundingClientRect();if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();}});
$('#project-panel-toggle').addEventListener('click', () => {$('#project-sidebar').classList.toggle('panel-open');$('#materials-sidebar').classList.remove('panel-open');});
$('#materials-panel-toggle').addEventListener('click', () => {$('#materials-sidebar').classList.toggle('panel-open');$('#project-sidebar').classList.remove('panel-open');});
