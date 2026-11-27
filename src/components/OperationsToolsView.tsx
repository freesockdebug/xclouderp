import React, { useMemo, useState } from 'react';
import {
  AmazonListingItem,
  LocalMaterialSku,
  AdCampaignItem,
  PurchaseOrder1688,
  FbaShipmentPlan,
  SettlementPeriodItem,
  MarketplaceCode,
} from '../types/erp';
import {
  calculateLingxingReplenishment,
  calculatePricingProfitTrial,
} from '../lib/erpEngine';
import {
  Bell,
  Sliders,
  CheckSquare,
  ArrowUpRight,
  CheckCircle2,
} from 'lucide-react';
import { TablePagination, useTablePagination } from './TablePagination';

interface OperationsToolsViewProps {
  listings: AmazonListingItem[];
  localSkus: LocalMaterialSku[];
  campaigns: AdCampaignItem[];
  purchaseOrders: PurchaseOrder1688[];
  shipments: FbaShipmentPlan[];
  settlements: SettlementPeriodItem[];
  hidePurchaseCost: boolean;
  isReadOnlyExpired: boolean;
  canApprovePo: boolean;
  canReconcile: boolean;
  onApprovePo: (poId: string) => void;
  onAdvanceShipment: (shipmentId: string) => void;
  onReconcileSettlement: (settlementId: string) => void;
  onNavigateTab: (tab: string) => void;
}

interface SystemAlertItem {
  id: string;
  severity: 'HIGH' | 'MEDIUM';
  category: '断货预警' | '广告超预算/高ACOS' | '采购逾期/待付' | 'BuyBox/高退货';
  title: string;
  detail: string;
  targetTab: string;
}

const MARKETPLACE_FX_PRESETS: Record<MarketplaceCode, { currency: string; icon: string; fxToCny: number }> = {
  US: { currency: 'USD', icon: '$', fxToCny: 7.24 },
  CA: { currency: 'CAD', icon: 'CA$', fxToCny: 5.25 },
  MX: { currency: 'MXN', icon: 'Mex$', fxToCny: 0.36 },
  BR: { currency: 'BRL', icon: 'R$', fxToCny: 1.26 },
  UK: { currency: 'GBP', icon: '£', fxToCny: 9.18 },
  DE: { currency: 'EUR', icon: '€', fxToCny: 7.82 },
  FR: { currency: 'EUR', icon: '€', fxToCny: 7.82 },
  IT: { currency: 'EUR', icon: '€', fxToCny: 7.82 },
  ES: { currency: 'EUR', icon: '€', fxToCny: 7.82 },
  JP: { currency: 'JPY', icon: 'JP¥', fxToCny: 0.048 },
  AU: { currency: 'AUD', icon: 'A$', fxToCny: 4.72 },
};

