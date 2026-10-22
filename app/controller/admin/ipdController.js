const { successResponse, errorResponse } = require('../../helper/index');
const Appointment = require('../../model/appointment');
const AppointmentDetail = require('../../model/appointmentdetail');
const IPD = require('../../model/ipd');
const IpdDetail = require('../../model/ipdDetails');
const Doctor = require('../../model/doctor');
const mongoose = require('mongoose');
const { scopeFilter, departmentFilter } = require('../../middleware/scope');
const { parsePrescriptions } = require('../../helper/prescriptions');
const { parsePagination, paginationMeta, searchRegex } = require('../../helper/pagination');
const { parseDateFilter } = require('../../helper/dateFilter');

// IpdDetail (instructions) has no hospitalId of its own — ownership is
// checked via its parent IPD record.
const findIpdScoped = (ipdId, req) => IPD.findOne(scopeFilter(req, { _id: ipdId }));

const moveToIpd = async (req, res) => {
    try {
        const { appointmentId } = req.body;

        if (!appointmentId) return errorResponse(res, 'Appointment ID is required');

        // Find the appointment — scoped so a hospital login can only move
        // its own appointments into IPD.
        const appointment = await Appointment.findOne(scopeFilter(req, { _id: appointmentId }));
        if (!appointment) {
            return errorResponse(res, 'Appointment not found');
        }

        // Find the appointment details
        const appointmentDetail = await AppointmentDetail.findOne({ appointmentId: appointmentId });

        // Check if already moved to IPD
        const existingIpd = await IPD.findOne({ appointmentId: appointmentId });
        if (existingIpd) {
            return errorResponse(res, 'Appointment already moved to IPD');
        }

        // Derive department from the doctor's current specializationId
        // (rather than trusting a possibly-stale appointment.departmentId) —
        // undefined/missing is fine, it matches every department filter.
        const doctor = appointment.doctorId
            ? await Doctor.findById(appointment.doctorId).select('specializationId')
            : null;

        // Create IPD record with all appointment data
        const ipdData = {
            appointmentId: appointment._id,
            appointmentDetailId: appointmentDetail ? appointmentDetail._id : null,

            // Patient and doctor information
            userId: appointment.userId,
            appointmentuserId: appointmentDetail ? appointmentDetail.userId : null,
            doctorId: appointment.doctorId,
            hospitalId: appointment.hospitalId,
            departmentId: doctor?.specializationId || undefined,

            // Patient basic info
            fullName: appointment.fullName,
            mobileNumber: appointment.mobileNumber,

            // IPD specific fields
            ipdAdmissionDate: new Date(),
            ipdStatus: 'Admitted',
        };

        // Another method to create and save the IPD record
        const newIpd = await IPD.create(ipdData);

        // Update appointment detail status if it exists
        if (appointmentDetail) {
            appointmentDetail.status = 'Completed';
            appointmentDetail.update = new Date();
            await appointmentDetail.save();
        }

        return successResponse(res, 'Appointment moved to IPD successfully', {
            ipdId: newIpd._id,
            patientName: appointment.fullName,
            bedNumber: newIpd.bedNumber,
            wardType: newIpd.wardType,
            admissionDate: newIpd.ipdAdmissionDate
        });
    } catch (error) {
        console.error('Error moving to IPD:', error);
        return errorResponse(res, 'Error moving to IPD: ' + error.message);
    }
}

const addIpdInstructionByDoctor = async (req, res) => {
    try {
        const {
            doctorId, ipdId, instructions, instructionDate,
            labReport, complaints, labInvestigations, advice, remarks, prescriptions
        } = req.body;

        const ipd = await findIpdScoped(ipdId, req);
        if (!ipd) {
            return errorResponse(res, 'IPD patient not found');
        }

        // Which doctor actually logged this round — defaults to the
        // admitting doctor (old behavior), but staff can name a different
        // one (a covering doctor, or a cross-department consult). Validated
        // against the IPD's own hospital so it can't be spoofed to a
        // doctor from another hospital.
        let roundDoctorId = ipd.doctorId;
        if (doctorId && String(doctorId) !== String(ipd.doctorId)) {
            const doctorBelongsToHospital = await Doctor.exists({
                _id: doctorId,
                delete: false,
                ...(ipd.hospitalId ? { hospitalId: ipd.hospitalId } : {})
            });
            if (doctorBelongsToHospital) {
                roundDoctorId = doctorId;
            }
        }

        const ipdDetails = {
            ipdId : ipd._id,
            instructions : instructions,
            doctorId: roundDoctorId,
            instructionDate: instructionDate || undefined,
            labReport,
            complaints,
            labInvestigations,
            advice,
            remarks,
            prescriptions: parsePrescriptions(prescriptions),
            // Cloudinary storage puts the uploaded file's URL in `path`.
            labReportFile: req.file?.path
        }

        const newIpdDetails = await IpdDetail.create(ipdDetails);
        
        return successResponse(res, 'Instructions added successfully', newIpdDetails);
    } catch (error) {
        console.error('Error adding instructions:', error);
        return errorResponse(res, 'Error adding instructions: ' + error.message);
    }
}

