import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';
import { AuthRequest, authenticateJWT } from './middleware';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_guardian_key_12345_!@';

// Account lockout parameters
const maxFailedAttempts = 5;
const lockTime = 30 * 1000;
const failedAttemptsMap = new Map<string, { count: number; lockedUntil: number }>();

router.post('/login', async (req, res) => {
  const { emailOrEmployeeId, password } = req.body;

  if (!emailOrEmployeeId || !password) {
    res.status(400).json({ error: 'Please provide credentials' });
    return;
  }

  // Check lockout
  const attempts = failedAttemptsMap.get(emailOrEmployeeId);
  if (attempts && attempts.count >= maxFailedAttempts) {
    if (Date.now() < attempts.lockedUntil) {
      const secondsLeft = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
      res.status(403).json({ error: `Account temporarily locked. Retry in ${secondsLeft}s.` });
      return;
    } else {
      failedAttemptsMap.delete(emailOrEmployeeId);
    }
  }

  try {
    // Find worker by email OR worker_id
    const { data: workers, error } = await supabase
      .from('workers')
      .select('*')
      .or(`email.eq.${emailOrEmployeeId},worker_id.eq.${emailOrEmployeeId}`)
      .limit(1);

    if (error) throw error;

    const worker = workers?.[0];

    if (!worker) {
      handleFailedAttempt(emailOrEmployeeId);
      res.status(401).json({ error: 'Invalid email/employee ID or password' });
      return;
    }

    const isMatch = await bcrypt.compare(password, worker.password_hash);
    if (!isMatch) {
      handleFailedAttempt(emailOrEmployeeId);
      res.status(401).json({ error: 'Invalid email/employee ID or password' });
      return;
    }

    failedAttemptsMap.delete(emailOrEmployeeId);

    const token = jwt.sign(
      { workerId: worker.worker_id, role: worker.role, email: worker.email, name: worker.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        workerId: worker.worker_id,
        name: worker.name,
        email: worker.email,
        role: worker.role,
        department: worker.department,
        status: worker.status
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const { data: workers, error } = await supabase
      .from('workers')
      .select('worker_id, name, email, role, department, status')
      .eq('worker_id', req.user.workerId)
      .limit(1);

    if (error) throw error;
    const worker = workers?.[0];
    if (!worker) {
      res.status(404).json({ error: 'Worker profile not found' });
      return;
    }

    res.json({
      workerId: worker.worker_id,
      name: worker.name,
      email: worker.email,
      role: worker.role,
      department: worker.department,
      status: worker.status
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

function handleFailedAttempt(key: string) {
  const attempts = failedAttemptsMap.get(key) || { count: 0, lockedUntil: 0 };
  attempts.count += 1;
  if (attempts.count >= maxFailedAttempts) {
    attempts.lockedUntil = Date.now() + lockTime;
  }
  failedAttemptsMap.set(key, attempts);
}

export default router;
