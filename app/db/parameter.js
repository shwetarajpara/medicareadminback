const Parameter = require('../model/laboratory/parameter');
const { Responses } = require('../utils/responses');

async function getAllParametersDb() {
    try {
        const parameters = await Parameter.find({ delete: false }).sort({ create: -1 });
        return parameters;
    } catch (error) {
        return [];
    }
}

async function getParameterByIdDb(id) {
    try {
        const parameter = await Parameter.findById(id);

        return [parameter];
    } catch (error) {
        return [];
    }
}

async function addParameterDb(data) {
    try {
        //check if parameter with same code already exists 
        const existingParameter = await Parameter.findOne({
            code: { $regex: new RegExp(`^${data.code}$`, 'i') },
            delete: false
        }); 
        if (existingParameter) {
            return Responses.alreadyExist;
        }
        const parameter = new Parameter(data);
        await parameter.save();
        return Responses.success;
    } catch (error) {
        return Responses.tryAgain;
    }
}

async function updateParameterDb(id, data) {
    try {
        //check if parameter exists
        const existingParameter = await Parameter.findById(id);
        if (!existingParameter) {
            return Responses.notFound;
        }
        // If code is being updated, check for duplicates
        if (data.code && data.code !== existingParameter.code) {
            const codeExists = await Parameter.findOne({
                code: data.code,
                _id: { $ne: id },
                delete: { $ne: true }
            });
            if (codeExists) {
                return {
                    ...Responses.alreadyExist,
                    clientMessage: { Message: 'Another parameter with this code already exists' }
                };
            }
        }
        const updatedParameter = await Parameter.findByIdAndUpdate(
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

async function deleteParameterDb(id) {
    try {
        const deletedParameter = await Parameter.findByIdAndUpdate(id,
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
    getAllParametersDb,
    getParameterByIdDb,
    addParameterDb,
    updateParameterDb,
    deleteParameterDb
}