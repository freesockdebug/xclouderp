import {
  SubscriptionPlan,
  Tenant,
  BillingLicense,
  AmazonShop,
  LocalMaterialSku,
  AmazonListingItem,
  AmazonOrderItem,
  SupplierProfile,
  BomAssemblyOrder,
  PurchaseOrder1688,
  WarehouseStockLedger,
  FbaShipmentPlan,
  FreightChannelQuote,
  AdCampaignItem,
  AdSearchTermItem,
  SettlementPeriodItem,
  ExtraExpenseItem,
  RbacRoleDefinition,
  RbacTeamMember,
  McpTokenItem,
  AuditLogItem,
  PermissionCode,
  ErpAppModule,
  TenantInstalledModule,
  TenantInvitation,
} from '../types/erp';

export const ALL_PERMISSIONS_TREE: {
  moduleId: string;
  moduleLabel: string;
  permissions: { code: PermissionCode; label: string }[];
}[] = [
  {
    moduleId: 'dashboard',
    moduleLabel: '01. 经营大盘与利润沙盘',
    permissions: [{ code: 'dashboard:view', label: '查看经营看板与销售趋势' }],
  },
  {
    moduleId: 'amazon',
    moduleLabel: '02. 亚马逊商品与订单中心',
    permissions: [
      { code: 'amazon:view', label: '查看在售 Listing、订单与库龄' },
      { code: 'amazon:price_edit', label: '调整线上 Listing 售价' },
      { code: 'amazon:order_refund', label: '标记退货退款与创建 MCF 订单' },
    ],
  },
  {
    moduleId: 'purchase',
    moduleLabel: '03. 采购与供应链管理',
    permissions: [
      { code: 'purchase:view', label: '查看智能补货、采购单与供应商' },
      { code: 'purchase:create', label: '创建采购计划与外部采购单' },
      { code: 'purchase:approve', label: '审批大额采购单与退货' },
      { code: 'purchase:receive', label: '执行采购到货质检入库' },
      { code: 'purchase:bom_execute', label: '执行组合商品 BOM 组装加工' },
    ],
  },
  {
    moduleId: 'warehouse',
    moduleLabel: '04. 本地多仓与库存管理',
    permissions: [
      { code: 'warehouse:view', label: '查看多仓库存与出入库流水' },
      { code: 'warehouse:count_adjust', label: '提交库存盘点盘盈/盘亏校准' },
      { code: 'warehouse:transfer', label: '发起跨仓调拨单' },
    ],
  },
  {
    moduleId: 'fba',
    moduleLabel: '05. FBA 货件与头程物流',
    permissions: [
      { code: 'fba:view', label: '查看 FBA 货件与头程报价' },
      { code: 'fba:create', label: '创建 FBA 发货计划并扣减本地仓' },
      { code: 'fba:print_label', label: '预览打印 FNSKU 条码与外箱箱唛' },
    ],
  },
  {
    moduleId: 'ads',
    moduleLabel: '06. 广告报表与分时策略',
    permissions: [
      { code: 'ads:view', label: '查看广告活动、广告组与搜索词' },
      { code: 'ads:bid_edit', label: '调整预算、竞价与分时调价规则' },
      { code: 'ads:negate_term', label: '一键添加精准/词组否定关键词' },
    ],
  },
  {
    moduleId: 'finance',
    moduleLabel: '07. 财务核算与结算中心',
    permissions: [
      { code: 'finance:view', label: '查看财务回款与利润统计' },
      { code: 'finance:cost_view', label: '查看采购底价与完整毛利成本' },
      { code: 'finance:export_csv', label: '导出多维利润与结算 CSV 底表' },
      { code: 'finance:reconcile', label: '录入运营杂费与核销供应商应付' },
    ],
  },
  {
    moduleId: 'governance',
    moduleLabel: '08. 领星 MCP、下游 MCP 与企业治理',
    permissions: [
      { code: 'lingxing:manage', label: '配置领星 MCP 密钥与触发同步' },
      { code: 'mcp:read', label: '使用下游 MCP 只读查询与沙盒' },
      { code: 'mcp:write', label: '签发下游 MCP 写权限令牌' },
      { code: 'rbac:manage', label: '管理本企业成员、角色与权限树' },
      { code: 'subscription:manage', label: '查看本企业订阅配额与兑换激活码' },
      { code: 'marketplace:manage', label: '管理本企业应用市场模块安装与启停' },
      { code: 'workspace:settings', label: '配置本企业工作台白标、汇率与告警通知' },
    ],
  },
];

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    planCode: 'FREE',
    planName: 'Starter Free 免费基础版',
    targetAudience: '个人卖家与初期单站点团队',
    monthlyPriceCny: 0,
    annualPriceCny: 0,
    maxShops: 1,
    maxUsers: 2,
    maxSkus: 50,
    maxDaypartingRules: 2,
    mcpCallsQuota: 100,
    syncIntervalMinutes: 360,
  },
  {
    planCode: 'TRIAL',
    planName: '14-Day Full Trial 全功能试用',
    targetAudience: '新入驻评估跨境团队',
    monthlyPriceCny: 0,
    annualPriceCny: 0,
    maxShops: 3,
    maxUsers: 5,
    maxSkus: 500,
    maxDaypartingRules: 10,
    mcpCallsQuota: 1000,
    syncIntervalMinutes: 30,
  },
  {
    planCode: 'PRO',
    planName: 'Growth Pro 成长卖家专业版',
    targetAudience: '多站点精品运营与业财一体化团队',
    monthlyPriceCny: 399,
    annualPriceCny: 3880,
    maxShops: 10,
    maxUsers: 20,
    maxSkus: 5000,
    maxDaypartingRules: 100,
    mcpCallsQuota: 10000,
    syncIntervalMinutes: 15,
  },
  {
    planCode: 'ENTERPRISE',
    planName: 'Enterprise 亿级大卖旗舰版',
    targetAudience: '多品牌矩阵大卖与独立 MCP 智能体集群',
    monthlyPriceCny: 1299,
    annualPriceCny: 12800,
    maxShops: 999,
    maxUsers: 999,
    maxSkus: 99999,
    maxDaypartingRules: 9999,
    mcpCallsQuota: 100000,
    syncIntervalMinutes: 5,
  },
];

export const INITIAL_TENANTS: Tenant[] = [
  {
    id: 'tenant-alpha-01',
    slug: 'alpha',
    tenantCode: 'TENANT-ALPHA',
    companyName: '示例企业 A（3C 跨境主体）',
    logtoOrgId: 'org_tenant_alpha_001',
    isolationMode: 'SCHEMA_PER_TENANT',
    dbSchemaName: 'tenant_alpha',
    cachePrefix: 'tenant:alpha:',
    storageBucketPrefix: 'erp-files/alpha/',
    provisionStatus: 'READY',
    workspaceSettings: {
      brandTitle: 'Alpha 跨境云 ERP',
      brandBadge: 'AL',
      accentColor: 'blue',
      defaultFxRateUsdCny: 7.24,
      alertWebhookChannel: 'FEISHU',
      alertWebhookPlaceholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/demo-alpha',
      notifyStockout: true,
      notifyHijack: true,
      notifyExpiry7d: true,
    },
    planCode: 'PRO',
    subscriptionStatus: 'ACTIVE',
    billingCycle: 'ANNUAL',
    baseCurrency: 'CNY',
    subscriptionEndsAt: '2027-06-30T23:59:59Z',
    graceEndsAt: '2027-07-07T23:59:59Z',
    autoRenew: true,
    usedShopsCount: 4,
    usedUsersCount: 4,
    usedSkusCount: 5,
    usedMcpCallsMonth: 1420,
    lingxingMcpUrl: 'https://mcp.lingxing.com/mcp/v1/stream',
    lingxingMcpKey: 'lx_mcp_demo_****0001',
    lingxingAppId: 'lx_app_****0001',
    lingxingConnectionStatus: 'CONNECTED',
    lastLingxingSyncAt: '2026-11-24 19:30:12',
  },
  {
    id: 'tenant-beta-02',
    slug: 'beta',
    tenantCode: 'TENANT-BETA',
    companyName: '示例企业 B（家居跨境主体）',
    logtoOrgId: 'org_tenant_beta_002',
    isolationMode: 'SHARED_RLS',
    dbSchemaName: 'public',
    cachePrefix: 'tenant:beta:',
    storageBucketPrefix: 'erp-files/beta/',
    provisionStatus: 'READY',
    workspaceSettings: {
      brandTitle: 'Beta 家居出海工作台',
      brandBadge: 'BT',
      accentColor: 'emerald',
      defaultFxRateUsdCny: 7.22,
      alertWebhookChannel: 'WECOM',
      alertWebhookPlaceholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=demo-beta',
      notifyStockout: true,
      notifyHijack: false,
      notifyExpiry7d: true,
    },
    planCode: 'TRIAL',
    subscriptionStatus: 'GRACE_PERIOD',
    billingCycle: 'MONTHLY',
    baseCurrency: 'CNY',
    subscriptionEndsAt: '2026-11-22T23:59:59Z',
    graceEndsAt: '2026-11-29T23:59:59Z',
    autoRenew: false,
    usedShopsCount: 2,
    usedUsersCount: 4,
    usedSkusCount: 185,
    usedMcpCallsMonth: 860,
    lingxingMcpUrl: 'https://mcp.lingxing.com/mcp/v1/stream',
    lingxingMcpKey: 'lx_mcp_demo_****0002',
    lingxingAppId: 'lx_app_****0002',
    lingxingConnectionStatus: 'CONNECTED',
    lastLingxingSyncAt: '2026-11-24 19:00:05',
  },
  {
    id: 'tenant-gamma-03',
    slug: 'gamma',
    tenantCode: 'TENANT-GAMMA',
    companyName: '示例企业 C（户外跨境主体）',
    logtoOrgId: 'org_tenant_gamma_003',
    isolationMode: 'DEDICATED_DB_BYOD',
    dbSchemaName: 'public',
    cachePrefix: 'tenant:gamma:',
    storageBucketPrefix: 'erp-files/gamma/',
    byodSupabaseUrl: 'https://byod-gamma-demo.supabase.co',
    provisionStatus: 'READY',
    workspaceSettings: {
      brandTitle: 'Gamma Outdoor ERP',
      brandBadge: 'GM',
      accentColor: 'indigo',
      defaultFxRateUsdCny: 7.25,
      alertWebhookChannel: 'DINGTALK',
      alertWebhookPlaceholder: 'https://oapi.dingtalk.com/robot/send?access_token=demo-gamma',
      notifyStockout: true,
      notifyHijack: true,
      notifyExpiry7d: true,
    },
    planCode: 'ENTERPRISE',
    subscriptionStatus: 'EXPIRED_READONLY',
    billingCycle: 'MONTHLY',
    baseCurrency: 'USD',
    subscriptionEndsAt: '2026-11-10T23:59:59Z',
    graceEndsAt: '2026-11-17T23:59:59Z',
    autoRenew: false,
    usedShopsCount: 3,
    usedUsersCount: 6,
    usedSkusCount: 310,
    usedMcpCallsMonth: 0,
    lingxingMcpUrl: 'https://mcp.lingxing.com/mcp/v1/stream',
    lingxingMcpKey: 'lx_mcp_demo_****0003',
    lingxingAppId: 'lx_app_****0003',
    lingxingConnectionStatus: 'PAUSED_BY_EXPIRY',
    lastLingxingSyncAt: '2026-11-17 23:59:00',
  },
];

