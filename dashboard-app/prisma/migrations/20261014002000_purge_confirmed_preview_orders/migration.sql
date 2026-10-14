DO $cleanup$
DECLARE
    target_order_ids TEXT[] := ARRAY[
        'PED-68f8c9ff-40dc-4a87-89ef-c90fdeefd6b6',
        'PED-91777ae5-1ce8-4012-a347-def193c77631',
        'PED-a8dc64d1-f740-4687-9b11-60a0cdd251b8',
        'PED-e9003ca6-499e-45e0-bbee-a3789e1fecd7',
        'PED-c1bc03b2-5d51-4aec-8875-a3d537d78f1c',
        'PED-8e6e094e-9333-4eda-939d-1c30caaa8f5f',
        'PED-3f5a6f8c-ac4d-41b2-a03d-c6fe2dfdc37f'
    ];
    preserved_order_id TEXT := 'PED-76d5c01a-9113-44c9-8246-3e6f67233014';
    cleanup_actor TEXT := 'Sistema (limpeza de pedidos fictícios)';
    expected_order_count INTEGER;
    affected_order_count INTEGER;
    restored_lot_count INTEGER;
    restored_product_count INTEGER;
    order_item_ids TEXT[];
    refund_request_ids TEXT[];
    refund_event_ids TEXT[];
    service_request_ids TEXT[];
    webhook_event_ids TEXT[];
    mission_contribution_ids TEXT[];
    point_entry_ids TEXT[];
    coupon_redemption_ids TEXT[];
    allocation_ids TEXT[];
    product_ids TEXT[];
    product_before JSONB;
