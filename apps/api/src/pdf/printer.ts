import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

const require = createRequire(import.meta.url);
// pdfmake's server-side printer (CommonJS).
const PdfPrinter = require('pdfmake') as new (fonts: object) => {
  createPdfKitDocument: (def: TDocumentDefinitions) => NodeJS.ReadableStream & { end: () => void };
};

// SN Pro (SIL OFL 1.1) static instances in apps/api/assets/fonts, embedded (subset) into every PDF.
// pdfkit cannot pick a weight from a variable font, so 400/600 upright and italic are separate files.
// The folder is ../../assets from src/pdf and ../assets from the bundled dist/index.js.
const fontDir = [path.resolve(import.meta.dirname, '../../assets/fonts'), path.resolve(import.meta.dirname, '../assets/fonts')].find((d) => fs.existsSync(d));
if (!fontDir) throw new Error('PDF fonts not found — expected apps/api/assets/fonts');
const font = (file: string) => fs.readFileSync(path.join(fontDir, file));
const printer = new PdfPrinter({
  SNPro: {
    normal: font('SNPro-Regular.ttf'),
    bold: font('SNPro-SemiBold.ttf'),
    italics: font('SNPro-Italic.ttf'),
    bolditalics: font('SNPro-SemiBoldItalic.ttf'),
  },
});

export function renderPdf(def: TDocumentDefinitions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = printer.createPdfKitDocument({
      defaultStyle: { font: 'SNPro', fontSize: 9, lineHeight: 1.2 },
      pageSize: 'A4',
      pageMargins: [36, 40, 36, 48],
      ...def,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
