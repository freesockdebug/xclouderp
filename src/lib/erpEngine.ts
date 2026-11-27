import type {
  Tenant,
  SubscriptionPlan,
  SubscriptionPlanCode,
  RbacRoleDefinition,
  RbacTeamMember,
  PermissionCode,
  AmazonListingItem,
  AmazonOrderItem,
  AdCampaignItem,
  SettlementPeriodItem,
  ExchangeRateItem,
  CurrencyCode,
  MarketplaceCode,
  LocalMaterialSku,
  PortalMode,
  ErpModuleCode,
  ErpAppModule,
  TenantInstalledModule,
  ImpersonationSession,
} from '../types/erp';

/**
 * Pure domain invariant & calculation engine for X Cloud ERP.
 * Shared by React UI, Cloudflare Workers, memory-level adversarial audit verify(), and unit tests.
 */

export const PLAN_TIER_RANK: Record<SubscriptionPlanCode, number> = {
  FREE: 0,
  TRIAL: 1,
  PRO: 2,
  ENTERPRISE: 3,
};

export function isTenantWritable(tenant: Pick<Tenant, 'subscriptionStatus'>): boolean {
  return (
    tenant.subscriptionStatus === 'ACTIVE' ||
    tenant.subscriptionStatus === 'TRIALING' ||
    tenant.subscriptionStatus === 'GRACE_PERIOD'
  );
}

export function canAccessPortal(
  actorPortalMode: PortalMode,
  targetPortal: PortalMode
): boolean {
  return actorPortalMode === targetPortal;
}

export function validateTenantSlug(
  rawSlug: string,
  existingTenants: Pick<Tenant, 'slug'>[]
): { valid: boolean; normalized: string; reason?: string } {
  const normalized = rawSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (normalized.length < 2 || normalized.length > 32) {
    return { valid: false, normalized, reason: '租户路径标识 (slug) 长度须为 2~32 位小写字母、数字或短横线' };
  }
  const reserved = new Set(['admin', 'central', 'api', 'auth', 'login', 'system', 'platform']);
  if (reserved.has(normalized)) {
    return { valid: false, normalized, reason: `路径标识 [${normalized}] 为平台保留字，禁止占用` };
  }
  if (existingTenants.some((t) => t.slug.toLowerCase() === normalized)) {
    return { valid: false, normalized, reason: `路径标识 [${normalized}] 已被其他租户占用` };
  }
  return { valid: true, normalized };
}

export function resolveTenantByPathSlug(
  slug: string,
  tenants: Tenant[]
): Tenant | null {
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;
  const matched = tenants.find(
    (t) => t.slug.toLowerCase() === clean && t.provisionStatus !== 'ARCHIVED'
  );
  return matched || null;
}

export function canTenantInstallModule(
  planCode: SubscriptionPlanCode,
  moduleDef: ErpAppModule
): { allowed: boolean; reason?: string } {
  if (!moduleDef.isPublished && !moduleDef.isCoreRequired) {
    return {
      allowed: false,
      reason: `应用模块 [${moduleDef.moduleName}] 已被平台下架，暂不可安装`,
    };
  }
  if (PLAN_TIER_RANK[planCode] < PLAN_TIER_RANK[moduleDef.minPlanCode]) {
    return {
      allowed: false,
      reason: `当前套餐 [${planCode}] 低于模块最低门槛 [${moduleDef.minPlanCode}]，请升级套餐后安装`,
    };
  }
  return { allowed: true };
}

export function isModuleEnabledForTenant(
  tenantId: string,
  moduleCode: ErpModuleCode,
  installedModules: TenantInstalledModule[],
  catalog: ErpAppModule[]
): boolean {
  const def = catalog.find((m) => m.moduleCode === moduleCode);
  if (!def) return false;
  if (def.isCoreRequired) return true;
  if (!def.isPublished) return false;
  const record = installedModules.find(
    (im) => im.tenantId === tenantId && im.moduleCode === moduleCode
  );
  return Boolean(record && record.enabled);
}

export function generateTenantSchemaSql(tenant: Pick<Tenant, 'slug' | 'tenantCode' | 'dbSchemaName' | 'isolationMode'>): string {
  const safeSchema = tenant.dbSchemaName.replace(/[^a-z0-9_]/gi, '_');
  if (tenant.isolationMode === 'DEDICATED_DB_BYOD') {
    return `-- [BYOD Dedicated Supabase Mode] Tenant: ${tenant.tenantCode} (/t/${tenant.slug})
-- 该租户启用物理独立数据库实例 (BYOD)，业务表直接部署在独立 Supabase Project 的 public Schema 下。
-- 缓存隔离前缀: tenant:${tenant.slug}:*  |  存储桶前缀: bucket/${tenant.slug}/*
CREATE SCHEMA IF NOT EXISTS public;
-- 请将完整的 SUPABASE_MULTI_TENANT_SQL_SCHEMA 执行于该租户专属的 Supabase 实例。`;
  }
  return `-- [Schema-per-Tenant / Isolated Namespace] Tenant: ${tenant.tenantCode} (/t/${tenant.slug})
CREATE SCHEMA IF NOT EXISTS ${safeSchema};

CREATE TABLE IF NOT EXISTS ${safeSchema}.amz_product_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  asin TEXT NOT NULL,
  msku TEXT NOT NULL,
  price_orig NUMERIC(10,2) NOT NULL DEFAULT 0,
  fba_available INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ${safeSchema}.pur_orders_1688 (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number TEXT UNIQUE NOT NULL,
  local_sku_code TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA ${safeSchema} TO authenticated;
ALTER TABLE ${safeSchema}.amz_product_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${safeSchema}.pur_orders_1688 ENABLE ROW LEVEL SECURITY;`;
}

export function isValidImpersonationSession(
  session: ImpersonationSession | null,
  tenants: Pick<Tenant, 'id'>[]
): boolean {
  if (!session) return false;
  return Boolean(
    session.sessionId &&
      session.platformAdminName &&
      tenants.some((t) => t.id === session.targetTenantId)
  );
}

export function resolveMemberPermissions(
  member: RbacTeamMember | null,
  roles: RbacRoleDefinition[]
): Set<PermissionCode> {
  if (!member || member.status !== 'ACTIVE') {
    return new Set<PermissionCode>();
  }
  const role = roles.find(
    (r) => r.roleCode === member.roleCode && r.tenantId === member.tenantId
  );
  return new Set<PermissionCode>(role ? role.permissions : []);
}

export function hasPermission(
  member: RbacTeamMember | null,
  roles: RbacRoleDefinition[],
  permission: PermissionCode
): boolean {
  return resolveMemberPermissions(member, roles).has(permission);
}

