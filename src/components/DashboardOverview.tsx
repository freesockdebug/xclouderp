import React, { useEffect, useMemo, useState } from 'react';
import {
  Tenant,
  AmazonListingItem,
  LocalMaterialSku,
  PurchaseOrder1688,
  FbaShipmentPlan,
  AdCampaignItem,
  AmazonOrderItem,
  SettlementPeriodItem,
  ExchangeRateItem,
  LingxingProfitSummaryItem,
  CurrencyCode,
} from '../types/erp';
import {
  calculateAsinProfit,
  calculateLingxingReplenishment,
  calculateLingxingWindowSales,
  calculateLingxingAdSummary,
  calculateLingxingSettlementSummary,
  convertAmountToUsd,
  getUsdToCnyRateFromExchangeRates,
  SalesTimeWindow,
  SiteDateMode,
} from '../lib/erpEngine';
import {
  BarChart3,
  Store,
  Sliders,
  RefreshCw,
  ArrowUpRight,
  Clock,
  ChevronDown,
  ChevronUp,
  Coins,
} from 'lucide-react';
import { TablePagination, useTablePagination } from './TablePagination';

interface DashboardOverviewProps {
  currentTenant: Tenant;
  listings: AmazonListingItem[];
  orders: AmazonOrderItem[];
  localSkus: LocalMaterialSku[];
  purchaseOrders: PurchaseOrder1688[];
  shipments: FbaShipmentPlan[];
  campaigns: AdCampaignItem[];
  settlements?: SettlementPeriodItem[];
  exchangeRates?: ExchangeRateItem[];
  profitSummaries?: LingxingProfitSummaryItem[];
  hidePurchaseCost: boolean;
  onTriggerLingxingSync: () => void;
  onNavigateTab: (tab: string) => void;
}

const GLOBAL_SITE_CLOCKS = [
  { label: '美西 (US)', timeZone: 'America/Los_Angeles' },
  { label: '美东 (CA)', timeZone: 'America/Toronto' },
  { label: '墨西哥 (MX)', timeZone: 'America/Mexico_City' },
  { label: '巴西 (BR)', timeZone: 'America/Sao_Paulo' },
  { label: '日本 (JP)', timeZone: 'Asia/Tokyo' },
  { label: '北京 (CN)', timeZone: 'Asia/Shanghai' },
];

type TrendMetricKey = 'revenue' | 'orders' | 'adSpend' | 'netProfit' | 'fbaStock';

const TREND_METRIC_META: Record<
  TrendMetricKey,
  { label: string; color: string; stroke: string; format: (v: number) => string }
