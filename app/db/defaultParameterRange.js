const DefaultParameterRange = require('../model/laboratory/defaultParameterRange');
const { Responses } = require('../utils/responses');

async function getAllDefaultParameterRangeDb() {
    try {
        const parameters = await DefaultParameterRange.find({ delete: false }).sort({ create: -1 });
        return parameters;
    } catch (error) {
        return [];
    }
}

async function getDefaultParameterRangeByParameterIdDb(parameterId) {
    try {
        const parameterRanges = await DefaultParameterRange.find({ parameterId: parameterId, delete: false }).sort({ create: -1 });
        return parameterRanges;
    } catch (error) {
        return [];
    }
}

async function getSingleParameterRangeByIdDb(id) {
    try {
        const parameterRange = await DefaultParameterRange.findById(id);
        return [parameterRange];
    } catch (error) {
        return [];
    }
}

async function addDefaultParameterRangeDb(data) {
    try {
        const parameterRange = new DefaultParameterRange(data);
        await parameterRange.save();
        return Responses.success;
    } catch (error) {
        return Responses.tryAgain;
    }
}

async function updateDefaultParameterRangeDb(id, data) {
    try {
        //check if parameter exists
        const existingParameterRange = await DefaultParameterRange.findById(id);
        if (!existingParameterRange) {
            return Responses.notFound;
        }
        const updatedParameterRange = await DefaultParameterRange.findByIdAndUpdate(
            id,
            {
                ...data,
                updatedAt: new Date()
            },
            { new: true, runValidators: true }
        ).lean();
        return Responses.success;
    } catch (error) {
        return Responses.tryAgain;
    }
}

async function deleteDefaultParameterRangeDb(id) {
    try {
        const deletedDefaultParameterRange = await DefaultParameterRange.findByIdAndUpdate(id,
            {
                delete: true,
                updatedAt: new Date()
            }, { new: true }).lean();
        return Responses.success;
    } catch (error) {
        return Responses.tryAgain;
    }
}

module.exports = {
    getDefaultParameterRangeByParameterIdDb,
    getSingleParameterRangeByIdDb,
    addDefaultParameterRangeDb,
    updateDefaultParameterRangeDb,
    deleteDefaultParameterRangeDb,
}