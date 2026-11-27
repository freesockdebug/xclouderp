export type SubscriptionPlanCode = 'FREE' | 'TRIAL' | 'PRO' | 'ENTERPRISE';

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'EXPIRED_READONLY'
  | 'SUSPENDED';

export type MarketplaceCode =
  | 'US'
  | 'CA'
  | 'MX'
  | 'BR'
  | 'UK'
  | 'DE'
  | 'FR'
  | 'IT'
  | 'ES'
  | 'JP'
  | 'AU';

export type CurrencyCode =
  | 'USD'
  | 'CAD'
  | 'MXN'
  | 'BRL'
  | 'GBP'
  | 'EUR'
  | 'JPY'
  | 'AUD'
  | 'CNY';

export type PortalMode = 'PLATFORM_SUPER_ADMIN' | 'TENANT_WORKSPACE';

export type TenantIsolationMode =
  | 'SHARED_RLS'
  | 'SCHEMA_PER_TENANT'
  | 'DEDICATED_DB_BYOD';

export type ErpModuleCode =
  | 'core_dashboard'
  | 'mod_amazon_ops'
  | 'mod_purchase_bom'
  | 'mod_warehouse_wms'
  | 'mod_fba_logistics'
  | 'mod_ads_dayparting'
  | 'mod_finance_ledger'
  | 'mod_mcp_gateway';

export type PermissionCode =
  | 'dashboard:view'
  | 'amazon:view'
  | 'amazon:price_edit'
  | 'amazon:order_refund'
  | 'purchase:view'
  | 'purchase:create'
  | 'purchase:approve'
  | 'purchase:receive'
  | 'purchase:bom_execute'
  | 'warehouse:view'
  | 'warehouse:count_adjust'
  | 'warehouse:transfer'
  | 'fba:view'
  | 'fba:create'
  | 'fba:print_label'
  | 'ads:view'
  | 'ads:bid_edit'
  | 'ads:negate_term'
  | 'finance:view'
  | 'finance:cost_view'
  | 'finance:export_csv'
  | 'finance:reconcile'
  | 'lingxing:manage'
  | 'mcp:read'
  | 'mcp:write'
  | 'rbac:manage'
  | 'subscription:manage'
  | 'marketplace:manage'
  | 'workspace:settings';

export interface TenantWorkspaceSettings {
  brandTitle: string;
  brandBadge: string;
  accentColor: 'blue' | 'indigo' | 'emerald' | 'slate' | 'amber';
  defaultFxRateUsdCny: number;
  alertWebhookChannel: 'NONE' | 'FEISHU' | 'WECOM' | 'DINGTALK';
  alertWebhookPlaceholder: string;
  notifyStockout: boolean;
  notifyHijack: boolean;
  notifyExpiry7d: boolean;
}

export interface ErpAppModule {
  moduleCode: ErpModuleCode;
  moduleName: string;
  category: 'CORE' | 'OPERATIONS' | 'SUPPLY_CHAIN' | 'FINANCE' | 'AI_INTEGRATION';
  description: string;
  minPlanCode: SubscriptionPlanCode;
  monthlyAddonPriceCny: number;
  isCoreRequired: boolean;
  isPublished: boolean;
}

export interface TenantInstalledModule {
  id: string;
  tenantId: string;
  moduleCode: ErpModuleCode;
  enabled: boolean;
  installedAt: string;
}

export interface TenantInvitation {
  id: string;
  tenantId: string;
  email: string;
  departmentName: string;
  roleCode: string;
  roleName: string;
  allowedShopIds: string[];
  hidePurchaseCost: boolean;
  inviteToken: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  createdAt: string;
  expiresAt: string;
}

export interface ImpersonationSession {
  sessionId: string;
  platformAdminName: string;
  targetTenantId: string;
  targetTenantCode: string;
  targetTenantSlug: string;
  startedAt: string;
}

export interface SubscriptionPlan {
  planCode: SubscriptionPlanCode;
  planName: string;
  targetAudience: string;
  monthlyPriceCny: number;
  annualPriceCny: number;
  maxShops: number;
  maxUsers: number;
  maxSkus: number;
  maxDaypartingRules: number;
  mcpCallsQuota: number;
  syncIntervalMinutes: number;
}

export type LingxingSyncMode = 'INCREMENTAL' | 'FULL';

export type LingxingIncrementalStrategy =
  | 'UPDATE_TIME_INCREMENTAL'
  | 'LOOKBACK_WINDOW_INCREMENTAL'
  | 'FULL_SNAPSHOT';

