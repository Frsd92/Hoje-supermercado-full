DO $migration$
DECLARE
    target_table RECORD;
BEGIN
    FOR target_table IN
        SELECT
            table_name,
            string_agg(format('%I', column_name), ', ' ORDER BY column_name) AS column_list
        FROM (
            SELECT DISTINCT table_name, column_name
            FROM information_schema.column_privileges
            WHERE table_schema = 'public'
              AND grantee IN ('anon', 'authenticated')
        ) column_grants
        GROUP BY table_name
    LOOP
        EXECUTE format(
            'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM anon, authenticated',
            target_table.column_list,
            target_table.table_name
        );
    END LOOP;
END;
$migration$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
