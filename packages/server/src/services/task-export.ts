import fs from 'fs';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } from 'docx';
import ExcelJS from 'exceljs';
import { marked, type Token, type Tokens } from 'marked';
import { getTask } from './tasks.js';
import { AppError } from '../errors.js';

type TaskData = Awaited<ReturnType<typeof getTask>>;

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleString('zh-CN') : '-';
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_').slice(0, 80) || 'task';
}

// Try common system CJK font paths
const CJK_FONT_PATHS = [
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',  // macOS
  '/System/Library/Fonts/STSong.ttf',                      // macOS
  '/usr/share/fonts/noto-cjk/NotoSansCJKsc-Regular.otf',   // Linux
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', // Linux alt
  'C:\\Windows\\Fonts\\msyh.ttf',                           // Windows
];

let _cjkFontPath: string | null | undefined;
function findCJKFont(): string | null {
  if (_cjkFontPath !== undefined) return _cjkFontPath;
  _cjkFontPath = CJK_FONT_PATHS.find(p => fs.existsSync(p)) ?? null;
  return _cjkFontPath;
}

const STATUS_MAP: Record<string, string> = {
  draft: '草稿', aligning: '对齐中', brief_review: '任务书审批',
  team_review: '团队审批', plan_review: '计划审批', executing: '执行中',
  paused: '已暂停', completed: '已完成', failed: '失败', pending: '待执行',
  running: '执行中',
};

function statusText(s: string | null) {
  return STATUS_MAP[s ?? ''] ?? (s || '-');
}

// ---- Markdown helpers ----

type TextSegment = { text: string; bold?: boolean; italic?: boolean; code?: boolean };
type PdfFonts = { regular: string; bold: string };

function flattenInline(tokens: Token[], bold = false, italic = false): TextSegment[] {
  const segs: TextSegment[] = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case 'strong': segs.push(...flattenInline((tok as Tokens.Strong).tokens, true, italic)); break;
      case 'em': segs.push(...flattenInline((tok as Tokens.Em).tokens, bold, true)); break;
      case 'codespan': segs.push({ text: (tok as Tokens.Codespan).text, code: true }); break;
      case 'link': segs.push(...flattenInline((tok as Tokens.Link).tokens, bold, italic)); break;
      case 'br': segs.push({ text: '\n', bold, italic }); break;
      default: {
        const t = (tok as any).text ?? (tok as any).raw ?? '';
        if (t) segs.push({ text: t, bold, italic });
      }
    }
  }
  return segs;
}

function pdfSegments(doc: PDFKit.PDFDocument, segs: TextSegment[], fonts: PdfFonts, opts: PDFKit.Mixins.TextOptions = {}) {
  if (!segs.length) return;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const font = s.code ? 'Courier' : s.bold ? fonts.bold : fonts.regular;
    doc.font(font).text(s.text, { continued: i < segs.length - 1, ...opts });
  }
}

function renderMarkdownToPdf(doc: PDFKit.PDFDocument, markdown: string, fonts: PdfFonts) {
  const tokens = marked.lexer(markdown);
  for (const tok of tokens) {
    switch (tok.type) {
      case 'heading': {
        const sizes: Record<number, number> = { 1: 18, 2: 16, 3: 14 };
        doc.font(fonts.bold).fontSize(sizes[tok.depth] ?? 12).text(tok.text);
        doc.moveDown(0.3).font(fonts.regular).fontSize(10);
        break;
      }
      case 'paragraph': {
        doc.font(fonts.regular).fontSize(10);
        pdfSegments(doc, flattenInline(tok.tokens ?? []), fonts);
        doc.moveDown(0.3);
        break;
      }
      case 'list': {
        doc.font(fonts.regular).fontSize(10);
        tok.items.forEach((item: Tokens.ListItem, i: number) => {
          const prefix = tok.ordered ? `${i + 1}. ` : '• ';
          const inlineToks = item.tokens?.[0] && 'tokens' in item.tokens[0] ? (item.tokens[0] as any).tokens : [];
          const segs = inlineToks.length ? flattenInline(inlineToks) : [{ text: item.text }];
          doc.font(fonts.regular).text(prefix, { continued: true, indent: 15 });
          pdfSegments(doc, segs, fonts);
        });
        doc.moveDown(0.3);
        break;
      }
      case 'table': {
        renderPdfTable(doc, tok as Tokens.Table, fonts);
        break;
      }
      case 'code': {
        const codeY = doc.y;
        const lines = tok.text.split('\n');
        const h = lines.length * 12 + 10;
        if (doc.y + h > 750) doc.addPage();
        const y0 = doc.y;
        doc.rect(50, y0, 495, h).fill('#F0F0F0');
        doc.fillColor('#000000').font('Courier').fontSize(8);
        doc.text(tok.text, 58, y0 + 5, { width: 479 });
        doc.y = y0 + h + 4;
        doc.font(fonts.regular).fontSize(10);
        break;
      }
      case 'hr': {
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke();
        doc.moveDown(0.5);
        break;
      }
      case 'space': doc.moveDown(0.3); break;
      case 'blockquote': {
        doc.font(fonts.regular).fontSize(10);
        const inner = (tok as Tokens.Blockquote).tokens;
        for (const child of inner) {
          if ('tokens' in child) {
            const segs = flattenInline((child as any).tokens);
            doc.text('  │ ', { continued: true });
            pdfSegments(doc, segs, fonts);
          }
        }
        doc.moveDown(0.3);
        break;
      }
    }
  }
}