export interface LingxingDomainWatermark {
  lastSyncedAt: string;
  lastWindowStartDate?: string;
  lastWindowEndDate?: string;
  mode: LingxingSyncMode;
  strategy: LingxingIncrementalStrategy;
  pendingOrdersChecked?: number;
}

export interface Tenant {
  id: string;
  slug: string;
  tenantCode: string;
  companyName: string;
  logtoOrgId: string;
  isolationMode: TenantIsolationMode;
  dbSchemaName: string;
  cachePrefix: string;
  storageBucketPrefix: string;
  byodSupabaseUrl?: string;
  provisionStatus: 'READY' | 'PROVISIONING' | 'ARCHIVED';
  workspaceSettings: TenantWorkspaceSettings;
  planCode: SubscriptionPlanCode;
  subscriptionStatus: SubscriptionStatus;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  baseCurrency: 'CNY' | 'USD';
  subscriptionEndsAt: string;
  graceEndsAt: string;
  autoRenew: boolean;
  usedShopsCount: number;
  usedUsersCount: number;
  usedSkusCount: number;
  usedMcpCallsMonth: number;
  lingxingMcpUrl: string;
  lingxingMcpKey: string;
  lingxingAppId?: string;
  lingxingConnectionStatus: 'CONNECTED' | 'AUTH_ERROR' | 'PAUSED_BY_EXPIRY';
  lastLingxingSyncAt: string;
  lingxingSyncWatermarks?: Partial<Record<string, LingxingDomainWatermark>>;
}

export interface BillingLicense {
  id: string;
  licenseKey: string;
  targetPlan: SubscriptionPlanCode;
  durationDays: number;
  issuedToTenantCode?: string;
  status: 'UNUSED' | 'REDEEMED' | 'REVOKED';
  createdAt: string;
  redeemedAt?: string;
  redeemedByTenantId?: string;
}

export interface AmazonShop {
  id: string;
  tenantId: string;
  shopName: string;
  sellerId: string;
  marketplace: MarketplaceCode;
  region: 'NA' | 'SA' | 'EU' | 'FE';
  currency: CurrencyCode;
  syncSource: 'LINGXING_MCP' | 'LINGXING_OPENAPI';
  status: 'CONNECTED' | 'PAUSED' | 'ERROR';
  lastSyncedAt: string;
  /** Lingxing native fields (get_my_sids / ad_auth_shops) */
  sid?: number;
  countryName?: string;
  isConcept?: boolean;
  adProfileId?: string;
}

export interface LocalMaterialSku {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  category: string;
  purchaseCostCny: number;
  headFreightPerUnitCny: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  leadTimeDays: number;
  supplierName: string;
  supplier1688Id: string;
  localAvailableQty: number;
  localInboundQty: number;
  warehouseName: string;
  /** Lingxing native fields (inventory_detail_list) */
  productId?: number;
  warehouseId?: number;
  picUrl?: string;
  fnsku?: string;
  mskuList?: string[];
  storeNameList?: string[];
  brandName?: string;
  productStatusName?: string;
  isCombo?: boolean;
  goodLockQty?: number;
  badQty?: number;
  qcQty?: number;
  pendingQty?: number;
  transitQty?: number;
  totalQty?: number;
  safeStockQty?: number;
  averageAgeDays?: number;
  stockPriceCny?: number;
  stockValueCny?: number;
  headStockCostCny?: number;
  transitAmountCny?: number;
  boxPcs?: number;
  boxLengthCm?: number;
  boxWidthCm?: number;
  boxHeightCm?: number;
  boxWeightKg?: number;
}

export interface AmazonListingVariantAttr {
  attrName: string;
  attrValue: string;
}

