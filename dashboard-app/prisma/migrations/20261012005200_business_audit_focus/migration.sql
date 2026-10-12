ALTER TABLE "ProductLot"
ADD COLUMN "updatedBy" TEXT;

ALTER TABLE "InventoryCountItem"
ADD COLUMN "updatedBy" TEXT;

ALTER TABLE "LoyaltyMission"
ADD COLUMN "updatedBy" TEXT;

ALTER TABLE "LoyaltyReward"
ADD COLUMN "updatedBy" TEXT;

ALTER TABLE "CouponRecipient"
ADD COLUMN "createdBy" TEXT;

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
            NULLIF(new_row ->> 'importedBy', ''),
            NULLIF(new_row ->> 'requestedBy', ''),
            NULLIF(new_row ->> 'reviewedBy', ''),
            NULLIF(new_row ->> 'completedBy', ''),
            NULLIF(new_row ->> 'receivedBy', ''),
            NULLIF(new_row ->> 'postedBy', ''),
            NULLIF(new_row ->> 'approvedBy', ''),
            NULLIF(new_row ->> 'processedBy', ''),
            NULLIF(new_row ->> 'adjustedBy', ''),
            NULLIF(new_row ->> 'fulfilledBy', ''),
            NULLIF(new_row ->> 'countedBy', ''),
            NULLIF(new_row ->> 'cancelledBy', ''),
            NULLIF(new_row ->> 'canceledBy', '')
        );
    ELSIF TG_OP = 'UPDATE' THEN
        actor_label := COALESCE(
            NULLIF(new_row ->> 'updatedBy', ''),
            NULLIF(new_row ->> 'actor', ''),
            NULLIF(new_row ->> 'reviewedBy', ''),
            NULLIF(new_row ->> 'completedBy', ''),
            NULLIF(new_row ->> 'receivedBy', ''),
            NULLIF(new_row ->> 'postedBy', ''),
            NULLIF(new_row ->> 'approvedBy', ''),
            NULLIF(new_row ->> 'processedBy', ''),
            NULLIF(new_row ->> 'adjustedBy', ''),
            NULLIF(new_row ->> 'fulfilledBy', ''),
            NULLIF(new_row ->> 'countedBy', ''),
            NULLIF(new_row ->> 'cancelledBy', ''),
            NULLIF(new_row ->> 'canceledBy', ''),
            NULLIF(new_row ->> 'requestedBy', ''),
            NULLIF(new_row ->> 'createdBy', ''),
            NULLIF(old_row ->> 'updatedBy', ''),
            NULLIF(old_row ->> 'actor', ''),
            NULLIF(old_row ->> 'reviewedBy', ''),
            NULLIF(old_row ->> 'completedBy', ''),
            NULLIF(old_row ->> 'receivedBy', ''),
            NULLIF(old_row ->> 'postedBy', ''),
            NULLIF(old_row ->> 'approvedBy', ''),
            NULLIF(old_row ->> 'processedBy', ''),
            NULLIF(old_row ->> 'adjustedBy', ''),
            NULLIF(old_row ->> 'fulfilledBy', ''),
            NULLIF(old_row ->> 'countedBy', ''),
            NULLIF(old_row ->> 'cancelledBy', ''),
            NULLIF(old_row ->> 'canceledBy', ''),
            NULLIF(old_row ->> 'requestedBy', ''),
            NULLIF(old_row ->> 'createdBy', '')
        );
    ELSE
        actor_label := COALESCE(
            NULLIF(old_row ->> 'updatedBy', ''),
            NULLIF(old_row ->> 'actor', ''),
            NULLIF(old_row ->> 'reviewedBy', ''),
            NULLIF(old_row ->> 'completedBy', ''),
            NULLIF(old_row ->> 'receivedBy', ''),
            NULLIF(old_row ->> 'postedBy', ''),
            NULLIF(old_row ->> 'approvedBy', ''),
            NULLIF(old_row ->> 'processedBy', ''),
            NULLIF(old_row ->> 'adjustedBy', ''),
            NULLIF(old_row ->> 'fulfilledBy', ''),
            NULLIF(old_row ->> 'countedBy', ''),
            NULLIF(old_row ->> 'cancelledBy', ''),
            NULLIF(old_row ->> 'canceledBy', ''),
            NULLIF(old_row ->> 'requestedBy', ''),
            NULLIF(old_row ->> 'createdBy', ''),
            NULLIF(old_row ->> 'importedBy', '')
        );
    END IF;

    IF actor_label IS NULL AND TG_OP = 'INSERT' AND TG_TABLE_NAME = 'InventoryLotAllocation' THEN
        SELECT NULLIF("actor", '')
        INTO actor_label
        FROM public."InventoryOrderFulfillment"
        WHERE "orderId" = new_row ->> 'orderId';
    END IF;

    IF actor_label IS NULL AND TG_OP = 'INSERT' AND TG_TABLE_NAME = 'CouponRedemption' THEN
        actor_label := NULLIF(new_row ->> 'email', '');
        IF actor_label IS NOT NULL THEN
            actor_label := 'Cliente: ' || actor_label;
        END IF;
    END IF;

    IF actor_label IS NULL AND TG_OP = 'INSERT' AND TG_TABLE_NAME = 'LoyaltyRewardRedemption' THEN
        actor_label := NULLIF(new_row ->> 'customerEmail', '');
        IF actor_label IS NOT NULL THEN
            actor_label := 'Cliente: ' || actor_label;
        END IF;
    END IF;

    IF actor_label IS NULL AND TG_TABLE_NAME IN (
        'LoyaltyMissionProgress',
        'LoyaltyMissionContribution',
        'LoyaltyPointEntry',
        'LoyaltyPointAllocation'
    ) THEN
        actor_label := 'Sistema (processamento de fidelidade)';
    END IF;

    IF actor_label IS NULL AND TG_OP = 'INSERT' AND TG_TABLE_NAME = 'Order' THEN
        actor_label := NULLIF(new_row ->> 'customerName', '');
        IF actor_label IS NOT NULL THEN
            actor_label := 'Cliente: ' || actor_label;
        END IF;
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
        CASE WHEN actor_label LIKE 'Sistema (%' THEN 'SISTEMA' ELSE 'ATOR_DO_REGISTRO' END,
        audit_action,
        'database://' || TG_TABLE_NAME,
        TG_TABLE_NAME,
        resource_id,
        'Não disponível (evento do banco)',
        'Não disponível',
        'Não disponível',
        ARRAY[]::TEXT[],
        'RECORDED_CHANGE',
        CASE
            WHEN TG_OP = 'DELETE' THEN old_row
            WHEN TG_OP = 'INSERT' THEN new_row
            ELSE jsonb_strip_nulls(jsonb_build_object(
                'id', resource_id,
                'productId', new_row -> 'productId',
                'orderId', new_row -> 'orderId',
                'orderItemId', new_row -> 'orderItemId',
                'supplierId', new_row -> 'supplierId',
                'purchaseOrderId', new_row -> 'purchaseOrderId',
                'invoiceId', new_row -> 'invoiceId',
                'campaignId', new_row -> 'campaignId',
                'missionId', new_row -> 'missionId',
                'countId', new_row -> 'countId',
                'lotId', new_row -> 'lotId',
                'refundRequestId', new_row -> 'refundRequestId'
            ))
        END,
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
              'ProductLot',
              'InventoryCount',
              'InventoryCountItem',
              'InventoryOrderFulfillment',
              'InventoryLotAllocation',
              'Order',
              'OrderRefundRequest',
              'OrderRefundEvent',
              'OrderServiceRequest',
              'CouponCampaign',
              'CouponRecipient',
              'CouponRedemption',
              'LoyaltyMission',
              'LoyaltyMissionProgress',
              'LoyaltyMissionContribution',
              'LoyaltyReward',
              'LoyaltyRewardRedemption',
              'LoyaltyPointEntry',
              'LoyaltyPointAllocation',
              'ActivityAuditLog',
              'ProductAuditLog',
              'SupplierAuditLog',
              'SupplierInvoiceAuditLog',
              'PurchaseOrderAuditLog',
              '_prisma_migrations'
          )
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS global_activity_audit ON public.%I',
            target_table.tablename
        );
    END LOOP;
END;
$$;
