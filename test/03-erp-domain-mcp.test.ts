import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMcpAccess,
  calculateAsinProfit,
  calculateFbaVolumetricCharge,
  calculateLingxingReplenishment,
  calculateThreeBasisProfit,
  calculatePricingProfitTrial,
  convertAmountToUsd,
  getUsdToCnyRateFromExchangeRates,
  getTargetDateRangeForMarketplace,
  calculateLingxingWindowSales,
  calculateLingxingAdSummary,
  calculateLingxingSettlementSummary,
} from '../src/lib/erpEngine';
import {
  normalizeLingxingExchangeRates,
  normalizeLingxingProfitSummary,
} from '../src/services/lingxingMcpSync';
import { INITIAL_LISTINGS, INITIAL_LOCAL_SKUS } from '../src/data/initialErpData';

test('03-erp-domain-mcp: evaluateMcpAccess enforces 402/429/403 funnel order', () => {
  const suspended = evaluateMcpAccess({
    tenantStatus: 'SUSPENDED',
    permissionScope: 'READ_WRITE',
    quotaRemaining: 100,
    toolName: 'get_asin_profit_breakdown',
  });
  assert.equal(suspended.allowed, false);
  assert.equal(suspended.httpStatus, 402);

  const expiredRead = evaluateMcpAccess({
    tenantStatus: 'EXPIRED_READONLY',
    permissionScope: 'READ_ONLY',
    quotaRemaining: 100,
    toolName: 'get_asin_profit_breakdown',
  });
  assert.equal(expiredRead.allowed, true);

  const expiredWrite = evaluateMcpAccess({
    tenantStatus: 'EXPIRED_READONLY',
    permissionScope: 'READ_WRITE',
    quotaRemaining: 100,
    toolName: 'sync_from_lingxing_mcp',
  });
  assert.equal(expiredWrite.allowed, false);
  assert.equal(expiredWrite.httpStatus, 402);

  const quotaOut = evaluateMcpAccess({
    tenantStatus: 'ACTIVE',
    permissionScope: 'READ_WRITE',
    quotaRemaining: 0,
    toolName: 'get_asin_profit_breakdown',
  });
  assert.equal(quotaOut.allowed, false);
  assert.equal(quotaOut.httpStatus, 429);

  const readOnlyWrite = evaluateMcpAccess({
    tenantStatus: 'ACTIVE',
    permissionScope: 'READ_ONLY',
    quotaRemaining: 50,
    toolName: 'create_draft_purchase_order',
  });
  assert.equal(readOnlyWrite.allowed, false);
  assert.equal(readOnlyWrite.httpStatus, 403);
});

test('03-erp-domain-mcp: calculateAsinProfit safely handles zero revenue, zero FX rate, and extra expenses', () => {
  const base = INITIAL_LISTINGS[0];
  const sku = INITIAL_LOCAL_SKUS.find((s) => s.sku === base.localSkuCode);
  const normal = calculateAsinProfit(base, sku, 7.24, 100);
  const withoutExtra = calculateAsinProfit(base, sku, 7.24, 0);
  assert.equal(Math.round(withoutExtra.netProfitUsd - normal.netProfitUsd), 100);

  const zeroEdge = calculateAsinProfit(
    { ...base, revenue30dUsd: 0, adSales30dUsd: 0, dailySales7d: 0, orders30d: 0 },
    sku,
    0,
    0
  );
  assert.equal(Number.isFinite(zeroEdge.netMarginPercent), true);
  assert.equal(zeroEdge.netMarginPercent, 0);
  assert.equal(zeroEdge.acosPercent, 0);
  assert.equal(zeroEdge.coverDays, 999);
});

test('03-erp-domain-mcp: calculateFbaVolumetricCharge picks max(volumetric, gross) and guards zero units', () => {
  const volHeavy = calculateFbaVolumetricCharge({
    lengthCm: 60,
    widthCm: 40,
    heightCm: 50,
    grossWeightKg: 12,
    boxCount: 10,
    unitsPerBox: 20,
    freightRatePerKgCny: 15,
  });
  // 60*40*50 / 6000 = 20kg > 12kg
  assert.equal(volHeavy.singleBoxVolumetricKg, 20);
  assert.equal(volHeavy.singleBoxChargeableKg, 20);
  assert.equal(volHeavy.isVolumetricApplied, true);
  assert.equal(volHeavy.totalFreightCny, 3000);
  assert.equal(volHeavy.unitFreightCny, 15);

  const zeroBoxes = calculateFbaVolumetricCharge({
    lengthCm: -10,
    widthCm: 20,
    heightCm: 20,
    grossWeightKg: 5,
    boxCount: 0,
    unitsPerBox: 0,
    freightRatePerKgCny: 10,
  });
  assert.equal(zeroBoxes.unitFreightCny, 0);
  assert.equal(Number.isFinite(zeroBoxes.unitFreightCny), true);
});

