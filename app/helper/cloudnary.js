// cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// Values come from .env; the hardcoded fallbacks below are the original
// production credentials and MUST be rotated at Cloudinary and then removed
// once CLOUDINARY_* env vars are set wherever this is deployed.
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dvuqceiek',
    api_key: process.env.CLOUDINARY_API_KEY || '588337549493347',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'R7Jdi98Llv0dV0OznUgatXTPMdQ'
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uploads', // Optional: Folder in Cloudinary
        // pdf is needed for lab reports and generated certificates, not just profile photos
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
        resource_type: 'auto',
    },
});

module.exports = {
    cloudinary,
    storage,
};
