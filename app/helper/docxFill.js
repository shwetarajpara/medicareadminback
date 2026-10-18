// helper/docxFill.js
//
// Mail-merge: fills {{variable}} tags directly inside the real .docx XML —
// not an HTML re-rendering — so every bit of the original formatting
// (margins, headers/footers, fonts, exact spacing) survives untouched.
// What comes out is still a genuine .docx; docxToPdf.js converts that to
// a PDF via LibreOffice for the actual printable/downloadable output.
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const fillDocxTemplate = (docxBuffer, fields = {}) => {
    const zip = new PizZip(docxBuffer);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' }, // matches the {{var}} convention used everywhere else
        nullGetter: () => '', // an unfilled variable (e.g. previewing a partial Draft) renders blank, not a crash
    });
    doc.render(fields);
    return doc.getZip().generate({ type: 'nodebuffer' });
};

module.exports = { fillDocxTemplate };