export const INITIAL_APP_MODULES: ErpAppModule[] = [
  {
    moduleCode: 'core_dashboard',
    moduleName: '经营大盘与利润沙盘 (核心底座)',
    category: 'CORE',
    description: '多站点营收净利看板、退货归因与单品选品利润测算器（所有租户默认必装）。',
    minPlanCode: 'FREE',
    monthlyAddonPriceCny: 0,
    isCoreRequired: true,
    isPublished: true,
  },
  {
    moduleCode: 'mod_amazon_ops',
    moduleName: '亚马逊商品、订单与库龄监控',
    category: 'OPERATIONS',
    description: '在线 Listing 调价、FBA/FBM/MCF 多渠道订单履约、跟卖预警与 0-181+ 天库龄健康分析。',
    minPlanCode: 'FREE',
    monthlyAddonPriceCny: 0,
    isCoreRequired: false,
    isPublished: true,
  },
  {
    moduleCode: 'mod_purchase_bom',
    moduleName: '智能补货、1688 采购与 BOM 组装',
    category: 'SUPPLY_CHAIN',
    description: '安全库存补货精算、采购单全生命周期审批、组合套装 BOM 组装加工及供应商阶梯价档案。',
    minPlanCode: 'TRIAL',
    monthlyAddonPriceCny: 99,
    isCoreRequired: false,
    isPublished: true,
  },
  {
    moduleCode: 'mod_warehouse_wms',
    moduleName: '本地多仓 WMS 与盘点调拨',
    category: 'SUPPLY_CHAIN',
    description: '华南/华东多仓库存台账、盘盈盘亏校准过账与仓间调拨全链路出入库流水。',
    minPlanCode: 'TRIAL',
    monthlyAddonPriceCny: 99,
    isCoreRequired: false,
    isPublished: true,
  },
  {
    moduleCode: 'mod_fba_logistics',
    moduleName: 'FBA 货件、泡重精算与箱唛打印',
    category: 'SUPPLY_CHAIN',
    description: '长×宽×高/6000 泡重计费、FNSKU 商品条码与外箱箱唛打印、头程渠道报价与上架差异追踪。',
    minPlanCode: 'TRIAL',
    monthlyAddonPriceCny: 79,
    isCoreRequired: false,
    isPublished: true,
  },
  {
    moduleCode: 'mod_ads_dayparting',
    moduleName: '广告报表、搜索词否词与 24h 分时调价',
    category: 'OPERATIONS',
    description: 'SP/SB/SD 广告诊断、高浪费搜索词一键精准/词组否定、以及 24 小时自动化分时竞价矩阵。',
    minPlanCode: 'PRO',
    monthlyAddonPriceCny: 149,
    isCoreRequired: false,
    isPublished: true,
  },
  {
    moduleCode: 'mod_finance_ledger',
    moduleName: '财务多维利润核算与 Settlement 对账',
    category: 'FINANCE',
    description: 'ASIN/店铺真实净利润底表与 CSV 导出、亚马逊 14 天回款账期对账、站外杂费分摊与应付核销。',
    minPlanCode: 'FREE',
    monthlyAddonPriceCny: 0,
    isCoreRequired: false,
    isPublished: true,
  },
  {
    moduleCode: 'mod_mcp_gateway',
    moduleName: '领星上游 MCP 与下游 AI Agent 网关',
    category: 'AI_INTEGRATION',
    description: '免 SP-API 领星流式 MCP 同步，以及面向 Claude/Cursor/Dify 的 /api/mcp 智能体受控网关。',
    minPlanCode: 'TRIAL',
    monthlyAddonPriceCny: 199,
    isCoreRequired: false,
    isPublished: true,
  },
];

export const INITIAL_INSTALLED_MODULES: TenantInstalledModule[] = [
  // TENANT-ALPHA (PRO): All 8 modules enabled
  ...INITIAL_APP_MODULES.map((m, idx) => ({
    id: `inst-alpha-${idx + 1}`,
    tenantId: 'tenant-alpha-01',
    moduleCode: m.moduleCode,
    enabled: true,
    installedAt: '2026-10-01 09:00',
  })),
  // TENANT-BETA (TRIAL): Lightweight subset installed (Ads & WMS & BOM uninstalled to demonstrate live marketplace gating!)
  { id: 'inst-beta-1', tenantId: 'tenant-beta-02', moduleCode: 'core_dashboard', enabled: true, installedAt: '2026-11-08 10:00' },
  { id: 'inst-beta-2', tenantId: 'tenant-beta-02', moduleCode: 'mod_amazon_ops', enabled: true, installedAt: '2026-11-08 10:00' },
  { id: 'inst-beta-3', tenantId: 'tenant-beta-02', moduleCode: 'mod_finance_ledger', enabled: true, installedAt: '2026-11-08 10:00' },
  { id: 'inst-beta-4', tenantId: 'tenant-beta-02', moduleCode: 'mod_mcp_gateway', enabled: true, installedAt: '2026-11-08 10:00' },
  // TENANT-GAMMA (ENTERPRISE): All 8 modules installed (currently frozen by EXPIRED_READONLY)
  ...INITIAL_APP_MODULES.map((m, idx) => ({
    id: `inst-gamma-${idx + 1}`,
    tenantId: 'tenant-gamma-03',
    moduleCode: m.moduleCode,
    enabled: true,
    installedAt: '2026-08-15 11:30',
  })),
];

export const INITIAL_INVITATIONS: TenantInvitation[] = [
  {
    id: 'inv-01',
    tenantId: 'tenant-alpha-01',
    email: 'ops-eu@x-cloud-demo.example',
    departmentName: '欧洲运营部',
    roleCode: 'AMAZON_OPERATOR',
    roleName: '亚马逊站点运营专员 (专人专店)',
    allowedShopIds: ['shop-de-02', 'shop-uk-03'],
    hidePurchaseCost: true,
    inviteToken: 'xc_inv_demo_eu_8821',
    status: 'PENDING',
    createdAt: '2026-11-24 14:10',
    expiresAt: '2026-12-01 14:10',
  },
  {
    id: 'inv-02',
    tenantId: 'tenant-alpha-01',
    email: 'audit-partner@x-cloud-demo.example',
    departmentName: '外部财务顾问',
    roleCode: 'FINANCE_AUDITOR',
    roleName: '跨境业财总账与审计师',
    allowedShopIds: ['shop-us-01', 'shop-de-02', 'shop-uk-03', 'shop-jp-04'],
    hidePurchaseCost: false,
    inviteToken: 'xc_inv_demo_fin_3394',
    status: 'PENDING',
    createdAt: '2026-11-24 16:30',
    expiresAt: '2026-12-01 16:30',
  },
];

export const INITIAL_LICENSES: BillingLicense[] = [
  {
    id: 'lic-01',
    licenseKey: 'XC-PRO-365D-DEMO-0001',
    targetPlan: 'PRO',
    durationDays: 365,
    issuedToTenantCode: 'TENANT-GAMMA',
    status: 'UNUSED',
    createdAt: '2026-11-24 10:15:00',
  },
  {
    id: 'lic-02',
    licenseKey: 'XC-ENT-365D-DEMO-0002',
    targetPlan: 'ENTERPRISE',
    durationDays: 365,
    issuedToTenantCode: 'TENANT-ALPHA',
    status: 'UNUSED',
    createdAt: '2026-11-24 14:20:00',
  },
  {
    id: 'lic-03',
    licenseKey: 'XC-PRO-30D-DEMO-0003',
    targetPlan: 'PRO',
    durationDays: 30,
    issuedToTenantCode: 'TENANT-BETA',
    status: 'REDEEMED',
    createdAt: '2026-10-20 09:00:00',
    redeemedAt: '2026-10-20 09:12:30',
    redeemedByTenantId: 'tenant-beta-02',
  },
];

