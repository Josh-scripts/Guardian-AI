import { Router, Response } from 'express';
import { supabase } from '../lib/supabase';
import { AuthRequest, authenticateJWT, requireAdmin } from './middleware';

const router = Router();

// ── Public Alert Check for ESP32 (No JWT authentication) ───────────────────
router.get('/check/:helmetId', async (req, res) => {
  const { helmetId } = req.params;
  try {
    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*')
      .in('status', ['active', 'acknowledged'])
      .or(`helmet_id.eq.${helmetId},helmet_id.eq.all`);

    if (error) throw error;

    if (alerts && alerts.length > 0) {
      // Find the most severe active alert
      const alert = alerts.find(a => a.severity === 'critical') || alerts[0];
      res.json({
        hasAlert: true,
        alertType: alert.type === 'sos' ? 'evacuation' : alert.type, // map sos to evacuation for buzzer pattern
        message: alert.message
      });
    } else {
      res.json({
        hasAlert: false,
        alertType: "",
        message: ""
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.use(authenticateJWT);

// ── GET alerts ────────────────────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let query = supabase
      .from('alerts')
      .select('*')
      .order('timestamp', { ascending: false });

    if (req.query.status) {
      query = query.eq('status', req.query.status as string);
    }
    if (req.query.workerId) {
      query = query.eq('worker_id', req.query.workerId as string);
    }
    // Workers can only see their own alerts
    if (req.user?.role === 'worker') {
      query = query.eq('worker_id', req.user.workerId);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json((data || []).map(normaliseAlert));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── ACKNOWLEDGE alert ─────────────────────────────────────────────────────────
router.put('/:id/acknowledge', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const supervisorName = req.user?.name || 'Supervisor';

  try {
    const { data: alert, error: fetchErr } = await supabase
      .from('alerts')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !alert) { res.status(404).json({ error: 'Alert not found' }); return; }

    const { data: updated, error: updateErr } = await supabase
      .from('alerts')
      .update({
        status: 'acknowledged',
        assigned_supervisor: supervisorName,
        action_taken: 'Alert acknowledged, dispatching supervisor team.',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Update worker status based on remaining active alerts
    const { count: activeCount } = await supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', alert.worker_id)
      .neq('status', 'resolved');

    await supabase
      .from('workers')
      .update({ status: (activeCount ?? 0) === 0 ? 'safe' : 'warning', updated_at: new Date().toISOString() })
      .eq('worker_id', alert.worker_id);

    const io = req.app.get('socketio');
    if (io) {
      io.emit('alert_updated', normaliseAlert(updated));
      io.emit('incident_update');
    }

    res.json(normaliseAlert(updated));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── RESOLVE alert ─────────────────────────────────────────────────────────────
router.put('/:id/resolve', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { actionTaken } = req.body;
  const supervisorName = req.user?.name || 'Supervisor';

  try {
    const { data: alert, error: fetchErr } = await supabase
      .from('alerts')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !alert) { res.status(404).json({ error: 'Alert not found' }); return; }

    const { data: updated, error: updateErr } = await supabase
      .from('alerts')
      .update({
        status: 'resolved',
        assigned_supervisor: supervisorName,
        action_taken: actionTaken || 'Hazard cleared. Normal operations resumed.',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    const { count: activeCount } = await supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', alert.worker_id)
      .in('status', ['active', 'acknowledged']);

    if ((activeCount ?? 0) === 0) {
      await supabase
        .from('workers')
        .update({ status: 'safe', updated_at: new Date().toISOString() })
        .eq('worker_id', alert.worker_id);
    }

    const io = req.app.get('socketio');
    if (io) {
      io.emit('alert_updated', normaliseAlert(updated));
      io.emit('incident_update');
    }

    res.json(normaliseAlert(updated));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── BUZZER Alert Endpoint ─────────────────────────────────────────────────────
router.post('/buzzer', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { target, workerId, workerName } = req.body;

  if (!target) {
    res.status(400).json({ error: 'target field required: "all" or "specific"' });
    return;
  }
  if (target === 'specific' && !workerId) {
    res.status(400).json({ error: 'workerId required for specific target' });
    return;
  }

  const io = req.app.get('socketio');
  if (!io) { res.status(500).json({ error: 'WebSocket server unavailable' }); return; }

  try {
    let helmetId = 'all';
    if (target === 'specific') {
      const { data: helmetRow } = await supabase
        .from('helmets')
        .select('helmet_id')
        .eq('assigned_worker_id', workerId)
        .limit(1);
      if (helmetRow && helmetRow.length > 0) {
        helmetId = helmetRow[0].helmet_id;
      }
    }

    // Insert alert into Supabase alerts table so ESP32 polling sees it
    const { data: newAlert, error: dbErr } = await supabase
      .from('alerts')
      .insert({
        worker_id: target === 'specific' ? workerId : 'all',
        worker_name: target === 'specific' ? (workerName || workerId) : 'All Workers',
        helmet_id: helmetId,
        type: 'sos', // triggers urgent buzzer pattern on ESP32
        severity: 'critical',
        message: target === 'specific' ? `Supervisor direct buzzer to ${workerName || workerId}` : 'SITE-WIDE EMERGENCY EVACUATION',
        location_lat: 0.0,
        location_lng: 0.0,
        status: 'active'
      })
      .select()
      .single();

    if (dbErr) throw dbErr;

    const payload = {
      target,
      workerId: target === 'specific' ? workerId : null,
      workerName: target === 'specific' ? (workerName || workerId) : null,
      sentBy: req.user?.name || 'Supervisor',
      timestamp: new Date()
    };

    io.emit('buzzer_alert', payload);
    if (newAlert && io) {
      io.emit('new_alert', normaliseAlert(newAlert));
    }
    console.log(`[Buzzer] Alert triggered by ${payload.sentBy} → target: ${target}${workerId ? ` (${workerId})` : ''}`);
    res.json({ success: true, payload });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── BROADCAST message ─────────────────────────────────────────────────────────
router.post('/broadcast', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { message, severity } = req.body;
  if (!message) { res.status(400).json({ error: 'Message content required' }); return; }

  const io = req.app.get('socketio');
  if (io) {
    io.emit('supervisor_broadcast', {
      sender: req.user?.name || 'System Administrator',
      message,
      severity: severity || 'warning',
      timestamp: new Date()
    });
    res.json({ success: true, message: 'Broadcast message sent.' });
  } else {
    res.status(500).json({ error: 'WebSocket server unavailable' });
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────
function normaliseAlert(a: any) {
  return {
    _id: a.id,
    workerId: a.worker_id,
    workerName: a.worker_name,
    helmetId: a.helmet_id,
    type: a.type,
    severity: a.severity,
    message: a.message,
    location: { lat: a.location_lat, lng: a.location_lng },
    status: a.status,
    assignedSupervisor: a.assigned_supervisor,
    actionTaken: a.action_taken,
    timestamp: a.timestamp,
    createdAt: a.created_at,
    updatedAt: a.updated_at
  };
}

export default router;
