import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isTenantWritable,
  calculateLingxingWindowSales,
  convertAmountToUsd,
} from '../src/lib/erpEngine';
import {
  normalizeSupabaseProjectUrl,
  getDynamicSupabaseClient,
  clearLegacyBrowserSupabaseConfig,
  loadSupabaseConfig,
  saveSupabaseConfig,
} from '../src/services/supabaseClient';
import {
  isLingxingOpenMcpGateway,
  LINGXING_OPENMCP_CORE_TOOLS,
  classifyLingxingToolDomain,
  buildDefaultArgsForTool,
  extractRecordsFromMcpResult,
  extractTotalCountFromMcpResult,
  buildPaginatedArgsForTool,
  collectAllPaginatedRecords,
  collectChunkedDateRangeRecords,
  buildDateWindowChunks,
  resolveIncrementalSyncPlan,
  collectPendingOrderRefreshRecords,
  NATIVE_UPDATE_TIME_TOOL_IDS,
  DEFAULT_ORDER_INCREMENTAL_LOOKBACK_DAYS,
  recordSignature,
  DEFAULT_ORDER_SYNC_DAYS,
  ORDER_SYNC_DAY_OPTIONS,
  normalizeLingxingShops,
  normalizeLingxingListings,
  normalizeLingxingOrders,
  normalizeLingxingAdCampaigns,
  normalizeLingxingSettlements,
  normalizeLingxingLocalSkus,
  normalizeLingxingSuppliers,
  normalizeLingxingPurchaseOrders,
  normalizeLingxingWarehouseLedgers,
  normalizeLingxingFbaShipments,
  normalizeLingxingAdSearchTerms,
  normalizeLingxingBomOrders,
  getCurrencyIcon,
  isDemoFixtureRecord,
  mergeSyncedEntities,
} from '../src/services/lingxingMcpSync';
import { getLingxingSchedulerStatus } from '../src/services/lingxingAutoSyncRunner';
import {
  BOOTSTRAP_ENTITY_TYPES,
  PAGE_ENTITY_REQUIREMENTS,
  ALLOWED_QUERY_ENTITIES,
  executePagedEntityQuery,
} from '../src/services/backendDataEngine';
import {
  handleWorkerRequest,
  resetWorkerRuntimeDbConfigForTest,
} from '../worker';

test('01-core-infra: isTenantWritable allows ACTIVE/TRIALING/GRACE_PERIOD and blocks EXPIRED/SUSPENDED', () => {
  assert.equal(isTenantWritable({ subscriptionStatus: 'ACTIVE' }), true);
  assert.equal(isTenantWritable({ subscriptionStatus: 'TRIALING' }), true);
  assert.equal(isTenantWritable({ subscriptionStatus: 'GRACE_PERIOD' }), true);
  assert.equal(isTenantWritable({ subscriptionStatus: 'EXPIRED_READONLY' }), false);
  assert.equal(isTenantWritable({ subscriptionStatus: 'SUSPENDED' }), false);
});

test('01-core-infra: server.ts enforces AbortSignal.timeout on upstream Lingxing fetch and 402 circuit-breaker', () => {
  const code = fs.readFileSync('server.ts', 'utf8');
  assert.match(code, /AbortSignal\.timeout\(\s*8000\s*\)/);
  assert.match(code, /TENANT_SUBSCRIPTION_EXPIRED/);
  assert.match(code, /app\.listen\(\s*PORT\s*,\s*['"]0\.0\.0\.0['"]/);
  assert.match(code, /validateSafeExternalMcpUrl/);
  assert.match(code, /parseMcpResponseBody/);
  assert.equal(/buildStandardLingxingMcpResponse/.test(code), false);
});

test('01-core-infra: Supabase URL normalizer strips /rest/v1/ & converts dashboard URLs and reuses singleton client', () => {
  assert.equal(
    normalizeSupabaseProjectUrl('https://sample-ref.supabase.co/rest/v1/'),
    'https://sample-ref.supabase.co'
  );
  assert.equal(
    normalizeSupabaseProjectUrl('https://supabase.com/dashboard/project/sampleRef01/settings/api'),
    'https://sampleref01.supabase.co'
  );

  const cfg = {
    projectUrl: 'https://sample-ref.supabase.co/rest/v1/',
    anonKey: 'sb_publishable_test_singleton_key',
    authMode: 'SUPABASE_AUTH' as const,
  };
  const c1 = getDynamicSupabaseClient(cfg);
  const c2 = getDynamicSupabaseClient({ ...cfg, projectUrl: 'https://sample-ref.supabase.co' });
  assert.ok(c1, 'Expected valid Supabase client');
  assert.strictEqual(c1, c2, 'Expected exact same singleton client instance to avoid multiple GoTrueClient warnings');

  const appCode = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(appCode.includes('loadErpDatabaseSnapshot'), 'App must hydrate runtime state from live Supabase');
  assert.equal(
    /useState<Tenant\[\]>\(\s*INITIAL_TENANTS\s*\)/.test(appCode),
    false,
    'App must not initialize runtime tenant state from hardcoded demo arrays'
  );
});

test('01-core-infra: Lingxing MCP sync normalizes real Shops, ASIN Listings, and Orders from MCP content[].text', () => {
  assert.equal(classifyLingxingToolDomain({ name: 'get_seller_list', description: '获取授权店铺列表' }), 'SHOPS');
  assert.equal(classifyLingxingToolDomain({ name: 'query_amazon_orders', description: '查询亚马逊订单' }), 'ORDERS');
  assert.equal(classifyLingxingToolDomain({ name: 'get_fba_inventory', description: 'FBA库存与ASIN明细' }), 'LISTINGS');

  const mcpShopPayload = {
    jsonrpc: '2.0',
    result: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 0,
            data: [{ sid: 501, name: 'MyRealShop-US', country: 'US', seller_account_id: 'A1REALUS' }],
          }),
        },
      ],
    },
  };
  const shops = normalizeLingxingShops(extractRecordsFromMcpResult(mcpShopPayload), 'tenant-1');
  assert.equal(shops.length, 1);
  assert.equal(shops[0].shopName, 'MyRealShop-US');
  assert.equal(shops[0].marketplace, 'US');

  const args = buildDefaultArgsForTool(
    {
      name: 'query_amazon_orders',
      description: 'orders',
      domain: 'ORDERS',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          page: { type: 'integer' },
          page_size: { type: 'integer' },
        },
      },
    },
    shops
  );
  assert.match(String(args.start_date), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(args.page, 1);
  assert.equal(args.page_size, 100);

  const listings = normalizeLingxingListings(
    [
      {
        sid: 501,
        asin: 'B09REAL123',
        msku: 'US-REAL-001',
        item_name: 'Real Product Title',
        price: 39.99,
        afn_fulfillable_quantity: 450,
        volume: 120,
      },
    ],
    'tenant-1',
    shops,
    []
  );
  assert.equal(listings.length, 1);
  assert.equal(listings[0].asin, 'B09REAL123');
  assert.equal(listings[0].fbaAvailable, 450);
  assert.equal(listings[0].shopId, shops[0].id);

  const orders = normalizeLingxingOrders(
    [
      {
        sid: 501,
        amazon_order_id: '114-5555555-9999999',
        order_status: 'Shipped',
        order_total_amount: 79.98,
        item_list: [{ asin: 'B09REAL123', seller_sku: 'US-REAL-001', quantity_ordered: 2 }],
      },
    ],
    'tenant-1',
    shops
  );
  assert.equal(orders.length, 1);
  assert.equal(orders[0].amazonOrderId, '114-5555555-9999999');
  assert.equal(orders[0].quantity, 2);

  const merged = mergeSyncedEntities(
    [
      {
        ...shops[0],
        id: 'shop-us-01',
        shopName: 'Store-Alpha-US',
      },
    ],
    shops,
    'tenant-1',
    true
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].shopName, 'MyRealShop-US');
});

