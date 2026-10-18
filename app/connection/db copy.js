// db.js
const mongoose = require('mongoose');

// Replace this with your MongoDB URI
const uri = 'mongodb+srv://snselftech:rDa9TicNjJJVCZcD@selftech.7ie4n.mongodb.net/?retryWrites=true&w=majority&appName=selftech/medicare'; // or your remote URI

// const uri = 'mongodb://localhost:27017/medicare'; // or your remote URI


async function connectToMongo() {
    try {
        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB using Mongoose');
    } catch (error) {
        console.error('Failed to connect to MongoDB', error);
        process.exit(1); // Exit process with failure if unable to connect
    }
}

module.exports = connectToMongo;