test('03-erp-domain-mcp: calculateLingxingReplenishment classifies 3-state status, splits 4 channels, and guards zero sales', () => {
  const stockout = calculateLingxingReplenishment({
    dailySales7d: 20,
    dailySales30d: 15,
    fbaAvailable: 40,
    fbaInbound: 0,
    localAvailable: 800,
    purchaseLeadDays: 10,
    safetyDays: 25,
    referenceDateIso: '2026-11-25T00:00:00Z',
  });
  assert.equal(stockout.status, 'STOCKOUT_CERTAIN');
  assert.ok(stockout.coverDays < 7);
  assert.ok(stockout.suggestedShipQty > 0);
  assert.equal(stockout.channelSplits.length, 4);
  const splitSum = stockout.channelSplits.reduce((s, c) => s + c.qty, 0);
  assert.ok(splitSum >= stockout.suggestedShipQty);

  const urgent = calculateLingxingReplenishment({
    dailySales7d: 10,
    dailySales30d: 10,
    fbaAvailable: 150,
    fbaInbound: 0,
    localAvailable: 400,
    purchaseLeadDays: 10,
    safetyDays: 25,
  });
  assert.equal(urgent.status, 'URGENT');

  const zeroSales = calculateLingxingReplenishment({
    dailySales7d: 0,
    dailySales30d: 0,
    fbaAvailable: 0,
    fbaInbound: 0,
    localAvailable: 50,
    purchaseLeadDays: 10,
    safetyDays: 25,
  });
  assert.equal(zeroSales.coverDays, 999);
  assert.equal(zeroSales.status, 'NORMAL');
  assert.equal(zeroSales.stockoutDate, '无断货风险');
});

test('03-erp-domain-mcp: calculateThreeBasisProfit distinguishes Order, Shipment, and Settlement (with/without pre-settlement)', () => {
  const base = INITIAL_LISTINGS[0];
  const sku = INITIAL_LOCAL_SKUS.find((s) => s.sku === base.localSkuCode);
  const orderBasis = calculateThreeBasisProfit({
    listing: base,
    localSku: sku,
    usdToCnyRate: 7.24,
    basis: 'ORDER_BASIS',
  });
  const shipBasis = calculateThreeBasisProfit({
    listing: base,
    localSku: sku,
    usdToCnyRate: 7.24,
    basis: 'SHIPMENT_BASIS',
  });
  const settlePre = calculateThreeBasisProfit({
    listing: base,
    localSku: sku,
    usdToCnyRate: 7.24,
    basis: 'SETTLEMENT_BASIS',
    includePreSettlement: true,
  });
  const settleStrict = calculateThreeBasisProfit({
    listing: base,
    localSku: sku,
    usdToCnyRate: 7.24,
    basis: 'SETTLEMENT_BASIS',
    includePreSettlement: false,
  });
  assert.equal(orderBasis.basisFactor, 1);
  assert.equal(shipBasis.basisFactor, 0.96);
  assert.equal(settlePre.basisFactor, 0.94);
  assert.equal(settleStrict.basisFactor, 0.84);
  assert.ok(orderBasis.recognizedRevenue >= shipBasis.recognizedRevenue);
  assert.ok(settlePre.recognizedRevenue >= settleStrict.recognizedRevenue);
});

test('03-erp-domain-mcp: calculatePricingProfitTrial computes breakeven ACOS and guards zero price/FX', () => {
  const normal = calculatePricingProfitTrial({
    sellingPriceLocal: 39.99,
    fxRateToCny: 7.24,
    purchaseCostCny: 45,
    headFreightCny: 18,
    fbaFeeLocal: 5.5,
    referralFeePercent: 15,
    refundRatePercent: 3,
    tacosPercent: 12,
  });
  assert.ok(normal.unitProfitLocal > 0);
  assert.ok(normal.breakevenAcosPercent > 12);
  assert.equal(Number.isFinite(normal.roiPercent), true);

  const zeroEdge = calculatePricingProfitTrial({
    sellingPriceLocal: 0,
    fxRateToCny: 0,
    purchaseCostCny: 30,
    headFreightCny: 10,
    fbaFeeLocal: 4,
    referralFeePercent: 15,
  });
  assert.equal(zeroEdge.netMarginPercent, 0);
  assert.equal(zeroEdge.breakevenAcosPercent, 0);
  assert.equal(Number.isFinite(zeroEdge.unitProfitCny), true);
});