export function filterByShopScope<T extends { shopId: string }>(
  items: T[],
  member: RbacTeamMember | null
): T[] {
  if (!member || member.status !== 'ACTIVE') return [];
  if (member.roleCode === 'TENANT_ADMIN') return items;
  const allowedSet = new Set(member.allowedShopIds);
  return items.filter((item) => allowedSet.has(item.shopId));
}

export function checkTenantQuota(
  tenant: Tenant,
  plan: SubscriptionPlan,
  resource: 'SHOPS' | 'USERS' | 'SKUS' | 'MCP_CALLS'
): { allowed: boolean; used: number; limit: number; reason?: string } {
  const map = {
    SHOPS: { used: tenant.usedShopsCount, limit: plan.maxShops, label: '亚马逊店铺数' },
    USERS: { used: tenant.usedUsersCount, limit: plan.maxUsers, label: '团队子账号席位' },
    SKUS: { used: tenant.usedSkusCount, limit: plan.maxSkus, label: '本地 SKU 档案数' },
    MCP_CALLS: {
      used: tenant.usedMcpCallsMonth,
      limit: plan.mcpCallsQuota,
      label: '当月 MCP 调用次数',
    },
  };
  const entry = map[resource];
  if (entry.used >= entry.limit) {
    return {
      allowed: false,
      used: entry.used,
      limit: entry.limit,
      reason: `配额超限：当前套餐 [${plan.planCode}] 的${entry.label}上限为 ${entry.limit}，已使用 ${entry.used}`,
    };
  }
  return { allowed: true, used: entry.used, limit: entry.limit };
}

export function evaluateMcpAccess(params: {
  tenantStatus: Tenant['subscriptionStatus'];
  permissionScope: 'READ_ONLY' | 'READ_WRITE';
  quotaRemaining: number;
  toolName: string;
  mcpModuleEnabled?: boolean;
}): { allowed: boolean; httpStatus: number; errorCode?: number; message?: string } {
  if (params.mcpModuleEnabled === false) {
    return {
      allowed: false,
      httpStatus: 403,
      errorCode: -32005,
      message: 'MODULE_NOT_ENABLED: 当前租户未在应用市场启用 [mod_mcp_gateway] 模块',
    };
  }

  const writeTools = new Set([
    'create_draft_purchase_order',
    'adjust_campaign_bid_or_rule',
    'sync_from_lingxing_mcp',
  ]);
  const isWriteTool = writeTools.has(params.toolName);

  if (params.tenantStatus === 'SUSPENDED') {
    return {
      allowed: false,
      httpStatus: 402,
      errorCode: -32002,
      message: 'Tenant is SUSPENDED',
    };
  }
  if (params.tenantStatus === 'EXPIRED_READONLY' && isWriteTool) {
    return {
      allowed: false,
      httpStatus: 402,
      errorCode: -32002,
      message: 'Tenant is in EXPIRED_READONLY mode; write/sync tools blocked',
    };
  }
  if (params.quotaRemaining <= 0) {
    return {
      allowed: false,
      httpStatus: 429,
      errorCode: -32003,
      message: 'Monthly MCP call quota exceeded',
    };
  }
  if (params.permissionScope === 'READ_ONLY' && isWriteTool) {
    return {
      allowed: false,
      httpStatus: 403,
      errorCode: -32004,
      message: `READ_ONLY token cannot invoke write tool [${params.toolName}]`,
    };
  }
  return { allowed: true, httpStatus: 200 };
}

export function calculateAsinProfit(
  listing: AmazonListingItem,
  localSku: LocalMaterialSku | undefined,
  usdToCnyRate: number,
  extraExpenseUsd = 0
): {
  referralFeeUsd: number;
  fbaFeeTotalUsd: number;
  refundLossUsd: number;
  cogsUsd: number;
  netProfitUsd: number;
  netMarginPercent: number;
  acosPercent: number;
  coverDays: number;
} {
  const safeRate = usdToCnyRate > 0 ? usdToCnyRate : 7.2;
  const unitCogsUsd = localSku
    ? (localSku.purchaseCostCny + localSku.headFreightPerUnitCny) / safeRate
    : 0;
  const referralFeeUsd = listing.revenue30dUsd * listing.referralFeeRate;
  const fbaFeeTotalUsd = listing.orders30d * listing.fbaFeePerUnitUsd;
  const refundLossUsd =
    listing.revenue30dUsd * (listing.refundRatePercent / 100) * 0.85;
  const cogsUsd = listing.orders30d * unitCogsUsd;

  const netProfitUsd =
    listing.revenue30dUsd -
    referralFeeUsd -
    fbaFeeTotalUsd -
    listing.monthlyStorageFeeUsd -
    listing.adSpend30dUsd -
    refundLossUsd -
    cogsUsd -
    extraExpenseUsd;

  const netMarginPercent =
    listing.revenue30dUsd > 0 ? (netProfitUsd / listing.revenue30dUsd) * 100 : 0;

  const acosPercent =
    listing.adSales30dUsd > 0 ? (listing.adSpend30dUsd / listing.adSales30dUsd) * 100 : 0;

  const coverDays =
    listing.dailySales7d > 0
      ? Math.round((listing.fbaAvailable + listing.fbaInbound) / listing.dailySales7d)
      : 999;

  return {
    referralFeeUsd,
    fbaFeeTotalUsd,
    refundLossUsd,
    cogsUsd,
    netProfitUsd,
    netMarginPercent,
    acosPercent,
    coverDays,
  };
}

export function calculateFbaVolumetricCharge(params: {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  grossWeightKg: number;
  boxCount: number;
  unitsPerBox: number;
  freightRatePerKgCny: number;
}): {
  singleBoxVolumetricKg: number;
  singleBoxChargeableKg: number;
  totalChargeableKg: number;
  totalUnits: number;
  totalFreightCny: number;
  unitFreightCny: number;
  isVolumetricApplied: boolean;
} {
  const l = Math.max(0, params.lengthCm);
  const w = Math.max(0, params.widthCm);
  const h = Math.max(0, params.heightCm);
  const gw = Math.max(0, params.grossWeightKg);
  const boxes = Math.max(0, params.boxCount);
  const perBox = Math.max(0, params.unitsPerBox);
  const rate = Math.max(0, params.freightRatePerKgCny);

  const singleBoxVolumetricKg = (l * w * h) / 6000;
  const singleBoxChargeableKg = Math.max(singleBoxVolumetricKg, gw);
  const totalChargeableKg = singleBoxChargeableKg * boxes;
  const totalUnits = boxes * perBox;
  const totalFreightCny = totalChargeableKg * rate;
  const unitFreightCny = totalUnits > 0 ? totalFreightCny / totalUnits : 0;

  return {
    singleBoxVolumetricKg,
    singleBoxChargeableKg,
    totalChargeableKg,
    totalUnits,
    totalFreightCny,
    unitFreightCny,
    isVolumetricApplied: singleBoxVolumetricKg > gw,
  };
}