export interface AmazonListingItem {
  id: string;
  tenantId: string;
  shopId: string;
  shopName: string;
  marketplace: MarketplaceCode;
  asin: string;
  msku: string;
  fnsku: string;
  title: string;
  localSkuId: string;
  localSkuCode: string;
  priceOrig: number;
  currency: CurrencyCode;
  dailySales7d: number;
  dailySales30d: number;
  orders30d: number;
  revenue30dUsd: number;
  fbaAvailable: number;
  fbaInbound: number;
  fbaReserved: number;
  aging0To90Qty: number;
  aging91To180Qty: number;
  aging181PlusQty: number;
  aging90PlusQty: number;
  referralFeeRate: number;
  fbaFeePerUnitUsd: number;
  monthlyStorageFeeUsd: number;
  adSpend30dUsd: number;
  adSales30dUsd: number;
  refundRatePercent: number;
  buyBoxWinner: boolean;
  hijackerCount: number;
  listingStatus: 'ACTIVE' | 'INACTIVE' | 'SUPPRESSED';
  /** Lingxing native fields (erp_listing) */
  storeId?: number;
  marketplaceId?: string;
  parentAsin?: string;
  localName?: string;
  smallImageUrl?: string;
  asinUrl?: string;
  sellerBrand?: string;
  sellerCategory?: string;
  categoryRank?: number;
  smallCategoryName?: string;
  smallCategoryRank?: number;
  stars?: number;
  reviewsNum?: number;
  variantAttrs?: AmazonListingVariantAttr[];
  fulfillmentChannelType?: string;
  currencyIcon?: string;
  listPrice?: number;
  landedPrice?: number;
  b2bPrice?: number;
  shippingPrice?: number;
  referralFeeAmount?: number;
  statusText?: string;
  isPair?: boolean;
  pairType?: string;
  openDate?: string;
  firstOrderTime?: string;
  todayVolume?: number;
  yesterdayVolume?: number;
  yesterdayAmount?: number;
  sevenAmount?: number;
  fourteenVolume?: number;
  fourteenAmount?: number;
  dailySales14d?: number;
  yesterdaySpend?: number;
  sevenSpend?: number;
  fourteenSpend?: number;
  afnUnsellableQty?: number;
  afnInboundWorkingQty?: number;
  afnInboundShippedQty?: number;
  afnInboundReceivingQty?: number;
  reservedCustomerOrdersQty?: number;
  reservedFcTransfersQty?: number;
  reservedFcProcessingQty?: number;
}

export interface AmazonOrderLineItem {
  asin: string;
  sellerSku: string;
  localSku?: string;
  title: string;
  productName?: string;
  quantityOrdered: number;
  picUrl?: string;
  asinUrl?: string;
}

export interface AmazonOrderItem {
  id: string;
  tenantId: string;
  shopId: string;
  shopName: string;
  marketplace: MarketplaceCode;
  amazonOrderId: string;
  fulfillmentChannel: 'FBA' | 'FBM' | 'MCF';
  asin: string;
  msku: string;
  quantity: number;
  orderAmountUsd: number;
  amazonFeeUsd: number;
  orderStatus: 'SHIPPED' | 'PENDING' | 'UNSHIPPED' | 'CANCELED' | 'REFUNDED';
  purchaseDate: string;
  buyerRegion: string;
  returnReason?: string;
  /** Lingxing native fields (amazon_sales_order_list) */
  sid?: number;
  currency?: CurrencyCode;
  currencyIcon?: string;
  rawOrderStatus?: string;
  purchaseDateUtc?: string;
  lastUpdateDate?: string;
  earliestShipDate?: string;
  latestShipDate?: string;
  isPrime?: boolean;
  isBusinessOrder?: boolean;
  isPromotion?: boolean;
  isReplacementOrder?: boolean;
  isReturnOrder?: boolean;
  buyerName?: string;
  buyerEmail?: string;
  remark?: string;
  localSkuCode?: string;
  productTitle?: string;
  picUrl?: string;
  items?: AmazonOrderLineItem[];
}

export interface SupplierProfile {
  id: string;
  tenantId: string;
  supplierCode: string;
  supplierName: string;
  category: string;
  moqUnits: number;
  leadTimeDays: number;
  paymentTerm: string;
  tierPricingNote: string;
  ratingScore: number;
  status: 'ACTIVE' | 'SUSPENDED';
  /** Lingxing native fields (products_extra_get_supplier_map_list) */
  supplierId?: number;
  warehouseId?: number;
  defaultWarehouseName?: string;
  receiptWarehouseId?: number;
  purchaserId?: number;
  purchaserNames?: string[];
}

export interface BomComponentItem {
  sku: string;
  productName: string;
  quantityProcess: number;
  unitsPerBundle: number;
  syncPriceCny: number;
  syncAmountCny: number;
  picUrl?: string;
}

