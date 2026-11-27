import React, { useEffect, useState } from 'react';
import { AdCampaignItem, AdSearchTermItem } from '../types/erp';
import {
  BackendPagedQueryResponse,
  BackendQueryContext,
  queryErpPagedData,
} from '../services/backendDataClient';
import { Megaphone, FilterX, Clock } from 'lucide-react';
import { TablePagination, useTablePagination } from './TablePagination';

interface AdvertisingDaypartingViewProps {
  campaigns: AdCampaignItem[];
  searchTerms: AdSearchTermItem[];
  backendQueryContext?: BackendQueryContext;
  isReadOnlyExpired: boolean;
  canEditBid: boolean;
  canNegateTerm: boolean;
  onToggleCampaignStatus: (id: string) => void;
  onToggleDayparting: (id: string) => void;
  onUpdateCampaignBid: (
    id: string,
    newBudget: number,
    newBid: number,
    peakMult: number,
    offPeakMult: number
  ) => void;
  onNegateSearchTerm: (
    termId: string,
    mode: 'NEGATIVE_EXACT' | 'NEGATIVE_PHRASE',
    termRecord?: AdSearchTermItem
  ) => void;
}

export const AdvertisingDaypartingView: React.FC<AdvertisingDaypartingViewProps> = ({
  campaigns,
  searchTerms,
  backendQueryContext,
  isReadOnlyExpired,
  canEditBid,
  canNegateTerm,
  onToggleCampaignStatus,
  onToggleDayparting,
  onUpdateCampaignBid,
  onNegateSearchTerm,
}) => {
  const [subTab, setSubTab] = useState<'campaigns' | 'search_terms' | 'dayparting'>('campaigns');
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id || '');
  const useBackendQuery = Boolean(backendQueryContext?.tenantId);
  const [serverTermPage, setServerTermPage] = useState(1);
  const [serverTermPageSize, setServerTermPageSize] = useState(20);
  const [serverTermRes, setServerTermRes] =
    useState<BackendPagedQueryResponse<AdSearchTermItem> | null>(null);

  useEffect(() => {
    if (!useBackendQuery || subTab !== 'search_terms' || !backendQueryContext?.tenantId) return;
    const ctrl = new AbortController();
    void queryErpPagedData<AdSearchTermItem>({
      entityType: 'searchTerms',
      tenantId: backendQueryContext.tenantId,
      roleCode: backendQueryContext.roleCode,
      allowedShopIds: backendQueryContext.allowedShopIds,
      page: serverTermPage,
      pageSize: serverTermPageSize,
      signal: ctrl.signal,
    }).then((res) => {
      if (!ctrl.signal.aborted && res.ok) {
        setServerTermRes(res);
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
    serverTermPage,
    serverTermPageSize,
  ]);

  const activeCamp =
    campaigns.find((c) => c.id === selectedCampaignId) || campaigns[0];

  const campaignsPagination = useTablePagination(campaigns, 20);
  const searchTermsPagination = useTablePagination(searchTerms, 20);
  const displaySearchTerms =
    useBackendQuery && serverTermRes ? serverTermRes.items : searchTermsPagination.pageItems;
  const displayTermTotal =
    useBackendQuery && serverTermRes ? serverTermRes.totalItems : searchTermsPagination.totalItems;
  const displayTermPage = useBackendQuery ? serverTermPage : searchTermsPagination.page;
  const displayTermPageSize = useBackendQuery ? serverTermPageSize : searchTermsPagination.pageSize;
  const displayTermTotalPages =
    useBackendQuery && serverTermRes ? serverTermRes.totalPages : searchTermsPagination.totalPages;

  const [editBudget, setEditBudget] = useState(activeCamp?.dailyBudgetUsd || 100);
  const [editBid, setEditBid] = useState(activeCamp?.defaultBidUsd || 1.2);
  const [editPeakMult, setEditPeakMult] = useState(activeCamp?.peakBidMultiplierPercent || 20);
  const [editOffPeakMult, setEditOffPeakMult] = useState(
    activeCamp?.offPeakBidMultiplierPercent || -35
  );

  const handleSelectCampaign = (camp: AdCampaignItem) => {
    setSelectedCampaignId(camp.id);
    setEditBudget(camp.dailyBudgetUsd);
    setEditBid(camp.defaultBidUsd);
    setEditPeakMult(camp.peakBidMultiplierPercent);
    setEditOffPeakMult(camp.offPeakBidMultiplierPercent);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              亚马逊广告报表与自动化调价中心 (SP / SB / SD)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              支持广告活动启停、搜索词高花费零转化一键否词 (精准/词组) 以及 24 小时分时竞价乘数矩阵
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
            <button
              onClick={() => setSubTab('campaigns')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'campaigns'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>6.1 广告活动管理</span>
            </button>
            <button
              onClick={() => setSubTab('search_terms')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'search_terms'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>6.2 搜索词否词台</span>
            </button>
            <button
              onClick={() => setSubTab('dayparting')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'dayparting'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>6.3 24h 分时调价矩阵</span>
            </button>
          </div>
        </div>
      </div>

      {/* 6.1 Campaigns Table */}
      {subTab === 'campaigns' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">广告活动 / 站点 / 投放策略</th>
                  <th className="py-2.5 px-4 text-right">日预算 / 建议·余量</th>
                  <th className="py-2.5 px-4 text-right">花费 / 销售额 (本币)</th>
                  <th className="py-2.5 px-4 text-right">CTR / CPC / CVR</th>
                  <th className="py-2.5 px-4 text-right">ACOS / ROAS</th>
                  <th className="py-2.5 px-4">分时策略</th>
                  <th className="py-2.5 px-4 text-right">状态开关</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {campaignsPagination.pageItems.map((c) => {
                  const sym = c.currencyIcon || '$';
                  const acos =
                    c.acosPercent !== undefined
                      ? c.acosPercent
                      : c.sales30dUsd > 0
                      ? (c.spend30dUsd / c.sales30dUsd) * 100
                      : 0;
                  const roas =
                    c.roasValue !== undefined
                      ? c.roasValue
                      : c.spend30dUsd > 0
                      ? c.sales30dUsd / c.spend30dUsd
                      : 0;
                  const ctr =
                    c.ctrPercent !== undefined
                      ? c.ctrPercent
                      : c.impressions30d > 0
                      ? (c.clicks30d / c.impressions30d) * 100
                      : 0;
                  const cpc =
                    c.cpcAmount !== undefined
                      ? c.cpcAmount
                      : c.clicks30d > 0
                      ? c.spend30dUsd / c.clicks30d
                      : 0;
                  const cvr =
                    c.cvrPercent !== undefined
                      ? c.cvrPercent
                      : c.clicks30d > 0
                      ? (c.orders30d / c.clicks30d) * 100
                      : 0;
                  return (
                    <tr key={c.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                          <span>
                            [{c.adType}] {c.campaignName}
                          </span>
                          {c.isOverBudget && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-sans">
                              超预算
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {c.marketplace} · {c.shopName}
                          {c.targetingType ? ` · ${c.targetingType}` : ''}
                          {c.biddingType ? ` · ${c.biddingType}` : ''}
                        </div>
                        {(c.portfolioName || c.placementTopPercent) && (
                          <div className="text-[10px] text-slate-400">
                            {c.portfolioName ? `组合: ${c.portfolioName}` : ''}
                            {c.placementTopPercent ? ` · 首页顶部 +${c.placementTopPercent}%` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div>
                          {sym}
                          {c.dailyBudgetUsd.toLocaleString()}
                        </div>
                        {(c.suggestionBudget || c.surplusBudgetTip) && (
                          <div className="text-[10px] font-sans text-slate-400">
                            {c.suggestionBudget ? `建议 ${sym}${c.suggestionBudget}` : ''}
                            {c.surplusBudgetTip ? ` · ${c.surplusBudgetTip}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div>
                          {sym}
                          {c.spend30dUsd.toLocaleString()} / {sym}
                          {c.sales30dUsd.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          单 {c.orders30d}
                          {c.directOrders !== undefined
                            ? ` (直${c.directOrders}/间${c.indirectOrders ?? 0})`
                            : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap text-slate-600 dark:text-slate-300">
                        <div>
                          {ctr.toFixed(2)}% / {sym}
                          {cpc.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          CVR {cvr.toFixed(1)}% · 点 {c.clicks30d}
                        </div>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold whitespace-nowrap ${
                          acos > 25
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {acos.toFixed(1)}% · {roas.toFixed(2)}x
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          disabled={!canEditBid || isReadOnlyExpired}
                          onClick={() => onToggleDayparting(c.id)}
                          className={`text-[11px] font-semibold disabled:opacity-40 ${
                            c.daypartingEnabled
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {c.daypartingEnabled ? '分时已开启' : '未启用分时'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          disabled={!canEditBid || isReadOnlyExpired}
                          onClick={() => onToggleCampaignStatus(c.id)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded border disabled:opacity-40 ${
                            c.status === 'ENABLED'
                              ? 'text-emerald-600 border-emerald-200 dark:border-emerald-900'
                              : 'text-slate-500 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {c.status}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={campaignsPagination.page}
            pageSize={campaignsPagination.pageSize}
            totalItems={campaignsPagination.totalItems}
            totalPages={campaignsPagination.totalPages}
            onPageChange={campaignsPagination.setPage}
            onPageSizeChange={campaignsPagination.setPageSize}
            itemLabel="广告活动"
          />
        </div>
      )}

      {/* 6.2 Search Terms & Negative Keyword Workbench */}
      {subTab === 'search_terms' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              客户搜索词报表与一键否定词工作台 (权限: ads:negate_term)
            </h3>
            <span className="text-xs font-mono text-slate-500">
              高浪费词自动标红提示
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">搜索词 / 投放方式</th>
                  <th className="py-2.5 px-4">广告活动 / 广告组</th>
                  <th className="py-2.5 px-4 text-right">点击 / 订单 / CVR</th>
                  <th className="py-2.5 px-4 text-right">花费 / 销售额 (本币)</th>
                  <th className="py-2.5 px-4 text-right">CPC / ACOS / ROAS</th>
                  <th className="py-2.5 px-4 text-right">一键否词操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {displaySearchTerms.map((st) => {
                  const sym = st.currencyIcon || '$';
                  const isWaste = st.orders === 0 && st.spendUsd > 50;
                  const cpc =
                    st.cpcAmount !== undefined
                      ? st.cpcAmount
                      : st.clicks > 0
                      ? st.spendUsd / st.clicks
                      : 0;
                  const cvr =
                    st.cvrPercent !== undefined
                      ? st.cvrPercent
                      : st.clicks > 0
                      ? (st.orders / st.clicks) * 100
                      : 0;
                  const acos =
                    st.acosPercent !== undefined
                      ? st.acosPercent
                      : st.salesUsd > 0
                      ? (st.spendUsd / st.salesUsd) * 100
                      : 0;
                  const roas =
                    st.roasValue !== undefined
                      ? st.roasValue
                      : st.spendUsd > 0
                      ? st.salesUsd / st.spendUsd
                      : 0;
                  return (
                    <tr key={st.id}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-semibold ${
                              isWaste
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {st.searchTerm}
                          </span>
                          {st.isAsinTarget && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              ASIN
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-sans text-slate-500">
                          {st.targetingTextZh || st.matchType} · {st.marketplace}
                          {st.adSponsoredType ? ` · ${st.adSponsoredType}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        <div className="truncate max-w-[200px]">{st.campaignName}</div>
                        {st.adGroupName && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                            组: {st.adGroupName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div>
                          {st.clicks} / {st.orders}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          CVR {cvr.toFixed(1)}% · 展 {st.impressions}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {sym}
                        {st.spendUsd.toFixed(1)} / {sym}
                        {st.salesUsd.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div>
                          {sym}
                          {cpc.toFixed(2)} · {acos.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-slate-400">ROAS {roas.toFixed(2)}x</div>
                      </td>
                      <td className="py-3 px-4 text-right font-sans whitespace-nowrap">
                        {st.negatedStatus === 'ACTIVE' ? (
                          <div className="inline-flex gap-1.5">
                            <button
                              disabled={!canNegateTerm || isReadOnlyExpired}
                              onClick={() => onNegateSearchTerm(st.id, 'NEGATIVE_EXACT', st)}
                              className="px-2 py-1 text-[11px] text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded disabled:opacity-40"
                            >
                              精准否定
                            </button>
                            <button
                              disabled={!canNegateTerm || isReadOnlyExpired}
                              onClick={() => onNegateSearchTerm(st.id, 'NEGATIVE_PHRASE', st)}
                              className="px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900 rounded disabled:opacity-40"
                            >
                              词组否定
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {st.negatedStatus}
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
            page={displayTermPage}
            pageSize={displayTermPageSize}
            totalItems={displayTermTotal}
            totalPages={displayTermTotalPages}
            onPageChange={(nextPage) =>
              useBackendQuery ? setServerTermPage(nextPage) : searchTermsPagination.setPage(nextPage)
            }
            onPageSizeChange={(nextSize) => {
              if (useBackendQuery) {
                setServerTermPageSize(nextSize);
                setServerTermPage(1);
              } else {
                searchTermsPagination.setPageSize(nextSize);
              }
            }}
            itemLabel="搜索词"
          />
        </div>
      )}

      {/* 6.3 24h Dayparting Bid Matrix */}
      {subTab === 'dayparting' && activeCamp && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">配置广告活动:</span>
              <select
                value={activeCamp.id}
                onChange={(e) => {
                  const found = campaigns.find((c) => c.id === e.target.value);
                  if (found) handleSelectCampaign(found);
                }}
                className="px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaignName} ({c.marketplace})
                  </option>
                ))}
              </select>
            </div>
            <span className="font-mono text-slate-500">
              高峰时段 {activeCamp.peakHoursRange} · 低谷时段 {activeCamp.offPeakHoursRange}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-slate-500 mb-1">日预算 (USD)</label>
              <input
                type="number"
                value={editBudget}
                onChange={(e) => setEditBudget(Math.max(5, Number(e.target.value)))}
                className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">基准出价 (USD)</label>
              <input
                type="number"
                step="0.05"
                value={editBid}
                onChange={(e) => setEditBid(Math.max(0.1, Number(e.target.value)))}
                className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">高峰调价幅度 (%)</label>
              <input
                type="number"
                value={editPeakMult}
                onChange={(e) => setEditPeakMult(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">低谷降价幅度 (%)</label>
              <input
                type="number"
                value={editOffPeakMult}
                onChange={(e) => setEditOffPeakMult(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <div className="flex items-end">
              <button
                disabled={!canEditBid || isReadOnlyExpired}
                onClick={() =>
                  onUpdateCampaignBid(
                    activeCamp.id,
                    editBudget,
                    editBid,
                    editPeakMult,
                    editOffPeakMult
                  )
                }
                className="w-full py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
              >
                保存分时规则
              </button>
            </div>
          </div>

          {/* 24-Hour Bid Schedule Visualization */}
          <div>
            <div className="text-[11px] font-mono text-slate-500 mb-2">
              24 小时自动竞价预览 (站点当地时间 00:00 – 23:00)
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 font-mono tabular-nums text-[11px]">
              {Array.from({ length: 24 }).map((_, hr) => {
                const isOffPeak = hr >= 1 && hr <= 6;
                const isPeak = hr >= 18 && hr <= 22;
                const mult = isPeak ? editPeakMult : isOffPeak ? editOffPeakMult : 0;
                const effectiveBid = editBid * (1 + mult / 100);
                return (
                  <div
                    key={hr}
                    className={`p-2 rounded border text-center ${
                      isPeak
                        ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                        : isOffPeak
                        ? 'bg-slate-100 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-500'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="font-semibold">{String(hr).padStart(2, '0')}:00</div>
                    <div className="text-[10px]">${effectiveBid.toFixed(2)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
