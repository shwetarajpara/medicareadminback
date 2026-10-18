const { successResponse, errorResponse } = require("../../helper");
const {
    addDefaultParameterRangeDb,
    getDefaultParameterRangeByParameterIdDb,
    updateDefaultParameterRangeDb,
    getSingleParameterRangeByIdDb,
    deleteDefaultParameterRangeDb
} = require("../../db/defaultParameterRange");

const sanitizeDefaultParameterRange = (payload = {}) => {
    const sanitized = {
        ...(payload.parameterId && { parameterId: payload.parameterId }),
        ...(payload.gender && {
            gender: String(payload.gender).toUpperCase()
        }),
        ...(payload.ageFrom !== undefined && {
            ageFrom: Number(payload.ageFrom)
        }),
        ...(payload.ageTo !== undefined && {
            ageTo: payload.ageTo === null ? null : Number(payload.ageTo)
        }),
        ...(payload.minValue !== undefined && {
            minValue: Number(payload.minValue)
        }),
        ...(payload.maxValue !== undefined && {
            maxValue: Number(payload.maxValue)
        }),
        ...(payload.ageType !== undefined && {
            ageType: String(payload.ageType)
        }),
        ...(payload.isActive !== undefined && {
            isActive: Boolean(payload.isActive)
        })
    };
    // Additional validation
    if (sanitized.ageTo !== null && sanitized.ageFrom > sanitized.ageTo) {
        throw new Error('ageTo must be greater than ageFrom');
    }
    if (sanitized.minValue > sanitized.maxValue) {
        throw new Error('maxValue must be greater than minValue');
    }
    if (!['MALE', 'FEMALE', 'BOTH'].includes(sanitized.gender)) {
        throw new Error('gender must be one of: MALE, FEMALE, BOTH');
    }
    return sanitized;
};

async function addDefaultParameterRange(req, res) {
    try {
        const sanitizedData = sanitizeDefaultParameterRange(req.body);
        const response = await addDefaultParameterRangeDb(sanitizedData);
        return response.statusCode === 200
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

async function updateDefaultParameterRange(req, res) {
    try {
        const { parameterRangeId } = req.params;
        const sanitizedData = sanitizeDefaultParameterRange(req.body);
        const response = await updateDefaultParameterRangeDb(parameterRangeId, sanitizedData);
        return response.statusCode === 200
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Get all parameter ranges for a specific parameter
async function getAllParameterRangesByParameterId(req, res) {
    try {
        const { parameterId } = req.params;
        const response = await getDefaultParameterRangeByParameterIdDb(parameterId);
        return response.length > 0
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Get a single parameter range by ID
async function getSingleParameterRange(req, res) {
    try {
        const { parameterRangeId } = req.params;
        const response = await getSingleParameterRangeByIdDb(parameterRangeId);
        return response.length > 0
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

async function deleteParameterRange(req, res) {
    try {
        const { parameterRangeId } = req.params;
        const response = await deleteDefaultParameterRangeDb(parameterRangeId);
        return response.statusCode === 200
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

module.exports = {
    addDefaultParameterRange,
    updateDefaultParameterRange,
    getAllParameterRangesByParameterId,
    getSingleParameterRange,
    deleteParameterRange
}
