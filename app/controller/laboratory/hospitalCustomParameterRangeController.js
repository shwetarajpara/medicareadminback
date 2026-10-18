const { successResponse, errorResponse } = require("../../helper");
const {
    addHospitalParameterRangeDb,
    getHospitalParameterRangesByParameterIdDb,
    updateHospitalParameterRangeDb,
    getHospitalParameterRangeByIdDb,
    deleteHospitalParameterRangeDb,
    getAllHospitalParameterRangesDb
} = require("../../db/hospitalCustomParameterRange");

const sanitizeHospitalParameterRange = (payload = {}) => {
    const sanitized = {
        ...(payload.hospitalId && { hospitalId: payload.hospitalId }),
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
    if (sanitized.gender && !['MALE', 'FEMALE', 'BOTH'].includes(sanitized.gender)) {
        throw new Error('gender must be one of: MALE, FEMALE, BOTH');
    }
    return sanitized;
};

// Add a new hospital parameter range
async function addHospitalParameterRange(req, res) {
    try {
        const sanitizedData = sanitizeHospitalParameterRange(req.body);
        const response = await addHospitalParameterRangeDb(sanitizedData);
        return response.statusCode === 200
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Update an existing hospital parameter range
async function updateHospitalParameterRange(req, res) {
    try {
        const { parameterRangeId } = req.params;
        const sanitizedData = sanitizeHospitalParameterRange(req.body);
        const response = await updateHospitalParameterRangeDb(parameterRangeId, sanitizedData);
        return response.statusCode === 200
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Get all parameter ranges for a specific hospital and parameter
async function getHospitalParameterRangesByParameterId(req, res) {
    try {
        const { hospitalId, parameterId } = req.params;
        const response = await getHospitalParameterRangesByParameterIdDb(hospitalId, parameterId)
        return response && response.length > 0
            ? successResponse(res, response)
            : errorResponse(res, response || 'No parameter ranges found');
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Get a single parameter range by ID
async function getHospitalParameterRangeById(req, res) {
    try {
        const { parameterRangeId } = req.params;
        const response = await getHospitalParameterRangeByIdDb(parameterRangeId);
        return response && response.length > 0
            ? successResponse(res, response[0])
            : errorResponse(res, 'Parameter range not found', 404);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Delete a parameter range (soft delete by setting isActive to false)
async function deleteHospitalParameterRange(req, res) {
    try {
        const { parameterRangeId } = req.params;
        const response = await deleteHospitalParameterRangeDb(parameterRangeId);
        return response.statusCode === 200
            ? successResponse(res, { message: 'Parameter range deleted successfully' })
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

module.exports = {
    addHospitalParameterRange,
    updateHospitalParameterRange,
    getHospitalParameterRangesByParameterId,
    getHospitalParameterRangeById,
    deleteHospitalParameterRange
}
