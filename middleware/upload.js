const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads/prescriptions');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter to only allow certain file types
const fileFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only .jpeg, .jpg, .png, and .pdf files are allowed!'));
    }
};

// Initialize upload
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).single('labReport'); // 'labReport' should match the field name in your form-data

// Middleware function to handle file upload
const uploadFile = (req, res, next) => {
    upload(req, res, (err) => {
        console.log('File upload middleware called');
        
        if (err) {
            console.error('File upload error:', err);
            // Handle multer errors
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, message: 'File size too large. Max 5MB allowed.' });
            }
            if (err.message) {
                return res.status(400).json({ success: false, message: err.message });
            }
            return res.status(400).json({ success: false, message: 'File upload failed.' });
        }
        
        // Log file upload details
        if (req.file) {
            console.log('File uploaded successfully:', {
                originalname: req.file.originalname,
                filename: req.file.filename,
                path: req.file.path,
                size: req.file.size
            });
            
            // Create a public URL for the file
            req.file.publicUrl = `/uploads/prescriptions/${req.file.filename}`;
        } else {
            console.log('No file was uploaded');
        }
        
        next();
    });
};

module.exports = uploadFile;