const getIpdDetails = async (req, res) => {
    try {
        const ipdId = req.params.ipdId;

        const ipd = await findIpdScoped(ipdId, req);
        if (!ipd) {
            return errorResponse(res, 'IPD patient not found');
        }

        const ipdDetails = await IpdDetail.find({ ipdId: ipdId, delete: false })
            .sort({ create: -1 });

        return successResponse(res, 'Ipd details retrieved successfully', ipdDetails);
    } catch (error) {
        console.error('Error getting IPD details:', error);
        return errorResponse(res, 'Error getting IPD details: ' + error.message);
    }
}

const dischargePatient = async (req, res) => {
    try {
        const { ipdId } = req.body;

        const ipdPatient = await findIpdScoped(ipdId, req);
        if (!ipdPatient) {
            return errorResponse(res, 'IPD patient not found');
        }

        if (ipdPatient.ipdStatus === 'Discharged') {
            return errorResponse(res, 'Patient already discharged');
        }

        // Update IPD record with discharge information
        ipdPatient.ipdStatus = 'Discharged';
        ipdPatient.ipdDischargeDate = new Date();
        ipdPatient.update = new Date();

        await ipdPatient.save();

        return successResponse(res, 'Patient discharged successfully', {
            ipdId: ipdPatient._id,
            patientName: ipdPatient.fullName,
            dischargeDate: ipdPatient.ipdDischargeDate,
            status: ipdPatient.ipdStatus
        });
    } catch (error) {
        console.error('Error discharging patient:', error);
        return errorResponse(res, 'Error discharging patient: ' + error.message);
    }
}

