import React, { useState, useEffect, useMemo } from 'react';
import {
  FbaShipmentPlan,
  LocalMaterialSku,
  AmazonListingItem,
  FreightChannelQuote,
  MarketplaceCode,
} from '../types/erp';
import {
  calculateFbaVolumetricCharge,
  calculateLingxingReplenishment,
} from '../lib/erpEngine';
import { Truck, Barcode, Ship, Printer, Plus, TrendingUp } from 'lucide-react';
import { TablePagination, useTablePagination } from './TablePagination';

interface FbaShipmentsViewProps {
  shipments: FbaShipmentPlan[];
  localSkus: LocalMaterialSku[];
  listings: AmazonListingItem[];
  freightQuotes: FreightChannelQuote[];
  isReadOnlyExpired: boolean;
  canCreateFba: boolean;
  canPrintLabel: boolean;
  onCreateFbaShipment: (plan: Omit<FbaShipmentPlan, 'id' | 'tenantId' | 'createdAt'>) => void;
  onAdvanceShipmentStatus: (shipmentId: string) => void;
}

export const FbaShipmentsView: React.FC<FbaShipmentsViewProps> = ({
  shipments,
  localSkus,
  listings,
  freightQuotes,
  isReadOnlyExpired,
  canCreateFba,
  canPrintLabel,
  onCreateFbaShipment,
  onAdvanceShipmentStatus,
}) => {
  const [subTab, setSubTab] = useState<'replenish' | 'plans' | 'labels' | 'quotes_discrepancy'>('replenish');
  const [repPurchaseLeadDays, setRepPurchaseLeadDays] = useState(10);
  const [repSafetyDays, setRepSafetyDays] = useState(25);
  const [repWeight7d, setRepWeight7d] = useState(50);
  const [repWeight30d, setRepWeight30d] = useState(20);
  const [repStatusFilter, setRepStatusFilter] = useState<'ALL' | 'STOCKOUT_CERTAIN' | 'URGENT' | 'NORMAL'>('ALL');
  const [simAsinId, setSimAsinId] = useState(listings[0]?.id || '');

  // New Shipment & Volumetric Calculator Form
  const [selectedSku, setSelectedSku] = useState(localSkus[0]?.sku || '');
  useEffect(() => {
    if (!selectedSku && localSkus[0]?.sku) {
      setSelectedSku(localSkus[0].sku);
    }
  }, [localSkus, selectedSku]);
  const [marketplace, setMarketplace] = useState<MarketplaceCode>('US');
  const [destFc, setDestFc] = useState('ONT8');
  const [boxCount, setBoxCount] = useState(12);
  const [unitsPerBox, setUnitsPerBox] = useState(25);
  const [lengthCm, setLengthCm] = useState(48);
  const [widthCm, setWidthCm] = useState(38);
  const [heightCm, setHeightCm] = useState(34);
  const [grossKg, setGrossKg] = useState(12.5);
  const [rateCny, setRateCny] = useState(13.5);

  // Label Print Preview Selection
  const [labelShipmentId, setLabelShipmentId] = useState(shipments[0]?.id || '');
  const activeLabelShipment =
    shipments.find((s) => s.id === labelShipmentId) || shipments[0];

  const volCalc = calculateFbaVolumetricCharge({
    lengthCm,
    widthCm,
    heightCm,
    grossWeightKg: grossKg,
    boxCount,
    unitsPerBox,
    freightRatePerKgCny: rateCny,
  });

  const repRows = useMemo(
    () =>
      listings
        .map((l) => {
          const sku = localSkus.find((s) => s.sku === l.localSkuCode);
          const rep = calculateLingxingReplenishment({
            dailySales7d: l.dailySales7d,
            dailySales14d: l.dailySales14d,
            dailySales30d: l.dailySales30d,
            weight7d: repWeight7d,
            weight14d: Math.max(0, 100 - repWeight7d - repWeight30d),
            weight30d: repWeight30d,
            fbaAvailable: l.fbaAvailable,
            fbaInbound: l.fbaInbound,
            fbaReserved: l.fbaReserved,
            localAvailable: sku?.localAvailableQty || 0,
            localInbound: sku?.localInboundQty || 0,
            purchaseLeadDays: repPurchaseLeadDays,
            safetyDays: repSafetyDays,
            unitWeightKg: sku?.weightKg || 0.25,
          });
          return { listing: l, sku, rep };
        })
        .sort((a, b) => a.rep.coverDays - b.rep.coverDays),
    [listings, localSkus, repWeight7d, repWeight30d, repPurchaseLeadDays, repSafetyDays]
  );

  const certainCount = useMemo(
    () => repRows.filter((r) => r.rep.status === 'STOCKOUT_CERTAIN').length,
    [repRows]
  );
  const urgentCount = useMemo(
    () => repRows.filter((r) => r.rep.status === 'URGENT').length,
    [repRows]
  );
  const normalCount = useMemo(
    () => repRows.filter((r) => r.rep.status === 'NORMAL').length,
    [repRows]
  );
  const visibleRepRows = useMemo(
    () => repRows.filter((r) => repStatusFilter === 'ALL' || r.rep.status === repStatusFilter),
    [repRows, repStatusFilter]
  );
  const simTarget = useMemo(
    () => repRows.find((r) => r.listing.id === simAsinId) || repRows[0] || null,
    [repRows, simAsinId]
  );

  const repPagination = useTablePagination(visibleRepRows, 20);
  const shipmentsPagination = useTablePagination(shipments, 20);
  const discrepancyPagination = useTablePagination(shipments, 15);

  const handleCreateShipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateFba || isReadOnlyExpired) return;
    const matchedListing = listings.find(
      (l) => l.localSkuCode === selectedSku && l.marketplace === marketplace
    );
    onCreateFbaShipment({
      shipmentId: `FBA18XC${Math.floor(10000 + Math.random() * 89999)}`,
      shopName: matchedListing?.shopName || listings[0]?.shopName || '',
      marketplace,
      destinationFulfillmentCenter: destFc,
      shippingMode: 'SEA_FAST',
      carrierName: '合规头程物流',
      trackingNumber: `TRK-${Date.now().toString().slice(-6)}`,
      localSkuCode: selectedSku,
      fnsku: matchedListing?.fnsku || '',
      boxCount,
      unitsPerBox,
      totalUnitsShipped: volCalc.totalUnits,
      totalUnitsReceived: 0,
      boxLengthCm: lengthCm,
      boxWidthCm: widthCm,
      boxHeightCm: heightCm,
      boxGrossWeightKg: grossKg,
      freightRatePerKgCny: rateCny,
      status: 'WORKING',
    });
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              FBA 货件计划、条码打印与头程物流中心
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              包含长×宽×高/6000 泡重精算、FNSKU 商品标与外箱箱唛打印预览，以及多物流商头程渠道比价与上架差异追踪
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
            <button
              onClick={() => setSubTab('replenish')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded whitespace-nowrap ${
                subTab === 'replenish'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>5.0 智能补货与断货试算</span>
            </button>
            <button
              onClick={() => setSubTab('plans')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded whitespace-nowrap ${
                subTab === 'plans'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>5.1 货件与泡重测算</span>
            </button>
            <button
              onClick={() => setSubTab('labels')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded whitespace-nowrap ${
                subTab === 'labels'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Barcode className="w-3.5 h-3.5" />
              <span>5.2 FNSKU 与箱唛打印</span>
            </button>
            <button
              onClick={() => setSubTab('quotes_discrepancy')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded whitespace-nowrap ${
                subTab === 'quotes_discrepancy'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Ship className="w-3.5 h-3.5" />
              <span>5.3 渠道报价与上架差异</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5.0 Lingxing Scientific Replenishment & Multi-Channel Split */}
      {subTab === 'replenish' && (
          <div className="space-y-5">
            {/* Parameter Strip & 3-State Filter */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span>采购交期(天):</span>
                  <input
                    type="number"
                    value={repPurchaseLeadDays}
                    onChange={(e) => setRepPurchaseLeadDays(Math.max(1, Number(e.target.value)))}
                    className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span>安全天数:</span>
                  <input
                    type="number"
                    value={repSafetyDays}
                    onChange={(e) => setRepSafetyDays(Math.max(0, Number(e.target.value)))}
                    className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span>7d权重(%):</span>
                  <input
                    type="number"
                    value={repWeight7d}
                    onChange={(e) =>
                      setRepWeight7d(Math.min(100, Math.max(0, Number(e.target.value))))
                    }
                    className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span>30d权重(%):</span>
                  <input
                    type="number"
                    value={repWeight30d}
                    onChange={(e) =>
                      setRepWeight30d(Math.min(100, Math.max(0, Number(e.target.value))))
                    }
                    className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </label>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                {(
                  [
                    { id: 'ALL', label: `全部 (${repRows.length})` },
                    { id: 'STOCKOUT_CERTAIN', label: `必断货 (${certainCount})` },
                    { id: 'URGENT', label: `加急 (${urgentCount})` },
                    { id: 'NORMAL', label: `正常 (${normalCount})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRepStatusFilter(f.id)}
                    className={`px-2.5 py-1 rounded whitespace-nowrap ${
                      repStatusFilter === f.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive 4-Channel Split & 60-Day Stockout Simulator */}
            {simTarget && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      多渠道组合补货试算（快递 7d / 空派 14d / 海派 28d / 海卡 42d）
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      选中商品实时拆解各物流渠道补货量与预估头程费，避免断货同时最小化运费
                    </p>
                  </div>
                  <select
                    value={simTarget.listing.id}
                    onChange={(e) => setSimAsinId(e.target.value)}
                    className="px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded max-w-xs"
                  >
                    {repRows.slice(0, 50).map((r) => (
                      <option key={r.listing.id} value={r.listing.id}>
                        {r.listing.marketplace} · {r.listing.asin} (可售 {r.rep.coverDays}天)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono tabular-nums">
                  {simTarget.rep.channelSplits.map((ch) => (
                    <div
                      key={ch.code}
                      className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40"
                    >
                      <div className="font-sans font-semibold text-slate-900 dark:text-white">
                        {ch.label} ({ch.transitDays}天)
                      </div>
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">
                        {ch.qty.toLocaleString()} 件
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        预估头程 ¥{Math.round(ch.estimatedFreightCny).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Replenishment Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-4">站点 / ASIN / 本地 SKU</th>
                      <th className="py-2.5 px-4 text-right">加权日销</th>
                      <th className="py-2.5 px-4 text-right">FBA 总库存</th>
                      <th className="py-2.5 px-4 text-right">本地可用</th>
                      <th className="py-2.5 px-4 text-right">可售天数 / 预计断货日</th>
                      <th className="py-2.5 px-4 text-right">建议发货量</th>
                      <th className="py-2.5 px-4 text-right">建议采购量</th>
                      <th className="py-2.5 px-4">多渠道推荐拆分</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                    {repPagination.pageItems.map(({ listing: l, sku, rep }) => (
                      <tr
                        key={l.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 cursor-pointer"
                        onClick={() => setSimAsinId(l.id)}
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {l.marketplace} · {l.asin}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {l.localSkuCode || '未配对'} · {l.shopName}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right">{rep.weightedDailySales.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right">
                          {rep.totalFbaStock.toLocaleString()}
                          <div className="text-[10px] text-slate-400">
                            售{l.fbaAvailable} / 途{l.fbaInbound}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {(sku?.localAvailableQty || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div
                            className={`font-semibold ${
                              rep.status === 'STOCKOUT_CERTAIN'
                                ? 'text-red-600 dark:text-red-400'
                                : rep.status === 'URGENT'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {rep.coverDays >= 999 ? '999+天' : `${rep.coverDays}天`} ·{' '}
                            {rep.status === 'STOCKOUT_CERTAIN'
                              ? '必断货'
                              : rep.status === 'URGENT'
                              ? '加急'
                              : '正常'}
                          </div>
                          <div className="text-[10px] text-slate-500">{rep.stockoutDate}</div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-blue-600 dark:text-blue-400">
                          {rep.suggestedShipQty.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-amber-600 dark:text-amber-400">
                          {rep.suggestedPurchaseQty.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-[11px] text-slate-600 dark:text-slate-300">
                          {rep.channelSplits
                            .filter((c) => c.qty > 0)
                            .map((c) => `${c.label}:${c.qty}`)
                            .join(' · ') || '暂无需补货'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={repPagination.page}
                pageSize={repPagination.pageSize}
                totalItems={repPagination.totalItems}
                totalPages={repPagination.totalPages}
                onPageChange={repPagination.setPage}
                onPageSizeChange={repPagination.setPageSize}
                itemLabel="补货建议"
              />
            </div>
          </div>
      )}

      {/* 5.1 Shipment Plan & Volumetric Weight Calculator */}
      {subTab === 'plans' && (
        <div className="space-y-5">
          <form
            onSubmit={handleCreateShipment}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                新建 FBA 发货计划与实时泡重 / 单件头程运费测算
              </span>
              <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                单箱计费重: {volCalc.singleBoxChargeableKg.toFixed(2)}kg (
                {volCalc.isVolumetricApplied ? '按抛重计费' : '按实重计费'}) · 预计总运费 ¥
                {Math.round(volCalc.totalFreightCny).toLocaleString()} (单件 ¥
                {volCalc.unitFreightCny.toFixed(2)})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <div className="col-span-2">
                <label className="block text-slate-500 mb-1">本地 SKU</label>
                <select
                  value={selectedSku}
                  onChange={(e) => setSelectedSku(e.target.value)}
                  className="w-full px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  {localSkus.map((s) => (
                    <option key={s.id} value={s.sku}>
                      {s.sku} (可用 {s.localAvailableQty})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">站点 / 仓库</label>
                <div className="flex gap-1">
                  <select
                    value={marketplace}
                    onChange={(e) => setMarketplace(e.target.value as MarketplaceCode)}
                    className="w-1/2 px-1.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    <option value="US">US</option>
                    <option value="CA">CA</option>
                    <option value="MX">MX</option>
                    <option value="BR">BR</option>
                    <option value="DE">DE</option>
                    <option value="UK">UK</option>
                    <option value="JP">JP</option>
                  </select>
                  <input
                    type="text"
                    value={destFc}
                    onChange={(e) => setDestFc(e.target.value)}
                    className="w-1/2 px-1.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">箱数 × 每箱件数</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={boxCount}
                    onChange={(e) => setBoxCount(Math.max(1, Number(e.target.value)))}
                    className="w-1/2 px-1.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <input
                    type="number"
                    value={unitsPerBox}
                    onChange={(e) => setUnitsPerBox(Math.max(1, Number(e.target.value)))}
                    className="w-1/2 px-1.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-slate-500 mb-1">外箱长×宽×高 (cm)</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={lengthCm}
                    onChange={(e) => setLengthCm(Math.max(1, Number(e.target.value)))}
                    className="w-1/3 px-1.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <input
                    type="number"
                    value={widthCm}
                    onChange={(e) => setWidthCm(Math.max(1, Number(e.target.value)))}
                    className="w-1/3 px-1.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <input
                    type="number"
                    value={heightCm}
                    onChange={(e) => setHeightCm(Math.max(1, Number(e.target.value)))}
                    className="w-1/3 px-1.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">毛重kg / 单价¥</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="0.5"
                    value={grossKg}
                    onChange={(e) => setGrossKg(Math.max(0.5, Number(e.target.value)))}
                    className="w-1/2 px-1.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={rateCny}
                    onChange={(e) => setRateCny(Math.max(1, Number(e.target.value)))}
                    className="w-1/2 px-1.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={!canCreateFba || isReadOnlyExpired}
                  className="w-full inline-flex items-center justify-center gap-1 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>创建货件</span>
                </button>
              </div>
            </div>
          </form>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">发货单号 / 货件编号 / 物流渠道</th>
                    <th className="py-2.5 px-4">SKU / FNSKU 明细</th>
                    <th className="py-2.5 px-4 text-right">箱规 / 发货件数</th>
                    <th className="py-2.5 px-4 text-right">已签收件数</th>
                    <th className="py-2.5 px-4 text-right">计费重 / 预估·实付运费</th>
                    <th className="py-2.5 px-4">物流状态 / 发货人</th>
                    <th className="py-2.5 px-4 text-right">状态推进</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {shipmentsPagination.pageItems.map((sh) => {
                    const charge = calculateFbaVolumetricCharge({
                      lengthCm: sh.boxLengthCm,
                      widthCm: sh.boxWidthCm,
                      heightCm: sh.boxHeightCm,
                      grossWeightKg: sh.boxGrossWeightKg,
                      boxCount: sh.boxCount,
                      unitsPerBox: sh.unitsPerBox,
                      freightRatePerKgCny: sh.freightRatePerKgCny,
                    });
                    const displayFee =
                      sh.actualTotalFeeCny && sh.actualTotalFeeCny > 0
                        ? sh.actualTotalFeeCny
                        : sh.predictTotalFeeCny && sh.predictTotalFeeCny > 0
                        ? sh.predictTotalFeeCny
                        : Math.round(charge.totalFreightCny);
                    return (
                      <tr key={sh.id}>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 flex-wrap">
                            <span>{sh.shipmentSn || sh.shipmentId}</span>
                            {sh.isAwd && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                AWD
                              </span>
                            )}
                          </div>
                          {sh.shipmentSn && sh.shipmentSn !== sh.shipmentId && (
                            <div className="text-[10px] text-slate-500">货件: {sh.shipmentId}</div>
                          )}
                          <div className="text-[11px] font-sans text-slate-500">
                            {sh.marketplace} · {sh.warehouseName || sh.destinationFulfillmentCenter} ·{' '}
                            {sh.logisticsChannelName || sh.carrierName}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span>{sh.localSkuCode}</span>
                            {sh.itemTotalCount && sh.itemTotalCount > 1 && (
                              <span className="text-[10px] text-slate-500">
                                共 {sh.itemTotalCount} 款
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{sh.fnsku || '—'}</div>
                          {sh.items && sh.items.length > 1 && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                              {sh.items.slice(0, 3).map((it) => `${it.sku}×${it.quantityShipped}`).join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div>
                            {sh.boxCount}箱 · {sh.totalUnitsShipped} 件
                          </div>
                          {sh.totalBoxVolume ? (
                            <div className="text-[10px] text-slate-400">
                              {sh.totalBoxVolume.toFixed(2)} m³
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold">
                          {sh.totalUnitsReceived}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div>
                            {(sh.totalBoxVolumeWeightKg || charge.totalChargeableKg).toFixed(1)}kg · ¥
                            {Math.round(displayFee).toLocaleString()}
                          </div>
                          {sh.headFeeTypeName && (
                            <div className="text-[10px] font-sans text-slate-400">
                              {sh.headFeeTypeName}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {sh.statusName || sh.status}
                          </div>
                          {(sh.shipmentUser || sh.shipmentTime) && (
                            <div className="text-[10px] font-sans text-slate-400">
                              {sh.shipmentUser || ''} {sh.shipmentTime ? sh.shipmentTime.slice(0, 10) : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-sans">
                          {sh.status !== 'CLOSED' ? (
                            <button
                              disabled={!canCreateFba || isReadOnlyExpired}
                              onClick={() => onAdvanceShipmentStatus(sh.id)}
                              className="px-2.5 py-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 rounded disabled:opacity-40"
                            >
                              推进至下一节点
                            </button>
                          ) : (
                            <span className="text-slate-400">已结单</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={shipmentsPagination.page}
              pageSize={shipmentsPagination.pageSize}
              totalItems={shipmentsPagination.totalItems}
              totalPages={shipmentsPagination.totalPages}
              onPageChange={shipmentsPagination.setPage}
              onPageSizeChange={shipmentsPagination.setPageSize}
              itemLabel="FBA 货件"
            />
          </div>
        </div>
      )}

      {/* 5.2 FNSKU Barcode & Box Label Print Preview */}
      {subTab === 'labels' && activeLabelShipment && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-slate-900 dark:text-white">选择待打印货件:</span>
              <select
                value={activeLabelShipment.id}
                onChange={(e) => setLabelShipmentId(e.target.value)}
                className="px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shipmentId} ({s.fnsku} · {s.boxCount} 箱)
                  </option>
                ))}
              </select>
            </div>
            <button
              disabled={!canPrintLabel}
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>打印 FNSKU 条码与外箱箱唛</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* FNSKU Product Barcode Preview */}
            <div className="p-5 rounded-md border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white text-slate-900">
              <div className="text-[11px] font-mono text-slate-500 mb-2">
                FNSKU 商品标签预览 (70mm × 40mm 热敏纸)
              </div>
              <svg viewBox="0 0 280 56" className="w-full h-14 my-2">
                {Array.from({ length: 44 }).map((_, idx) => (
                  <rect
                    key={idx}
                    x={idx * 6 + 6}
                    y={4}
                    width={idx % 3 === 0 ? 3.5 : idx % 2 === 0 ? 2 : 1.2}
                    height={46}
                    fill="#0f172a"
                  />
                ))}
              </svg>
              <div className="text-center font-mono text-sm font-bold tracking-widest">
                {activeLabelShipment.fnsku}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs border-t border-slate-200 pt-2">
                <span>SKU: {activeLabelShipment.localSkuCode}</span>
                <span className="font-semibold">NEW · Made in China</span>
              </div>
            </div>

            {/* FBA Outer Carton Label Preview */}
            <div className="p-5 rounded-md border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white text-slate-900">
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                <span className="text-lg font-bold tracking-tight">FBA BOX LABEL</span>
                <span className="font-mono text-sm font-bold">
                  {activeLabelShipment.marketplace} · {activeLabelShipment.destinationFulfillmentCenter}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs font-mono">
                <div>
                  <div className="text-[10px] text-slate-500">SHIPMENT ID</div>
                  <div className="font-bold">{activeLabelShipment.shipmentId}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">BOX COUNT</div>
                  <div className="font-bold">Box 1 of {activeLabelShipment.boxCount}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">QTY PER BOX</div>
                  <div className="font-bold">{activeLabelShipment.unitsPerBox} Units</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">GROSS WEIGHT</div>
                  <div className="font-bold">{activeLabelShipment.boxGrossWeightKg} kg</div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] font-mono text-slate-600">
                Carrier: {activeLabelShipment.carrierName} · Tracking: {activeLabelShipment.trackingNumber}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5.3 Freight Quotes & Receiving Discrepancy */}
      {subTab === 'quotes_discrepancy' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
              头程物流渠道报价比价表 (CNY / kg)
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">物流承运商 / 渠道</th>
                  <th className="py-2.5 px-4">目的区域</th>
                  <th className="py-2.5 px-4 text-right">单价 (CNY/kg)</th>
                  <th className="py-2.5 px-4 text-right">参考时效</th>
                  <th className="py-2.5 px-4">包税</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {freightQuotes.map((q) => (
                  <tr key={q.id}>
                    <td className="py-3 px-4 font-sans">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {q.channelName}
                      </div>
                      <div className="text-[11px] text-slate-500">{q.carrierName}</div>
                    </td>
                    <td className="py-3 px-4">{q.targetRegion}</td>
                    <td className="py-3 px-4 text-right font-semibold text-blue-600 dark:text-blue-400">
                      ¥{q.pricePerKgCny.toFixed(1)}
                    </td>
                    <td className="py-3 px-4 text-right">{q.etaDays}</td>
                    <td className="py-3 px-4">{q.taxIncluded ? '双清包税' : '自税'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
              FBA 货件签收差异追踪 (发货 vs 亚马逊实收)
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-mono tabular-nums">
              {discrepancyPagination.pageItems.map((s) => {
                const diff = s.totalUnitsReceived - s.totalUnitsShipped;
                return (
                  <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {s.shipmentId} ({s.status})
                      </div>
                      <div className="text-[11px] text-slate-500">
                        发出 {s.totalUnitsShipped} · 实收 {s.totalUnitsReceived}
                      </div>
                    </div>
                    <div
                      className={`font-semibold ${
                        diff < 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      差异 {diff === 0 ? '0 (一致)' : diff}
                    </div>
                  </div>
                );
              })}
            </div>
            <TablePagination
              page={discrepancyPagination.page}
              pageSize={discrepancyPagination.pageSize}
              totalItems={discrepancyPagination.totalItems}
              totalPages={discrepancyPagination.totalPages}
              onPageChange={discrepancyPagination.setPage}
              onPageSizeChange={discrepancyPagination.setPageSize}
              pageSizeOptions={[15, 30, 50, 100]}
              itemLabel="货件差异"
            />
          </div>
        </div>
      )}
    </div>
  );
};