function renderPdfTable(doc: PDFKit.PDFDocument, tok: Tokens.Table, fonts: PdfFonts) {
  const numCols = tok.header.length;
  const colW = 495 / numCols;
  const startX = 50;
  const cellPad = 4;
  const rowH = 20;

  let y = doc.y;
  // header
  doc.font(fonts.bold).fontSize(8);
  for (let i = 0; i < numCols; i++) {
    const x = startX + i * colW;
    doc.rect(x, y, colW, rowH).stroke();
    doc.text(tok.header[i].text, x + cellPad, y + cellPad, { width: colW - 2 * cellPad, lineBreak: false });
  }
  y += rowH;

  // rows
  doc.font(fonts.regular).fontSize(8);
  for (const row of tok.rows) {
    if (y + rowH > 750) { doc.addPage(); y = 50; }
    for (let i = 0; i < numCols; i++) {
      const x = startX + i * colW;
      doc.rect(x, y, colW, rowH).stroke();
      doc.text(row[i].text, x + cellPad, y + cellPad, { width: colW - 2 * cellPad, lineBreak: false });
    }
    y += rowH;
  }
  doc.x = startX;
  doc.y = y + 4;
  doc.fontSize(10);
}

function docxRunsFromInline(tokens: Token[]): TextRun[] {
  const segs = flattenInline(tokens);
  return segs.map(s => new TextRun({
    text: s.text,
    bold: s.bold || undefined,
    italics: s.italic || undefined,
    font: s.code ? 'Courier New' : undefined,
    shading: s.code ? { type: ShadingType.SOLID, fill: 'E8E8E8', color: 'E8E8E8' } : undefined,
  }));
}

function renderMarkdownToDocx(markdown: string): (Paragraph | Table)[] {
  const tokens = marked.lexer(markdown);
  const els: (Paragraph | Table)[] = [];
  const headingMap = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

  for (const tok of tokens) {
    switch (tok.type) {
      case 'heading':
        els.push(new Paragraph({ children: docxRunsFromInline(tok.tokens ?? []), heading: headingMap[Math.min(tok.depth - 1, 2)] }));
        break;
      case 'paragraph':
        els.push(new Paragraph({ children: docxRunsFromInline(tok.tokens ?? []) }));
        break;
      case 'list':
        for (let i = 0; i < tok.items.length; i++) {
          const item = tok.items[i];
          const inlineToks = item.tokens?.[0] && 'tokens' in item.tokens[0] ? (item.tokens[0] as any).tokens : [];
          const children = inlineToks.length ? docxRunsFromInline(inlineToks) : [new TextRun(item.text)];
          els.push(new Paragraph(tok.ordered
            ? { children, numbering: { reference: 'default-numbering', level: 0 } }
            : { children, bullet: { level: 0 } }));
        }
        break;
      case 'table': {
        const rows: TableRow[] = [];
        rows.push(new TableRow({
          tableHeader: true,
          children: tok.header.map((c: Tokens.TableCell) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: c.text, bold: true })] })],
          })),
        }));
        for (const row of tok.rows) {
          rows.push(new TableRow({
            children: row.map((c: Tokens.TableCell) => new TableCell({
              children: [new Paragraph({ children: [new TextRun(c.text)] })],
            })),
          }));
        }
        els.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        break;
      }
      case 'code':
        for (const line of tok.text.split('\n')) {
          els.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Courier New', size: 18, shading: { type: ShadingType.SOLID, fill: 'E8E8E8', color: 'E8E8E8' } })] }));
        }
        break;
      case 'hr':
        els.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' } }, text: '' }));
        break;
      case 'blockquote': {
        const inner = (tok as Tokens.Blockquote).tokens;
        for (const child of inner) {
          if ('tokens' in child) {
            els.push(new Paragraph({
              children: [new TextRun({ text: '│ ', color: '999999' }), ...docxRunsFromInline((child as any).tokens)],
              indent: { left: 400 },
            }));
          }
        }
        break;
      }
      case 'space':
        els.push(new Paragraph({ text: '' }));
        break;
    }
  }
  return els;
}

