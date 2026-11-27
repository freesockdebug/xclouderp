import React, { useState, useEffect, useMemo } from 'react';
import {
  AmazonListingItem,
  LocalMaterialSku,
  SettlementPeriodItem,
  ExchangeRateItem,
  ExtraExpenseItem,
  PurchaseOrder1688,
} from '../types/erp';
import {
  calculateThreeBasisProfit,
  convertAmountToUsd,
  getUsdToCnyRateFromExchangeRates,
  ProfitAccountingBasis,
} from '../lib/erpEngine';
import {
  Calculator,
  Receipt,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Plus,
  BarChart3,
} from 'lucide-react';
import { TablePagination, useTablePagination } from './TablePagination';

interface FinanceAccountingViewProps {
  listings: AmazonListingItem[];
  localSkus: LocalMaterialSku[];
  settlements: SettlementPeriodItem[];
  exchangeRates?: ExchangeRateItem[];
  extraExpenses: ExtraExpenseItem[];
  purchaseOrders: PurchaseOrder1688[];
  isReadOnlyExpired: boolean;
  hidePurchaseCost: boolean;
  canExportCsv: boolean;
  canReconcile: boolean;
  onReconcileSettlement: (settlementId: string) => void;
  onAddExtraExpense: (expense: Omit<ExtraExpenseItem, 'id' | 'tenantId' | 'expenseNo' | 'recordedAt'>) => void;
  onWriteOffPoPayable: (poId: string) => void;
}