export type ReplenishmentStatus = 'STOCKOUT_CERTAIN' | 'URGENT' | 'NORMAL';

export interface ReplenishmentChannelSpec {
  code: 'EXPRESS' | 'AIR' | 'SEA_FAST' | 'SEA_SLOW';
  label: string;
  transitDays: number;
  ratePerKgCny: number;
}

export const DEFAULT_LINGXING_REPLENISHMENT_CHANNELS: ReplenishmentChannelSpec[] = [
  { code: 'EXPRESS', label: '红单快递', transitDays: 7, ratePerKgCny: 42 },
  { code: 'AIR', label: '空派专线', transitDays: 14, ratePerKgCny: 28 },
  { code: 'SEA_FAST', label: '美森海派', transitDays: 28, ratePerKgCny: 13.5 },
  { code: 'SEA_SLOW', label: '普船海卡', transitDays: 42, ratePerKgCny: 9.2 },
];

/**
 * Lingxing-style scientific replenishment & multi-channel split engine.
 * Zero-NaN guaranteed when sales velocity, stock, or weights are 0 or negative.
 */
export function calculateLingxingReplenishment(params: {
  dailySales7d: number;
  dailySales14d?: number;
  dailySales30d: number;
  weight7d?: number;
  weight14d?: number;
  weight30d?: number;
  fbaAvailable: number;
  fbaInbound: number;
  fbaReserved?: number;
  localAvailable: number;
  localInbound?: number;
  purchaseLeadDays: number;
  safetyDays: number;
  unitWeightKg?: number;
  channels?: ReplenishmentChannelSpec[];
  referenceDateIso?: string;
}): {
  weightedDailySales: number;
  totalFbaStock: number;
  coverDays: number;
  status: ReplenishmentStatus;
  stockoutDate: string;
  targetStockQty: number;
  suggestedShipQty: number;
  suggestedPurchaseQty: number;
  channelSplits: Array<{
    code: ReplenishmentChannelSpec['code'];
    label: string;
    transitDays: number;
    qty: number;
    estimatedFreightCny: number;
  }>;
} {
  const s7 = Math.max(0, Number.isFinite(params.dailySales7d) ? params.dailySales7d : 0);
  const s30 = Math.max(0, Number.isFinite(params.dailySales30d) ? params.dailySales30d : 0);
  const s14 = Math.max(
    0,
    params.dailySales14d !== undefined && Number.isFinite(params.dailySales14d)
      ? params.dailySales14d
      : (s7 + s30) / 2
  );

  const w7 = Math.max(0, params.weight7d ?? 0.5);
  const w14 = Math.max(0, params.weight14d ?? 0.3);
  const w30 = Math.max(0, params.weight30d ?? 0.2);
  const wSum = w7 + w14 + w30;
  const weightedDailySales =
    wSum > 0 ? Number(((s7 * w7 + s14 * w14 + s30 * w30) / wSum).toFixed(2)) : 0;

  const fbaAvail = Math.max(0, params.fbaAvailable || 0);
  const fbaInb = Math.max(0, params.fbaInbound || 0);
  const fbaRes = Math.max(0, params.fbaReserved || 0);
  const localAvail = Math.max(0, params.localAvailable || 0);
  const localInb = Math.max(0, params.localInbound || 0);
  const totalFbaStock = fbaAvail + fbaInb + fbaRes;

  const channels =
    params.channels && params.channels.length > 0
      ? [...params.channels].sort((a, b) => a.transitDays - b.transitDays)
      : DEFAULT_LINGXING_REPLENISHMENT_CHANNELS;
  const fastestDays = Math.max(1, channels[0].transitDays);
  const slowestDays = Math.max(fastestDays, channels[channels.length - 1].transitDays);
  const purchaseLeadDays = Math.max(1, params.purchaseLeadDays || 10);
  const safetyDays = Math.max(0, params.safetyDays || 25);
  const unitWeightKg = Math.max(0.05, params.unitWeightKg || 0.25);

  const coverDays =
    weightedDailySales > 0 ? Math.round(totalFbaStock / weightedDailySales) : 999;

  let status: ReplenishmentStatus = 'NORMAL';
  if (weightedDailySales > 0) {
    if (coverDays < fastestDays) {
      status = 'STOCKOUT_CERTAIN';
    } else if (coverDays < slowestDays) {
      status = 'URGENT';
    }
  }

  const baseDate = params.referenceDateIso ? new Date(params.referenceDateIso) : new Date();
  const safeBaseMs = Number.isNaN(baseDate.getTime()) ? Date.now() : baseDate.getTime();
  const stockoutDate =
    weightedDailySales > 0 && coverDays < 999
      ? new Date(safeBaseMs + coverDays * 86400000).toISOString().slice(0, 10)
      : '无断货风险';

  const shipHorizonDays = slowestDays + safetyDays;
  const targetStockQty = Math.ceil(weightedDailySales * shipHorizonDays);
  const rawShipNeed = Math.max(0, targetStockQty - totalFbaStock);
  const suggestedShipQty = Math.min(localAvail, rawShipNeed);

  const purchaseHorizonDays = purchaseLeadDays + slowestDays + safetyDays;
  const targetSupplyQty = Math.ceil(weightedDailySales * purchaseHorizonDays);
  const totalPipelineStock = totalFbaStock + localAvail + localInb;
  const suggestedPurchaseQty = Math.max(0, targetSupplyQty - totalPipelineStock);

  // Split rawShipNeed across fastest -> slowest channels to minimize freight while closing stockout gaps
  let remaining = rawShipNeed;
  const channelSplits = channels.map((ch, idx) => {
    let qty = 0;
    if (remaining > 0 && weightedDailySales > 0) {
      if (idx === channels.length - 1) {
        qty = remaining;
      } else {
        const nextTransit = channels[idx + 1].transitDays;
        if (coverDays < nextTransit) {
          const gapDays = Math.max(0, nextTransit - Math.max(coverDays, ch.transitDays));
          const bridgeQty = Math.ceil(gapDays * weightedDailySales);
          qty = Math.min(remaining, Math.max(0, bridgeQty));
        }
      }
      remaining = Math.max(0, remaining - qty);
    }
    return {
      code: ch.code,
      label: ch.label,
      transitDays: ch.transitDays,
      qty,
      estimatedFreightCny: Number((qty * unitWeightKg * ch.ratePerKgCny).toFixed(2)),
    };
  });

  return {
    weightedDailySales,
    totalFbaStock,
    coverDays,
    status,
    stockoutDate,
    targetStockQty,
    suggestedShipQty,
    suggestedPurchaseQty,
    channelSplits,
  };
}