test('03-erp-domain-mcp: normalizeLingxingExchangeRates handles CNY-base, my_rate priority, and inverse-USD quotes', () => {
  const cnyBase = normalizeLingxingExchangeRates(
    [
      { code: 'CNY', name: '人民币', rate_org: 1, my_rate: 1, date: '2026-11' },
      { code: 'USD', name: '美元', rate_org: 7.18, my_rate: 7.25, date: '2026-11' },
      { code: 'EUR', name: '欧元', rate_org: 7.83, my_rate: 0, date: '2026-11' },
      { code: 'JPY', name: '日元', rate_org: 0.0475, my_rate: 0, date: '2026-11' },
    ],
    'tenant-fx'
  );
  assert.equal(cnyBase.length, 4);
  const usd = cnyBase.find((r) => r.currencyCode === 'USD')!;
  const eur = cnyBase.find((r) => r.currencyCode === 'EUR')!;
  assert.equal(usd.effectiveRate, 7.25);
  assert.equal(usd.rateToUsd, 1);
  assert.equal(usd.rateToCny, 7.25);
  assert.ok(Math.abs(eur.rateToUsd - 7.83 / 7.25) < 0.0005);
  assert.equal(getUsdToCnyRateFromExchangeRates(cnyBase), 7.25);
  assert.equal(convertAmountToUsd(100, 'EUR', 'DE', cnyBase), Number(((100 * 7.83) / 7.25).toFixed(2)));

  const inverseUsd = normalizeLingxingExchangeRates(
    [
      { code: 'USD', rate_org: 1 },
      { code: 'CNY', rate_org: 7.2 },
      { code: 'JPY', rate_org: 150 },
    ],
    'tenant-fx'
  );
  const jpy = inverseUsd.find((r) => r.currencyCode === 'JPY')!;
  assert.ok(Math.abs(jpy.rateToUsd - 1 / 150) < 0.0005);
  assert.equal(convertAmountToUsd(15000, 'JPY', 'JP', inverseUsd), 100);
});

