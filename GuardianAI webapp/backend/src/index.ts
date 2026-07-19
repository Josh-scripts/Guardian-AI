import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { supabase } from './lib/supabase';

// Import Routes
import authRoutes from './routes/auth';
import workerRoutes from './routes/workers';
import alertRoutes from './routes/alerts';
import telemetryRoutes from './routes/telemetry';
import analyticsRoutes from './routes/analytics';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());

// Socket.io Setup
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Save socket reference globally for API routes
app.set('socketio', io);

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Bind Routes
app.use('/api/auth', authRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', database: 'supabase' });
});

// Cloud AI mock endpoint
app.post('/api/cloud-ai/mock', (req, res) => {
  res.json({
    status: 'safe',
    confidence: 0.95,
    reason: 'Heavy cloud pipeline active. Parameters within safe threshold boundaries.',
    suggestedAction: 'No action required.',
    riskZone: 'Zone A'
  });
});

// Simulator Control Proxy
app.post('/api/simulator/scenario', async (req, res) => {
  const SIMULATOR_URL = process.env.SIMULATOR_URL || 'http://simulator:5002';
  try {
    const response = await axios.post(`${SIMULATOR_URL}/api/simulator/scenario`, req.body);
    res.json(response.data);
  } catch (err: any) {
    console.warn(`[Backend] Failed to communicate with simulator: ${err.message}`);
    res.status(502).json({ error: 'Simulator service offline or unreachable.' });
  }
});

// AnythingLLM OpenAI-compatible Completions Proxy
app.post('/api/openai/chat/completions', async (req, res) => {
  const ANYTHINGLLM_API_KEY = 'DP9VQ65-EZNMWQF-Q1Y5NNZ-KFK34X1';
  console.log('[Backend] Received AI completions request');
  try {
    // 1. Fetch available workspaces to find a valid slug
    const workspacesRes = await axios.get('http://localhost:3001/api/v1/workspaces', {
      headers: { 'Authorization': `Bearer ${ANYTHINGLLM_API_KEY}` }
    });
    
    const workspaces = (workspacesRes.data as any).workspaces || [];
    if (workspaces.length === 0) {
      console.warn('[Backend] No workspaces found in AnythingLLM');
      res.status(400).json({ error: 'No workspaces found in AnythingLLM.' });
      return;
    }
    
    // Use the first workspace's slug as the model identifier required by AnythingLLM
    const workspaceSlug = workspaces[0].slug;
    console.log(`[Backend] Using workspace slug: ${workspaceSlug}`);

    // 2. Override the model parameter with the workspace slug
    const body = {
      ...req.body,
      model: workspaceSlug
    };

    const response = await axios({
      method: 'post',
      url: 'http://localhost:3001/api/v1/openai/chat/completions',
      headers: {
        'Authorization': `Bearer ${ANYTHINGLLM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: body,
      responseType: req.body.stream ? 'stream' : 'json'
    });

    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.data.pipe(res);
    } else {
      res.json(response.data);
    }
  } catch (err: any) {
    console.error(`[Backend] AnythingLLM proxy error:`, err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// Connect to Supabase and start server
async function startServer() {
  try {
    console.log('[Supabase] Testing connection...');
    const { error } = await supabase.from('workers').select('worker_id').limit(1);
    if (error) {
      console.error('[Supabase] Connection test failed:', error.message);
      console.error('Make sure SUPABASE_URL and SUPABASE_SERVICE_KEY are set in .env and the SQL schema has been run.');
      process.exit(1);
    }
    console.log('[Supabase] Connected successfully!');
    server.listen(PORT, () => {
      console.log(`GuardianAI Backend running on port ${PORT}`);
    });
  } catch (err: any) {
    console.error('[Supabase] Failed to start:', err.message);
    process.exit(1);
  }
}

startServer();
