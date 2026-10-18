const HospitalCustomParameterRange = require('../model/laboratory/hospitalCustomParameterRange');
const { Responses } = require('../utils/responses');

async function getAllHospitalParameterRangesDb(hospitalId) {
    try {
        const parameters = await HospitalCustomParameterRange.find({ 
            hospitalId: hospitalId,
            isActive: true 
        }).sort({ createdAt: -1 });
        return parameters;
    } catch (error) {
        return [];
    }
}

async function getHospitalParameterRangesByParameterIdDb(hospitalId, parameterId) {
    try {
        const parameterRanges = await HospitalCustomParameterRange.find({ 
            hospitalId: hospitalId,
            parameterId: parameterId,
            isActive: true 
        }).sort({ createdAt: -1 });
        return parameterRanges;
    } catch (error) {
        return [];
    }
}

async function getHospitalParameterRangeByIdDb(id) {
    try {
        const parameterRange = await HospitalCustomParameterRange.findById(id);
        return parameterRange ? [parameterRange] : [];
    } catch (error) {
        return [];
    }
}

async function addHospitalParameterRangeDb(data) {
    try {
        const parameterRange = new HospitalCustomParameterRange(data);
        await parameterRange.save();
        return Responses.success;
    } catch (error) {
        console.error('Error adding hospital parameter range:', error);
        return Responses.tryAgain;
    }
}

async function updateHospitalParameterRangeDb(id, data) {
    try {
        // Check if parameter range exists
        const existingParameterRange = await HospitalCustomParameterRange.findById(id);
        if (!existingParameterRange) {
            return Responses.notFound;
        }
        
        await HospitalCustomParameterRange.findByIdAndUpdate(
            id,
            {
                ...data,
                updatedAt: new Date()
            },
            { new: true, runValidators: true }
        );
        return Responses.success;
    } catch (error) {
        console.error('Error updating hospital parameter range:', error);
        return Responses.tryAgain;
    }
}

async function deleteHospitalParameterRangeDb(id) {
    try {
        // Soft delete by setting isActive to false instead of deleting
        await HospitalCustomParameterRange.findByIdAndUpdate(id, 
            { 
                isActive: false,
                updatedAt: new Date()
            }, 
            { new: true }
        );
        return Responses.success;
    } catch (error) {
        console.error('Error deleting hospital parameter range:', error);
        return Responses.tryAgain;
    }
}

module.exports = {
    getAllHospitalParameterRangesDb,
    getHospitalParameterRangesByParameterIdDb,
    getHospitalParameterRangeByIdDb,
    addHospitalParameterRangeDb,
    updateHospitalParameterRangeDb,
    deleteHospitalParameterRangeDb
}