-- Scope SELECT so sales users only see credentials for buildings they created.
-- super_admin retains unrestricted access.
DROP POLICY IF EXISTS bms_trial_credentials_select ON bms_trial_credentials;
CREATE POLICY bms_trial_credentials_select ON bms_trial_credentials
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bms_profiles
      WHERE bms_profiles.id = auth.uid()
        AND bms_profiles.role = 'super_admin'
        AND bms_profiles.is_active = true
    )
    OR (
      EXISTS (
        SELECT 1 FROM bms_profiles
        WHERE bms_profiles.id = auth.uid()
          AND bms_profiles.role = 'sales'
          AND bms_profiles.is_active = true
      )
      AND bms_trial_credentials.created_by = auth.uid()
    )
  );

-- Scope UPDATE similarly so a sales user cannot update another rep's credentials.
DROP POLICY IF EXISTS bms_trial_credentials_update ON bms_trial_credentials;
CREATE POLICY bms_trial_credentials_update ON bms_trial_credentials
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM bms_profiles
      WHERE bms_profiles.id = auth.uid()
        AND bms_profiles.role = 'super_admin'
        AND bms_profiles.is_active = true
    )
    OR (
      EXISTS (
        SELECT 1 FROM bms_profiles
        WHERE bms_profiles.id = auth.uid()
          AND bms_profiles.role = 'sales'
          AND bms_profiles.is_active = true
      )
      AND bms_trial_credentials.created_by = auth.uid()
    )
  );
