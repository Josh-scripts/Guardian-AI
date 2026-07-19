import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { runEdgeInference, TelemetryPacket } from './edgeClassifier';

const app = express();
const PORT = process.env.GATEWAY_PORT || 5001;
const BACKEND_HTTP_URL = process.env.BACKEND_HTTP_URL || 'http://localhost:5000';

app.use(cors());
app.use(express.json());

app.post('/api/telemetry', async (req, res) => {
  try {
    const rawPacket: TelemetryPacket = req.body;
    
    if (!rawPacket || !rawPacket.helmetId) {
      res.status(400).json({ error: 'Invalid telemetry payload' });
      return;
    }

    // Run first-tier AI model (edge/NPU emulation)
    const edgeInference = runEdgeInference(rawPacket);

    // Attach edge inference results to packet
    const enrichedPacket = {
      ...rawPacket,
      helmetRemoved: !rawPacket.ir,
      edgeInference
    };

    // Forward enriched telemetry to central backend
    try {
      await axios.post(`${BACKEND_HTTP_URL}/api/telemetry/ingest`, enrichedPacket);
    } catch (err: any) {
      console.warn(`[Gateway] Error forwarding telemetry to backend: ${err.message}`);
    }

    res.json({
      success: true,
      message: 'Telemetry processed and forwarded',
      edgeInference
    });
  } catch (error: any) {
    console.error(`[Gateway] Error processing telemetry: ${error.message}`);
    res.status(500).json({ error: 'Internal gateway error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', tier: 'Edge NPU Gateway' });
});

app.listen(PORT, () => {
  console.log(`Edge Gateway running on port ${PORT}...`);
  console.log(`Forwarding to backend at: ${BACKEND_HTTP_URL}`);
});
