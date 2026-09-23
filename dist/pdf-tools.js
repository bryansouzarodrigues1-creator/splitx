const q = (s) => document.querySelector(s);
const toolConfig = {
  organize: { title: 'Organizar PDF', desc: 'Mude a ordem, gire ou apague páginas antes de baixar.', accept: '.pdf,application/pdf', multiple: false, drop: 'Escolher PDF', hint: 'Tudo é feito no seu aparelho', run: 'Abrir páginas' },
  merge: { title: 'Unir PDFs', desc: 'Junte os PDFs e organize a ordem com as setas.', accept: '.pdf,application/pdf', multiple: true, drop: 'Escolher PDFs', hint: 'Escolha dois ou mais arquivos', run: 'Unir PDFs' },
  images: { title: 'Imagens para PDF', desc: 'Crie um PDF com imagens JPG, PNG ou WebP.', accept: 'image/jpeg,image/png,image/webp', multiple: true, drop: 'Escolher imagens', hint: 'Você pode escolher várias', run: 'Criar PDF' },
  extract: { title: 'PDF para imagens', desc: 'Salve cada página do PDF como uma imagem JPG.', accept: '.pdf,application/pdf', multiple: false, drop: 'Escolher PDF', hint: 'As imagens serão baixadas em um ZIP', run: 'Criar imagens' },
  word: { title: 'Word para PDF', desc: 'Transforma o texto de um DOCX em PDF. Documentos mais elaborados podem ficar diferentes.', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', multiple: false, drop: 'Escolher DOCX', hint: 'A formatação pode mudar', run: 'Criar PDF' }
};
let activeTool = null;
let selected = [];
let resultUrls = [];
let pdfLibPromise;
let pdfJsPromise;
let organizerLoadingTask = null;
let organizerDocument = null;
let organizerPages = [];
let organizerRemoved = [];
let organizerRenderId = 0;
let organizerDragIndex = null;

const formatBytes = (n) => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n >= 10 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
};

const loadPdfLib = () => pdfLibPromise ||= import('./vendor/pdf-lib.esm.min.js');
const loadPdfJs = async () => {
  if (!pdfJsPromise) {
    pdfJsPromise = import('./vendor/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
      return lib;
    });
  }
  return pdfJsPromise;
};
const loadJsZip = () => new Promise((resolve, reject) => {
  if (window.JSZip) return resolve(window.JSZip);
  const script = document.createElement('script');
  script.src = './vendor/jszip.min.js';
  script.onload = () => resolve(window.JSZip);
  script.onerror = () => reject(new Error('Não foi possível abrir a ferramenta ZIP.'));
  document.head.append(script);
});

function showMainMode(mode) {
  q('#splitMode').hidden = mode !== 'split';
  q('#joinMode').hidden = mode !== 'join';
  q('#pdfMode').hidden = mode !== 'pdf';
  q('#splitTab').classList.toggle('active', mode === 'split');
  q('#joinTab').classList.toggle('active', mode === 'join');
  q('#pdfTab').classList.toggle('active', mode === 'pdf');
}
q('#pdfTab').addEventListener('click', () => showMainMode('pdf'));
q('#splitTab').addEventListener('click', () => showMainMode('split'));
q('#joinTab').addEventListener('click', () => showMainMode('join'));

q('#pdfTools').addEventListener('click', (event) => {
  const button = event.target.closest('[data-pdf-tool]');
  if (button) openTool(button.dataset.pdfTool);
});

function openTool(name) {
  resetOrganizer();
  activeTool = name;
  selected = [];
  clearResults();
  const config = toolConfig[name];
  q('#pdfTools').hidden = true;
  q('#pdfWork').hidden = false;
  q('#pdfToolTitle').textContent = config.title;
  q('#pdfToolDesc').textContent = config.desc;
  q('#pdfDropTitle').textContent = config.drop;
  q('#pdfDropHint').textContent = config.hint;
  q('#pdfRunLabel').textContent = config.run;
  q('#pdfInput').accept = config.accept;
  q('#pdfInput').multiple = config.multiple;
  q('#pdfInput').value = '';
  q('#pdfRun').hidden = true;
  q('#pdfStatus').hidden = true;
  q('#pdfDrop').hidden = false;
  q('#pdfFileList').hidden = false;
  q('#pdfOrganizer').hidden = true;
  renderFiles();
}

