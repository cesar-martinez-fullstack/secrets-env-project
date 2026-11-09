/**
 * Generador de reportes PDF — implementado a mano (PDF 1.4, fuentes base Helvetica/Courier),
 * sin dependencias externas. Produce un reporte estilizado apto para impresión:
 * cabecera con banda de color, tabla variable/valor con monospace, notas y pie con paginación.
 */
import type { ExportEntry } from '@secretvault/core';
import { APP_NAME } from '@secretvault/shared';

const PAGE_W = 595; // A4 en puntos
const PAGE_H = 842;
const MARGIN = 40;
const INDIGO: [number, number, number] = [0.31, 0.275, 0.898]; // #4F46E5
const INK: [number, number, number] = [0.18, 0.18, 0.2];
const GRAY: [number, number, number] = [0.45, 0.47, 0.53];
const LIGHT: [number, number, number] = [0.955, 0.96, 0.98];
const HAIR: [number, number, number] = [0.88, 0.89, 0.92];

const NAME_X = MARGIN + 10;
const NAME_W = 160;
const VALUE_X = MARGIN + 180;
const VALUE_W = PAGE_W - MARGIN * 2 - 180;
const ROW_PAD = 5;
const LINE_H = 11;

export interface PdfExportOptions {
  environmentName: string;
  generatedAt: Date;
  entries: ExportEntry[];
  iterations: number;
}

interface Line {
  text: string;
  x: number;
  y: number;
  font: 'F1' | 'F2' | 'F3' | 'F4';
  size: number;
  color: [number, number, number];
}

export function buildPdfExport(options: PdfExportOptions): Uint8Array {
  const pages: { lines: Line[]; rects: string[] }[] = [];
  let current = newPage();
  let y: number;

  const headerBandHeight = 64;
  const tableHeaderHeight = 24;

  function newPage() {
    const page = { lines: [] as Line[], rects: [] as string[] };
    pages.push(page);
    return page;
  }

  function emitHeader(page: { lines: Line[]; rects: string[] }, isFirst: boolean) {
    // Banda de color
    page.rects.push(rect(0, PAGE_H - headerBandHeight, PAGE_W, headerBandHeight, INDIGO));
    page.lines.push({
      text: `${APP_NAME} — Reporte de Secretos`,
      x: MARGIN,
      y: PAGE_H - 34,
      font: 'F2',
      size: 15,
      color: [1, 1, 1],
    });
    page.lines.push({
      text: `Ambiente: ${options.environmentName}`,
      x: MARGIN,
      y: PAGE_H - 52,
      font: 'F1',
      size: 10,
      color: [0.85, 0.86, 0.95],
    });
    const generated = options.generatedAt.toISOString().replace('T', ' ').slice(0, 19);
    page.lines.push({
      text: `Generado: ${generated} UTC  •  ${options.entries.length} secreto(s)`,
      x: MARGIN,
      y: PAGE_H - headerBandHeight - 18,
      font: 'F1',
      size: 8.5,
      color: GRAY,
    });
    // Cabecera de tabla
    const tableTop = PAGE_H - headerBandHeight - 30;
    page.rects.push(
      rect(MARGIN, tableTop - tableHeaderHeight, PAGE_W - MARGIN * 2, tableHeaderHeight, LIGHT),
    );
    page.lines.push({
      text: 'VARIABLE',
      x: NAME_X,
      y: tableTop - 15,
      font: 'F2',
      size: 8,
      color: INDIGO,
    });
    page.lines.push({
      text: 'VALOR',
      x: VALUE_X,
      y: tableTop - 15,
      font: 'F2',
      size: 8,
      color: INDIGO,
    });
    page.lines.push({
      text: isFirst
        ? 'ADVERTENCIA: documento con secretos en texto claro. Almacénalo o destrúyelo con cuidado.'
        : 'SecretVault — continuación',
      x: MARGIN,
      y: 40,
      font: 'F1',
      size: 7.5,
      color: GRAY,
    });
    return tableTop - tableHeaderHeight; // primer y disponible para filas
  }

  y = emitHeader(current, true);

  if (options.entries.length === 0) {
    current.lines.push({
      text: 'No hay secretos en este ambiente.',
      x: NAME_X,
      y: y - 24,
      font: 'F1',
      size: 10,
      color: GRAY,
    });
  }

  const nameChars = Math.floor(NAME_W / (8 * 0.6));
  const valueChars = Math.floor(VALUE_W / (8 * 0.6));

  for (const entry of options.entries) {
    const nameLines = wrapMono(entry.name, nameChars);
    const valueLines = wrapMono(entry.value, valueChars);
    const noteLines = entry.note
      ? wrapProportional(`Nota: ${entry.note}`, VALUE_X, PAGE_W - MARGIN)
      : [];

    const rowHeight =
      Math.max(nameLines.length, valueLines.length) * LINE_H + ROW_PAD * 2 + noteLines.length * 9;

    if (y - rowHeight < 60) {
      current = newPage();
      y = emitHeader(current, false);
    }

    const ty = y - ROW_PAD - 8;

    nameLines.forEach((text, i) => {
      current.lines.push({
        text,
        x: NAME_X,
        y: ty - i * LINE_H,
        font: 'F3',
        size: 8,
        color: INK,
      });
    });
    valueLines.forEach((text, i) => {
      current.lines.push({
        text,
        x: VALUE_X,
        y: ty - i * LINE_H,
        font: 'F3',
        size: 8,
        color: INK,
      });
    });
    const valueBlockBottom = ty - (Math.max(nameLines.length, valueLines.length) - 1) * LINE_H;
    noteLines.forEach((text, i) => {
      current.lines.push({
        text,
        x: VALUE_X,
        y: valueBlockBottom - 10 - i * 9,
        font: 'F1',
        size: 7,
        color: GRAY,
      });
    });

    y -= rowHeight;
    current.rects.push(rect(MARGIN, y + 1, PAGE_W - MARGIN * 2, 0.7, HAIR));
  }

  // Ensamblar streams por página
  const pageStreams = pages.map((page, index) => {
    const ops: string[] = [];
    for (const r of page.rects) ops.push(r);
    for (const line of page.lines) {
      ops.push(
        `BT /${line.font} ${line.size} Tf ${line.color[0]} ${line.color[1]} ${line.color[2]} rg ` +
          `1 0 0 1 ${line.x} ${round2(line.y)} Tm (${escapePdfText(line.text)}) Tj ET`,
      );
    }
    ops.push(
      `BT /F1 7.5 Tf ${GRAY[0]} ${GRAY[1]} ${GRAY[2]} rg ` +
        `1 0 0 1 ${PAGE_W / 2 - 60} 24 Tm (Página ${index + 1} de ${pages.length}) Tj ET`,
    );
    return ops.join('\n');
  });

  return assemblePdf(pageStreams);
}

