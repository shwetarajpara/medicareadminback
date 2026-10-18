const hospitalModel = require('../../model/hospital');
const { successResponse, errorResponse, updateModel } = require('../../helper/index');

// Hospital-level ABDM settings — the "allow this feature or not" toggle from
// Settings, plus the HFR ID a hospital gets once registered on the Health
// Facility Registry (needed for M2, not M1). The shared bridge Client
// ID/Secret live in env vars (see app/helper/abdmClient.js), not here.

const getAbdmSettings = async (req, res) => {
    try {
        const { hospitalId } = req.body;
        if (!hospitalId) {
            
            return errorResponse(res, 'hospitalId is required');
        }

        const hospital = await hospitalModel.findById(hospitalId).select('abdm');
        if (!hospital) {
            return errorResponse(res, 'Hospital not found');
        }

        return successResponse(res, 'ABDM settings fetched successfully', hospital.abdm || { enabled: false });
    } catch (error) {
        console.error('Error fetching ABDM settings:', error);
        return errorResponse(res, 'Error fetching ABDM settings');
    }
};

const updateAbdmSettings = async (req, res) => {
    try {
        const { hospitalId, enabled, hfrId, environment } = req.body;
        if (!hospitalId) {
            return errorResponse(res, 'hospitalId is required');
        }
        if (environment && !['sandbox', 'production'].includes(environment)) {
            return errorResponse(res, 'environment must be "sandbox" or "production"');
        }

        const update = {};
        if (enabled !== undefined) update['abdm.enabled'] = enabled;
        if (hfrId !== undefined) update['abdm.hfrId'] = hfrId;
        if (environment !== undefined) update['abdm.environment'] = environment;
        update.update = new Date();

        const updated = await updateModel(hospitalModel, { _id: hospitalId }, update);
        return successResponse(res, 'ABDM settings updated successfully', updated.abdm);
    } catch (error) {
        console.error('Error updating ABDM settings:', error);
        return errorResponse(res, 'Error updating ABDM settings');
    }
};

module.exports = { getAbdmSettings, updateAbdmSettings };