q('#pdfBack').onclick = () => {
  resetOrganizer();
  activeTool = null;
  selected = [];
  clearResults();
  q('#pdfWork').hidden = true;
  q('#pdfTools').hidden = false;
};

const pdfDrop = q('#pdfDrop');
const pdfInput = q('#pdfInput');
pdfDrop.onclick = () => pdfInput.click();
pdfDrop.onkeydown = (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pdfInput.click(); }
};
pdfInput.onchange = () => acceptFiles(pdfInput.files);
['dragenter', 'dragover'].forEach((name) => pdfDrop.addEventListener(name, (e) => { e.preventDefault(); pdfDrop.classList.add('drag'); }));
['dragleave', 'drop'].forEach((name) => pdfDrop.addEventListener(name, (e) => { e.preventDefault(); pdfDrop.classList.remove('drag'); }));
pdfDrop.addEventListener('drop', (e) => acceptFiles(e.dataTransfer.files));

function acceptFiles(fileList) {
  if (!activeTool) return;
  const files = [...fileList];
  selected = toolConfig[activeTool].multiple ? [...selected, ...files] : files.slice(0, 1);
  renderFiles();
}

function renderFiles() {
  const list = q('#pdfFileList');
  list.innerHTML = '';
  selected.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'pdf-file';
    row.innerHTML = `<i>${String(index + 1).padStart(2, '0')}</i><div><strong></strong><small>${formatBytes(file.size)}</small></div><nav><button data-up aria-label="Mover para cima">↑</button><button data-down aria-label="Mover para baixo">↓</button><button data-remove aria-label="Remover">×</button></nav>`;
    row.querySelector('strong').textContent = file.name;
    row.querySelector('[data-up]').onclick = () => move(index, -1);
    row.querySelector('[data-down]').onclick = () => move(index, 1);
    row.querySelector('[data-remove]').onclick = () => { selected.splice(index, 1); renderFiles(); };
    list.append(row);
  });
  q('#pdfRun').hidden = selected.length < (activeTool === 'merge' ? 2 : 1);
}

function move(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= selected.length) return;
  [selected[index], selected[target]] = [selected[target], selected[index]];
  renderFiles();
}

function setProgress(percent, title, text) {
  q('#pdfStatus').hidden = false;
  q('#pdfStatusPct').textContent = `${Math.round(percent)}%`;
  q('#pdfStatusBar').style.width = `${percent}%`;
  q('#pdfStatusTitle').textContent = title;
  if (text) q('#pdfStatusText').textContent = text;
}

function clearResults() {
  resultUrls.forEach(URL.revokeObjectURL);
  resultUrls = [];
  q('#pdfResults').innerHTML = '';
}

function offerDownload(blob, filename, label = 'Pronto para baixar') {
  const url = URL.createObjectURL(blob);
  resultUrls.push(url);
  const row = document.createElement('div');
  row.className = 'pdf-download';
  row.innerHTML = `<div><strong></strong><span></span></div><a>BAIXAR</a>`;
  row.querySelector('strong').textContent = label;
  row.querySelector('span').textContent = `${filename} · ${formatBytes(blob.size)}`;
  const link = row.querySelector('a');
  link.href = url;
  link.download = filename;
  q('#pdfResults').append(row);
}

q('#pdfRun').onclick = async () => {
  if (!activeTool || !selected.length) return;
  clearResults();
  q('#pdfRun').disabled = true;
  setProgress(3, 'Preparando', 'Seu arquivo fica no seu aparelho.');
  try {
    if (activeTool === 'merge') await mergePdfs();
    if (activeTool === 'images') await imagesToPdf();
    if (activeTool === 'extract') await pdfToImages();
    if (activeTool === 'word') await wordToPdf();
    if (activeTool === 'organize') await openOrganizer();
    if (activeTool !== 'organize') setProgress(100, 'Pronto', 'Seu arquivo já pode ser baixado.');
  } catch (error) {
    console.error(error);
    q('#pdfResults').innerHTML = `<div class="pdf-error">Não foi possível abrir este arquivo. Ele pode estar protegido ou danificado.</div>`;
    setProgress(0, 'Não deu certo', error.message || 'Confira o arquivo e tente novamente.');
  } finally {
    q('#pdfRun').disabled = false;
  }
};