export async function exportTask(taskId: string, format: string): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const task = await getTask(taskId);

  switch (format) {
    case 'pdf': return generatePDF(task);
    case 'docx': return generateDocx(task);
    case 'xlsx': return generateXlsx(task);
    default: throw new AppError('VALIDATION_ERROR', `不支持的导出格式: ${format}`);
  }
}

// ---- PDF ----

async function generatePDF(task: TaskData) {
  return new Promise<{ buffer: Buffer; contentType: string; filename: string }>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve({
      buffer: Buffer.concat(chunks),
      contentType: 'application/pdf',
      filename: `${safeFilename(task.title || 'task')}-${task.id}.pdf`,
    }));
    doc.on('error', reject);

    // Register CJK font if available on the system
    const cjkFont = findCJKFont();
    const fontRegular = cjkFont ? 'CJK' : 'Helvetica';
    const fontBold = cjkFont ? 'CJK' : 'Helvetica-Bold';
    if (cjkFont) doc.registerFont('CJK', cjkFont);

    doc.font(fontBold).fontSize(20).text(task.title || 'Untitled Task', { align: 'center' });
    doc.moveDown(0.5);
    doc.font(fontRegular).fontSize(10)
      .text(`${statusText(task.status)}  |  ${fmtDate(task.createdAt)}  |  ${fmtDate(task.updatedAt)}`);
    doc.moveDown();

    const b = task.brief as any;
    if (b) {
      doc.font(fontBold).fontSize(14).text('Task Brief');
      doc.moveDown(0.3);
      doc.font(fontRegular).fontSize(10);
      if (b.objective) doc.text(`${b.objective}`);
      if (b.deliverables) doc.text(`${b.deliverables}`);
      if (b.constraints) doc.text(`${b.constraints}`);
      if (b.acceptanceCriteria) doc.text(`${b.acceptanceCriteria}`);
      doc.moveDown();
    }

    const result = task.result as any;
    if (result) {
      doc.font(fontBold).fontSize(14).text('Task Result');
      doc.moveDown(0.3);
      doc.font(fontRegular).fontSize(10);
      if (result.summary) doc.text(result.summary);
      if (result.deliverables) {
        doc.moveDown(0.3);
        renderMarkdownToPdf(doc, result.deliverables, { regular: fontRegular, bold: fontBold });
      }
      if (result.completedAt) doc.text(fmtDate(result.completedAt));
      doc.moveDown();
    }

    if (task.subtasks.length > 0) {
      doc.font(fontBold).fontSize(14).text('Subtasks');
      doc.moveDown(0.3);
      doc.font(fontRegular).fontSize(10);
      for (const st of task.subtasks) {
        const out = (st.output as any)?.summary ?? '';
        doc.text(`- ${st.title}  [${statusText(st.status)}]  ${st.assigneeName || '-'}${out ? ' / ' + out : ''}`);
      }
    }

    doc.end();
  });
}

// ---- DOCX ----

