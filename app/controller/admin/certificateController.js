const moment = require('moment');
const axios = require('axios');
const mammoth = require('mammoth');
const { cloudinary } = require('../../helper/cloudnary');
const certificateModel = require('../../model/certificate');
const certificateTemplateModel = require('../../model/certificateTemplate');
const certificateCounterModel = require('../../model/certificateCounter');
const { successResponse, errorResponse, saveModel, selectdatv2, updateModel, updateModelStrict } = require('../../helper/index');
const { scopeFilter, findScoped } = require('../../middleware/scope');
const { getOrCreateHospitalCode } = require('../../helper/hospitalCode');
const { fillDocxTemplate } = require('../../helper/docxFill');
const { convertDocxBufferToPdf } = require('../../helper/docxToPdf');
const { parseDateFilter } = require('../../helper/dateFilter');

// CRT<hospital code><YYYYMMDD><3-digit seq>, e.g. CRTABC20261005001 — the
// 001 is this hospital's first certificate issued that calendar day (atomic
// per-hospital-per-day counter, see model/certificateCounter.js).
const generateCertificateNumber = async (hospitalId) => {
    const code = await getOrCreateHospitalCode(hospitalId);
    const dateKey = moment().format('YYYYMMDD');

    const counter = await certificateCounterModel.findOneAndUpdate(
        { hospitalId, dateKey },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
    );
    const seq = String(counter.seq).padStart(3, '0');

    return `CRT${code}${dateKey}${seq}`;
};

// {{variableName}} tokens — same mental model as a WhatsApp/SMS template.
// Only used to DETECT variable names (from the docx's plain text) for the
// UI's dynamic form; the actual fill happens inside the real .docx via
// docxFill.js, never through this regex.
const tokenRegex = () => /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const extractVariables = (text) => {
    const seen = new Set();
    const variables = [];
    const regex = tokenRegex();
    let match;
    while ((match = regex.exec(text || '')) !== null) {
        if (!seen.has(match[1])) {
            seen.add(match[1]);
            variables.push(match[1]);
        }
    }
    return variables;
};

const uploadBufferToCloudinary = (buffer, options) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
        if (err) return reject(err);
        resolve(result);
    });
    stream.end(buffer);
});

const fetchBuffer = async (url) => {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
};

// --- Template management (Settings → Certificate Templates) ---
// The uploaded .docx is stored as-is (Cloudinary, resource_type 'raw') and
// IS the template — not an HTML re-rendering of it. mammoth is used only to
// read its plain text and detect {{variables}}; it never touches the file
// that actually gets filled and converted to PDF, so margins, headers/
// footers and fonts are exactly whatever the admin's Word document says.

const addTemplate = async (req, res) => {
    try {
        const { name } = req.body;
        const hospitalId = req.hospitalId;

        if (!name) {
            return errorResponse(res, 'Template name is required');
        }
        if (!req.file) {
            return errorResponse(res, 'A .docx file is required');
        }

        let variables;
        try {
            const { value: text } = await mammoth.extractRawText({ buffer: req.file.buffer });
            variables = extractVariables(text);
        } catch (err) {
            return errorResponse(res, 'Could not read that document. Please upload a valid .docx file.');
        }

        const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
            folder: 'uploads/certificate-templates',
            resource_type: 'raw',
            public_id: `${hospitalId}-${Date.now()}`,
        });

        const newTemplate = await saveModel(certificateTemplateModel, {
            hospitalId, name,
            docxUrl: uploaded.secure_url,
            docxPublicId: uploaded.public_id,
            variables,
        });

        return successResponse(res, 'Template created successfully', newTemplate);
    } catch (error) {
        console.error('Error creating template:', error);
        return errorResponse(res, 'Error creating template');
    }
};

const getTemplates = async (req, res) => {
    try {
        const condition = scopeFilter(req, { delete: false });
        const { data: templates } = await selectdatv2(certificateTemplateModel, condition, '', 0, 0, '', '', { create: -1 });
        return successResponse(res, 'Templates fetched successfully', { templates });
    } catch (error) {
        console.error('Error fetching templates:', error);
        return errorResponse(res, 'Error fetching templates');
    }
};

const editTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const existing = await findScoped(certificateTemplateModel, id, req);
        if (!existing) {
            return errorResponse(res, 'Template not found');
        }

        const updates = { update: new Date() };
        if (name !== undefined) updates.name = name;

        if (req.file) {
            let variables;
            try {
                const { value: text } = await mammoth.extractRawText({ buffer: req.file.buffer });
                variables = extractVariables(text);
            } catch (err) {
                return errorResponse(res, 'Could not read that document. Please upload a valid .docx file.');
            }

            const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
                folder: 'uploads/certificate-templates',
                resource_type: 'raw',
                public_id: `${existing.hospitalId}-${Date.now()}`,
            });

            updates.docxUrl = uploaded.secure_url;
            updates.docxPublicId = uploaded.public_id;
            updates.variables = variables;

            // Best-effort cleanup of the file this one replaces — not
            // critical if it fails (orphaned Cloudinary file, not a
            // correctness issue), so don't let it fail the request.
            if (existing.docxPublicId) {
                cloudinary.uploader.destroy(existing.docxPublicId, { resource_type: 'raw' }).catch(() => {});
            }
        }

        const updated = await updateModelStrict(certificateTemplateModel, { _id: id }, updates);
        return successResponse(res, 'Template updated successfully', updated);
    } catch (error) {
        console.error('Error updating template:', error);
        return errorResponse(res, 'Error updating template');
    }
};

const deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await findScoped(certificateTemplateModel, id, req);
        if (!existing) {
            return errorResponse(res, 'Template not found');
        }

        await updateModel(certificateTemplateModel, { _id: id }, { delete: true, update: new Date() });
        return successResponse(res, 'Template deleted successfully');
    } catch (error) {
        console.error('Error deleting template:', error);
        return errorResponse(res, 'Error deleting template');
    }
};

// --- Certificates ---

const createCertificate = async (req, res) => {
    try {
        const {
            userId, appointmentId, appointmentDetailId, doctorId,
            patientName, patientMobile, templateId, fields = {}
        } = req.body;
        const hospitalId = req.hospitalId;

        if (!patientName || !templateId) {
            return errorResponse(res, 'patientName and templateId are required');
        }

        const template = await certificateTemplateModel.findOne({ _id: templateId, hospitalId, delete: false });
        if (!template) {
            return errorResponse(res, 'Template not found');
        }

        const certificateNumber = await generateCertificateNumber(hospitalId);

        const newCertificate = await saveModel(certificateModel, {
            hospitalId, userId, appointmentId, appointmentDetailId, doctorId,
            patientName, patientMobile,
            templateId: template._id,
            templateName: template.name,
            certificateNumber,
            fields,
        });

        return successResponse(res, 'Certificate saved as draft', newCertificate);
    } catch (error) {
        console.error('Error creating certificate:', error);
        return errorResponse(res, 'Error creating certificate');
    }
};

const getCertificates = async (req, res) => {
    try {
        const { userId, appointmentId, templateId, limit = 50, offset = 0, searchQuery = '' } = req.body;

        const condition = scopeFilter(req, { delete: false });
        if (userId) condition.userId = userId;
        if (appointmentId) condition.appointmentId = appointmentId;
        if (templateId) condition.templateId = templateId;
        // Today / this week / this month / custom range, on the date issued.
        const created = parseDateFilter(req.body);
        if (created) condition.create = created;

        // searchQuery matches patient name / mobile / certificate number /
        // template name server-side, so search covers every page.
        const { data: certificates, totalRecords } = await selectdatv2(
            certificateModel, condition, '', parseInt(limit), parseInt(offset),
            'patientName patientMobile certificateNumber templateName', searchQuery, { create: -1 }
        );

        return successResponse(res, 'Certificates fetched successfully', { certificates, totalRecords });
    } catch (error) {
        console.error('Error fetching certificates:', error);
        return errorResponse(res, 'Error fetching certificates');
    }
};

const getCertificateById = async (req, res) => {
    try {
        const { certificateId } = req.body;
        if (!certificateId) {
            return errorResponse(res, 'certificateId is required');
        }

        const certificate = await certificateModel.findOne(scopeFilter(req, { _id: certificateId, delete: false }))
            .populate('doctorId', 'name')
            .populate('hospitalId', 'name address city');

        if (!certificate) {
            return errorResponse(res, 'Certificate not found');
        }

        return successResponse(res, 'Certificate fetched successfully', certificate);
    } catch (error) {
        console.error('Error fetching certificate:', error);
        return errorResponse(res, 'Error fetching certificate');
    }
};

