DO $migration$
DECLARE
    function_definition TEXT;
BEGIN
    SELECT pg_get_functiondef(
        'public.capture_activity_audit_change()'::REGPROCEDURE
    )
    INTO function_definition;

    IF position('INSERT INTO "ActivityAuditLog" (' IN function_definition) = 0 THEN
        RAISE EXCEPTION
            'Expected unqualified ActivityAuditLog insert was not found in capture_activity_audit_change';
    END IF;

    function_definition := replace(
        function_definition,
        'INSERT INTO "ActivityAuditLog" (',
        'INSERT INTO public."ActivityAuditLog" ('
    );

    EXECUTE function_definition;
END;
$migration$;

ALTER FUNCTION public.audit_redact_json(JSONB)
SET search_path = '';

ALTER FUNCTION public.capture_activity_audit_change()
SET search_path = '';
