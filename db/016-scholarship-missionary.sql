ALTER TABLE scholarship_batch DROP CONSTRAINT IF EXISTS scholarship_batch_distributor_role_check;
ALTER TABLE scholarship_batch ADD CONSTRAINT scholarship_batch_distributor_role_check
  CHECK (distributor_role IN ('pastor','staff','missionary'));