const getAllIpdPatients = async (req, res) => {
    try {
        const { page = 1, limit = 10, status = 'Admitted' } = req.query;
        const skip = (page - 1) * limit;

        const filter = departmentFilter(req, scopeFilter(req, { delete: false }));
        if (status) {
            filter.ipdStatus = status;
        }

        const ipdPatients = await IPD.find(filter)
            .populate('doctorId', 'name specialization')
            .populate('hospitalId', 'name')
            .sort({ ipdAdmissionDate: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await IPD.countDocuments(filter);

        return successResponse(res, 'IPD patients retrieved successfully', {
            patients: ipdPatients,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalRecords: total,
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Error getting IPD patients:', error);
        return errorResponse(res, 'Error retrieving IPD patients: ' + error.message);
    }
};

const getAllIpd = async (req, res) => {
    try {
        // Query string (this is a GET) — opt-in pagination + search by
        // patient name / mobile, same contract as the other admin lists.
        const pagination = parsePagination(req.query);
        const search = searchRegex(req.query.search);

        const condition = departmentFilter(req, scopeFilter(req, { delete: false }));
        // Today / this week / this month / custom range, on the admission date.
        const admitted = parseDateFilter(req.query);
        if (admitted) condition.ipdAdmissionDate = admitted;
        if (search) {
            // departmentFilter may already use $or — combine under $and so
            // neither clause overwrites the other.
            const searchOr = { $or: [{ fullName: search }, { mobileNumber: search }] };
            condition.$and = [...(condition.$and || []), searchOr];
        }

        // appointmentDetailId is populated with the consultation fields the
        // IPD page shows (disease etc.) — previously the page made one extra
        // request per patient row to get them.
        let query = IPD.find(condition)
            .populate('doctorId', 'name specialization')
            .populate('hospitalId', 'name')
            .populate('appointmentDetailId', 'disease chiefComplaints probableDiagnosis doctorRemarks nextAppointmentDate appointmentDate appointmentTime')
            .sort({ ipdAdmissionDate: -1, _id: -1 })
            .lean();

        if (!pagination) {
            return successResponse(res, 'IPD patients retrieved successfully', await query);
        }

        const [ipdPatients, totalRecords] = await Promise.all([
            pagination.all ? query : query.skip(pagination.skip).limit(pagination.limit),
            IPD.countDocuments(condition),
        ]);

        return res.status(200).json({
            status: 200,
            message: 'IPD patients retrieved successfully',
            data: ipdPatients,
            pagination: paginationMeta(pagination, totalRecords),
        });
    } catch (error) {
        console.error('Error getting IPD patients:', error);
        return errorResponse(res, 'Error retrieving IPD patients: ' + error.message);
    }
};

const getAllDischargedIpd = async (req, res) => {
    try {
        const condition = departmentFilter(req, scopeFilter(req, { ipdStatus: 'Discharged', delete: false }));

        const ipdPatients = await IPD.find(condition)
            .populate('doctorId', 'name specialization')
            .populate('hospitalId', 'name')
            .sort({ ipdAdmissionDate: -1 });

        return successResponse(res, 'IPD patients retrieved successfully', ipdPatients);
    } catch (error) {
        console.error('Error getting IPD patients:', error);
        return errorResponse(res, 'Error retrieving IPD patients: ' + error.message);
    }
};

// Get single IPD patient details
const getIpdPatientById = async (req, res) => {
    try {
        const { ipdId } = req.params;

        const ipdPatient = await IPD.findOne(departmentFilter(req, scopeFilter(req, { _id: ipdId })))
            .populate('doctorId', 'name specialization phone email')
            .populate('hospitalId', 'name address phone')
            .populate('appointmentId')
            .populate('appointmentDetailId');

        if (!ipdPatient) {
            return errorResponse(res, 'IPD patient not found');
        }

        return successResponse(res, 'IPD patient details retrieved successfully', ipdPatient);
    } catch (error) {
        console.error('Error getting IPD patient:', error);
        return errorResponse(res, 'Error retrieving IPD patient: ' + error.message);
    }
};

// Update IPD patient informationdischargeDate
const updateIpdPatient = async (req, res) => {
    try {
        const { ipdId } = req.params;
        const updateData = req.body;

        const existing = await findIpdScoped(ipdId, req);
        if (!existing) {
            return errorResponse(res, 'IPD patient not found');
        }

        // Remove fields that shouldn't be updated directly
        delete updateData.appointmentId;
        delete updateData.appointmentDetailId;
        delete updateData._id;
        delete updateData.create;
        delete updateData.hospitalId; // ownership already verified above; never reassignable here

        updateData.update = new Date();

        const updatedIpd = await IPD.findByIdAndUpdate(
            ipdId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedIpd) {
            return errorResponse(res, 'IPD patient not found');
        }

        return successResponse(res, 'IPD patient updated successfully', updatedIpd);
    } catch (error) {
        console.error('Error updating IPD patient:', error);
        return errorResponse(res, 'Error updating IPD patient: ' + error.message);
    }
};

// Discharge IPD patient
const dischargeIpdPatient = async (req, res) => {
    try {
        const { ipdId } = req.params;
        const { dischargeDate, dischargeRemarks, finalDiagnosis, dischargeMedications } = req.body;

        const ipdPatient = await findIpdScoped(ipdId, req);
        if (!ipdPatient) {
            return errorResponse(res, 'IPD patient not found');
        }

        if (ipdPatient.ipdStatus === 'Discharged') {
            return errorResponse(res, 'Patient already discharged');
        }

        // Update IPD record with discharge information
        ipdPatient.ipdStatus = 'Discharged';
        ipdPatient.ipdDischargeDate = dischargeDate || new Date();
        ipdPatient.doctorRemarks = dischargeRemarks || ipdPatient.doctorRemarks;
        ipdPatient.probableDiagnosis = finalDiagnosis || ipdPatient.probableDiagnosis;
        ipdPatient.prescriptionList = dischargeMedications || ipdPatient.prescriptionList;
        ipdPatient.update = new Date();

        await ipdPatient.save();

        return successResponse(res, 'Patient discharged successfully', {
            ipdId: ipdPatient._id,
            patientName: ipdPatient.fullName,
            dischargeDate: ipdPatient.ipdDischargeDate,
            status: ipdPatient.ipdStatus
        });
    } catch (error) {
        console.error('Error discharging patient:', error);
        return errorResponse(res, 'Error discharging patient: ' + error.message);
    }
};

const getAllIpdInstructions = async (req, res) => {
    try {
        const ipdId = req.params.ipdId;

        const ipd = await findIpdScoped(ipdId, req);
        if (!ipd) {
            return errorResponse(res, 'IPD patient not found');
        }

        const ipdInstructions = await IpdDetail.find({ ipdId: ipdId, delete: false })
            .populate({
                path: 'doctorId',
                select: 'name specializationId',
                populate: { path: 'specializationId', select: 'name' }
            })
            .sort({ create: -1 });

        return successResponse(res, 'Ipd instructions retrieved successfully', ipdInstructions);
    } catch (error) {
        console.error('Error getting IPD instructions:', error);
        return errorResponse(res, 'Error getting IPD instructions: ' + error.message);
    }
}

module.exports = {
    moveToIpd,
    addIpdInstructionByDoctor,
    getIpdDetails,
    dischargePatient,
    getAllIpdPatients,
    getIpdPatientById,
    updateIpdPatient,
    getAllIpd,
    getAllDischargedIpd,
    dischargeIpdPatient,
    getAllIpdInstructions
}