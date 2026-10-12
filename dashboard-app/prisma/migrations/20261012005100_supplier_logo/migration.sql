ALTER TABLE "Supplier"
ADD COLUMN "logoData" TEXT,
ADD COLUMN "logoMimeType" TEXT;

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
            IF item.key ~* '(password|passphrase|secret|token|credential|authorization|api[_-]?key|private[_-]?key|cvv|security[_-]?code|card|image|photo|logo|xml|danfe|binary|filedata)' THEN
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