export interface BomAssemblyOrder {
  id: string;
  tenantId: string;
  assemblyNo: string;
  bundleSkuCode: string;
  bundleName: string;
  componentSkuCode: string;
  unitsPerBundle: number;
  targetBundleQty: number;
  status: 'PENDING' | 'COMPLETED';
  createdAt: string;
  /** Lingxing native fields (warehouse_processing_order_list) */
  processOrderId?: number;
  processType?: 'ASSEMBLE' | 'SPLIT';
  warehouseId?: number;
  warehouseName?: string;
  operatorName?: string;
  creatorName?: string;
  finishTime?: string;
  remark?: string;
  picUrl?: string;
  unitCostCny?: number;
  totalCostCny?: number;
  processFeeCny?: number;
  components?: BomComponentItem[];
}

export interface PurchaseOrderLineItem {
  sku: string;
  productName: string;
  picUrl?: string;
  quantityPlan: number;
  quantityReal: number;
  quantityEntry: number;
  priceCny: number;
  amountCny: number;
  taxRate?: number;
  taxAmountCny?: number;
  expectArriveTime?: string;
  warehouseName?: string;
}

export interface PurchaseOrder1688 {
  id: string;
  tenantId: string;
  poNumber: string;
  order1688No: string;
  localSkuCode: string;
  productName: string;
  supplierName: string;
  quantity: number;
  receivedQty: number;
  unitPriceCny: number;
  totalAmountCny: number;
  status: 'DRAFT' | 'APPROVED' | 'ORDERED_1688' | 'IN_TRANSIT' | 'RECEIVED' | 'RETURNED';
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  createdBy: 'USER' | 'MCP_AGENT' | 'SMART_RESTOCK';
  createdAt: string;
  expectedArrivalDate: string;
  /** Lingxing native fields (purchase_order_page_list) */
  lingxingOrderId?: string;
  supplierId?: number;
  warehouseId?: number;
  warehouseName?: string;
  purchaserName?: string;
  creatorName?: string;
  statusText?: string;
  payStatusText?: string;
  signStatusText?: string;
  purchaseTypeText?: string;
  paymentMethodText?: string;
  settlementMethodText?: string;
  qcTypeText?: string;
  currency?: CurrencyCode;
  currencyIcon?: string;
  payAmountCny?: number;
  shippingPriceCny?: number;
  otherFeeCny?: number;
  discountAmountCny?: number;
  isTax?: boolean;
  totalGrossWeightG?: number;
  itemCount?: number;
  quantityNoticed?: number;
  quantityReceivePending?: number;
  quantityReturn?: number;
  isOverdue?: boolean;
  overdueDays?: number;
  remark?: string;
  items?: PurchaseOrderLineItem[];
}

export interface WarehouseStockLedger {
  id: string;
  tenantId: string;
  ledgerNo: string;
  warehouseName: string;
  localSkuCode: string;
  movementType: 'PO_INBOUND' | 'FBA_OUTBOUND' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'COUNT_ADJUST' | 'BOM_CONSUME';
  qtyDelta: number;
  balanceAfter: number;
  referenceDoc: string;
  operatorName: string;
  createdAt: string;
  /** Lingxing native fields (batch_inventory_statement_list) */
  batchNo?: string;
  warehouseId?: number;
  typeCode?: string;
  typeName?: string;
  productName?: string;
  productPic?: string;
  fnsku?: string;
  msku?: string;
  supplierName?: string;
  orderSn?: string;
  deliveryOrderSn?: string;
  purchaseOrderSn?: string;
  goodDelta?: number;
  badDelta?: number;
  qcDelta?: number;
  transitBalanceAfter?: number;
  purchasePriceCny?: number;
  stockPriceCny?: number;
  stockCostCny?: number;
  headStockCostCny?: number;
  batchRemark?: string;
}

export interface FbaShipmentLineItem {
  shipmentId: string;
  sku: string;
  msku: string;
  asin: string;
  fnsku: string;
  productName: string;
  picUrl?: string;
  quantityShipped: number;
  quantityReceived: number;
  diffNum: number;
  shipmentStatus?: string;
}

