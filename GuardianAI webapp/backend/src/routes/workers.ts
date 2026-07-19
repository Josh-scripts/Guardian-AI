import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase';
import { AuthRequest, authenticateJWT, requireAdmin } from './middleware';

const router = Router();
router.use(authenticateJWT);

// ── GET all workers ───────────────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('workers')
      .select('worker_id, name, email, role, department, status, emergency_contact, created_at, updated_at');
    if (error) throw error;

    // Normalise column names to camelCase for frontend compatibility
    const workers = (data || []).map(normaliseWorker);
    res.json(workers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── CREATE worker ─────────────────────────────────────────────────────────────
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { workerId, name, email, role, department, password, emergencyContact } = req.body;

  if (!workerId || !name || !email || !department || !password || !emergencyContact) {
    res.status(400).json({ error: 'Missing required worker fields' });
    return;
  }

  try {
    // Check for duplicates
    const { data: existing } = await supabase
      .from('workers')
      .select('worker_id')
      .or(`worker_id.eq.${workerId},email.eq.${email}`)
      .limit(1);

    if (existing && existing.length > 0) {
      res.status(400).json({ error: 'Worker with this employee ID or email already exists' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const { data, error } = await supabase
      .from('workers')
      .insert({
        worker_id: workerId,
        name,
        email,
        password_hash: passwordHash,
        role: role || 'worker',
        department,
        status: 'offline',
        emergency_contact: emergencyContact
      })
      .select('worker_id, name, email, role, department, status, emergency_contact, created_at')
      .single();

    if (error) throw error;
    res.status(201).json(normaliseWorker(data));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── UPDATE worker ─────────────────────────────────────────────────────────────
router.put('/:workerId', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { name, email, role, department, password, emergencyContact } = req.body;
  const { workerId } = req.params;

  try {
    const updates: any = {};
    if (name)             updates.name = name;
    if (email)            updates.email = email;
    if (role)             updates.role = role;
    if (department)       updates.department = department;
    if (emergencyContact) updates.emergency_contact = emergencyContact;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updates.password_hash = await bcrypt.hash(password, salt);
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('workers')
      .update(updates)
      .eq('worker_id', workerId)
      .select('worker_id, name, email, role, department, status, emergency_contact')
      .single();

    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Worker not found' }); return; }
    res.json(normaliseWorker(data));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE worker ─────────────────────────────────────────────────────────────
router.delete('/:workerId', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { workerId } = req.params;
  try {
    const { error } = await supabase
      .from('workers')
      .delete()
      .eq('worker_id', workerId);

    if (error) throw error;

    // Unassign any helmets bound to this worker
    await supabase
      .from('helmets')
      .update({ status: 'inactive', assigned_worker_id: null })
      .eq('assigned_worker_id', workerId);

    res.json({ success: true, message: 'Worker profile deleted and helmet unassigned.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Helper: normalise snake_case Supabase row → camelCase for frontend ────────
function normaliseWorker(w: any) {
  return {
    workerId: w.worker_id,
    name: w.name,
    email: w.email,
    role: w.role,
    department: w.department,
    status: w.status,
    emergencyContact: w.emergency_contact,
    createdAt: w.created_at,
    updatedAt: w.updated_at
  };
}

export default router;
