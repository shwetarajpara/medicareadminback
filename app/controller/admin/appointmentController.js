const appointmentdetailModel = require('../../model/appointmentdetail');
const mongoose = require('mongoose');

const checkInAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.body;

        // Validate input
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: 'appointmentId is required'
            });
        }

        // Find and update the appointment detail
        const updatedAppointment = await appointmentdetailModel.findOneAndUpdate(
            {
                appointmentId: new mongoose.Types.ObjectId(appointmentId),
                delete: false
            },
            {
                $set: {
                    status: "Ongoing",
                    update: new Date()
                }
            },
            { new: true }
        );

        if (!updatedAppointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found or already checked in'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Appointment checked in successfully',
            data: updatedAppointment
        });

    } catch (error) {
        console.error('Error checking in appointment:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking in appointment',
            error: error.message
        });
    }
};

const checkOutAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.body;

        // Validate input
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: 'appointmentId is required'
            });
        }

        // Find and update the appointment detail
        const updatedAppointment = await appointmentdetailModel.findOneAndUpdate(
            {
                appointmentId: new mongoose.Types.ObjectId(appointmentId),
                delete: false
            },
            {
                $set: {
                    status: "Completed",
                    update: new Date()
                }
            },
            { new: true }
        );

        if (!updatedAppointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found or already checked out'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Appointment checked out successfully',
            data: updatedAppointment
        });

    } catch (error) {
        console.error('Error checking out appointment:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking out appointment',
            error: error.message
        });
    }
};

module.exports = {
    checkInAppointment,
    checkOutAppointment
}