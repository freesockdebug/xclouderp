import React, { useMemo, useState } from 'react';
import {
  AmazonListingItem,
  AmazonOrderItem,
  LocalMaterialSku,
  AdCampaignItem,
  ExchangeRateItem,
  CurrencyCode,
  MarketplaceCode,
} from '../types/erp';
import {
  calculateAsinProfit,
  calculateLingxingReplenishment,
  convertAmountToUsd,
  getUsdToCnyRateFromExchangeRates,
} from '../lib/erpEngine';
import {
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  Plus,
  BookOpen,
  ArrowUpDown,
} from 'lucide-react';
import { TablePagination, useTablePagination } from './TablePagination';

interface ProductPerformanceViewProps {
  listings: AmazonListingItem[];
  orders: AmazonOrderItem[];
  localSkus: LocalMaterialSku[];
  campaigns: AdCampaignItem[];
  exchangeRates?: ExchangeRateItem[];
  hidePurchaseCost: boolean;
  canExportCsv: boolean;
  isReadOnlyExpired: boolean;
  onNavigateTab: (tab: string) => void;
}

type GroupDimension = 'ASIN' | 'PARENT_ASIN' | 'MSKU' | 'LOCAL_SKU';
type SortKey = 'revenue30d' | 'orders30d' | 'dailySales7d' | 'fbaAvailable' | 'adSpend30d' | 'netProfit';

interface OperationLogEntry {
  id: string;
  targetKey: string;
  date: string;
  category: '调价' | '广告优化' | '补货发货' | '促销活动' | 'Listing优化';
  note: string;
}

interface AggregatedPerfRow {
  rowKey: string;
  primaryLabel: string;
  secondaryLabel: string;
  title: string;
  picUrl?: string;
  marketplace: MarketplaceCode;
  shopName: string;
  currency?: CurrencyCode;
  currencyIcon: string;
  itemCount: number;
  priceOrig: number;
  stars?: number;
  reviewsNum: number;
  todayVolume: number;
  yesterdayVolume: number;
  dailySales7d: number;
  dailySales30d: number;
  orders30d: number;
  revenue30d: number;
  fbaAvailable: number;
  fbaInbound: number;
  fbaReserved: number;
  localAvailable: number;
  coverDays: number;
  replenishStatus: 'STOCKOUT_CERTAIN' | 'URGENT' | 'NORMAL';
  adSpend30d: number;
  adSales30d: number;
  acosPercent: number;
  tacosPercent: number;
  cogsUsd: number;
  netProfitUsd: number;
  netMarginPercent: number;
  childListings: AmazonListingItem[];
}

