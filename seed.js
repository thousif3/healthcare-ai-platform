/**
 * Healthcare AI Platform — Database Seeder (Phase 1)
 * ─────────────────────────────────────────────────────
 * Safely inserts realistic mock patients + appointments into
 * the healthcare_ai database.  Idempotent: if a patient email
 * already exists it is skipped (ON CONFLICT DO NOTHING), so
 * you can re-run this script without creating duplicates.
 *
 * Usage:
 *   node seed.js
 */

'use strict';

require('dotenv').config();
const { Pool } = require('pg');

// ─── DB Connection ────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.PGHOST     || 'localhost',
  port:     parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'healthcare_ai',
  user:     process.env.PGUSER     || 'postgres',
  password: process.env.PGPASSWORD,
});

// ─── Mock Providers (UUIDs — wired to providers table in Phase 2) ─────────────
const PROVIDERS = {
  cardiology:   'a1b2c3d4-0001-0001-0001-000000000001',
  primaryCare:  'a1b2c3d4-0002-0002-0002-000000000002',
  orthopedics:  'a1b2c3d4-0003-0003-0003-000000000003',
};

// ─── Seed Data ────────────────────────────────────────────────────────────────
/**
 * Each entry maps 1 patient → 1+ appointments.
 * no_show_probability mirrors what the AI service would predict;
 * values ≥ 0.70 trigger the "High Flight Risk" badge in the UI.
 */
