-- patients stub table (RLS intentionally missing for health demo)
CREATE TABLE IF NOT EXISTS guardian_patients_stub (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
