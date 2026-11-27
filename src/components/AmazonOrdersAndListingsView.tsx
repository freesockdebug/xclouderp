import React, { useEffect, useMemo, useState } from 'react';
import { AmazonListingItem, AmazonOrderItem, ExchangeRateItem } from '../types/erp';
import {
  convertAmountToUsd,
  deduplicateAmazonOrders,
  getOrderEffectiveDateStr,
  getTargetDateRangeForMarketplace,
  isOrderCanceled,
  isOrderReplacement,
  SalesTimeWindow,
  SiteDateMode,
} from '../lib/erpEngine';
import {
  BackendQueryContext,
  BackendPagedQueryResponse,
  queryErpPagedData,
} from '../services/backendDataClient';
import { Tag, ShoppingCart, ShieldAlert, Search, Plus } from 'lucide-react';
import { TablePagination, useTablePagination } from './TablePagination';

interface AmazonOrdersAndListingsViewProps {
  listings: AmazonListingItem[];
  orders: AmazonOrderItem[];
  exchangeRates?: ExchangeRateItem[];
  backendQueryContext?: BackendQueryContext;
  isReadOnlyExpired: boolean;
  canEditPrice: boolean;
  canRefundOrder: boolean;
  onUpdateListingPrice: (listingId: string, newPrice: number) => void;
  onToggleListingStatus: (listingId: string) => void;
  onMarkOrderRefunded: (orderId: string, reason: string, orderRecord?: AmazonOrderItem) => void;
  onCreateMcfOrder: (asin: string, msku: string, shopId: string, shopName: string, marketplace: AmazonOrderItem['marketplace'], qty: number) => void;
}