function resetOrganizer() {
  organizerRenderId++;
  organizerPages.forEach((page) => { if (page.thumbUrl) URL.revokeObjectURL(page.thumbUrl); });
  organizerRemoved.forEach(({ page }) => { if (page.thumbUrl) URL.revokeObjectURL(page.thumbUrl); });
  organizerPages = [];
  organizerRemoved = [];
  organizerDragIndex = null;
  if (organizerLoadingTask) organizerLoadingTask.destroy().catch(() => {});
  organizerLoadingTask = null;
  organizerDocument = null;
  const organizer = q('#pdfOrganizer');
  if (organizer) organizer.hidden = true;
  const pages = q('#organizerPages');
  if (pages) pages.innerHTML = '';
}

async function openOrganizer() {
  resetOrganizer();
  const renderId = organizerRenderId;
  const pdfjs = await loadPdfJs();
  setProgress(8, 'Abrindo PDF', 'Lendo as páginas sem enviar o arquivo.');
  organizerLoadingTask = pdfjs.getDocument({ data: new Uint8Array(await selected[0].arrayBuffer()) });
  organizerDocument = await organizerLoadingTask.promise;
  organizerPages = Array.from({ length: organizerDocument.numPages }, (_, originalIndex) => ({ originalIndex, rotation: 0, thumbUrl: '' }));
  q('#pdfDrop').hidden = true;
  q('#pdfFileList').hidden = true;
  q('#pdfRun').hidden = true;
  q('#pdfOrganizer').hidden = false;
  renderOrganizer();

  for (let originalIndex = 0; originalIndex < organizerPages.length; originalIndex++) {
    if (renderId !== organizerRenderId) return;
    setProgress(10 + (originalIndex / organizerPages.length) * 82, `Criando miniatura ${originalIndex + 1} de ${organizerPages.length}`);
    const page = await organizerDocument.getPage(originalIndex + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(0.36, 170 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width * pixelRatio));
    canvas.height = Math.max(1, Math.ceil(viewport.height * pixelRatio));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const transform = pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0];
    await page.render({ canvas: null, canvasContext: context, viewport, transform, background: '#ffffff' }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
    if (renderId !== organizerRenderId) return;
    const pageState = organizerPages.find((item) => item.originalIndex === originalIndex)
      || organizerRemoved.find(({ page: removedPage }) => removedPage.originalIndex === originalIndex)?.page;
    if (pageState) {
      pageState.thumbUrl = URL.createObjectURL(blob);
      updateOrganizerThumbnail(organizerPages.indexOf(pageState));
    }
    page.cleanup();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  setProgress(100, 'Páginas prontas', 'Organize como quiser e toque em baixar.');
}

function renderOrganizer() {
  const container = q('#organizerPages');
  container.innerHTML = '';
  organizerPages.forEach((page, index) => {
    const tile = document.createElement('article');
    tile.className = 'organizer-page';
    tile.draggable = true;
    tile.dataset.index = index;
    tile.innerHTML = `<div class="page-preview"><div class="page-loading">CARREGANDO</div></div><div class="page-info"><strong>Página ${page.originalIndex + 1}</strong><span>posição ${index + 1}</span></div><nav><button data-left aria-label="Mover página para esquerda">←</button><button data-right aria-label="Mover página para direita">→</button><button data-rotate-left aria-label="Girar para esquerda">↶</button><button data-rotate-right aria-label="Girar para direita">↷</button><button data-delete aria-label="Apagar página">×</button></nav>`;
    tile.addEventListener('dragstart', () => { organizerDragIndex = index; tile.classList.add('dragging'); });
    tile.addEventListener('dragend', () => { organizerDragIndex = null; tile.classList.remove('dragging'); });
    tile.addEventListener('dragover', (event) => { event.preventDefault(); tile.classList.add('drag-over'); });
    tile.addEventListener('dragleave', () => tile.classList.remove('drag-over'));
    tile.addEventListener('drop', (event) => {
      event.preventDefault();
      tile.classList.remove('drag-over');
      if (organizerDragIndex === null || organizerDragIndex === index) return;
      const [moved] = organizerPages.splice(organizerDragIndex, 1);
      organizerPages.splice(index, 0, moved);
      organizerDragIndex = null;
      renderOrganizer();
    });
    tile.querySelector('[data-left]').onclick = () => moveOrganizerPage(index, -1);
    tile.querySelector('[data-right]').onclick = () => moveOrganizerPage(index, 1);
    tile.querySelector('[data-rotate-left]').onclick = () => rotateOrganizerPage(index, -90);
    tile.querySelector('[data-rotate-right]').onclick = () => rotateOrganizerPage(index, 90);
    tile.querySelector('[data-delete]').onclick = () => removeOrganizerPage(index);
    container.append(tile);
    updateOrganizerThumbnail(index);
  });
  updateOrganizerSummary();
}

function updateOrganizerThumbnail(index) {
  const page = organizerPages[index];
  const tile = q(`#organizerPages [data-index="${index}"]`);
  if (!page || !tile) return;
  const preview = tile.querySelector('.page-preview');
  if (page.thumbUrl) {
    preview.innerHTML = '<img alt="">';
    const image = preview.querySelector('img');
    image.src = page.thumbUrl;
    image.alt = `Miniatura da página ${page.originalIndex + 1}`;
    image.style.transform = `rotate(${page.rotation}deg)`;
  }
}

function updateOrganizerSummary() {
  const total = organizerPages.length;
  q('#organizerCount').textContent = `${total} ${total === 1 ? 'página' : 'páginas'}`;
  q('#organizerUndo').hidden = organizerRemoved.length === 0;
  q('#organizerSave').disabled = total === 0;
}

function moveOrganizerPage(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= organizerPages.length) return;
  [organizerPages[index], organizerPages[target]] = [organizerPages[target], organizerPages[index]];
  renderOrganizer();
}

