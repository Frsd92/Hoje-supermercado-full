DO $migration$
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
    existing_order_count INTEGER;
    deleted_order_count INTEGER;
BEGIN
    PERFORM 1
    FROM public."Order"
    WHERE "id" = ANY(target_order_ids)
    FOR UPDATE;

    SELECT count(*)
    INTO existing_order_count
    FROM public."Order"
    WHERE "id" = ANY(target_order_ids);

    IF existing_order_count <> cardinality(target_order_ids) THEN
        RAISE NOTICE 'Test-order cleanup skipped: not all specified orders exist.';
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."Order"
        WHERE "id" = ANY(target_order_ids)
          AND (
              lower("paymentStatus") NOT IN ('failed', 'canceled')
              OR COALESCE("refundedAmount", 0) <> 0
              OR "pagarmeOrderId" IS NOT NULL
              OR "pagarmeChargeId" IS NOT NULL
          )
    ) THEN
        RAISE NOTICE 'Test-order cleanup skipped: payment safety checks did not pass.';
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public."OrderRefundRequest"
        WHERE "orderId" = ANY(target_order_ids)
    ) OR EXISTS (
        SELECT 1 FROM public."OrderServiceRequest"
        WHERE "orderId" = ANY(target_order_ids)
    ) OR EXISTS (
        SELECT 1 FROM public."PagarmeWebhookEvent"
        WHERE "orderId" = ANY(target_order_ids)
    ) OR EXISTS (
        SELECT 1 FROM public."LoyaltyMissionContribution"
        WHERE "orderId" = ANY(target_order_ids)
    ) OR EXISTS (
        SELECT 1 FROM public."LoyaltyPointEntry"
        WHERE "sourceOrderId" = ANY(target_order_ids)
    ) OR EXISTS (
        SELECT 1 FROM public."CouponRecipient"
        WHERE "orderId" = ANY(target_order_ids)
    ) OR EXISTS (
        SELECT 1 FROM public."InventoryOrderFulfillment"
        WHERE "orderId" = ANY(target_order_ids)
    ) OR EXISTS (
        SELECT 1 FROM public."InventoryLotAllocation"
        WHERE "orderId" = ANY(target_order_ids)
    ) THEN
        RAISE NOTICE 'Test-order cleanup skipped: related operational records exist.';
        RETURN;
    END IF;

    DELETE FROM public."Order"
    WHERE "id" = ANY(target_order_ids);

    GET DIAGNOSTICS deleted_order_count = ROW_COUNT;
    RAISE NOTICE 'Test-order cleanup deleted % explicitly specified orders.', deleted_order_count;
END;
$migration$;