const SEED_DATA = [
  // ── HIGH RISK (no_show_probability ≥ 0.70) ───────────────────────────────
  {
    patient: {
      first_name: 'Marcus',        last_name: 'Washington',
      date_of_birth: '1978-03-14', gender: 'Male',
      email: 'marcus.washington@mockmail.dev',
      phone: '312-555-0191',
      insurance_provider: 'BlueCross BlueShield',
      previous_no_shows: 4,  previous_visits: 9,
      chronic_conditions: ['hypertension', 'type-2-diabetes'],
      has_transportation: false, distance_to_clinic: 18.4,
    },
    appointments: [
      {
        scheduled_at: '2026-04-10T09:00:00-05:00',
        appointment_type: 'in-person', department: 'Cardiology',
        duration_minutes: 45, provider_id: PROVIDERS.cardiology,
        no_show_probability: 0.8812, model_version: 'v1.0.0',
      },
    ],
  },
  {
    patient: {
      first_name: 'Destiny',       last_name: 'Okafor',
      date_of_birth: '1995-07-22', gender: 'Female',
      email: 'destiny.okafor@mockmail.dev',
      phone: '773-555-0342',
      insurance_provider: 'Medicaid',
      previous_no_shows: 3,  previous_visits: 5,
      chronic_conditions: ['asthma'],
      has_transportation: false, distance_to_clinic: 11.2,
    },
    appointments: [
      {
        scheduled_at: '2026-04-11T14:30:00-05:00',
        appointment_type: 'follow-up', department: 'Primary Care',
        duration_minutes: 30, provider_id: PROVIDERS.primaryCare,
        no_show_probability: 0.7654, model_version: 'v1.0.0',
      },
    ],
  },
  {
    patient: {
      first_name: 'Robert',        last_name: 'Chen',
      date_of_birth: '1962-11-05', gender: 'Male',
      email: 'robert.chen@mockmail.dev',
      phone: '847-555-0578',
      insurance_provider: 'Medicare',
      previous_no_shows: 5,  previous_visits: 12,
      chronic_conditions: ['chronic-kidney-disease', 'hypertension', 'obesity'],
      has_transportation: true, distance_to_clinic: 24.7,
    },
    appointments: [
      {
        scheduled_at: '2026-04-14T08:15:00-05:00',
        appointment_type: 'procedure', department: 'Cardiology',
        duration_minutes: 60, provider_id: PROVIDERS.cardiology,
        no_show_probability: 0.9123, model_version: 'v1.0.0',
      },
    ],
  },
  {
    patient: {
      first_name: 'Aaliyah',       last_name: 'Johnson',
      date_of_birth: '1989-01-30', gender: 'Female',
      email: 'aaliyah.johnson@mockmail.dev',
      phone: '708-555-0229',
      insurance_provider: 'Aetna',
      previous_no_shows: 2,  previous_visits: 7,
      chronic_conditions: ['depression', 'type-2-diabetes'],
      has_transportation: false, distance_to_clinic: 9.5,
    },
    appointments: [
      {
        scheduled_at: '2026-04-15T11:00:00-05:00',
        appointment_type: 'telehealth', department: 'Primary Care',
        duration_minutes: 30, provider_id: PROVIDERS.primaryCare,
        no_show_probability: 0.7289, model_version: 'v1.0.0',
      },
    ],
  },

  // ── MEDIUM RISK (0.50 ≤ no_show_probability < 0.70) ──────────────────────
  {
    patient: {
      first_name: 'Sandra',        last_name: 'Patel',
      date_of_birth: '1980-06-18', gender: 'Female',
      email: 'sandra.patel@mockmail.dev',
      phone: '630-555-0413',
      insurance_provider: 'UnitedHealth',
      previous_no_shows: 1,  previous_visits: 8,
      chronic_conditions: ['hypothyroidism'],
      has_transportation: true, distance_to_clinic: 5.3,
    },
    appointments: [
      {
        scheduled_at: '2026-04-09T10:30:00-05:00',
        appointment_type: 'in-person', department: 'Primary Care',
        duration_minutes: 30, provider_id: PROVIDERS.primaryCare,
        no_show_probability: 0.5841, model_version: 'v1.0.0',
      },
    ],
  },
  {
    patient: {
      first_name: 'James',         last_name: 'Rivera',
      date_of_birth: '1971-09-03', gender: 'Male',
      email: 'james.rivera@mockmail.dev',
      phone: '312-555-0667',
      insurance_provider: 'Cigna',
      previous_no_shows: 2,  previous_visits: 11,
      chronic_conditions: ['lower-back-pain'],
      has_transportation: true, distance_to_clinic: 7.1,
    },
    appointments: [
      {
        scheduled_at: '2026-04-16T13:00:00-05:00',
        appointment_type: 'follow-up', department: 'Orthopedics',
        duration_minutes: 30, provider_id: PROVIDERS.orthopedics,
        no_show_probability: 0.6102, model_version: 'v1.0.0',
      },
    ],
  },

  // ── LOW RISK (no_show_probability < 0.50) ─────────────────────────────────
  {
    patient: {
      first_name: 'Emily',         last_name: 'Thompson',
      date_of_birth: '1992-04-12', gender: 'Female',
      email: 'emily.thompson@mockmail.dev',
      phone: '847-555-0881',
      insurance_provider: 'BlueCross BlueShield',
      previous_no_shows: 0,  previous_visits: 6,
      chronic_conditions: [],
      has_transportation: true, distance_to_clinic: 2.8,
    },
    appointments: [
      {
        scheduled_at: '2026-04-08T09:45:00-05:00',
        appointment_type: 'in-person', department: 'Primary Care',
        duration_minutes: 30, provider_id: PROVIDERS.primaryCare,
        no_show_probability: 0.1234, model_version: 'v1.0.0',
      },
    ],
  },
  {
    patient: {
      first_name: 'David',         last_name: 'Kim',
      date_of_birth: '1985-12-27', gender: 'Male',
      email: 'david.kim@mockmail.dev',
      phone: '773-555-0992',
      insurance_provider: 'Aetna',
      previous_no_shows: 0,  previous_visits: 14,
      chronic_conditions: ['seasonal-allergies'],
      has_transportation: true, distance_to_clinic: 3.1,
    },
    appointments: [
      {
        scheduled_at: '2026-04-17T15:00:00-05:00',
        appointment_type: 'telehealth', department: 'Primary Care',
        duration_minutes: 20, provider_id: PROVIDERS.primaryCare,
        no_show_probability: 0.0891, model_version: 'v1.0.0',
      },
    ],
  },
  {
    patient: {
      first_name: 'Maria',         last_name: 'Gonzalez',
      date_of_birth: '1967-08-09', gender: 'Female',
      email: 'maria.gonzalez@mockmail.dev',
      phone: '630-555-0154',
      insurance_provider: 'Medicare',
      previous_no_shows: 1,  previous_visits: 20,
      chronic_conditions: ['osteoarthritis'],
      has_transportation: true, distance_to_clinic: 4.6,
    },
    appointments: [
      {
        scheduled_at: '2026-04-21T10:00:00-05:00',
        appointment_type: 'follow-up', department: 'Orthopedics',
        duration_minutes: 30, provider_id: PROVIDERS.orthopedics,
        no_show_probability: 0.3150, model_version: 'v1.0.0',
      },
    ],
  },
  {
    patient: {
      first_name: 'Noah',          last_name: 'Adeyemi',
      date_of_birth: '2001-02-14', gender: 'Male',
      email: 'noah.adeyemi@mockmail.dev',
      phone: '708-555-0736',
      insurance_provider: 'UnitedHealth',
      previous_no_shows: 0,  previous_visits: 2,
      chronic_conditions: [],
      has_transportation: true, distance_to_clinic: 1.5,
    },
    appointments: [
      {
        scheduled_at: '2026-04-22T08:30:00-05:00',
        appointment_type: 'in-person', department: 'Primary Care',
        duration_minutes: 30, provider_id: PROVIDERS.primaryCare,
        no_show_probability: 0.0423, model_version: 'v1.0.0',
      },
    ],
  },
];

