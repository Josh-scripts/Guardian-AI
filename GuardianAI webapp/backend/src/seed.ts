import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { supabase } from './lib/supabase';
dotenv.config();

async function seed() {
  console.log('[Seed] Starting Supabase seed...');

  // Clear existing data (order matters for FK safety if RLS enabled)
  await supabase.from('telemetry').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('helmets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('workers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('[Seed] Cleared existing records.');

  const salt = await bcrypt.genSalt(10);
  const adminHash  = await bcrypt.hash('admin123',  salt);
  const workerHash = await bcrypt.hash('worker123', salt);

  // Seed workers (admin + 3 workers)
  const { error: workersErr } = await supabase.from('workers').insert([
    {
      worker_id:      'EMP-1000',
      name:           'Supervisor Sarah',
      email:          'admin@guardian.ai',
      password_hash:  adminHash,
      role:           'admin',
      department:     'HSE Management',
      status:         'safe',
      emergency_contact: { name: 'John Doe', phone: '+1-555-0100', relationship: 'Spouse' }
    },
    {
      worker_id:      'EMP-1001',
      name:           'Marcus Vance',
      email:          'marcus@guardian.ai',
      password_hash:  workerHash,
      role:           'worker',
      department:     'Pipeline Ops',
      status:         'offline',
      emergency_contact: { name: 'Julia Vance', phone: '+1-555-0101', relationship: 'Wife' }
    },
    {
      worker_id:      'EMP-1002',
      name:           'Elena Rostova',
      email:          'elena@guardian.ai',
      password_hash:  workerHash,
      role:           'worker',
      department:     'Refinery Maintenance',
      status:         'offline',
      emergency_contact: { name: 'Dmitri Rostov', phone: '+1-555-0102', relationship: 'Father' }
    },
    {
      worker_id:      'EMP-1003',
      name:           'Kofi Mensah',
      email:          'kofi@guardian.ai',
      password_hash:  workerHash,
      role:           'worker',
      department:     'Safety Engineering',
      status:         'offline',
      emergency_contact: { name: 'Ama Mensah', phone: '+1-555-0103', relationship: 'Sister' }
    }
  ]);

  if (workersErr) { console.error('[Seed] Workers insert failed:', workersErr.message); process.exit(1); }
  console.log('[Seed] Workers inserted.');

  // Seed helmets
  const { error: helmetsErr } = await supabase.from('helmets').insert([
    { helmet_id: 'HLM-001', status: 'assigned', assigned_worker_id: 'EMP-1001', battery: 92 },
    { helmet_id: 'HLM-002', status: 'assigned', assigned_worker_id: 'EMP-1002', battery: 88 },
    { helmet_id: 'HLM-003', status: 'assigned', assigned_worker_id: 'EMP-1003', battery: 85 }
  ]);

  if (helmetsErr) { console.error('[Seed] Helmets insert failed:', helmetsErr.message); process.exit(1); }
  console.log('[Seed] Helmets inserted.');

  console.log('[Seed] ✅ Database seeded successfully!');
  console.log('[Seed]    Admin login: admin@guardian.ai / admin123');
  console.log('[Seed]    Worker login: marcus@guardian.ai / worker123');
  process.exit(0);
}

seed().catch(err => {
  console.error('[Seed] Fatal error:', err);
  process.exit(1);
});