/** Divide texto respetando saltos de línea explícitos y ancho en caracteres (mono). */
function wrapMono(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.length === 0) {
      out.push('');
      continue;
    }
    for (let i = 0; i < raw.length; i += maxChars) {
      out.push(raw.slice(i, i + maxChars));
    }
  }
  return out.length > 0 ? out : [''];
}

/** Aproximación para fuente proporcional (Helvetica 7pt ≈ 3.9pt por carácter). */
function wrapProportional(text: string, startX: number, endX: number): string[] {
  const maxChars = Math.max(10, Math.floor((endX - startX) / 3.9));
  return wrapMono(text, maxChars);
}

function rect(x: number, y: number, w: number, h: number, color: [number, number, number]): string {
  return `q ${color[0]} ${color[1]} ${color[2]} rg ${round2(x)} ${round2(y)} ${round2(w)} ${round2(h)} re f Q`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Escape de texto para cadenas PDF + codificación WinAnsi (latin1). */
function escapePdfText(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63;
    if (ch === '(' || ch === ')' || ch === '\\') {
      out += '\\' + ch;
    } else if (code >= 32 && code <= 255) {
      out += ch;
    } else if (ch === '\n' || ch === '\r' || ch === '\t') {
      out += ' ';
    } else {
      out += '?';
    }
  }
  return out;
}

/**
 * Ensambla el archivo PDF final: catálogo, páginas, 4 fuentes base, streams
 * de contenido, xref y trailer con offsets de bytes calculados.
 */
function assemblePdf(pageStreams: string[]): Uint8Array {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (s: string) => {
    const buf = Buffer.from(s, 'latin1');
    chunks.push(buf);
    length += buf.length;
  };

  const FONT_COUNT = 4; // F1..F4
  const INFO_OBJ = 3 + FONT_COUNT; // 7
  const FIRST_PAGE_OBJ = INFO_OBJ + 1; // 8
  const pageObjNumbers = pageStreams.map((_, i) => FIRST_PAGE_OBJ + i * 2);

  const addObject = (content: string) => {
    offsets.push(length);
    push(`${offsets.length} 0 obj\n${content}\nendobj\n`);
  };

  push('%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n');

  const kids = pageObjNumbers.map((n) => `${n} 0 R`).join(' ');
  addObject(`<< /Type /Catalog /Pages 2 0 R >>`);
  addObject(`<< /Type /Pages /Kids [${kids}] /Count ${pageStreams.length} >>`);

  const fonts = ['Helvetica', 'Helvetica-Bold', 'Courier', 'Courier-Bold'];
  fonts.forEach((base) => {
    addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`);
  });

  const infoId = `SecretVault-${Date.now()}`;
  addObject(
    `<< /Title (SecretVault \\226 Reporte de Secretos) /Producer (${APP_NAME}) /Creator (${APP_NAME}) /CreationDate (D:${toPdfDate(new Date())}) /ModDate (D:${toPdfDate(new Date())}) /Subject (${infoId}) >>`,
  );

  pageStreams.forEach((stream, i) => {
    const pageObj = FIRST_PAGE_OBJ + i * 2;
    const contentObj = pageObj + 1;
    addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> ` +
        `/Contents ${contentObj} 0 R >>`,
    );
    const streamBytes = Buffer.from(stream, 'latin1');
    offsets.push(length);
    chunks.push(
      Buffer.from(`${contentObj} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`, 'latin1'),
    );
    length += chunks[chunks.length - 1]!.length;
    chunks.push(streamBytes);
    length += streamBytes.length;
    chunks.push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
    length += chunks[chunks.length - 1]!.length;
  });

  const xrefOffset = length;
  const totalObjects = offsets.length;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R /Info ${INFO_OBJ} 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`,
  );

  return new Uint8Array(Buffer.concat(chunks));
}

function toPdfDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}