export interface FbaShipmentPlan {
  id: string;
  tenantId: string;
  shipmentId: string;
  shopName: string;
  marketplace: MarketplaceCode;
  destinationFulfillmentCenter: string;
  shippingMode: 'AIR_EXPRESS' | 'SEA_FAST' | 'SEA_STANDARD';
  carrierName: string;
  trackingNumber: string;
  localSkuCode: string;
  fnsku: string;
  boxCount: number;
  unitsPerBox: number;
  totalUnitsShipped: number;
  totalUnitsReceived: number;
  boxLengthCm: number;
  boxWidthCm: number;
  boxHeightCm: number;
  boxGrossWeightKg: number;
  freightRatePerKgCny: number;
  status: 'WORKING' | 'SHIPPED' | 'IN_TRANSIT' | 'RECEIVING' | 'CLOSED';
  createdAt: string;
  /** Lingxing native fields (get_delivery_order_list) */
  shipmentSn?: string;
  warehouseId?: number;
  warehouseName?: string;
  statusName?: string;
  isAwd?: boolean;
  logisticsChannelName?: string;
  headFeeTypeName?: string;
  predictTotalFeeCny?: number;
  actualTotalFeeCny?: number;
  totalBoxVolume?: number;
  totalBoxVolumeWeightKg?: number;
  itemTotalCount?: number;
  shipmentUser?: string;
  createUser?: string;
  shipmentTime?: string;
  pickTime?: string;
  expectedArrivalDate?: string;
  printStatus?: string;
  remark?: string;
  items?: FbaShipmentLineItem[];
}

export interface FreightChannelQuote {
  id: string;
  carrierName: string;
  channelName: string;
  targetRegion: 'US' | 'EU' | 'UK' | 'JP';
  transportMode: 'AIR_EXPRESS' | 'SEA_FAST' | 'SEA_STANDARD';
  pricePerKgCny: number;
  minWeightKg: number;
  etaDays: string;
  taxIncluded: boolean;
}

export interface AdCampaignItem {
  id: string;
  tenantId: string;
  shopId: string;
  shopName: string;
  marketplace: MarketplaceCode;
  campaignId: string;
  campaignName: string;
  adType: 'SP' | 'SB' | 'SD';
  associatedAsin: string;
  dailyBudgetUsd: number;
  defaultBidUsd: number;
  impressions30d: number;
  clicks30d: number;
  spend30dUsd: number;
  sales30dUsd: number;
  orders30d: number;
  status: 'ENABLED' | 'PAUSED';
  daypartingEnabled: boolean;
  peakHoursRange: string;
  peakBidMultiplierPercent: number;
  offPeakHoursRange: string;
  offPeakBidMultiplierPercent: number;
  /** Lingxing native fields (ad_campaign_report) */
  profileId?: string;
  currency?: CurrencyCode;
  currencyIcon?: string;
  targetingType?: string;
  biddingType?: string;
  budgetTypeLabel?: string;
  servingStatus?: string;
  portfolioName?: string;
  startDate?: string;
  ctrPercent?: number;
  cpcAmount?: number;
  cvrPercent?: number;
  cpaAmount?: number;
  acosPercent?: number;
  roasValue?: number;
  directOrders?: number;
  directSales?: number;
  indirectOrders?: number;
  indirectSales?: number;
  adUnits?: number;
  suggestionBudget?: number;
  surplusBudgetTip?: string;
  surplusBudgetPercent?: number;
  isOverBudget?: boolean;
  lastOverBudgetAt?: string;
  placementTopPercent?: number;
  topOfSearchImpressionShare?: number;
}

export interface AdSearchTermItem {
  id: string;
  tenantId: string;
  campaignId: string;
  campaignName: string;
  marketplace: MarketplaceCode;
  searchTerm: string;
  matchType: 'BROAD' | 'PHRASE' | 'EXACT' | 'AUTO';
  impressions: number;
  clicks: number;
  spendUsd: number;
  salesUsd: number;
  orders: number;
  negatedStatus: 'ACTIVE' | 'NEGATIVE_EXACT' | 'NEGATIVE_PHRASE';
  /** Lingxing native fields (ad_campaign_search_term_report) */
  storeName?: string;
  profileId?: string;
  adGroupId?: string;
  adGroupName?: string;
  adSponsoredType?: string;
  targetingTextZh?: string;
  expTypeText?: string;
  currency?: CurrencyCode;
  currencyIcon?: string;
  ctrPercent?: number;
  cpcAmount?: number;
  cvrPercent?: number;
  cpaAmount?: number;
  acosPercent?: number;
  roasValue?: number;
  directOrders?: number;
  directSales?: number;
  indirectOrders?: number;
  indirectSales?: number;
  adUnits?: number;
  bidAmount?: number;
  isAsinTarget?: boolean;
}