export const OperationsToolsView: React.FC<OperationsToolsViewProps> = ({
  listings,
  localSkus,
  campaigns,
  purchaseOrders,
  shipments,
  settlements,
  hidePurchaseCost,
  isReadOnlyExpired,
  canApprovePo,
  canReconcile,
  onApprovePo,
  onAdvanceShipment,
  onReconcileSettlement,
  onNavigateTab,
}) => {
  const [subTab, setSubTab] = useState<'alerts' | 'pricing_trial' | 'approval_bench'>('alerts');

  // Alert rule thresholds
  const [coverDayThreshold, setCoverDayThreshold] = useState(21);
  const [acosThreshold, setAcosThreshold] = useState(35);
  const [refundThreshold, setRefundThreshold] = useState(5);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  // Multi-currency Pricing Profit Trial state
  const [trialMp, setTrialMp] = useState<MarketplaceCode>('US');
  const [trialPrice, setTrialPrice] = useState(24.99);
  const [trialFx, setTrialFx] = useState(MARKETPLACE_FX_PRESETS.US.fxToCny);
  const [trialPurchaseCny, setTrialPurchaseCny] = useState(22);
  const [trialHeadFreightCny, setTrialHeadFreightCny] = useState(8.5);
  const [trialFbaFee, setTrialFbaFee] = useState(4.25);
  const [trialRefPct, setTrialRefPct] = useState(15);
  const [trialStorage, setTrialStorage] = useState(0.35);
  const [trialRefundPct, setTrialRefundPct] = useState(3.5);
  const [trialTacosPct, setTrialTacosPct] = useState(14);

  const skuMap = useMemo(() => {
    const m = new Map<string, LocalMaterialSku>();
    for (const s of localSkus) m.set(s.sku, s);
    return m;
  }, [localSkus]);

  // Live Alerts Scanner across all synced Lingxing data
  const alerts = useMemo<SystemAlertItem[]>(() => {
    const list: SystemAlertItem[] = [];

    for (const l of listings) {
      const sku = skuMap.get(l.localSkuCode);
      const rep = calculateLingxingReplenishment({
        dailySales7d: l.dailySales7d,
        dailySales30d: l.dailySales30d,
        fbaAvailable: l.fbaAvailable,
        fbaInbound: l.fbaInbound,
        fbaReserved: l.fbaReserved,
        localAvailable: sku?.localAvailableQty || 0,
        purchaseLeadDays: 10,
        safetyDays: 25,
      });
      if (l.dailySales7d > 0 && rep.coverDays < coverDayThreshold) {
        list.push({
          id: `alert-stock-${l.id}`,
          severity: rep.status === 'STOCKOUT_CERTAIN' ? 'HIGH' : 'MEDIUM',
          category: '断货预警',
          title: `${l.marketplace} · ${l.asin} 预计 ${rep.coverDays} 天后断货`,
          detail: `当前 FBA 可售 ${l.fbaAvailable} / 在途 ${l.fbaInbound} · 7d日均 ${l.dailySales7d.toFixed(1)} · 预计断货日 ${rep.stockoutDate}`,
          targetTab: 'fba',
        });
      }
      if (!l.buyBoxWinner || l.refundRatePercent > refundThreshold) {
        list.push({
          id: `alert-bb-${l.id}`,
          severity: !l.buyBoxWinner ? 'HIGH' : 'MEDIUM',
          category: 'BuyBox/高退货',
          title: `${l.shopName} · ${l.asin} ${!l.buyBoxWinner ? '失去购物车' : '退货率偏高'}`,
          detail: `BuyBox: ${l.buyBoxWinner ? '正常' : '丢失'} · 跟卖 ${l.hijackerCount} · 退货率 ${l.refundRatePercent.toFixed(1)}%`,
          targetTab: 'amazon',
        });
      }
    }

    for (const c of campaigns) {
      const acos = c.acosPercent ?? (c.sales30dUsd > 0 ? (c.spend30dUsd / c.sales30dUsd) * 100 : 0);
      if (c.isOverBudget || (c.spend30dUsd > 0 && acos > acosThreshold)) {
        list.push({
          id: `alert-ad-${c.id}`,
          severity: c.isOverBudget ? 'HIGH' : 'MEDIUM',
          category: '广告超预算/高ACOS',
          title: `${c.marketplace} · ${c.campaignName}`,
          detail: `${c.isOverBudget ? '已超预算 · ' : ''}花费 ${c.currencyIcon || '$'}${c.spend30dUsd.toFixed(1)} · ACOS ${acos.toFixed(1)}%${c.surplusBudgetTip ? ` · ${c.surplusBudgetTip}` : ''}`,
          targetTab: 'ads',
        });
      }
    }

    for (const po of purchaseOrders) {
      if (po.isOverdue || (po.status === 'DRAFT' && po.totalAmountCny > 0)) {
        list.push({
          id: `alert-po-${po.id}`,
          severity: po.isOverdue ? 'HIGH' : 'MEDIUM',
          category: '采购逾期/待付',
          title: `采购单 ${po.poNumber} (${po.supplierName})`,
          detail: `${po.isOverdue ? `已逾期 ${po.overdueDays || 1} 天` : `状态 ${po.statusText || po.status}`} · 数量 ${po.quantity} · 金额 ¥${po.totalAmountCny.toLocaleString()}`,
          targetTab: 'inventory',
        });
      }
    }

    return list
      .filter((a) => !dismissedAlerts.includes(a.id))
      .sort((a, b) => (a.severity === 'HIGH' && b.severity !== 'HIGH' ? -1 : 1));
  }, [listings, campaigns, purchaseOrders, skuMap, coverDayThreshold, acosThreshold, refundThreshold, dismissedAlerts]);

  const alertsPagination = useTablePagination(alerts, 20);

  const trialResult = calculatePricingProfitTrial({
    sellingPriceLocal: trialPrice,
    fxRateToCny: trialFx,
    purchaseCostCny: trialPurchaseCny,
    headFreightCny: trialHeadFreightCny,
    fbaFeeLocal: trialFbaFee,
    referralFeePercent: trialRefPct,
    storageFeeLocal: trialStorage,
    refundRatePercent: trialRefundPct,
    tacosPercent: trialTacosPct,
  });

  const handleLoadFromListing = (listingId: string) => {
    const l = listings.find((x) => x.id === listingId);
    if (!l) return;
    const sku = skuMap.get(l.localSkuCode);
    const preset = MARKETPLACE_FX_PRESETS[l.marketplace] || MARKETPLACE_FX_PRESETS.US;
    setTrialMp(l.marketplace);
    setTrialFx(preset.fxToCny);
    setTrialPrice(l.priceOrig || 19.99);
    setTrialFbaFee(l.fbaFeePerUnitUsd || 3.8);
    setTrialRefPct(Number(((l.referralFeeRate || 0.15) * 100).toFixed(1)));
    setTrialRefundPct(l.refundRatePercent || 3);
    if (sku && !hidePurchaseCost) {
      setTrialPurchaseCny(sku.purchaseCostCny || 15);
      setTrialHeadFreightCny(sku.headFreightPerUnitCny || 6);
    }
  };

  const pendingDraftPos = purchaseOrders.filter((p) => p.status === 'DRAFT');
  const activeWorkingShipments = shipments.filter(
    (s) => s.status === 'WORKING' || s.status === 'SHIPPED'
  );
  const pendingSettlements = settlements.filter((s) => s.reconcileStatus === 'PENDING');
  const preset = MARKETPLACE_FX_PRESETS[trialMp] || MARKETPLACE_FX_PRESETS.US;

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              工具 · 智能预警中心、定价试算与审批工作台
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              自动扫描断货/超预算/采购逾期风险 · 支持 11 站点多币种利润与盈亏平衡 ACOS 试算 · 集中处理待审单据
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
            <button
              type="button"
              onClick={() => setSubTab('alerts')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded whitespace-nowrap ${
                subTab === 'alerts'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>预警中心 ({alerts.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('pricing_trial')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded whitespace-nowrap ${
                subTab === 'pricing_trial'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>多站点定价利润试算</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('approval_bench')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded whitespace-nowrap ${
                subTab === 'approval_bench'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>
                审批工作台 ({pendingDraftPos.length + activeWorkingShipments.length + pendingSettlements.length})
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* SubTab 1: Alerts Center */}
      {subTab === 'alerts' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span>断货预警阈值(天):</span>
                <input
                  type="number"
                  value={coverDayThreshold}
                  onChange={(e) => setCoverDayThreshold(Math.max(1, Number(e.target.value)))}
                  className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </label>
              <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span>高 ACOS 阈值(%):</span>
                <input
                  type="number"
                  value={acosThreshold}
                  onChange={(e) => setAcosThreshold(Math.max(5, Number(e.target.value)))}
                  className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </label>
              <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span>退货率阈值(%):</span>
                <input
                  type="number"
                  value={refundThreshold}
                  onChange={(e) => setRefundThreshold(Math.max(1, Number(e.target.value)))}
                  className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </label>
            </div>
            {dismissedAlerts.length > 0 && (
              <button
                type="button"
                onClick={() => setDismissedAlerts([])}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                恢复已忽略告警 ({dismissedAlerts.length})
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {alerts.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  当前所有监控维度均在安全阈值内，无待处理异常预警。
                </div>
              ) : (
                alertsPagination.pageItems.map((a) => (
                  <div
                    key={a.id}
                    className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold ${
                            a.severity === 'HIGH'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          [{a.severity === 'HIGH' ? '紧急' : '关注'} · {a.category}]
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {a.title}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">{a.detail}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => onNavigateTab(a.targetTab)}
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        <span>前往处理</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedAlerts((prev) => [...prev, a.id])}
                        className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      >
                        标记已读
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <TablePagination
              page={alertsPagination.page}
              pageSize={alertsPagination.pageSize}
              totalItems={alertsPagination.totalItems}
              totalPages={alertsPagination.totalPages}
              onPageChange={alertsPagination.setPage}
              onPageSizeChange={alertsPagination.setPageSize}
              itemLabel="预警记录"
            />
          </div>
        </div>
      )}

      {/* SubTab 2: Multi-Marketplace Pricing Profit Trial */}
      {subTab === 'pricing_trial' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3 text-xs">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              多站点定价、毛利与盈亏平衡 ACOS 试算器
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">从在售 ASIN 一键导入参数:</span>
              <select
                defaultValue=""
                onChange={(e) => handleLoadFromListing(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono max-w-[260px]"
              >
                <option value="">选择真实 Listing 载入...</option>
                {listings.slice(0, 50).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.marketplace} · {l.asin} ({l.currencyIcon || '$'}
                    {l.priceOrig})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-500 mb-1">目标站点</label>
                <select
                  value={trialMp}
                  onChange={(e) => {
                    const nextMp = e.target.value as MarketplaceCode;
                    setTrialMp(nextMp);
                    setTrialFx(MARKETPLACE_FX_PRESETS[nextMp].fxToCny);
                  }}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  {(Object.keys(MARKETPLACE_FX_PRESETS) as MarketplaceCode[]).map((mp) => (
                    <option key={mp} value={mp}>
                      {mp} ({MARKETPLACE_FX_PRESETS[mp].currency})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">
                  汇率 (1 {preset.currency} → CNY)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={trialFx}
                  onChange={(e) => setTrialFx(Math.max(0.001, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">
                  目标售价 ({preset.currency})
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={trialPrice}
                  onChange={(e) => setTrialPrice(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">采购单价 (CNY)</label>
                <input
                  type="number"
                  step="0.5"
                  value={trialPurchaseCny}
                  onChange={(e) => setTrialPurchaseCny(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">单件头程运费 (CNY)</label>
                <input
                  type="number"
                  step="0.5"
                  value={trialHeadFreightCny}
                  onChange={(e) => setTrialHeadFreightCny(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">
                  FBA 配送费 ({preset.currency})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={trialFbaFee}
                  onChange={(e) => setTrialFbaFee(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">平台佣金 (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={trialRefPct}
                  onChange={(e) => setTrialRefPct(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">预计退货率 (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={trialRefundPct}
                  onChange={(e) => setTrialRefundPct(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">目标广告占比 TACOS (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={trialTacosPct}
                  onChange={(e) => setTrialTacosPct(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">
                  单件月仓储费 ({preset.currency})
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={trialStorage}
                  onChange={(e) => setTrialStorage(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
            </div>

            <div className="lg:col-span-5 p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col justify-between font-mono tabular-nums">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">采购 + 头程折算:</span>
                  <span>
                    -{preset.icon}
                    {trialResult.unitCogsLocal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">亚马逊佣金 ({trialRefPct}%):</span>
                  <span>
                    -{preset.icon}
                    {trialResult.referralFeeLocal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">FBA 配送 + 仓储:</span>
                  <span>
                    -{preset.icon}
                    {(trialFbaFee + trialStorage).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">退货损耗估算 ({trialRefundPct}%):</span>
                  <span>
                    -{preset.icon}
                    {trialResult.refundLossLocal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">广告费用预算 ({trialTacosPct}%):</span>
                  <span>
                    -{preset.icon}
                    {trialResult.adCostLocal.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-slate-500 font-sans text-[11px]">单件净毛利</div>
                  <div
                    className={`text-xl font-bold mt-0.5 ${
                      trialResult.unitProfitLocal >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {preset.icon}
                    {trialResult.unitProfitLocal.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    折合 ¥{trialResult.unitProfitCny.toFixed(2)} / 件
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-slate-500 font-sans text-[11px]">净利率 / ROI / 盈亏平衡ACOS</div>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                    {trialResult.netMarginPercent.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ROI {trialResult.roiPercent.toFixed(0)}% · 保本ACOS {trialResult.breakevenAcosPercent.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 3: Approval Workbench */}
      {subTab === 'approval_bench' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-xs">
          {/* Column 1: Draft Purchase Orders */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-900 dark:text-white flex justify-between">
              <span>待审核采购单</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">{pendingDraftPos.length}</span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
              {pendingDraftPos.length === 0 ? (
                <div className="py-8 text-center text-slate-500">暂无待审采购草稿</div>
              ) : (
                pendingDraftPos.map((po) => (
                  <div key={po.id} className="p-3.5 space-y-1.5">
                    <div className="flex justify-between font-mono">
                      <span className="font-semibold text-slate-900 dark:text-white">{po.poNumber}</span>
                      <span>¥{po.totalAmountCny.toLocaleString()}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {po.supplierName} · {po.localSkuCode} × {po.quantity}
                    </div>
                    <button
                      type="button"
                      disabled={!canApprovePo || isReadOnlyExpired}
                      onClick={() => onApprovePo(po.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>通过审批</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: Active FBA Shipments to Advance */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-900 dark:text-white flex justify-between">
              <span>待推进 FBA 货件</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">
                {activeWorkingShipments.length}
              </span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
              {activeWorkingShipments.length === 0 ? (
                <div className="py-8 text-center text-slate-500">暂无待推进货件</div>
              ) : (
                activeWorkingShipments.slice(0, 20).map((sh) => (
                  <div key={sh.id} className="p-3.5 space-y-1.5">
                    <div className="flex justify-between font-mono">
                      <span className="font-semibold text-slate-900 dark:text-white">{sh.shipmentId}</span>
                      <span className="text-slate-500">{sh.status}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {sh.marketplace} · {sh.destinationFulfillmentCenter} · {sh.totalUnitsShipped} 件
                    </div>
                    <button
                      type="button"
                      disabled={isReadOnlyExpired}
                      onClick={() => onAdvanceShipment(sh.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded disabled:opacity-40"
                    >
                      <span>推进物流状态 →</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 3: Pending Financial Settlements */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-900 dark:text-white flex justify-between">
              <span>待财务核对结算周期</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">
                {pendingSettlements.length}
              </span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
              {pendingSettlements.length === 0 ? (
                <div className="py-8 text-center text-slate-500">所有结算周期均已核对完成</div>
              ) : (
                pendingSettlements.slice(0, 20).map((st) => (
                  <div key={st.id} className="p-3.5 space-y-1.5">
                    <div className="flex justify-between font-mono">
                      <span className="font-semibold text-slate-900 dark:text-white">{st.settlementId}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {st.currencyIcon || '$'}
                        {st.netPayoutUsd.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {st.shopName} · {st.periodRange}
                    </div>
                    <button
                      type="button"
                      disabled={!canReconcile || isReadOnlyExpired}
                      onClick={() => onReconcileSettlement(st.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>确认回款对账</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