test('01-core-infra: Lingxing OpenMCP gateway (help/search/action) builds verified args and normalizes real payloads', () => {
  assert.equal(
    isLingxingOpenMcpGateway([
      { name: 'help' },
      { name: 'search' },
      { name: 'action' },
      { name: 'approval_status' },
    ]),
    true
  );
  assert.equal(isLingxingOpenMcpGateway([{ name: 'get_my_sids' }]), false);

  const shops = normalizeLingxingShops(
    [{ sid: 1702, name: 'Brand-US', country: 'US', seller_id: 'A1TESTUS' }],
    'tenant-1'
  );
  assert.equal(shops.length, 1);
  assert.equal(shops[0].shopName, 'Brand-US');

  const listingTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'erp_listing')!;
  const listingArgs = buildDefaultArgsForTool(listingTool, shops);
  assert.equal(listingArgs.pvi_ids, '');
  assert.equal(listingArgs.sort_field, 'thirty_volume');

  const orderTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'amazon_sales_order_list')!;
  const orderArgs = buildDefaultArgsForTool(orderTool, shops);
  assert.equal(orderArgs.isMcfOrder, '0');

  const adTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'ad_campaign_report')!;
  const adArgs = buildDefaultArgsForTool(adTool, shops, ['2871406096021629']);
  assert.equal(adArgs.sort_field, 'spends');
  assert.deepEqual(adArgs.profile_ids, ['2871406096021629']);

  const listings = normalizeLingxingListings(
    [
      {
        store_id: 1702,
        seller_name: 'Brand-US',
        marketplace: 'US',
        asin: 'B0OPENMCP1',
        msku: 'SKU-01',
        fnsku: 'X001',
        item_name: 'OpenMCP Listing',
        price: '19.99',
        thirty_volume: 600,
        thirty_amount: 11994,
        afn_fulfillable_quantity: 500,
        afn_inbound_shipped_quantity: 50,
        afn_inbound_receiving_quantity: 20,
        afn_inbound_working_quantity: 10,
      },
    ],
    'tenant-1',
    shops,
    []
  );
  assert.equal(listings.length, 1);
  assert.equal(listings[0].fbaAvailable, 500);
  assert.equal(listings[0].fbaInbound, 80);
  assert.equal(listings[0].orders30d, 600);

  const orders = normalizeLingxingOrders(
    extractRecordsFromMcpResult({
      jsonrpc: '2.0',
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              data: {
                data: {
                  data: [
                    {
                      storeId: 1702,
                      amazonOrderId: '113-0000001-0000001',
                      orderStatus: 'Shipped',
                      orderTotalAmount: '29.98',
                      slist: [{ asin: 'B0OPENMCP1', sellerSku: 'SKU-01', quantityOrdered: 2 }],
                    },
                  ],
                },
              },
            }),
          },
        ],
      },
    }),
    'tenant-1',
    shops
  );
  assert.equal(orders.length, 1);
  assert.equal(orders[0].asin, 'B0OPENMCP1');
  assert.equal(orders[0].quantity, 2);

  const ads = normalizeLingxingAdCampaigns(
    [
      { campaign_id: null, name: null, cost: 9999, sales: 19999 },
      {
        campaign_id: 'camp-001',
        name: 'SP-Exact-Main',
        store_id: 1702,
        cost: 120.5,
        sales: 602.5,
        clicks: 240,
        impressions: 12000,
        orders: 25,
      },
    ],
    'tenant-1',
    shops
  );
  assert.equal(ads.length, 1);
  assert.equal(ads[0].campaignName, 'SP-Exact-Main');
  assert.equal(ads[0].spend30dUsd, 120.5);

  const settlements = normalizeLingxingSettlements(
    extractRecordsFromMcpResult({
      jsonrpc: '2.0',
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              data: {
                data: {
                  records: [
                    {
                      settlementId: '28121761261',
                      sid: 1702,
                      sellerName: 'Brand-US',
                      startDate: '2026-03-01',
                      endDate: '2026-03-15',
                      sale: { sale: 1000 },
                      pay: { amazon: -220, ad: -110 },
                      refund: { refund: -30 },
                      transfer: { currentReserveAmount: -40 },
                      originalTotalCurrencyAmount: 600,
                      reconciliationResult: 1,
                    },
                  ],
                },
              },
            }),
          },
        ],
      },
    }),
    'tenant-1',
    shops
  );
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].grossSalesUsd, 1000);
  assert.equal(settlements[0].netPayoutUsd, 600);
});

test('01-core-infra: Lingxing 12-domain supply-chain & search-term normalizers, demo cleanup, and scheduler API status', () => {
  assert.equal(LINGXING_OPENMCP_CORE_TOOLS.length, 12);

  const skus = normalizeLingxingLocalSkus(
    [
      {
        sku: 'YY101-S',
        product_name: '蝴蝶结*5-S',
        wh_name: '默认仓库',
        good_num: 191,
        pending_num: '10',
        transit_num: 5,
        purchase_price: '10.5000',
        default_spec_pack: {
          cg_package_length: '25.00',
          cg_package_width: '14.00',
          cg_package_height: '3.00',
          cg_product_gross_weight: '110.0000',
          cg_product_gross_weight_unit: 'g',
        },
      },
    ],
    'tenant-1'
  );
  assert.equal(skus.length, 1);
  assert.equal(skus[0].sku, 'YY101-S');
  assert.equal(skus[0].localAvailableQty, 191);
  assert.equal(skus[0].localInboundQty, 15);
  assert.equal(skus[0].purchaseCostCny, 10.5);
  assert.equal(skus[0].weightKg, 0.11);

  const suppliers = normalizeLingxingSuppliers(
    [{ supplier_id: 2906, supplier_code: 'SU00001', supplier_name: '明权', w_name: '默认仓库' }],
    'tenant-1'
  );
  assert.equal(suppliers.length, 1);
  assert.equal(suppliers[0].supplierName, '明权');

  const pos = normalizeLingxingPurchaseOrders(
    [
      {
        order_sn: 'PO261124001',
        supplier_name: '明权',
        quantity_total: 564,
        quantity_entry: 100,
        amount_total: '7143.00',
        status_text: '待到货',
        item_list: [{ sku: 'YY108-M', product_name: '795花边-M', price: '14.7125' }],
      },
    ],
    'tenant-1'
  );
  assert.equal(pos.length, 1);
  assert.equal(pos[0].poNumber, 'PO261124001');
  assert.equal(pos[0].localSkuCode, 'YY108-M');
  assert.equal(pos[0].status, 'IN_TRANSIT');

  const ledgers = normalizeLingxingWarehouseLedgers(
    [
      {
        batch_state_id: '2611240004-1',
        sku: 'YYW107-M',
        type_name: '采购质检',
        good_num: 186,
        balance_num: 186,
        purchase_order_sns: ['PO261118001'],
      },
    ],
    'tenant-1'
  );
  assert.equal(ledgers.length, 1);
  assert.equal(ledgers[0].qtyDelta, 186);

  const shipments = normalizeLingxingFbaShipments(
    [
      {
        id: 41739425,
        shipment_sn: 'SP261124001',
        wname: 'gwenvenni-US美国仓(AWD)',
        logistics_provider_name: 'AWD',
        quantity_shipped_total: 85,
        products: [
          {
            shipment_id: 'FBA19YB71LW9',
            sname: 'gwenvenni-US',
            sku: 'YYW108-M',
            fnsku: 'X003D6SGHN',
            destination_fulfillment_center_id: 'ORF2',
            shipment_status: 'IN_TRANSIT',
          },
        ],
      },
    ],
    'tenant-1',
    []
  );
  assert.equal(shipments.length, 1);
  assert.equal(shipments[0].shipmentId, 'FBA19YB71LW9');
  assert.equal(shipments[0].fnsku, 'X003D6SGHN');

  const terms = normalizeLingxingAdSearchTerms(
    [
      { profile_id: null, campaign_id: null, query: null, spends: '14821.40' },
      {
        st_md5: 'abc123',
        profile_id: '2459211571387223',
        campaign_id: '434482127812743',
        campaign_name: 'A-Bow-20251023',
        country: 'JP',
        query: '靴下 キッズ',
        impressions: 16675,
        clicks: 47,
        spends: '1316.00',
        sales: '4724.00',
        orders: 4,
      },
    ],
    'tenant-1'
  );
  assert.equal(terms.length, 1);
  assert.equal(terms[0].searchTerm, '靴下 キッズ');

  assert.equal(isDemoFixtureRecord({ id: 'sku-01', sku: 'XC-ITEM-001' }), true);
  assert.equal(isDemoFixtureRecord({ id: 'fba-01', shopName: 'Store-Alpha-US' }), true);
  assert.equal(isDemoFixtureRecord({ id: 'exp-01', targetAsin: 'B00DEMO001' }), true);
  assert.equal(isDemoFixtureRecord({ id: 'lx-sku-tenant-1-YY101-S', sku: 'YY101-S' }), false);

  const st = getLingxingSchedulerStatus();
  assert.equal(typeof st.running, 'boolean');
  assert.equal(typeof st.intervalMinutes, 'number');
});

