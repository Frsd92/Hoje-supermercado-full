DO $migration$
DECLARE
    table_name TEXT;
    internal_tables TEXT[] := ARRAY[
        'User',
        'ActivityAuditLog',
        'CustomerProfile',
        'CustomerAddressBook',
        'ServiceRegionState',
        'ServiceRegionMunicipality',
        'StorePresenceSession',
        'StoreTrafficSnapshot',
        'CustomerCart',
        'GuestCart',
        'Product',
        'ProductLot',
        'InventoryCount',
        'InventoryCountItem',
        'InventoryOrderFulfillment',
        'InventoryLotAllocation',
        'ProductBarcode',
        'ProductAuditLog',
        'StoreLayoutAsset',
        'StoreLayoutSlideSettings',
        'Supplier',
        'SupplierAuditLog',
        'PurchaseOrder',
        'PurchaseOrderItem',
        'SupplierInvoice',
        'SupplierInvoiceItem',
        'SupplierInvoiceReceiptLot',
        'SupplierPayable',
        'SupplierInvoiceAuditLog',
        'PurchaseOrderAuditLog',
        'Favorite',
        'Order',
        'PagarmeWebhookEvent',
        'OrderItem',
        'OrderRefundRequest',
        'OrderRefundEvent',
        'OrderServiceRequest',
        'Notification',
        'CustomerAnnouncement',
        'NotificationRecipient',
        'CouponCampaign',
        'CouponRecipient',
        'CouponRedemption',
        'LoyaltyMission',
        'LoyaltyMissionProgress',
        'LoyaltyMissionContribution',
        'LoyaltyReward',
        'LoyaltyRewardRedemption',
        'LoyaltyPointEntry',
        'LoyaltyPointAllocation'
    ];
BEGIN
    FOREACH table_name IN ARRAY internal_tables
    LOOP
        IF to_regclass(format('public.%I', table_name)) IS NULL THEN
            RAISE EXCEPTION 'Expected application table public.% is missing.', table_name;
        END IF;

        EXECUTE format(
            'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
            table_name
        );
    END LOOP;
END;
$migration$;
