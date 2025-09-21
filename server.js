const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// --- Middleware ---
// Enable CORS for all routes to allow frontend to communicate with this server
app.use(cors());
// Parse JSON bodies for POST/PUT requests
app.use(express.json());
// Serve static files (like your HTML, CSS) from the current directory
app.use(express.static(__dirname));

// --- Helper Functions ---
const readData = async () => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // If the file doesn't exist or is empty, return an empty array
        if (error.code === 'ENOENT') return [];
        throw error;
    }
};

const writeData = async (data) => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
};

// --- API Routes (CRUD Operations) ---
// app.get('/', (req, res) => {
//   res.send('Hello World!');
// });

// GET /api/appointments - Read all appointments
app.get('/api/appointments', async (req, res) => {
    try {
        const appointments = await readData();
        // Sort by date and time in descending order (most recent first)
        appointments.sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.time}`);
            const dateB = new Date(`${b.date}T${b.time}`);
            return dateB - dateA;
        });
        res.json(appointments);
    } catch (error) {
        res.status(500).json({ message: 'Error reading appointments data.' });
    }
});

// POST /api/appointments - Create a new appointment
app.post('/api/appointments', async (req, res) => {
    try {
        const appointments = await readData();
        const newAppointment = req.body;
        
        // Assign a unique ID
        newAppointment.id = Date.now().toString();
        
        appointments.push(newAppointment);
        await writeData(appointments);
        
        res.status(201).json(newAppointment);
    } catch (error) {
        res.status(500).json({ message: 'Error creating appointment.' });
    }
});

// PUT /api/appointments/:id - Update an appointment (for status changes)
app.put('/api/appointments/:id', async (req, res) => {
    try {
        const appointments = await readData();
        const { id } = req.params;
        const updatedData = req.body;

        const index = appointments.findIndex(appt => appt.id === id);
        if (index === -1) {
            return res.status(404).json({ message: 'Appointment not found.' });
        }

        // Update the appointment with new data
        appointments[index] = { ...appointments[index], ...updatedData };
        await writeData(appointments);

        res.json(appointments[index]);
    } catch (error) {
        res.status(500).json({ message: 'Error updating appointment.' });
    }
});

// DELETE /api/appointments/:id - Delete a single appointment
app.delete('/api/appointments/:id', async (req, res) => {
    try {
        let appointments = await readData();
        const { id } = req.params;

        const filteredAppointments = appointments.filter(appt => appt.id !== id);
        if (appointments.length === filteredAppointments.length) {
            return res.status(404).json({ message: 'Appointment not found.' });
        }

        await writeData(filteredAppointments);
        res.status(204).send(); // No content, success
    } catch (error) {
        res.status(500).json({ message: 'Error deleting appointment.' });
    }
});

// DELETE /api/appointments - Delete ALL appointments
app.delete('/api/appointments', async (req, res) => {
    try {
        await writeData([]); // Write an empty array to the file
        res.status(204).send(); // No content, success
    } catch (error) {
        res.status(500).json({ message: 'Error clearing appointments.' });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Your Appointment Manager is now live.');
    console.log('Any changes made in the UI will now directly update data.json.');
});