test('01-core-infra: Lingxing 12th domain BOM processing orders, MX/BR marketplaces, and multi-currency enriched fields', () => {
  assert.equal(getCurrencyIcon('JPY'), 'JP¥');
  assert.equal(getCurrencyIcon('MXN'), 'Mex$');
  assert.equal(getCurrencyIcon('BRL'), 'R$');
  assert.equal(getCurrencyIcon('CAD'), 'CA$');
  assert.equal(getCurrencyIcon('USD'), '$');

  const mxBrShops = normalizeLingxingShops(
    [
      { sid: 3001, name: 'gwenvenni-MX', country: 'MX', seller_id: 'A1MXSHOP' },
      { sid: 3002, name: 'gwenvenni-BR', country: 'BR', seller_id: 'A1BRSHOP' },
      { sid: 3003, name: 'gwenvenni-JP', country: 'JP', seller_id: 'A1JPSHOP' },
    ],
    'tenant-1'
  );
  assert.equal(mxBrShops.length, 3);
  assert.equal(mxBrShops[0].marketplace, 'MX');
  assert.equal(mxBrShops[0].currency, 'MXN');
  assert.equal(mxBrShops[0].region, 'NA');
  assert.equal(mxBrShops[1].marketplace, 'BR');
  assert.equal(mxBrShops[1].currency, 'BRL');
  assert.equal(mxBrShops[1].region, 'SA');
  assert.equal(mxBrShops[2].marketplace, 'JP');
  assert.equal(mxBrShops[2].currency, 'JPY');

  const bomOrders = normalizeLingxingBomOrders(
    [
      {
        process_sn: 'PT261028001',
        type: 1,
        status: 2,
        ware_house_name: '默认仓库',
        create_realname: '运营A',
        remark: '万圣节礼盒组合',
        create_time: '2026-10-28 09:30:00',
        finish_time: '2026-10-28 16:00:00',
        product_list: [
          {
            sku: 'COMBO-BOW-01',
            product_name: '蝴蝶结礼盒套装',
            pic_url: 'https://img.example.com/bow.jpg',
            quantity: 200,
            sync_amount: '2400.50',
            item_list: [
              { sku: 'YY101-S', product_name: '蝴蝶结-S', quantity_process: 200 },
              { sku: 'BOX-01', product_name: '定制礼盒', quantity_process: 200 },
            ],
          },
        ],
      },
    ],
    'tenant-1'
  );
  assert.equal(bomOrders.length, 1);
  assert.equal(bomOrders[0].assemblyNo, 'PT261028001');
  assert.equal(bomOrders[0].processType, 'ASSEMBLE');
  assert.equal(bomOrders[0].status, 'COMPLETED');
  assert.equal(bomOrders[0].warehouseName, '默认仓库');
  assert.equal(bomOrders[0].components?.length, 2);
  assert.equal(bomOrders[0].totalCostCny, 2400.5);

  const enrichedListings = normalizeLingxingListings(
    [
      {
        store_id: 3003,
        seller_name: 'gwenvenni-JP',
        marketplace: 'JP',
        asin: 'B0JPENRICH',
        parent_asin: 'B0JPPARENT',
        msku: 'JP-SKU-01',
        local_sku: 'YY101-S',
        local_name: '蝴蝶结-S',
        item_name: 'JP Enriched Listing',
        small_image_url: 'https://img.example.com/jp.jpg',
        price: '1980',
        currency_code: 'JPY',
        stars: 4.7,
        reviews_num: 128,
        afn_fulfillable_quantity: 120,
        afn_unsellable_quantity: 3,
        variant_text: [{ attr_name: 'Size', attr_value: 'S' }],
      },
    ],
    'tenant-1',
    mxBrShops,
    []
  );
  assert.equal(enrichedListings.length, 1);
  assert.equal(enrichedListings[0].parentAsin, 'B0JPPARENT');
  assert.equal(enrichedListings[0].smallImageUrl, 'https://img.example.com/jp.jpg');
  assert.equal(enrichedListings[0].stars, 4.7);
  assert.equal(enrichedListings[0].reviewsNum, 128);
  assert.equal(enrichedListings[0].currencyIcon, 'JP¥');
  assert.equal(enrichedListings[0].variantAttrs?.length, 1);

  const enrichedOrders = normalizeLingxingOrders(
    [
      {
        storeId: 3003,
        amazonOrderId: '250-1234567-7654321',
        orderStatus: 'Shipped',
        orderTotalAmount: '3960',
        orderTotalCurrencyCode: 'JPY',
        isPrime: 1,
        isBusinessOrder: 1,
        slist: [
          {
            asin: 'B0JPENRICH',
            sellerSku: 'JP-SKU-01',
            title: 'JP Enriched Listing',
            quantityOrdered: 2,
          },
        ],
      },
    ],
    'tenant-1',
    mxBrShops
  );
  assert.equal(enrichedOrders.length, 1);
  assert.equal(enrichedOrders[0].isPrime, true);
  assert.equal(enrichedOrders[0].isBusinessOrder, true);
  assert.equal(enrichedOrders[0].currencyIcon, 'JP¥');
  assert.equal(enrichedOrders[0].items?.length, 1);

  const enrichedAds = normalizeLingxingAdCampaigns(
    [
      {
        campaign_id: 'camp-jp-01',
        name: 'JP-SP-Auto',
        store_id: 3003,
        country: 'JP',
        currency_code: 'JPY',
        cost: 12000,
        sales: 48000,
        clicks: 300,
        impressions: 15000,
        orders: 24,
        ctr: 2.0,
        surplus_budget: { tip: '预算充足', is_over_budget: false },
      },
    ],
    'tenant-1',
    mxBrShops
  );
  assert.equal(enrichedAds.length, 1);
  assert.equal(enrichedAds[0].currencyIcon, 'JP¥');
  assert.equal(enrichedAds[0].ctrPercent, 2.0);
  assert.equal(enrichedAds[0].surplusBudgetTip, '预算充足');

  const enrichedSettlements = normalizeLingxingSettlements(
    [
      {
        settlementId: '9988776655',
        sid: 3003,
        sellerName: 'gwenvenni-JP',
        currencyCode: 'JPY',
        processingStatus: 'Closed',
        accountTail: '8821',
        startDate: '2026-10-01',
        endDate: '2026-10-15',
        sale: { sale: 500000 },
        pay: { amazon: -90000, ad: -45000 },
        originalTotalCurrencyAmount: 365000,
        reconciliationResult: 1,
      },
    ],
    'tenant-1',
    mxBrShops
  );
  assert.equal(enrichedSettlements.length, 1);
  assert.equal(enrichedSettlements[0].currencyIcon, 'JP¥');
  assert.equal(enrichedSettlements[0].processingStatus, 'Closed');
  assert.equal(enrichedSettlements[0].accountTail, '8821');
});