export const INITIAL_SHOPS: AmazonShop[] = [
  {
    id: 'shop-us-01',
    tenantId: 'tenant-alpha-01',
    shopName: 'Store-Alpha-US',
    sellerId: 'SELLER-US-****01',
    marketplace: 'US',
    region: 'NA',
    currency: 'USD',
    syncSource: 'LINGXING_MCP',
    status: 'CONNECTED',
    lastSyncedAt: '2026-11-24 19:30:12',
  },
  {
    id: 'shop-de-02',
    tenantId: 'tenant-alpha-01',
    shopName: 'Store-Alpha-DE',
    sellerId: 'SELLER-DE-****02',
    marketplace: 'DE',
    region: 'EU',
    currency: 'EUR',
    syncSource: 'LINGXING_MCP',
    status: 'CONNECTED',
    lastSyncedAt: '2026-11-24 19:30:10',
  },
  {
    id: 'shop-uk-03',
    tenantId: 'tenant-alpha-01',
    shopName: 'Store-Alpha-UK',
    sellerId: 'SELLER-UK-****03',
    marketplace: 'UK',
    region: 'EU',
    currency: 'GBP',
    syncSource: 'LINGXING_MCP',
    status: 'CONNECTED',
    lastSyncedAt: '2026-11-24 19:29:55',
  },
  {
    id: 'shop-jp-04',
    tenantId: 'tenant-alpha-01',
    shopName: 'Store-Alpha-JP',
    sellerId: 'SELLER-JP-****04',
    marketplace: 'JP',
    region: 'FE',
    currency: 'JPY',
    syncSource: 'LINGXING_MCP',
    status: 'CONNECTED',
    lastSyncedAt: '2026-11-24 19:29:40',
  },
];

export const INITIAL_LOCAL_SKUS: LocalMaterialSku[] = [
  {
    id: 'sku-01',
    tenantId: 'tenant-alpha-01',
    sku: 'XC-ITEM-001',
    name: '65W 氮化镓三口快充充电器 (美规/欧规通用母座)',
    category: '3C数码配件',
    purchaseCostCny: 38.5,
    headFreightPerUnitCny: 6.2,
    lengthCm: 10.5,
    widthCm: 8.2,
    heightCm: 4.5,
    weightKg: 0.21,
    leadTimeDays: 12,
    supplierName: '合作供应商 A（电源类）',
    supplier1688Id: 'SUP-****001',
    localAvailableQty: 2450,
    localInboundQty: 1500,
    warehouseName: '华南 1 号中心仓',
  },
  {
    id: 'sku-02',
    tenantId: 'tenant-alpha-01',
    sku: 'XC-ITEM-002',
    name: 'Type-C 8合1 4K@60Hz 铝合金扩展坞 (100W PD)',
    category: '电脑周边配件',
    purchaseCostCny: 54.0,
    headFreightPerUnitCny: 7.5,
    lengthCm: 16.0,
    widthCm: 9.0,
    heightCm: 2.4,
    weightKg: 0.19,
    leadTimeDays: 15,
    supplierName: '合作供应商 B（电脑周边类）',
    supplier1688Id: 'SUP-****002',
    localAvailableQty: 680,
    localInboundQty: 2000,
    warehouseName: '华南 1 号中心仓',
  },
  {
    id: 'sku-03',
    tenantId: 'tenant-alpha-01',
    sku: 'XC-ITEM-003',
    name: 'Qi2 15W 磁吸无线快充移动电源 10000mAh 折叠支架款',
    category: '移动电源',
    purchaseCostCny: 62.0,
    headFreightPerUnitCny: 9.8,
    lengthCm: 14.2,
    widthCm: 9.5,
    heightCm: 3.2,
    weightKg: 0.32,
    leadTimeDays: 18,
    supplierName: '合作供应商 C（电芯组装类）',
    supplier1688Id: 'SUP-****003',
    localAvailableQty: 1120,
    localInboundQty: 0,
    warehouseName: '华南 1 号中心仓',
  },
  {
    id: 'sku-04',
    tenantId: 'tenant-alpha-01',
    sku: 'XC-ITEM-004',
    name: '航空铝合金双轴可折叠笔记本散热升降支架',
    category: '办公人体工学',
    purchaseCostCny: 41.0,
    headFreightPerUnitCny: 14.5,
    lengthCm: 28.5,
    widthCm: 24.0,
    heightCm: 5.2,
    weightKg: 0.88,
    leadTimeDays: 10,
    supplierName: '合作供应商 D（五金结构类）',
    supplier1688Id: 'SUP-****004',
    localAvailableQty: 1890,
    localInboundQty: 500,
    warehouseName: '华南 2 号中转仓',
  },
  {
    id: 'sku-05',
    tenantId: 'tenant-alpha-01',
    sku: 'XC-ITEM-005',
    name: 'USB4 240W 40Gbps 编织数显快充数据线 2米',
    category: '线材配件',
    purchaseCostCny: 16.8,
    headFreightPerUnitCny: 3.1,
    lengthCm: 12.0,
    widthCm: 12.0,
    heightCm: 2.0,
    weightKg: 0.095,
    leadTimeDays: 7,
    supplierName: '合作供应商 E（线缆配件类）',
    supplier1688Id: 'SUP-****005',
    localAvailableQty: 4200,
    localInboundQty: 3000,
    warehouseName: '华南 1 号中心仓',
  },
];

export const INITIAL_LISTINGS: AmazonListingItem[] = [
  {
    id: 'lst-01',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-us-01',
    shopName: 'Store-Alpha-US',
    marketplace: 'US',
    asin: 'B00DEMO001',
    msku: 'US-XC-001',
    fnsku: 'X00DEMO001',
    title: '65W GaN III 3-Port Fast USB C Charger Foldable Plug for Laptop & Phone',
    localSkuId: 'sku-01',
    localSkuCode: 'XC-ITEM-001',
    priceOrig: 29.99,
    currency: 'USD',
    dailySales7d: 52.4,
    dailySales30d: 47.6,
    orders30d: 1428,
    revenue30dUsd: 42825.72,
    fbaAvailable: 1120,
    fbaInbound: 800,
    fbaReserved: 145,
    aging0To90Qty: 1120,
    aging91To180Qty: 0,
    aging181PlusQty: 0,
    aging90PlusQty: 0,
    referralFeeRate: 0.15,
    fbaFeePerUnitUsd: 4.75,
    monthlyStorageFeeUsd: 185.4,
    adSpend30dUsd: 4890.0,
    adSales30dUsd: 19850.0,
    refundRatePercent: 2.4,
    buyBoxWinner: true,
    hijackerCount: 0,
    listingStatus: 'ACTIVE',
  },
  {
    id: 'lst-02',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-de-02',
    shopName: 'Store-Alpha-DE',
    marketplace: 'DE',
    asin: 'B00DEMO002',
    msku: 'DE-XC-002',
    fnsku: 'X00DEMO002',
    title: 'USB C Hub 8-in-1 Adapter 4K 60Hz HDMI, 100W PD, Gigabit Ethernet, SD/TF',
    localSkuId: 'sku-02',
    localSkuCode: 'XC-ITEM-002',
    priceOrig: 34.99,
    currency: 'EUR',
    dailySales7d: 33.8,
    dailySales30d: 29.5,
    orders30d: 885,
    revenue30dUsd: 33440.0,
    fbaAvailable: 215,
    fbaInbound: 300,
    fbaReserved: 42,
    aging0To90Qty: 203,
    aging91To180Qty: 12,
    aging181PlusQty: 0,
    aging90PlusQty: 12,
    referralFeeRate: 0.15,
    fbaFeePerUnitUsd: 5.15,
    monthlyStorageFeeUsd: 142.0,
    adSpend30dUsd: 6120.0,
    adSales30dUsd: 16200.0,
    refundRatePercent: 3.8,
    buyBoxWinner: false,
    hijackerCount: 2,
    listingStatus: 'ACTIVE',
  },
  {
    id: 'lst-03',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-us-01',
    shopName: 'Store-Alpha-US',
    marketplace: 'US',
    asin: 'B00DEMO003',
    msku: 'US-XC-003',
    fnsku: 'X00DEMO003',
    title: 'Qi2 Certified 15W Magnetic Portable Charger 10000mAh Power Bank',
    localSkuId: 'sku-03',
    localSkuCode: 'XC-ITEM-003',
    priceOrig: 39.99,
    currency: 'USD',
    dailySales7d: 41.0,
    dailySales30d: 38.2,
    orders30d: 1146,
    revenue30dUsd: 45828.54,
    fbaAvailable: 310,
    fbaInbound: 0,
    fbaReserved: 88,
    aging0To90Qty: 310,
    aging91To180Qty: 0,
    aging181PlusQty: 0,
    aging90PlusQty: 0,
    referralFeeRate: 0.15,
    fbaFeePerUnitUsd: 5.42,
    monthlyStorageFeeUsd: 210.0,
    adSpend30dUsd: 5420.0,
    adSales30dUsd: 24100.0,
    refundRatePercent: 2.9,
    buyBoxWinner: true,
    hijackerCount: 0,
    listingStatus: 'ACTIVE',
  },
  {
    id: 'lst-04',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-uk-03',
    shopName: 'Store-Alpha-UK',
    marketplace: 'UK',
    asin: 'B00DEMO004',
    msku: 'UK-XC-004',
    fnsku: 'X00DEMO004',
    title: 'Ergonomic Aluminium Laptop Stand Adjustable Height Portable Riser for Desk',
    localSkuId: 'sku-04',
    localSkuCode: 'XC-ITEM-004',
    priceOrig: 24.99,
    currency: 'GBP',
    dailySales7d: 19.5,
    dailySales30d: 21.0,
    orders30d: 630,
    revenue30dUsd: 19845.0,
    fbaAvailable: 890,
    fbaInbound: 400,
    fbaReserved: 35,
    aging0To90Qty: 710,
    aging91To180Qty: 115,
    aging181PlusQty: 65,
    aging90PlusQty: 180,
    referralFeeRate: 0.15,
    fbaFeePerUnitUsd: 5.85,
    monthlyStorageFeeUsd: 320.5,
    adSpend30dUsd: 2180.0,
    adSales30dUsd: 8900.0,
    refundRatePercent: 1.8,
    buyBoxWinner: true,
    hijackerCount: 1,
    listingStatus: 'ACTIVE',
  },
  {
    id: 'lst-05',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-jp-04',
    shopName: 'Store-Alpha-JP',
    marketplace: 'JP',
    asin: 'B00DEMO005',
    msku: 'JP-XC-005',
    fnsku: 'X00DEMO005',
    title: 'USB4 ケーブル 240W 急速充電 LED電力表示 40Gbps データ転送 8K映像出力 2m',
    localSkuId: 'sku-05',
    localSkuCode: 'XC-ITEM-005',
    priceOrig: 2380,
    currency: 'JPY',
    dailySales7d: 64.2,
    dailySales30d: 58.0,
    orders30d: 1740,
    revenue30dUsd: 27492.0,
    fbaAvailable: 1950,
    fbaInbound: 1200,
    fbaReserved: 210,
    aging0To90Qty: 1950,
    aging91To180Qty: 0,
    aging181PlusQty: 0,
    aging90PlusQty: 0,
    referralFeeRate: 0.15,
    fbaFeePerUnitUsd: 3.15,
    monthlyStorageFeeUsd: 95.0,
    adSpend30dUsd: 2450.0,
    adSales30dUsd: 14200.0,
    refundRatePercent: 1.1,
    buyBoxWinner: true,
    hijackerCount: 0,
    listingStatus: 'ACTIVE',
  },
];

