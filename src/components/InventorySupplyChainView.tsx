import React, { useState } from 'react';
import {
  LocalMaterialSku,
  AmazonListingItem,
  PurchaseOrder1688,
  SupplierProfile,
  BomAssemblyOrder,
} from '../types/erp';
import { Calculator, ShoppingBag, Layers, Building, Plus, CheckCircle2 } from 'lucide-react';
import { TablePagination, useTablePagination } from './TablePagination';

interface InventorySupplyChainViewProps {
  localSkus: LocalMaterialSku[];
  listings: AmazonListingItem[];
  purchaseOrders: PurchaseOrder1688[];
  suppliers: SupplierProfile[];
  bomOrders: BomAssemblyOrder[];
  isReadOnlyExpired: boolean;
  hidePurchaseCost: boolean;
  canCreatePo: boolean;
  canApprovePo: boolean;
  canReceivePo: boolean;
  canExecuteBom: boolean;
  onCreatePurchaseOrder: (skuCode: string, qty: number, createdBy: 'USER' | 'SMART_RESTOCK') => void;
  onApprovePurchaseOrder: (poId: string) => void;
  onReceivePurchaseOrder: (poId: string) => void;
  onReturnPurchaseOrder: (poId: string) => void;
  onExecuteBomAssembly: (bomId: string) => void;
  onAddSupplier: (supplier: Omit<SupplierProfile, 'id' | 'tenantId'>) => void;
}