test('01-core-infra: Lingxing multi-page pagination collects all pages beyond 100 ASINs and erpDatabaseService uses .range()', async () => {
  const listingTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'erp_listing')!;
  const orderTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'amazon_sales_order_list')!;

  // 1) OFFSET mode with server capping page size to 100 despite requesting 200
  const allListings = Array.from({ length: 245 }, (_, idx) => ({
    asin: `B0FULL${String(idx + 1).padStart(4, '0')}`,
    msku: `SKU-${idx + 1}`,
  }));
  const seenOffsets: number[] = [];
  const listingResult = await collectAllPaginatedRecords({
    tool: listingTool,
    baseArgs: { offset: 0, length: 200 },
    fetchPage: async (args) => {
      const offset = Number(args.offset ?? 0);
      seenOffsets.push(offset);
      return {
        ok: true,
        payload: {
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  data: { data: { total: 245, list: allListings.slice(offset, offset + 100) } },
                }),
              },
            ],
          },
        },
      };
    },
  });
  assert.deepEqual(seenOffsets, [0, 100, 200]);
  assert.equal(listingResult.records.length, 245);
  assert.equal(listingResult.upstreamTotal, 245);
  assert.equal(listingResult.truncatedByCap, false);

  // 2) PAGE mode (amazon_sales_order_list: pageNo / pageSize)
  const p2Args = buildPaginatedArgsForTool(orderTool, { pageNo: 1, pageSize: 200 }, 2, 100);
  assert.equal(p2Args.pageNo, 3);
  assert.equal(p2Args.pageSize, 100);

  const allOrders = Array.from({ length: 230 }, (_, idx) => ({
    amazonOrderId: `114-0000000-${String(idx + 1).padStart(7, '0')}`,
  }));
  const seenPages: number[] = [];
  const orderResult = await collectAllPaginatedRecords({
    tool: orderTool,
    baseArgs: { pageNo: 1, pageSize: 100 },
    fetchPage: async (args) => {
      const pageNo = Number(args.pageNo ?? 1);
      seenPages.push(pageNo);
      const start = (pageNo - 1) * 100;
      return {
        ok: true,
        payload: {
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  data: { data: { totalCount: 230, data: allOrders.slice(start, start + 100) } },
                }),
              },
            ],
          },
        },
      };
    },
  });
  assert.deepEqual(seenPages, [1, 2, 3]);
  assert.equal(orderResult.records.length, 230);
  assert.equal(orderResult.truncatedByCap, false);

  // 3) Duplicate-page safety termination when upstream ignores pagination
  const dupResult = await collectAllPaginatedRecords({
    tool: listingTool,
    baseArgs: { offset: 0, length: 100 },
    fetchPage: async () => ({
      ok: true,
      payload: {
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ data: { total: 500, list: allListings.slice(0, 100) } }),
            },
          ],
        },
      },
    }),
  });
  assert.equal(dupResult.pagesFetched, 2);
  assert.equal(dupResult.records.length, 100);

  // 4) extractTotalCountFromMcpResult nested extraction
  assert.equal(
    extractTotalCountFromMcpResult({
      result: { content: [{ type: 'text', text: JSON.stringify({ data: { data: { total: 312 } } }) }] },
    }),
    312
  );

  // 5) Supabase reader uses .range() loop instead of .limit(5000)
  const dbCode = fs.readFileSync('src/services/erpDatabaseService.ts', 'utf8');
  assert.match(dbCode, /\.range\s*\(/);
  assert.equal(/\.limit\s*\(\s*5000\s*\)/.test(dbCode), false);
});

test('01-core-infra: Lingxing yesterday sales reconciles distinct valid orderCount vs unitVolume, excludes Canceled, converts multi-currency to USD, and prunes stale lx-* rows', () => {
  // 1) Deterministic order ID independent of array index or Pending->Shipped ASIN arrival
  const firstBatch = normalizeLingxingOrders(
    [
      {
        amazonOrderId: '114-5555555-1000001',
        marketplace: 'US',
        orderStatus: 'Pending',
        orderTotalAmount: '45.00',
        orderTotalCurrencyCode: 'USD',
        purchaseDateLocal: '2026-11-25 09:15:00',
        purchaseDate: '2026-11-25T17:15:00Z',
      },
      {
        amazonOrderId: '114-5555555-1000002',
        marketplace: 'US',
        orderStatus: 'Canceled',
        orderTotalAmount: '80.00',
        orderTotalCurrencyCode: 'USD',
        purchaseDateLocal: '2026-11-25 12:30:00',
        purchaseDate: '2026-11-25T20:30:00Z',
        slist: [{ asin: 'B0CANCEL01', sellerSku: 'SKU-C1', quantityOrdered: 3 }],
      },
      {
        amazonOrderId: '114-5555555-1000003',
        marketplace: 'JP',
        orderStatus: 'Shipped',
        isReturn: 1,
        orderTotalAmount: '10000',
        orderTotalCurrencyCode: 'JPY',
        purchaseDateLocal: '2026-11-25 22:00:00',
        purchaseDate: '2026-11-25T13:00:00Z',
        slist: [{ asin: 'B0JP001', sellerSku: 'SKU-JP1', quantityOrdered: 2 }],
      },
    ],
    'tenant-sync',
    []
  );
  const secondBatch = normalizeLingxingOrders(
    [
      {
        amazonOrderId: '114-5555555-1000001',
        marketplace: 'US',
        orderStatus: 'Shipped',
        orderTotalAmount: '45.00',
        orderTotalCurrencyCode: 'USD',
        purchaseDateLocal: '2026-11-25 09:15:00',
        purchaseDate: '2026-11-25T17:15:00Z',
        slist: [{ asin: 'B0US001', sellerSku: 'SKU-US1', quantityOrdered: 3 }],
      },
    ],
    'tenant-sync',
    []
  );
  assert.equal(firstBatch[0].id, 'lx-ord-tenant-sync-114-5555555-1000001');
  assert.equal(secondBatch[0].id, firstBatch[0].id);
  assert.equal(firstBatch[1].orderStatus, 'CANCELED');
  assert.equal(firstBatch[2].orderStatus, 'REFUNDED'); // Shipped then returned remains valid placed order
  assert.equal(firstBatch[2].currency, 'JPY');

  // 2) calculateLingxingWindowSales separates valid orderCount (2) from unitVolume (5),
  // excludes Canceled (1), deduplicates stale duplicate order IDs, and converts JPY->USD
  const fixedNow = new Date('2026-11-26T08:30:00Z');
  const summary = calculateLingxingWindowSales({
    orders: [
      secondBatch[0], // US 2026-11-25, qty=3, $45
      firstBatch[1],  // US 2026-11-25, Canceled, qty=3 (excluded)
      firstBatch[2],  // JP 2026-11-25, Shipped+Returned, qty=2, JPY 10000 => $66
      { ...secondBatch[0], id: 'lx-ord-legacy-dup-id' }, // Stale duplicate row for same amazonOrderId
    ],
    listings: [],
    window: 'YESTERDAY',
    siteDateMode: 'PER_SITE',
    includeCanceled: false,
    nowDate: fixedNow,
  });
  assert.equal(summary.orderCount, 2);
  assert.equal(summary.unitVolume, 5);
  assert.equal(summary.canceledOrderCount, 1);
  assert.equal(summary.revenueUsd, Number((45 + convertAmountToUsd(10000, 'JPY', 'JP')).toFixed(2)));
  assert.equal(summary.unitsPerOrder, 2.5);
  assert.equal(summary.byShop.length, 2);

  // 3) mergeSyncedEntities prunes stale lx-* rows while preserving user-created local non-lx-* rows
  const merged = mergeSyncedEntities(
    [
      { id: 'lx-lst-t1-stale-old', tenantId: 't1' },
      { id: 'lx-lst-t1-active', tenantId: 't1' },
      { id: 'manual-local-row', tenantId: 't1' },
      { id: 'lx-lst-t2-other-tenant', tenantId: 't2' },
    ],
    [{ id: 'lx-lst-t1-active', tenantId: 't1' }],
    't1',
    false,
    true
  );
  assert.deepEqual(
    merged.map((m) => m.id).sort(),
    ['lx-lst-t1-active', 'lx-lst-t2-other-tenant', 'manual-local-row']
  );

  // 4) amazon_sales_order_list endDate uses UTC+1 day so JP/AU/CN today orders are never clipped
  const orderTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'amazon_sales_order_list')!;
  const orderArgs = buildDefaultArgsForTool(orderTool);
  const utcToday = new Date().toISOString().slice(0, 10);
  assert.equal(String(orderArgs.endDate) > utcToday, true);
});