test('03-erp-domain-mcp: calculateLingxingWindowSales separates orderCount vs unitVolume, excludes replacement orders, and supports endAtYesterday', () => {
  const fxRates = normalizeLingxingExchangeRates(
    [
      { code: 'CNY', rate_org: 1 },
      { code: 'USD', rate_org: 7.25 },
      { code: 'CAD', rate_org: 5.22 },
    ],
    'tenant-1'
  );
  const fixedNow = new Date('2026-11-25T18:00:00Z');
  const rangeInclToday = getTargetDateRangeForMarketplace('US', '30D', 'PER_SITE', fixedNow, false);
  const rangeEndYesterday = getTargetDateRangeForMarketplace('US', '30D', 'PER_SITE', fixedNow, true);
  assert.equal(rangeInclToday.endDate, '2026-11-25');
  assert.equal(rangeEndYesterday.endDate, '2026-11-24');

  const sampleOrders = [
    {
      id: 'o-1',
      tenantId: 'tenant-1',
      shopId: 'shop-us',
      shopName: 'US-Main',
      marketplace: 'US' as const,
      amazonOrderId: '111-1000001',
      fulfillmentChannel: 'FBA' as const,
      asin: 'B0TEST01',
      msku: 'SKU-1',
      quantity: 3,
      orderAmountUsd: 90,
      amazonFeeUsd: 12,
      orderStatus: 'SHIPPED' as const,
      purchaseDate: '2026-11-24 09:00:00',
      buyerRegion: 'US',
      currency: 'USD' as const,
      isReplacementOrder: false,
    },
    {
      id: 'o-2',
      tenantId: 'tenant-1',
      shopId: 'shop-ca',
      shopName: 'CA-Main',
      marketplace: 'CA' as const,
      amazonOrderId: '111-1000002',
      fulfillmentChannel: 'FBA' as const,
      asin: 'B0TEST02',
      msku: 'SKU-2',
      quantity: 2,
      orderAmountUsd: 100,
      amazonFeeUsd: 14,
      orderStatus: 'REFUNDED' as const,
      purchaseDate: '2026-11-24 11:00:00',
      buyerRegion: 'CA',
      currency: 'CAD' as const,
      isReplacementOrder: false,
      isReturnOrder: true,
    },
    {
      id: 'o-3',
      tenantId: 'tenant-1',
      shopId: 'shop-us',
      shopName: 'US-Main',
      marketplace: 'US' as const,
      amazonOrderId: '111-1000003',
      fulfillmentChannel: 'FBA' as const,
      asin: 'B0TEST01',
      msku: 'SKU-1',
      quantity: 4,
      orderAmountUsd: 0,
      amazonFeeUsd: 0,
      orderStatus: 'SHIPPED' as const,
      purchaseDate: '2026-11-24 14:00:00',
      buyerRegion: 'US',
      currency: 'USD' as const,
      isReplacementOrder: true,
    },
    {
      id: 'o-4',
      tenantId: 'tenant-1',
      shopId: 'shop-us',
      shopName: 'US-Main',
      marketplace: 'US' as const,
      amazonOrderId: '111-1000004',
      fulfillmentChannel: 'FBA' as const,
      asin: 'B0TEST01',
      msku: 'SKU-1',
      quantity: 1,
      orderAmountUsd: 30,
      amazonFeeUsd: 0,
      orderStatus: 'CANCELED' as const,
      purchaseDate: '2026-11-24 15:00:00',
      buyerRegion: 'US',
      currency: 'USD' as const,
    },
  ];

  const excluded = calculateLingxingWindowSales({
    orders: sampleOrders,
    listings: [],
    window: '30D',
    siteDateMode: 'PER_SITE',
    excludeReplacement: true,
    endAtYesterday: true,
    exchangeRates: fxRates,
    nowDate: fixedNow,
  });
  assert.equal(excluded.fxSource, 'LINGXING_MCP');
  assert.equal(excluded.orderCount, 2);
  assert.equal(excluded.unitVolume, 5);
  assert.equal(excluded.canceledOrderCount, 1);
  assert.equal(excluded.replacementOrderCount, 1);
  assert.equal(excluded.replacementUnitCount, 4);
  assert.equal(excluded.refundedOrderCount, 1);
  assert.ok(Math.abs(excluded.refundedAmountUsd - 72) < 0.2);
  assert.ok(Math.abs(excluded.revenueUsd - 162) < 0.2);

  const included = calculateLingxingWindowSales({
    orders: sampleOrders,
    listings: [],
    window: '30D',
    siteDateMode: 'PER_SITE',
    excludeReplacement: false,
    endAtYesterday: true,
    exchangeRates: fxRates,
    nowDate: fixedNow,
  });
  assert.equal(included.orderCount, 3);
  assert.equal(included.unitVolume, 9);
});