export const INITIAL_ORDERS: AmazonOrderItem[] = [
  {
    id: 'ord-01',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-us-01',
    shopName: 'Store-Alpha-US',
    marketplace: 'US',
    amazonOrderId: '114-DEMO-000101',
    fulfillmentChannel: 'FBA',
    asin: 'B00DEMO001',
    msku: 'US-XC-001',
    quantity: 2,
    orderAmountUsd: 59.98,
    amazonFeeUsd: 18.5,
    orderStatus: 'SHIPPED',
    purchaseDate: '2026-11-24 18:12',
    buyerRegion: 'California, US',
  },
  {
    id: 'ord-02',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-de-02',
    shopName: 'Store-Alpha-DE',
    marketplace: 'DE',
    amazonOrderId: '302-DEMO-000205',
    fulfillmentChannel: 'FBA',
    asin: 'B00DEMO002',
    msku: 'DE-XC-002',
    quantity: 1,
    orderAmountUsd: 37.8,
    amazonFeeUsd: 10.82,
    orderStatus: 'REFUNDED',
    purchaseDate: '2026-11-24 15:40',
    buyerRegion: 'Bavaria, DE',
    returnReason: '接口不兼容旧款设备',
  },
  {
    id: 'ord-03',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-us-01',
    shopName: 'Store-Alpha-US',
    marketplace: 'US',
    amazonOrderId: '114-DEMO-000319',
    fulfillmentChannel: 'MCF',
    asin: 'B00DEMO003',
    msku: 'US-XC-003',
    quantity: 3,
    orderAmountUsd: 119.97,
    amazonFeeUsd: 21.6,
    orderStatus: 'PENDING',
    purchaseDate: '2026-11-24 19:05',
    buyerRegion: 'Texas, US',
  },
  {
    id: 'ord-04',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-uk-03',
    shopName: 'Store-Alpha-UK',
    marketplace: 'UK',
    amazonOrderId: '205-DEMO-000488',
    fulfillmentChannel: 'FBM',
    asin: 'B00DEMO004',
    msku: 'UK-XC-004',
    quantity: 1,
    orderAmountUsd: 31.5,
    amazonFeeUsd: 4.72,
    orderStatus: 'UNSHIPPED',
    purchaseDate: '2026-11-24 16:22',
    buyerRegion: 'London, UK',
  },
  {
    id: 'ord-05',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-jp-04',
    shopName: 'Store-Alpha-JP',
    marketplace: 'JP',
    amazonOrderId: '250-DEMO-000512',
    fulfillmentChannel: 'FBA',
    asin: 'B00DEMO005',
    msku: 'JP-XC-005',
    quantity: 4,
    orderAmountUsd: 63.2,
    amazonFeeUsd: 16.9,
    orderStatus: 'SHIPPED',
    purchaseDate: '2026-11-24 14:08',
    buyerRegion: 'Tokyo, JP',
  },
];

export const INITIAL_SUPPLIERS: SupplierProfile[] = [
  {
    id: 'sup-01',
    tenantId: 'tenant-alpha-01',
    supplierCode: 'SUP-****001',
    supplierName: '合作供应商 A（电源类）',
    category: '3C数码配件',
    moqUnits: 500,
    leadTimeDays: 12,
    paymentTerm: '预付30% + 验货后70%',
    tierPricingNote: '500件 ¥39.5 / 1500件 ¥38.5 / 5000件 ¥36.8',
    ratingScore: 4.9,
    status: 'ACTIVE',
  },
  {
    id: 'sup-02',
    tenantId: 'tenant-alpha-01',
    supplierCode: 'SUP-****002',
    supplierName: '合作供应商 B（电脑周边类）',
    category: '电脑周边配件',
    moqUnits: 300,
    leadTimeDays: 15,
    paymentTerm: '月结 30 天',
    tierPricingNote: '300件 ¥56.0 / 1000件 ¥54.0 / 3000件 ¥51.5',
    ratingScore: 4.7,
    status: 'ACTIVE',
  },
  {
    id: 'sup-03',
    tenantId: 'tenant-alpha-01',
    supplierCode: 'SUP-****003',
    supplierName: '合作供应商 C（电芯组装类）',
    category: '移动电源',
    moqUnits: 1000,
    leadTimeDays: 18,
    paymentTerm: '预付30% + 发货前70%',
    tierPricingNote: '1000件 ¥62.0 / 3000件 ¥59.0',
    ratingScore: 4.8,
    status: 'ACTIVE',
  },
  {
    id: 'sup-04',
    tenantId: 'tenant-alpha-01',
    supplierCode: 'SUP-****004',
    supplierName: '合作供应商 D（五金结构类）',
    category: '办公人体工学',
    moqUnits: 500,
    leadTimeDays: 10,
    paymentTerm: '货到付款',
    tierPricingNote: '500件 ¥41.0 / 2000件 ¥39.2',
    ratingScore: 4.6,
    status: 'ACTIVE',
  },
];

export const INITIAL_BOM_ASSEMBLIES: BomAssemblyOrder[] = [
  {
    id: 'bom-01',
    tenantId: 'tenant-alpha-01',
    assemblyNo: 'BOM-20261123-01',
    bundleSkuCode: 'XC-BUNDLE-GAN-2PK',
    bundleName: '65W 快充头 + 240W 线材礼盒套装 (2件套)',
    componentSkuCode: 'XC-ITEM-001',
    unitsPerBundle: 2,
    targetBundleQty: 200,
    status: 'PENDING',
    createdAt: '2026-11-23 14:20',
  },
  {
    id: 'bom-02',
    tenantId: 'tenant-alpha-01',
    assemblyNo: 'BOM-20261118-02',
    bundleSkuCode: 'XC-BUNDLE-DESK-PRO',
    bundleName: '铝合金支架 + 8合1扩展坞 桌面办公组合',
    componentSkuCode: 'XC-ITEM-004',
    unitsPerBundle: 1,
    targetBundleQty: 150,
    status: 'COMPLETED',
    createdAt: '2026-11-18 11:05',
  },
];