test('01-core-infra: batch_inventory_statement_list paginates past 30 pages with zero shared-SKU collapse and amazon_sales_order_list supports 90/180/365-day chunked sync with historical order protection', async () => {
  // 1) High-volume warehouse ledgers (>30 pages, 3,200 rows sharing the same msku/sku/order_sn/wh_id)
  const whTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'batch_inventory_statement_list')!;
  const totalLedgers = 3200;
  const allLedgers = Array.from({ length: totalLedgers }, (_, idx) => ({
    batch_state_id: 500000 + idx,
    batch_no: 'BN-SHARED-001',
    order_sn: 'SN-SHARED-001',
    msku: 'MSKU-COLLIDE-TEST',
    sku: 'SKU-COLLIDE-TEST',
    wh_id: 88,
    wh_name: 'US-FBA-MAIN',
    type: idx % 2 === 0 ? 1 : 2,
    type_name: idx % 2 === 0 ? '采购入库' : '销售出库',
    batch_time: `2026-11-${String((idx % 25) + 1).padStart(2, '0')} ${String(idx % 24).padStart(2, '0')}:${String(idx % 60).padStart(2, '0')}:00`,
    num: idx % 2 === 0 ? 10 : -3,
    balance_num: 10000 + idx,
  }));

  // Signatures for distinct movements of the same SKU & warehouse must never collide
  assert.notEqual(
    recordSignature(allLedgers[0], 'WAREHOUSE_LEDGERS'),
    recordSignature(allLedgers[1], 'WAREHOUSE_LEDGERS')
  );

  const whPaged = await collectAllPaginatedRecords({
    tool: whTool,
    baseArgs: { offset: 0, length: 200 },
    fetchPage: async (args) => {
      const off = Number(args.offset ?? 0);
      // Simulate Lingxing capping page size at 100 rows => requires 32 pages (> old 30-page limit)
      const slice = allLedgers.slice(off, off + 100);
      return {
        ok: true,
        payload: {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ data: { total: totalLedgers, list: slice } }),
              },
            ],
          },
        },
      };
    },
  });
  assert.equal(whPaged.pagesFetched, 32);
  assert.equal(whPaged.records.length, totalLedgers);
  assert.equal(whPaged.truncatedByCap, false);

  const normalizedLedgers = normalizeLingxingWarehouseLedgers(whPaged.records, 'tenant-wh-full');
  assert.equal(normalizedLedgers.length, totalLedgers);
  assert.equal(new Set(normalizedLedgers.map((l) => l.id)).size, totalLedgers);

  // 2) Longer order sync defaults & date-window chunking for 90 / 180 / 365 days
  assert.equal(DEFAULT_ORDER_SYNC_DAYS, 90);
  assert.deepEqual([...ORDER_SYNC_DAY_OPTIONS], [31, 90, 180, 365]);

  const fixedNow = new Date('2026-11-26T08:00:00Z');
  for (const days of [90, 180, 365]) {
    const chunks = buildDateWindowChunks({
      totalDays: days,
      chunkDays: 30,
      includeTomorrow: true,
      nowDate: fixedNow,
    });
    assert.ok(chunks.length >= Math.ceil(days / 30), `Expected >= ${Math.ceil(days / 30)} chunks for ${days} days`);
    // Chunks must be ordered newest-first with no date gaps between consecutive chunks
    assert.equal(chunks[0].endDate, '2026-11-27');
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentStartMs = Date.parse(`${chunks[i].startDate}T00:00:00Z`);
      const nextEndMs = Date.parse(`${chunks[i + 1].endDate}T00:00:00Z`);
      assert.equal(currentStartMs - nextEndMs, 86_400_000);
    }
  }

  // 3) collectChunkedDateRangeRecords merges across chunks and deduplicates overlapping amazonOrderId
  const orderTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'amazon_sales_order_list')!;
  const seenRanges: string[] = [];
  const chunked = await collectChunkedDateRangeRecords({
    tool: orderTool,
    baseArgs: { offset: 0, length: 200 },
    totalDays: 180,
    chunkDays: 30,
    includeTomorrow: true,
    nowDate: fixedNow,
    fetchPage: async (args) => {
      const s = String(args.startDate || '');
      const e = String(args.endDate || '');
      const pageNo = Number(args.pageNo ?? 1);
      if (pageNo === 1) seenRanges.push(`${s}..${e}`);
      const rows =
        pageNo === 1
          ? [
              { amazonOrderId: `114-${s}-A`, purchaseDateLocal: `${s} 09:00:00` },
              { amazonOrderId: `114-${s}-B`, purchaseDateLocal: `${e} 10:00:00` },
              { amazonOrderId: '114-SHARED-BOUNDARY', purchaseDateLocal: `${s} 12:00:00` },
            ]
          : [];
      return {
        ok: true,
        payload: {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: JSON.stringify({ data: { total: rows.length, list: rows } }) }],
          },
        },
      };
    },
  });
  assert.equal(chunked.totalChunks, seenRanges.length);
  assert.ok(chunked.totalChunks >= 6);
  // 2 unique orders per chunk + 1 deduplicated boundary order
  assert.equal(chunked.records.length, chunked.totalChunks * 2 + 1);
  assert.ok(chunked.windowStartDate < '2026-06-15');
  assert.equal(chunked.windowEndDate, '2026-11-27');

  // 4) Narrower order sync preserves older historical lx-* orders outside orderWindowStartDate
  const preserved = mergeSyncedEntities(
    [
      { id: 'lx-ord-t1-2026-03-01', tenantId: 't1', purchaseDate: '2026-03-01' },
      { id: 'lx-ord-t1-stale-2026-11-12', tenantId: 't1', purchaseDate: '2026-11-12' },
      { id: 'lx-ord-t1-fresh-2026-11-25', tenantId: 't1', purchaseDate: '2026-11-25' },
      { id: 'manual-order-1', tenantId: 't1', purchaseDate: '2026-11-12' },
    ],
    [{ id: 'lx-ord-t1-fresh-2026-11-25', tenantId: 't1', purchaseDate: '2026-11-25' }],
    't1',
    false,
    true,
    (item) => String(item.purchaseDate || '').slice(0, 10) >= '2026-10-27'
  );
  assert.deepEqual(
    preserved.map((p) => p.id).sort(),
    ['lx-ord-t1-2026-03-01', 'lx-ord-t1-fresh-2026-11-25', 'manual-order-1']
  );

  // 5) Scheduler status exposes configurable orderSyncDays (default 90)
  const schedStatus = getLingxingSchedulerStatus();
  assert.equal(typeof schedStatus.orderSyncDays, 'number');
  assert.ok(schedStatus.orderSyncDays >= 30);
});