export type ProfitAccountingBasis = 'ORDER_BASIS' | 'SHIPMENT_BASIS' | 'SETTLEMENT_BASIS';

/**
 * Lingxing-style 3-basis profit accounting engine:
 * - ORDER_BASIS: real-time placed-order estimate
 * - SHIPMENT_BASIS: shipped-only basis (excludes pending/cancelled, no cross-month reversal)
 * - SETTLEMENT_BASIS: released transaction basis (optional pre-settlement deferred inclusion)
 */
export function calculateThreeBasisProfit(params: {
  listing: AmazonListingItem;
  localSku?: LocalMaterialSku;
  usdToCnyRate: number;
  extraExpenseUsd?: number;
  basis: ProfitAccountingBasis;
  includePreSettlement?: boolean;
}): {
  basisFactor: number;
  recognizedRevenue: number;
  referralFee: number;
  fbaFeeTotal: number;
  storageFee: number;
  adSpend: number;
  refundLoss: number;
  cogs: number;
  extraExpense: number;
  netProfit: number;
  netMarginPercent: number;
  tacosPercent: number;
} {
  const base = calculateAsinProfit(
    params.listing,
    params.localSku,
    params.usdToCnyRate,
    params.extraExpenseUsd || 0
  );
  // Deterministic basis factor aligned with Amazon deferred settlement mechanics
  let basisFactor = 1;
  if (params.basis === 'SHIPMENT_BASIS') {
    basisFactor = 0.96;
  } else if (params.basis === 'SETTLEMENT_BASIS') {
    basisFactor = params.includePreSettlement ? 0.94 : 0.84;
  }

  const recognizedRevenue = Number((params.listing.revenue30dUsd * basisFactor).toFixed(2));
  const referralFee = Number((base.referralFeeUsd * basisFactor).toFixed(2));
  const fbaFeeTotal = Number((base.fbaFeeTotalUsd * basisFactor).toFixed(2));
  const storageFee = Number(params.listing.monthlyStorageFeeUsd.toFixed(2));
  const adSpend = Number(params.listing.adSpend30dUsd.toFixed(2));
  const refundLoss = Number((base.refundLossUsd * basisFactor).toFixed(2));
  const cogs = Number((base.cogsUsd * basisFactor).toFixed(2));
  const extraExpense = Number((params.extraExpenseUsd || 0).toFixed(2));

  const netProfit = Number(
    (
      recognizedRevenue -
      referralFee -
      fbaFeeTotal -
      storageFee -
      adSpend -
      refundLoss -
      cogs -
      extraExpense
    ).toFixed(2)
  );
  const netMarginPercent =
    recognizedRevenue > 0 ? Number(((netProfit / recognizedRevenue) * 100).toFixed(2)) : 0;
  const tacosPercent =
    recognizedRevenue > 0 ? Number(((adSpend / recognizedRevenue) * 100).toFixed(2)) : 0;

  return {
    basisFactor,
    recognizedRevenue,
    referralFee,
    fbaFeeTotal,
    storageFee,
    adSpend,
    refundLoss,
    cogs,
    extraExpense,
    netProfit,
    netMarginPercent,
    tacosPercent,
  };
}

/**
 * Lingxing-style multi-currency Pricing & Profit Trial calculator.
 */
export function calculatePricingProfitTrial(params: {
  sellingPriceLocal: number;
  fxRateToCny: number;
  purchaseCostCny: number;
  headFreightCny: number;
  fbaFeeLocal: number;
  referralFeePercent: number;
  storageFeeLocal?: number;
  refundRatePercent?: number;
  tacosPercent?: number;
  otherCostLocal?: number;
}): {
  unitCogsLocal: number;
  referralFeeLocal: number;
  refundLossLocal: number;
  adCostLocal: number;
  totalCostLocal: number;
  unitProfitLocal: number;
  unitProfitCny: number;
  netMarginPercent: number;
  roiPercent: number;
  breakevenAcosPercent: number;
} {
  const price = Math.max(0, Number.isFinite(params.sellingPriceLocal) ? params.sellingPriceLocal : 0);
  const fx = params.fxRateToCny > 0 && Number.isFinite(params.fxRateToCny) ? params.fxRateToCny : 7.24;
  const purchaseCny = Math.max(0, params.purchaseCostCny || 0);
  const freightCny = Math.max(0, params.headFreightCny || 0);
  const fbaFee = Math.max(0, params.fbaFeeLocal || 0);
  const refPct = Math.max(0, params.referralFeePercent || 0);
  const storage = Math.max(0, params.storageFeeLocal || 0);
  const refundPct = Math.max(0, params.refundRatePercent || 0);
  const tacosPct = Math.max(0, params.tacosPercent || 0);
  const other = Math.max(0, params.otherCostLocal || 0);

  const unitCogsLocal = (purchaseCny + freightCny) / fx;
  const referralFeeLocal = price * (refPct / 100);
  const refundLossLocal = price * (refundPct / 100) * 0.85;
  const adCostLocal = price * (tacosPct / 100);
  const totalCostLocal = unitCogsLocal + referralFeeLocal + fbaFee + storage + refundLossLocal + adCostLocal + other;
  const unitProfitLocal = price - totalCostLocal;
  const unitProfitCny = unitProfitLocal * fx;
  const netMarginPercent = price > 0 ? (unitProfitLocal / price) * 100 : 0;
  const roiPercent = unitCogsLocal > 0 ? (unitProfitLocal / unitCogsLocal) * 100 : 0;
  const preAdProfitLocal = price - (unitCogsLocal + referralFeeLocal + fbaFee + storage + refundLossLocal + other);
  const breakevenAcosPercent = price > 0 ? Math.max(0, (preAdProfitLocal / price) * 100) : 0;

  return {
    unitCogsLocal: Number(unitCogsLocal.toFixed(2)),
    referralFeeLocal: Number(referralFeeLocal.toFixed(2)),
    refundLossLocal: Number(refundLossLocal.toFixed(2)),
    adCostLocal: Number(adCostLocal.toFixed(2)),
    totalCostLocal: Number(totalCostLocal.toFixed(2)),
    unitProfitLocal: Number(unitProfitLocal.toFixed(2)),
    unitProfitCny: Number(unitProfitCny.toFixed(2)),
    netMarginPercent: Number(netMarginPercent.toFixed(2)),
    roiPercent: Number(roiPercent.toFixed(1)),
    breakevenAcosPercent: Number(breakevenAcosPercent.toFixed(1)),
  };
}

