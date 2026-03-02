import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.docx', '.xlsx', '.pptx']);

// Safety limits to prevent memory/decompression bombs
const MAX_TEXT_LENGTH = 500_000;       // 50万字符上限
const MAX_XLSX_ROWS = 50_000;         // xlsx 最大行数
const MAX_XLSX_SHEETS = 20;           // xlsx 最大 sheet 数
const MAX_XLSX_DECOMPRESSED = 100 * 1024 * 1024; // xlsx 解压上限 100MB
const MAX_PPTX_SLIDES = 200;          // pptx 最大幻灯片数
const MAX_PPTX_DECOMPRESSED = 100 * 1024 * 1024; // pptx 解压上限 100MB

function truncateText(text: string): string {
  if (text.length > MAX_TEXT_LENGTH) {
    return text.slice(0, MAX_TEXT_LENGTH) + '\n\n[... 内容已截断，超出最大长度限制]';
  }
  return text;
}

function estimateZipUncompressedSize(zip: JSZip): number {
  let totalSize = 0;
  for (const file of Object.values(zip.files)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internal = file as any;
    if (!file.dir && internal._data && typeof internal._data.uncompressedSize === 'number') {
      totalSize += internal._data.uncompressedSize;
    }
  }
  return totalSize;
}

export function isSupportedFile(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export async function parseFileContent(
  buffer: Buffer,
  filename: string,
  _mimeType?: string,
): Promise<{ text: string; detectedMimeType: string }> {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();

  switch (ext) {
    case '.txt':
      return { text: truncateText(buffer.toString('utf-8')), detectedMimeType: 'text/plain' };
    case '.md':
      return { text: truncateText(buffer.toString('utf-8')), detectedMimeType: 'text/markdown' };
    case '.pdf':
      return parsePdf(buffer);
    case '.docx':
      return parseDocx(buffer);
    case '.xlsx':
      return parseXlsx(buffer);
    case '.pptx':
      return parsePptx(buffer);
    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }
}

async function parsePdf(buffer: Buffer): Promise<{ text: string; detectedMimeType: string }> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: truncateText(result.text), detectedMimeType: 'application/pdf' };
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(buffer: Buffer): Promise<{ text: string; detectedMimeType: string }> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: truncateText(result.value), detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
}

async function parseXlsx(buffer: Buffer): Promise<{ text: string; detectedMimeType: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const totalSize = estimateZipUncompressedSize(zip);
  if (totalSize > MAX_XLSX_DECOMPRESSED) {
    throw new Error(`XLSX 解压后大小 (${Math.round(totalSize / 1024 / 1024)}MB) 超出限制 (${MAX_XLSX_DECOMPRESSED / 1024 / 1024}MB)`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const lines: string[] = [];
  let totalRows = 0;
  let sheetCount = 0;
  workbook.eachSheet((sheet) => {
    if (sheetCount >= MAX_XLSX_SHEETS) return;
    sheetCount++;
    lines.push(`## ${sheet.name}`);
    sheet.eachRow((row) => {
      if (totalRows >= MAX_XLSX_ROWS) return;
      totalRows++;
      const cells = (row.values as unknown[]).slice(1).map(v => (v != null ? String(v) : ''));
      lines.push(cells.join('\t'));
    });
    lines.push('');
  });
  if (totalRows >= MAX_XLSX_ROWS) {
    lines.push(`\n[... 行数已截断，超出最大 ${MAX_XLSX_ROWS} 行限制]`);
  }
  return { text: truncateText(lines.join('\n')), detectedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

async function parsePptx(buffer: Buffer): Promise<{ text: string; detectedMimeType: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const totalSize = estimateZipUncompressedSize(zip);
  if (totalSize > MAX_PPTX_DECOMPRESSED) {
    throw new Error(`PPTX 解压后大小 (${Math.round(totalSize / 1024 / 1024)}MB) 超出限制 (${MAX_PPTX_DECOMPRESSED / 1024 / 1024}MB)`);
  }

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? '0');
      return numA - numB;
    })
    .slice(0, MAX_PPTX_SLIDES);

  const texts: string[] = [];
  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async('string');
    const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g);
    if (matches) {
      const slideText = matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ');
      texts.push(slideText);
    }
  }
  return { text: truncateText(texts.join('\n\n')), detectedMimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
}