> = {
  revenue: {
    label: '销售额 ($)',
    color: 'text-blue-600 dark:text-blue-400',
    stroke: '#2563eb',
    format: (v) => `$${Math.round(v).toLocaleString()}`,
  },
  orders: {
    label: '销量 (件)',
    color: 'text-emerald-600 dark:text-emerald-400',
    stroke: '#16a34a',
    format: (v) => `${Math.round(v).toLocaleString()}`,
  },
  adSpend: {
    label: '广告费 ($)',
    color: 'text-amber-600 dark:text-amber-400',
    stroke: '#d97706',
    format: (v) => `$${Math.round(v).toLocaleString()}`,
  },
  netProfit: {
    label: '净利润 ($)',
    color: 'text-indigo-600 dark:text-indigo-400',
    stroke: '#4f46e5',
    format: (v) => `$${Math.round(v).toLocaleString()}`,
  },
  fbaStock: {
    label: 'FBA可售 (件)',
    color: 'text-slate-700 dark:text-slate-300',
    stroke: '#64748b',
    format: (v) => `${Math.round(v).toLocaleString()}`,
  },
};

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  currentTenant,
  listings,
  orders,
  localSkus,
  purchaseOrders,
  shipments,
  campaigns,
  settlements = [],
  exchangeRates = [],
  profitSummaries = [],
  hidePurchaseCost,
  onTriggerLingxingSync,
  onNavigateTab,
}) => {
  const [subTab, setSubTab] = useState<'overview' | 'store_perf' | 'profit_sandbox'>('overview');
  const [salesWindow, setSalesWindow] = useState<SalesTimeWindow>('30D');
  const [siteDateMode, setSiteDateMode] = useState<SiteDateMode>('PER_SITE');
  const [excludeReplacement, setExcludeReplacement] = useState<boolean>(true);
  const [endAtYesterday, setEndAtYesterday] = useState<boolean>(false);
  const [showShopSalesDetail, setShowShopSalesDetail] = useState(false);
  const [topSortBy, setTopSortBy] = useState<'revenue' | 'orders' | 'profit'>('revenue');
  const [selectedTrendMetrics, setSelectedTrendMetrics] = useState<TrendMetricKey[]>([
    'revenue',
    'adSpend',
    'orders',
  ]);
  const [nowDate, setNowDate] = useState(() => new Date());
  const usdToCnyRate = useMemo(
    () => getUsdToCnyRateFromExchangeRates(exchangeRates, 7.24),
    [exchangeRates]
  );

  // Unit Profit Sandbox State
  const [sandboxPriceUsd, setSandboxPriceUsd] = useState(39.99);
  const [sandboxCogsCny, setSandboxCogsCny] = useState(52);
  const [sandboxFreightCny, setSandboxFreightCny] = useState(14);
  const [sandboxFbaFeeUsd, setSandboxFbaFeeUsd] = useState(5.45);
  const [sandboxReferralPct, setSandboxReferralPct] = useState(15);
  const [sandboxAcosPct, setSandboxAcosPct] = useState(18);

  // Live Global Clocks (refresh every 30s)
  useEffect(() => {
    const id = window.setInterval(() => setNowDate(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const formatSiteClock = (tz: string) => {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: tz,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(nowDate);
    } catch {
      return nowDate.toISOString().slice(5, 16).replace('T', ' ');
    }
  };

  const skuMap = useMemo(() => {
    const m = new Map<string, LocalMaterialSku>();
    for (const s of localSkus) m.set(s.sku, s);
    return m;
  }, [localSkus]);

  const enrichedRows = useMemo(
    () =>
      listings.map((l) => {
        const sku = skuMap.get(l.localSkuCode);
        const profit = calculateAsinProfit(l, sku, usdToCnyRate, 0);
        const rep = calculateLingxingReplenishment({
          dailySales7d: l.dailySales7d,
          dailySales14d: l.dailySales14d,
          dailySales30d: l.dailySales30d,
          fbaAvailable: l.fbaAvailable,
          fbaInbound: l.fbaInbound,
          fbaReserved: l.fbaReserved,
          localAvailable: sku?.localAvailableQty || 0,
          localInbound: sku?.localInboundQty || 0,
          purchaseLeadDays: sku?.leadTimeDays || 10,
          safetyDays: 25,
        });
        const revenue30dUsdConverted = convertAmountToUsd(
          l.revenue30dUsd,
          l.currency,
          l.marketplace,
          exchangeRates
        );
        const adSpend30dUsdConverted = convertAmountToUsd(
          l.adSpend30dUsd,
          l.currency,
          l.marketplace,
          exchangeRates
        );
        const netProfitUsdConverted = convertAmountToUsd(
          profit.netProfitUsd,
          l.currency,
          l.marketplace,
          exchangeRates
        );
        return {
          listing: l,
          sku,
          ...profit,
          revenue30dUsdConverted,
          adSpend30dUsdConverted,
          netProfitUsdConverted,
          replenish: rep,
        };
      }),
    [listings, skuMap, usdToCnyRate, exchangeRates]
  );

  // Real-time sales card figures by window (Lingxing-aligned: computed directly from synced orders,
  // distinguishing valid orderCount [单] vs unitVolume [件], excluding Canceled & Replacement orders,
  // and converting multi-currency to USD using live Lingxing MCP exchange rates)
  const salesSummary = useMemo(
    () =>
      calculateLingxingWindowSales({
        orders,
        listings,
        window: salesWindow,
        siteDateMode,
        includeCanceled: false,
        excludeReplacement,
        endAtYesterday,
        exchangeRates,
        nowDate,
      }),
    [orders, listings, salesWindow, siteDateMode, excludeReplacement, endAtYesterday, exchangeRates, nowDate]
  );

  // Dedicated 30D summary for Lingxing core 8-KPI overview strip
  const salesSummary30d = useMemo(
    () =>
      salesWindow === '30D'
        ? salesSummary
        : calculateLingxingWindowSales({
            orders,
            listings,
            window: '30D',
            siteDateMode,
            includeCanceled: false,
            excludeReplacement,
            endAtYesterday,
            exchangeRates,
            nowDate,
          }),
    [salesWindow, salesSummary, orders, listings, siteDateMode, excludeReplacement, endAtYesterday, exchangeRates, nowDate]
  );

  const siteDateModeLabel =
    siteDateMode === 'PER_SITE'
      ? '各站点当地日期 (领星默认)'
      : siteDateMode === 'LATEST_SITE'
      ? '统一美西日期 (最晚站点)'
      : '统一北京时间 (CN)';

  const cycleSiteDateMode = () => {
    setSiteDateMode((prev) =>
      prev === 'PER_SITE' ? 'LATEST_SITE' : prev === 'LATEST_SITE' ? 'BEIJING' : 'PER_SITE'
    );
  };

  const totalRevenue30d = enrichedRows.reduce((s, r) => s + r.revenue30dUsdConverted, 0);
  const totalNetProfit30d = enrichedRows.reduce((s, r) => s + r.netProfitUsdConverted, 0);
  const avgNetMargin = totalRevenue30d > 0 ? (totalNetProfit30d / totalRevenue30d) * 100 : 0;

  // Real-time advertising summary from synced campaigns (FX-converted to exact USD)
  const adSummary = useMemo(
    () => calculateLingxingAdSummary(campaigns, exchangeRates),
    [campaigns, exchangeRates]
  );

  // Recent 30D Settlement summary (FX-converted to exact USD)
  const settlementSummary30d = useMemo(
    () => calculateLingxingSettlementSummary(settlements, exchangeRates, 30, nowDate),
    [settlements, exchangeRates, nowDate]
  );

  const mcpProfit30d = useMemo(
    () => profitSummaries.find((p) => p.windowKey === '30D') || profitSummaries[0] || null,
    [profitSummaries]
  );

  // Unified 30D core KPI figures (USD-converted via live MCP FX; prioritizes direct MCP profit summary if synced)
  const coreKpi30d = useMemo(() => {
    const orderCount =
      salesSummary30d.source === 'ORDERS' && salesSummary30d.orderCount > 0
        ? salesSummary30d.orderCount
        : mcpProfit30d?.orderCount || salesSummary30d.orderCount;
    const salesVolume =
      mcpProfit30d && mcpProfit30d.salesVolume > 0
        ? mcpProfit30d.salesVolume
        : salesSummary30d.unitVolume;
    const salesAmountUsd =
      mcpProfit30d && mcpProfit30d.salesAmountUsd > 0
        ? mcpProfit30d.salesAmountUsd
        : salesSummary30d.revenueUsd > 0
        ? salesSummary30d.revenueUsd
        : totalRevenue30d;
    const adSpendUsd =
      mcpProfit30d && mcpProfit30d.adSpendUsd > 0
        ? mcpProfit30d.adSpendUsd
        : adSummary.spendUsd;
    const adSalesUsd =
      mcpProfit30d && mcpProfit30d.adSalesUsd > 0
        ? mcpProfit30d.adSalesUsd
        : adSummary.salesUsd;
    const acosPercent =
      adSalesUsd > 0
        ? Number(((adSpendUsd / adSalesUsd) * 100).toFixed(2))
        : mcpProfit30d?.acosPercent ?? adSummary.acosPercent;
    const refundAmountUsd =
      mcpProfit30d && mcpProfit30d.refundAmountUsd > 0
        ? mcpProfit30d.refundAmountUsd
        : settlementSummary30d.refundsUsd > 0
        ? settlementSummary30d.refundsUsd
        : salesSummary30d.refundedAmountUsd;
    const settlementGrossProfitUsd =
      mcpProfit30d && Number.isFinite(mcpProfit30d.settlementGrossProfitUsd) && mcpProfit30d.settlementGrossProfitUsd !== 0
        ? mcpProfit30d.settlementGrossProfitUsd
        : totalNetProfit30d;
    const settlementGrossMarginPercent =
      mcpProfit30d && mcpProfit30d.settlementGrossMarginPercent !== 0
        ? mcpProfit30d.settlementGrossMarginPercent
        : salesAmountUsd > 0
        ? Number(((settlementGrossProfitUsd / salesAmountUsd) * 100).toFixed(2))
        : 0;
    const tacosPercent = salesAmountUsd > 0 ? (adSpendUsd / salesAmountUsd) * 100 : 0;

    return {
      orderCount,
      salesVolume,
      salesAmountUsd,
      adSpendUsd,
      adSalesUsd,
      acosPercent,
      refundAmountUsd,
      settlementGrossProfitUsd,
      settlementGrossMarginPercent,
      tacosPercent,
      hasMcpProfit: Boolean(mcpProfit30d),
      refundSource:
        mcpProfit30d && mcpProfit30d.refundAmountUsd > 0
          ? '领星利润汇总'
          : settlementSummary30d.refundsUsd > 0
          ? `结算账期 (${settlementSummary30d.periodCount}期)`
          : `退货订单 (${salesSummary30d.refundedOrderCount}单)`,
    };
  }, [mcpProfit30d, salesSummary30d, totalRevenue30d, totalNetProfit30d, adSummary, settlementSummary30d]);

  const tacos = coreKpi30d.tacosPercent;

  // Displayed live MCP FX chips (only currencies actually relevant to cross-border Amazon shops)
  const displayFxItems = useMemo(() => {
    const preferredOrder: CurrencyCode[] = ['USD', 'CAD', 'MXN', 'BRL', 'JPY', 'EUR', 'GBP', 'AUD'];
    if (exchangeRates.length > 0) {
      const byCode = new Map(exchangeRates.map((r) => [r.currencyCode, r]));
      const ordered = preferredOrder
        .map((code) => byCode.get(code))
        .filter((x): x is ExchangeRateItem => Boolean(x));
      return ordered.length > 0 ? ordered : exchangeRates.slice(0, 8);
    }
    return [];
  }, [exchangeRates]);

  // Inventory & 3-state Lingxing Replenishment Card
  const inventoryAndRep = useMemo(() => {
    const fbaAvail = listings.reduce((s, l) => s + l.fbaAvailable, 0);
    const fbaInb = listings.reduce((s, l) => s + l.fbaInbound, 0);
    const fbaRes = listings.reduce((s, l) => s + l.fbaReserved, 0);
    const localAvail = localSkus.reduce((s, k) => s + k.localAvailableQty, 0);
    const localInb = localSkus.reduce((s, k) => s + k.localInboundQty, 0);
    const localStockValueCny = localSkus.reduce(
      (s, k) => s + (k.stockValueCny ?? k.localAvailableQty * k.purchaseCostCny),
      0
    );
    const stockoutCertain = enrichedRows.filter(
      (r) => r.replenish.status === 'STOCKOUT_CERTAIN'
    ).length;
    const urgent = enrichedRows.filter((r) => r.replenish.status === 'URGENT').length;
    const normal = enrichedRows.filter((r) => r.replenish.status === 'NORMAL').length;
    return {
      fbaAvail,
      fbaInb,
      fbaRes,
      localAvail,
      localInb,
      localStockValueCny,
      stockoutCertain,
      urgent,
      normal,
    };
  }, [listings, localSkus, enrichedRows]);

  // Logistics Board Summary
  const logisticsSummary = useMemo(() => {
    const inTransit = shipments.filter(
      (s) => s.status === 'IN_TRANSIT' || s.status === 'SHIPPED'
    ).length;
    const receiving = shipments.filter((s) => s.status === 'RECEIVING').length;
    const closed = shipments.filter((s) => s.status === 'CLOSED').length;
    const working = shipments.filter((s) => s.status === 'WORKING').length;
    const awdCount = shipments.filter((s) => s.isAwd).length;
    const seaCount = shipments.filter(
      (s) => s.shippingMode === 'SEA_FAST' || s.shippingMode === 'SEA_STANDARD'
    ).length;
    const airCount = shipments.filter((s) => s.shippingMode === 'AIR_EXPRESS').length;
    const expressCount = shipments.filter(
      (s) => s.shippingMode === 'AIR_EXPRESS' && (s.carrierName || '').toUpperCase().includes('UPS')
    ).length;
    return { inTransit, receiving, closed, working, awdCount, seaCount, airCount, expressCount };
  }, [shipments]);

  // Store & Marketplace breakdown for multi-axis trend chart and sales detail (all USD-converted)
  const marketAgg = useMemo(() => {
    const mps = Array.from(new Set(enrichedRows.map((r) => r.listing.marketplace)));
    return mps
      .map((mp) => {
        const rows = enrichedRows.filter((r) => r.listing.marketplace === mp);
        const shopName = rows[0]?.listing.shopName || mp;
        const rev = rows.reduce((a, b) => a + b.revenue30dUsdConverted, 0);
        const ordersCnt = rows.reduce((a, b) => a + b.listing.orders30d, 0);
        const todayVol = rows.reduce((a, b) => a + (b.listing.todayVolume || 0), 0);
        const profit = rows.reduce((a, b) => a + b.netProfitUsdConverted, 0);
        const ads = rows.reduce((a, b) => a + b.adSpend30dUsdConverted, 0);
        const fbaStock = rows.reduce((a, b) => a + b.listing.fbaAvailable, 0);
        return {
          marketplace: mp,
          shopName,
          rev,
          orders: ordersCnt,
          todayVol,
          profit,
          ads,
          fbaStock,
          count: rows.length,
        };
      })
      .sort((a, b) => b.rev - a.rev);
  }, [enrichedRows]);

  // Ranked Leaderboard (full dataset, paginated in UI; sorted by USD equivalent for revenue/profit)
  const topLeaderboard = useMemo(() => {
    const copy = [...enrichedRows];
    copy.sort((a, b) => {
      if (topSortBy === 'orders') return b.listing.orders30d - a.listing.orders30d;
      if (topSortBy === 'profit') return b.netProfitUsdConverted - a.netProfitUsdConverted;
      return b.revenue30dUsdConverted - a.revenue30dUsdConverted;
    });
    return copy;
  }, [enrichedRows, topSortBy]);

  const refundedOrders = useMemo(
    () => orders.filter((o) => o.orderStatus === 'REFUNDED'),
    [orders]
  );

  const leaderboardPagination = useTablePagination(topLeaderboard, 15);
  const storePerfPagination = useTablePagination(enrichedRows, 15);
  const refundedOrdersPagination = useTablePagination(refundedOrders, 10);

  const toggleTrendMetric = (key: TrendMetricKey) => {
    setSelectedTrendMetrics((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      }
      // Lingxing rule: up to 3 independent-axis metrics; selecting a 4th drops the 1st
      if (prev.length >= 3) {
        return [...prev.slice(1), key];
      }
      return [...prev, key];
    });
  };

  // Store Performance & Return Reason Analysis
  const buyBoxWinRate =
    listings.length > 0
      ? (listings.filter((l) => l.buyBoxWinner).length / listings.length) * 100
      : 100;
  const pendingPoCount = purchaseOrders.filter((p) => p.status !== 'RECEIVED').length;
  const overduePoCount = purchaseOrders.filter((p) => p.isOverdue).length;

  // Sandbox calculation
  const sandboxUnitCogsUsd = (sandboxCogsCny + sandboxFreightCny) / usdToCnyRate;
  const sandboxReferralUsd = sandboxPriceUsd * (sandboxReferralPct / 100);
  const sandboxAdUsd = sandboxPriceUsd * (sandboxAcosPct / 100);
  const sandboxUnitProfitUsd =
    sandboxPriceUsd - sandboxUnitCogsUsd - sandboxReferralUsd - sandboxFbaFeeUsd - sandboxAdUsd;
  const sandboxMarginPct = sandboxPriceUsd > 0 ? (sandboxUnitProfitUsd / sandboxPriceUsd) * 100 : 0;

  // SVG independent multi-axis chart helper
  const getMetricValue = (m: (typeof marketAgg)[number], key: TrendMetricKey) => {
    if (key === 'revenue') return m.rev;
    if (key === 'orders') return m.orders;
    if (key === 'adSpend') return m.ads;
    if (key === 'netProfit') return Math.max(0, m.profit);
    return m.fbaStock;
  };

  return (
    <div className="space-y-5">
      {/* Global Clocks & Lingxing Cockpit Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              首页 · 全球跨境经营驾驶舱 — {currentTenant.companyName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              领星 MCP 实时同步 ({currentTenant.lastLingxingSyncAt}) · 覆盖 {listings.length} 个在售 ASIN · {campaigns.length} 个广告活动 · {shipments.length} 个 FBA 货件
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
              <button
                type="button"
                onClick={() => setSubTab('overview')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded whitespace-nowrap ${
                  subTab === 'overview'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>1.1 首页驾驶舱</span>
              </button>
              <button
                type="button"
                onClick={() => setSubTab('store_perf')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded whitespace-nowrap ${
                  subTab === 'store_perf'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>1.2 店铺绩效与退货</span>
              </button>
              <button
                type="button"
                onClick={() => setSubTab('profit_sandbox')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded whitespace-nowrap ${
                  subTab === 'profit_sandbox'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>1.3 单品利润沙盘</span>
              </button>
            </div>
            <button
              type="button"
              onClick={onTriggerLingxingSync}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>领星同步</span>
            </button>
          </div>
        </div>

        {/* Lingxing Global Site Clocks Strip (unboxed clean metadata) */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 font-sans font-medium text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>全球站点时钟</span>
          </span>
          {GLOBAL_SITE_CLOCKS.map((clk) => (
            <span key={clk.label} className="whitespace-nowrap">
              <span className="font-sans text-slate-500">{clk.label}</span>{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-200">
                {formatSiteClock(clk.timeZone)}
              </span>
            </span>
          ))}
        </div>

        {/* Live Lingxing MCP Exchange Rate Strip */}
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1 font-sans font-medium text-slate-500">
              <Coins className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>
                {displayFxItems.length > 0 ? '领星 MCP 实时汇率' : '汇率折算基准 (待同步 MCP 汇率)'}
              </span>
            </span>
            {displayFxItems.length > 0 ? (
              displayFxItems.map((fx) => (
                <span key={fx.id} className="whitespace-nowrap">
                  <span className="text-slate-500">
                    {fx.currencyCode === 'USD' ? 'USD/CNY' : `${fx.currencyCode}/USD`}
                  </span>{' '}
                  <strong className="text-slate-900 dark:text-slate-200">
                    {fx.currencyCode === 'USD'
                      ? fx.rateToCny.toFixed(4)
                      : fx.rateToUsd.toFixed(4)}
                  </strong>
                </span>
              ))
            ) : (
              <span>
                USD/CNY <strong className="text-slate-900 dark:text-slate-200">{usdToCnyRate.toFixed(4)}</strong> · 点击右上角「领星同步」可自动拉取领星实时币种汇率
              </span>
            )}
          </div>
          {displayFxItems[0]?.rateDate && (
            <span className="text-[10px] text-slate-400">
              汇率月份: {displayFxItems[0].rateDate}
            </span>
          )}
        </div>
      </div>

      {/* 1.1 Lingxing-Style Cockpit */}
      {subTab === 'overview' && (
        <div className="space-y-5">
          {/* Row 0: Lingxing 30-Day Core Financial & Operating KPI Strip (All USD via Live MCP FX) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                  近 30 天核心经营指标（多币种折算 USD · 订单量与销量分列）
                </h3>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  汇率口径: {salesSummary30d.fxSource === 'LINGXING_MCP' ? '领星 MCP 实时汇率' : '系统兜底汇率'} · 统计范围: {endAtYesterday ? '截至昨日 (30个完整自然日)' : '含今日 (近30天)'} · {excludeReplacement ? '已排除取消单与换货单' : '已排除取消单(含换货单)'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setExcludeReplacement((prev) => !prev)}
                  className={`px-2.5 py-1 rounded border transition-colors ${
                    excludeReplacement
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 font-medium'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  {excludeReplacement ? '已排除换货单' : '包含换货单'}
                  {salesSummary30d.replacementUnitCount > 0
                    ? ` (${salesSummary30d.replacementUnitCount}件)`
                    : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setEndAtYesterday((prev) => !prev)}
                  className={`px-2.5 py-1 rounded border transition-colors ${
                    endAtYesterday
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 font-medium'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {endAtYesterday ? '周期: 截至昨日' : '周期: 含今日'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800 font-mono tabular-nums">
              {/* 1. Sales Volume (Units) & Order Count (Orders) clearly separated */}
              <div>
                <div className="text-[11px] font-sans text-slate-500">销量 (件) / 订单量</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {coreKpi30d.salesVolume.toLocaleString()}
                  <span className="text-[11px] font-sans font-normal text-slate-500 ml-0.5">件</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  有效订单 {coreKpi30d.orderCount.toLocaleString()} 单
                </div>
                {(mcpProfit30d?.salesVolumeMomPct !== undefined || mcpProfit30d?.salesVolumeYoyPct !== undefined) && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {mcpProfit30d.salesVolumeMomPct !== undefined ? `环比 ${mcpProfit30d.salesVolumeMomPct > 0 ? '+' : ''}${mcpProfit30d.salesVolumeMomPct.toFixed(2)}%` : ''}
                    {mcpProfit30d.salesVolumeYoyPct !== undefined ? ` · 同比 ${mcpProfit30d.salesVolumeYoyPct > 0 ? '+' : ''}${mcpProfit30d.salesVolumeYoyPct.toFixed(2)}%` : ''}
                  </div>
                )}
              </div>

              {/* 2. Sales Revenue (USD) */}
              <div>
                <div className="text-[11px] font-sans text-slate-500">销售额 (USD)</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  ${coreKpi30d.salesAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  件均价 ${coreKpi30d.salesVolume > 0 ? (coreKpi30d.salesAmountUsd / coreKpi30d.salesVolume).toFixed(2) : '0.00'}
                </div>
              </div>

              {/* 3. Ad Spend (USD) */}
              <div>
                <div className="text-[11px] font-sans text-slate-500">广告花费 (USD)</div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">
                  ${coreKpi30d.adSpendUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  TACOS {coreKpi30d.tacosPercent.toFixed(2)}%
                </div>
              </div>

              {/* 4. Ad Sales (USD) */}
              <div>
                <div className="text-[11px] font-sans text-slate-500">广告销售额 (USD)</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  ${coreKpi30d.adSalesUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  ROAS {coreKpi30d.adSpendUsd > 0 ? (coreKpi30d.adSalesUsd / coreKpi30d.adSpendUsd).toFixed(2) : '0.00'}
                </div>
              </div>

              {/* 5. ACOS */}
              <div>
                <div className="text-[11px] font-sans text-slate-500">ACOS</div>
                <div
                  className={`text-lg font-bold mt-1 ${
                    coreKpi30d.acosPercent > 35
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {coreKpi30d.acosPercent.toFixed(2)}%
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  CPC ${adSummary.cpcUsd.toFixed(2)}
                </div>
              </div>

              {/* 6. Refund Amount (USD) */}
              <div>
                <div className="text-[11px] font-sans text-slate-500">退款额 (USD)</div>
                <div className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">
                  ${coreKpi30d.refundAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                  {coreKpi30d.refundSource}
                </div>
              </div>

              {/* 7. Settlement Gross Profit (USD) */}
              <div>
                <div className="text-[11px] font-sans text-slate-500">结算毛利润 (USD)</div>
                <div
                  className={`text-lg font-bold mt-1 ${
                    hidePurchaseCost
                      ? 'text-slate-400'
                      : coreKpi30d.settlementGrossProfitUsd >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {hidePurchaseCost
                    ? '***'
                    : `$${coreKpi30d.settlementGrossProfitUsd.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                </div>
                <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                  {coreKpi30d.hasMcpProfit ? '领星利润汇总' : '多币种折USD核算'}
                </div>
              </div>

              {/* 8. Settlement Gross Margin (%) */}
              <div>
                <div className="text-[11px] font-sans text-slate-500">结算毛利率</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {hidePurchaseCost ? '***' : `${coreKpi30d.settlementGrossMarginPercent.toFixed(2)}%`}
                </div>
                <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                  汇率 USD/CNY {usdToCnyRate.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Row 1: Real-time Sales + Real-time Ads + Inventory & 3-State Replenishment */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Real-time Sales Card */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                    实时销售概览（订单量 vs 销量分列）
                  </h3>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    口径: {siteDateModeLabel} · {salesSummary.source === 'ORDERS' ? '订单明细实算' : 'Listing快照兜底'} · {salesSummary.fxSource === 'LINGXING_MCP' ? 'MCP实时汇率' : '兜底汇率'}
                  </div>
                </div>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px]">
                  {(
                    [
                      { id: 'TODAY', label: '今日' },
                      { id: 'YESTERDAY', label: '昨日' },
                      { id: '7D', label: '近7天' },
                      { id: '30D', label: '近30天' },
                    ] as const
                  ).map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setSalesWindow(w.id)}
                      className={`px-2 py-1 rounded ${
                        salesWindow === w.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                          : 'text-slate-500'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
                <div>
                  <div className="text-[11px] font-sans text-slate-500">有效订单量 (单)</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                    {salesSummary.orderCount.toLocaleString()}
                    <span className="text-xs font-sans font-normal text-slate-500 ml-0.5">单</span>
                  </div>
                  <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                    排除取消 {salesSummary.canceledOrderCount} 单
                    {salesSummary.replacementOrderCount > 0
                      ? ` · 换货 ${salesSummary.replacementOrderCount} 单`
                      : ''}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-sans text-slate-500">总销量 (件)</div>
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                    {salesSummary.unitVolume.toLocaleString()}
                    <span className="text-xs font-sans font-normal text-slate-500 ml-0.5">件</span>
                  </div>
                  <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                    件/单 {salesSummary.unitsPerOrder.toFixed(2)}
                    {salesSummary.replacementUnitCount > 0
                      ? ` · 换货 ${salesSummary.replacementUnitCount}件`
                      : ''}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-sans text-slate-500">销售额 (折USD)</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                    ${salesSummary.revenueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                    件均价 ${salesSummary.avgSellingPriceUsd.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-sans text-slate-500">核算净利 (30d)</div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {hidePurchaseCost
                      ? '***'
                      : `$${Math.round(totalNetProfit30d).toLocaleString()}`}
                  </div>
                  <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                    净利率 {hidePurchaseCost ? '***' : `${avgNetMargin.toFixed(1)}%`}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="font-mono tabular-nums">
                  Pending {salesSummary.pendingOrderCount} 单 · 退货 {salesSummary.refundedOrderCount} 单 · BuyBox {buyBoxWinRate.toFixed(0)}%
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={cycleSiteDateMode}
                    className="text-slate-500 hover:text-slate-900 dark:hover:text-white underline"
                  >
                    切换时区口径
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowShopSalesDetail((prev) => !prev)}
                    className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-medium"
                  >
                    <span>分店铺明细</span>
                    {showShopSalesDetail ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {showShopSalesDetail && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-[11px] font-mono tabular-nums">
                  {salesSummary.byShop.length > 0 ? (
                    salesSummary.byShop.map((m) => (
                      <div
                        key={`${m.shopId}-${m.marketplace}`}
                        className="py-1.5 flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="font-sans text-slate-700 dark:text-slate-300">
                          {m.shopName} ({m.marketplace}){' '}
                          <span className="font-mono text-[10px] text-slate-400">
                            {m.targetDateLabel}
                          </span>
                        </span>
                        <span>
                          <strong className="text-slate-900 dark:text-white">{m.orderCount}单</strong>{' '}
                          / <strong className="text-blue-600 dark:text-blue-400">{m.unitVolume}件</strong> · {m.currencyIcon}
                          {Math.round(m.revenueOrig).toLocaleString()}
                          {m.currency !== 'USD' ? ` ($${Math.round(m.revenueUsd).toLocaleString()})` : ''}
                          {m.canceledOrderCount > 0 ? (
                            <span className="text-slate-400"> · 取消{m.canceledOrderCount}</span>
                          ) : null}
                          {m.replacementOrderCount > 0 ? (
                            <span className="text-slate-400"> · 换货{m.replacementOrderCount}</span>
                          ) : null}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-2 text-center font-sans text-slate-400">
                      当前统计周期 ({siteDateModeLabel}) 暂无命中订单，可切换时区口径或周期查看
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Real-time Advertising Card (All Multi-Currency Campaigns Converted to USD) */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                    实时广告总览 (SP / SB / SD · 折 USD)
                  </h3>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    投放中 {adSummary.enabledCount} / {campaigns.length} 活动 · 超预算{' '}
                    <span
                      className={
                        adSummary.overBudgetCount > 0
                          ? 'text-red-600 dark:text-red-400 font-semibold'
                          : ''
                      }
                    >
                      {adSummary.overBudgetCount}
                    </span>
                    {' · '}
                    {adSummary.fxSource === 'LINGXING_MCP' ? 'MCP实时汇率' : '兜底汇率'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('ads')}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  <span>广告管理</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
                <div>
                  <div className="text-[11px] font-sans text-slate-500">广告总花费 (USD)</div>
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                    ${adSummary.spendUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    TACOS {tacos.toFixed(2)}% · CPC ${adSummary.cpcUsd.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-sans text-slate-500">广告销售额 (USD) / ACOS</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                    ${adSummary.salesUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ACOS {adSummary.acosPercent.toFixed(2)}% · ROAS {adSummary.roas.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500">
                <span>曝光 {adSummary.impressions.toLocaleString()}</span>
                <span>点击 {adSummary.clicks.toLocaleString()}</span>
                <span>CTR {adSummary.ctrPercent.toFixed(2)}%</span>
                <span>广告单 {adSummary.adOrders.toLocaleString()}</span>
              </div>
            </div>

            {/* Inventory & 3-State Replenishment Card */}
            <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                  库存概览与三态补货建议
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigateTab('fba')}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  <span>补货台</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums py-1">
                <div>
                  <div className="text-lg font-bold text-red-600 dark:text-red-400">
                    {inventoryAndRep.stockoutCertain}
                  </div>
                  <div className="text-[11px] font-sans text-slate-500">必断货</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {inventoryAndRep.urgent}
                  </div>
                  <div className="text-[11px] font-sans text-slate-500">加急补货</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {inventoryAndRep.normal}
                  </div>
                  <div className="text-[11px] font-sans text-slate-500">正常</div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">FBA 可售 / 在途</span>
                  <span>
                    {inventoryAndRep.fbaAvail.toLocaleString()} / +{inventoryAndRep.fbaInb.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">本地可用 / 货值</span>
                  <span>
                    {inventoryAndRep.localAvail.toLocaleString()} ·{' '}
                    {hidePurchaseCost
                      ? '***'
                      : `¥${Math.round(inventoryAndRep.localStockValueCny).toLocaleString()}`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Independent Multi-Axis Trend Chart + Logistics Board & Pending Matters */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Multi-Axis Performance Chart (up to 3 independent metrics, Lingxing Homeone spec) */}
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    跨站点业绩走势对比（最多选 3 项独立坐标轴指标）
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    覆盖全部实时同步站点 ({marketAgg.map((m) => m.marketplace).join(' / ') || '暂无'}) · 选中第 4 项自动替换最早指标
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {(Object.keys(TREND_METRIC_META) as TrendMetricKey[]).map((key) => {
                    if (key === 'netProfit' && hidePurchaseCost) return null;
                    const active = selectedTrendMetrics.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleTrendMetric(key)}
                        className={`px-2.5 py-1 rounded border transition-colors ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {TREND_METRIC_META[key].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {marketAgg.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  暂无站点数据，请先在领星 MCP 同步真实店铺与 Listing。
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Normalized Independent-Axis Visual SVG */}
                  <div className="w-full overflow-x-auto">
                    <svg
                      viewBox="0 0 640 190"
                      className="w-full h-44 text-slate-500"
                      role="img"
                      aria-label="跨站点多指标独立坐标走势图"
                    >
                      {[30, 75, 120, 160].map((y) => (
                        <line
                          key={y}
                          x1="36"
                          x2="620"
                          y1={y}
                          y2={y}
                          stroke="currentColor"
                          strokeOpacity="0.12"
                          strokeDasharray="3 3"
                        />
                      ))}
                      {selectedTrendMetrics.map((metricKey) => {
                        const vals = marketAgg.map((m) => getMetricValue(m, metricKey));
                        const maxVal = Math.max(1, ...vals);
                        const stepX =
                          marketAgg.length > 1 ? (600 - 56) / (marketAgg.length - 1) : 0;
                        const points = marketAgg
                          .map((m, idx) => {
                            const x =
                              marketAgg.length > 1 ? 56 + idx * stepX : 320;
                            const y = 158 - (getMetricValue(m, metricKey) / maxVal) * 124;
                            return `${x.toFixed(1)},${y.toFixed(1)}`;
                          })
                          .join(' ');
                        return (
                          <g key={metricKey}>
                            {marketAgg.length > 1 && (
                              <polyline
                                fill="none"
                                stroke={TREND_METRIC_META[metricKey].stroke}
                                strokeWidth="2.2"
                                points={points}
                              />
                            )}
                            {marketAgg.map((m, idx) => {
                              const x =
                                marketAgg.length > 1 ? 56 + idx * stepX : 320;
                              const y = 158 - (getMetricValue(m, metricKey) / maxVal) * 124;
                              return (
                                <circle
                                  key={`${metricKey}-${m.marketplace}`}
                                  cx={x}
                                  cy={y}
                                  r="4"
                                  fill={TREND_METRIC_META[metricKey].stroke}
                                />
                              );
                            })}
                          </g>
                        );
                      })}
                      {marketAgg.map((m, idx) => {
                        const stepX =
                          marketAgg.length > 1 ? (600 - 56) / (marketAgg.length - 1) : 0;
                        const x = marketAgg.length > 1 ? 56 + idx * stepX : 320;
                        return (
                          <text
                            key={m.marketplace}
                            x={x}
                            y="180"
                            textAnchor="middle"
                            fontSize="11"
                            fill="currentColor"
                            className="font-mono"
                          >
                            {m.marketplace} ({m.count})
                          </text>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Exact tabular readout below chart */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono tabular-nums">
                    {marketAgg.map((m) => (
                      <div key={m.marketplace} className="space-y-0.5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {m.marketplace} · {m.count} ASIN
                        </div>
                        {selectedTrendMetrics.map((mk) => (
                          <div key={mk} className={TREND_METRIC_META[mk].color}>
                            {TREND_METRIC_META[mk].label.split(' ')[0]}:{' '}
                            {TREND_METRIC_META[mk].format(getMetricValue(m, mk))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right 4 cols: Logistics Board & Pending Matters Hub */}
            <div className="lg:col-span-4 space-y-5">
              {/* Head Logistics Board */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                    头程物流与 AWD 货件看板
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('fba')}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    全部货件 →
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center font-mono tabular-nums">
                  <div>
                    <div className="text-base font-bold text-blue-600 dark:text-blue-400">
                      {logisticsSummary.inTransit}
                    </div>
                    <div className="text-[11px] font-sans text-slate-500">在途</div>
                  </div>
                  <div>
                    <div className="text-base font-bold text-amber-600 dark:text-amber-400">
                      {logisticsSummary.receiving}
                    </div>
                    <div className="text-[11px] font-sans text-slate-500">接收中</div>
                  </div>
                  <div>
                    <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                      {logisticsSummary.closed}
                    </div>
                    <div className="text-[11px] font-sans text-slate-500">已完成</div>
                  </div>
                  <div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">
                      {logisticsSummary.awdCount}
                    </div>
                    <div className="text-[11px] font-sans text-slate-500">AWD仓</div>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 flex justify-between">
                  <span>海运 {logisticsSummary.seaCount}</span>
                  <span>空派 {logisticsSummary.airCount}</span>
                  <span>快递 {logisticsSummary.expressCount}</span>
                  <span>待发货 {logisticsSummary.working}</span>
                </div>
              </div>

              {/* Pending Matters Action Hub */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    待处理事项快捷入口
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('ops_tools')}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    预警与审批台 →
                  </button>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  <button
                    type="button"
                    onClick={() => onNavigateTab('fba')}
                    className="w-full py-2 flex items-center justify-between text-left hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <span className="font-sans text-slate-600 dark:text-slate-300">
                      必断货 / 加急补货 ASIN
                    </span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {inventoryAndRep.stockoutCertain + inventoryAndRep.urgent} 项 →
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('ads')}
                    className="w-full py-2 flex items-center justify-between text-left hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <span className="font-sans text-slate-600 dark:text-slate-300">
                      超预算广告活动
                    </span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {adSummary.overBudgetCount} 个 →
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('inventory')}
                    className="w-full py-2 flex items-center justify-between text-left hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <span className="font-sans text-slate-600 dark:text-slate-300">
                      在途 / 逾期采购单
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {pendingPoCount} (逾期 {overduePoCount}) →
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Lingxing TOP 50 Leaderboard */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  产品排行榜 (共 {topLeaderboard.length} 条)
                </h3>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px]">
                  {(
                    [
                      { id: 'revenue', label: '按销售额' },
                      { id: 'orders', label: '按销量' },
                      { id: 'profit', label: '按净利润' },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setTopSortBy(s.id)}
                      className={`px-2 py-1 rounded ${
                        topSortBy === s.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                          : 'text-slate-500'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('product_performance')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                打开「统计 · 产品表现」全维宽表 →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4 w-10">#</th>
                    <th className="py-2.5 px-4">商品 / 站点 / ASIN</th>
                    <th className="py-2.5 px-4 text-right">30d 营收 (本币/折USD)</th>
                    <th className="py-2.5 px-4 text-right">30d 销量(件) / 7d日均</th>
                    <th className="py-2.5 px-4 text-right">FBA 可售 / 可售天数</th>
                    <th className="py-2.5 px-4 text-right">广告费 / ACOS</th>
                    <th className="py-2.5 px-4 text-right">真实净利率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {leaderboardPagination.pageItems.map((r, idx) => (
                    <tr key={r.listing.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 text-slate-400">
                        {(leaderboardPagination.page - 1) * leaderboardPagination.pageSize + idx + 1}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {r.listing.smallImageUrl ? (
                            <img
                              src={r.listing.smallImageUrl}
                              alt={r.listing.asin}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {r.listing.marketplace} · {r.listing.asin}
                              {r.listing.parentAsin ? (
                                <span className="text-[11px] font-normal text-slate-500">
                                  {' '}
                                  (父 {r.listing.parentAsin})
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[11px] font-sans text-slate-500 truncate max-w-xs">
                              {r.listing.localName || r.listing.title}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        <div>
                          {r.listing.currencyIcon || '$'}
                          {Math.round(r.listing.revenue30dUsd).toLocaleString()}
                        </div>
                        {r.listing.currency && r.listing.currency !== 'USD' && (
                          <div className="text-[10px] font-normal text-slate-400">
                            ≈ ${Math.round(r.revenue30dUsdConverted).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {r.listing.orders30d}件 / {r.listing.dailySales7d.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <span>{r.listing.fbaAvailable}</span> ·{' '}
                        <span
                          className={`font-semibold ${
                            r.replenish.status === 'STOCKOUT_CERTAIN'
                              ? 'text-red-600 dark:text-red-400'
                              : r.replenish.status === 'URGENT'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {r.replenish.coverDays >= 999 ? '999+' : `${r.replenish.coverDays}天`}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {r.listing.currencyIcon || '$'}
                        {Math.round(r.listing.adSpend30dUsd).toLocaleString()} · {r.acosPercent.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold whitespace-nowrap">
                        {hidePurchaseCost ? '***' : `${r.netMarginPercent.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={leaderboardPagination.page}
              pageSize={leaderboardPagination.pageSize}
              totalItems={leaderboardPagination.totalItems}
              totalPages={leaderboardPagination.totalPages}
              onPageChange={leaderboardPagination.setPage}
              onPageSizeChange={leaderboardPagination.setPageSize}
              pageSizeOptions={[15, 30, 50, 100]}
              itemLabel="排行榜商品"
            />
          </div>
        </div>
      )}

      {/* 1.2 Store Performance & Return Reason Analysis */}
      {subTab === 'store_perf' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
              各站点 ASIN 退货率与 BuyBox 购物车表现
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">店铺 / ASIN</th>
                    <th className="py-2.5 px-4 text-right">退货率</th>
                    <th className="py-2.5 px-4 text-right">退款估算损耗</th>
                    <th className="py-2.5 px-4">BuyBox / 跟卖</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {storePerfPagination.pageItems.map((r) => (
                    <tr key={r.listing.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {r.listing.shopName} · {r.listing.asin}
                        </div>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold ${
                          r.listing.refundRatePercent > 4
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {r.listing.refundRatePercent.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right text-red-600 dark:text-red-400">
                        -{r.listing.currencyIcon || '$'}
                        {Math.round(r.refundLossUsd).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        {r.listing.buyBoxWinner ? '正常' : '丢失'} · 跟卖 {r.listing.hijackerCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={storePerfPagination.page}
              pageSize={storePerfPagination.pageSize}
              totalItems={storePerfPagination.totalItems}
              totalPages={storePerfPagination.totalPages}
              onPageChange={storePerfPagination.setPage}
              onPageSizeChange={storePerfPagination.setPageSize}
              pageSizeOptions={[15, 30, 50, 100]}
              itemLabel="ASIN 绩效"
            />
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                近期退货退款订单归因明细 ({refundedOrders.length} 笔)
              </h3>
            </div>
            <div className="px-5 divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {refundedOrders.length === 0 ? (
                <div className="py-6 text-center text-slate-500">当前可见店铺暂无退货记录</div>
              ) : (
                refundedOrdersPagination.pageItems.map((ord) => (
                  <div key={ord.id} className="py-2.5 space-y-0.5">
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {ord.amazonOrderId} ({ord.asin})
                      </span>
                      <span className="text-red-600 dark:text-red-400">
                        -{ord.currencyIcon || '$'}
                        {ord.orderAmountUsd.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      归因: {ord.returnReason || '买家无理由退货'} · {ord.purchaseDate}
                    </div>
                  </div>
                ))
              )}
            </div>
            <TablePagination
              page={refundedOrdersPagination.page}
              pageSize={refundedOrdersPagination.pageSize}
              totalItems={refundedOrdersPagination.totalItems}
              totalPages={refundedOrdersPagination.totalPages}
              onPageChange={refundedOrdersPagination.setPage}
              onPageSizeChange={refundedOrdersPagination.setPageSize}
              pageSizeOptions={[10, 20, 50]}
              itemLabel="退货订单"
            />
          </div>
        </div>
      )}

      {/* 1.3 Unit Profit Sandbox */}
      {subTab === 'profit_sandbox' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              新品选品与单品利润沙盘测算器 (汇率 USD/CNY = {usdToCnyRate})
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('ops_tools')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              打开多站点 11 币种专业试算器 →
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-4 text-xs">
            <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-500 mb-1">预期售价 (USD)</label>
                <input
                  type="number"
                  step="0.5"
                  value={sandboxPriceUsd}
                  onChange={(e) => setSandboxPriceUsd(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">1688 采购单价 (CNY)</label>
                <input
                  type="number"
                  value={sandboxCogsCny}
                  onChange={(e) => setSandboxCogsCny(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">头程单件运费 (CNY)</label>
                <input
                  type="number"
                  value={sandboxFreightCny}
                  onChange={(e) => setSandboxFreightCny(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">FBA 尾程配送费 (USD)</label>
                <input
                  type="number"
                  step="0.1"
                  value={sandboxFbaFeeUsd}
                  onChange={(e) => setSandboxFbaFeeUsd(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">平台佣金比例 (%)</label>
                <input
                  type="number"
                  value={sandboxReferralPct}
                  onChange={(e) => setSandboxReferralPct(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">预计广告占比 TACOS (%)</label>
                <input
                  type="number"
                  value={sandboxAcosPct}
                  onChange={(e) => setSandboxAcosPct(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
            </div>

            <div className="md:col-span-5 p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col justify-between">
              <div className="space-y-2 font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-500">单件折算采购+头程:</span>
                  <span>-${sandboxUnitCogsUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">平台佣金 ({sandboxReferralPct}%):</span>
                  <span>-${sandboxReferralUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">FBA 配送费:</span>
                  <span>-${sandboxFbaFeeUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">广告费预算 ({sandboxAcosPct}%):</span>
                  <span>-${sandboxAdUsd.toFixed(2)}</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-end justify-between font-mono tabular-nums">
                <div>
                  <div className="text-slate-500">单件净毛利</div>
                  <div
                    className={`text-2xl font-bold ${
                      sandboxUnitProfitUsd >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    ${sandboxUnitProfitUsd.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-slate-500">净利率 / ROI</div>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {sandboxMarginPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
