const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
require('dotenv').config(); // Loads environment variables from a .env file

const app = express();
const PORT = process.env.PORT || 3000;
// Make sure you have a MongoDB server running.
// You can set your MongoDB connection string as an environment variable (MONGO_URI)
// or update the default value here.
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/appointmentManager';

// --- Middleware ---
// Enable CORS for all routes to allow frontend to communicate with this server
app.use(cors());
// Parse JSON bodies for POST/PUT requests
app.use(express.json());
// Serve static files (like your HTML, CSS) from the current directory
app.use(express.static(__dirname));

// --- Mongoose Schema and Model ---
const appointmentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    confirmationSent: { type: Boolean, default: false },
    reviewSent: { type: Boolean, default: false },
    services: [{
        description: { type: String, required: true },
        cost: { type: Number, required: true },
        _id: false
    }],
    billupdateflag: { type: Boolean, default: false }
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps
});

// To match a frontend that might expect 'id' instead of '_id'
appointmentSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    }
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

// --- Auth Routes (Public) ---

// POST /api/auth/login - Authenticate a user and return a JWT
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required.' });
        }

        // Get today's date and format it as DDMM
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0'); // getMonth() is zero-based
        const expectedPassword = `${day}${month}`;

        const isUsernameValid = username === 'admin';
        const isPasswordValid = password === expectedPassword;

        if (!isUsernameValid || !isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // If credentials are correct, generate and send the token
        const payload = { id: 'admin_user', username: 'admin' };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.json({ token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// GET /api/keepwake - A specific endpoint to get a record for a fixed date, used for keep-alive purposes.
app.get('/api/keepwake', async (req, res) => {
    try {
        // Find the first document in the collection to ensure the database is responsive.
        const keepwakeAppointment = await Appointment.findOne();
        if (keepwakeAppointment) {
            res.json(keepwakeAppointment);
        } else {
            res.status(404).send('Keep-alive target appointment not found.');
        }
    } catch (error) {
        console.error('Error during keep-alive ping:', error);
        res.status(500).json({ message: 'Error fetching data from database.' });
    }
});

// GET /api/bill-details/:phone - Get billing details by phone number.
// Optionally, a 'date' query parameter can be provided to get details for a specific date.
// If no date is provided, it returns the details for the latest appointment.
app.get('/api/bill-details/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const { date } = req.query; // Get date from query parameters

        const query = { phone };
        if (date) {
            query.date = date;
        }

        // Find the most recent appointment for the given phone number
        // If date is provided, it will be included in the query.
        const appointment = await Appointment.findOne(query).sort({ date: -1, time: -1 });

        if (!appointment) {
            return res.status(404).json({ message: 'No appointment found for this phone number.' });
        }

        // Construct the response object with the required details
        const billDetails = {
            patientName: appointment.name,
            billDate: appointment.date,
            services: appointment.services
        };

        res.json(billDetails);
    } catch (error) {
        console.error('Error fetching bill details:', error);
        res.status(500).json({ message: 'Failed to fetch bill details.' });
    }
});

// --- Authentication Middleware ---
// This middleware will protect all subsequent /api routes
app.use('/api', (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (token == null) {
        return res.status(401).json({ message: 'Unauthorized: No token provided.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Forbidden: Token is not valid.' });
        }
        req.user = user;
        next();
    });
});

// --- API Routes (CRUD Operations) ---

// GET /api/appointments - Read all appointments
// app.get('/api/appointments', async (req, res) => {
//     try {
//         const appointments = await Appointment.find({});
//         // Sort by date and time in descending order (most recent first)
//         // This sorting is done in-memory to correctly handle the combined date and time strings.
//         appointments.sort((a, b) => {
//             const dateA = new Date(`${a.date}T${a.time}`);
//             const dateB = new Date(`${b.date}T${b.time}`);
//             return dateB - dateA;
//         });
//         res.json(appointments);
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: 'Error reading appointments from database.' });
//     }
// });

// GET /api/appointments/by-date?date=YYYY-MM-DD - Get all appointments for a specific date
app.get('/api/appointments/by-date', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ message: 'A date query parameter is required.' });
        }

        // Optional: Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: 'Invalid date format. Please use YYYY-MM-DD.' });
        }

        // Find appointments for the given date and sort them by time
        const appointments = await Appointment.find({ date: date }).sort({ time: 'asc' });

        res.json(appointments);
    } catch (error) {
        console.error('Error fetching appointments by date:', error);
        res.status(500).json({ message: 'Error fetching appointments from the database.' });
    }
});

// POST /api/appointments - Create a new appointment
app.post('/api/appointments', async (req, res) => {
    try {
        const appointment = new Appointment(req.body);
        const savedAppointment = await appointment.save();
        res.status(201).json(savedAppointment);
    } catch (error) {
        console.error(error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', details: error.message });
        }
        res.status(500).json({ message: 'Error creating appointment.' });
    }
});

// PUT /api/appointments/:id - Update an appointment (for status changes)
app.put('/api/appointments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;

        // The { new: true } option returns the document after the update.
        // runValidators ensures that updates are validated against the schema.
        const updatedAppointment = await Appointment.findByIdAndUpdate(id, updatedData, { new: true, runValidators: true });

        if (!updatedAppointment) {
            return res.status(404).json({ message: 'Appointment not found.' });
        }

        res.json(updatedAppointment);
    } catch (error) {
        console.error(error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid appointment ID format.' });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', details: error.message });
        }
        res.status(500).json({ message: 'Error updating appointment.' });
    }
});

// DELETE /api/appointments/:id - Delete a single appointment
app.delete('/api/appointments/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const deletedAppointment = await Appointment.findByIdAndDelete(id);

        if (!deletedAppointment) {
            return res.status(404).json({ message: 'Appointment not found.' });
        }

        res.status(204).send(); // No content, success
    } catch (error) {
        console.error(error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid appointment ID format.' });
        }
        res.status(500).json({ message: 'Error deleting appointment.' });
    }
});

// DELETE /api/appointments - Delete ALL appointments
app.delete('/api/appointments', async (req, res) => {
    try {
        await Appointment.deleteMany({}); // Deletes all documents in the collection
        res.status(204).send(); // No content, success
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error clearing all appointments.' });
    }
});

// --- Start Server ---
mongoose.connect(MONGO_URI,{
    // These options are no longer needed in recent versions of Mongoose
    // and are deprecated in the underlying MongoDB driver.
    // useNewUrlParser: true,
    // useUnifiedTopology: true,
    maxPoolSize: 10, // Maintain a pool of up to 10 connections
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    keepAliveInitialDelay: 300000 // TCP Keep-Alive delay (5 minutes)
})
    .then(() => {
        console.log('Connected to MongoDB.');
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
            console.log('Your Appointment Manager is now live and connected to the database.');
        });

        // Keep-alive job for MongoDB Atlas Free Tier
        // This runs every 5 minutes to prevent the database from sleeping.
        cron.schedule('*/2 * * * *', async () => {
            console.log('Pinging MongoDB to keep connection alive...');
            try {
                await mongoose.connection.db.admin().ping();
            } catch (err) {
                console.error('Failed to ping MongoDB:', err);
            }
        });
    })
    .catch(err => {
        console.error('Could not connect to MongoDB.', err);
        process.exit(1);
    });