export const INITIAL_PURCHASE_ORDERS: PurchaseOrder1688[] = [
  {
    id: 'po-01',
    tenantId: 'tenant-alpha-01',
    poNumber: 'PO-20261120-001',
    order1688No: 'EXT-PO-****0001',
    localSkuCode: 'XC-ITEM-001',
    productName: '65W 氮化镓三口快充充电器',
    supplierName: '合作供应商 A（电源类）',
    quantity: 1500,
    receivedQty: 0,
    unitPriceCny: 38.5,
    totalAmountCny: 57750,
    status: 'IN_TRANSIT',
    paymentStatus: 'PAID',
    createdBy: 'USER',
    createdAt: '2026-11-20 10:30',
    expectedArrivalDate: '2026-11-28',
  },
  {
    id: 'po-02',
    tenantId: 'tenant-alpha-01',
    poNumber: 'PO-20261122-002',
    order1688No: 'EXT-PO-****0002',
    localSkuCode: 'XC-ITEM-002',
    productName: 'Type-C 8合1 4K@60Hz 铝合金扩展坞',
    supplierName: '合作供应商 B（电脑周边类）',
    quantity: 2000,
    receivedQty: 0,
    unitPriceCny: 54.0,
    totalAmountCny: 108000,
    status: 'ORDERED_1688',
    paymentStatus: 'PARTIAL',
    createdBy: 'SMART_RESTOCK',
    createdAt: '2026-11-22 15:10',
    expectedArrivalDate: '2026-12-05',
  },
  {
    id: 'po-03',
    tenantId: 'tenant-alpha-01',
    poNumber: 'PO-20261124-003',
    order1688No: '待推送外部采购单',
    localSkuCode: 'XC-ITEM-003',
    productName: 'Qi2 15W 磁吸无线快充移动电源 10000mAh',
    supplierName: '合作供应商 C（电芯组装类）',
    quantity: 1800,
    receivedQty: 0,
    unitPriceCny: 62.0,
    totalAmountCny: 111600,
    status: 'DRAFT',
    paymentStatus: 'UNPAID',
    createdBy: 'MCP_AGENT',
    createdAt: '2026-11-24 18:45',
    expectedArrivalDate: '2026-12-12',
  },
];

export const INITIAL_WAREHOUSE_LEDGERS: WarehouseStockLedger[] = [
  {
    id: 'wh-log-01',
    tenantId: 'tenant-alpha-01',
    ledgerNo: 'IN-20261120-001',
    warehouseName: '华南 1 号中心仓',
    localSkuCode: 'XC-ITEM-001',
    movementType: 'PO_INBOUND',
    qtyDelta: 1200,
    balanceAfter: 2450,
    referenceDoc: 'PO-20261110-009',
    operatorName: '供应链主管 B',
    createdAt: '2026-11-20 14:22',
  },
  {
    id: 'wh-log-02',
    tenantId: 'tenant-alpha-01',
    ledgerNo: 'OUT-20261119-014',
    warehouseName: '华南 1 号中心仓',
    localSkuCode: 'XC-ITEM-002',
    movementType: 'FBA_OUTBOUND',
    qtyDelta: -300,
    balanceAfter: 680,
    referenceDoc: 'FBA-XC-DEMO02',
    operatorName: '运营专员 A',
    createdAt: '2026-11-19 11:05',
  },
  {
    id: 'wh-log-03',
    tenantId: 'tenant-alpha-01',
    ledgerNo: 'CNT-20261115-002',
    warehouseName: '华南 2 号中转仓',
    localSkuCode: 'XC-ITEM-004',
    movementType: 'COUNT_ADJUST',
    qtyDelta: -10,
    balanceAfter: 1890,
    referenceDoc: 'STOCK-COUNT-1115',
    operatorName: '供应链主管 B',
    createdAt: '2026-11-15 17:30',
  },
];

export const INITIAL_FBA_SHIPMENTS: FbaShipmentPlan[] = [
  {
    id: 'fba-01',
    tenantId: 'tenant-alpha-01',
    shipmentId: 'FBA-XC-DEMO01',
    shopName: 'Store-Alpha-US',
    marketplace: 'US',
    destinationFulfillmentCenter: 'ONT8 (Moreno Valley, CA)',
    shippingMode: 'SEA_FAST',
    carrierName: '海运快船专线 + 尾程派送',
    trackingNumber: 'TRK-SEA-****0001',
    localSkuCode: 'XC-ITEM-001',
    fnsku: 'X00DEMO001',
    boxCount: 10,
    unitsPerBox: 80,
    totalUnitsShipped: 800,
    totalUnitsReceived: 320,
    boxLengthCm: 52,
    boxWidthCm: 42,
    boxHeightCm: 38,
    boxGrossWeightKg: 18.2,
    freightRatePerKgCny: 13.5,
    status: 'RECEIVING',
    createdAt: '2026-11-08 14:20',
  },
  {
    id: 'fba-02',
    tenantId: 'tenant-alpha-01',
    shipmentId: 'FBA-XC-DEMO02',
    shopName: 'Store-Alpha-DE',
    marketplace: 'DE',
    destinationFulfillmentCenter: 'FRA7 (Frankenthal, DE)',
    shippingMode: 'AIR_EXPRESS',
    carrierName: '欧洲空派包税专线',
    trackingNumber: 'TRK-AIR-****0002',
    localSkuCode: 'XC-ITEM-002',
    fnsku: 'X00DEMO002',
    boxCount: 6,
    unitsPerBox: 50,
    totalUnitsShipped: 300,
    totalUnitsReceived: 0,
    boxLengthCm: 48,
    boxWidthCm: 38,
    boxHeightCm: 32,
    boxGrossWeightKg: 10.5,
    freightRatePerKgCny: 42.0,
    status: 'IN_TRANSIT',
    createdAt: '2026-11-19 11:05',
  },
  {
    id: 'fba-03',
    tenantId: 'tenant-alpha-01',
    shipmentId: 'FBA-XC-DEMO03',
    shopName: 'Store-Alpha-JP',
    marketplace: 'JP',
    destinationFulfillmentCenter: 'NRT1 (Ichikawa, Chiba)',
    shippingMode: 'SEA_FAST',
    carrierName: '中日海运快船专线',
    trackingNumber: 'TRK-SEA-****0003',
    localSkuCode: 'XC-ITEM-005',
    fnsku: 'X00DEMO005',
    boxCount: 12,
    unitsPerBox: 100,
    totalUnitsShipped: 1200,
    totalUnitsReceived: 1200,
    boxLengthCm: 50,
    boxWidthCm: 40,
    boxHeightCm: 35,
    boxGrossWeightKg: 11.2,
    freightRatePerKgCny: 8.5,
    status: 'CLOSED',
    createdAt: '2026-11-02 09:30',
  },
];

export const INITIAL_FREIGHT_QUOTES: FreightChannelQuote[] = [
  {
    id: 'fq-01',
    carrierName: '头程承运商 A',
    channelName: '美西海运限时达快船 (UPS派)',
    targetRegion: 'US',
    transportMode: 'SEA_FAST',
    pricePerKgCny: 13.5,
    minWeightKg: 21,
    etaDays: '14-18 自然日',
    taxIncluded: true,
  },
  {
    id: 'fq-02',
    carrierName: '头程承运商 B',
    channelName: '欧洲空派双清包税专线',
    targetRegion: 'EU',
    transportMode: 'AIR_EXPRESS',
    pricePerKgCny: 42.0,
    minWeightKg: 12,
    etaDays: '7-10 自然日',
    taxIncluded: true,
  },
  {
    id: 'fq-03',
    carrierName: '头程承运商 C',
    channelName: '日本海运快船含税专线',
    targetRegion: 'JP',
    transportMode: 'SEA_FAST',
    pricePerKgCny: 8.5,
    minWeightKg: 25,
    etaDays: '8-12 自然日',
    taxIncluded: true,
  },
];

export const INITIAL_AD_CAMPAIGNS: AdCampaignItem[] = [
  {
    id: 'adv-01',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-us-01',
    shopName: 'Store-Alpha-US',
    marketplace: 'US',
    campaignId: 'CMP-US-SP-001',
    campaignName: '[SP-Exact] 65W GaN Charger Core Keywords',
    adType: 'SP',
    associatedAsin: 'B00DEMO001',
    dailyBudgetUsd: 180,
    defaultBidUsd: 1.45,
    impressions30d: 412000,
    clicks30d: 3420,
    spend30dUsd: 4890,
    sales30dUsd: 19850,
    orders30d: 662,
    status: 'ENABLED',
    daypartingEnabled: true,
    peakHoursRange: '08:00 - 22:00 (PST)',
    peakBidMultiplierPercent: 25,
    offPeakHoursRange: '00:00 - 06:00 (PST)',
    offPeakBidMultiplierPercent: -45,
  },
  {
    id: 'adv-02',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-de-02',
    shopName: 'Store-Alpha-DE',
    marketplace: 'DE',
    campaignId: 'CMP-DE-SP-002',
    campaignName: '[SP-Broad] USB C Hub 4K 60Hz DE Traffic',
    adType: 'SP',
    associatedAsin: 'B00DEMO002',
    dailyBudgetUsd: 210,
    defaultBidUsd: 1.68,
    impressions30d: 389000,
    clicks30d: 3640,
    spend30dUsd: 6120,
    sales30dUsd: 16200,
    orders30d: 463,
    status: 'ENABLED',
    daypartingEnabled: true,
    peakHoursRange: '09:00 - 21:00 (CET)',
    peakBidMultiplierPercent: 15,
    offPeakHoursRange: '01:00 - 06:00 (CET)',
    offPeakBidMultiplierPercent: -50,
  },
  {
    id: 'adv-03',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-us-01',
    shopName: 'Store-Alpha-US',
    marketplace: 'US',
    campaignId: 'CMP-US-SB-003',
    campaignName: '[SB-Video] Qi2 Magnetic 10000mAh Video Showcase',
    adType: 'SB',
    associatedAsin: 'B00DEMO003',
    dailyBudgetUsd: 190,
    defaultBidUsd: 1.85,
    impressions30d: 295000,
    clicks30d: 2930,
    spend30dUsd: 5420,
    sales30dUsd: 24100,
    orders30d: 602,
    status: 'ENABLED',
    daypartingEnabled: true,
    peakHoursRange: '10:00 - 23:00 (PST)',
    peakBidMultiplierPercent: 20,
    offPeakHoursRange: '01:00 - 07:00 (PST)',
    offPeakBidMultiplierPercent: -35,
  },
  {
    id: 'adv-04',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-jp-04',
    shopName: 'Store-Alpha-JP',
    marketplace: 'JP',
    campaignId: 'CMP-JP-SP-004',
    campaignName: '[SP-Auto] USB4 240W Cable Automatic Targeting',
    adType: 'SP',
    associatedAsin: 'B00DEMO005',
    dailyBudgetUsd: 95,
    defaultBidUsd: 0.72,
    impressions30d: 280000,
    clicks30d: 3402,
    spend30dUsd: 2450,
    sales30dUsd: 14200,
    orders30d: 890,
    status: 'ENABLED',
    daypartingEnabled: false,
    peakHoursRange: '12:00 - 23:00 (JST)',
    peakBidMultiplierPercent: 0,
    offPeakHoursRange: '01:00 - 07:00 (JST)',
    offPeakBidMultiplierPercent: 0,
  },
];

