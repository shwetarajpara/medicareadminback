const { successResponse, errorResponse } = require("../../helper");
const {
    addParameterDb,
    updateParameterDb,
    getAllParametersDb,
    getParameterByIdDb,
    deleteParameterDb
} = require("../../db/parameter");

const sanitizeParameterPayload = (payload = {}) => ({
    ...(payload.code && { code: payload.code.trim().toUpperCase() }),
    ...(payload.name && { name: payload.name.trim() }),
    ...(payload.category && { category: payload.category.trim() }),
    ...(payload.type && { type: payload.type.toUpperCase() }),
    ...(payload.unit !== undefined && {
        unit: payload.unit ? payload.unit.trim() : null
    }),
    ...(payload.isActive !== undefined && { isActive: payload.isActive })
});

async function addParameter(req, res) {
    try {
        const parameterData = sanitizeParameterPayload(req.body);

        const response = await addParameterDb(parameterData);

        return response.statusCode === 200
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

/**
 * UPDATE PARAMETER
 */
async function updateParameter(req, res) {
    try {
        const { id } = req.params;
        const updateData = sanitizeParameterPayload(req.body);

        const response = await updateParameterDb(id, updateData);

        return response.statusCode === 200
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

async function getAllParameters(req, res) {
    try {
        const response = await getAllParametersDb();
        return response.length > 0
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

async function getParameterById(req, res) {
    try {
        const { id } = req.params;
        const response = await getParameterByIdDb(id);
        return response.length > 0
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

async function deleteParameter(req, res) {
    try {
        const { id } = req.params;
        const response = await deleteParameterDb(id);
        return response.statusCode === 200
            ? successResponse(res, response)
            : errorResponse(res, response);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

module.exports = {
    addParameter,
    updateParameter,
    getAllParameters,
    getParameterById,
    deleteParameter
};