test('01-core-infra: browser localStorage DB config storage is disabled, legacy key is purged, and /api/platform/db-config is guarded', () => {
  const clientCode = fs.readFileSync('src/services/supabaseClient.ts', 'utf8');
  assert.equal(/localStorage\.(getItem|setItem)\s*\(/.test(clientCode), false);
  assert.match(clientCode, /removeItem\s*\(\s*LEGACY_STORAGE_KEY\s*\)/);
  assert.match(clientCode, /fetchServerSupabaseConfig/);
  assert.match(clientCode, /saveServerSupabaseConfig/);

  const serverCode = fs.readFileSync('server.ts', 'utf8');
  const getIdx = serverCode.indexOf("app.get('/api/platform/db-config'");
  const postIdx = serverCode.indexOf("app.post('/api/platform/db-config'");
  assert.ok(getIdx >= 0 && postIdx > getIdx, 'Expected GET and POST /api/platform/db-config routes');
  const dbConfigSection = serverCode.slice(getIdx, postIdx + 3200);
  assert.match(dbConfigSection, /PLATFORM_SUPER_ADMIN/);
  assert.match(dbConfigSection, /validateSafeExternalMcpUrl/);
  assert.equal(/SUPABASE_SERVICE_ROLE_KEY/.test(dbConfigSection), false);

  // Runtime spy check: zero localStorage.getItem / setItem and automatic removeItem on legacy key
  const origDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let getCount = 0;
  let setCount = 0;
  const removed: string[] = [];
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          getCount += 1;
          return null;
        },
        setItem: () => {
          setCount += 1;
        },
        removeItem: (key: string) => {
          removed.push(String(key));
        },
      },
    });
    clearLegacyBrowserSupabaseConfig();
    saveSupabaseConfig({
      projectUrl: 'https://test-no-localstorage.supabase.co/rest/v1/',
      anonKey: 'sb_publishable_test_runtime_only',
      authMode: 'SUPABASE_AUTH',
      configSource: 'SERVER_MEMORY',
    });
    const active = loadSupabaseConfig();
    assert.equal(getCount, 0);
    assert.equal(setCount, 0);
    assert.ok(removed.includes('xcloud_erp_supabase_config_v1'));
    assert.equal(active.projectUrl, 'https://test-no-localstorage.supabase.co');
    assert.equal(active.anonKey, 'sb_publishable_test_runtime_only');
    assert.equal(active.configSource, 'SERVER_MEMORY');
  } finally {
    saveSupabaseConfig({
      projectUrl: '',
      anonKey: '',
      authMode: 'SUPABASE_AUTH',
      configSource: 'UNCONFIGURED',
    });
    if (origDesc) {
      Object.defineProperty(globalThis, 'localStorage', origDesc);
    } else {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  }
});