async function generateDocx(task: TaskData) {
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({ text: task.title || 'Untitled Task', heading: HeadingLevel.TITLE, alignment: 'center' as any }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `Status: ${statusText(task.status)}  |  Created: ${fmtDate(task.createdAt)}  |  Updated: ${fmtDate(task.updatedAt)}`, size: 20, color: '666666' })],
  }));
  children.push(new Paragraph({ text: '' }));

  // Brief
  if (task.brief) {
    const b = task.brief as any;
    children.push(new Paragraph({ text: 'Task Brief', heading: HeadingLevel.HEADING_1 }));
    if (b.objective) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Objective', bold: true })] }));
      children.push(...renderMarkdownToDocx(b.objective));
    }
    if (b.deliverables) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Deliverables', bold: true })] }));
      children.push(...renderMarkdownToDocx(b.deliverables));
    }
    if (b.constraints) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Constraints', bold: true })] }));
      children.push(...renderMarkdownToDocx(b.constraints));
    }
    if (b.acceptanceCriteria) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Acceptance Criteria', bold: true })] }));
      children.push(...renderMarkdownToDocx(b.acceptanceCriteria));
    }
    children.push(new Paragraph({ text: '' }));
  }

  // Result
  const result = task.result as any;
  if (result) {
    children.push(new Paragraph({ text: 'Task Result', heading: HeadingLevel.HEADING_1 }));
    if (result.summary) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Summary', bold: true })] }));
      children.push(...renderMarkdownToDocx(result.summary));
    }
    if (result.deliverables) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Deliverables', bold: true })] }));
      children.push(...renderMarkdownToDocx(result.deliverables));
    }
    if (result.completedAt) children.push(new Paragraph({ children: [new TextRun({ text: 'Completed: ', bold: true }), new TextRun(fmtDate(result.completedAt))] }));
    children.push(new Paragraph({ text: '' }));
  }

  // Subtasks
  if (task.subtasks.length > 0) {
    children.push(new Paragraph({ text: 'Subtasks', heading: HeadingLevel.HEADING_1 }));
    for (const st of task.subtasks) {
      const out = (st.output as any)?.summary ?? '';
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${st.title}`, bold: true }),
          new TextRun({ text: `  [${statusText(st.status)}]  ${st.assigneeName || '-'}`, color: '666666' }),
        ],
        bullet: { level: 0 },
      }));
      if (out) {
        children.push(...renderMarkdownToDocx(out));
      }
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const buf = await Packer.toBuffer(doc);

  return {
    buffer: Buffer.from(buf),
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: `${safeFilename(task.title || 'task')}-${task.id}.docx`,
  };
}

// ---- XLSX ----

async function generateXlsx(task: TaskData) {
  const wb = new ExcelJS.Workbook();
  const result = task.result as any;
  const brief = task.brief as any;

  // Sheet 1: Overview
  const ws1 = wb.addWorksheet('Overview');
  ws1.columns = [{ width: 20 }, { width: 60 }];

  ws1.addRow(['Title', task.title || '-']);
  ws1.addRow(['Status', statusText(task.status)]);
  ws1.addRow(['Created', fmtDate(task.createdAt)]);
  ws1.addRow(['Updated', fmtDate(task.updatedAt)]);
  ws1.addRow([]);

  if (brief) {
    ws1.addRow(['--- Task Brief ---']);
    if (brief.objective) ws1.addRow(['Objective', brief.objective]);
    if (brief.deliverables) ws1.addRow(['Deliverables', brief.deliverables]);
    if (brief.constraints) ws1.addRow(['Constraints', brief.constraints]);
    if (brief.acceptanceCriteria) ws1.addRow(['Acceptance Criteria', brief.acceptanceCriteria]);
    ws1.addRow([]);
  }

  if (result) {
    ws1.addRow(['--- Task Result ---']);
    if (result.summary) ws1.addRow(['Summary', result.summary]);
    if (result.deliverables) ws1.addRow(['Deliverables', result.deliverables]);
    if (result.completedAt) ws1.addRow(['Completed', fmtDate(result.completedAt)]);
  }

  // Bold first column
  ws1.eachRow(row => { row.getCell(1).font = { bold: true }; });

  // Sheet 2: Subtasks
  if (task.subtasks.length > 0) {
    const ws2 = wb.addWorksheet('Subtasks');
    ws2.columns = [
      { header: '#', width: 5 },
      { header: 'Title', width: 30 },
      { header: 'Assignee', width: 15 },
      { header: 'Status', width: 12 },
      { header: 'Output Summary', width: 50 },
    ];
    // Style header
    ws2.getRow(1).font = { bold: true };

    for (let i = 0; i < task.subtasks.length; i++) {
      const st = task.subtasks[i];
      ws2.addRow([i + 1, st.title, st.assigneeName || '-', statusText(st.status), (st.output as any)?.summary ?? '']);
    }
  }

  const buf = await wb.xlsx.writeBuffer();

  return {
    buffer: Buffer.from(buf),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `${safeFilename(task.title || 'task')}-${task.id}.xlsx`,
  };
}
