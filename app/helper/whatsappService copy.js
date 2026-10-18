// whatsappService.js
const axios = require("axios");
require('dotenv').config();

const AISENSY_URL = "https://cloud.apikaro.in/api";

const API_KEY = process.env.WHATSAPP_API_KEY;

async function sendWhatsAppMessages(appointmentType, numbers, data) {
  // Mapping appointmentType to campaignName & params
  let campaignName = "";
  let templateParams = [];

  switch (appointmentType) {
    case "newAppointment":
      campaignName = "appointment_booked";
      templateParams = [
        data.patientName,
        data.doctorName,
        data.hospitalAddress,
        data.bookingTime
      ];
      break;

    case "deleteAppointment":
      campaignName = "appointment_cancel"; 
      templateParams = [
        data.patientName,
        data.doctorName,
        data.hospitalAddress,
        data.bookingTime
      ];
      break;

    case "reminderAppointment":
      campaignName = "appointment_reminder"; 
      templateParams = [
        data.patientName,
        data.doctorName,
        data.hospitalAddress,
        data.bookingTime
      ];
      break;

    case "shiftAppointment":
      campaignName = "  "; 
      templateParams = [
        data.patientName,
        data.doctorName,
        data.hospitalAddress,
        data.bookingTime
      ];
      break;

    default:
      campaignName = "appointment_booked";
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
        from_phone_number_id: process.env.FROM_PHONE_NUMBER_ID || "",
        phone_number_id: number,
        template_name: campaignName,
        template_language: "en",
        header_image: "",
        header_video: "",
        header_document: "",
        header_document_name: "",
        header_field_1: templateParams[0] || "",
        location_latitude: "",
        location_longitude: "",
        location_name: "",
        location_address: "",
        field_1: templateParams[0] || "",
        field_2: templateParams[1] || "",
        field_3: templateParams[2] || "",
        field_4: templateParams[3] || "",
        button_0: "",
        button_1: "",
        copy_code: "",
        contact: {
          first_name: templateParams[0] || "User",
          last_name: "",
          email: "",
          country: "india",
          language_code: "en",
          groups: ""
        }
      };

      const response = await axios.post(AISENSY_URL, payload, {
        headers: { "Content-Type": "application/json" },
      });

      console.log(`Message sent to ${number}`, response.data);
    } catch (error) {
      console.error(`Error sending to ${number}`, error.response?.data || error.message);
    }
  }
}

module.exports = { sendWhatsAppMessages };
