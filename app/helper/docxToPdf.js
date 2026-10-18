// helper/docxToPdf.js
//
// Converts a .docx buffer to a PDF buffer using LibreOffice's headless mode
// (`soffice --headless --convert-to pdf`). This is what actually produces
// the pixel-accurate output — it renders the real Word document, margins,
// headers/footers, fonts and all, instead of re-deriving a page from HTML.
//
// Deployment note: LibreOffice must be installed wherever this runs.
//   - Local dev (macOS): `brew install --cask libreoffice`
//   - Local dev (Windows): `winget install TheDocumentFoundation.LibreOffice`
//     (or the installer from libreoffice.org)
//   - Linux/Docker (e.g. a Render deploy): `apt-get install -y libreoffice`
//     in the build, or a base image that already has it.
// Set LIBREOFFICE_BIN in .env to override the binary path if it isn't
// found automatically.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const CANDIDATE_PATHS = [
    process.env.LIBREOFFICE_BIN,
    '/Applications/LibreOffice.app/Contents/MacOS/soffice', // macOS (brew cask / direct install)
    '/usr/bin/soffice',                                     // common Linux package path
    '/usr/bin/libreoffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',       // Windows default install
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    'soffice',                                               // fall back to PATH
    'libreoffice',
].filter(Boolean);

let resolvedBinPath = null;

const resolveBinary = () => {
    if (resolvedBinPath) return resolvedBinPath;
    for (const candidate of CANDIDATE_PATHS) {
        // Absolute paths: only accept ones that actually exist on disk.
        if (path.isAbsolute(candidate)) {
            if (fs.existsSync(candidate)) {
                resolvedBinPath = candidate;
                return resolvedBinPath;
            }
            continue;
        }
        // Bare command names (soffice/libreoffice): trust PATH resolution —
        // execFile will fail clearly at call time if it's not really there.
        resolvedBinPath = candidate;
        return resolvedBinPath;
    }
    resolvedBinPath = 'soffice';
    return resolvedBinPath;
};

const convertDocxBufferToPdf = (docxBuffer) => new Promise((resolve, reject) => {
    const bin = resolveBinary();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-docx-'));
    const docxPath = path.join(tmpDir, 'input.docx');
    const cleanup = () => fs.rm(tmpDir, { recursive: true, force: true }, () => {});

    try {
        fs.writeFileSync(docxPath, docxBuffer);
    } catch (err) {
        cleanup();
        return reject(err);
    }

    // -env:UserInstallation points LibreOffice at a throwaway profile dir
    // per conversion — without it, concurrent conversions can corrupt a
    // shared profile lock and hang. pathToFileURL gives a valid file URL on
    // every OS (file:///C:/... on Windows, not the broken file://C:\...).
    const profileDir = path.join(tmpDir, 'lo-profile');
    execFile(
        bin,
        [
            '--headless', '--norestore', '--nologo', '--nofirststartwizard',
            `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
            '--convert-to', 'pdf',
            '--outdir', tmpDir,
            docxPath,
        ],
        // LibreOffice's first (cold) start can take ~20s on a normal PC;
        // warm conversions are a few seconds. Generous headroom so a cold
        // start never surfaces as a failed preview/issue.
        { timeout: 90000 },
        (err, stdout, stderr) => {
            if (err) {
                cleanup();
                if (err.code === 'ENOENT') {
                    // Not installed / not found — let the next call re-probe
                    // in case it gets installed without a server restart.
                    resolvedBinPath = null;
                    return reject(new Error(
                        'LibreOffice is not installed on the server — it is required to generate certificate PDFs. ' +
                        'Install LibreOffice, or set LIBREOFFICE_BIN in .env to the soffice executable path.'
                    ));
                }
                return reject(new Error(
                    `LibreOffice conversion failed (binary: ${bin}): ${stderr || err.message}`
                ));
            }
            const pdfPath = path.join(tmpDir, 'input.pdf');
            if (!fs.existsSync(pdfPath)) {
                cleanup();
                return reject(new Error('LibreOffice did not produce a PDF — ' + (stdout || 'no output')));
            }
            const pdfBuffer = fs.readFileSync(pdfPath);
            cleanup();
            resolve(pdfBuffer);
        }
    );
});

module.exports = { convertDocxBufferToPdf };