export interface SettlementPeriodItem {
  id: string;
  tenantId: string;
  shopId: string;
  shopName: string;
  marketplace: MarketplaceCode;
  settlementId: string;
  periodRange: string;
  grossSalesUsd: number;
  amazonFeesUsd: number;
  adSpendUsd: number;
  refundsUsd: number;
  reserveHeldUsd: number;
  netPayoutUsd: number;
  reconcileStatus: 'PENDING' | 'RECONCILED';
  payoutDate: string;
  /** Lingxing native fields (settlement_sc_summary_list) */
  sid?: number;
  financialEventGroupId?: string;
  accountType?: string;
  processingStatus?: string;
  fundTransferStatus?: string;
  currency?: CurrencyCode;
  currencyIcon?: string;
  convertedCurrencyCode?: string;
  convertedTotalAmount?: number;
  remittanceRate?: number;
  accountTail?: string;
  reconciliationResultText?: string;
  storageFees?: number;
  promotionFees?: number;
  otherFees?: number;
  previousReserveAmount?: number;
  beginningBalanceAmount?: number;
  saleProductAmount?: number;
  saleFreightAmount?: number;
  saleTaxAmount?: number;
}

export interface ExtraExpenseItem {
  id: string;
  tenantId: string;
  expenseNo: string;
  category: 'OFFSITE_PROMO' | 'SAMPLE_COST' | 'CERTIFICATION' | 'STORAGE_EXTRA';
  targetAsin: string;
  amountUsd: number;
  note: string;
  recordedAt: string;
}

export interface RbacRoleDefinition {
  id: string;
  tenantId: string;
  roleCode: string;
  roleName: string;
  description: string;
  isSystemRole: boolean;
  permissions: PermissionCode[];
}

export interface RbacTeamMember {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  departmentName: string;
  roleCode: string;
  roleName: string;
  authProvider: 'SUPABASE_AUTH' | 'LOGTO_OIDC';
  allowedShopIds: string[];
  hidePurchaseCost: boolean;
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt: string;
}

export interface McpTokenItem {
  id: string;
  tenantId: string;
  tokenName: string;
  tokenPreview: string;
  fullTokenValue: string;
  permissionScope: 'READ_ONLY' | 'READ_WRITE';
  authMode: 'PAT_STATIC' | 'LOGTO_OAUTH21';
  callsCountMonth: number;
  lastUsedAt: string;
  status: 'ACTIVE' | 'REVOKED';
}

export interface AuditLogItem {
  id: string;
  tenantId: string;
  scope: 'PLATFORM' | 'TENANT';
  actorType: 'PLATFORM_ADMIN' | 'USER' | 'LINGXING_MCP_CRON' | 'MCP_AI_AGENT' | 'BILLING_SYSTEM';
  actorName: string;
  action: string;
  targetEntity: string;
  detail: string;
  createdAt: string;
}

export interface ExchangeRateItem {
  id: string;
  tenantId: string;
  currencyCode: CurrencyCode;
  currencyName: string;
  currencyIcon: string;
  rateDate: string;
  officialRate: number;
  myRate: number;
  effectiveRate: number;
  /** Multiplier to convert 1 unit of currencyCode into USD (e.g. USD=1, JPY≈0.0066, CAD≈0.73) */
  rateToUsd: number;
  /** Multiplier to convert 1 unit of currencyCode into CNY (e.g. CNY=1, USD≈7.24) */
  rateToCny: number;
  source: 'LINGXING_MCP' | 'FALLBACK';
  updatedAt: string;
}

export interface LingxingProfitSummaryItem {
  id: string;
  tenantId: string;
  windowKey: '30D' | '7D' | 'YESTERDAY' | 'TODAY';
  dateRange: string;
  currency: CurrencyCode;
  salesVolume: number;
  salesVolumeMomPct?: number;
  salesVolumeYoyPct?: number;
  orderCount: number;
  salesAmountUsd: number;
  salesAmountMomPct?: number;
  salesAmountYoyPct?: number;
  adSpendUsd: number;
  adSpendMomPct?: number;
  adSpendYoyPct?: number;
  adSalesUsd: number;
  adSalesMomPct?: number;
  adSalesYoyPct?: number;
  acosPercent: number;
  acosMomPct?: number;
  acosYoyPct?: number;
  refundAmountUsd: number;
  refundAmountMomPct?: number;
  refundAmountYoyPct?: number;
  settlementGrossProfitUsd: number;
  settlementGrossProfitMomPct?: number;
  settlementGrossProfitYoyPct?: number;
  settlementGrossMarginPercent: number;
  settlementGrossMarginMomPct?: number;
  settlementGrossMarginYoyPct?: number;
  sourceToolName: string;
  syncedAt: string;
}