export const InventorySupplyChainView: React.FC<InventorySupplyChainViewProps> = ({
  localSkus,
  listings,
  purchaseOrders,
  suppliers,
  bomOrders,
  isReadOnlyExpired,
  hidePurchaseCost,
  canCreatePo,
  canApprovePo,
  canReceivePo,
  canExecuteBom,
  onCreatePurchaseOrder,
  onApprovePurchaseOrder,
  onReceivePurchaseOrder,
  onReturnPurchaseOrder,
  onExecuteBomAssembly,
  onAddSupplier,
}) => {
  const [subTab, setSubTab] = useState<'restock' | 'po_lifecycle' | 'bom' | 'suppliers'>('restock');
  const [targetCoverDays, setTargetCoverDays] = useState(60);

  // Add Supplier Form
  const [supName, setSupName] = useState('');
  const [supCat, setSupCat] = useState('智能硬件类');
  const [supMoq, setSupMoq] = useState(300);
  const [supLead, setSupLead] = useState(14);
  const [supTerm, setSupTerm] = useState('月结 30 天');

  const restockPlanRows = localSkus.map((sku) => {
    const linkedListings = listings.filter((l) => l.localSkuCode === sku.sku);
    const totalDailySales = linkedListings.reduce((a, b) => a + b.dailySales7d, 0);
    const fbaTotal = linkedListings.reduce((a, b) => a + b.fbaAvailable + b.fbaInbound, 0);
    const totalChainStock = fbaTotal + sku.localAvailableQty + sku.localInboundQty;
    const requiredStock = Math.ceil(totalDailySales * (targetCoverDays + sku.leadTimeDays));
    const suggestedBuyQty = Math.max(0, requiredStock - totalChainStock);
    const currentCoverDays =
      totalDailySales > 0 ? Math.round(totalChainStock / totalDailySales) : 999;

    return {
      sku,
      totalDailySales,
      fbaTotal,
      totalChainStock,
      suggestedBuyQty,
      currentCoverDays,
    };
  });

  const restockPagination = useTablePagination(restockPlanRows, 20);
  const poPagination = useTablePagination(purchaseOrders, 20);
  const bomPagination = useTablePagination(bomOrders, 20);
  const supplierPagination = useTablePagination(suppliers, 20);

  const handleAddSupplierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreatePo || isReadOnlyExpired || !supName.trim()) return;
    onAddSupplier({
      supplierCode: `SUP-${Math.floor(100 + Math.random() * 899)}`,
      supplierName: supName.trim(),
      category: supCat,
      moqUnits: supMoq,
      leadTimeDays: supLead,
      paymentTerm: supTerm,
      tierPricingNote: '300件基准价 · 1000件优惠 5%',
      ratingScore: 4.8,
      status: 'ACTIVE',
    });
    setSupName('');
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              采购与供应链协同中心 (Purchase, BOM & Suppliers)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              覆盖智能补货精算、外部采购单全生命周期 (草稿/审批/下单/入库/退货)、组合商品 BOM 组装加工及供应商阶梯价档案
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
            <button
              onClick={() => setSubTab('restock')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'restock'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>3.1 智能补货规划台</span>
            </button>
            <button
              onClick={() => setSubTab('po_lifecycle')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'po_lifecycle'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>3.2 采购单生命周期</span>
            </button>
            <button
              onClick={() => setSubTab('bom')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'bom'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>3.3 BOM 组装加工</span>
            </button>
            <button
              onClick={() => setSubTab('suppliers')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'suppliers'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Building className="w-3.5 h-3.5" />
              <span>3.4 供应商档案</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3.1 Smart Restock Planner */}
      {subTab === 'restock' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">目标安全库存覆盖天数:</span>
              <input
                type="number"
                min={15}
                max={180}
                value={targetCoverDays}
                onChange={(e) => setTargetCoverDays(Math.max(15, Number(e.target.value)))}
                className="w-20 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              <span className="text-slate-500">天 + 供应商采购交期</span>
            </div>
            <span className="font-mono text-slate-500">
              下单权限: {canCreatePo && !isReadOnlyExpired ? 'ALLOW (purchase:create)' : 'READ_ONLY'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">本地 SKU / 供应商</th>
                  <th className="py-2.5 px-4 text-right">全渠道 7d 日均</th>
                  <th className="py-2.5 px-4 text-right">FBA / 本地 / 在途</th>
                  <th className="py-2.5 px-4 text-right">全链可售天数</th>
                  <th className="py-2.5 px-4 text-right">采购单价</th>
                  <th className="py-2.5 px-4 text-right">建议补货量</th>
                  <th className="py-2.5 px-4 text-right">一键下单</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {restockPagination.pageItems.map((row) => (
                  <tr key={row.sku.id}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {row.sku.picUrl && (
                          <img
                            src={row.sku.picUrl}
                            alt={row.sku.sku}
                            loading="lazy"
                            className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                            <span>{row.sku.sku}</span>
                            {row.sku.isCombo && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                                组合
                              </span>
                            )}
                            {row.sku.productStatusName && (
                              <span className="text-[10px] font-sans text-slate-400">
                                {row.sku.productStatusName}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-sans text-slate-500 truncate max-w-[240px]">
                            {row.sku.name} · {row.sku.supplierName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">{row.totalDailySales.toFixed(1)}</td>
                    <td className="py-3 px-4 text-right">
                      <div>
                        {row.fbaTotal} / {row.sku.localAvailableQty} / {row.sku.localInboundQty}
                      </div>
                      {(row.sku.goodLockQty || row.sku.qcQty || row.sku.badQty) ? (
                        <div className="text-[10px] text-slate-400">
                          锁{row.sku.goodLockQty ?? 0} · 检{row.sku.qcQty ?? 0} · 次{row.sku.badQty ?? 0}
                        </div>
                      ) : null}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-semibold ${
                        row.currentCoverDays < targetCoverDays
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {row.currentCoverDays} 天
                    </td>
                    <td className="py-3 px-4 text-right">
                      {hidePurchaseCost ? '***' : `¥${row.sku.purchaseCostCny.toFixed(2)}`}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-blue-600 dark:text-blue-400">
                      {row.suggestedBuyQty > 0 ? `+${row.suggestedBuyQty}` : '库存充足'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        disabled={!canCreatePo || isReadOnlyExpired || row.suggestedBuyQty <= 0}
                        onClick={() =>
                          onCreatePurchaseOrder(row.sku.sku, row.suggestedBuyQty, 'SMART_RESTOCK')
                        }
                        className="px-2.5 py-1 font-sans text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
                      >
                        生成采购单
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={restockPagination.page}
            pageSize={restockPagination.pageSize}
            totalItems={restockPagination.totalItems}
            totalPages={restockPagination.totalPages}
            onPageChange={restockPagination.setPage}
            onPageSizeChange={restockPagination.setPageSize}
            itemLabel="SKU 补货计划"
          />
        </div>
      )}

      {/* 3.2 Purchase Order Lifecycle */}
      {subTab === 'po_lifecycle' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              采购单管理 (审批 · 质检入库 · 采购退货)
            </h3>
            <span className="text-xs font-mono text-slate-500">共 {purchaseOrders.length} 笔</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">采购单号 / 仓库 / 采购员</th>
                  <th className="py-2.5 px-4">SKU 明细 / 供应商</th>
                  <th className="py-2.5 px-4 text-right">计划 / 已入库</th>
                  <th className="py-2.5 px-4 text-right">采购总额 / 已付</th>
                  <th className="py-2.5 px-4">状态 / 付款 / 结算方式</th>
                  <th className="py-2.5 px-4 text-right">流转操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {poPagination.pageItems.map((po) => {
                  const poSym = po.currencyIcon || '¥';
                  return (
                    <tr key={po.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                          <span>{po.poNumber}</span>
                          {po.isOverdue && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-sans">
                              逾期 {po.overdueDays ?? 1}天
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-sans text-slate-500">
                          {po.warehouseName || '默认仓'}
                          {po.purchaserName ? ` · 采购: ${po.purchaserName}` : ''}
                          {po.creatorName && po.creatorName !== po.purchaserName
                            ? ` · 制单: ${po.creatorName}`
                            : ''}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {po.createdAt} {po.order1688No ? `· ${po.order1688No}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                          <span>{po.localSkuCode}</span>
                          {po.itemCount && po.itemCount > 1 && (
                            <span className="text-[10px] text-slate-500">
                              共 {po.itemCount} 款
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-sans text-slate-500 truncate max-w-[220px]">
                          {po.supplierName}
                          {po.productName ? ` · ${po.productName}` : ''}
                        </div>
                        {po.items && po.items.length > 1 && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[220px]">
                            明细: {po.items.slice(0, 3).map((it) => `${it.sku}×${it.quantityPlan}`).join(', ')}
                            {po.items.length > 3 ? ' ...' : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div>
                          {po.quantity} / {po.receivedQty}
                        </div>
                        {(po.quantityReceivePending || po.quantityReturn) ? (
                          <div className="text-[10px] text-slate-400">
                            待收 {po.quantityReceivePending ?? 0}
                            {po.quantityReturn ? ` · 退 ${po.quantityReturn}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div>
                          {hidePurchaseCost
                            ? '***'
                            : `${poSym}${po.totalAmountCny.toLocaleString()}`}
                        </div>
                        {!hidePurchaseCost && (po.payAmountCny || po.shippingPriceCny) ? (
                          <div className="text-[10px] text-slate-400">
                            {po.payAmountCny ? `已付 ${poSym}${po.payAmountCny.toLocaleString()}` : ''}
                            {po.shippingPriceCny ? ` · 运费 ${poSym}${po.shippingPriceCny}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {po.statusText || po.status} · {po.payStatusText || po.paymentStatus}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {[po.paymentMethodText, po.settlementMethodText, po.qcTypeText, po.signStatusText]
                            .filter(Boolean)
                            .join(' · ') || '标准采购流程'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 font-sans">
                          {po.status === 'DRAFT' && (
                            <button
                              disabled={!canApprovePo || isReadOnlyExpired}
                              onClick={() => onApprovePurchaseOrder(po.id)}
                              className="px-2 py-1 text-[11px] text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
                            >
                              审批下单
                            </button>
                          )}
                          {(po.status === 'ORDERED_1688' ||
                            po.status === 'IN_TRANSIT' ||
                            po.status === 'APPROVED') && (
                            <>
                              <button
                                disabled={!canReceivePo || isReadOnlyExpired}
                                onClick={() => onReceivePurchaseOrder(po.id)}
                                className="px-2 py-1 text-[11px] text-white bg-emerald-600 hover:bg-emerald-700 rounded disabled:opacity-40"
                              >
                                质检入库
                              </button>
                              <button
                                disabled={!canApprovePo || isReadOnlyExpired}
                                onClick={() => onReturnPurchaseOrder(po.id)}
                                className="px-2 py-1 text-[11px] text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded disabled:opacity-40"
                              >
                                退货
                              </button>
                            </>
                          )}
                          {(po.status === 'RECEIVED' || po.status === 'RETURNED') && (
                            <span className="text-[11px] text-slate-400">已完结</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={poPagination.page}
            pageSize={poPagination.pageSize}
            totalItems={poPagination.totalItems}
            totalPages={poPagination.totalPages}
            onPageChange={poPagination.setPage}
            onPageSizeChange={poPagination.setPageSize}
            itemLabel="采购单"
          />
        </div>
      )}

      {/* 3.3 BOM Assembly Orders */}
      {subTab === 'bom' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                组合商品 BOM 加工单 (直连领星加工单 warehouse_processing_order_list · 共 {bomOrders.length} 笔)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                涵盖组装/拆分类型、所属仓库、主成品与子件配比及加工成本核算 · 权限: <span className="font-mono">purchase:bom_execute</span>
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">加工单号 / 类型 / 仓库</th>
                  <th className="py-2.5 px-4">组合套装 SKU / 名称</th>
                  <th className="py-2.5 px-4">消耗子件明细</th>
                  <th className="py-2.5 px-4 text-right">加工套数 / 成本</th>
                  <th className="py-2.5 px-4">状态 / 完成时间</th>
                  <th className="py-2.5 px-4 text-right">执行加工</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {bomPagination.pageItems.map((b) => (
                  <tr key={b.id}>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{b.assemblyNo}</span>
                        <span
                          className={`text-[10px] px-1 py-0.5 rounded font-sans ${
                            b.processType === 'SPLIT'
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {b.processType === 'SPLIT' ? '拆分' : '组装'}
                        </span>
                      </div>
                      <div className="text-[11px] font-sans text-slate-500">
                        {b.warehouseName || '默认仓'}
                        {b.creatorName ? ` · 制单: ${b.creatorName}` : ''}
                      </div>
                      {b.remark && (
                        <div className="text-[10px] font-sans text-slate-400 truncate max-w-[180px]">
                          备注: {b.remark}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {b.picUrl && (
                          <img
                            src={b.picUrl}
                            alt={b.bundleSkuCode}
                            loading="lazy"
                            className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-blue-600 dark:text-blue-400">
                            {b.bundleSkuCode}
                          </div>
                          <div className="text-[11px] font-sans text-slate-500 truncate max-w-[200px]">
                            {b.bundleName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {b.components && b.components.length > 0 ? (
                        <div className="space-y-0.5">
                          {b.components.slice(0, 3).map((comp, idx) => (
                            <div key={idx} className="text-[11px] text-slate-700 dark:text-slate-300">
                              {comp.sku} × {comp.quantityProcess}
                              {!hidePurchaseCost && comp.syncAmountCny > 0
                                ? ` (¥${comp.syncAmountCny.toFixed(1)})`
                                : ''}
                            </div>
                          ))}
                          {b.components.length > 3 && (
                            <div className="text-[10px] text-slate-400">
                              +{b.components.length - 3} 项子件
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          {b.componentSkuCode} ({b.unitsPerBundle}×{b.targetBundleQty})
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {b.targetBundleQty} 套
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {hidePurchaseCost
                          ? '成本 ***'
                          : b.totalCostCny !== undefined && b.totalCostCny > 0
                          ? `¥${b.totalCostCny.toLocaleString()}`
                          : `${b.unitsPerBundle * b.targetBundleQty} 件耗料`}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div
                        className={
                          b.status === 'COMPLETED'
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : 'text-amber-600 dark:text-amber-400 font-semibold'
                        }
                      >
                        {b.status === 'COMPLETED' ? '已完成' : '待加工'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {b.finishTime || b.createdAt}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-sans whitespace-nowrap">
                      {b.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          已完成扣减
                        </span>
                      ) : (
                        <button
                          disabled={!canExecuteBom || isReadOnlyExpired}
                          onClick={() => onExecuteBomAssembly(b.id)}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
                        >
                          确认领料组装
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={bomPagination.page}
            pageSize={bomPagination.pageSize}
            totalItems={bomPagination.totalItems}
            totalPages={bomPagination.totalPages}
            onPageChange={bomPagination.setPage}
            onPageSizeChange={bomPagination.setPageSize}
            itemLabel="加工单"
          />
        </div>
      )}

      {/* 3.4 Suppliers & Tiered Pricing */}
      {subTab === 'suppliers' && (
        <div className="space-y-4">
          <form
            onSubmit={handleAddSupplierSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs"
          >
            <input
              type="text"
              placeholder="输入新供应商名称"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              className="sm:col-span-2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
            <input
              type="text"
              value={supCat}
              onChange={(e) => setSupCat(e.target.value)}
              placeholder="主营品类"
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
            <input
              type="number"
              value={supMoq}
              onChange={(e) => setSupMoq(Math.max(1, Number(e.target.value)))}
              placeholder="起订量 MOQ"
              className="px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
            <input
              type="text"
              value={supTerm}
              onChange={(e) => setSupTerm(e.target.value)}
              placeholder="账期条款"
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
            <button
              type="submit"
              disabled={!canCreatePo || isReadOnlyExpired}
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>建档</span>
            </button>
          </form>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">编码 / 供应商名称</th>
                  <th className="py-2.5 px-4">默认收货仓 / 采购员</th>
                  <th className="py-2.5 px-4 text-right">MOQ / 交期</th>
                  <th className="py-2.5 px-4">结算账期</th>
                  <th className="py-2.5 px-4">阶梯报价 / 备注</th>
                  <th className="py-2.5 px-4 text-right">评分</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {supplierPagination.pageItems.map((sup) => (
                  <tr key={sup.id}>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {sup.supplierName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {sup.supplierCode}
                        {sup.supplierId ? ` · ID:${sup.supplierId}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-900 dark:text-white">
                        {sup.defaultWarehouseName || sup.category}
                      </div>
                      {sup.purchaserNames && sup.purchaserNames.length > 0 && (
                        <div className="text-[11px] text-slate-500">
                          采购员: {sup.purchaserNames.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {sup.moqUnits} 件 / {sup.leadTimeDays} 天
                    </td>
                    <td className="py-3 px-4">{sup.paymentTerm}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {hidePurchaseCost ? '*** (成本脱敏中)' : sup.tierPricingNote}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {sup.ratingScore.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              page={supplierPagination.page}
              pageSize={supplierPagination.pageSize}
              totalItems={supplierPagination.totalItems}
              totalPages={supplierPagination.totalPages}
              onPageChange={supplierPagination.setPage}
              onPageSizeChange={supplierPagination.setPageSize}
              itemLabel="供应商"
            />
          </div>
        </div>
      )}
    </div>
  );
};