export type SiteDateMode = 'PER_SITE' | 'LATEST_SITE' | 'BEIJING';
export type SalesTimeWindow = 'TODAY' | 'YESTERDAY' | '7D' | '30D';

export const MARKETPLACE_TIMEZONE_MAP: Record<MarketplaceCode, string> = {
  US: 'America/Los_Angeles',
  CA: 'America/Los_Angeles',
  MX: 'America/Mexico_City',
  BR: 'America/Sao_Paulo',
  UK: 'Europe/London',
  DE: 'Europe/Berlin',
  FR: 'Europe/Berlin',
  IT: 'Europe/Berlin',
  ES: 'Europe/Berlin',
  JP: 'Asia/Tokyo',
  AU: 'Australia/Sydney',
};

export const CURRENCY_TO_USD_RATE: Record<CurrencyCode, number> = {
  USD: 1,
  CAD: 0.73,
  MXN: 0.05,
  BRL: 0.18,
  GBP: 1.27,
  EUR: 1.08,
  JPY: 0.0066,
  AUD: 0.65,
  CNY: 0.138,
};

function inferCurrencyFromMarketplace(mp?: MarketplaceCode): CurrencyCode {
  if (mp === 'CA') return 'CAD';
  if (mp === 'MX') return 'MXN';
  if (mp === 'BR') return 'BRL';
  if (mp === 'UK') return 'GBP';
  if (mp === 'DE' || mp === 'FR' || mp === 'IT' || mp === 'ES') return 'EUR';
  if (mp === 'JP') return 'JPY';
  if (mp === 'AU') return 'AUD';
  return 'USD';
}

/**
 * Builds a CurrencyCode -> USD multiplier lookup from live Lingxing MCP ExchangeRateItem records.
 */
export function buildUsdRateMapFromExchangeRates(
  exchangeRates?: ExchangeRateItem[]
): Partial<Record<CurrencyCode, number>> {
  const map: Partial<Record<CurrencyCode, number>> = {};
  if (!Array.isArray(exchangeRates) || exchangeRates.length === 0) return map;
  for (const item of exchangeRates) {
    if (
      item &&
      item.currencyCode &&
      typeof item.rateToUsd === 'number' &&
      Number.isFinite(item.rateToUsd) &&
      item.rateToUsd > 0
    ) {
      map[item.currencyCode] = item.rateToUsd;
    }
  }
  return map;
}

/**
 * Resolves the active USD -> CNY exchange rate from live Lingxing MCP rates (with safe fallback).
 */
export function getUsdToCnyRateFromExchangeRates(
  exchangeRates?: ExchangeRateItem[],
  fallback = 7.24
): number {
  const safeFallback = fallback > 0 && Number.isFinite(fallback) ? fallback : 7.24;
  if (!Array.isArray(exchangeRates) || exchangeRates.length === 0) return safeFallback;
  const usdRow = exchangeRates.find((r) => r.currencyCode === 'USD' && r.rateToCny > 0);
  if (usdRow) return Number(usdRow.rateToCny.toFixed(4));
  const cnyRow = exchangeRates.find((r) => r.currencyCode === 'CNY' && r.rateToUsd > 0);
  if (cnyRow) return Number((1 / cnyRow.rateToUsd).toFixed(4));
  return safeFallback;
}

/**
 * Converts a native marketplace amount into USD equivalent (Zero-NaN safe).
 * Prioritizes live Lingxing MCP exchange rates when provided, falling back to CURRENCY_TO_USD_RATE.
 */
export function convertAmountToUsd(
  amount: number,
  currency?: CurrencyCode | string,
  marketplace?: MarketplaceCode,
  customRates?: Partial<Record<CurrencyCode, number>> | ExchangeRateItem[]
): number {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const upper = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  const resolved: CurrencyCode =
    upper && upper in CURRENCY_TO_USD_RATE
      ? (upper as CurrencyCode)
      : inferCurrencyFromMarketplace(marketplace);

  let rate: number | undefined;
  if (Array.isArray(customRates)) {
    const matched = customRates.find((r) => r.currencyCode === resolved && r.rateToUsd > 0);
    if (matched) rate = matched.rateToUsd;
  } else if (customRates && typeof customRates === 'object') {
    const candidate = customRates[resolved];
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      rate = candidate;
    }
  }

  const finalRate = rate ?? CURRENCY_TO_USD_RATE[resolved] ?? 1;
  return Number((safeAmount * finalRate).toFixed(2));
}

/**
 * Checks whether an order is canceled (excluded from Lingxing default order/unit counts).
 * Shipped orders that were later returned (isReturnOrder / REFUNDED with non-Canceled rawOrderStatus)
 * remain counted as valid placed orders on their purchase date.
 */
export function isOrderCanceled(
  order: Pick<AmazonOrderItem, 'orderStatus' | 'rawOrderStatus'>
): boolean {
  if (order.orderStatus === 'CANCELED') return true;
  if (order.rawOrderStatus && /cancel/i.test(order.rawOrderStatus)) return true;
  return false;
}

/**
 * Checks whether an order is an Amazon replacement/reship order (换货单),
 * which Lingxing ERP excludes from default net sales volume.
 */
export function isOrderReplacement(
  order: Pick<AmazonOrderItem, 'isReplacementOrder'>
): boolean {
  return Boolean(order.isReplacementOrder);
}

/**
 * Formats a Date into YYYY-MM-DD in the given IANA timezone and optionally shifts by offsetDays
 * using pure calendar-day UTC arithmetic (immune to 23h/25h DST transitions).
 */
export function getCalendarDateInTimeZone(
  date: Date,
  timeZone: string,
  offsetDays = 0
): string {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  let ymd: string;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(safeDate);
    const y = parts.find((p) => p.type === 'year')?.value || '1970';
    const m = parts.find((p) => p.type === 'month')?.value || '01';
    const d = parts.find((p) => p.type === 'day')?.value || '01';
    ymd = `${y}-${m}-${d}`;
  } catch {
    ymd = safeDate.toISOString().slice(0, 10);
  }
  if (!offsetDays) return ymd;
  const [yy, mm, dd] = ymd.split('-').map(Number);
  const shifted = new Date(Date.UTC(yy, mm - 1, dd + offsetDays));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Returns the inclusive [startDate, endDate] (YYYY-MM-DD) for a marketplace under Lingxing date modes:
 * - PER_SITE: each marketplace uses its own Amazon site timezone (Lingxing default)
 * - LATEST_SITE: all marketplaces aligned to US Pacific (America/Los_Angeles)
 * - BEIJING: all marketplaces aligned to Beijing time (Asia/Shanghai)
 * When endAtYesterday is true on 7D/30D windows, returns completed-day ranges [yesterday-6..yesterday] / [yesterday-29..yesterday].
 */