// ─── Seeder Logic ─────────────────────────────────────────────────────────────
async function seed() {
  const client = await pool.connect();

  try {
    console.log('\n🌱  Healthcare AI Platform — Database Seeder\n' + '─'.repeat(50));
    await client.query('BEGIN');

    let patientsInserted     = 0;
    let patientsSkipped      = 0;
    let appointmentsInserted = 0;

    for (const entry of SEED_DATA) {
      const { patient, appointments } = entry;

      // ── Insert patient (skip on duplicate email) ──────────────────────────
      const patientResult = await client.query(
        `INSERT INTO patients (
           first_name, last_name, date_of_birth, gender,
           email, phone,
           insurance_provider,
           previous_no_shows, previous_visits,
           chronic_conditions, has_transportation, distance_to_clinic
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (email) DO NOTHING
         RETURNING patient_id, first_name, last_name`,
        [
          patient.first_name,   patient.last_name,
          patient.date_of_birth, patient.gender,
          patient.email,         patient.phone,
          patient.insurance_provider,
          patient.previous_no_shows, patient.previous_visits,
          patient.chronic_conditions,
          patient.has_transportation, patient.distance_to_clinic,
        ]
      );

      if (patientResult.rowCount === 0) {
        console.log(`  ⚠️  Skipped (already exists): ${patient.first_name} ${patient.last_name}`);
        patientsSkipped++;
        continue; // Skip their appointments too — likely already seeded
      }

      const patientId = patientResult.rows[0].patient_id;
      patientsInserted++;
      console.log(`  ✅ Patient:     ${patient.first_name} ${patient.last_name} (${patientId})`);

      // ── Insert appointments for this patient ──────────────────────────────
      for (const appt of appointments) {
        const apptResult = await client.query(
          `INSERT INTO appointments (
             patient_id, provider_id, scheduled_at,
             duration_minutes, appointment_type, department,
             no_show_probability, scored_at, model_version
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), $8)
           RETURNING appointment_id, risk_tier, no_show_probability`,
          [
            patientId,           appt.provider_id,  appt.scheduled_at,
            appt.duration_minutes, appt.appointment_type, appt.department,
            appt.no_show_probability, appt.model_version,
          ]
        );

        const { risk_tier, no_show_probability } = apptResult.rows[0];
        const badge =
          risk_tier === 'high'   ? '🔴 HIGH RISK  ' :
          risk_tier === 'medium' ? '🟡 MEDIUM RISK' :
                                   '🟢 LOW RISK   ';

        console.log(
          `     └─ Appointment: ${appt.department.padEnd(14)} ` +
          `${badge}  (p=${parseFloat(no_show_probability).toFixed(4)})`
        );
        appointmentsInserted++;
      }
    }

    await client.query('COMMIT');

    console.log('\n' + '─'.repeat(50));
    console.log(`✨  Seeding complete!`);
    console.log(`    Patients inserted : ${patientsInserted}`);
    console.log(`    Patients skipped  : ${patientsSkipped}`);
    console.log(`    Appointments added: ${appointmentsInserted}`);
    console.log('─'.repeat(50) + '\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌  Seeding failed — transaction rolled back.');
    console.error('    Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