// Edits only ever touch field VALUES and the patient name now — the
// template's own wording is whatever's in the .docx, no in-app text editor
// to keep in sync, so there's no template-rendering step here anymore (and
// no more "orphaned template" edge case — editing fields never needed the
// template to be resolvable in the first place).
const editCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        const { fields, patientName } = req.body;

        const existing = await findScoped(certificateModel, id, req);
        if (!existing) {
            return errorResponse(res, 'Certificate not found');
        }
        if (existing.status === 'Issued') {
            return errorResponse(res, 'Cannot edit an issued certificate');
        }

        const mergedFields = { ...existing.fields, ...(fields || {}) };
        const resolvedName = patientName || existing.patientName;

        const updated = await updateModelStrict(certificateModel, { _id: id }, {
            fields: mergedFields,
            patientName: resolvedName,
            update: new Date(),
        });

        return successResponse(res, 'Certificate updated successfully', updated);
    } catch (error) {
        console.error('Error updating certificate:', error);
        return errorResponse(res, 'Error updating certificate');
    }
};

// On-demand true-fidelity preview: fills the real .docx with the given
// fields and converts it to PDF via LibreOffice, streaming the PDF straight
// back (nothing saved, nothing uploaded). This is what the admin sees
// before committing to Issue — not a browser mockup.
// If a certificateId is given and that certificate has a manually-edited
// override document (see uploadOverrideDocx below), that file is rendered
// as-is — the admin already finished editing it in Word, so there's nothing
// left to fill. Otherwise falls back to templateId + live fields, same as
// before (the only path available for a brand-new, not-yet-saved certificate).
const renderCertificatePreview = async (req, res) => {
    try {
        const { templateId, fields = {}, certificateId } = req.body;

        if (certificateId) {
            const existing = await findScoped(certificateModel, certificateId, req);
            if (!existing) {
                return errorResponse(res, 'Certificate not found');
            }
            if (existing.overrideDocxUrl) {
                const docxBuffer = await fetchBuffer(existing.overrideDocxUrl);
                const pdfBuffer = await convertDocxBufferToPdf(docxBuffer);
                res.set('Content-Type', 'application/pdf');
                return res.send(pdfBuffer);
            }
        }

        if (!templateId) {
            return errorResponse(res, 'templateId is required');
        }

        const template = await certificateTemplateModel.findOne({ _id: templateId, hospitalId: req.hospitalId, delete: false });
        if (!template) {
            return errorResponse(res, 'Template not found');
        }

        const docxBuffer = await fetchBuffer(template.docxUrl);
        const filledBuffer = fillDocxTemplate(docxBuffer, fields);
        const pdfBuffer = await convertDocxBufferToPdf(filledBuffer);

        res.set('Content-Type', 'application/pdf');
        return res.send(pdfBuffer);
    } catch (error) {
        console.error('Error rendering certificate preview:', error);
        return errorResponse(res, 'Error generating preview: ' + error.message);
    }
};

// Issues a Draft: converts the real .docx to PDF via LibreOffice, uploads
// it, and marks the certificate Issued — all server-side, so the stored
// file is always the true-fidelity render, never a browser screenshot. Uses
// the manually-edited override document if one was uploaded, otherwise
// fills the template fresh from the certificate's saved fields.
const issueCertificate = async (req, res) => {
    try {
        const { certificateId } = req.body;
        if (!certificateId) {
            return errorResponse(res, 'certificateId is required');
        }

        const existing = await findScoped(certificateModel, certificateId, req);
        if (!existing) {
            return errorResponse(res, 'Certificate not found');
        }
        if (existing.status === 'Issued') {
            return errorResponse(res, 'This certificate has already been issued');
        }

        let finalDocxBuffer;
        if (existing.overrideDocxUrl) {
            finalDocxBuffer = await fetchBuffer(existing.overrideDocxUrl);
        } else {
            const template = existing.templateId
                ? await certificateTemplateModel.findById(existing.templateId)
                : null;
            if (!template) {
                console.error(`Certificate ${certificateId} has no resolvable template (templateId: ${existing.templateId})`);
                return errorResponse(res, 'This certificate\'s template is no longer available and cannot be issued');
            }
            const docxBuffer = await fetchBuffer(template.docxUrl);
            finalDocxBuffer = fillDocxTemplate(docxBuffer, existing.fields || {});
        }

        const pdfBuffer = await convertDocxBufferToPdf(finalDocxBuffer);

        const uploaded = await uploadBufferToCloudinary(pdfBuffer, {
            folder: 'uploads',
            resource_type: 'auto',
            public_id: `certificate-${existing.certificateNumber}`,
        });

        const updated = await updateModel(certificateModel, { _id: certificateId }, {
            fileUrl: uploaded.secure_url,
            status: 'Issued',
            issuedAt: new Date(),
            update: new Date(),
        });

        return successResponse(res, 'Certificate issued successfully', updated);
    } catch (error) {
        console.error('Error issuing certificate:', error);
        return errorResponse(res, 'Error issuing certificate: ' + error.message);
    }
};