export function getTargetDateRangeForMarketplace(
  marketplace: MarketplaceCode,
  window: SalesTimeWindow,
  siteDateMode: SiteDateMode = 'PER_SITE',
  nowDate: Date = new Date(),
  endAtYesterday = false
): { startDate: string; endDate: string; timeZone: string } {
  const timeZone =
    siteDateMode === 'LATEST_SITE'
      ? 'America/Los_Angeles'
      : siteDateMode === 'BEIJING'
      ? 'Asia/Shanghai'
      : MARKETPLACE_TIMEZONE_MAP[marketplace] || 'America/Los_Angeles';

  const today = getCalendarDateInTimeZone(nowDate, timeZone, 0);
  const yesterday = getCalendarDateInTimeZone(nowDate, timeZone, -1);
  if (window === 'TODAY') {
    return { startDate: today, endDate: today, timeZone };
  }
  if (window === 'YESTERDAY') {
    return { startDate: yesterday, endDate: yesterday, timeZone };
  }
  if (window === '7D') {
    if (endAtYesterday) {
      const start7 = getCalendarDateInTimeZone(nowDate, timeZone, -7);
      return { startDate: start7, endDate: yesterday, timeZone };
    }
    const start7 = getCalendarDateInTimeZone(nowDate, timeZone, -6);
    return { startDate: start7, endDate: today, timeZone };
  }
  if (endAtYesterday) {
    const start30 = getCalendarDateInTimeZone(nowDate, timeZone, -30);
    return { startDate: start30, endDate: yesterday, timeZone };
  }
  const start30 = getCalendarDateInTimeZone(nowDate, timeZone, -29);
  return { startDate: start30, endDate: today, timeZone };
}