test('03-erp-domain-mcp: calculateLingxingAdSummary, calculateLingxingSettlementSummary, and normalizeLingxingProfitSummary convert multi-currency to USD', () => {
  const fxRates = normalizeLingxingExchangeRates(
    [
      { code: 'USD', rate_org: 1 },
      { code: 'CNY', rate_org: 7.2 },
      { code: 'JPY', rate_org: 150 },
      { code: 'CAD', rate_org: 1.38 },
    ],
    'tenant-1'
  );

  const adSummary = calculateLingxingAdSummary(
    [
      {
        id: 'ad-us',
        tenantId: 'tenant-1',
        shopId: 's-us',
        shopName: 'US',
        marketplace: 'US',
        campaignId: 'c1',
        campaignName: 'US SP',
        adType: 'SP',
        associatedAsin: 'B01',
        dailyBudgetUsd: 100,
        defaultBidUsd: 1,
        impressions30d: 1000,
        clicks30d: 50,
        spend30dUsd: 200,
        sales30dUsd: 500,
        orders30d: 10,
        status: 'ENABLED',
        daypartingEnabled: false,
        peakHoursRange: '18:00-23:00',
        peakBidMultiplierPercent: 100,
        offPeakHoursRange: '02:00-06:00',
        offPeakBidMultiplierPercent: 100,
        currency: 'USD',
      },
      {
        id: 'ad-jp',
        tenantId: 'tenant-1',
        shopId: 's-jp',
        shopName: 'JP',
        marketplace: 'JP',
        campaignId: 'c2',
        campaignName: 'JP SB',
        adType: 'SB',
        associatedAsin: 'B02',
        dailyBudgetUsd: 5000,
        defaultBidUsd: 50,
        impressions30d: 2000,
        clicks30d: 100,
        spend30dUsd: 15000, // $100 USD
        sales30dUsd: 75000, // $500 USD
        orders30d: 15,
        status: 'ENABLED',
        daypartingEnabled: false,
        peakHoursRange: '18:00-23:00',
        peakBidMultiplierPercent: 100,
        offPeakHoursRange: '02:00-06:00',
        offPeakBidMultiplierPercent: 100,
        currency: 'JPY',
      },
    ],
    fxRates
  );
  assert.equal(adSummary.fxSource, 'LINGXING_MCP');
  assert.ok(Math.abs(adSummary.spendUsd - 300) < 0.5);
  assert.ok(Math.abs(adSummary.salesUsd - 1000) < 1);
  assert.ok(Math.abs(adSummary.acosPercent - 30) < 0.2);

  const settleSummary = calculateLingxingSettlementSummary(
    [
      {
        id: 'st-1',
        tenantId: 'tenant-1',
        shopId: 's-jp',
        shopName: 'JP',
        marketplace: 'JP',
        settlementId: 'SET-JP-1',
        periodRange: '2026-11-01 ~ 2026-11-15',
        grossSalesUsd: 150000,
        amazonFeesUsd: 30000,
        adSpendUsd: 15000,
        refundsUsd: 7500,
        reserveHeldUsd: 0,
        netPayoutUsd: 97500,
        reconcileStatus: 'RECONCILED',
        payoutDate: '2026-11-18',
        currency: 'JPY',
      },
      {
        id: 'st-old',
        tenantId: 'tenant-1',
        shopId: 's-us',
        shopName: 'US',
        marketplace: 'US',
        settlementId: 'SET-US-OLD',
        periodRange: '2026-08-01 ~ 2026-08-15',
        grossSalesUsd: 5000,
        amazonFeesUsd: 1000,
        adSpendUsd: 500,
        refundsUsd: 100,
        reserveHeldUsd: 0,
        netPayoutUsd: 3400,
        reconcileStatus: 'RECONCILED',
        payoutDate: '2026-08-18',
        currency: 'USD',
      },
    ],
    fxRates,
    30,
    new Date('2026-11-25T00:00:00Z')
  );
  assert.equal(settleSummary.periodCount, 1);
  assert.ok(Math.abs(settleSummary.grossSalesUsd - 1000) < 1);
  assert.ok(Math.abs(settleSummary.refundsUsd - 50) < 0.5);

  const profitSummaries = normalizeLingxingProfitSummary(
    [
      {
        currencyCode: 'USD',
        totalSalesQuantity: 3000,
        orderCount: 2800,
        totalSalesAmount: 44000,
        adsSpend: 14000,
        adsSales: 33000,
        totalRefundAmount: 2500,
        grossProfit: 4000,
      },
      {
        currencyCode: 'JPY',
        totalSalesQuantity: 86,
        orderCount: 80,
        totalSalesAmount: 213724.5, // $1424.83 USD at 150
        adsSpend: 87100.5, // $580.67 USD
        adsSales: 234229.5, // $1561.53 USD
        totalRefundAmount: 41047.5, // $273.65 USD
        grossProfit: 49801.5, // $332.01 USD
      },
    ],
    'tenant-1',
    'profit_statistics_shop',
    fxRates
  );
  assert.equal(profitSummaries.length, 1);
  assert.equal(profitSummaries[0].salesVolume, 3086);
  assert.equal(profitSummaries[0].orderCount, 2880);
  assert.ok(Math.abs(profitSummaries[0].salesAmountUsd - 45424.83) < 1);
  assert.ok(Math.abs(profitSummaries[0].adSpendUsd - 14580.67) < 1);
  assert.ok(Math.abs(profitSummaries[0].adSalesUsd - 34561.53) < 1);
  assert.ok(Math.abs(profitSummaries[0].refundAmountUsd - 2773.65) < 1);
  assert.ok(Math.abs(profitSummaries[0].settlementGrossProfitUsd - 4332.01) < 1);
});
