const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
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

// --- API Routes (CRUD Operations) ---

// GET /api/appointments - Read all appointments
app.get('/api/appointments', async (req, res) => {
    try {
        const appointments = await Appointment.find({});
        // Sort by date and time in descending order (most recent first)
        // This sorting is done in-memory to correctly handle the combined date and time strings.
        appointments.sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.time}`);
            const dateB = new Date(`${b.date}T${b.time}`);
            return dateB - dateA;
        });
        res.json(appointments);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error reading appointments from database.' });
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
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB.');
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
            console.log('Your Appointment Manager is now live and connected to the database.');
        });
    })
    .catch(err => {
        console.error('Could not connect to MongoDB.', err);
        process.exit(1);
    });
    