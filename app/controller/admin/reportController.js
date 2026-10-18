const reportModel = require('../../model/report');
const { successResponse, errorResponse, saveModel, selectdatv2, updateModel } = require('../../helper/index');
const { scopeFilter, findScoped } = require('../../middleware/scope');

const addReport = async (req, res) => {
    try {
        const {
            caseId, name, gender, dateOfBirth, age,
            referredBy, doctorNumber, address, mobile, tests, registeredTime
        } = req.body;

        if (!caseId) {
            return errorResponse(res, 'caseId is required');
        }

        const newReport = await saveModel(reportModel, {
            hospitalId: req.hospitalId || undefined,
            caseId, name, gender, dateOfBirth, age,
            referredBy, doctorNumber, address, mobile,
            tests: tests || [],
            registeredTime
        });

        return successResponse(res, 'Report created successfully', newReport);
    } catch (error) {
        console.error('Error creating report:', error);
        return errorResponse(res, 'Error creating report');
    }
};

const getReports = async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.body;

        const condition = scopeFilter(req, { delete: false });

        const { data: reports, totalRecords } = await selectdatv2(
            reportModel,
            condition,
            '',
            parseInt(limit),
            parseInt(offset),
            '',
            '',
            { create: -1 }
        );

        return successResponse(res, 'Reports fetched successfully', { reports, totalRecords });
    } catch (error) {
        console.error('Error fetching reports:', error);
        return errorResponse(res, 'Error fetching reports');
    }
};

const updateReport = async (req, res) => {
    try {
        const { reportId, ...rest } = req.body;

        if (!reportId) {
            return errorResponse(res, 'reportId is required');
        }

        const existing = await findScoped(reportModel, reportId, req);
        if (!existing) {
            return errorResponse(res, 'Report not found');
        }

        delete rest.hospitalId; // ownership already verified above; never reassignable here

        const updated = await updateModel(reportModel, { _id: reportId }, { ...rest, update: new Date() });
        return successResponse(res, 'Report updated successfully', updated);
    } catch (error) {
        console.error('Error updating report:', error);
        return errorResponse(res, 'Error updating report');
    }
};

module.exports = { addReport, getReports, updateReport };