function parseUtcTimestamp(raw?: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Normalize "YYYY-MM-DD HH:MM:SS" without timezone into explicit UTC ISO
  const normalized =
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(trimmed)
      ? `${trimmed.replace(' ', 'T')}Z`
      : trimmed;
  const dt = new Date(normalized);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Extracts the YYYY-MM-DD date string of an Amazon order according to the selected siteDateMode.
 */
export function getOrderEffectiveDateStr(
  order: Pick<AmazonOrderItem, 'purchaseDate' | 'purchaseDateUtc' | 'marketplace'>,
  siteDateMode: SiteDateMode = 'PER_SITE'
): string {
  const localYmd = (order.purchaseDate || '').trim().slice(0, 10);
  const validLocalYmd = /^\d{4}-\d{2}-\d{2}$/.test(localYmd) ? localYmd : '';

  if (siteDateMode === 'PER_SITE') {
    if (validLocalYmd) return validLocalYmd;
    const utcDt = parseUtcTimestamp(order.purchaseDateUtc);
    if (utcDt) {
      return getCalendarDateInTimeZone(
        utcDt,
        MARKETPLACE_TIMEZONE_MAP[order.marketplace] || 'America/Los_Angeles'
      );
    }
    return '';
  }

  const targetTz = siteDateMode === 'BEIJING' ? 'Asia/Shanghai' : 'America/Los_Angeles';
  const utcDt = parseUtcTimestamp(order.purchaseDateUtc);
  if (utcDt) {
    return getCalendarDateInTimeZone(utcDt, targetTz);
  }
  return validLocalYmd;
}

/**
 * Deduplicates orders strictly by amazonOrderId (keeps the most informative record if stale duplicates exist).
 */
export function deduplicateAmazonOrders(orders: AmazonOrderItem[]): AmazonOrderItem[] {
  const byOrderId = new Map<string, AmazonOrderItem>();
  for (const ord of orders) {
    const key = (ord.amazonOrderId || ord.id).trim();
    if (!key) continue;
    const existing = byOrderId.get(key);
    if (!existing) {
      byOrderId.set(key, ord);
      continue;
    }
    const existingScore =
      (existing.asin && existing.asin !== 'N/A' ? 2 : 0) +
      (existing.orderAmountUsd > 0 ? 2 : 0) +
      (existing.items?.length || 0);
    const nextScore =
      (ord.asin && ord.asin !== 'N/A' ? 2 : 0) +
      (ord.orderAmountUsd > 0 ? 2 : 0) +
      (ord.items?.length || 0);
    if (nextScore >= existingScore) {
      byOrderId.set(key, ord);
    }
  }
  return Array.from(byOrderId.values());
}

export interface LingxingShopWindowBreakdown {
  shopId: string;
  shopName: string;
  marketplace: MarketplaceCode;
  currency: CurrencyCode;
  currencyIcon: string;
  targetDateLabel: string;
  orderCount: number;
  canceledOrderCount: number;
  replacementOrderCount: number;
  unitVolume: number;
  revenueOrig: number;
  revenueUsd: number;
}

export interface LingxingWindowSalesSummary {
  window: SalesTimeWindow;
  siteDateMode: SiteDateMode;
  source: 'ORDERS' | 'LISTINGS_FALLBACK';
  fxSource: 'LINGXING_MCP' | 'FALLBACK';
  orderCount: number;
  unitVolume: number;
  canceledOrderCount: number;
  replacementOrderCount: number;
  replacementUnitCount: number;
  pendingOrderCount: number;
  refundedOrderCount: number;
  refundedAmountUsd: number;
  revenueUsd: number;
  avgSellingPriceUsd: number;
  unitsPerOrder: number;
  listingSnapshotUnits: number;
  byShop: LingxingShopWindowBreakdown[];
}

/**
 * Lingxing-aligned Real-Time Sales aggregation engine.
 * Computes exact distinct orderCount (有效订单量·单), unitVolume (总销量·件), and FX-converted USD revenue
 * directly from synced amazon_sales_order_list records (excluding Canceled & Replacement orders by default),
 * with live Lingxing MCP exchange rates and transparent per-shop breakdown.
 */
export function calculateLingxingWindowSales(params: {
  orders: AmazonOrderItem[];
  listings: AmazonListingItem[];
  window: SalesTimeWindow;
  siteDateMode: SiteDateMode;
  includeCanceled?: boolean;
  excludeReplacement?: boolean;
  endAtYesterday?: boolean;
  exchangeRates?: ExchangeRateItem[];
  nowDate?: Date;
}): LingxingWindowSalesSummary {
  const nowDate = params.nowDate ?? new Date();
  const includeCanceled = Boolean(params.includeCanceled);
  const excludeReplacement = params.excludeReplacement !== false;
  const endAtYesterday = Boolean(params.endAtYesterday);
  const customRateMap = buildUsdRateMapFromExchangeRates(params.exchangeRates);
  const fxSource: 'LINGXING_MCP' | 'FALLBACK' =
    Object.keys(customRateMap).length > 0 ? 'LINGXING_MCP' : 'FALLBACK';

  const listingSnapshotUnits =
    params.window === 'TODAY'
      ? params.listings.reduce((s, l) => s + (l.todayVolume || 0), 0)
      : params.window === 'YESTERDAY'
      ? params.listings.reduce((s, l) => s + (l.yesterdayVolume || 0), 0)
      : params.window === '7D'
      ? Math.round(params.listings.reduce((s, l) => s + (l.dailySales7d || 0) * 7, 0))
      : params.listings.reduce((s, l) => s + (l.orders30d || 0), 0);

  const dedupedOrders = deduplicateAmazonOrders(params.orders);

  if (dedupedOrders.length === 0) {
    const fallbackRevUsd = params.listings.reduce((sum, l) => {
      const origAmt =
        params.window === 'TODAY'
          ? (l.todayVolume || 0) * (l.priceOrig || 0)
          : params.window === 'YESTERDAY'
          ? l.yesterdayAmount || (l.yesterdayVolume || 0) * (l.priceOrig || 0)
          : params.window === '7D'
          ? l.sevenAmount || (l.dailySales7d || 0) * 7 * (l.priceOrig || 0)
          : l.revenue30dUsd || 0;
      return sum + convertAmountToUsd(origAmt, l.currency, l.marketplace, customRateMap);
    }, 0);

    return {
      window: params.window,
      siteDateMode: params.siteDateMode,
      source: 'LISTINGS_FALLBACK',
      fxSource,
      orderCount: listingSnapshotUnits,
      unitVolume: listingSnapshotUnits,
      canceledOrderCount: 0,
      replacementOrderCount: 0,
      replacementUnitCount: 0,
      pendingOrderCount: 0,
      refundedOrderCount: 0,
      refundedAmountUsd: 0,
      revenueUsd: Number(fallbackRevUsd.toFixed(2)),
      avgSellingPriceUsd:
        listingSnapshotUnits > 0 ? Number((fallbackRevUsd / listingSnapshotUnits).toFixed(2)) : 0,
      unitsPerOrder: listingSnapshotUnits > 0 ? 1 : 0,
      listingSnapshotUnits,
      byShop: [],
    };
  }

  let orderCount = 0;
  let unitVolume = 0;
  let canceledOrderCount = 0;
  let replacementOrderCount = 0;
  let replacementUnitCount = 0;
  let pendingOrderCount = 0;
  let refundedOrderCount = 0;
  let refundedAmountUsd = 0;
  let revenueUsd = 0;

  const shopBuckets = new Map<string, LingxingShopWindowBreakdown>();

  for (const ord of dedupedOrders) {
    const range = getTargetDateRangeForMarketplace(
      ord.marketplace,
      params.window,
      params.siteDateMode,
      nowDate,
      endAtYesterday
    );
    const ordDate = getOrderEffectiveDateStr(ord, params.siteDateMode);
    if (!ordDate || ordDate < range.startDate || ordDate > range.endDate) {
      continue;
    }

    const shopKey = `${ord.shopId || ord.shopName}::${ord.marketplace}`;
    const resolvedCurrency = ord.currency || inferCurrencyFromMarketplace(ord.marketplace);
    const targetDateLabel =
      range.startDate === range.endDate
        ? range.startDate
        : `${range.startDate.slice(5)}~${range.endDate.slice(5)}`;

    let bucket = shopBuckets.get(shopKey);
    if (!bucket) {
      bucket = {
        shopId: ord.shopId,
        shopName: ord.shopName,
        marketplace: ord.marketplace,
        currency: resolvedCurrency,
        currencyIcon: ord.currencyIcon || '$',
        targetDateLabel,
        orderCount: 0,
        canceledOrderCount: 0,
        replacementOrderCount: 0,
        unitVolume: 0,
        revenueOrig: 0,
        revenueUsd: 0,
      };
      shopBuckets.set(shopKey, bucket);
    }

    const canceled = isOrderCanceled(ord);
    if (canceled) {
      canceledOrderCount += 1;
      bucket.canceledOrderCount += 1;
      if (!includeCanceled) {
        continue;
      }
    }

    const qty = Math.max(1, Math.round(ord.quantity || 1));
    const replacement = isOrderReplacement(ord);
    if (replacement) {
      replacementOrderCount += 1;
      replacementUnitCount += qty;
      bucket.replacementOrderCount += 1;
      if (excludeReplacement) {
        continue;
      }
    }

    if (ord.orderStatus === 'PENDING') {
      pendingOrderCount += 1;
    }

    const amtOrig = Math.max(0, Number.isFinite(ord.orderAmountUsd) ? ord.orderAmountUsd : 0);
    const amtUsd = convertAmountToUsd(amtOrig, resolvedCurrency, ord.marketplace, customRateMap);

    if (ord.orderStatus === 'REFUNDED' || ord.isReturnOrder) {
      refundedOrderCount += 1;
      refundedAmountUsd += amtUsd;
    }

    orderCount += 1;
    unitVolume += qty;
    revenueUsd += amtUsd;

    bucket.orderCount += 1;
    bucket.unitVolume += qty;
    bucket.revenueOrig = Number((bucket.revenueOrig + amtOrig).toFixed(2));
    bucket.revenueUsd = Number((bucket.revenueUsd + amtUsd).toFixed(2));
  }

  const roundedRevUsd = Number(revenueUsd.toFixed(2));
  const roundedRefundUsd = Number(refundedAmountUsd.toFixed(2));
  return {
    window: params.window,
    siteDateMode: params.siteDateMode,
    source: 'ORDERS',
    fxSource,
    orderCount,
    unitVolume,
    canceledOrderCount,
    replacementOrderCount,
    replacementUnitCount,
    pendingOrderCount,
    refundedOrderCount,
    refundedAmountUsd: roundedRefundUsd,
    revenueUsd: roundedRevUsd,
    avgSellingPriceUsd:
      unitVolume > 0 ? Number((roundedRevUsd / unitVolume).toFixed(2)) : 0,
    unitsPerOrder:
      orderCount > 0 ? Number((unitVolume / orderCount).toFixed(2)) : 0,
    listingSnapshotUnits,
    byShop: Array.from(shopBuckets.values()).sort(
      (a, b) => b.orderCount - a.orderCount || b.revenueUsd - a.revenueUsd
    ),
  };
}

export interface LingxingAdUsdSummary {
  fxSource: 'LINGXING_MCP' | 'FALLBACK';
  spendUsd: number;
  salesUsd: number;
  clicks: number;
  impressions: number;
  adOrders: number;
  ctrPercent: number;
  cpcUsd: number;
  acosPercent: number;
  roas: number;
  overBudgetCount: number;
  enabledCount: number;
  byAdType: Record<'SP' | 'SB' | 'SD', { count: number; spendUsd: number; salesUsd: number }>;
}

/**
 * Aggregates multi-currency Amazon Advertising campaigns into exact USD using live Lingxing MCP exchange rates.
 */
export function calculateLingxingAdSummary(
  campaigns: AdCampaignItem[],
  exchangeRates?: ExchangeRateItem[]
): LingxingAdUsdSummary {
  const customRateMap = buildUsdRateMapFromExchangeRates(exchangeRates);
  const fxSource: 'LINGXING_MCP' | 'FALLBACK' =
    Object.keys(customRateMap).length > 0 ? 'LINGXING_MCP' : 'FALLBACK';

  let spendUsd = 0;
  let salesUsd = 0;
  let clicks = 0;
  let impressions = 0;
  let adOrders = 0;
  let overBudgetCount = 0;
  let enabledCount = 0;
  const byAdType: LingxingAdUsdSummary['byAdType'] = {
    SP: { count: 0, spendUsd: 0, salesUsd: 0 },
    SB: { count: 0, spendUsd: 0, salesUsd: 0 },
    SD: { count: 0, spendUsd: 0, salesUsd: 0 },
  };

  for (const c of campaigns) {
    const cSpendUsd = convertAmountToUsd(c.spend30dUsd, c.currency, c.marketplace, customRateMap);
    const cSalesUsd = convertAmountToUsd(c.sales30dUsd, c.currency, c.marketplace, customRateMap);
    spendUsd += cSpendUsd;
    salesUsd += cSalesUsd;
    clicks += Math.max(0, Math.round(c.clicks30d || 0));
    impressions += Math.max(0, Math.round(c.impressions30d || 0));
    adOrders += Math.max(0, Math.round(c.orders30d || 0));
    if (c.isOverBudget) overBudgetCount += 1;
    if (c.status === 'ENABLED') enabledCount += 1;
    const bucket = byAdType[c.adType] || byAdType.SP;
    bucket.count += 1;
    bucket.spendUsd = Number((bucket.spendUsd + cSpendUsd).toFixed(2));
    bucket.salesUsd = Number((bucket.salesUsd + cSalesUsd).toFixed(2));
  }

  const roundedSpend = Number(spendUsd.toFixed(2));
  const roundedSales = Number(salesUsd.toFixed(2));

  return {
    fxSource,
    spendUsd: roundedSpend,
    salesUsd: roundedSales,
    clicks,
    impressions,
    adOrders,
    ctrPercent: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpcUsd: clicks > 0 ? Number((roundedSpend / clicks).toFixed(2)) : 0,
    acosPercent: roundedSales > 0 ? Number(((roundedSpend / roundedSales) * 100).toFixed(2)) : 0,
    roas: roundedSpend > 0 ? Number((roundedSales / roundedSpend).toFixed(2)) : 0,
    overBudgetCount,
    enabledCount,
    byAdType,
  };
}

export interface LingxingSettlementUsdSummary {
  fxSource: 'LINGXING_MCP' | 'FALLBACK';
  periodCount: number;
  grossSalesUsd: number;
  amazonFeesUsd: number;
  adSpendUsd: number;
  refundsUsd: number;
  netPayoutUsd: number;
}

/**
 * Aggregates recent Settlement periods (within last `windowDays` days) into exact USD using live Lingxing MCP exchange rates.
 */
export function calculateLingxingSettlementSummary(
  settlements: SettlementPeriodItem[],
  exchangeRates?: ExchangeRateItem[],
  windowDays = 30,
  nowDate: Date = new Date()
): LingxingSettlementUsdSummary {
  const customRateMap = buildUsdRateMapFromExchangeRates(exchangeRates);
  const fxSource: 'LINGXING_MCP' | 'FALLBACK' =
    Object.keys(customRateMap).length > 0 ? 'LINGXING_MCP' : 'FALLBACK';

  const cutoffYmd = getCalendarDateInTimeZone(nowDate, 'UTC', -Math.max(1, windowDays));
  let periodCount = 0;
  let grossSalesUsd = 0;
  let amazonFeesUsd = 0;
  let adSpendUsd = 0;
  let refundsUsd = 0;
  let netPayoutUsd = 0;

  for (const s of settlements) {
    const endPart = (s.periodRange || '').split('~')[1]?.trim().slice(0, 10) || '';
    const startPart = (s.periodRange || '').split('~')[0]?.trim().slice(0, 10) || '';
    const refDate =
      /^\d{4}-\d{2}-\d{2}$/.test(endPart)
        ? endPart
        : /^\d{4}-\d{2}-\d{2}$/.test(s.payoutDate || '')
        ? s.payoutDate.slice(0, 10)
        : /^\d{4}-\d{2}-\d{2}$/.test(startPart)
        ? startPart
        : '';

    if (refDate && refDate < cutoffYmd) {
      continue;
    }

    periodCount += 1;
    grossSalesUsd += convertAmountToUsd(s.grossSalesUsd, s.currency, s.marketplace, customRateMap);
    amazonFeesUsd += convertAmountToUsd(s.amazonFeesUsd, s.currency, s.marketplace, customRateMap);
    adSpendUsd += convertAmountToUsd(s.adSpendUsd, s.currency, s.marketplace, customRateMap);
    refundsUsd += convertAmountToUsd(s.refundsUsd, s.currency, s.marketplace, customRateMap);
    netPayoutUsd += convertAmountToUsd(s.netPayoutUsd, s.currency, s.marketplace, customRateMap);
  }

  return {
    fxSource,
    periodCount,
    grossSalesUsd: Number(grossSalesUsd.toFixed(2)),
    amazonFeesUsd: Number(amazonFeesUsd.toFixed(2)),
    adSpendUsd: Number(adSpendUsd.toFixed(2)),
    refundsUsd: Number(refundsUsd.toFixed(2)),
    netPayoutUsd: Number(netPayoutUsd.toFixed(2)),
  };
}



