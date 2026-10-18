const cron = require('node-cron');
const moment = require('moment');
const mongoose = require('mongoose');
const appointmentdetailModel = require('../model/appointmentdetail');
const { sendWhatsAppMessages } = require('./whatsappService');
const { formatBookingTime } = require('./appointmentHelper');

// Function to get all appointments for tomorrow
const getTomorrowsAppointments = async (days) => {
    try {
        const targetDate = moment().add(days, 'day').startOf('day');
        const nextDay = moment(targetDate).add(1, 'day');

        const appointments = await appointmentdetailModel.aggregate([
            {
                $match: {
                    appointmentDate: {
                        $gte: targetDate.toDate(),
                        $lt: nextDay.toDate()
                    },
                    delete: false
                }
            },
            {
                $lookup: {
                    from: 'appointments',
                    localField: 'appointmentId',
                    foreignField: '_id',
                    as: 'appointment'
                }
            },
            { $unwind: '$appointment' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'appointment.userId',
                    foreignField: '_id',
                    as: 'patient'
                }
            },
            { $unwind: '$patient' },
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'doctorId',
                    foreignField: '_id',
                    as: 'doctor'
                }
            },
            { $unwind: '$doctor' },
            {
                $lookup: {
                    from: 'hospitals',
                    localField: 'appointment.hospitalId',
                    foreignField: '_id',
                    as: 'hospital'
                }
            },
            { $unwind: '$hospital' },
            {
                $project: {
                    _id: 1,
                    appointmentId: 1,
                    appointmentDate: 1,
                    appointmentTime: 1,
                    'patient': {
                        fullName: 1,
                        mobileNumber: 1,
                        email: 1
                    },
                    'doctor': {
                        name: 1,
                        specialization: 1
                    },
                    'hospital': {
                        name: 1,
                        address: 1,
                        city: 1,
                        state: 1,
                        pincode: 1
                    }
                }
            }
        ]);

        return appointments;
    } catch (error) {
        console.error('Error fetching tomorrow\'s appointments:', error);
        throw error;
    }
};

// Function to send reminders for tomorrow's appointments
const sendAppointmentReminders = async (days) => {
    try {
        console.log('Starting appointment reminder job...');
        const appointments = await getTomorrowsAppointments(days);
        
        for (const appointment of appointments) {
            try {
                const bookingTime = formatBookingTime(appointment.appointmentDate, appointment.appointmentTime);
                const hospitalAddress = `${appointment.hospital.address}, ${appointment.hospital.city}, ${appointment.hospital.state} ${appointment.hospital.pincode}`;
                
                const whatsappMessageData = {
                    patientName: appointment.patient.fullName,
                    doctorName: appointment.doctor.name,
                    hospitalAddress: hospitalAddress,
                    bookingTime: bookingTime
                };

                await sendWhatsAppMessages("reminderAppointment", [appointment.patient.mobileNumber], whatsappMessageData);
                console.log(`Reminder sent for appointment ${appointment._id} to ${appointment.patient.mobileNumber}`);
                
                // Add a small delay between messages to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error sending reminder for appointment ${appointment._id}:`, error);
                // Continue with the next appointment if one fails
                continue;
            }
        }
        
        console.log(`Completed sending reminders. Processed ${appointments.length} appointments.`);
        return { success: true, processed: appointments.length };
    } catch (error) {
        console.error('Error in sendAppointmentReminders:', error);
        throw error;
    }
};

// Initialize and start the cron job
const initAppointmentReminderCron = () => {
    // cron.schedule('0 10 * * *', async () => {
    cron.schedule('* * * * *', async () => {
        console.log('Running daily appointment reminder job...');
        try {
            await sendAppointmentReminders(1);
        } catch (error) {
            console.error('Error in appointment reminder cron job:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Adjust timezone as needed
    });

    cron.schedule('* * * * *', async () => {
        console.log('Running daily appointment reminder job...');
        try {
            await sendAppointmentReminders(5);
        } catch (error) {
            console.error('Error in appointment reminder cron job:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Adjust timezone as needed
    });

    console.log('Appointment reminder cron job initialized');
};

module.exports = {
    initAppointmentReminderCron,
    getTomorrowsAppointments,
    sendAppointmentReminders
};
