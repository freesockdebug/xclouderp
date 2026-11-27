import React, { useEffect, useState } from 'react';
import { LocalMaterialSku, WarehouseStockLedger } from '../types/erp';
import {
  BackendPagedQueryResponse,
  BackendQueryContext,
  queryErpPagedData,
} from '../services/backendDataClient';
import { Warehouse, ClipboardCheck, ArrowLeftRight } from 'lucide-react';
import { TablePagination, useTablePagination } from './TablePagination';

interface WarehouseInventoryViewProps {
  localSkus: LocalMaterialSku[];
  ledgers: WarehouseStockLedger[];
  backendQueryContext?: BackendQueryContext;
  isReadOnlyExpired: boolean;
  hidePurchaseCost: boolean;
  canCountAdjust: boolean;
  canTransfer: boolean;
  onSubmitStockCount: (skuCode: string, actualQty: number, note: string) => void;
  onExecuteWarehouseTransfer: (skuCode: string, targetWarehouse: string, qty: number) => void;
}

export const WarehouseInventoryView: React.FC<WarehouseInventoryViewProps> = ({
  localSkus,
  ledgers,
  backendQueryContext,
  isReadOnlyExpired,
  hidePurchaseCost,
  canCountAdjust,
  canTransfer,
  onSubmitStockCount,
  onExecuteWarehouseTransfer,
}) => {
  const [subTab, setSubTab] = useState<'overview' | 'count' | 'transfer_ledger'>('overview');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
  const useBackendQuery = Boolean(backendQueryContext?.tenantId);
  const [serverLedgerPage, setServerLedgerPage] = useState(1);
  const [serverLedgerPageSize, setServerLedgerPageSize] = useState(20);
  const [serverLedgerRes, setServerLedgerRes] =
    useState<BackendPagedQueryResponse<WarehouseStockLedger> | null>(null);

  useEffect(() => {
    if (!useBackendQuery || subTab !== 'transfer_ledger' || !backendQueryContext?.tenantId) return;
    const ctrl = new AbortController();
    void queryErpPagedData<WarehouseStockLedger>({
      entityType: 'warehouseLedgers',
      tenantId: backendQueryContext.tenantId,
      roleCode: backendQueryContext.roleCode,
      allowedShopIds: backendQueryContext.allowedShopIds,
      page: serverLedgerPage,
      pageSize: serverLedgerPageSize,
      signal: ctrl.signal,
    }).then((res) => {
      if (!ctrl.signal.aborted && res.ok) {
        setServerLedgerRes(res);
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
    serverLedgerPage,
    serverLedgerPageSize,
  ]);

  // Stock Count Form
  const [countSku, setCountSku] = useState(localSkus[0]?.sku || '');
  const [countedQty, setCountedQty] = useState<number>(localSkus[0]?.localAvailableQty || 0);
  const [countNote, setCountNote] = useState('月度例行循环盘点');

  // Transfer Form
  const [transferSku, setTransferSku] = useState(localSkus[0]?.sku || '');
  const [transferTarget, setTransferTarget] = useState('华南 2 号中转仓');
  const [transferQty, setTransferQty] = useState(50);

  const warehouses = Array.from(new Set(localSkus.map((s) => s.warehouseName)));
  const filteredSkus = localSkus.filter(
    (s) => warehouseFilter === 'ALL' || s.warehouseName === warehouseFilter
  );

  const skuPagination = useTablePagination(filteredSkus, 20);
  const ledgerPagination = useTablePagination(ledgers, 20);
  const displayLedgers =
    useBackendQuery && serverLedgerRes ? serverLedgerRes.items : ledgerPagination.pageItems;
  const displayLedgerTotal =
    useBackendQuery && serverLedgerRes ? serverLedgerRes.totalItems : ledgerPagination.totalItems;
  const displayLedgerPage = useBackendQuery ? serverLedgerPage : ledgerPagination.page;
  const displayLedgerPageSize = useBackendQuery ? serverLedgerPageSize : ledgerPagination.pageSize;
  const displayLedgerTotalPages =
    useBackendQuery && serverLedgerRes ? serverLedgerRes.totalPages : ledgerPagination.totalPages;

  const selectedCountSkuObj = localSkus.find((s) => s.sku === countSku);
  const variance = selectedCountSkuObj ? countedQty - selectedCountSkuObj.localAvailableQty : 0;

  const handleCountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCountAdjust || isReadOnlyExpired || !countSku) return;
    onSubmitStockCount(countSku, Math.max(0, countedQty), countNote);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canTransfer || isReadOnlyExpired || !transferSku || transferQty <= 0) return;
    onExecuteWarehouseTransfer(transferSku, transferTarget, transferQty);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              本地多仓与库存管理中心 (Multi-Warehouse WMS)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              支持分仓库存总览、盘盈盘亏校准单、跨仓调拨指令以及全链路出入库流水审计追踪
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
            <button
              onClick={() => setSubTab('overview')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'overview'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Warehouse className="w-3.5 h-3.5" />
              <span>4.1 多仓库存总览</span>
            </button>
            <button
              onClick={() => setSubTab('count')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'count'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>4.2 库存盘点校准</span>
            </button>
            <button
              onClick={() => setSubTab('transfer_ledger')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'transfer_ledger'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>4.3 跨仓调拨与流水</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4.1 Multi-Warehouse Overview */}
      {subTab === 'overview' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded text-xs">
              <button
                onClick={() => setWarehouseFilter('ALL')}
                className={`px-2.5 py-1 rounded ${
                  warehouseFilter === 'ALL'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                全部仓库 ({localSkus.length})
              </button>
              {warehouses.map((wh) => (
                <button
                  key={wh}
                  onClick={() => setWarehouseFilter(wh)}
                  className={`px-2.5 py-1 rounded ${
                    warehouseFilter === wh
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {wh}
                </button>
              ))}
            </div>
            <span className="text-xs font-mono text-slate-500">
              总可用件数:{' '}
              {filteredSkus.reduce((acc, s) => acc + s.localAvailableQty, 0).toLocaleString()}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">所属仓库</th>
                  <th className="py-2.5 px-4">本地 SKU / 品名</th>
                  <th className="py-2.5 px-4 text-right">可用 / 锁定 / 待检 / 次品</th>
                  <th className="py-2.5 px-4 text-right">待到货 / 调拨在途</th>
                  <th className="py-2.5 px-4 text-right">尺寸(cm) / 单重 / 装箱 / 库龄</th>
                  <th className="py-2.5 px-4 text-right">库存货值 (CNY)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {skuPagination.pageItems.map((s) => {
                  const stockVal =
                    s.stockValueCny !== undefined && s.stockValueCny > 0
                      ? s.stockValueCny
                      : Math.round(s.localAvailableQty * s.purchaseCostCny);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        <div>{s.warehouseName}</div>
                        {s.productStatusName && (
                          <div className="text-[10px] font-normal text-slate-400">
                            {s.productStatusName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {s.picUrl && (
                            <img
                              src={s.picUrl}
                              alt={s.sku}
                              loading="lazy"
                              className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                              {s.sku}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
                              {s.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {s.localAvailableQty.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          锁 {s.goodLockQty ?? 0} · 检 {s.qcQty ?? 0} · 次 {s.badQty ?? 0}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        <div>{s.localInboundQty.toLocaleString()}</div>
                        {(s.pendingQty || s.transitQty) ? (
                          <div className="text-[10px] text-slate-400">
                            待入 {s.pendingQty ?? 0} · 调拨 {s.transitQty ?? 0}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <div>
                          {s.lengthCm}×{s.widthCm}×{s.heightCm} · {s.weightKg}kg
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {s.boxPcs ? `${s.boxPcs}件/箱` : '箱规—'}
                          {s.averageAgeDays ? ` · 库龄 ${s.averageAgeDays}天` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        {hidePurchaseCost ? (
                          '*** (已脱敏)'
                        ) : (
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">
                              ¥{Math.round(stockVal).toLocaleString()}
                            </div>
                            {s.stockPriceCny ? (
                              <div className="text-[10px] text-slate-400">
                                均价 ¥{s.stockPriceCny.toFixed(2)}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={skuPagination.page}
            pageSize={skuPagination.pageSize}
            totalItems={skuPagination.totalItems}
            totalPages={skuPagination.totalPages}
            onPageChange={skuPagination.setPage}
            onPageSizeChange={skuPagination.setPageSize}
            itemLabel="本地 SKU"
          />
        </div>
      )}

      {/* 4.2 Stock Count & Variance Adjustment */}
      {subTab === 'count' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                提交库存盘点校准单 (自动计算盘盈/盘亏并写入出入库流水)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                需要权限码 <span className="font-mono">warehouse:count_adjust</span>，校准后即刻更新可用库存余额
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              当前权限: {canCountAdjust && !isReadOnlyExpired ? 'ALLOW' : 'BLOCKED'}
            </span>
          </div>

          <form onSubmit={handleCountSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
            <div className="md:col-span-4">
              <label className="block text-slate-500 mb-1">选择盘点 SKU</label>
              <select
                value={countSku}
                onChange={(e) => {
                  const next = e.target.value;
                  setCountSku(next);
                  const found = localSkus.find((s) => s.sku === next);
                  if (found) setCountedQty(found.localAvailableQty);
                }}
                className="w-full px-2.5 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                {localSkus.map((s) => (
                  <option key={s.id} value={s.sku}>
                    {s.sku} ({s.warehouseName} · 账面 {s.localAvailableQty})
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-500 mb-1">实盘数量</label>
              <input
                type="number"
                min={0}
                value={countedQty}
                onChange={(e) => setCountedQty(Math.max(0, Number(e.target.value)))}
                className="w-full px-2.5 py-2 font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-500 mb-1">盘盈 / 盘亏差异</label>
              <div
                className={`px-2.5 py-2 font-mono font-bold tabular-nums rounded border border-slate-200 dark:border-slate-800 ${
                  variance > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : variance < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-500'
                }`}
              >
                {variance > 0 ? `+${variance}` : variance} 件
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-500 mb-1">盘点备注</label>
              <input
                type="text"
                value={countNote}
                onChange={(e) => setCountNote(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <div className="md:col-span-2 flex items-end">
              <button
                type="submit"
                disabled={!canCountAdjust || isReadOnlyExpired || variance === 0}
                className="w-full py-2 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
              >
                确认过账校准
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4.3 Inter-Warehouse Transfer & Stock Ledger */}
      {subTab === 'transfer_ledger' && (
        <div className="space-y-5">
          <form
            onSubmit={handleTransferSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 grid grid-cols-1 md:grid-cols-12 gap-4 text-xs"
          >
            <div className="md:col-span-12 font-semibold text-sm text-slate-900 dark:text-white">
              发起仓间调拨单 (权限: warehouse:transfer)
            </div>
            <div className="md:col-span-4">
              <label className="block text-slate-500 mb-1">调出 SKU</label>
              <select
                value={transferSku}
                onChange={(e) => setTransferSku(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                {localSkus.map((s) => (
                  <option key={s.id} value={s.sku}>
                    {s.sku} ({s.warehouseName} · 可用 {s.localAvailableQty})
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-slate-500 mb-1">目标调入仓库</label>
              <select
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                <option value="华南 1 号中心仓">华南 1 号中心仓</option>
                <option value="华南 2 号中转仓">华南 2 号中转仓</option>
                <option value="华东海外备货仓">华东海外备货仓</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-500 mb-1">调拨数量</label>
              <input
                type="number"
                min={1}
                value={transferQty}
                onChange={(e) => setTransferQty(Math.max(1, Number(e.target.value)))}
                className="w-full px-2.5 py-1.5 font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <div className="md:col-span-3 flex items-end">
              <button
                type="submit"
                disabled={!canTransfer || isReadOnlyExpired}
                className="w-full py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
              >
                执行调拨并写入流水
              </button>
            </div>
          </form>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                仓库出入库与盘点调拨台账 (共 {displayLedgerTotal.toLocaleString()} 条)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">批次号 / 流水号 / 时间</th>
                    <th className="py-2.5 px-4">仓库 / SKU / 品名</th>
                    <th className="py-2.5 px-4">业务类型</th>
                    <th className="py-2.5 px-4 text-right">变动 (良/检/次)</th>
                    <th className="py-2.5 px-4 text-right">变动后结存 / 成本</th>
                    <th className="py-2.5 px-4">关联单据 / 备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {displayLedgers.map((l) => (
                    <tr key={l.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {l.batchNo || l.ledgerNo}
                        </div>
                        <div className="text-[11px] text-slate-500">{l.createdAt}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-sans font-medium text-slate-900 dark:text-white">
                          {l.warehouseName}
                        </div>
                        <div className="text-[11px] text-blue-600 dark:text-blue-400">
                          {l.localSkuCode}
                        </div>
                        {l.productName && (
                          <div className="text-[10px] font-sans text-slate-400 truncate max-w-[180px]">
                            {l.productName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {l.typeName || l.movementType}
                        </div>
                        {l.typeName && (
                          <div className="text-[10px] font-mono text-slate-400">
                            {l.movementType}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div
                          className={`font-semibold ${
                            l.qtyDelta >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {l.qtyDelta >= 0 ? `+${l.qtyDelta}` : l.qtyDelta}
                        </div>
                        {(l.goodDelta || l.qcDelta || l.badDelta) ? (
                          <div className="text-[10px] text-slate-400">
                            良{l.goodDelta ?? 0} · 检{l.qcDelta ?? 0} · 次{l.badDelta ?? 0}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div>{l.balanceAfter}</div>
                        {!hidePurchaseCost && l.stockCostCny ? (
                          <div className="text-[10px] text-slate-400">
                            ¥{l.stockCostCny.toLocaleString()}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-600 dark:text-slate-400">
                        <div className="font-mono text-slate-800 dark:text-slate-200">
                          {l.purchaseOrderSn || l.deliveryOrderSn || l.orderSn || l.referenceDoc}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {l.operatorName}
                          {l.supplierName ? ` · ${l.supplierName}` : ''}
                        </div>
                        {l.batchRemark && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                            {l.batchRemark}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={displayLedgerPage}
              pageSize={displayLedgerPageSize}
              totalItems={displayLedgerTotal}
              totalPages={displayLedgerTotalPages}
              onPageChange={(nextPage) =>
                useBackendQuery ? setServerLedgerPage(nextPage) : ledgerPagination.setPage(nextPage)
              }
              onPageSizeChange={(nextSize) => {
                if (useBackendQuery) {
                  setServerLedgerPageSize(nextSize);
                  setServerLedgerPage(1);
                } else {
                  ledgerPagination.setPageSize(nextSize);
                }
              }}
              itemLabel="库存流水"
            />
          </div>
        </div>
      )}
    </div>
  );
};