BEGIN
    expected_order_count := cardinality(target_order_ids);

    PERFORM 1
    FROM public."Order"
    WHERE "id" = ANY(target_order_ids)
    FOR UPDATE;

    SELECT count(*)
    INTO affected_order_count
    FROM public."Order"
    WHERE "id" = ANY(target_order_ids);

    IF affected_order_count <> expected_order_count THEN
        RAISE EXCEPTION 'Preview order cleanup stopped: expected % orders, found %.',
            expected_order_count, affected_order_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public."Order" WHERE "id" = preserved_order_id
    ) THEN
        RAISE EXCEPTION 'Preview order cleanup stopped: preserved real order was not found.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."LoyaltyPointEntry"
        WHERE "sourceOrderId" = ANY(target_order_ids)
    ) THEN
        RAISE EXCEPTION 'Preview order cleanup stopped: loyalty points need a separate reconciliation.';
    END IF;

    SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[])
    INTO order_item_ids
    FROM public."OrderItem"
    WHERE "orderId" = ANY(target_order_ids);

    SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[])
    INTO refund_request_ids
    FROM public."OrderRefundRequest"
    WHERE "orderId" = ANY(target_order_ids);

    SELECT COALESCE(array_agg(event."id"), ARRAY[]::TEXT[])
    INTO refund_event_ids
    FROM public."OrderRefundEvent" event
    WHERE event."refundRequestId" = ANY(refund_request_ids);

    SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[])
    INTO service_request_ids
    FROM public."OrderServiceRequest"
    WHERE "orderId" = ANY(target_order_ids);

    SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[])
    INTO webhook_event_ids
    FROM public."PagarmeWebhookEvent"
    WHERE "orderId" = ANY(target_order_ids);

    SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[])
    INTO mission_contribution_ids
    FROM public."LoyaltyMissionContribution"
    WHERE "orderId" = ANY(target_order_ids);

    SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[])
    INTO point_entry_ids
    FROM public."LoyaltyPointEntry"
    WHERE "sourceOrderId" = ANY(target_order_ids);

    SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[])
    INTO coupon_redemption_ids
    FROM public."CouponRedemption"
    WHERE "orderId" = ANY(target_order_ids);

    SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[])
    INTO allocation_ids
    FROM public."InventoryLotAllocation"
    WHERE "orderId" = ANY(target_order_ids);

    SELECT COALESCE(array_agg(DISTINCT "productId"), ARRAY[]::TEXT[])
    INTO product_ids
    FROM public."InventoryLotAllocation"
    WHERE "orderId" = ANY(target_order_ids);

    IF cardinality(allocation_ids) > 0 THEN
        PERFORM 1
        FROM public."ProductLot"
        WHERE "id" IN (
            SELECT "lotId"
            FROM public."InventoryLotAllocation"
            WHERE "orderId" = ANY(target_order_ids)
        )
        FOR UPDATE;

        PERFORM 1
        FROM public."Product"
        WHERE "id" = ANY(product_ids)
        FOR UPDATE;

        IF EXISTS (
            SELECT 1
            FROM public."InventoryLotAllocation" allocation
            LEFT JOIN public."ProductLot" lot ON lot."id" = allocation."lotId"
            WHERE allocation."orderId" = ANY(target_order_ids)
              AND lot."id" IS NULL
        ) THEN
            RAISE EXCEPTION 'Preview order cleanup stopped: an allocated inventory lot is missing.';
        END IF;

        SELECT COALESCE(
            jsonb_agg(jsonb_build_object('id', product."id", 'quantity', product."quantity")),
            '[]'::JSONB
        )
        INTO product_before
        FROM public."Product" product
        WHERE product."id" = ANY(product_ids);

        UPDATE public."ProductLot" lot
        SET "quantity" = lot."quantity" + allocation_totals.quantity,
            "updatedBy" = cleanup_actor,
            "updatedAt" = NOW()
        FROM (
            SELECT "lotId", SUM("quantity") AS quantity
            FROM public."InventoryLotAllocation"
            WHERE "orderId" = ANY(target_order_ids)
            GROUP BY "lotId"
        ) allocation_totals
        WHERE lot."id" = allocation_totals."lotId";

        GET DIAGNOSTICS restored_lot_count = ROW_COUNT;

        IF restored_lot_count <> (
            SELECT count(DISTINCT "lotId")
            FROM public."InventoryLotAllocation"
            WHERE "orderId" = ANY(target_order_ids)
        ) THEN
            RAISE EXCEPTION 'Preview order cleanup stopped: not all inventory lots could be restored.';
        END IF;

        UPDATE public."Product" product
        SET "quantity" = inventory.quantity,
            "expiry" = inventory.expiry,
            "metadata" = CASE
                WHEN inventory.active_lot_count = 1 THEN
                    jsonb_set(
                        jsonb_set(
                            CASE
                                WHEN jsonb_typeof(product."metadata") = 'object' THEN product."metadata"
                                ELSE '{}'::JSONB
                            END,
                            '{lot}',
                            to_jsonb(COALESCE(inventory.only_lot_code, ''))
                        ),
                        '{manufactureDate}',
                        to_jsonb(COALESCE(inventory.only_manufacture_date, ''))
                    )
                ELSE product."metadata"
            END,
            "updatedAt" = NOW()
        FROM (
            SELECT
                lot."productId",
                SUM(lot."quantity") AS quantity,
                (array_agg(lot."expiry" ORDER BY lot."expiry", lot."createdAt", lot."id"))[1] AS expiry,
                count(*) AS active_lot_count,
                (array_agg(lot."lotCode" ORDER BY lot."expiry", lot."createdAt", lot."id"))[1] AS only_lot_code,
                (array_agg(
                    CASE
                        WHEN lot."manufactureDate" IS NULL THEN NULL
                        ELSE to_char(lot."manufactureDate", 'YYYY-MM-DD')
                    END
                    ORDER BY lot."expiry", lot."createdAt", lot."id"
                ))[1] AS only_manufacture_date
            FROM public."ProductLot" lot
            WHERE lot."productId" = ANY(product_ids)
              AND lot."quantity" > 0
            GROUP BY lot."productId"
        ) inventory
        WHERE product."id" = inventory."productId";

        GET DIAGNOSTICS restored_product_count = ROW_COUNT;

        IF restored_product_count <> cardinality(product_ids) THEN
            RAISE EXCEPTION 'Preview order cleanup stopped: product stock could not be reconciled.';
        END IF;

        INSERT INTO public."ProductAuditLog" (
            "id", "productId", "productExternalId", "productTitle",
            "action", "actor", "snapshot", "changes", "note"
        )
        SELECT
            gen_random_uuid()::TEXT,
            product."id",
            product."externalId",
            product."title",
            'TEST_DATA_CLEANUP',
            cleanup_actor,
            jsonb_build_object('id', product."id", 'quantity', prior.value -> 'quantity'),
            jsonb_build_object(
                'quantity',
                jsonb_build_object('before', prior.value -> 'quantity', 'after', to_jsonb(product."quantity"))
            ),
            'Estoque recomposto após a remoção de pedidos fictícios do ambiente de testes.'
        FROM public."Product" product
        JOIN jsonb_array_elements(product_before) AS prior(value)
          ON prior.value ->> 'id' = product."id";
    ELSE
        restored_lot_count := 0;
        restored_product_count := 0;
    END IF;

    DELETE FROM public."OrderServiceRequest"
    WHERE "orderId" = ANY(target_order_ids);

    DELETE FROM public."OrderRefundRequest"
    WHERE "orderId" = ANY(target_order_ids);

    DELETE FROM public."CouponRedemption"
    WHERE "orderId" = ANY(target_order_ids);

    DELETE FROM public."LoyaltyMissionContribution"
    WHERE "orderId" = ANY(target_order_ids);

    DELETE FROM public."LoyaltyPointEntry"
    WHERE "sourceOrderId" = ANY(target_order_ids);

    DELETE FROM public."PagarmeWebhookEvent"
    WHERE "orderId" = ANY(target_order_ids);

    DELETE FROM public."InventoryLotAllocation"
    WHERE "orderId" = ANY(target_order_ids);

    DELETE FROM public."InventoryOrderFulfillment"
    WHERE "orderId" = ANY(target_order_ids);

    DELETE FROM public."Order"
    WHERE "id" = ANY(target_order_ids);

    GET DIAGNOSTICS affected_order_count = ROW_COUNT;

    IF affected_order_count <> expected_order_count THEN
        RAISE EXCEPTION 'Preview order cleanup stopped: expected to remove % orders, removed %.',
            expected_order_count, affected_order_count;
    END IF;

    DELETE FROM public."ProductAuditLog" audit
    WHERE EXISTS (
        SELECT 1
        FROM unnest(target_order_ids) AS target(order_id)
        WHERE audit."note" LIKE '%' || target.order_id || '%'
    );

    DELETE FROM public."ActivityAuditLog" audit
    WHERE audit."resourceId" = ANY(target_order_ids)
       OR audit."resourceId" = ANY(order_item_ids)
       OR audit."resourceId" = ANY(refund_request_ids)
       OR audit."resourceId" = ANY(refund_event_ids)
       OR audit."resourceId" = ANY(service_request_ids)
       OR audit."resourceId" = ANY(webhook_event_ids)
       OR audit."resourceId" = ANY(mission_contribution_ids)
       OR audit."resourceId" = ANY(point_entry_ids)
       OR audit."resourceId" = ANY(coupon_redemption_ids)
       OR audit."resourceId" = ANY(allocation_ids)
       OR audit."snapshot" ->> 'id' = ANY(target_order_ids)
       OR audit."snapshot" ->> 'orderId' = ANY(target_order_ids)
       OR audit."snapshot" ->> 'refundRequestId' = ANY(refund_request_ids);

    INSERT INTO public."ActivityAuditLog" (
        "id", "eventKey", "eventOrigin", "actorId", "actorLabel", "actorType",
        "action", "route", "resourceName", "resourceId", "deviceType", "browser",
        "operatingSystem", "queryKeys", "outcome", "snapshot", "note"
    ) VALUES (
        gen_random_uuid()::TEXT,
        'cleanup:' || gen_random_uuid()::TEXT,
        'DATABASE',
        cleanup_actor,
        'Sistema (limpeza administrativa autorizada)',
        'SISTEMA',
        'DELETE',
        '/erp/orders',
        'OrderTestDataCleanup',
        NULL,
        'Não disponível (operação administrativa)',
        'Não disponível',
        'Não disponível',
        ARRAY[]::TEXT[],
        'TEST_DATA_PURGED',
        jsonb_build_object(
            'orderCount', expected_order_count,
            'preservedOrderId', preserved_order_id,
            'inventoryLotsRestored', restored_lot_count,
            'productsReconciled', restored_product_count,
            'sandboxChargesCancelled', expected_order_count
        ),
        'Pedidos fictícios do ambiente de testes removidos; pedido real preservado.'
    );
END;
$cleanup$;