test('01-core-infra: hybrid Lingxing incremental sync supports native update_time tools, order lookback + historical PENDING batch refresh, first-sync FULL fallback, and scheduler syncMode', async () => {
  assert.equal(DEFAULT_ORDER_INCREMENTAL_LOOKBACK_DAYS, 7);
  assert.deepEqual([...NATIVE_UPDATE_TIME_TOOL_IDS], [
    'batch_inventory_statement_list',
    'get_delivery_order_list',
    'warehouse_processing_order_list',
  ]);

  const fixedNow = new Date('2026-11-26T08:00:00Z');
  const whTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'batch_inventory_statement_list')!;
  const fbaTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'get_delivery_order_list')!;
  const bomTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'warehouse_processing_order_list')!;
  const orderTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'amazon_sales_order_list')!;

  // 1) Empty local table or missing watermark automatically upgrades to FULL_SNAPSHOT backfill
  const emptyWhPlan = resolveIncrementalSyncPlan({
    tool: whTool,
    syncMode: 'INCREMENTAL',
    domainWatermark: { lastSyncedAt: '2026-11-24 12:00:00', mode: 'FULL', strategy: 'FULL_SNAPSHOT' },
    existingDomainCount: 0,
    nowDate: fixedNow,
  });
  assert.equal(emptyWhPlan.mode, 'FULL');
  assert.equal(emptyWhPlan.strategy, 'FULL_SNAPSHOT');
  assert.equal(emptyWhPlan.preserveExistingOutsideDelta, false);

  const noWatermarkOrderPlan = resolveIncrementalSyncPlan({
    tool: orderTool,
    syncMode: 'INCREMENTAL',
    fullOrderSyncDays: 180,
    domainWatermark: null,
    existingDomainCount: 500,
    nowDate: fixedNow,
  });
  assert.equal(noWatermarkOrderPlan.mode, 'FULL');
  assert.equal(noWatermarkOrderPlan.strategy, 'FULL_SNAPSHOT');
  assert.equal(noWatermarkOrderPlan.effectiveTotalDays, 180);

  // 2) Three verified native update_time tools inject exact OpenMCP parameters and preserve historical rows
  const whIncPlan = resolveIncrementalSyncPlan({
    tool: whTool,
    syncMode: 'INCREMENTAL',
    domainWatermark: { lastSyncedAt: '2026-11-24 09:00:00', mode: 'FULL', strategy: 'FULL_SNAPSHOT' },
    existingDomainCount: 6155,
    nowDate: fixedNow,
  });
  assert.equal(whIncPlan.strategy, 'UPDATE_TIME_INCREMENTAL');
  assert.equal(whIncPlan.preserveExistingOutsideDelta, true);
  assert.deepEqual(whIncPlan.argsPatch, {
    time_filter_field: 'update_time',
    start_date: '2026-11-23',
    end_date: '2026-11-27',
  });

  const fbaIncPlan = resolveIncrementalSyncPlan({
    tool: fbaTool,
    syncMode: 'INCREMENTAL',
    domainWatermark: { lastSyncedAt: '2026-11-24 09:00:00', mode: 'FULL', strategy: 'FULL_SNAPSHOT' },
    existingDomainCount: 42,
    nowDate: fixedNow,
  });
  assert.equal(fbaIncPlan.strategy, 'UPDATE_TIME_INCREMENTAL');
  assert.equal(fbaIncPlan.preserveExistingOutsideDelta, true);
  assert.deepEqual(fbaIncPlan.argsPatch, {
    time_type: '3',
    start_date: '2026-11-23',
    end_date: '2026-11-27',
    sort_field: 'update_time',
    sort_type: 'desc',
  });

  const bomIncPlan = resolveIncrementalSyncPlan({
    tool: bomTool,
    syncMode: 'INCREMENTAL',
    domainWatermark: { lastSyncedAt: '2026-11-24 09:00:00', mode: 'FULL', strategy: 'FULL_SNAPSHOT' },
    existingDomainCount: 18,
    nowDate: fixedNow,
  });
  assert.equal(bomIncPlan.strategy, 'UPDATE_TIME_INCREMENTAL');
  assert.equal(bomIncPlan.preserveExistingOutsideDelta, true);
  assert.deepEqual(bomIncPlan.argsPatch, {
    search_field_time: 'update_time',
    start_date: '2026-11-23',
    end_date: '2026-11-27',
  });

  // 3) Amazon orders incremental lookback shrinks 90d window to daysSinceWatermark + lookbackDays
  //    and targets only older Amazon PENDING orders (excluding SHIPPED, MCF-*, and orders already inside window)
  const orderIncPlan = resolveIncrementalSyncPlan({
    tool: orderTool,
    syncMode: 'INCREMENTAL',
    fullOrderSyncDays: 90,
    orderLookbackDays: 7,
    domainWatermark: { lastSyncedAt: '2026-11-24 09:00:00', mode: 'FULL', strategy: 'FULL_SNAPSHOT' },
    existingDomainCount: 3086,
    existingTenantOrders: [
      { amazonOrderId: '114-1000001-0000001', orderStatus: 'PENDING', purchaseDate: '2026-10-15 12:00:00' },
      { amazonOrderId: '114-1000002-0000002', orderStatus: 'PENDING', purchaseDate: '2026-11-01 08:00:00' },
      { amazonOrderId: '114-1000003-0000003', orderStatus: 'SHIPPED', purchaseDate: '2026-10-15 12:00:00' },
      { amazonOrderId: 'MCF-1000004-0000004', orderStatus: 'PENDING', purchaseDate: '2026-10-15 12:00:00' },
      { amazonOrderId: '114-1000005-0000005', orderStatus: 'PENDING', purchaseDate: '2026-11-23 12:00:00' },
    ],
    nowDate: fixedNow,
  });
  assert.equal(orderIncPlan.strategy, 'LOOKBACK_WINDOW_INCREMENTAL');
  assert.equal(orderIncPlan.effectiveTotalDays, 9); // 2 days since watermark + 7 lookback days
  assert.equal(orderIncPlan.effectiveStartDate, '2026-11-17');
  assert.equal(orderIncPlan.effectiveEndDate, '2026-11-27');
  assert.deepEqual(
    orderIncPlan.pendingOrdersToRefresh.map((p) => p.amazonOrderId),
    ['114-1000001-0000001', '114-1000002-0000002']
  );

  // 4) Batch exact-match PENDING order re-check uses verified searchField + exactSearch=1
  const sentQueries: Record<string, unknown>[] = [];
  const refreshResult = await collectPendingOrderRefreshRecords({
    tool: orderTool,
    baseArgs: { pageNo: 1, pageSize: 200, isMcfOrder: '0' },
    pendingOrders: orderIncPlan.pendingOrdersToRefresh,
    batchSize: 50,
    nowDate: fixedNow,
    fetchPage: async (args) => {
      sentQueries.push(args);
      return {
        ok: true,
        payload: {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  data: {
                    data: {
                      data: [
                        { amazonOrderId: '114-1000001-0000001', orderStatus: 'Shipped', purchaseDateLocal: '2026-10-15 12:00:00' },
                        { amazonOrderId: '114-1000002-0000002', orderStatus: 'Canceled', purchaseDateLocal: '2026-11-01 08:00:00' },
                      ],
                    },
                  },
                }),
              },
            ],
          },
        },
      };
    },
  });
  assert.equal(sentQueries.length, 1);
  assert.equal(sentQueries[0].searchField, 'amazonOrderId');
  assert.equal(sentQueries[0].exactSearch, 1);
  assert.equal(sentQueries[0].searchValue, '114-1000001-0000001,114-1000002-0000002');
  assert.equal(sentQueries[0].startDate, '2026-10-13'); // earliest pending purchaseDate - 2d buffer
  assert.equal(sentQueries[0].endDate, '2026-11-27');
  assert.equal(refreshResult.pagesFetched, 1);
  assert.equal(refreshResult.records.length, 2);

  // 5) Scheduler defaults to INCREMENTAL syncMode
  const schedStatus = getLingxingSchedulerStatus();
  assert.equal(schedStatus.syncMode, 'INCREMENTAL');
  assert.equal(schedStatus.orderLookbackDays, 7);
});