// --- Per-certificate manual editing round-trip ---
// Lets an admin edit a certificate's wording beyond its declared
// {{variables}} without losing true-fidelity rendering: download the
// filled .docx, edit it in Word, upload it back. Preview/Issue above then
// render that file directly instead of re-filling the template.

const downloadEditableCopy = async (req, res) => {
    try {
        const { certificateId } = req.body;
        if (!certificateId) {
            return errorResponse(res, 'certificateId is required');
        }

        const existing = await findScoped(certificateModel, certificateId, req);
        if (!existing) {
            return errorResponse(res, 'Certificate not found');
        }
        if (existing.status === 'Issued') {
            return errorResponse(res, 'This certificate has already been issued');
        }

        let docxBuffer;
        if (existing.overrideDocxUrl) {
            docxBuffer = await fetchBuffer(existing.overrideDocxUrl);
        } else {
            const template = existing.templateId
                ? await certificateTemplateModel.findById(existing.templateId)
                : null;
            if (!template) {
                return errorResponse(res, 'This certificate\'s template is no longer available');
            }
            const templateBuffer = await fetchBuffer(template.docxUrl);
            docxBuffer = fillDocxTemplate(templateBuffer, existing.fields || {});
        }

        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.set('Content-Disposition', `attachment; filename="${existing.certificateNumber}.docx"`);
        return res.send(docxBuffer);
    } catch (error) {
        console.error('Error generating editable copy:', error);
        return errorResponse(res, 'Error generating editable copy: ' + error.message);
    }
};

const uploadOverrideDocx = async (req, res) => {
    try {
        const { certificateId } = req.body;
        if (!certificateId) {
            return errorResponse(res, 'certificateId is required');
        }
        if (!req.file) {
            return errorResponse(res, 'A .docx file is required');
        }

        const existing = await findScoped(certificateModel, certificateId, req);
        if (!existing) {
            return errorResponse(res, 'Certificate not found');
        }
        if (existing.status === 'Issued') {
            return errorResponse(res, 'This certificate has already been issued');
        }

        const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
            folder: 'uploads/certificate-overrides',
            resource_type: 'raw',
            public_id: `${certificateId}-${Date.now()}`,
        });

        if (existing.overrideDocxPublicId) {
            cloudinary.uploader.destroy(existing.overrideDocxPublicId, { resource_type: 'raw' }).catch(() => {});
        }

        const updated = await updateModel(certificateModel, { _id: certificateId }, {
            overrideDocxUrl: uploaded.secure_url,
            overrideDocxPublicId: uploaded.public_id,
            update: new Date(),
        });

        return successResponse(res, 'Edited document uploaded successfully', updated);
    } catch (error) {
        console.error('Error uploading edited certificate document:', error);
        return errorResponse(res, 'Error uploading edited document: ' + error.message);
    }
};

const discardOverrideDocx = async (req, res) => {
    try {
        const { certificateId } = req.body;
        if (!certificateId) {
            return errorResponse(res, 'certificateId is required');
        }

        const existing = await findScoped(certificateModel, certificateId, req);
        if (!existing) {
            return errorResponse(res, 'Certificate not found');
        }

        if (existing.overrideDocxPublicId) {
            cloudinary.uploader.destroy(existing.overrideDocxPublicId, { resource_type: 'raw' }).catch(() => {});
        }

        const updated = await updateModel(certificateModel, { _id: certificateId }, {
            overrideDocxUrl: null,
            overrideDocxPublicId: null,
            update: new Date(),
        });

        return successResponse(res, 'Reverted to template-based rendering', updated);
    } catch (error) {
        console.error('Error discarding override document:', error);
        return errorResponse(res, 'Error discarding edited document');
    }
};

const deleteCertificate = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await findScoped(certificateModel, id, req);
        if (!existing) {
            return errorResponse(res, 'Certificate not found');
        }

        await updateModel(certificateModel, { _id: id }, { delete: true, update: new Date() });
        return successResponse(res, 'Certificate deleted successfully');
    } catch (error) {
        console.error('Error deleting certificate:', error);
        return errorResponse(res, 'Error deleting certificate');
    }
};

module.exports = {
    getTemplates, addTemplate, editTemplate, deleteTemplate,
    createCertificate, getCertificates, getCertificateById, editCertificate,
    renderCertificatePreview, issueCertificate, deleteCertificate,
    downloadEditableCopy, uploadOverrideDocx, discardOverrideDocx,
};