function rotateOrganizerPage(index, amount) {
  organizerPages[index].rotation = (organizerPages[index].rotation + amount + 360) % 360;
  updateOrganizerThumbnail(index);
}

function removeOrganizerPage(index) {
  const [page] = organizerPages.splice(index, 1);
  organizerRemoved.push({ page, index });
  renderOrganizer();
}

q('#organizerUndo').onclick = () => {
  const removed = organizerRemoved.pop();
  if (!removed) return;
  organizerPages.splice(Math.min(removed.index, organizerPages.length), 0, removed.page);
  renderOrganizer();
};

q('#organizerChange').onclick = () => {
  resetOrganizer();
  selected = [];
  q('#pdfInput').value = '';
  q('#pdfDrop').hidden = false;
  q('#pdfFileList').hidden = false;
  q('#pdfStatus').hidden = true;
  renderFiles();
};

q('#organizerSave').onclick = async () => {
  if (!selected[0] || !organizerPages.length) return;
  clearResults();
  q('#organizerSave').disabled = true;
  try {
    const { PDFDocument, degrees } = await loadPdfLib();
    setProgress(6, 'Montando o novo PDF');
    const source = await PDFDocument.load(await selected[0].arrayBuffer());
    const output = await PDFDocument.create();
    for (let index = 0; index < organizerPages.length; index++) {
      const item = organizerPages[index];
      setProgress(10 + (index / organizerPages.length) * 78, `Copiando página ${index + 1} de ${organizerPages.length}`);
      const [copied] = await output.copyPages(source, [item.originalIndex]);
      const originalRotation = copied.getRotation().angle || 0;
      copied.setRotation(degrees((originalRotation + item.rotation + 360) % 360));
      output.addPage(copied);
    }
    const bytes = await output.save({ useObjectStreams: true });
    const name = selected[0].name.replace(/\.pdf$/i, '') + '-organizado.pdf';
    offerDownload(new Blob([bytes], { type: 'application/pdf' }), name, `${organizerPages.length} páginas organizadas`);
    setProgress(100, 'PDF organizado', 'O arquivo já pode ser baixado.');
  } catch (error) {
    console.error(error);
    q('#pdfResults').innerHTML = `<div class="pdf-error">Não foi possível gerar o novo PDF. ${error.message || ''}</div>`;
    setProgress(0, 'Não deu certo', 'Confira o arquivo e tente novamente.');
  } finally {
    q('#organizerSave').disabled = organizerPages.length === 0;
  }
};

async function mergePdfs() {
  const { PDFDocument } = await loadPdfLib();
  const output = await PDFDocument.create();
  for (let i = 0; i < selected.length; i++) {
    setProgress(8 + (i / selected.length) * 75, `Abrindo PDF ${i + 1} de ${selected.length}`);
    const source = await PDFDocument.load(await selected[i].arrayBuffer());
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  setProgress(88, 'Gerando documento final');
  const bytes = await output.save({ useObjectStreams: true });
  offerDownload(new Blob([bytes], { type: 'application/pdf' }), 'SplitX-unido.pdf', `${output.getPageCount()} páginas unidas`);
}

async function imageAsJpeg(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Uint8Array(await (await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94))).arrayBuffer());
}