export const FinanceAccountingView: React.FC<FinanceAccountingViewProps> = ({
  listings,
  localSkus,
  settlements,
  exchangeRates = [],
  extraExpenses,
  purchaseOrders,
  isReadOnlyExpired,
  hidePurchaseCost,
  canExportCsv,
  canReconcile,
  onReconcileSettlement,
  onAddExtraExpense,
  onWriteOffPoPayable,
}) => {
  const [subTab, setSubTab] = useState<
    'profit_ledger' | 'performance_report' | 'settlements' | 'expenses_ap'
  >('profit_ledger');
  const mcpUsdToCny = useMemo(
    () => getUsdToCnyRateFromExchangeRates(exchangeRates, 7.24),
    [exchangeRates]
  );
  const [usdToCnyRate, setUsdToCnyRate] = useState(mcpUsdToCny);
  const [hasManualFxOverride, setHasManualFxOverride] = useState(false);
  useEffect(() => {
    if (!hasManualFxOverride) {
      setUsdToCnyRate(mcpUsdToCny);
    }
  }, [mcpUsdToCny, hasManualFxOverride]);
  const [profitBasis, setProfitBasis] = useState<ProfitAccountingBasis>('SHIPMENT_BASIS');
  const [includePreSettlement, setIncludePreSettlement] = useState<boolean>(true);
  const [perfDimension, setPerfDimension] = useState<'SHOP' | 'MARKETPLACE' | 'BRAND'>('SHOP');

  // New Extra Expense Form
  const [expCategory, setExpCategory] = useState<ExtraExpenseItem['category']>('OFFSITE_PROMO');
  const [expAsin, setExpAsin] = useState(listings[0]?.asin || '');
  useEffect(() => {
    if (!expAsin && listings[0]?.asin) {
      setExpAsin(listings[0].asin);
    }
  }, [listings, expAsin]);
  const [expAmount, setExpAmount] = useState(280);
  const [expNote, setExpNote] = useState('站外红人评测与折扣推广费用');

  const profitRows = useMemo(() => {
    return listings.map((l) => {
      const sku = localSkus.find((s) => s.sku === l.localSkuCode);
      const allocatedExp = extraExpenses
        .filter((e) => e.targetAsin === l.asin)
        .reduce((acc, e) => acc + e.amountUsd, 0);
      const calc = calculateThreeBasisProfit({
        listing: l,
        localSku: sku,
        usdToCnyRate,
        extraExpenseUsd: allocatedExp,
        basis: profitBasis,
        includePreSettlement,
      });
      return {
        listing: l,
        allocatedExp,
        basisFactor: calc.basisFactor,
        recognizedRevenue: calc.recognizedRevenue,
        referralFeeUsd: calc.referralFee,
        fbaFeeTotalUsd: calc.fbaFeeTotal,
        storageFeeUsd: calc.storageFee,
        adSpendUsd: calc.adSpend,
        refundLossUsd: calc.refundLoss,
        cogsUsd: calc.cogs,
        netProfitUsd: calc.netProfit,
        netMarginPercent: calc.netMarginPercent,
        tacosPercent: calc.tacosPercent,
      };
    });
  }, [listings, localSkus, extraExpenses, usdToCnyRate, profitBasis, includePreSettlement]);

  const profitSummary = useMemo(() => {
    const toUsd = (amt: number, r: (typeof profitRows)[number]) =>
      convertAmountToUsd(amt, r.listing.currency, r.listing.marketplace, exchangeRates);
    const revenue = profitRows.reduce((acc, r) => acc + toUsd(r.recognizedRevenue, r), 0);
    const fees = profitRows.reduce(
      (acc, r) => acc + toUsd(r.referralFeeUsd + r.fbaFeeTotalUsd + r.storageFeeUsd, r),
      0
    );
    const adSpend = profitRows.reduce((acc, r) => acc + toUsd(r.adSpendUsd, r), 0);
    const cogs = profitRows.reduce((acc, r) => acc + toUsd(r.cogsUsd, r), 0);
    const netProfit = profitRows.reduce((acc, r) => acc + toUsd(r.netProfitUsd, r), 0);
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const tacos = revenue > 0 ? (adSpend / revenue) * 100 : 0;
    return { revenue, fees, adSpend, cogs, netProfit, margin, tacos };
  }, [profitRows, exchangeRates]);

  const performanceGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        subtitle: string;
        skuCount: number;
        orders30d: number;
        revenue: number;
        platformFees: number;
        adSpend: number;
        refundLoss: number;
        cogs: number;
        extraExp: number;
        netProfit: number;
        weightedRefundSum: number;
      }
    >();

    for (const r of profitRows) {
      const toUsd = (amt: number) =>
        convertAmountToUsd(amt, r.listing.currency, r.listing.marketplace, exchangeRates);
      const key =
        perfDimension === 'SHOP'
          ? r.listing.shopName || '未命名店铺'
          : perfDimension === 'MARKETPLACE'
          ? r.listing.marketplace
          : r.listing.sellerBrand || '未归类品牌';
      const subtitle =
        perfDimension === 'SHOP'
          ? `${r.listing.marketplace} · 折算 USD (原币 ${r.listing.currency || 'USD'})`
          : perfDimension === 'MARKETPLACE'
          ? `站点汇总 · 折算 USD (原币 ${r.listing.currency || 'USD'})`
          : `品牌汇总 · 折算 USD`;
      const existing = map.get(key) || {
        key,
        subtitle,
        skuCount: 0,
        orders30d: 0,
        revenue: 0,
        platformFees: 0,
        adSpend: 0,
        refundLoss: 0,
        cogs: 0,
        extraExp: 0,
        netProfit: 0,
        weightedRefundSum: 0,
      };
      existing.skuCount += 1;
      existing.orders30d += r.listing.orders30d;
      existing.revenue += toUsd(r.recognizedRevenue);
      existing.platformFees += toUsd(r.referralFeeUsd + r.fbaFeeTotalUsd + r.storageFeeUsd);
      existing.adSpend += toUsd(r.adSpendUsd);
      existing.refundLoss += toUsd(r.refundLossUsd);
      existing.cogs += toUsd(r.cogsUsd);
      existing.extraExp += r.allocatedExp;
      existing.netProfit += toUsd(r.netProfitUsd);
      existing.weightedRefundSum += r.listing.refundRatePercent * Math.max(1, r.listing.orders30d);
      map.set(key, existing);
    }

    return Array.from(map.values())
      .map((g) => ({
        ...g,
        netMarginPercent: g.revenue > 0 ? (g.netProfit / g.revenue) * 100 : 0,
        tacosPercent: g.revenue > 0 ? (g.adSpend / g.revenue) * 100 : 0,
        avgRefundRate: g.orders30d > 0 ? g.weightedRefundSum / g.orders30d : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [profitRows, perfDimension, exchangeRates]);

  const basisLabelMap: Record<ProfitAccountingBasis, { label: string; desc: string }> = {
    SHIPMENT_BASIS: {
      label: '发货利润（推荐）',
      desc: '按已发货实绩口径核算，剔除 Pending/取消单，不因跨月结算回溯已关账历史利润',
    },
    ORDER_BASIS: {
      label: '订单利润（实时估算）',
      desc: '按下单时间口径实时估算毛利，适合运营当日盯盘与活动大促即时损益追踪',
    },
    SETTLEMENT_BASIS: {
      label: '结算利润（财务入账）',
      desc: includePreSettlement
        ? '按亚马逊 Settlement 放款明细 + 预结算递延订单合并核算，贴合财务月结口径'
        : '严格按已放款 Settlement 账单入账核算，剔除未释放预结算递延交易',
    },
  };

  const handleExportCsv = () => {
    if (!canExportCsv) return;
    const headers = [
      'Basis',
      'Marketplace',
      'Shop',
      'ASIN',
      'MSKU',
      'RecognizedRevenue',
      'ReferralFee',
      'FbaFee',
      'AdSpend',
      'ExtraExpense',
      'COGS',
      'NetProfit',
      'NetMarginPct',
    ];
    const lines = profitRows.map((r) => [
      profitBasis,
      r.listing.marketplace,
      r.listing.shopName,
      r.listing.asin,
      r.listing.msku,
      r.recognizedRevenue.toFixed(2),
      r.referralFeeUsd.toFixed(2),
      r.fbaFeeTotalUsd.toFixed(2),
      r.adSpendUsd.toFixed(2),
      r.allocatedExp.toFixed(2),
      hidePurchaseCost ? 'MASKED' : r.cogsUsd.toFixed(2),
      hidePurchaseCost ? 'MASKED' : r.netProfitUsd.toFixed(2),
      hidePurchaseCost ? 'MASKED' : r.netMarginPercent.toFixed(2),
    ]);
    const csvText = [headers.join(','), ...lines.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `xcloud-erp-profit-${profitBasis.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAddExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canReconcile || isReadOnlyExpired || expAmount <= 0) return;
    onAddExtraExpense({
      category: expCategory,
      targetAsin: expAsin,
      amountUsd: expAmount,
      note: expNote.trim() || '运营杂费分摊',
    });
    setExpAmount(100);
  };

  const unpaidPos = useMemo(
    () => purchaseOrders.filter((p) => p.paymentStatus !== 'PAID'),
    [purchaseOrders]
  );

  const profitPagination = useTablePagination(profitRows, 20);
  const perfGroupPagination = useTablePagination(performanceGroups, 20);
  const settlementsPagination = useTablePagination(settlements, 20);
  const expensesPagination = useTablePagination(extraExpenses, 15);
  const unpaidPosPagination = useTablePagination(unpaidPos, 15);

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              财务核算与多维利润中心 (Finance & Settlement Accounting)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              融合领星 MCP 平台账单、本地 1688 采购成本、站外杂费分摊与 Settlement 回款对账，支持一键导出 CSV 核算底表
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
            <button
              onClick={() => setSubTab('profit_ledger')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'profit_ledger'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>7.1 三口径利润底表</span>
            </button>
            <button
              onClick={() => setSubTab('performance_report')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'performance_report'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>7.4 业绩报表（店铺/站点/品牌）</span>
            </button>
            <button
              onClick={() => setSubTab('settlements')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'settlements'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>7.2 Settlement 回款对账</span>
            </button>
            <button
              onClick={() => setSubTab('expenses_ap')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'expenses_ap'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>7.3 杂费分摊与应付核销</span>
            </button>
          </div>
        </div>
      </div>

      {/* Shared 3-Basis Accounting Control Strip for 7.1 & 7.4 */}
      {(subTab === 'profit_ledger' || subTab === 'performance_report') && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 font-medium">核算口径:</span>
              <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                {(
                  [
                    ['SHIPMENT_BASIS', '发货利润'],
                    ['ORDER_BASIS', '订单利润'],
                    ['SETTLEMENT_BASIS', '结算利润'],
                  ] as Array<[ProfitAccountingBasis, string]>
                ).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setProfitBasis(code)}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      profitBasis === code
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {profitBasis === 'SETTLEMENT_BASIS' && (
                <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer ml-1">
                  <input
                    type="checkbox"
                    checked={includePreSettlement}
                    onChange={(e) => setIncludePreSettlement(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700"
                  />
                  <span>计入预结算递延订单</span>
                </label>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">
                  汇率 USD/CNY ({exchangeRates.length > 0 && !hasManualFxOverride ? '领星MCP' : '手动/默认'}):
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={usdToCnyRate}
                  onChange={(e) => {
                    setHasManualFxOverride(true);
                    setUsdToCnyRate(Math.max(1, Number(e.target.value)));
                  }}
                  className="w-20 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              {subTab === 'profit_ledger' && (
                <button
                  onClick={handleExportCsv}
                  disabled={!canExportCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded hover:opacity-90 disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>导出利润底表 CSV</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              当前口径说明 · <strong className="text-slate-800 dark:text-slate-200">{basisLabelMap[profitBasis].label}</strong>：{basisLabelMap[profitBasis].desc}
            </span>
            <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-slate-700 dark:text-slate-200">
              <span>确认营收: ${Math.round(profitSummary.revenue).toLocaleString()}</span>
              <span>广告费: -${Math.round(profitSummary.adSpend).toLocaleString()} (TACOS {profitSummary.tacos.toFixed(1)}%)</span>
              <span>
                净利润:{' '}
                <strong
                  className={
                    hidePurchaseCost
                      ? 'text-slate-400'
                      : profitSummary.netProfit >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }
                >
                  {hidePurchaseCost
                    ? '已脱敏'
                    : `$${Math.round(profitSummary.netProfit).toLocaleString()} (${profitSummary.margin.toFixed(1)}%)`}
                </strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 7.1 Multi-Dim ASIN Profit Ledger */}
      {subTab === 'profit_ledger' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">ASIN / 店铺</th>
                  <th className="py-2.5 px-4 text-right">口径确认营收</th>
                  <th className="py-2.5 px-4 text-right">佣金 + FBA + 仓储</th>
                  <th className="py-2.5 px-4 text-right">广告费 / TACOS</th>
                  <th className="py-2.5 px-4 text-right">站外杂费分摊</th>
                  <th className="py-2.5 px-4 text-right">采购 + 头程 COGS</th>
                  <th className="py-2.5 px-4 text-right">口径净利润 / 净利率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {profitPagination.pageItems.map((r) => {
                  const sym = r.listing.currencyIcon || '$';
                  return (
                    <tr key={r.listing.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                          <span>{r.listing.asin}</span>
                          {r.listing.stars ? (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400">
                              ★{r.listing.stars.toFixed(1)}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {r.listing.marketplace} · {r.listing.shopName}
                          {r.listing.localName ? ` · ${r.listing.localName}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        <div>
                          {sym}
                          {Math.round(r.recognizedRevenue).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          系数 {(r.basisFactor * 100).toFixed(0)}%
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        -{sym}
                        {Math.round(
                          r.referralFeeUsd + r.fbaFeeTotalUsd + r.storageFeeUsd
                        ).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-600 dark:text-amber-400 whitespace-nowrap">
                        <div>
                          -{sym}
                          {Math.round(r.adSpendUsd).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          TACOS {r.tacosPercent.toFixed(1)}%
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        -{sym}
                        {r.allocatedExp.toFixed(0)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {hidePurchaseCost
                          ? '***'
                          : `-${sym}${Math.round(r.cogsUsd).toLocaleString()}`}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {hidePurchaseCost ? (
                          <span className="text-slate-400">已脱敏</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              r.netProfitUsd >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {sym}
                            {Math.round(r.netProfitUsd).toLocaleString()} (
                            {r.netMarginPercent.toFixed(1)}%)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={profitPagination.page}
            pageSize={profitPagination.pageSize}
            totalItems={profitPagination.totalItems}
            totalPages={profitPagination.totalPages}
            onPageChange={profitPagination.setPage}
            onPageSizeChange={profitPagination.setPageSize}
            itemLabel="ASIN 利润记录"
          />
        </div>
      )}

      {/* 7.4 Lingxing-style Performance Report (Shop / Marketplace / Brand) */}
      {subTab === 'performance_report' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                多维业绩报表 — 按{perfDimension === 'SHOP' ? '店铺' : perfDimension === 'MARKETPLACE' ? '站点' : '品牌'}聚合
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                同步当前所选「{basisLabelMap[profitBasis].label}」口径，输出营收贡献、广告占比、退货率与真实净利率
              </p>
            </div>
            <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded">
              {(
                [
                  ['SHOP', '按店铺'],
                  ['MARKETPLACE', '按站点'],
                  ['BRAND', '按品牌'],
                ] as Array<['SHOP' | 'MARKETPLACE' | 'BRAND', string]>
              ).map(([dim, label]) => (
                <button
                  key={dim}
                  type="button"
                  onClick={() => setPerfDimension(dim)}
                  className={`px-2.5 py-1 rounded ${
                    perfDimension === dim
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">
                    {perfDimension === 'SHOP' ? '店铺名称' : perfDimension === 'MARKETPLACE' ? '亚马逊站点' : '品牌名称'}
                  </th>
                  <th className="py-2.5 px-4 text-right">SKU 数 / 30d 销量</th>
                  <th className="py-2.5 px-4 text-right">口径营收</th>
                  <th className="py-2.5 px-4 text-right">平台佣金与物流仓储</th>
                  <th className="py-2.5 px-4 text-right">广告费 / TACOS</th>
                  <th className="py-2.5 px-4 text-right">退货率</th>
                  <th className="py-2.5 px-4 text-right">COGS 成本</th>
                  <th className="py-2.5 px-4 text-right">口径净利润 / 净利率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {performanceGroups.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center font-sans text-slate-500">
                      当前范围暂无业绩聚合记录
                    </td>
                  </tr>
                ) : (
                  perfGroupPagination.pageItems.map((g) => (
                    <tr key={g.key}>
                      <td className="py-3 px-4 font-sans">
                        <div className="font-semibold text-slate-900 dark:text-white">{g.key}</div>
                        <div className="text-[11px] font-mono text-slate-500">{g.subtitle}</div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="text-slate-900 dark:text-white font-semibold">
                          {g.orders30d.toLocaleString()} 件
                        </div>
                        <div className="text-[10px] text-slate-400">{g.skuCount} 个 Listing</div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        ${Math.round(g.revenue).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        -${Math.round(g.platformFees).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-600 dark:text-amber-400 whitespace-nowrap">
                        <div>-${Math.round(g.adSpend).toLocaleString()}</div>
                        <div className="text-[10px] text-slate-400">
                          TACOS {g.tacosPercent.toFixed(1)}%
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={
                            g.avgRefundRate >= 5
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : 'text-slate-600 dark:text-slate-400'
                          }
                        >
                          {g.avgRefundRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {hidePurchaseCost ? '***' : `-$${Math.round(g.cogs).toLocaleString()}`}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {hidePurchaseCost ? (
                          <span className="text-slate-400">已脱敏</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              g.netProfit >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            ${Math.round(g.netProfit).toLocaleString()} ({g.netMarginPercent.toFixed(1)}%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={perfGroupPagination.page}
            pageSize={perfGroupPagination.pageSize}
            totalItems={perfGroupPagination.totalItems}
            totalPages={perfGroupPagination.totalPages}
            onPageChange={perfGroupPagination.setPage}
            onPageSizeChange={perfGroupPagination.setPageSize}
            itemLabel="业绩分组"
          />
        </div>
      )}

      {/* 7.2 Amazon Settlement Reconciliation */}
      {subTab === 'settlements' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              亚马逊 14 天 Settlement 回款账期对账单
            </h3>
            <span className="text-xs font-mono text-slate-500">
              待对账账期: {settlements.filter((s) => s.reconcileStatus === 'PENDING').length} 笔
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">账期编号 / 周期 / 账期状态</th>
                  <th className="py-2.5 px-4">店铺 / 站点 / 账户尾号</th>
                  <th className="py-2.5 px-4 text-right">总销售 (本币)</th>
                  <th className="py-2.5 px-4 text-right">平台费 / 广告 / 仓储 / 退款</th>
                  <th className="py-2.5 px-4 text-right">预留金</th>
                  <th className="py-2.5 px-4 text-right">实际净打款</th>
                  <th className="py-2.5 px-4 text-right">核对状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {settlementsPagination.pageItems.map((st) => {
                  const sym = st.currencyIcon || '$';
                  const totalDeductions =
                    st.amazonFeesUsd +
                    st.adSpendUsd +
                    st.refundsUsd +
                    (st.storageFees ?? 0) +
                    (st.promotionFees ?? 0) +
                    (st.otherFees ?? 0);
                  return (
                    <tr key={st.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                          <span>{st.settlementId}</span>
                          {st.processingStatus && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {st.processingStatus}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">{st.periodRange}</div>
                        {st.fundTransferStatus && (
                          <div className="text-[10px] text-slate-400">
                            转账: {st.fundTransferStatus}
                            {st.reconciliationResultText ? ` · ${st.reconciliationResultText}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-sans whitespace-nowrap">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {st.shopName} ({st.marketplace})
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {st.accountType || 'Standard'}
                          {st.accountTail ? ` · 尾号 ${st.accountTail}` : ''}
                          {st.currency ? ` · ${st.currency}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {sym}
                        {st.grossSalesUsd.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-red-600 dark:text-red-400 whitespace-nowrap">
                        <div>
                          -{sym}
                          {totalDeductions.toLocaleString()}
                        </div>
                        {(st.storageFees || st.promotionFees) ? (
                          <div className="text-[10px] text-slate-400">
                            仓 {sym}
                            {(st.storageFees ?? 0).toFixed(0)} · 促 {sym}
                            {(st.promotionFees ?? 0).toFixed(0)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-600 dark:text-amber-400 whitespace-nowrap">
                        <div>
                          -{sym}
                          {st.reserveHeldUsd.toLocaleString()}
                        </div>
                        {st.previousReserveAmount ? (
                          <div className="text-[10px] text-slate-400">
                            上期释放 +{sym}
                            {st.previousReserveAmount.toLocaleString()}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {sym}
                        {st.netPayoutUsd.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {st.reconcileStatus === 'RECONCILED' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>已核对</span>
                          </span>
                        ) : (
                          <button
                            disabled={!canReconcile || isReadOnlyExpired}
                            onClick={() => onReconcileSettlement(st.id)}
                            className="px-2.5 py-1 font-sans text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
                          >
                            确认入账核销
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={settlementsPagination.page}
            pageSize={settlementsPagination.pageSize}
            totalItems={settlementsPagination.totalItems}
            totalPages={settlementsPagination.totalPages}
            onPageChange={settlementsPagination.setPage}
            onPageSizeChange={settlementsPagination.setPageSize}
            itemLabel="结算账期"
          />
        </div>
      )}

      {/* 7.3 Extra Operating Expenses & Supplier Payable Write-Off */}
      {subTab === 'expenses_ap' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left 7 Cols: Extra Operating Expenses */}
          <div className="lg:col-span-7 space-y-4">
            <form
              onSubmit={handleAddExpenseSubmit}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 text-xs"
            >
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                <span>录入站外推广 / 样品 / 认证杂费 (自动分摊至对应 ASIN 净利润)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExtraExpenseItem['category'])}
                  className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  <option value="OFFSITE_PROMO">站外推广费</option>
                  <option value="SAMPLE_COST">样品评测费</option>
                  <option value="CERTIFICATION">合规认证费</option>
                  <option value="STORAGE_EXTRA">海外仓杂费</option>
                </select>
                <select
                  value={expAsin}
                  onChange={(e) => setExpAsin(e.target.value)}
                  className="px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  {listings.map((l) => (
                    <option key={l.id} value={l.asin}>
                      {l.asin} ({l.marketplace})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={expAmount}
                  onChange={(e) => setExpAmount(Math.max(0, Number(e.target.value)))}
                  placeholder="金额 USD"
                  className="px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
                <button
                  type="submit"
                  disabled={!canReconcile || isReadOnlyExpired}
                  className="px-3 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
                >
                  记账并分摊
                </button>
              </div>
              <input
                type="text"
                value={expNote}
                onChange={(e) => setExpNote(e.target.value)}
                placeholder="费用摘要说明"
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </form>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white">
                已录入杂费分摊明细 ({extraExpenses.length})
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {expensesPagination.pageItems.map((ex) => (
                  <div key={ex.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono font-semibold text-slate-900 dark:text-white">
                        {ex.expenseNo} · {ex.targetAsin} · {ex.category}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {ex.note} · {ex.recordedAt}
                      </div>
                    </div>
                    <div className="font-mono font-semibold text-red-600 dark:text-red-400">
                      -${ex.amountUsd.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              <TablePagination
                page={expensesPagination.page}
                pageSize={expensesPagination.pageSize}
                totalItems={expensesPagination.totalItems}
                totalPages={expensesPagination.totalPages}
                onPageChange={expensesPagination.setPage}
                onPageSizeChange={expensesPagination.setPageSize}
                pageSizeOptions={[15, 30, 50]}
                itemLabel="杂费"
              />
            </div>
          </div>

          {/* Right 5 Cols: Supplier Payable Write-Off */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white">
              待结算供应商采购应付单 ({unpaidPos.length})
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {unpaidPos.length === 0 ? (
                <div className="p-5 text-center text-slate-500">所有采购应付账款已核销完毕</div>
              ) : (
                unpaidPosPagination.pageItems.map((po) => (
                  <div key={po.id} className="px-4 py-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono font-semibold text-slate-900 dark:text-white">
                        {po.poNumber} · {po.paymentStatus}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {po.supplierName} · {po.localSkuCode} ({po.quantity} 件)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold text-slate-900 dark:text-white">
                        {hidePurchaseCost ? '***' : `¥${po.totalAmountCny.toLocaleString()}`}
                      </div>
                      <button
                        disabled={!canReconcile || isReadOnlyExpired}
                        onClick={() => onWriteOffPoPayable(po.id)}
                        className="mt-1 px-2 py-0.5 text-[11px] text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-40"
                      >
                        确认付款核销
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <TablePagination
              page={unpaidPosPagination.page}
              pageSize={unpaidPosPagination.pageSize}
              totalItems={unpaidPosPagination.totalItems}
              totalPages={unpaidPosPagination.totalPages}
              onPageChange={unpaidPosPagination.setPage}
              onPageSizeChange={unpaidPosPagination.setPageSize}
              pageSizeOptions={[15, 30, 50]}
              itemLabel="应付单"
            />
          </div>
        </div>
      )}
    </div>
  );
};
