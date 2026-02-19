-- This script must be run in the Supabase Dashboard SQL Editor as it requires superuser privileges.
-- The 'spatial_ref_sys' table is part of the PostGIS extension and usually owned by 'supabase_admin'.
-- Standard database connections (even 'postgres') cannot modify this table directly.

BEGIN;

-- 1. Enable Row Level Security (RLS) on the table
ALTER TABLE "public"."spatial_ref_sys" ENABLE ROW LEVEL SECURITY;

-- 2. Create a policy to allow read access for everyone (since standard PostGIS functions need to read this table)
-- We check if policy exists first to be safe, though usually not needed if running once.
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."spatial_ref_sys";
CREATE POLICY "Enable read access for all users" ON "public"."spatial_ref_sys" FOR SELECT USING (true);

COMMIT;