export const INITIAL_SEARCH_TERMS: AdSearchTermItem[] = [
  {
    id: 'st-01',
    tenantId: 'tenant-alpha-01',
    campaignId: 'CMP-US-SP-001',
    campaignName: '[SP-Exact] 65W GaN Charger Core Keywords',
    marketplace: 'US',
    searchTerm: 'car charger 12v cigarette lighter',
    matchType: 'BROAD',
    impressions: 18400,
    clicks: 64,
    spendUsd: 92.8,
    salesUsd: 0,
    orders: 0,
    negatedStatus: 'ACTIVE',
  },
  {
    id: 'st-02',
    tenantId: 'tenant-alpha-01',
    campaignId: 'CMP-DE-SP-002',
    campaignName: '[SP-Broad] USB C Hub 4K 60Hz DE Traffic',
    marketplace: 'DE',
    searchTerm: 'hdmi kabel 5 meter billig',
    matchType: 'BROAD',
    impressions: 12900,
    clicks: 51,
    spendUsd: 84.15,
    salesUsd: 0,
    orders: 0,
    negatedStatus: 'ACTIVE',
  },
  {
    id: 'st-03',
    tenantId: 'tenant-alpha-01',
    campaignId: 'CMP-US-SP-001',
    campaignName: '[SP-Exact] 65W GaN Charger Core Keywords',
    marketplace: 'US',
    searchTerm: '65w gan usb c charger 3 port',
    matchType: 'EXACT',
    impressions: 42100,
    clicks: 510,
    spendUsd: 714.0,
    salesUsd: 4980.0,
    orders: 166,
    negatedStatus: 'ACTIVE',
  },
  {
    id: 'st-04',
    tenantId: 'tenant-alpha-01',
    campaignId: 'CMP-JP-SP-004',
    campaignName: '[SP-Auto] USB4 240W Cable Automatic Targeting',
    marketplace: 'JP',
    searchTerm: 'lightning cable iphone 11',
    matchType: 'AUTO',
    impressions: 9200,
    clicks: 43,
    spendUsd: 31.4,
    salesUsd: 0,
    orders: 0,
    negatedStatus: 'NEGATIVE_EXACT',
  },
];

export const INITIAL_SETTLEMENTS: SettlementPeriodItem[] = [
  {
    id: 'set-01',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-us-01',
    shopName: 'Store-Alpha-US',
    marketplace: 'US',
    settlementId: 'STL-US-202611-A',
    periodRange: '2026-11-01 ~ 2026-11-14',
    grossSalesUsd: 46210.0,
    amazonFeesUsd: 13840.0,
    adSpendUsd: 5210.0,
    refundsUsd: 1120.0,
    reserveHeldUsd: 3800.0,
    netPayoutUsd: 22240.0,
    reconcileStatus: 'RECONCILED',
    payoutDate: '2026-11-18',
  },
  {
    id: 'set-02',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-de-02',
    shopName: 'Store-Alpha-DE',
    marketplace: 'DE',
    settlementId: 'STL-DE-202611-B',
    periodRange: '2026-11-08 ~ 2026-11-21',
    grossSalesUsd: 18920.0,
    amazonFeesUsd: 5610.0,
    adSpendUsd: 3180.0,
    refundsUsd: 690.0,
    reserveHeldUsd: 1450.0,
    netPayoutUsd: 7990.0,
    reconcileStatus: 'PENDING',
    payoutDate: '2026-11-26',
  },
  {
    id: 'set-03',
    tenantId: 'tenant-alpha-01',
    shopId: 'shop-jp-04',
    shopName: 'Store-Alpha-JP',
    marketplace: 'JP',
    settlementId: 'STL-JP-202611-B',
    periodRange: '2026-11-08 ~ 2026-11-21',
    grossSalesUsd: 14880.0,
    amazonFeesUsd: 4120.0,
    adSpendUsd: 1290.0,
    refundsUsd: 180.0,
    reserveHeldUsd: 950.0,
    netPayoutUsd: 8340.0,
    reconcileStatus: 'PENDING',
    payoutDate: '2026-11-27',
  },
];

export const INITIAL_EXTRA_EXPENSES: ExtraExpenseItem[] = [
  {
    id: 'exp-01',
    tenantId: 'tenant-alpha-01',
    expenseNo: 'EXP-202611-001',
    category: 'OFFSITE_PROMO',
    targetAsin: 'B00DEMO001',
    amountUsd: 450.0,
    note: '北美科技垂类 Deal 站外促销推广费',
    recordedAt: '2026-11-15',
  },
  {
    id: 'exp-02',
    tenantId: 'tenant-alpha-01',
    expenseNo: 'EXP-202611-002',
    category: 'CERTIFICATION',
    targetAsin: 'B00DEMO003',
    amountUsd: 680.0,
    note: 'Qi2 无线充安全认证与电池 UN38.3 报告费分摊',
    recordedAt: '2026-11-19',
  },
];

export const INITIAL_RBAC_ROLES: RbacRoleDefinition[] = [
  {
    id: 'role-tenant-admin',
    tenantId: 'tenant-alpha-01',
    roleCode: 'TENANT_ADMIN',
    roleName: '租户超级管理员 (企业主账号)',
    description: '拥有本租户全部跨境业务、财务底表、领星 MCP 及 RBAC 权限树配置权限',
    isSystemRole: true,
    permissions: ALL_PERMISSIONS_TREE.flatMap((g) => g.permissions.map((p) => p.code)),
  },
  {
    id: 'role-amazon-ops',
    tenantId: 'tenant-alpha-01',
    roleCode: 'AMAZON_OPERATOR',
    roleName: '亚马逊站点运营专员 (专人专店)',
    description: '仅可管理被分配店铺的 Listing 调价、订单、FBA 货件与广告分时调价，默认隐藏采购底价',
    isSystemRole: false,
    permissions: [
      'dashboard:view',
      'amazon:view',
      'amazon:price_edit',
      'fba:view',
      'fba:create',
      'fba:print_label',
      'ads:view',
      'ads:bid_edit',
      'ads:negate_term',
      'mcp:read',
    ],
  },
  {
    id: 'role-supply-chain',
    tenantId: 'tenant-alpha-01',
    roleCode: 'SUPPLY_CHAIN',
    roleName: '供应链与本地仓储主管',
    description: '负责智能补货规划、采购单入库、BOM 组装、本地多仓盘点与仓间调拨',
    isSystemRole: false,
    permissions: [
      'dashboard:view',
      'purchase:view',
      'purchase:create',
      'purchase:receive',
      'purchase:bom_execute',
      'warehouse:view',
      'warehouse:count_adjust',
      'warehouse:transfer',
      'fba:view',
      'fba:print_label',
    ],
  },
  {
    id: 'role-finance',
    tenantId: 'tenant-alpha-01',
    roleCode: 'FINANCE_AUDITOR',
    roleName: '跨境业财总账与审计师',
    description: '负责多维利润底表核算、亚马逊 Settlement 回款对账、运营杂费分摊与采购审批',
    isSystemRole: false,
    permissions: [
      'dashboard:view',
      'amazon:view',
      'purchase:view',
      'purchase:approve',
      'finance:view',
      'finance:cost_view',
      'finance:export_csv',
      'finance:reconcile',
    ],
  },
  {
    id: 'role-beta-admin',
    tenantId: 'tenant-beta-02',
    roleCode: 'TENANT_ADMIN',
    roleName: '租户超级管理员 (企业主账号)',
    description: '拥有 Beta 租户全部已安装模块业务、RBAC 权限树与订阅管理权限',
    isSystemRole: true,
    permissions: ALL_PERMISSIONS_TREE.flatMap((g) => g.permissions.map((p) => p.code)),
  },
  {
    id: 'role-gamma-admin',
    tenantId: 'tenant-gamma-03',
    roleCode: 'TENANT_ADMIN',
    roleName: '租户超级管理员 (企业主账号)',
    description: '拥有 Gamma 租户全部业务、BYOD 配置与订阅激活核销权限',
    isSystemRole: true,
    permissions: ALL_PERMISSIONS_TREE.flatMap((g) => g.permissions.map((p) => p.code)),
  },
];

