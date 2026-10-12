CREATE TABLE "ActivityAuditLog" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventOrigin" TEXT NOT NULL DEFAULT 'ACCESS',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "method" TEXT,
    "route" TEXT NOT NULL,
    "resourceName" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "deviceType" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "operatingSystem" TEXT NOT NULL,
    "userAgent" TEXT,
    "queryKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "outcome" TEXT NOT NULL,
    "snapshot" JSONB,
    "changes" JSONB,
    "note" TEXT,

    CONSTRAINT "ActivityAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActivityAuditLog_eventKey_key" ON "ActivityAuditLog"("eventKey");
CREATE INDEX "ActivityAuditLog_occurredAt_id_idx" ON "ActivityAuditLog"("occurredAt", "id");
CREATE INDEX "ActivityAuditLog_actorId_occurredAt_idx" ON "ActivityAuditLog"("actorId", "occurredAt");
CREATE INDEX "ActivityAuditLog_action_occurredAt_idx" ON "ActivityAuditLog"("action", "occurredAt");

CREATE OR REPLACE FUNCTION public.audit_redact_json(input_json JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    result JSONB;
    item RECORD;
    element JSONB;
BEGIN
    IF input_json IS NULL THEN
        RETURN NULL;
    END IF;

    IF jsonb_typeof(input_json) = 'object' THEN
        result := '{}'::JSONB;
        FOR item IN SELECT entry.key, entry.value AS field_value FROM jsonb_each(input_json) AS entry
        LOOP
            IF item.key ~* '(password|passphrase|secret|token|credential|authorization|api[_-]?key|private[_-]?key|cvv|security[_-]?code|card|image|photo|xml|danfe|binary|filedata)' THEN
                result := result || jsonb_build_object(item.key, '[omitted]');
            ELSE
                result := result || jsonb_build_object(item.key, public.audit_redact_json(item.field_value));
            END IF;
        END LOOP;
        RETURN result;
    ELSIF jsonb_typeof(input_json) = 'array' THEN
        SELECT COALESCE(jsonb_agg(public.audit_redact_json(elements.element)), '[]'::JSONB)
        INTO result
        FROM jsonb_array_elements(input_json) AS elements(element);
        RETURN result;
    ELSIF jsonb_typeof(input_json) = 'string' AND length(input_json #>> '{}') > 4096 THEN
        RETURN to_jsonb('[omitted: value longer than 4096 characters]');
    END IF;

    RETURN input_json;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_activity_audit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    old_full JSONB;
    new_full JSONB;
    old_row JSONB;
    new_row JSONB;
    changes_json JSONB := '{}'::JSONB;
    field_name TEXT;
    redacted_change BOOLEAN;
    resource_id TEXT;
    actor_id TEXT;
    actor_label TEXT;
    audit_action TEXT;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        old_full := to_jsonb(OLD);
        old_row := public.audit_redact_json(old_full);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        new_full := to_jsonb(NEW);
        new_row := public.audit_redact_json(new_full);
    END IF;

    IF TG_OP = 'UPDATE' THEN
        FOR field_name IN
            SELECT key FROM jsonb_each(old_full)
            UNION
            SELECT key FROM jsonb_each(new_full)
        LOOP
            IF (old_full -> field_name) IS DISTINCT FROM (new_full -> field_name) THEN
                redacted_change :=
                    left(COALESCE(old_row -> field_name #>> '{}', ''), 8) = '[omitted'
                    OR left(COALESCE(new_row -> field_name #>> '{}', ''), 8) = '[omitted';
                changes_json := changes_json || jsonb_build_object(
                    field_name,
                    jsonb_build_object(
                        'before', old_row -> field_name,
                        'after', new_row -> field_name,
                        'redacted', redacted_change
                    )
                );
            END IF;
        END LOOP;
        IF changes_json = '{}'::JSONB THEN
            RETURN NEW;
        END IF;
    END IF;

    resource_id := COALESCE(
        new_row ->> 'id',
        new_row ->> 'key',
        new_row ->> 'email',
        old_row ->> 'id',
        old_row ->> 'key',
        old_row ->> 'email'
    );
    IF TG_OP = 'INSERT' THEN
        actor_label := COALESCE(
            NULLIF(new_row ->> 'createdBy', ''),
            NULLIF(new_row ->> 'actor', ''),
            NULLIF(new_row ->> 'importedBy', '')
        );
    ELSIF TG_OP = 'UPDATE' THEN
        actor_label := COALESCE(
            NULLIF(new_row ->> 'updatedBy', ''),
            NULLIF(new_row ->> 'actor', ''),
            NULLIF(old_row ->> 'updatedBy', ''),
            NULLIF(old_row ->> 'actor', '')
        );
    ELSE
        actor_label := COALESCE(
            NULLIF(old_row ->> 'updatedBy', ''),
            NULLIF(old_row ->> 'actor', ''),
            NULLIF(old_row ->> 'createdBy', ''),
            NULLIF(old_row ->> 'importedBy', '')
        );
    END IF;
    actor_label := COALESCE(actor_label, 'Sistema (ator não identificado)');
    actor_id := actor_label;
    audit_action := CASE TG_OP
        WHEN 'INSERT' THEN 'CREATE'
        WHEN 'UPDATE' THEN 'UPDATE'
        ELSE 'DELETE'
    END;

    INSERT INTO "ActivityAuditLog" (
        "id", "eventKey", "eventOrigin", "actorId", "actorLabel", "actorType", "action",
        "route", "resourceName", "resourceId", "deviceType", "browser",
        "operatingSystem", "queryKeys", "outcome", "snapshot", "changes"
    ) VALUES (
        gen_random_uuid()::TEXT,
        'db:' || gen_random_uuid()::TEXT,
        'DATABASE',
        actor_id,
        actor_label,
        CASE WHEN actor_label = 'Sistema (ator não identificado)' THEN 'SISTEMA' ELSE 'ATOR_DO_REGISTRO' END,
        audit_action,
        'database://' || TG_TABLE_NAME,
        TG_TABLE_NAME,
        resource_id,
        'Não disponível (evento do banco)',
        'Não disponível',
        'Não disponível',
        ARRAY[]::TEXT[],
        'RECORDED_CHANGE',
        CASE WHEN TG_OP = 'DELETE' THEN old_row WHEN TG_OP = 'INSERT' THEN new_row ELSE NULL END,
        CASE WHEN TG_OP = 'UPDATE' THEN changes_json ELSE NULL END
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    target_table RECORD;
BEGIN
    FOR target_table IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN (
              'ActivityAuditLog',
              'ProductAuditLog',
              'SupplierAuditLog',
              'SupplierInvoiceAuditLog',
              'PurchaseOrderAuditLog',
              '_prisma_migrations'
          )
    LOOP
        EXECUTE format(
            'CREATE TRIGGER global_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_activity_audit_change()',
            target_table.tablename
        );
    END LOOP;
END;
$$;
