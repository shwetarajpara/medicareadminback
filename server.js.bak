const express = require('express');
const bodyParser = require('body-parser');
const connectToMongo = require('./app/connection/db');
// const uploadRoutes = require('./app/controller/uploads/admin/profiles');
const cors = require('cors');
const app = express();
const port = 3000;

// Middleware
app.use(express.json()); // Parse incoming JSON requests

// Connect to MongoDB
connectToMongo();
app.use(cors());

// medicare routes
app.use('/medicare', require('./app/routes/routes'));

// Default route
app.get('/', (req, res) => {
    res.send('Welcome to the Admin API');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

app.use(express.urlencoded({ extended: true }));

// Mount the upload route
// app.use('/upload', uploadRoutes);