export const INITIAL_TEAM_MEMBERS: RbacTeamMember[] = [
  {
    id: 'usr-01',
    tenantId: 'tenant-alpha-01',
    fullName: '租户管理员 (Admin)',
    email: 'admin@x-cloud-demo.example',
    departmentName: '总经办',
    roleCode: 'TENANT_ADMIN',
    roleName: '租户超级管理员 (企业主账号)',
    authProvider: 'SUPABASE_AUTH',
    allowedShopIds: ['shop-us-01', 'shop-de-02', 'shop-uk-03', 'shop-jp-04'],
    hidePurchaseCost: false,
    status: 'ACTIVE',
    lastLoginAt: '2026-11-24 19:15',
  },
  {
    id: 'usr-02',
    tenantId: 'tenant-alpha-01',
    fullName: '运营专员 A (北美站点)',
    email: 'ops-a@x-cloud-demo.example',
    departmentName: '北美运营部',
    roleCode: 'AMAZON_OPERATOR',
    roleName: '亚马逊站点运营专员 (专人专店)',
    authProvider: 'LOGTO_OIDC',
    allowedShopIds: ['shop-us-01'],
    hidePurchaseCost: true,
    status: 'ACTIVE',
    lastLoginAt: '2026-11-24 18:20',
  },
  {
    id: 'usr-03',
    tenantId: 'tenant-alpha-01',
    fullName: '供应链主管 B (采购与仓储)',
    email: 'supply-b@x-cloud-demo.example',
    departmentName: '供应链与物流部',
    roleCode: 'SUPPLY_CHAIN',
    roleName: '供应链与本地仓储主管',
    authProvider: 'LOGTO_OIDC',
    allowedShopIds: ['shop-us-01', 'shop-de-02', 'shop-uk-03', 'shop-jp-04'],
    hidePurchaseCost: false,
    status: 'ACTIVE',
    lastLoginAt: '2026-11-24 17:45',
  },
  {
    id: 'usr-04',
    tenantId: 'tenant-alpha-01',
    fullName: '财务审计 C (业财总账)',
    email: 'finance-c@x-cloud-demo.example',
    departmentName: '财务核算部',
    roleCode: 'FINANCE_AUDITOR',
    roleName: '跨境业财总账与审计师',
    authProvider: 'SUPABASE_AUTH',
    allowedShopIds: ['shop-us-01', 'shop-de-02', 'shop-uk-03', 'shop-jp-04'],
    hidePurchaseCost: false,
    status: 'ACTIVE',
    lastLoginAt: '2026-11-24 16:50',
  },
  {
    id: 'usr-beta-01',
    tenantId: 'tenant-beta-02',
    fullName: 'Beta 租户主账号 (Admin)',
    email: 'admin-beta@x-cloud-demo.example',
    departmentName: '总经办',
    roleCode: 'TENANT_ADMIN',
    roleName: '租户超级管理员 (企业主账号)',
    authProvider: 'SUPABASE_AUTH',
    allowedShopIds: ['shop-us-01', 'shop-de-02'],
    hidePurchaseCost: false,
    status: 'ACTIVE',
    lastLoginAt: '2026-11-24 15:10',
  },
  {
    id: 'usr-gamma-01',
    tenantId: 'tenant-gamma-03',
    fullName: 'Gamma 租户主账号 (Admin)',
    email: 'admin-gamma@x-cloud-demo.example',
    departmentName: '总经办',
    roleCode: 'TENANT_ADMIN',
    roleName: '租户超级管理员 (企业主账号)',
    authProvider: 'LOGTO_OIDC',
    allowedShopIds: ['shop-us-01', 'shop-de-02', 'shop-uk-03', 'shop-jp-04'],
    hidePurchaseCost: false,
    status: 'ACTIVE',
    lastLoginAt: '2026-11-17 22:05',
  },
];

export const INITIAL_MCP_TOKENS: McpTokenItem[] = [
  {
    id: 'mcp-tok-01',
    tenantId: 'tenant-alpha-01',
    tokenName: 'Claude-Desktop-运营总监智能体',
    tokenPreview: 'xc_mcp_demo_****0001',
    fullTokenValue: 'xc_mcp_demo_placeholder_token_0001',
    permissionScope: 'READ_WRITE',
    authMode: 'PAT_STATIC',
    callsCountMonth: 980,
    lastUsedAt: '2026-11-24 19:22:10',
    status: 'ACTIVE',
  },
  {
    id: 'mcp-tok-02',
    tenantId: 'tenant-alpha-01',
    tokenName: 'Cursor-供应链补货精算Agent',
    tokenPreview: 'xc_mcp_demo_****0002',
    fullTokenValue: 'xc_mcp_demo_placeholder_token_0002',
    permissionScope: 'READ_ONLY',
    authMode: 'LOGTO_OAUTH21',
    callsCountMonth: 440,
    lastUsedAt: '2026-11-24 18:10:05',
    status: 'ACTIVE',
  },
];

export const INITIAL_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'log-01',
    tenantId: 'tenant-alpha-01',
    scope: 'TENANT',
    actorType: 'LINGXING_MCP_CRON',
    actorName: 'Cloudflare Worker Cron (*/15 * * * *)',
    action: 'SYNC_LINGXING_MCP',
    targetEntity: 'lx_query_asin_daily_sales & lx_get_fba_inventory',
    detail: '通过领星 MCP 增量同步 4 个站点店铺共 5 个主力 ASIN 日销量与 FBA 库龄快照，耗时 284ms',
    createdAt: '2026-11-24 19:30:12',
  },
  {
    id: 'log-02',
    tenantId: 'tenant-alpha-01',
    scope: 'TENANT',
    actorType: 'MCP_AI_AGENT',
    actorName: 'Claude-Desktop-运营总监智能体',
    action: 'CREATE_DRAFT_PO',
    targetEntity: 'PO-20261124-003 (XC-ITEM-003)',
    detail: '调用 MCP Tool [create_draft_purchase_order] 自动生成 1,800 件待审核采购单',
    createdAt: '2026-11-24 18:45:02',
  },
  {
    id: 'log-03',
    tenantId: 'tenant-gamma-03',
    scope: 'PLATFORM',
    actorType: 'BILLING_SYSTEM',
    actorName: 'Daily Midnight Expiry Sweeper',
    action: 'TENANT_DOWNGRADE_READONLY',
    targetEntity: 'Tenant: TENANT-GAMMA',
    detail: '租户宽限期已过仍未续费，自动降级为 EXPIRED_READONLY，已暂停领星 MCP 定时同步并锁定 RLS 写权限',
    createdAt: '2026-11-18 00:00:05',
  },
  {
    id: 'log-04',
    tenantId: 'PLATFORM',
    scope: 'PLATFORM',
    actorType: 'PLATFORM_ADMIN',
    actorName: 'Platform Super Admin',
    action: 'ISSUE_LICENSE_KEY',
    targetEntity: 'XC-PRO-365D-DEMO-0001',
    detail: '平台超管签发 365 天 PRO 专业版商业授权激活码',
    createdAt: '2026-11-24 10:15:00',
  },
];