test('01-core-infra: silent bootstrap, per-page on-demand loading boundaries, and server-side paginated query engine (INFRA-ADV-14)', () => {
  // 1) Bootstrap contains only lightweight shell/auth metadata — zero heavy operational tables
  for (const heavy of ['orders', 'listings', 'warehouseLedgers', 'searchTerms'] as const) {
    assert.equal(BOOTSTRAP_ENTITY_TYPES.includes(heavy), false);
  }
  assert.equal(BOOTSTRAP_ENTITY_TYPES.includes('tenants'), true);
  assert.equal(BOOTSTRAP_ENTITY_TYPES.includes('shops'), true);

  // 2) Heavy paginated tables are excluded from bulk page-data dumps on their list pages
  assert.equal(PAGE_ENTITY_REQUIREMENTS.amazon.includes('orders'), false);
  assert.equal(PAGE_ENTITY_REQUIREMENTS.warehouse.includes('warehouseLedgers'), false);
  assert.equal(PAGE_ENTITY_REQUIREMENTS.ads.includes('searchTerms'), false);
  assert.equal(ALLOWED_QUERY_ENTITIES.has('orders'), true);
  assert.equal(ALLOWED_QUERY_ENTITIES.has('warehouseLedgers'), true);
  assert.equal(ALLOWED_QUERY_ENTITIES.has('searchTerms'), true);

  // 3) executePagedEntityQuery on orders: tenant isolation, shop-scope isolation, canceled exclusion, search, summary & page 2 slicing
  const sampleOrders = Array.from({ length: 12 }, (_, idx) => ({
    id: `ord-${idx + 1}`,
    tenantId: idx === 11 ? 'tenant-other' : 'tenant-a',
    shopId: idx === 10 ? 'shop-hidden' : 'shop-allowed',
    shopName: idx === 10 ? 'Hidden-US' : 'Main-US',
    marketplace: 'US',
    amazonOrderId: `114-0000000-${String(idx + 1).padStart(7, '0')}`,
    asin: idx % 2 === 0 ? 'B0ALPHA001' : 'B0BETA0002',
    msku: `SKU-${idx + 1}`,
    purchaseDate: `2026-11-${String(25 - idx).padStart(2, '0')} 10:00:00`,
    fulfillmentChannel: idx === 9 ? 'MCF' : 'FBA',
    orderStatus: idx === 8 ? 'CANCELED' : 'SHIPPED',
    quantity: 2,
    orderAmountUsd: 25,
    currency: 'USD',
  }));
  // Valid rows for tenant-a & shop-allowed with excludeCanceled=true: indices 0..7 + 9 = 9 rows (index 8 is CANCELED, 10 is shop-hidden, 11 is tenant-other)
  const page2 = executePagedEntityQuery<{ amazonOrderId: string }>(sampleOrders, {
    entityType: 'orders',
    tenantId: 'tenant-a',
    roleCode: 'OPS_STAFF',
    allowedShopIds: ['shop-allowed'],
    page: 2,
    pageSize: 5,
    filters: { excludeCanceled: true, excludeReplacement: true },
  });
  assert.equal(page2.totalItems, 9);
  assert.equal(page2.totalPages, 2);
  assert.equal(page2.page, 2);
  assert.equal(page2.items.length, 4);
  assert.equal(page2.summary?.totalUnits, 18);
  assert.equal(page2.summary?.revenueUsd, 225);
  assert.equal(page2.summary?.excludedCanceledCount, 1);

  // Search + channel filter on orders
  const mcfOnly = executePagedEntityQuery<{ amazonOrderId: string }>(sampleOrders, {
    entityType: 'orders',
    tenantId: 'tenant-a',
    roleCode: 'TENANT_ADMIN',
    page: 1,
    pageSize: 20,
    filters: { channel: 'MCF', excludeCanceled: true },
  });
  assert.equal(mcfOnly.totalItems, 1);
  assert.equal(mcfOnly.items[0].amazonOrderId, '114-0000000-0000010');

  // 4) executePagedEntityQuery on warehouseLedgers & searchTerms
  const sampleLedgers = Array.from({ length: 8 }, (_, idx) => ({
    id: `led-${idx + 1}`,
    tenantId: 'tenant-a',
    localSkuCode: idx < 6 ? 'SKU-A' : 'SKU-B',
    warehouseName: '深圳总仓',
    referenceDoc: `DOC-${idx + 1}`,
    createdAt: `2026-11-${String(20 - idx).padStart(2, '0')} 08:00:00`,
  }));
  const ledgerPage = executePagedEntityQuery<{ id: string }>(sampleLedgers, {
    entityType: 'warehouseLedgers',
    tenantId: 'tenant-a',
    page: 2,
    pageSize: 5,
    search: 'SKU-A',
  });
  assert.equal(ledgerPage.totalItems, 6);
  assert.equal(ledgerPage.items.length, 1);

  const sampleTerms = [
    { id: 'st-1', tenantId: 'tenant-a', searchTerm: 'wireless charger', campaignName: 'SP-Main', spendUsd: 40 },
    { id: 'st-2', tenantId: 'tenant-a', searchTerm: 'usb cable', campaignName: 'SP-Main', spendUsd: 12 },
    { id: 'st-3', tenantId: 'tenant-b', searchTerm: 'wireless charger', campaignName: 'Other', spendUsd: 99 },
  ];
  const termsPage = executePagedEntityQuery<{ id: string }>(sampleTerms, {
    entityType: 'searchTerms',
    tenantId: 'tenant-a',
    page: 1,
    pageSize: 20,
    search: 'wireless',
  });
  assert.equal(termsPage.totalItems, 1);
  assert.equal(termsPage.items[0].id, 'st-1');

  // 5) App.tsx removes startup blocking loading text and wires backend on-demand + paginated APIs
  const appCode = fs.readFileSync('src/App.tsx', 'utf8');
  assert.equal(/正在从 Supabase 实时数据库加载租户与 ERP 数据/.test(appCode), false);
  assert.match(appCode, /fetchErpBootstrap/);
  assert.match(appCode, /fetchErpPageData/);
  assert.match(appCode, /backendQueryContext=\{backendQueryContext\}/);
});

test('01-core-infra: Cloudflare Workers full-stack adapter (wrangler.toml + worker.ts) unlocks env variables, enforces API guards, and delegates SPA assets (INFRA-ADV-15)', async () => {
  const wrangler = fs.readFileSync('wrangler.toml', 'utf8');
  assert.match(wrangler, /name\s*=\s*"xclouderp"/);
  assert.match(wrangler, /main\s*=\s*"worker\.ts"/);
  assert.match(wrangler, /\[assets\]/);
  assert.match(wrangler, /directory\s*=\s*"\.\/dist"/);
  assert.match(wrangler, /binding\s*=\s*"ASSETS"/);
  assert.match(wrangler, /run_worker_first\s*=\s*\["\/api\/\*"\]/);

  resetWorkerRuntimeDbConfigForTest();
  try {
    let forwardedAssetPath = '';
    const env = {
      SUPABASE_URL: 'https://prod-cf.supabase.co/rest/v1/',
      SUPABASE_ANON_KEY: 'sb_publishable_cf_prod_key',
      SUPABASE_SERVICE_ROLE_KEY: 'super_secret_service_role_never_expose',
      ASSETS: {
        fetch: async (input: Request | string) => {
          const urlStr = typeof input === 'string' ? input : input.url;
          forwardedAssetPath = new URL(urlStr).pathname;
          return new Response('<!doctype html><title>X Cloud ERP</title>', { status: 200 });
        },
      },
    };

    // 1) Health check & env-backed db-config without exposing service role key
    const healthRes = await handleWorkerRequest(new Request('https://xclouderp.workers.dev/api/health'), env);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { ok: boolean; runtime: string; configSource: string };
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.runtime, 'cloudflare-workers');
    assert.equal(healthJson.configSource, 'ENV');

    const dbCfgRes = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/platform/db-config'),
      env
    );
    const dbCfgText = await dbCfgRes.text();
    assert.equal(dbCfgRes.status, 200);
    assert.equal(dbCfgText.includes('super_secret_service_role_never_expose'), false);
    const dbCfgJson = JSON.parse(dbCfgText) as { config: { projectUrl: string; anonKey: string }; configSource: string };
    assert.equal(dbCfgJson.configSource, 'ENV');
    assert.equal(dbCfgJson.config.projectUrl, 'https://prod-cf.supabase.co');
    assert.equal(dbCfgJson.config.anonKey, 'sb_publishable_cf_prod_key');

    // 2) Non-super-admin POST /api/platform/db-config blocked with 403
    const nonAdminRes = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/platform/db-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalMode: 'TENANT_WORKSPACE', projectUrl: 'https://evil.supabase.co', anonKey: 'k' }),
      }),
      env
    );
    assert.equal(nonAdminRes.status, 403);

    // 3) Lingxing proxy enforces 402 subscription guard and blocks private/loopback SSRF URLs
    const expiredRes = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/lingxing/mcp-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantStatus: 'EXPIRED_READONLY',
          mcpEndpointUrl: 'https://openmcp.lingxing.com/mcp',
          mcpApiKey: 'demo',
        }),
      }),
      env
    );
    assert.equal(expiredRes.status, 402);

    const ssrfRes = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/lingxing/mcp-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantStatus: 'ACTIVE',
          mcpEndpointUrl: 'https://169.254.169.254/latest/meta-data',
          mcpApiKey: 'demo',
        }),
      }),
      env
    );
    assert.equal(ssrfRes.status, 400);

    // 4) /api/mcp guards & /api/erp/* allowlists + unknown /api/* 404
    const unauthMcpRes = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'tools/list' }),
      }),
      env
    );
    assert.equal(unauthMcpRes.status, 401);

    const badQueryRes = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/erp/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: '__forbidden__' }),
      }),
      env
    );
    assert.equal(badQueryRes.status, 400);

    const notFoundApiRes = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/does-not-exist'),
      env
    );
    assert.equal(notFoundApiRes.status, 404);

    // 5) Non-API routes delegate to Cloudflare ASSETS binding
    const spaRes = await handleWorkerRequest(new Request('https://xclouderp.workers.dev/amazon'), env);
    assert.equal(spaRes.status, 200);
    assert.equal(forwardedAssetPath, '/amazon');
  } finally {
    resetWorkerRuntimeDbConfigForTest();
  }
});