export const ProductPerformanceView: React.FC<ProductPerformanceViewProps> = ({
  listings,
  orders,
  localSkus,
  campaigns,
  exchangeRates = [],
  hidePurchaseCost,
  canExportCsv,
  isReadOnlyExpired,
  onNavigateTab,
}) => {
  const [dimension, setDimension] = useState<GroupDimension>('ASIN');
  const [searchQuery, setSearchQuery] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('ALL');
  const [shopFilter, setShopFilter] = useState<string>('ALL');
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'STOCKOUT' | 'HIGH_ACOS' | 'LOSS'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('revenue30d');
  const [sortDesc, setSortDesc] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const usdToCnyRate = useMemo(
    () => getUsdToCnyRateFromExchangeRates(exchangeRates, 7.24),
    [exchangeRates]
  );

  // Per-ASIN Operation Logs (Lingxing 运营日志联动产品表现)
  const [opLogs, setOpLogs] = useState<OperationLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem('xcloud_erp_operation_logs_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });
  const [newLogCategory, setNewLogCategory] = useState<OperationLogEntry['category']>('广告优化');
  const [newLogNote, setNewLogNote] = useState('');

  const skuMap = useMemo(() => {
    const m = new Map<string, LocalMaterialSku>();
    for (const s of localSkus) m.set(s.sku, s);
    return m;
  }, [localSkus]);

  const marketplaces = useMemo(
    () => Array.from(new Set(listings.map((l) => l.marketplace))).sort(),
    [listings]
  );
  const shopNames = useMemo(
    () => Array.from(new Set(listings.map((l) => l.shopName))).sort(),
    [listings]
  );

  // Aggregate listings by selected Lingxing dimension (ASIN / Parent ASIN / MSKU / Local SKU)
  const aggregatedRows = useMemo<AggregatedPerfRow[]>(() => {
    const buckets = new Map<string, AmazonListingItem[]>();
    for (const l of listings) {
      if (marketplaceFilter !== 'ALL' && l.marketplace !== marketplaceFilter) continue;
      if (shopFilter !== 'ALL' && l.shopName !== shopFilter) continue;

      let key = l.asin;
      if (dimension === 'PARENT_ASIN') {
        key = `${l.marketplace}::${l.parentAsin || l.asin}`;
      } else if (dimension === 'MSKU') {
        key = `${l.marketplace}::${l.msku || l.asin}`;
      } else if (dimension === 'LOCAL_SKU') {
        key = l.localSkuCode || `UNPAIRED::${l.asin}`;
      } else {
        key = `${l.marketplace}::${l.shopName}::${l.asin}`;
      }

      const arr = buckets.get(key) || [];
      arr.push(l);
      buckets.set(key, arr);
    }

    const rows: AggregatedPerfRow[] = [];
    for (const [key, items] of buckets.entries()) {
      const head = items[0];
      let todayVolume = 0;
      let yesterdayVolume = 0;
      let dailySales7d = 0;
      let dailySales30d = 0;
      let orders30d = 0;
      let revenue30d = 0;
      let fbaAvailable = 0;
      let fbaInbound = 0;
      let fbaReserved = 0;
      let adSpend30d = 0;
      let adSales30d = 0;
      let cogsUsd = 0;
      let netProfitUsd = 0;
      let reviewsNum = 0;
      let weightedStarsSum = 0;
      let starsCount = 0;
      const seenLocalSkus = new Set<string>();
      let localAvailable = 0;

      for (const it of items) {
        const sku = skuMap.get(it.localSkuCode);
        const calc = calculateAsinProfit(it, sku, usdToCnyRate, 0);
        todayVolume += it.todayVolume || 0;
        yesterdayVolume += it.yesterdayVolume || 0;
        dailySales7d += it.dailySales7d || 0;
        dailySales30d += it.dailySales30d || 0;
        orders30d += it.orders30d || 0;
        revenue30d += it.revenue30dUsd || 0;
        fbaAvailable += it.fbaAvailable || 0;
        fbaInbound += it.fbaInbound || 0;
        fbaReserved += it.fbaReserved || 0;
        adSpend30d += it.adSpend30dUsd || 0;
        adSales30d += it.adSales30dUsd || 0;
        cogsUsd += calc.cogsUsd;
        netProfitUsd += calc.netProfitUsd;
        reviewsNum = Math.max(reviewsNum, it.reviewsNum || 0);
        if (it.stars && it.stars > 0) {
          weightedStarsSum += it.stars;
          starsCount += 1;
        }
        if (it.localSkuCode && !seenLocalSkus.has(it.localSkuCode)) {
          seenLocalSkus.add(it.localSkuCode);
          localAvailable += sku?.localAvailableQty || 0;
        }
      }

      const rep = calculateLingxingReplenishment({
        dailySales7d,
        dailySales30d,
        fbaAvailable,
        fbaInbound,
        fbaReserved,
        localAvailable,
        purchaseLeadDays: 10,
        safetyDays: 25,
      });

      const acosPercent = adSales30d > 0 ? (adSpend30d / adSales30d) * 100 : 0;
      const tacosPercent = revenue30d > 0 ? (adSpend30d / revenue30d) * 100 : 0;
      const netMarginPercent = revenue30d > 0 ? (netProfitUsd / revenue30d) * 100 : 0;

      let primaryLabel = head.asin;
      let secondaryLabel = head.parentAsin ? `父体 ${head.parentAsin}` : head.msku;
      if (dimension === 'PARENT_ASIN') {
        primaryLabel = head.parentAsin || head.asin;
        secondaryLabel = `${items.length} 个子变体 · ${head.marketplace}`;
      } else if (dimension === 'MSKU') {
        primaryLabel = head.msku || head.asin;
        secondaryLabel = `ASIN ${head.asin} · ${head.localSkuCode || '未配对本地SKU'}`;
      } else if (dimension === 'LOCAL_SKU') {
        primaryLabel = head.localSkuCode || '未配对本地SKU';
        secondaryLabel = `${items.length} 条在线 Listing · ${head.localName || head.asin}`;
      }

      rows.push({
        rowKey: key,
        primaryLabel,
        secondaryLabel,
        title: head.localName || head.title,
        picUrl: head.smallImageUrl,
        marketplace: head.marketplace,
        shopName: items.length > 1 && dimension === 'LOCAL_SKU' ? `${new Set(items.map((x) => x.shopName)).size} 店铺` : head.shopName,
        currency: head.currency,
        currencyIcon: head.currencyIcon || '$',
        itemCount: items.length,
        priceOrig: head.priceOrig,
        stars: starsCount > 0 ? weightedStarsSum / starsCount : undefined,
        reviewsNum,
        todayVolume,
        yesterdayVolume,
        dailySales7d,
        dailySales30d,
        orders30d,
        revenue30d,
        fbaAvailable,
        fbaInbound,
        fbaReserved,
        localAvailable,
        coverDays: rep.coverDays,
        replenishStatus: rep.status,
        adSpend30d,
        adSales30d,
        acosPercent,
        tacosPercent,
        cogsUsd,
        netProfitUsd,
        netMarginPercent,
        childListings: items,
      });
    }

    const q = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q) {
        const hay = `${r.primaryLabel} ${r.secondaryLabel} ${r.title} ${r.shopName} ${r.childListings.map((c) => `${c.asin} ${c.msku} ${c.localSkuCode}`).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (alertFilter === 'STOCKOUT' && r.replenishStatus === 'NORMAL') return false;
      if (alertFilter === 'HIGH_ACOS' && r.tacosPercent < 20 && r.acosPercent < 35) return false;
      if (alertFilter === 'LOSS' && r.netProfitUsd >= 0) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const av =
        sortKey === 'revenue30d'
          ? a.revenue30d
          : sortKey === 'orders30d'
          ? a.orders30d
          : sortKey === 'dailySales7d'
          ? a.dailySales7d
          : sortKey === 'fbaAvailable'
          ? a.fbaAvailable
          : sortKey === 'adSpend30d'
          ? a.adSpend30d
          : a.netProfitUsd;
      const bv =
        sortKey === 'revenue30d'
          ? b.revenue30d
          : sortKey === 'orders30d'
          ? b.orders30d
          : sortKey === 'dailySales7d'
          ? b.dailySales7d
          : sortKey === 'fbaAvailable'
          ? b.fbaAvailable
          : sortKey === 'adSpend30d'
          ? b.adSpend30d
          : b.netProfitUsd;
      return sortDesc ? bv - av : av - bv;
    });

    return filtered;
  }, [
    listings,
    dimension,
    marketplaceFilter,
    shopFilter,
    searchQuery,
    alertFilter,
    sortKey,
    sortDesc,
    skuMap,
    usdToCnyRate,
  ]);

  const totals = useMemo(() => {
    const rev = aggregatedRows.reduce(
      (s, r) => s + convertAmountToUsd(r.revenue30d, r.currency, r.marketplace, exchangeRates),
      0
    );
    const units = aggregatedRows.reduce((s, r) => s + r.orders30d, 0);
    const fba = aggregatedRows.reduce((s, r) => s + r.fbaAvailable, 0);
    const adSpend = aggregatedRows.reduce(
      (s, r) => s + convertAmountToUsd(r.adSpend30d, r.currency, r.marketplace, exchangeRates),
      0
    );
    const profit = aggregatedRows.reduce(
      (s, r) => s + convertAmountToUsd(r.netProfitUsd, r.currency, r.marketplace, exchangeRates),
      0
    );
    const stockoutCount = aggregatedRows.filter((r) => r.replenishStatus !== 'NORMAL').length;
    return {
      rev,
      units,
      fba,
      adSpend,
      profit,
      tacos: rev > 0 ? (adSpend / rev) * 100 : 0,
      margin: rev > 0 ? (profit / rev) * 100 : 0,
      stockoutCount,
    };
  }, [aggregatedRows, exchangeRates]);

  const perfPagination = useTablePagination(aggregatedRows, 20);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const handleAddOpLog = (targetKey: string) => {
    if (isReadOnlyExpired || !newLogNote.trim()) return;
    const entry: OperationLogEntry = {
      id: `oplog-${Date.now()}`,
      targetKey,
      date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      category: newLogCategory,
      note: newLogNote.trim(),
    };
    const next = [entry, ...opLogs];
    setOpLogs(next);
    setNewLogNote('');
    try {
      localStorage.setItem('xcloud_erp_operation_logs_v1', JSON.stringify(next.slice(0, 200)));
    } catch {
      // ignore storage errors
    }
  };

  const handleExportCsv = () => {
    if (!canExportCsv) return;
    const headers = [
      'Dimension',
      'Key',
      'Marketplace',
      'Shop',
      'Title',
      'Price',
      'Daily7d',
      'Orders30d',
      'Revenue30d',
      'FbaAvailable',
      'FbaInbound',
      'LocalAvailable',
      'CoverDays',
      'AdSpend30d',
      'TACOS%',
      'NetProfit',
      'NetMargin%',
    ];
    const lines = aggregatedRows.map((r) => [
      dimension,
      r.primaryLabel,
      r.marketplace,
      `"${r.shopName.replace(/"/g, '""')}"`,
      `"${r.title.replace(/"/g, '""')}"`,
      r.priceOrig.toFixed(2),
      r.dailySales7d.toFixed(1),
      r.orders30d,
      r.revenue30d.toFixed(2),
      r.fbaAvailable,
      r.fbaInbound,
      r.localAvailable,
      r.coverDays,
      r.adSpend30d.toFixed(2),
      r.tacosPercent.toFixed(1),
      hidePurchaseCost ? 'MASKED' : r.netProfitUsd.toFixed(2),
      hidePurchaseCost ? 'MASKED' : r.netMarginPercent.toFixed(1),
    ]);
    const csv = [headers.join(','), ...lines.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xcloud-product-performance-${dimension.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header & Dimension Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              统计 · 产品表现全维复盘表
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              融合销量、FBA/本地库存、广告投放、毛利核算与运营日志 · 当前聚合 {aggregatedRows.length} 条维度记录（来自 {listings.length} 条 Listing 与 {orders.length} 笔订单）
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
              {(
                [
                  { id: 'ASIN', label: '按 ASIN' },
                  { id: 'PARENT_ASIN', label: '按父 ASIN' },
                  { id: 'MSKU', label: '按 MSKU' },
                  { id: 'LOCAL_SKU', label: '按本地 SKU' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDimension(tab.id)}
                  className={`px-3 py-1.5 rounded whitespace-nowrap shrink-0 transition-colors ${
                    dimension === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!canExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded hover:opacity-90 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出 CSV</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <div className="text-slate-500">30日总销售额 (折USD)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              ${Math.round(totals.rev).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-slate-500">30日总销量 (件)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {totals.units.toLocaleString()} 件
            </div>
          </div>
          <div>
            <div className="text-slate-500">FBA 可售合计</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {totals.fba.toLocaleString()} 件
            </div>
          </div>
          <div>
            <div className="text-slate-500">30日广告费 / TACOS</div>
            <div className="text-lg font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
              ${Math.round(totals.adSpend).toLocaleString()} · {totals.tacos.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-slate-500">核算净利润 / 率</div>
            <div className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
              {hidePurchaseCost
                ? '***'
                : `$${Math.round(totals.profit).toLocaleString()} · ${totals.margin.toFixed(1)}%`}
            </div>
          </div>
          <div>
            <div className="text-slate-500">需补货告警</div>
            <div className="text-lg font-bold font-mono tabular-nums text-red-600 dark:text-red-400 mt-0.5">
              {totals.stockoutCount} 项
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 ASIN / 父ASIN / MSKU / 本地SKU / 品名..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs"
          />
        </div>
        <select
          value={marketplaceFilter}
          onChange={(e) => setMarketplaceFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono"
        >
          <option value="ALL">全部站点 ({marketplaces.length})</option>
          {marketplaces.map((mp) => (
            <option key={mp} value={mp}>
              站点: {mp}
            </option>
          ))}
        </select>
        <select
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
        >
          <option value="ALL">全部店铺 ({shopNames.length})</option>
          {shopNames.map((sn) => (
            <option key={sn} value={sn}>
              {sn}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded">
          {(
            [
              { id: 'ALL', label: '全部' },
              { id: 'STOCKOUT', label: '缺货/加急' },
              { id: 'HIGH_ACOS', label: '高广告占比' },
              { id: 'LOSS', label: '亏损项' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAlertFilter(f.id)}
              className={`px-2.5 py-1 rounded whitespace-nowrap ${
                alertFilter === f.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Super-Wide Product Performance Data Grid */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-3 min-w-[260px]">商品 / 维度标识</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">售价 / 评分</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('dailySales7d')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>今日/昨/7d日均</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('orders30d')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>30d 销量 (件)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('revenue30d')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>30d 销售额</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('fbaAvailable')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>FBA 可售 / 在途 / 本地</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">可售天数 / 补货态</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('adSpend30d')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>广告费 / TACOS</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('netProfit')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>30d 净利 / 净利率</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">明细与日志</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {aggregatedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    当前筛选条件下暂无产品表现数据，可调整筛选条件或前往领星 MCP 同步数据。
                  </td>
                </tr>
              ) : (
                perfPagination.pageItems.map((row) => {
                  const isExpanded = expandedKey === row.rowKey;
                  const rowLogs = opLogs.filter((l) => l.targetKey === row.rowKey);
                  const relatedCampaigns = campaigns.filter(
                    (c) =>
                      c.shopName === row.shopName &&
                      (c.associatedAsin === row.primaryLabel ||
                        row.childListings.some((cl) => cl.asin === c.associatedAsin))
                  );
                  return (
                    <React.Fragment key={row.rowKey}>
                      <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            {row.picUrl ? (
                              <img
                                src={row.picUrl}
                                alt={row.primaryLabel}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-mono text-slate-500 shrink-0">
                                {row.marketplace}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-mono font-semibold text-blue-600 dark:text-blue-400 truncate max-w-[200px]">
                                {row.primaryLabel}
                              </div>
                              <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate max-w-[220px]">
                                {row.title}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono truncate max-w-[220px]">
                                {row.marketplace} · {row.shopName} · {row.secondaryLabel}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {row.currencyIcon}
                            {row.priceOrig.toFixed(2)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {row.stars ? `★${row.stars.toFixed(1)}` : '—'} · {row.reviewsNum}评
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="text-slate-900 dark:text-white">
                            {row.todayVolume} / {row.yesterdayVolume}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            7d日均 {row.dailySales7d.toFixed(1)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {row.orders30d.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {row.currencyIcon}
                          {Math.round(row.revenue30d).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="text-slate-900 dark:text-white">
                            {row.fbaAvailable.toLocaleString()} / +{row.fbaInbound.toLocaleString()}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            本地 {row.localAvailable.toLocaleString()} · 预留 {row.fbaReserved}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <div
                            className={`font-semibold ${
                              row.replenishStatus === 'STOCKOUT_CERTAIN'
                                ? 'text-red-600 dark:text-red-400'
                                : row.replenishStatus === 'URGENT'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {row.coverDays >= 999 ? '999+天' : `${row.coverDays}天`}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {row.replenishStatus === 'STOCKOUT_CERTAIN'
                              ? '必断货'
                              : row.replenishStatus === 'URGENT'
                              ? '加急补货'
                              : '库存正常'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="text-amber-600 dark:text-amber-400">
                            {row.currencyIcon}
                            {Math.round(row.adSpend30d).toLocaleString()}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            TACOS {row.tacosPercent.toFixed(1)}%
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {hidePurchaseCost ? (
                            <span className="text-slate-400">***</span>
                          ) : (
                            <>
                              <div
                                className={`font-semibold ${
                                  row.netProfitUsd >= 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400'
                                }`}
                              >
                                {row.currencyIcon}
                                {Math.round(row.netProfitUsd).toLocaleString()}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {row.netMarginPercent.toFixed(1)}%
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setExpandedKey(isExpanded ? null : row.rowKey)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded"
                          >
                            <span>日志({rowLogs.length})</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Detail & Operation Log Panel */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                          <td colSpan={10} className="p-4">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                              {/* Left: Child Variants / Linked Listings & Quick Actions */}
                              <div className="lg:col-span-6 space-y-2.5">
                                <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
                                  <span>
                                    维度下属 Listing 明细 ({row.childListings.length} 条) · 关联广告活动 {relatedCampaigns.length} 个
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onNavigateTab('fba')}
                                    className="text-blue-600 dark:text-blue-400 hover:underline font-normal"
                                  >
                                    前往 FBA 智能补货 →
                                  </button>
                                </div>
                                <div className="divide-y divide-slate-200 dark:divide-slate-700 text-[11px] font-mono">
                                  {row.childListings.slice(0, 8).map((cl) => (
                                    <div key={cl.id} className="py-1.5 flex items-center justify-between gap-2">
                                      <div className="truncate">
                                        <span className="font-semibold text-slate-900 dark:text-white">
                                          {cl.asin}
                                        </span>
                                        <span className="text-slate-500">
                                          {' '}
                                          · MSKU {cl.msku} · 本地SKU {cl.localSkuCode || '未配对'}
                                        </span>
                                      </div>
                                      <div className="shrink-0 text-slate-600 dark:text-slate-300 tabular-nums">
                                        {cl.currencyIcon || '$'}
                                        {cl.priceOrig.toFixed(2)} · 30d {cl.orders30d}件 · FBA {cl.fbaAvailable}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Right: Lingxing Operation Log (运营日志联动) */}
                              <div className="lg:col-span-6 space-y-2.5">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
                                  <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                  <span>运营日志记录（联动复盘调价 / 广告 / 促销动作）</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <select
                                    value={newLogCategory}
                                    onChange={(e) =>
                                      setNewLogCategory(e.target.value as OperationLogEntry['category'])
                                    }
                                    disabled={isReadOnlyExpired}
                                    className="px-2 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                                  >
                                    <option value="广告优化">广告优化</option>
                                    <option value="调价">调价</option>
                                    <option value="补货发货">补货发货</option>
                                    <option value="促销活动">促销活动</option>
                                    <option value="Listing优化">Listing优化</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={newLogNote}
                                    onChange={(e) => setNewLogNote(e.target.value)}
                                    disabled={isReadOnlyExpired}
                                    placeholder="记录本次运营动作及预期效果，例如：下调泛词竞价 15%..."
                                    className="flex-1 min-w-[180px] px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                                  />
                                  <button
                                    type="button"
                                    disabled={isReadOnlyExpired || !newLogNote.trim()}
                                    onClick={() => handleAddOpLog(row.rowKey)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40 whitespace-nowrap"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>记日志</span>
                                  </button>
                                </div>
                                <div className="divide-y divide-slate-200 dark:divide-slate-700 text-[11px] max-h-36 overflow-y-auto">
                                  {rowLogs.length === 0 ? (
                                    <div className="py-3 text-slate-500">
                                      暂无手工运营日志，可在上方记录调价、调广告或大促动作便于复盘。
                                    </div>
                                  ) : (
                                    rowLogs.map((lg) => (
                                      <div key={lg.id} className="py-1.5 flex items-start justify-between gap-3">
                                        <div>
                                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                                            [{lg.category}]
                                          </span>{' '}
                                          <span className="text-slate-700 dark:text-slate-300">
                                            {lg.note}
                                          </span>
                                        </div>
                                        <span className="font-mono text-slate-400 shrink-0">
                                          {lg.date}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={perfPagination.page}
          pageSize={perfPagination.pageSize}
          totalItems={perfPagination.totalItems}
          totalPages={perfPagination.totalPages}
          onPageChange={perfPagination.setPage}
          onPageSizeChange={perfPagination.setPageSize}
          itemLabel="产品维度记录"
        />
      </div>
    </div>
  );
};