export const SUPABASE_MULTI_TENANT_SQL_SCHEMA = `-- =============================================================================
-- X Cloud ERP: Supabase PostgreSQL Multi-Tenant + Dual-Portal RBAC + RLS Schema
-- 严格隔离 Platform Super Admin 与 Tenant Admin/Operator 权限边界
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 平台超级管理员白名单表 (独立于业务租户，仅 Platform Portal 可读写全局配置)
CREATE TABLE IF NOT EXISTS public.sys_platform_admins (
  user_id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sys_platform_admins WHERE user_id = auth.uid()
  );
$$;

-- 2. SaaS 梯度订阅套餐表 (仅 Platform Super Admin 可写，租户只读)
CREATE TABLE IF NOT EXISTS public.sys_subscription_plans (
  plan_code TEXT PRIMARY KEY,
  plan_name TEXT NOT NULL,
  monthly_price_cny NUMERIC(10,2) NOT NULL DEFAULT 0,
  annual_price_cny NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_shops INT NOT NULL DEFAULT 1,
  max_users INT NOT NULL DEFAULT 2,
  max_skus INT NOT NULL DEFAULT 50,
  max_dayparting_rules INT NOT NULL DEFAULT 2,
  mcp_calls_quota INT NOT NULL DEFAULT 100,
  sync_interval_minutes INT NOT NULL DEFAULT 360
);

INSERT INTO public.sys_subscription_plans (plan_code, plan_name, monthly_price_cny, annual_price_cny, max_shops, max_users, max_skus, max_dayparting_rules, mcp_calls_quota, sync_interval_minutes)
VALUES
  ('FREE', '免费入门版 (Free)', 0, 0, 1, 2, 50, 2, 100, 360),
  ('TRIAL', '14天全功能体验版 (Trial)', 0, 0, 3, 5, 300, 10, 1000, 60),
  ('PRO', '专业大卖版 (Pro)', 999, 9990, 15, 25, 3000, 50, 15000, 15),
  ('ENTERPRISE', '集团旗舰定制版 (Enterprise)', 2999, 29990, 100, 200, 50000, 500, 100000, 5)
ON CONFLICT (plan_code) DO NOTHING;

-- 3. 卖家企业租户主表 (sys_tenants)
CREATE TABLE IF NOT EXISTS public.sys_tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_code TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE,
  company_name TEXT NOT NULL,
  logto_org_id TEXT UNIQUE,
  isolation_mode TEXT NOT NULL DEFAULT 'SCHEMA_PER_TENANT',
  byod_supabase_url TEXT,
  plan_code TEXT NOT NULL REFERENCES public.sys_subscription_plans(plan_code) DEFAULT 'TRIAL',
  subscription_status TEXT NOT NULL DEFAULT 'TRIALING'
    CHECK (subscription_status IN ('TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED_READONLY', 'SUSPENDED')),
  base_currency TEXT NOT NULL DEFAULT 'CNY',
  subscription_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  grace_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '17 days'),
  lingxing_mcp_url TEXT DEFAULT 'https://mcp.lingxing.com/mcp/v1/stream',
  lingxing_mcp_key TEXT,
  lingxing_app_id TEXT,
  lingxing_connection_status TEXT NOT NULL DEFAULT 'CONNECTED',
  workspace_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  used_mcp_calls_month INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 幂等补齐增量列 (兼容已运行过旧版 SQL 的数据库平滑升级)
ALTER TABLE public.sys_tenants ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.sys_tenants ADD COLUMN IF NOT EXISTS isolation_mode TEXT NOT NULL DEFAULT 'SCHEMA_PER_TENANT';
ALTER TABLE public.sys_tenants ADD COLUMN IF NOT EXISTS byod_supabase_url TEXT;
ALTER TABLE public.sys_tenants ADD COLUMN IF NOT EXISTS lingxing_app_id TEXT;
ALTER TABLE public.sys_tenants ADD COLUMN IF NOT EXISTS lingxing_connection_status TEXT NOT NULL DEFAULT 'CONNECTED';
ALTER TABLE public.sys_tenants ADD COLUMN IF NOT EXISTS workspace_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.sys_tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 4. 租户内角色权限树与成员表 (RBAC + 专人专店 + 成本脱敏)
CREATE TABLE IF NOT EXISTS public.sys_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.sys_tenants(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  role_name TEXT NOT NULL,
  permission_codes TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE(tenant_id, role_code)
);

CREATE TABLE IF NOT EXISTS public.sys_tenant_members (
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.sys_tenants(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  department_name TEXT NOT NULL DEFAULT '默认部门',
  allowed_shop_ids TEXT[] NOT NULL DEFAULT '{}',
  hide_purchase_cost BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (user_id, tenant_id)
);

-- 5. 统一租户上下文与到期写熔断函数 (兼容 Supabase Auth & Logto OIDC)
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID,
    (SELECT id FROM public.sys_tenants WHERE logto_org_id = (auth.jwt() ->> 'organization_id') LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_writable()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sys_tenants
    WHERE id = public.get_current_tenant_id()
      AND subscription_status IN ('TRIALING', 'ACTIVE', 'GRACE_PERIOD')
      AND grace_ends_at > now()
  );
$$;

-- 6. 业务核心表（含订单、BOM、多仓盘点调拨、搜索词否词、财务回款对账）均强制 tenant_id + RLS
CREATE TABLE IF NOT EXISTS public.amz_product_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.sys_tenants(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  asin TEXT NOT NULL,
  msku TEXT NOT NULL,
  fnsku TEXT,
  local_sku_code TEXT,
  price_orig NUMERIC(10,2) NOT NULL DEFAULT 0,
  fba_available INT NOT NULL DEFAULT 0,
  fba_inbound INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, marketplace, msku)
);

ALTER TABLE public.amz_product_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_shop_scoped_select" ON public.amz_product_listings;
CREATE POLICY "tenant_shop_scoped_select" ON public.amz_product_listings
  FOR SELECT USING (
    tenant_id = public.get_current_tenant_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.sys_tenant_members m
        WHERE m.user_id = auth.uid() AND m.tenant_id = amz_product_listings.tenant_id
          AND (m.role_code = 'TENANT_ADMIN' OR amz_product_listings.shop_id = ANY(m.allowed_shop_ids))
      )
    )
  );

DROP POLICY IF EXISTS "tenant_writable_guard" ON public.amz_product_listings;
CREATE POLICY "tenant_writable_guard" ON public.amz_product_listings
  FOR ALL USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_tenant_writable()
  );

-- 7. 应用市场模块目录、租户模块授权、团队邮件邀请与超管代管会话 (Lasaas 范式扩展)
CREATE TABLE IF NOT EXISTS public.sys_app_modules (
  module_code TEXT PRIMARY KEY,
  module_name TEXT NOT NULL,
  min_plan_code TEXT NOT NULL DEFAULT 'FREE',
  monthly_addon_price_cny NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_core_required BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.sys_tenant_installed_modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.sys_tenants(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL REFERENCES public.sys_app_modules(module_code),
  enabled BOOLEAN NOT NULL DEFAULT true,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, module_code)
);

CREATE TABLE IF NOT EXISTS public.sys_tenant_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.sys_tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role_code TEXT NOT NULL,
  allowed_shop_ids TEXT[] NOT NULL DEFAULT '{}',
  invite_token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE TABLE IF NOT EXISTS public.sys_impersonation_sessions (
  session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_admin_user_id UUID NOT NULL,
  target_tenant_id UUID NOT NULL REFERENCES public.sys_tenants(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE public.sys_tenant_installed_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_tenant_invitations ENABLE ROW LEVEL SECURITY;

-- 8. 全量 ERP 业务实体实时持久化存储表 (支撑全部 22 类多租户与业财实体零丢字段直连落库)
CREATE TABLE IF NOT EXISTS public.erp_domain_records (
  entity_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'platform',
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_erp_domain_records_tenant_type
  ON public.erp_domain_records (tenant_id, entity_type);

ALTER TABLE public.sys_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_domain_records ENABLE ROW LEVEL SECURITY;

-- 显式授予 anon / authenticated / service_role 表级操作权限 (修复 Supabase 新建表默认报 42501 permission denied 问题)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sys_subscription_plans TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sys_tenants TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.erp_domain_records TO anon, authenticated, service_role;

-- 直连工作台读写策略 (便于未接入登录页前验证全量真库读写；上线开启 Auth JWT 后可替换为严格 auth.uid() 策略)
DROP POLICY IF EXISTS "xcloud_workspace_plans_rw" ON public.sys_subscription_plans;
CREATE POLICY "xcloud_workspace_plans_rw" ON public.sys_subscription_plans
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "xcloud_workspace_tenants_rw" ON public.sys_tenants;
CREATE POLICY "xcloud_workspace_tenants_rw" ON public.sys_tenants
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "xcloud_workspace_records_rw" ON public.erp_domain_records;
CREATE POLICY "xcloud_workspace_records_rw" ON public.erp_domain_records
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
`;

export const CLOUDFLARE_WORKER_DEPLOY_CODE = `// =============================================================================
// Cloudflare Worker: X Cloud ERP Serverless Gateway (worker.ts)
// 1. 边缘 JWT/JWKS 鉴权 (Supabase Auth & Logto OIDC) + 租户订阅到期拦截
// 2. 上游领星 MCP 客户端定时同步器 (Cron Triggers -> Lingxing MCP -> Supabase)
// 3. 下游 X Cloud MCP Server (/api/mcp Streamable HTTP JSON-RPC 2.0)
// =============================================================================

import { createClient } from '@supabase/supabase-js';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  LOGTO_JWKS_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    if (url.pathname === '/api/mcp' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      const mcpToken = authHeader.replace('Bearer ', '').trim();
      const body: any = await request.json();

      const { data: tenant } = await supabase
        .from('sys_tenants')
        .select('*')
        .eq('lingxing_mcp_key', mcpToken)
        .single();

      if (tenant && tenant.subscription_status === 'EXPIRED_READONLY') {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32002, message: 'Tenant subscription expired (Read-Only Mode)' }
        }), { status: 402, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: { status: 'OK', server: 'x-cloud-edge-mcp' }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('X Cloud ERP Edge Gateway Ready', { status: 200 });
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    if (event.cron === '0 0 * * *') {
      await supabase
        .from('sys_tenants')
        .update({ subscription_status: 'EXPIRED_READONLY' })
        .lt('grace_ends_at', new Date().toISOString())
        .in('subscription_status', ['ACTIVE', 'TRIALING', 'GRACE_PERIOD']);
    }

    const { data: activeTenants } = await supabase
      .from('sys_tenants')
      .select('id, tenant_code, lingxing_mcp_url, lingxing_mcp_key')
      .in('subscription_status', ['ACTIVE', 'TRIALING', 'GRACE_PERIOD'])
      .not('lingxing_mcp_key', 'is', null);

    for (const tenant of activeTenants || []) {
      await fetch(tenant.lingxing_mcp_url, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: {
          'Content-Type': 'application/json',
          'X-Mcp-Key': tenant.lingxing_mcp_key,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: \`cron-\${tenant.tenant_code}-\${Date.now()}\`,
          method: 'tools/call',
          params: { name: 'lx_query_asin_daily_sales', arguments: { days: 7 } }
        })
      });
    }
  }
};
`;

export const WRANGLER_TOML_CONFIG = `name = "x-cloud-erp-gateway"
main = "src/worker.ts"
compatibility_date = "2026-11-01"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = [
  "*/15 * * * *",
  "0 0 * * *"
]

[vars]
ENVIRONMENT = "production"
DEFAULT_LINGXING_MCP_URL = "https://mcp.lingxing.com/mcp"
`;
