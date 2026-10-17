import { createRequire } from 'node:module';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

const require = createRequire(import.meta.url);
// pdfmake's server-side printer (CommonJS) and its bundled Roboto font files.
const PdfPrinter = require('pdfmake') as new (fonts: object) => {
  createPdfKitDocument: (def: TDocumentDefinitions) => NodeJS.ReadableStream & { end: () => void };
};
const vfs = require('pdfmake/build/vfs_fonts.js') as Record<string, string>;

const font = (name: string) => Buffer.from(vfs[name], 'base64');
const printer = new PdfPrinter({
  Roboto: {
    normal: font('Roboto-Regular.ttf'),
    bold: font('Roboto-Medium.ttf'),
    italics: font('Roboto-Italic.ttf'),
    bolditalics: font('Roboto-MediumItalic.ttf'),
  },
});

export function renderPdf(def: TDocumentDefinitions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = printer.createPdfKitDocument({
      defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.2 },
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
