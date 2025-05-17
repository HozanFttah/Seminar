const express = require('express');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const auth = require('basic-auth');

const app = express();



// Supabase setup - USE ENVIRONMENT VARIABLES IN PRODUCTION

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Add validation to fail fast if missing
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration!');
  console.error(`SUPABASE_URL: ${supabaseUrl ? '***' : 'MISSING'}`);
  console.error(`SUPABASE_KEY: ${supabaseKey ? '***' : 'MISSING'}`);
  process.exit(1); // Crash immediately if not configured
}


const supabase = createClient(supabaseUrl, supabaseKey);



// Modified authentication middleware - skips HEAD requests
app.use((req, res, next) => {
  // Allow HEAD requests without auth (for health checks)
  if (req.method === 'HEAD') return next();
  
  const user = auth(req);
  const username = process.env.BASIC_AUTH_USERNAME;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || user.name !== username || user.pass !== password) {
    res.set('WWW-Authenticate', 'Basic realm="Restricted"');
    return res.status(401).send('Unauthorized');
  }
  next();
});

// CORS
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://*.onrender.com'
  ],
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD', 'DELETE']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// HEAD endpoint
app.head('/api/data', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.status(200).end();
});

// GET all bookings
app.get('/api/data', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('date', { ascending: true });

    if (error) throw error;
    
    // Transform to match frontend expectations
    const transformedData = data.map(item => ({
      id: item.id,
      title: item.title,
      date: item.date,
      startTime: item.start_time,
      endTime: item.end_time
    }));
    
    res.setHeader('Cache-Control', 'no-cache');
    res.json(transformedData);
  } catch (err) {
    console.error('Supabase fetch error:', err);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

// POST new bookings
app.post('/api/data', async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Data must be an array' });
    }

    const isValid = req.body.every(event => 
      event.title && 
      /^\d{4}-\d{2}-\d{2}$/.test(event.date) &&
      /^\d{2}:\d{2}$/.test(event.startTime) &&
      /^\d{2}:\d{2}$/.test(event.endTime)
    );

    if (!isValid) {
      return res.status(400).json({ 
        error: 'Invalid event structure',
        example: {
          title: "string",
          date: "YYYY-MM-DD",
          startTime: "HH:MM",
          endTime: "HH:MM"
        }
      });
    }

    // Prepare data for Supabase
    const supabaseData = req.body.map(event => ({
      id: event.id,
      title: event.title,
      date: event.date,
      start_time: event.startTime,
      end_time: event.endTime
    }));

    const { data, error } = await supabase
      .from('bookings')
      .upsert(supabaseData); // Using upsert to handle both inserts and updates

    if (error) throw error;
    res.json({ success: true, itemsSaved: req.body.length });
  } catch (err) {
    console.error('Supabase save error:', err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// DELETE booking
app.delete('/api/data/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Supabase delete error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});