async function imagesToPdf() {
  const { PDFDocument } = await loadPdfLib();
  const output = await PDFDocument.create();
  const A4 = [595.28, 841.89];
  for (let i = 0; i < selected.length; i++) {
    setProgress(8 + (i / selected.length) * 78, `Convertendo imagem ${i + 1} de ${selected.length}`);
    const image = await output.embedJpg(await imageAsJpeg(selected[i]));
    const landscape = image.width > image.height;
    const pageSize = landscape ? [A4[1], A4[0]] : A4;
    const page = output.addPage(pageSize);
    const margin = 24;
    const scale = Math.min((pageSize[0] - margin * 2) / image.width, (pageSize[1] - margin * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: (pageSize[0] - width) / 2, y: (pageSize[1] - height) / 2, width, height });
  }
  const bytes = await output.save({ useObjectStreams: true });
  offerDownload(new Blob([bytes], { type: 'application/pdf' }), 'SplitX-imagens.pdf', `${selected.length} imagens convertidas`);
}

async function pdfToImages() {
  const pdfjs = await loadPdfJs();
  const JSZip = await loadJsZip();
  const documentData = new Uint8Array(await selected[0].arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: documentData });
  const pdf = await loadingTask.promise;
  const zip = new JSZip();
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    setProgress(8 + ((pageNumber - 1) / pdf.numPages) * 80, `Renderizando página ${pageNumber} de ${pdf.numPages}`);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    zip.file(`pagina-${String(pageNumber).padStart(3, '0')}.jpg`, blob);
    page.cleanup();
  }
  setProgress(92, 'Empacotando imagens');
  const result = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  offerDownload(result, 'SplitX-paginas.zip', `${pdf.numPages} páginas em JPG`);
  await loadingTask.destroy();
}

function cleanWordText(text) {
  return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\xFF]/g, '');
}

function wrapText(text, font, size, maxWidth) {
  const words = cleanWordText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

async function wordToPdf() {
  const JSZip = await loadJsZip();
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  setProgress(15, 'Lendo estrutura do DOCX');
  const archive = await JSZip.loadAsync(selected[0]);
  const documentEntry = archive.file('word/document.xml');
  if (!documentEntry) throw new Error('Este arquivo não contém um documento DOCX válido.');
  const xml = new DOMParser().parseFromString(await documentEntry.async('text'), 'application/xml');
  const paragraphs = [...xml.getElementsByTagNameNS('*', 'p')].map((paragraph) => {
    const text = [...paragraph.getElementsByTagNameNS('*', 't')].map((node) => node.textContent).join('');
    const styleNode = paragraph.getElementsByTagNameNS('*', 'pStyle')[0];
    const style = styleNode?.getAttribute('w:val') || styleNode?.getAttribute('val') || '';
    return { text, heading: /title|heading|titulo|ttulo/i.test(style) };
  });
  if (!paragraphs.some((p) => p.text.trim())) throw new Error('O documento não contém texto reconhecível.');
  setProgress(45, 'Montando páginas');
  const output = await PDFDocument.create();
  const regular = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28, height = 841.89, margin = 52;
  let page = output.addPage([width, height]);
  let y = height - margin;
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const size = paragraph.heading ? 18 : 11;
    const font = paragraph.heading ? bold : regular;
    const lineHeight = size * 1.45;
    const lines = paragraph.text.trim() ? wrapText(paragraph.text, font, size, width - margin * 2) : [''];
    for (const line of lines) {
      if (y < margin + lineHeight) { page = output.addPage([width, height]); y = height - margin; }
      if (line) page.drawText(line, { x: margin, y, size, font, color: rgb(0.08, 0.08, 0.08) });
      y -= lineHeight;
    }
    y -= paragraph.heading ? 8 : 4;
    if (i % 20 === 0) setProgress(45 + (i / paragraphs.length) * 38, `Formatando parágrafo ${i + 1} de ${paragraphs.length}`);
  }
  setProgress(90, 'Criando PDF');
  const bytes = await output.save({ useObjectStreams: true });
  const name = selected[0].name.replace(/\.docx$/i, '') + '.pdf';
  offerDownload(new Blob([bytes], { type: 'application/pdf' }), name, `${output.getPageCount()} páginas convertidas`);
}
