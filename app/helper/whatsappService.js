// whatsappService.js
const axios = require("axios");
require('dotenv').config();

// Override lets load/integration testing point this at a local stub instead
// of the real provider — unset in normal operation, so production behavior
// is unchanged by default.
const AISENSY_URL = process.env.AISENSY_BASE_URL || "https://cloud.apikaro.in/api";
const VENDOR_ID = process.env.VENDOR_ID;

const API_KEY = process.env.WHATSAPP_API_KEY;

async function sendWhatsAppMessages(appointmentType, numbers, data) {
  // Mapping appointmentType to campaignName & paramssss
  let campaignName = "";
  let templateParams = [];

  switch (appointmentType) {
    case "newAppointment":
      campaignName = "appointment_booked_v2";
      templateParams = [
        data.patientName,
        data.doctorName,
        data.hospitalAddress,
        data.bookingTime
      ];
      break;

    case "deleteAppointment":
      campaignName = "appointment_cancel_v2"; 
      templateParams = [
        data.patientName,
        data.doctorName,
        data.hospitalAddress,
        data.bookingTime
      ];
      break;

    case "reminderAppointment":
      campaignName = "appointment_reminder_v2"; 
      templateParams = [
        data.patientName,
        data.doctorName,
        data.hospitalAddress,
        data.bookingTime
      ];
      break;

    case "shiftAppointment":
      campaignName = "appointment_shift_v2"; 
      templateParams = [
        data.patientName,
        data.doctorName,
        data.hospitalAddress,
        data.bookingTime
      ];
      break;

    default:
      campaignName = "appointment_booked_v2";
      templateParams = [
        data.patientName,
        data.doctorName,
        data.hospitalAddress,
        data.bookingTime
      ];
      break;
  }
  for (const number of numbers) {
    try {
      const payload = {
        phone_number: number,
        template_name: campaignName,
        template_language: "en_US",
        header_field_1: templateParams[0] || "",
        field_1: templateParams[0] || "",
        field_2: templateParams[1] || "",
        field_3: templateParams[2] || "",
        field_4: templateParams[3] || "",
        contact: {
          first_name: templateParams[0] || "User",
          last_name: "",
          email: "",
          country: "india",
          language_code: "en_US",
          groups: ""
        }
      };

      const response = await axios.post(`${AISENSY_URL}/${VENDOR_ID}/contact/send-template-message`, payload, {
        headers: { "Content-Type": "application/json" ,
          "Authorization": `Bearer ${process.env.WHATSAPP_API_KEY}`,
        },
      });

      console.log(`Message sent to ${number}`, response.data);
    } catch (error) {
      console.error(`Error sending to ${number}`, error.response?.data || error.message);
    }
  }
}

// Sends a lab-report document via WhatsApp template message.
// Uses its own vendor id / token since this is a separate WhatsApp Business
// integration from the appointment-notification one above.
async function sendLabReportWhatsApp(mobileNumber, patientName, pdfUrl) {
  const vendorId = process.env.WHATSAPP_LAB_REPORT_VENDOR_ID;
  const token = process.env.WHATSAPP_LAB_REPORT_API_TOKEN;

  if (!vendorId || !token) {
    throw new Error('WhatsApp lab-report integration is not configured (WHATSAPP_LAB_REPORT_VENDOR_ID / WHATSAPP_LAB_REPORT_API_TOKEN missing)');
  }

  const payload = {
    phone_number: `91${mobileNumber}`,
    template_name: "lab_reports",
    template_language: "en_US",
    header_field_1: patientName,
    header_document: pdfUrl,
    header_document_name: `Lab_Report_${patientName}.pdf`,
    field_1: patientName,
    contact: {
      first_name: patientName,
      last_name: "",
      email: "",
      country: "India",
      language_code: "en_US",
      groups: "Clients"
    }
  };

  const response = await axios.post(
    `${AISENSY_URL}/${vendorId}/contact/send-template-message`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    }
  );

  return response.data;
}

module.exports = { sendWhatsAppMessages, sendLabReportWhatsApp };