export const AmazonOrdersAndListingsView: React.FC<AmazonOrdersAndListingsViewProps> = ({
  listings,
  orders,
  exchangeRates = [],
  backendQueryContext,
  isReadOnlyExpired,
  canEditPrice,
  canRefundOrder,
  onUpdateListingPrice,
  onToggleListingStatus,
  onMarkOrderRefunded,
  onCreateMcfOrder,
}) => {
  const [subTab, setSubTab] = useState<'listings' | 'orders' | 'hijack_aging'>('listings');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'FBA' | 'FBM' | 'MCF'>('ALL');
  const [orderDateWindow, setOrderDateWindow] = useState<'ALL' | SalesTimeWindow>('ALL');
  const [orderDateMode, setOrderDateMode] = useState<SiteDateMode>('PER_SITE');
  const [excludeCanceled, setExcludeCanceled] = useState(true);
  const [excludeReplacement, setExcludeReplacement] = useState(true);
  const [editingPriceMap, setEditingPriceMap] = useState<Record<string, string>>({});
  const [mcfListingId, setMcfListingId] = useState(listings[0]?.id || '');
  const [mcfQty, setMcfQty] = useState(10);

  // Real backend paginated query state (POST /api/erp/query)
  const useBackendQuery = Boolean(backendQueryContext?.tenantId);
  const [serverOrderPage, setServerOrderPage] = useState(1);
  const [serverOrderPageSize, setServerOrderPageSize] = useState(20);
  const [serverOrderRes, setServerOrderRes] = useState<BackendPagedQueryResponse<AmazonOrderItem> | null>(null);

  const [serverListingPage, setServerListingPage] = useState(1);
  const [serverListingPageSize, setServerListingPageSize] = useState(20);
  const [serverListingRes, setServerListingRes] = useState<BackendPagedQueryResponse<AmazonListingItem> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setServerOrderPage(1);
  }, [debouncedSearch, channelFilter, orderDateWindow, orderDateMode, excludeCanceled, excludeReplacement]);

  useEffect(() => {
    setServerListingPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!useBackendQuery || subTab !== 'orders' || !backendQueryContext?.tenantId) return;
    const ctrl = new AbortController();
    void queryErpPagedData<AmazonOrderItem>({
      entityType: 'orders',
      tenantId: backendQueryContext.tenantId,
      roleCode: backendQueryContext.roleCode,
      allowedShopIds: backendQueryContext.allowedShopIds,
      page: serverOrderPage,
      pageSize: serverOrderPageSize,
      search: debouncedSearch,
      filters: {
        channel: channelFilter,
        dateWindow: orderDateWindow,
        dateMode: orderDateMode,
        excludeCanceled,
        excludeReplacement,
      },
      signal: ctrl.signal,
    }).then((res) => {
      if (!ctrl.signal.aborted && res.ok) {
        setServerOrderRes(res);
      }
    });
    return () => ctrl.abort();
  }, [
    useBackendQuery,
    subTab,
    backendQueryContext?.tenantId,
    backendQueryContext?.roleCode,
    backendQueryContext?.allowedShopIds,
    backendQueryContext?.queryVersion,
    serverOrderPage,
    serverOrderPageSize,
    debouncedSearch,
    channelFilter,
    orderDateWindow,
    orderDateMode,
    excludeCanceled,
    excludeReplacement,
  ]);

  useEffect(() => {
    if (!useBackendQuery || subTab !== 'listings' || !backendQueryContext?.tenantId) return;
    const ctrl = new AbortController();
    void queryErpPagedData<AmazonListingItem>({
      entityType: 'listings',
      tenantId: backendQueryContext.tenantId,
      roleCode: backendQueryContext.roleCode,
      allowedShopIds: backendQueryContext.allowedShopIds,
      page: serverListingPage,
      pageSize: serverListingPageSize,
      search: debouncedSearch,
      signal: ctrl.signal,
    }).then((res) => {
      if (!ctrl.signal.aborted && res.ok) {
        setServerListingRes(res);
      }
    });
    return () => ctrl.abort();
  }, [
    useBackendQuery,
    subTab,
    backendQueryContext?.tenantId,
    backendQueryContext?.roleCode,
    backendQueryContext?.allowedShopIds,
    backendQueryContext?.queryVersion,
    serverListingPage,
    serverListingPageSize,
    debouncedSearch,
  ]);

  const filteredListings = listings.filter(
    (l) =>
      !searchQuery.trim() ||
      l.asin.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.msku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const dedupedOrders = useMemo(() => deduplicateAmazonOrders(orders), [orders]);

  const {
    filteredOrders,
    excludedCanceledCount,
    excludedReplacementCount,
    filteredTotalUnits,
    filteredRevenueUsd,
  } = useMemo(() => {
    const nowDate = new Date();
    let canceledCnt = 0;
    let replacementCnt = 0;
    let totalUnits = 0;
    let totalRevenueUsd = 0;
    const matched: AmazonOrderItem[] = [];

    for (const o of dedupedOrders) {
      const matchChannel = channelFilter === 'ALL' || o.fulfillmentChannel === channelFilter;
      const matchQuery =
        !searchQuery.trim() ||
        o.amazonOrderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.asin.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.msku.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchChannel || !matchQuery) continue;

      if (orderDateWindow !== 'ALL') {
        const range = getTargetDateRangeForMarketplace(
          o.marketplace,
          orderDateWindow,
          orderDateMode,
          nowDate
        );
        const effDate = getOrderEffectiveDateStr(o, orderDateMode);
        if (!effDate || effDate < range.startDate || effDate > range.endDate) {
          continue;
        }
      }

      const canceled = isOrderCanceled(o);
      if (canceled) {
        canceledCnt += 1;
        if (excludeCanceled) continue;
      }

      const replacement = isOrderReplacement(o);
      if (replacement) {
        replacementCnt += 1;
        if (excludeReplacement) continue;
      }

      matched.push(o);
      totalUnits += Math.max(1, Math.round(o.quantity || 1));
      totalRevenueUsd += convertAmountToUsd(
        o.orderAmountUsd,
        o.currency,
        o.marketplace,
        exchangeRates
      );
    }

    return {
      filteredOrders: matched,
      excludedCanceledCount: canceledCnt,
      excludedReplacementCount: replacementCnt,
      filteredTotalUnits: totalUnits,
      filteredRevenueUsd: Number(totalRevenueUsd.toFixed(2)),
    };
  }, [
    dedupedOrders,
    channelFilter,
    searchQuery,
    orderDateWindow,
    orderDateMode,
    excludeCanceled,
    excludeReplacement,
    exchangeRates,
  ]);

  const listingsPagination = useTablePagination(filteredListings, 20);
  const ordersPagination = useTablePagination(filteredOrders, 20);
  const agingPagination = useTablePagination(listings, 20);

  const displayListings = useBackendQuery && serverListingRes ? serverListingRes.items : listingsPagination.pageItems;
  const displayListingsTotal = useBackendQuery && serverListingRes ? serverListingRes.totalItems : listingsPagination.totalItems;
  const displayListingsPage = useBackendQuery ? serverListingPage : listingsPagination.page;
  const displayListingsPageSize = useBackendQuery ? serverListingPageSize : listingsPagination.pageSize;
  const displayListingsTotalPages = useBackendQuery && serverListingRes ? serverListingRes.totalPages : listingsPagination.totalPages;

  const displayOrders = useBackendQuery && serverOrderRes ? serverOrderRes.items : ordersPagination.pageItems;
  const displayOrdersTotal = useBackendQuery && serverOrderRes ? serverOrderRes.totalItems : ordersPagination.totalItems;
  const displayOrdersPage = useBackendQuery ? serverOrderPage : ordersPagination.page;
  const displayOrdersPageSize = useBackendQuery ? serverOrderPageSize : ordersPagination.pageSize;
  const displayOrdersTotalPages = useBackendQuery && serverOrderRes ? serverOrderRes.totalPages : ordersPagination.totalPages;
  const displayOrderUnits = useBackendQuery && serverOrderRes?.summary?.totalUnits !== undefined
    ? serverOrderRes.summary.totalUnits
    : filteredTotalUnits;
  const displayOrderRevenueUsd = useBackendQuery && serverOrderRes?.summary?.revenueUsd !== undefined
    ? serverOrderRes.summary.revenueUsd
    : filteredRevenueUsd;
  const displayExcludedCanceled = useBackendQuery && serverOrderRes?.summary?.excludedCanceledCount !== undefined
    ? serverOrderRes.summary.excludedCanceledCount
    : excludedCanceledCount;
  const displayExcludedReplacement = useBackendQuery && serverOrderRes?.summary?.excludedReplacementCount !== undefined
    ? serverOrderRes.summary.excludedReplacementCount
    : excludedReplacementCount;

  const handleSavePrice = (listing: AmazonListingItem) => {
    const raw = editingPriceMap[listing.id];
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onUpdateListingPrice(listing.id, parsed);
    setEditingPriceMap((prev) => {
      const next = { ...prev };
      delete next[listing.id];
      return next;
    });
  };

  const handleCreateMcf = (e: React.FormEvent) => {
    e.preventDefault();
    const target = listings.find((l) => l.id === mcfListingId) || listings[0];
    if (!target || mcfQty <= 0) return;
    onCreateMcfOrder(target.asin, target.msku, target.shopId, target.shopName, target.marketplace, mcfQty);
  };

  const writeBlocked = isReadOnlyExpired;

  return (
    <div className="space-y-5">
      {/* Sub-Page Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              亚马逊商品与订单中心 (已按当前成员店铺权限自动过滤 · 可见 {listings.length} 个 Listing)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              涵盖在售商品在线调价、FBA/FBM/MCF 多渠道订单履约与退款标记、跟卖 BuyBox 预警及 0-90 / 91-180 / 181+ 天库龄健康分析
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
            <button
              onClick={() => setSubTab('listings')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'listings'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>2.1 在售 Listing 与调价</span>
            </button>
            <button
              onClick={() => setSubTab('orders')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'orders'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>2.2 亚马逊订单中心</span>
            </button>
            <button
              onClick={() => setSubTab('hijack_aging')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'hijack_aging'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>2.3 跟卖监控与 FBA 库龄</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Tab 2.1: Listings Management */}
      {subTab === 'listings' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索 ASIN / MSKU / 商品标题..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <span className="text-xs font-mono text-slate-500">
              调价权限: {canEditPrice && !writeBlocked ? 'ALLOW (amazon:price_edit)' : 'READ_ONLY'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">站点 / 店铺</th>
                  <th className="py-2.5 px-4">商品 / ASIN / 父体变体</th>
                  <th className="py-2.5 px-4">评分 / BSR / 本地SKU</th>
                  <th className="py-2.5 px-4 text-right">售价 (支持调价)</th>
                  <th className="py-2.5 px-4 text-right">今/昨 / 7d日均 / 30d</th>
                  <th className="py-2.5 px-4 text-right">FBA 可售 / 在途 / 预留</th>
                  <th className="py-2.5 px-4">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {displayListings.map((item) => {
                  const draftVal = editingPriceMap[item.id];
                  const currSym = item.currencyIcon || item.currency;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {item.marketplace} · {item.shopName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {item.fulfillmentChannelType || 'FBA'}
                          {item.sellerBrand ? ` · ${item.sellerBrand}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-start gap-2.5 max-w-sm">
                          {item.smallImageUrl ? (
                            <img
                              src={item.smallImageUrl}
                              alt={item.asin}
                              loading="lazy"
                              className="w-10 h-10 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-mono text-slate-400">
                              IMG
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="font-semibold text-blue-600 dark:text-blue-400">
                                {item.asin}
                              </span>
                              {item.parentAsin && item.parentAsin !== item.asin && (
                                <span className="text-[10px] text-slate-400">
                                  父:{item.parentAsin}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 truncate">
                              {item.msku}
                            </div>
                            <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate max-w-[240px]">
                              {item.title}
                            </div>
                            {item.variantAttrs && item.variantAttrs.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {item.variantAttrs.slice(0, 3).map((v, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono"
                                  >
                                    {v.attrName}: {v.attrValue}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        <div className="text-slate-900 dark:text-white">
                          {item.stars !== undefined && item.stars > 0
                            ? `★ ${item.stars.toFixed(1)} (${item.reviewsNum ?? 0})`
                            : '暂无评分'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.categoryRank ? `BSR #${item.categoryRank.toLocaleString()}` : 'BSR —'}
                          {item.smallCategoryRank ? ` · 小类 #${item.smallCategoryRank}` : ''}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[160px]">
                          {item.localSkuCode ? `SKU: ${item.localSkuCode}` : '未配对本地SKU'}
                          {item.localName ? ` · ${item.localName}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        {canEditPrice && !writeBlocked ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-slate-400">{currSym}</span>
                            <input
                              type="number"
                              step="0.01"
                              value={draftVal !== undefined ? draftVal : item.priceOrig}
                              onChange={(e) =>
                                setEditingPriceMap((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              className="w-20 px-2 py-1 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                            />
                            {draftVal !== undefined && (
                              <button
                                onClick={() => handleSavePrice(item)}
                                className="px-2 py-1 text-[11px] text-white bg-blue-600 hover:bg-blue-700 rounded"
                              >
                                应用
                              </button>
                            )}
                          </div>
                        ) : (
                          <span>
                            {currSym} {item.priceOrig.toFixed(2)}
                          </span>
                        )}
                        {(item.listPrice || item.b2bPrice) && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.listPrice ? `划线 ${currSym}${item.listPrice.toFixed(2)}` : ''}
                            {item.listPrice && item.b2bPrice ? ' · ' : ''}
                            {item.b2bPrice ? `B2B ${currSym}${item.b2bPrice.toFixed(2)}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div>
                          {item.dailySales7d.toFixed(1)} / {item.orders30d}
                        </div>
                        {(item.todayVolume !== undefined || item.yesterdayVolume !== undefined) && (
                          <div className="text-[11px] text-slate-500">
                            今 {item.todayVolume ?? 0} · 昨 {item.yesterdayVolume ?? 0}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {item.fbaAvailable}
                          </span>{' '}
                          / {item.fbaInbound} / {item.fbaReserved}
                        </div>
                        {(item.afnUnsellableQty || item.reservedFcTransfersQty) ? (
                          <div className="text-[10px] text-slate-500">
                            不可售 {item.afnUnsellableQty ?? 0} · 调拨 {item.reservedFcTransfersQty ?? 0}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        <button
                          disabled={!canEditPrice || writeBlocked}
                          onClick={() => onToggleListingStatus(item.id)}
                          className={`text-[11px] font-semibold disabled:opacity-60 ${
                            item.listingStatus === 'ACTIVE'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {item.statusText || item.listingStatus}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={displayListingsPage}
            pageSize={displayListingsPageSize}
            totalItems={displayListingsTotal}
            totalPages={displayListingsTotalPages}
            onPageChange={(nextPage) =>
              useBackendQuery ? setServerListingPage(nextPage) : listingsPagination.setPage(nextPage)
            }
            onPageSizeChange={(nextSize) => {
              if (useBackendQuery) {
                setServerListingPageSize(nextSize);
                setServerListingPage(1);
              } else {
                listingsPagination.setPageSize(nextSize);
              }
            }}
            itemLabel="Listing"
          />
        </div>
      )}

      {/* Sub-Tab 2.2: Amazon Orders Center */}
      {subTab === 'orders' && (
        <div className="space-y-5">
          {canRefundOrder && !writeBlocked && listings.length > 0 && (
            <form
              onSubmit={handleCreateMcf}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-wrap items-center gap-3 text-xs"
            >
              <span className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                <span>快速创建多渠道配送 (MCF) 订单:</span>
              </span>
              <select
                value={mcfListingId}
                onChange={(e) => setMcfListingId(e.target.value)}
                className="px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.marketplace} · {l.asin} ({l.msku})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={mcfQty}
                onChange={(e) => setMcfQty(Math.max(1, Number(e.target.value)))}
                className="w-20 px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              <button
                type="submit"
                className="px-3 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
              >
                生成 MCF 履约单
              </button>
            </form>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded text-xs">
                  {(
                    [
                      { id: 'ALL', label: '全部' },
                      { id: 'TODAY', label: '今日' },
                      { id: 'YESTERDAY', label: '昨日' },
                      { id: '7D', label: '近7天' },
                      { id: '30D', label: '近30天' },
                    ] as const
                  ).map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setOrderDateWindow(w.id)}
                      className={`px-2.5 py-1 rounded ${
                        orderDateWindow === w.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono">
                  {(['ALL', 'FBA', 'FBM', 'MCF'] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannelFilter(ch)}
                      className={`px-2.5 py-1 rounded ${
                        channelFilter === ch
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
                <select
                  value={orderDateMode}
                  onChange={(e) => setOrderDateMode(e.target.value as SiteDateMode)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  <option value="PER_SITE">各站点当地日期</option>
                  <option value="LATEST_SITE">统一美西日期</option>
                  <option value="BEIJING">统一北京时间</option>
                </select>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={excludeCanceled}
                    onChange={(e) => setExcludeCanceled(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>排除取消单</span>
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={excludeReplacement}
                    onChange={(e) => setExcludeReplacement(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>排除换货单</span>
                </label>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                {excludeCanceled ? '有效订单量' : '订单量'}{' '}
                <strong className="text-slate-900 dark:text-white">{displayOrdersTotal.toLocaleString()}</strong> 单 · 总销量{' '}
                <strong className="text-blue-600 dark:text-blue-400">{displayOrderUnits.toLocaleString()}</strong> 件 · 折 USD{' '}
                <strong className="text-slate-900 dark:text-white">
                  ${displayOrderRevenueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
                {displayExcludedCanceled > 0 ? ` · 取消 ${displayExcludedCanceled}` : ''}
                {displayExcludedReplacement > 0 ? ` · 换货 ${displayExcludedReplacement}` : ''}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">亚马逊订单号 / 下单时间 / 标记</th>
                    <th className="py-2.5 px-4">渠道 / 店铺</th>
                    <th className="py-2.5 px-4">商品 / ASIN / MSKU</th>
                    <th className="py-2.5 px-4 text-right">数量</th>
                    <th className="py-2.5 px-4 text-right">订单金额 (本币) / 费用</th>
                    <th className="py-2.5 px-4">状态与退货</th>
                    <th className="py-2.5 px-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {displayOrders.map((ord) => {
                    const currSym = ord.currencyIcon || '$';
                    return (
                      <tr key={ord.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono">
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            <span>{ord.amazonOrderId}</span>
                            {ord.isPrime && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                Prime
                              </span>
                            )}
                            {ord.isBusinessOrder && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                                B2B
                              </span>
                            )}
                            {ord.isPromotion && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                促销
                              </span>
                            )}
                            {ord.isReplacementOrder && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                                换货
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {ord.purchaseDate} · {ord.buyerRegion}
                          </div>
                          {ord.latestShipDate && (
                            <div className="text-[10px] text-slate-400">
                              最晚发货: {ord.latestShipDate.slice(0, 16)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {ord.fulfillmentChannel} · {ord.marketplace}
                          </div>
                          <div className="text-[11px] text-slate-500">{ord.shopName}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-start gap-2 max-w-xs">
                            {ord.picUrl && (
                              <img
                                src={ord.picUrl}
                                alt={ord.asin}
                                loading="lazy"
                                className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
                              />
                            )}
                            <div className="min-w-0 font-mono">
                              <div className="text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                                <span>{ord.asin}</span>
                                {ord.items && ord.items.length > 1 && (
                                  <span className="text-[10px] text-slate-500">
                                    ({ord.items.length} 行商品)
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {ord.msku}
                                {ord.localSkuCode ? ` · ${ord.localSkuCode}` : ''}
                              </div>
                              {ord.productTitle && (
                                <div className="text-[11px] font-sans text-slate-600 dark:text-slate-400 truncate max-w-[200px]">
                                  {ord.productTitle}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{ord.quantity}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {currSym}
                            {ord.orderAmountUsd.toFixed(2)}
                          </div>
                          {ord.amazonFeeUsd > 0 && (
                            <div className="text-[11px] text-slate-500">
                              费 -{currSym}
                              {ord.amazonFeeUsd.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-mono font-semibold ${
                              ord.orderStatus === 'SHIPPED'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : ord.orderStatus === 'CANCELED'
                                ? 'text-slate-400 dark:text-slate-500 line-through'
                                : ord.orderStatus === 'REFUNDED'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {ord.rawOrderStatus || ord.orderStatus}
                          </span>
                          {ord.returnReason && (
                            <div className="text-[11px] text-red-500">{ord.returnReason}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {ord.orderStatus !== 'REFUNDED' && ord.orderStatus !== 'CANCELED' && canRefundOrder && !writeBlocked ? (
                            <button
                              onClick={() => onMarkOrderRefunded(ord.id, '客户退货退款登记', ord)}
                              className="px-2.5 py-1 text-[11px] text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              标记退款
                            </button>
                          ) : (
                            <span className="text-[11px] font-mono text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={displayOrdersPage}
              pageSize={displayOrdersPageSize}
              totalItems={displayOrdersTotal}
              totalPages={displayOrdersTotalPages}
              onPageChange={(nextPage) =>
                useBackendQuery ? setServerOrderPage(nextPage) : ordersPagination.setPage(nextPage)
              }
              onPageSizeChange={(nextSize) => {
                if (useBackendQuery) {
                  setServerOrderPageSize(nextSize);
                  setServerOrderPage(1);
                } else {
                  ordersPagination.setPageSize(nextSize);
                }
              }}
              itemLabel="订单"
            />
          </div>
        </div>
      )}

      {/* Sub-Tab 2.3: Hijack/BuyBox Monitor & FBA Aging */}
      {subTab === 'hijack_aging' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                跟卖 BuyBox 竞争监控与 FBA 库龄阶梯预警 (0-90 / 91-180 / 181+ 天)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                及时识别丢失购物车或存在跟卖者的 ASIN，并对超过 180 天的冗余库存提前规划站外清仓
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">ASIN / 站点 / 上架日</th>
                  <th className="py-2.5 px-4">BuyBox / 评分 / BSR</th>
                  <th className="py-2.5 px-4 text-right">0–90 天</th>
                  <th className="py-2.5 px-4 text-right">91–180 天</th>
                  <th className="py-2.5 px-4 text-right">181+ 天</th>
                  <th className="py-2.5 px-4 text-right">不可售 / 调拨 / 处理中</th>
                  <th className="py-2.5 px-4">运营建议</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {agingPagination.pageItems.map((item) => {
                  const hasRisk = !item.buyBoxWinner || item.hijackerCount > 0;
                  return (
                    <tr key={item.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {item.asin} · {item.marketplace}
                        </div>
                        <div className="text-[11px] text-slate-500 font-sans truncate max-w-[200px]">
                          {item.title}
                        </div>
                        {item.openDate && (
                          <div className="text-[10px] text-slate-400">上架: {item.openDate}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div
                          className={
                            hasRisk
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          }
                        >
                          {item.buyBoxWinner ? '拥有 BuyBox' : '丢失 BuyBox'} · 跟卖 {item.hijackerCount} 家
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.stars ? `★ ${item.stars.toFixed(1)} (${item.reviewsNum ?? 0})` : '暂无评'}
                          {item.categoryRank ? ` · BSR #${item.categoryRank.toLocaleString()}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">{item.aging0To90Qty}</td>
                      <td className="py-3 px-4 text-right text-amber-600 dark:text-amber-400">
                        {item.aging91To180Qty}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-red-600 dark:text-red-400">
                        {item.aging181PlusQty}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">
                        {item.afnUnsellableQty ?? 0} / {item.reservedFcTransfersQty ?? 0} /{' '}
                        {item.reservedFcProcessingQty ?? 0}
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-600 dark:text-slate-400">
                        {hasRisk
                          ? '立即核查跟卖并启动品牌透明计划投诉'
                          : item.aging181PlusQty > 20
                          ? '建议创建 Outlet 促销清理超龄库存'
                          : (item.afnUnsellableQty ?? 0) > 0
                          ? '存在不可售库存，建议检查移除订单'
                          : '库龄与购物车健康'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={agingPagination.page}
            pageSize={agingPagination.pageSize}
            totalItems={agingPagination.totalItems}
            totalPages={agingPagination.totalPages}
            onPageChange={agingPagination.setPage}
            onPageSizeChange={agingPagination.setPageSize}
            itemLabel="ASIN"
          />
        </div>
      )}
    </div>
  );
};
