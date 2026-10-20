const express = require('express');
const bodyParser = require('body-parser');
const connectToMongo = require('./app/connection/db');
// const uploadRoutes = require('./app/controller/uploads/admin/profiles');
const cors = require('cors');
require('dotenv').config();
const { initAppointmentReminderCron } = require('./app/helper/appointmentReminderCron');
const app = express();
// PORT override lets a second instance run alongside the main dev server
// (e.g. for load testing against a separate DB) without colliding on 3000.
const port = process.env.PORT || 3000;

// cors() MUST run before express.json(): when the JSON parser rejects a
// malformed body (e.g. a literal `null`), Express skips straight to the
// error handler below, bypassing any middleware registered after the one
// that threw. If cors() were registered after express.json() (as it used
// to be), that error response would go out with no CORS header at all —
// the browser then blocks the frontend from ever reading it, and axios
// reports a generic, misleading "Network Error" instead of the real 400
// and its message. Registering cors() first guarantees every response,
// including ones from middleware errors, carries the right headers.

// ALLOWED_ORIGINS is a comma-separated list in .env, e.g.
// "https://your-deployed-admin.example.com,https://your-patient-app.example.com"
// Add your real deployed frontend URL(s) here before deploying this change —
// the default below only allows local dev.
// Trailing slashes are stripped: browsers send the Origin header without
// one ("https://admin.example.com"), so a value pasted from the address bar
// ("https://admin.example.com/") would otherwise never match.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000' || 'http://localhost:3001' || 'http://localhost:3002' )
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no Origin header (native mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    }
}));

// Middleware
app.use(express.json()); // Parse incoming JSON requests

// Connect to MongoDB
connectToMongo();

// Initialize cron jobs
// initAppointmentReminderCron();

// medicare routes
app.use('/medicare', require('./app/routes/routes'));

// Default route
app.get('/', (req, res) => {
    res.send('Welcome to the Admin API');
});

// Catches errors thrown by middleware (multer/Cloudinary upload failures,
// malformed request bodies, etc.) that would otherwise crash into Express's
// default HTML error page instead of a clean JSON response.
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message || err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message || 'Something went wrong'
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

app.use(express.urlencoded({ extended: true }));

// Mount the upload route
// app.use('/upload', uploadRoutes);