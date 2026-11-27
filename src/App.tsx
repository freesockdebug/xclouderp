import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ALL_PERMISSIONS_TREE } from './data/initialErpData';
import {
  PortalMode,
  PermissionCode,
  Tenant,
  SubscriptionPlan,
  BillingLicense,
  AmazonShop,
  FreightChannelQuote,
  LocalMaterialSku,
  AmazonListingItem,
  AmazonOrderItem,
  SupplierProfile,
  BomAssemblyOrder,
  PurchaseOrder1688,
  WarehouseStockLedger,
  FbaShipmentPlan,
  AdCampaignItem,
  AdSearchTermItem,
  SettlementPeriodItem,
  ExchangeRateItem,
  LingxingProfitSummaryItem,
  ExtraExpenseItem,
  RbacRoleDefinition,
  RbacTeamMember,
  McpTokenItem,
  AuditLogItem,
  SubscriptionPlanCode,
  SubscriptionStatus,
  ErpAppModule,
  ErpModuleCode,
  TenantInstalledModule,
  TenantInvitation,
  ImpersonationSession,
  TenantWorkspaceSettings,
} from './types/erp';
import {
  isTenantWritable,
  resolveMemberPermissions,
  filterByShopScope,
  validateTenantSlug,
  canTenantInstallModule,
  isModuleEnabledForTenant,
  checkTenantQuota,
  isValidImpersonationSession,
} from './lib/erpEngine';
import {
  loadSupabaseConfig,
  fetchServerSupabaseConfig,
  saveServerSupabaseConfig,
  SupabaseConnectionConfig,
} from './services/supabaseClient';
import {
  ErpDatabaseSnapshot,
  ErpEntityType,
  DatabaseLoadStatus,
  createEmptyErpSnapshot,
  loadErpDatabaseSnapshot,
  syncErpSnapshotDiff,
  upsertErpEntityRecords,
  persistTenantLingxingToSupabase,
  persistLingxingSyncedEntities,
  seedStandardErpDataToSupabase,
} from './services/erpDatabaseService';
import {
  BackendQueryContext,
  fetchErpBootstrap,
  fetchErpPageData,
  invalidateErpBackendCache,
} from './services/backendDataClient';
import { isDemoFixtureRecord, mergeSyncedEntities } from './services/lingxingMcpSync';
import { DashboardOverview } from './components/DashboardOverview';
import { AmazonOrdersAndListingsView } from './components/AmazonOrdersAndListingsView';
import { LingxingMcpConnectorView } from './components/LingxingMcpConnectorView';
import { InventorySupplyChainView } from './components/InventorySupplyChainView';
import { WarehouseInventoryView } from './components/WarehouseInventoryView';
import { FbaShipmentsView } from './components/FbaShipmentsView';
import { AdvertisingDaypartingView } from './components/AdvertisingDaypartingView';
import { FinanceAccountingView } from './components/FinanceAccountingView';
import { ProductPerformanceView } from './components/ProductPerformanceView';
import { OperationsToolsView } from './components/OperationsToolsView';
import { RbacPermissionCenterView } from './components/RbacPermissionCenterView';
import { TenantSubscriptionView } from './components/TenantSubscriptionView';
import { McpAndCloudDeployView } from './components/McpAndCloudDeployView';
import { TenantAppMarketplaceView } from './components/TenantAppMarketplaceView';
import { TenantWorkspaceSettingsView } from './components/TenantWorkspaceSettingsView';
import {
  SuperAdminConsoleView,
  SuperAdminSubTab,
  ProvisionTenantPayload,
} from './components/SuperAdminConsoleView';
import { SupabaseSetupModal } from './components/SupabaseSetupModal';
import {
  LayoutDashboard,
  ShoppingCart,
  Database,
  Package,
  Warehouse,
  Truck,
  Megaphone,
  Calculator,
  Shield,
  CreditCard,
  Cpu,
  Building2,
  KeyRound,
  Server,
  FileText,
  Sun,
  Moon,
  AlertTriangle,
  Lock,
  CheckCircle2,
  ShieldCheck,
  Blocks,
  Sliders,
  LogOut,
  UserCheck,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  RefreshCw,
  BarChart2,
  Wrench,
} from 'lucide-react';

type TenantModuleTab =
  | 'overview'
  | 'product_performance'
  | 'amazon'
  | 'inventory'
  | 'warehouse'
  | 'fba'
  | 'ads'
  | 'finance'
  | 'ops_tools'
  | 'lingxing'
  | 'mcp_downstream'
  | 'rbac_center'
  | 'tenant_subscription'
  | 'app_marketplace'
  | 'workspace_settings';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Strict Dual-Portal Separation State
  const [portalMode, setPortalMode] = useState<PortalMode>('TENANT_WORKSPACE');
  const [superAdminTab, setSuperAdminTab] =
    useState<SuperAdminSubTab>('platform_overview');
  const [activeTenantTab, setActiveTenantTab] =
    useState<TenantModuleTab>('overview');
  const [isSetupModalOpen, setIsSetupModalOpen] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState<boolean>(false);

  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConnectionConfig>(() =>
    loadSupabaseConfig()
  );
  const [dbConfigHydrated, setDbConfigHydrated] = useState<boolean>(false);

  // Live Supabase Database Status (Backend-backed on-demand per page — zero startup loading wall)
  const [dbStatus, setDbStatus] = useState<DatabaseLoadStatus>('LOADED');
  const [dbMessage, setDbMessage] = useState<string>('');
  const [dbRecordCount, setDbRecordCount] = useState<number>(0);
  const [hasBootstrapped, setHasBootstrapped] = useState<boolean>(false);
  const [isLoadingDb, setIsLoadingDb] = useState<boolean>(false);
  const [isSeedingDb, setIsSeedingDb] = useState<boolean>(false);
  const [backendEntityCounts, setBackendEntityCounts] = useState<
    Partial<Record<ErpEntityType, number>>
  >({});
  const [backendQueryVersion, setBackendQueryVersion] = useState<number>(0);

  // Platform-level state (loaded exclusively from Supabase)
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string>('');
  const [licenses, setLicenses] = useState<BillingLicense[]>([]);
  const [shops, setShops] = useState<AmazonShop[]>([]);
  const [freightQuotes, setFreightQuotes] = useState<FreightChannelQuote[]>([]);

  // Tenant ERP domain state (loaded exclusively from Supabase)
  const [localSkus, setLocalSkus] = useState<LocalMaterialSku[]>([]);
  const [listings, setListings] = useState<AmazonListingItem[]>([]);
  const [orders, setOrders] = useState<AmazonOrderItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>([]);
  const [bomOrders, setBomOrders] = useState<BomAssemblyOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder1688[]>([]);
  const [warehouseLedgers, setWarehouseLedgers] = useState<WarehouseStockLedger[]>([]);
  const [fbaShipments, setFbaShipments] = useState<FbaShipmentPlan[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaignItem[]>([]);
  const [searchTerms, setSearchTerms] = useState<AdSearchTermItem[]>([]);
  const [settlements, setSettlements] = useState<SettlementPeriodItem[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateItem[]>([]);
  const [profitSummaries, setProfitSummaries] = useState<LingxingProfitSummaryItem[]>([]);
  const [extraExpenses, setExtraExpenses] = useState<ExtraExpenseItem[]>([]);

  // Tenant RBAC & Modular App Marketplace state (loaded exclusively from Supabase)
  const [rbacRoles, setRbacRoles] = useState<RbacRoleDefinition[]>([]);
  const [teamMembers, setTeamMembers] = useState<RbacTeamMember[]>([]);
  const [activeMemberId, setActiveMemberId] = useState<string>('');
  const [appModules, setAppModules] = useState<ErpAppModule[]>([]);
  const [installedModules, setInstalledModules] = useState<TenantInstalledModule[]>([]);
  const [invitations, setInvitations] = useState<TenantInvitation[]>([]);
  const [impersonationSession, setImpersonationSession] =
    useState<ImpersonationSession | null>(null);

  // MCP & Audit state (loaded exclusively from Supabase)
  const [mcpTokens, setMcpTokens] = useState<McpTokenItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [toastNotice, setToastNotice] = useState<string>('');

  // Refs for real-time diff persistence without triggering write loops on lazy page hydration
  const dbHydratedRef = useRef<boolean>(false);
  const prevSnapshotRef = useRef<ErpDatabaseSnapshot>(createEmptyErpSnapshot());
  const loadedEntitiesRef = useRef<Set<ErpEntityType>>(new Set());

  const currentSnapshot = useMemo<ErpDatabaseSnapshot>(
    () => ({
      plans,
      tenants,
      licenses,
      shops,
      freightQuotes,
      localSkus,
      listings,
      orders,
      suppliers,
      bomOrders,
      purchaseOrders,
      warehouseLedgers,
      fbaShipments,
      adCampaigns,
      searchTerms,
      settlements,
      exchangeRates,
      profitSummaries,
      extraExpenses,
      rbacRoles,
      teamMembers,
      appModules,
      installedModules,
      invitations,
      mcpTokens,
      auditLogs,
    }),
    [
      plans,
      tenants,
      licenses,
      shops,
      freightQuotes,
      localSkus,
      listings,
      orders,
      suppliers,
      bomOrders,
      purchaseOrders,
      warehouseLedgers,
      fbaShipments,
      adCampaigns,
      searchTerms,
      settlements,
      exchangeRates,
      profitSummaries,
      extraExpenses,
      rbacRoles,
      teamMembers,
      appModules,
      installedModules,
      invitations,
      mcpTokens,
      auditLogs,
    ]
  );

  const showToast = useCallback((msg: string) => {
    setToastNotice(msg);
    setTimeout(() => setToastNotice(''), 4000);
  }, []);

  const hydrateEntitiesSilently = useCallback(
    (
      patch: Partial<Record<ErpEntityType, unknown[]>>,
      markAsLoaded: ErpEntityType[] = []
    ) => {
      const nextPrev: ErpDatabaseSnapshot = { ...prevSnapshotRef.current };
      const applyKey = <K extends ErpEntityType>(
        key: K,
        setter: React.Dispatch<React.SetStateAction<ErpDatabaseSnapshot[K]>>
      ) => {
        if (patch[key] !== undefined) {
          const rows = patch[key] as ErpDatabaseSnapshot[K];
          nextPrev[key] = rows;
          setter(rows);
        }
      };

      applyKey('plans', setPlans);
      applyKey('tenants', setTenants);
      applyKey('licenses', setLicenses);
      applyKey('shops', setShops);
      applyKey('freightQuotes', setFreightQuotes);
      applyKey('localSkus', setLocalSkus);
      applyKey('listings', setListings);
      applyKey('orders', setOrders);
      applyKey('suppliers', setSuppliers);
      applyKey('bomOrders', setBomOrders);
      applyKey('purchaseOrders', setPurchaseOrders);
      applyKey('warehouseLedgers', setWarehouseLedgers);
      applyKey('fbaShipments', setFbaShipments);
      applyKey('adCampaigns', setAdCampaigns);
      applyKey('searchTerms', setSearchTerms);
      applyKey('settlements', setSettlements);
      applyKey('exchangeRates', setExchangeRates);
      applyKey('profitSummaries', setProfitSummaries);
      applyKey('extraExpenses', setExtraExpenses);
      applyKey('rbacRoles', setRbacRoles);
      applyKey('teamMembers', setTeamMembers);
      applyKey('appModules', setAppModules);
      applyKey('installedModules', setInstalledModules);
      applyKey('invitations', setInvitations);
      applyKey('mcpTokens', setMcpTokens);
      applyKey('auditLogs', setAuditLogs);

      prevSnapshotRef.current = nextPrev;
      for (const k of markAsLoaded) {
        loadedEntitiesRef.current.add(k);
      }

      if (patch.tenants !== undefined) {
        const nextTenants = patch.tenants as Tenant[];
        setCurrentTenantId((prevId) =>
          nextTenants.some((t) => t.id === prevId) ? prevId : nextTenants[0]?.id || ''
        );
      }
      if (patch.teamMembers !== undefined) {
        const nextMembers = patch.teamMembers as RbacTeamMember[];
        setActiveMemberId((prevMemberId) =>
          nextMembers.some((m) => m.id === prevMemberId)
            ? prevMemberId
            : nextMembers[0]?.id || ''
        );
      }

      dbHydratedRef.current = true;
    },
    []
  );

  const applySnapshotFromDb = useCallback(
    (snap: ErpDatabaseSnapshot) => {
      const allKeys = Object.keys(snap) as ErpEntityType[];
      hydrateEntitiesSilently(snap as Partial<Record<ErpEntityType, unknown[]>>, allKeys);
    },
    [hydrateEntitiesSilently]
  );

  const bootstrapFromBackend = useCallback(async () => {
    const res = await fetchErpBootstrap();
    setDbStatus(res.status);
    setDbMessage(res.message);
    setDbRecordCount(res.recordCount);
    const loadedKeys = Object.keys(res.data) as ErpEntityType[];
    hydrateEntitiesSilently(res.data, loadedKeys);
    setHasBootstrapped(true);
    setBackendQueryVersion((v) => v + 1);
  }, [hydrateEntitiesSilently]);

  const reloadFromDatabase = useCallback(
    async (cfgOverride?: SupabaseConnectionConfig, fullSnapshot = false) => {
      setIsLoadingDb(true);
      await invalidateErpBackendCache();
      if (fullSnapshot) {
        const targetCfg = cfgOverride || supabaseConfig;
        dbHydratedRef.current = false;
        const res = await loadErpDatabaseSnapshot(targetCfg);
        setDbStatus(res.status);
        setDbMessage(res.message);
        setDbRecordCount(res.recordCount);
        applySnapshotFromDb(res.snapshot);
        setHasBootstrapped(true);
      } else {
        await bootstrapFromBackend();
      }
      setIsLoadingDb(false);
    },
    [supabaseConfig, applySnapshotFromDb, bootstrapFromBackend]
  );

  const handleSeedStandardDataToDb = useCallback(async () => {
    setIsSeedingDb(true);
    const res = await seedStandardErpDataToSupabase(supabaseConfig);
    showToast(res.message);
    if (res.ok) {
      await invalidateErpBackendCache();
      await bootstrapFromBackend();
    }
    setIsSeedingDb(false);
  }, [supabaseConfig, bootstrapFromBackend, showToast]);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchServerSupabaseConfig(), fetchErpBootstrap()])
      .then(([cfg, boot]) => {
        if (!active) return;
        setSupabaseConfig(cfg);
        setDbConfigHydrated(true);
        setDbStatus(boot.status);
        setDbMessage(boot.message);
        setDbRecordCount(boot.recordCount);
        const loadedKeys = Object.keys(boot.data) as ErpEntityType[];
        hydrateEntitiesSilently(boot.data, loadedKeys);
        setHasBootstrapped(true);
      })
      .catch(() => {
        if (active) {
          setDbConfigHydrated(true);
          setHasBootstrapped(true);
        }
      });
    return () => {
      active = false;
    };
  }, [hydrateEntitiesSilently]);

  // Re-bootstrap quietly if Super Admin changes DB credentials at runtime
  const prevDbKeyRef = useRef<string>('');
  useEffect(() => {
    if (!dbConfigHydrated) return;
    const key = `${supabaseConfig.projectUrl}|${supabaseConfig.anonKey}`;
    if (!prevDbKeyRef.current) {
      prevDbKeyRef.current = key;
      return;
    }
    if (prevDbKeyRef.current !== key) {
      prevDbKeyRef.current = key;
      void bootstrapFromBackend();
    }
  }, [dbConfigHydrated, supabaseConfig.projectUrl, supabaseConfig.anonKey, bootstrapFromBackend]);

  // Real-time diff sync: persist ONLY mutations on loaded collections directly to Supabase,
  // and immediately invalidate backend entity cache so paginated queries stay fresh.
  useEffect(() => {
    if (!dbHydratedRef.current) return;
    if (dbStatus !== 'LOADED' && dbStatus !== 'EMPTY_DB') return;
    const prevSnap = prevSnapshotRef.current;
    if (prevSnap === currentSnapshot) return;

    prevSnapshotRef.current = currentSnapshot;
    void syncErpSnapshotDiff(
      supabaseConfig,
      prevSnap,
      currentSnapshot,
      loadedEntitiesRef.current
    ).then((res) => {
      if (!res.ok && res.error) {
        showToast(res.error);
      } else if (res.ok && (res.upserted > 0 || res.deleted > 0)) {
        if (dbStatus === 'EMPTY_DB') {
          setDbStatus('LOADED');
        }
        setDbRecordCount((c) => Math.max(0, c + res.upserted - res.deleted));
        void invalidateErpBackendCache(res.changedTypes, currentTenantId || undefined).then(() => {
          setBackendQueryVersion((v) => v + 1);
        });
      }
    });
  }, [currentSnapshot, dbStatus, supabaseConfig, currentTenantId, showToast]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (portalMode !== 'PLATFORM_SUPER_ADMIN' && isSetupModalOpen) {
      setIsSetupModalOpen(false);
    }
  }, [portalMode, isSetupModalOpen]);

  const currentTenant: Tenant | null =
    tenants.find((t) => t.id === currentTenantId) || tenants[0] || null;
  const fallbackPlan: SubscriptionPlan = {
    planCode: currentTenant?.planCode || 'TRIAL',
    planName: '默认套餐',
    targetAudience: '标准多租户工作台',
    monthlyPriceCny: 0,
    annualPriceCny: 0,
    maxShops: 5,
    maxUsers: 10,
    maxSkus: 500,
    maxDaypartingRules: 10,
    mcpCallsQuota: 1000,
    syncIntervalMinutes: 60,
  };
  const currentPlan =
    (currentTenant && plans.find((p) => p.planCode === currentTenant.planCode)) ||
    plans[0] ||
    fallbackPlan;
  const isReadOnlyExpired = currentTenant ? !isTenantWritable(currentTenant) : false;

  const currentTenantRoles = currentTenant
    ? rbacRoles.filter((r) => r.tenantId === currentTenant.id)
    : [];
  const currentTenantMembers = currentTenant
    ? teamMembers.filter((m) => m.tenantId === currentTenant.id)
    : [];
  const currentTenantInvitations = currentTenant
    ? invitations.filter((inv) => inv.tenantId === currentTenant.id)
    : [];

  const activeMember: RbacTeamMember | null =
    currentTenantMembers.find((m) => m.id === activeMemberId) ||
    currentTenantMembers[0] ||
    teamMembers[0] ||
    null;
  const activePermissions = activeMember
    ? resolveMemberPermissions(activeMember, rbacRoles)
    : new Set<PermissionCode>();
  const hasPerm = (code: PermissionCode): boolean => activePermissions.has(code);
  const isMcpGatewayEnabled = currentTenant
    ? isModuleEnabledForTenant(
        currentTenant.id,
        'mod_mcp_gateway',
        installedModules,
        appModules
      )
    : false;

  // Data-Level Shop Scope Isolation & Cost Masking
  const tenantShops = currentTenant ? shops.filter((s) => s.tenantId === currentTenant.id) : [];
  const tenantLocalSkus = currentTenant
    ? localSkus.filter((s) => s.tenantId === currentTenant.id)
    : [];
  const tenantSuppliers = currentTenant
    ? suppliers.filter((s) => s.tenantId === currentTenant.id)
    : [];
  const tenantExchangeRates = currentTenant
    ? exchangeRates.filter((r) => r.tenantId === currentTenant.id)
    : [];
  const tenantProfitSummaries = currentTenant
    ? profitSummaries.filter((p) => p.tenantId === currentTenant.id)
    : [];
  const scopedListings = activeMember ? filterByShopScope(listings, activeMember) : [];
  const scopedOrders = activeMember ? filterByShopScope(orders, activeMember) : [];
  const scopedCampaigns = activeMember ? filterByShopScope(adCampaigns, activeMember) : [];
  const scopedSettlements = activeMember ? filterByShopScope(settlements, activeMember) : [];
  const activeCostMasked = activeMember
    ? activeMember.hidePurchaseCost || !hasPerm('finance:cost_view')
    : true;

  // Automatically bind & start server-side scheduled Lingxing MCP auto-sync once Supabase is hydrated
  useEffect(() => {
    if (
      dbStatus !== 'LOADED' ||
      !supabaseConfig.projectUrl ||
      !supabaseConfig.anonKey ||
      !currentTenant ||
      !currentTenant.lingxingMcpUrl ||
      isReadOnlyExpired
    ) {
      return;
    }
    let cancelled = false;
    void fetch('/api/lingxing/scheduler/status')
      .then((r) => r.json())
      .then((st) => {
        if (cancelled) return;
        if (!st?.scheduler?.supabaseConfigured) {
          return fetch('/api/lingxing/scheduler/configure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              supabaseUrl: supabaseConfig.projectUrl,
              supabaseAnonKey: supabaseConfig.anonKey,
              tenantId: currentTenant.id,
              intervalMinutes: currentPlan.syncIntervalMinutes || 15,
              enabled: true,
              tenantStatus: currentTenant.subscriptionStatus,
            }),
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    dbStatus,
    supabaseConfig.projectUrl,
    supabaseConfig.anonKey,
    currentTenant?.id,
    currentTenant?.lingxingMcpUrl,
    currentTenant?.subscriptionStatus,
    currentPlan.syncIntervalMinutes,
    isReadOnlyExpired,
  ]);

  const appendAuditLog = (
    scope: AuditLogItem['scope'],
    actorType: AuditLogItem['actorType'],
    actorName: string,
    action: string,
    targetEntity: string,
    detail: string
  ) => {
    const newLog: AuditLogItem = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenantId: scope === 'PLATFORM' ? 'platform' : currentTenant?.id || 'platform',
      scope,
      actorType,
      actorName,
      action,
      targetEntity,
      detail,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const appendStockLedger = (
    warehouseName: string,
    localSkuCode: string,
    movementType: WarehouseStockLedger['movementType'],
    qtyDelta: number,
    balanceAfter: number,
    referenceDoc: string
  ) => {
    if (!currentTenant) return;
    const entry: WarehouseStockLedger = {
      id: `ldg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenantId: currentTenant.id,
      ledgerNo: `WMS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
        100 + Math.random() * 899
      )}`,
      warehouseName,
      localSkuCode,
      movementType,
      qtyDelta,
      balanceAfter,
      referenceDoc,
      operatorName: activeMember?.fullName || 'System',
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
    };
    setWarehouseLedgers((prev) => [entry, ...prev]);
    void upsertErpEntityRecords(supabaseConfig, 'warehouseLedgers', [entry]).then(() =>
      invalidateErpBackendCache(['warehouseLedgers'], currentTenant.id).then(() =>
        setBackendQueryVersion((v) => v + 1)
      )
    );
  };

  // ==================== PLATFORM SUPER ADMIN HANDLERS ====================
  const handleSimulateTenantStatus = (
    tenantId: string,
    newStatus: SubscriptionStatus
  ) => {
    setTenants((prev) =>
      prev.map((t) =>
        t.id === tenantId
          ? {
              ...t,
              subscriptionStatus: newStatus,
              lingxingConnectionStatus:
                newStatus === 'EXPIRED_READONLY' || newStatus === 'SUSPENDED'
                  ? 'PAUSED_BY_EXPIRY'
                  : 'CONNECTED',
            }
          : t
      )
    );
    const target = tenants.find((t) => t.id === tenantId);
    appendAuditLog(
      'PLATFORM',
      'PLATFORM_ADMIN',
      'Platform Super Admin',
      'TENANT_STATUS_CHANGE',
      target?.tenantCode || tenantId,
      `租户状态变更为 [${newStatus}]，已联动同步与 RLS 写保护`
    );
    showToast(`租户 ${target?.tenantCode} 状态已变更为 ${newStatus}`);
  };

  const handleUpdatePlanQuota = (
    planCode: SubscriptionPlanCode,
    patch: Partial<
      Pick<SubscriptionPlan, 'monthlyPriceCny' | 'maxShops' | 'maxUsers' | 'mcpCallsQuota'>
    >
  ) => {
    setPlans((prev) =>
      prev.map((p) => (p.planCode === planCode ? { ...p, ...patch } : p))
    );
    appendAuditLog(
      'PLATFORM',
      'PLATFORM_ADMIN',
      'Platform Super Admin',
      'UPDATE_PLAN_QUOTA',
      planCode,
      `更新套餐 [${planCode}] 价格与配额参数`
    );
  };

  const handleGenerateLicenseKey = (
    targetPlan: SubscriptionPlanCode,
    durationDays: number
  ) => {
    const r1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const r2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const keyStr = `XC-${targetPlan.slice(0, 3)}-${durationDays}D-${r1}-${r2}`;
    const newLic: BillingLicense = {
      id: `lic-${Date.now()}`,
      licenseKey: keyStr,
      targetPlan,
      durationDays,
      status: 'UNUSED',
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    setLicenses((prev) => [newLic, ...prev]);
    appendAuditLog(
      'PLATFORM',
      'PLATFORM_ADMIN',
      'Platform Super Admin',
      'ISSUE_LICENSE_KEY',
      keyStr,
      `签发 ${targetPlan} (${durationDays}天) 订阅激活码`
    );
    showToast(`已签发新激活码: ${keyStr}`);
  };

  const handleProvisionTenant = (payload: ProvisionTenantPayload) => {
    const check = validateTenantSlug(payload.slug, tenants);
    if (!check.valid) {
      showToast(check.reason || '租户路径标识无效');
      return;
    }
    const slug = check.normalized;
    const tenantId = `tenant-${slug}-${Date.now().toString().slice(-4)}`;
    const tenantCode = `TENANT-${slug.toUpperCase()}`;
    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setDate(endsAt.getDate() + (payload.planCode === 'TRIAL' ? 14 : 365));
    const graceEnds = new Date(endsAt);
    graceEnds.setDate(graceEnds.getDate() + 7);
    const createdStr = now.toISOString().replace('T', ' ').slice(0, 16);

    const newTenant: Tenant = {
      id: tenantId,
      slug,
      tenantCode,
      companyName: payload.companyName,
      logtoOrgId: `org_${slug}_auto`,
      isolationMode: payload.isolationMode,
      dbSchemaName:
        payload.isolationMode === 'DEDICATED_DB_BYOD'
          ? 'public'
          : `tenant_${slug.replace(/-/g, '_')}`,
      cachePrefix: `tenant:${slug}:`,
      storageBucketPrefix: `erp-files/${slug}/`,
      byodSupabaseUrl:
        payload.isolationMode === 'DEDICATED_DB_BYOD'
          ? `https://${slug}-dedicated.supabase.co`
          : undefined,
      provisionStatus: 'READY',
      workspaceSettings: {
        brandTitle: `${payload.companyName} ERP`,
        brandBadge: slug.slice(0, 2).toUpperCase(),
        accentColor: 'blue',
        defaultFxRateUsdCny: 7.24,
        alertWebhookChannel: 'NONE',
        alertWebhookPlaceholder: '',
        notifyStockout: true,
        notifyHijack: true,
        notifyExpiry7d: true,
      },
      planCode: payload.planCode,
      subscriptionStatus: payload.planCode === 'TRIAL' ? 'TRIALING' : 'ACTIVE',
      billingCycle: 'ANNUAL',
      baseCurrency: 'CNY',
      subscriptionEndsAt: endsAt.toISOString(),
      graceEndsAt: graceEnds.toISOString(),
      autoRenew: true,
      usedShopsCount: 1,
      usedUsersCount: 1,
      usedSkusCount: 5,
      usedMcpCallsMonth: 0,
      lingxingMcpUrl: 'https://mcp.lingxing.com/mcp/v1/stream',
      lingxingMcpKey: `lx_mcp_demo_${slug}_placeholder`,
      lingxingConnectionStatus: 'CONNECTED',
      lastLingxingSyncAt: createdStr,
    };

    const allPermCodes = ALL_PERMISSIONS_TREE.flatMap((g) => g.permissions.map((p) => p.code));
    const adminRole: RbacRoleDefinition = {
      id: `role-${slug}-admin`,
      tenantId,
      roleCode: 'TENANT_ADMIN',
      roleName: '租户超级管理员 (企业主账号)',
      description: '自动初始化生成的企业主账号角色，拥有全部已安装模块权限',
      isSystemRole: true,
      permissions: allPermCodes,
    };
    const opsRole: RbacRoleDefinition = {
      id: `role-${slug}-ops`,
      tenantId,
      roleCode: 'AMAZON_OPERATOR',
      roleName: '亚马逊站点运营专员',
      description: '默认初始化的运营岗位角色，受店铺白名单与采购成本脱敏约束',
      isSystemRole: false,
      permissions: ['dashboard:view', 'amazon:view', 'amazon:price_edit', 'fba:view', 'ads:view'],
    };
    const adminMember: RbacTeamMember = {
      id: `usr-${slug}-01`,
      tenantId,
      fullName: `${slug.toUpperCase()} 企业主账号 (Admin)`,
      email: payload.initialAdminEmail,
      departmentName: '总经办',
      roleCode: 'TENANT_ADMIN',
      roleName: adminRole.roleName,
      authProvider: supabaseConfig.authMode,
      allowedShopIds: shops.map((s) => s.id),
      hidePurchaseCost: false,
      status: 'ACTIVE',
      lastLoginAt: createdStr,
    };

    const basicModules = new Set<ErpModuleCode>([
      'core_dashboard',
      'mod_amazon_ops',
      'mod_purchase_bom',
      'mod_warehouse_wms',
    ]);
    const seededInstallations: TenantInstalledModule[] = appModules
      .filter((m) => {
        const eligible = canTenantInstallModule(payload.planCode, m).allowed;
        if (m.isCoreRequired) return true;
        if (!eligible) return false;
        return payload.bundlePreset === 'FULL_SUITE' ? true : basicModules.has(m.moduleCode);
      })
      .map((m) => ({
        id: `im-${slug}-${m.moduleCode}`,
        tenantId,
        moduleCode: m.moduleCode,
        enabled: true,
        installedAt: createdStr,
      }));

    setTenants((prev) => [newTenant, ...prev]);
    setRbacRoles((prev) => [...prev, adminRole, opsRole]);
    setTeamMembers((prev) => [...prev, adminMember]);
    setInstalledModules((prev) => [...prev, ...seededInstallations]);
    appendAuditLog(
      'PLATFORM',
      'PLATFORM_ADMIN',
      'Platform Super Admin',
      'PROVISION_TENANT',
      `${tenantCode} (/t/${slug})`,
      `自动化创建租户 [${payload.companyName}] · 隔离模式 ${payload.isolationMode} · 已装配 ${seededInstallations.length} 个模块`
    );
    showToast(`新租户 ${tenantCode} (/t/${slug}) 初始化完成，已可代管进入`);
  };

  const handleUpdateCatalogModule = (
    moduleCode: ErpModuleCode,
    patch: Partial<Pick<ErpAppModule, 'isPublished' | 'minPlanCode' | 'monthlyAddonPriceCny'>>
  ) => {
    setAppModules((prev) =>
      prev.map((m) => (m.moduleCode === moduleCode ? { ...m, ...patch } : m))
    );
    appendAuditLog(
      'PLATFORM',
      'PLATFORM_ADMIN',
      'Platform Super Admin',
      'UPDATE_MARKETPLACE_MODULE',
      moduleCode,
      `调整应用市场模块 [${moduleCode}] 目录配置`
    );
    showToast(`已更新平台应用市场模块 [${moduleCode}]`);
  };

  const handleToggleTenantModule = (moduleCode: ErpModuleCode) => {
    if (!currentTenant || !activeMember || isReadOnlyExpired || !hasPerm('marketplace:manage')) return;
    const mod = appModules.find((m) => m.moduleCode === moduleCode);
    if (!mod || mod.isCoreRequired) return;

    const currentlyEnabled = isModuleEnabledForTenant(
      currentTenant.id,
      moduleCode,
      installedModules,
      appModules
    );
    if (!currentlyEnabled) {
      const check = canTenantInstallModule(currentPlan.planCode, mod);
      if (!check.allowed) {
        showToast(check.reason || '当前套餐不满足模块门槛');
        return;
      }
    }

    const existing = installedModules.find(
      (im) => im.tenantId === currentTenant.id && im.moduleCode === moduleCode
    );
    if (existing) {
      setInstalledModules((prev) =>
        prev.map((im) =>
          im.id === existing.id ? { ...im, enabled: !im.enabled } : im
        )
      );
    } else {
      setInstalledModules((prev) => [
        ...prev,
        {
          id: `im-${currentTenant.slug}-${moduleCode}-${Date.now()}`,
          tenantId: currentTenant.id,
          moduleCode,
          enabled: true,
          installedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
        },
      ]);
    }
    appendAuditLog(
      'TENANT',
      'USER',
      activeMember.fullName,
      currentlyEnabled ? 'DISABLE_ERP_MODULE' : 'ENABLE_ERP_MODULE',
      moduleCode,
      `${currentlyEnabled ? '停用' : '安装并启用'}模块 [${mod.moduleName}]`
    );
    showToast(
      currentlyEnabled
        ? `已停用模块 [${mod.moduleName}]，侧边栏入口与对应网关访问已实时撤销`
        : `已安装并启用模块 [${mod.moduleName}]`
    );
  };

  const handleImpersonateTenant = (tenantId: string) => {
    const target = tenants.find((t) => t.id === tenantId);
    if (!target) return;
    const targetAdmin =
      teamMembers.find((m) => m.tenantId === tenantId && m.status === 'ACTIVE') ||
      teamMembers[0];
    const session: ImpersonationSession = {
      sessionId: `IMP-${Date.now().toString(36).toUpperCase()}`,
      platformAdminName: 'Platform Super Admin',
      targetTenantId: target.id,
      targetTenantCode: target.tenantCode,
      targetTenantSlug: target.slug,
      startedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    setImpersonationSession(session);
    setCurrentTenantId(tenantId);
    setPortalMode('TENANT_WORKSPACE');
    setActiveTenantTab('overview');
    if (targetAdmin) {
      setActiveMemberId(targetAdmin.id);
    }
    appendAuditLog(
      'PLATFORM',
      'PLATFORM_ADMIN',
      'Platform Super Admin',
      'IMPERSONATE_TENANT',
      `${target.tenantCode} (/t/${target.slug})`,
      `超管以审计留痕会话 [${session.sessionId}] 代管进入租户 [${target.companyName}] 工作台`
    );
    showToast(`已开启审计代管会话 ${session.sessionId} · 目标 /t/${target.slug}`);
  };

  const handleExitImpersonation = () => {
    if (impersonationSession) {
      appendAuditLog(
        'PLATFORM',
        'PLATFORM_ADMIN',
        impersonationSession.platformAdminName,
        'EXIT_IMPERSONATION',
        `${impersonationSession.targetTenantCode} (${impersonationSession.sessionId})`,
        '平台超管主动退出租户代管会话，返回中央管理面板'
      );
    }
    setImpersonationSession(null);
    setPortalMode('PLATFORM_SUPER_ADMIN');
    showToast('已退出租户审计代管会话，返回平台超管控制台');
  };

  const handleSavePlatformInfraConfig = async (newCfg: SupabaseConnectionConfig) => {
    const res = await saveServerSupabaseConfig(newCfg);
    const saved = res.config;
    setSupabaseConfig(saved);
    appendAuditLog(
      'PLATFORM',
      'PLATFORM_ADMIN',
      'Platform Super Admin',
      'UPDATE_PLATFORM_INFRA_CONFIG',
      `Auth=${saved.authMode} · Source=${saved.configSource || 'SERVER_MEMORY'}`,
      `更新全平台 Supabase 数据库连接与登录认证引擎 (${saved.authMode}，已停用浏览器 localStorage 存储)`
    );
    showToast(
      res.ok
        ? `已更新服务端运行态数据库配置 (${saved.authMode})，浏览器 localStorage 存储已停用`
        : res.message || `已更新当前会话内存数据库配置 (${saved.authMode})，浏览器 localStorage 存储已停用`
    );
    void reloadFromDatabase(saved);
  };

  const handleUpdateTenantByodUrl = (tenantId: string, byodUrl: string) => {
    const target = tenants.find((t) => t.id === tenantId);
    if (!target) return;
    setTenants((prev) =>
      prev.map((t) => (t.id === tenantId ? { ...t, byodSupabaseUrl: byodUrl } : t))
    );
    appendAuditLog(
      'PLATFORM',
      'PLATFORM_ADMIN',
      'Platform Super Admin',
      'UPDATE_TENANT_BYOD_DB',
      `${target.tenantCode} (/t/${target.slug})`,
      `平台超管更新专属 BYOD 数据库实例地址`
    );
    showToast(`已更新租户 ${target.tenantCode} 的专属 BYOD 数据库地址`);
  };

  const handleUpdateWorkspaceSettings = (patch: Partial<TenantWorkspaceSettings>) => {
    if (!currentTenant || !activeMember || isReadOnlyExpired || !hasPerm('workspace:settings')) return;
    setTenants((prev) =>
      prev.map((t) =>
        t.id === currentTenant.id
          ? {
              ...t,
              workspaceSettings: { ...t.workspaceSettings, ...patch },
            }
          : t
      )
    );
    appendAuditLog(
      'TENANT',
      'USER',
      activeMember.fullName,
      'UPDATE_WORKSPACE_SETTINGS',
      `/t/${currentTenant.slug}`,
      '更新工作台白标品牌与运营预警通知通道'
    );
    showToast('已保存本企业工作台配置与白标设置');
  };

  const handleCreateInvitation = (invData: {
    email: string;
    departmentName: string;
    roleCode: string;
    roleName: string;
    allowedShopIds: string[];
    hidePurchaseCost: boolean;
  }) => {
    if (!currentTenant || !activeMember || isReadOnlyExpired || !hasPerm('rbac:manage')) return;
    const now = new Date();
    const exp = new Date(now);
    exp.setDate(exp.getDate() + 7);
    const token = `xc_inv_${currentTenant.slug}_${Math.random().toString(36).slice(2, 8)}`;
    const created: TenantInvitation = {
      id: `inv-${Date.now()}`,
      tenantId: currentTenant.id,
      email: invData.email,
      departmentName: invData.departmentName,
      roleCode: invData.roleCode,
      roleName: invData.roleName,
      allowedShopIds: invData.allowedShopIds,
      hidePurchaseCost: invData.hidePurchaseCost,
      inviteToken: token,
      status: 'PENDING',
      createdAt: now.toISOString().replace('T', ' ').slice(0, 16),
      expiresAt: exp.toISOString().replace('T', ' ').slice(0, 16),
    };
    setInvitations((prev) => [created, ...prev]);
    appendAuditLog(
      'TENANT',
      'USER',
      activeMember.fullName,
      'CREATE_TENANT_INVITATION',
      created.email,
      `签发入驻邀请 /t/${currentTenant.slug}/invite/${token} (${created.roleCode})`
    );
    showToast(`已生成入驻邀请链接给 ${created.email}`);
  };

  const handleAcceptInvitation = (invitationId: string) => {
    if (!currentTenant || isReadOnlyExpired || !hasPerm('rbac:manage')) return;
    const inv = invitations.find((i) => i.id === invitationId);
    if (!inv || inv.status !== 'PENDING') return;
    const quota = checkTenantQuota(currentTenant, currentPlan, 'USERS');
    if (!quota.allowed) {
      showToast(quota.reason || '当前套餐员工席位已满，无法接受入驻');
      return;
    }
    const localPart = inv.email.split('@')[0] || 'member';
    const newMember: RbacTeamMember = {
      id: `usr-inv-${Date.now()}`,
      tenantId: currentTenant.id,
      fullName: `受邀成员 (${localPart})`,
      email: inv.email,
      departmentName: inv.departmentName,
      roleCode: inv.roleCode,
      roleName: inv.roleName,
      authProvider: supabaseConfig.authMode,
      allowedShopIds: inv.allowedShopIds,
      hidePurchaseCost: inv.hidePurchaseCost,
      status: 'ACTIVE',
      lastLoginAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
    };
    setInvitations((prev) =>
      prev.map((i) => (i.id === invitationId ? { ...i, status: 'ACCEPTED' } : i))
    );
    setTeamMembers((prev) => [...prev, newMember]);
    setTenants((prev) =>
      prev.map((t) =>
        t.id === currentTenant.id
          ? { ...t, usedUsersCount: t.usedUsersCount + 1 }
          : t
      )
    );
    appendAuditLog(
      'TENANT',
      'USER',
      newMember.fullName,
      'ACCEPT_TENANT_INVITATION',
      inv.email,
      `受邀成员接受入驻邀请并激活 [${inv.roleCode}] 账号`
    );
    showToast(`${inv.email} 已接受邀请加入本企业并自动分配权限`);
  };

  const handleRevokeInvitation = (invitationId: string) => {
    if (isReadOnlyExpired || !hasPerm('rbac:manage')) return;
    setInvitations((prev) =>
      prev.map((i) => (i.id === invitationId ? { ...i, status: 'REVOKED' } : i))
    );
    showToast('已撤销该团队入驻邀请');
  };

  // ==================== TENANT ERP HANDLERS ====================
  const handleRedeemLicenseKey = (
    licenseKeyInput: string
  ): { ok: boolean; message: string } => {
    if (!currentTenant) return { ok: false, message: '当前无有效租户上下文。' };
    const cleanKey = licenseKeyInput.trim().toUpperCase();
    const matched = licenses.find((l) => l.licenseKey.toUpperCase() === cleanKey);
    if (!matched) return { ok: false, message: '无效激活码，请检查输入。' };
    if (matched.status !== 'UNUSED') return { ok: false, message: '该激活码已被核销。' };

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + matched.durationDays);
    const futureGrace = new Date(futureDate);
    futureGrace.setDate(futureGrace.getDate() + 7);

    setLicenses((prev) =>
      prev.map((l) =>
        l.id === matched.id
          ? {
              ...l,
              status: 'REDEEMED',
              redeemedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
              redeemedByTenantId: currentTenant.id,
            }
          : l
      )
    );
    setTenants((prev) =>
      prev.map((t) =>
        t.id === currentTenant.id
          ? {
              ...t,
              planCode: matched.targetPlan,
              subscriptionStatus: 'ACTIVE',
              lingxingConnectionStatus: 'CONNECTED',
              subscriptionEndsAt: futureDate.toISOString(),
              graceEndsAt: futureGrace.toISOString(),
            }
          : t
      )
    );
    appendAuditLog(
      'PLATFORM',
      'BILLING_SYSTEM',
      currentTenant.tenantCode,
      'REDEEM_LICENSE_KEY',
      cleanKey,
      `核销激活码升级至 [${matched.targetPlan}] (${matched.durationDays}天)`
    );
    showToast(`激活码核销成功，租户已恢复 ACTIVE 状态`);
    return {
      ok: true,
      message: `激活码核销成功！当前企业已升级为 ${matched.targetPlan}，有效期延长 ${matched.durationDays} 天。`,
    };
  };

  const handleUpdateListingPrice = (listingId: string, newPrice: number) => {
    if (!activeMember || isReadOnlyExpired || !hasPerm('amazon:price_edit')) return;
    setListings((prev) =>
      prev.map((l) => (l.id === listingId ? { ...l, priceOrig: newPrice } : l))
    );
    appendAuditLog(
      'TENANT',
      'USER',
      activeMember.fullName,
      'UPDATE_LISTING_PRICE',
      listingId,
      `在线调整 Listing 售价为 ${newPrice.toFixed(2)}`
    );
    showToast(`已更新 Listing 售价为 ${newPrice.toFixed(2)}`);
  };

  const handleToggleListingStatus = (listingId: string) => {
    if (isReadOnlyExpired || !hasPerm('amazon:price_edit')) return;
    setListings((prev) =>
      prev.map((l) =>
        l.id === listingId
          ? { ...l, listingStatus: l.listingStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }
          : l
      )
    );
  };

  const handleMarkOrderRefunded = (
    orderId: string,
    reason: string,
    orderRecord?: AmazonOrderItem
  ) => {
    if (!activeMember || isReadOnlyExpired || !hasPerm('amazon:order_refund')) return;
    const targetOrder = orderRecord || orders.find((o) => o.id === orderId);
    const updatedOrder = targetOrder
      ? { ...targetOrder, orderStatus: 'REFUNDED' as const, returnReason: reason }
      : null;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, orderStatus: 'REFUNDED', returnReason: reason } : o
      )
    );
    if (updatedOrder) {
      void upsertErpEntityRecords(supabaseConfig, 'orders', [updatedOrder]).then(() =>
        invalidateErpBackendCache(['orders'], currentTenant?.id).then(() =>
          setBackendQueryVersion((v) => v + 1)
        )
      );
    }
    appendAuditLog(
      'TENANT',
      'USER',
      activeMember.fullName,
      'MARK_ORDER_REFUNDED',
      orderId,
      `标记亚马逊订单退款 (${reason})`
    );
    showToast('已标记订单为退款状态并同步至退货分析');
  };

  const handleCreateMcfOrder = (
    asin: string,
    msku: string,
    shopId: string,
    shopName: string,
    marketplace: AmazonOrderItem['marketplace'],
    qty: number
  ) => {
    if (!currentTenant || isReadOnlyExpired || !hasPerm('amazon:order_refund')) return;
    const newOrd: AmazonOrderItem = {
      id: `ord-${Date.now()}`,
      tenantId: currentTenant.id,
      shopId,
      shopName,
      marketplace,
      amazonOrderId: `MCF-${Math.floor(100000 + Math.random() * 899999)}`,
      fulfillmentChannel: 'MCF',
      asin,
      msku,
      quantity: qty,
      orderAmountUsd: 0,
      amazonFeeUsd: Number((qty * 4.8).toFixed(2)),
      orderStatus: 'PENDING',
      purchaseDate: new Date().toISOString().replace('T', ' ').slice(0, 16),
      buyerRegion: 'US-MCF',
    };
    setOrders((prev) => [newOrd, ...prev]);
    void upsertErpEntityRecords(supabaseConfig, 'orders', [newOrd]).then(() =>
      invalidateErpBackendCache(['orders'], currentTenant.id).then(() =>
        setBackendQueryVersion((v) => v + 1)
      )
    );
    showToast(`已创建 MCF 多渠道配送单 ${newOrd.amazonOrderId}`);
  };

  const handleCreatePurchaseOrder = (
    skuCode: string,
    qty: number,
    createdBy: 'USER' | 'SMART_RESTOCK'
  ) => {
    if (!currentTenant || !activeMember || isReadOnlyExpired || !hasPerm('purchase:create')) return;
    const skuObj = localSkus.find((s) => s.sku === skuCode);
    if (!skuObj) return;
    const newPo: PurchaseOrder1688 = {
      id: `po-${Date.now()}`,
      tenantId: currentTenant.id,
      poNumber: `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
        100 + Math.random() * 899
      )}`,
      order1688No: `EXT-PO-****${Math.floor(1000 + Math.random() * 8999)}`,
      localSkuCode: skuObj.sku,
      productName: skuObj.name,
      supplierName: skuObj.supplierName,
      quantity: qty,
      receivedQty: 0,
      unitPriceCny: skuObj.purchaseCostCny,
      totalAmountCny: Math.round(qty * skuObj.purchaseCostCny),
      status: 'DRAFT',
      paymentStatus: 'UNPAID',
      createdBy,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      expectedArrivalDate: '2026-12-12',
    };
    setPurchaseOrders((prev) => [newPo, ...prev]);
    appendAuditLog(
      'TENANT',
      'USER',
      activeMember.fullName,
      'CREATE_PURCHASE_ORDER',
      newPo.poNumber,
      `创建采购草稿单 [${skuCode}] ${qty} 件`
    );
    showToast(`已创建采购草稿单 ${newPo.poNumber}，等待审批下单`);
  };

  const handleApprovePurchaseOrder = (poId: string) => {
    if (isReadOnlyExpired || !hasPerm('purchase:approve')) return;
    const target = purchaseOrders.find((p) => p.id === poId);
    if (!target) return;
    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === poId ? { ...p, status: 'ORDERED_1688' } : p))
    );
    setLocalSkus((prev) =>
      prev.map((s) =>
        s.sku === target.localSkuCode
          ? { ...s, localInboundQty: s.localInboundQty + target.quantity }
          : s
      )
    );
    showToast(`采购单 ${target.poNumber} 已审批下单，进入在途`);
  };

  const handleReceivePurchaseOrder = (poId: string) => {
    if (isReadOnlyExpired || !hasPerm('purchase:receive')) return;
    const target = purchaseOrders.find((p) => p.id === poId);
    if (!target || target.status === 'RECEIVED') return;
    setPurchaseOrders((prev) =>
      prev.map((p) =>
        p.id === poId ? { ...p, status: 'RECEIVED', receivedQty: p.quantity } : p
      )
    );
    const skuObj = localSkus.find((s) => s.sku === target.localSkuCode);
    const newBal = (skuObj?.localAvailableQty || 0) + target.quantity;
    setLocalSkus((prev) =>
      prev.map((s) =>
        s.sku === target.localSkuCode
          ? {
              ...s,
              localAvailableQty: newBal,
              localInboundQty: Math.max(0, s.localInboundQty - target.quantity),
            }
          : s
      )
    );
    appendStockLedger(
      skuObj?.warehouseName || '华南 1 号中心仓',
      target.localSkuCode,
      'PO_INBOUND',
      target.quantity,
      newBal,
      target.poNumber
    );
    showToast(`采购单 ${target.poNumber} 已完成入库，可用库存 +${target.quantity}`);
  };

  const handleReturnPurchaseOrder = (poId: string) => {
    if (isReadOnlyExpired || !hasPerm('purchase:approve')) return;
    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === poId ? { ...p, status: 'RETURNED' } : p))
    );
    showToast('已标记采购退货单');
  };

  const handleExecuteBomAssembly = (bomId: string) => {
    if (isReadOnlyExpired || !hasPerm('purchase:bom_execute')) return;
    const bom = bomOrders.find((b) => b.id === bomId);
    if (!bom || bom.status === 'COMPLETED') return;
    const consumeQty = bom.unitsPerBundle * bom.targetBundleQty;
    const compSku = localSkus.find((s) => s.sku === bom.componentSkuCode);
    const nextBal = Math.max(0, (compSku?.localAvailableQty || 0) - consumeQty);
    setLocalSkus((prev) =>
      prev.map((s) =>
        s.sku === bom.componentSkuCode ? { ...s, localAvailableQty: nextBal } : s
      )
    );
    setBomOrders((prev) =>
      prev.map((b) => (b.id === bomId ? { ...b, status: 'COMPLETED' } : b))
    );
    appendStockLedger(
      compSku?.warehouseName || '华南 1 号中心仓',
      bom.componentSkuCode,
      'BOM_CONSUME',
      -consumeQty,
      nextBal,
      bom.assemblyNo
    );
    showToast(`BOM 组装单 ${bom.assemblyNo} 执行成功，扣减子件 ${consumeQty} 件`);
  };

  const handleSubmitStockCount = (skuCode: string, actualQty: number, note: string) => {
    if (isReadOnlyExpired || !hasPerm('warehouse:count_adjust')) return;
    const skuObj = localSkus.find((s) => s.sku === skuCode);
    if (!skuObj) return;
    const delta = actualQty - skuObj.localAvailableQty;
    setLocalSkus((prev) =>
      prev.map((s) => (s.sku === skuCode ? { ...s, localAvailableQty: actualQty } : s))
    );
    appendStockLedger(
      skuObj.warehouseName,
      skuCode,
      'COUNT_ADJUST',
      delta,
      actualQty,
      `CNT-${note.slice(0, 8)}`
    );
    showToast(`SKU ${skuCode} 盘点校准已过账 (差异 ${delta >= 0 ? `+${delta}` : delta})`);
  };

  const handleExecuteWarehouseTransfer = (
    skuCode: string,
    targetWarehouse: string,
    qty: number
  ) => {
    if (isReadOnlyExpired || !hasPerm('warehouse:transfer')) return;
    const skuObj = localSkus.find((s) => s.sku === skuCode);
    if (!skuObj) return;
    appendStockLedger(
      targetWarehouse,
      skuCode,
      'TRANSFER_IN',
      qty,
      skuObj.localAvailableQty,
      `TRF-${Date.now().toString().slice(-4)}`
    );
    setLocalSkus((prev) =>
      prev.map((s) => (s.sku === skuCode ? { ...s, warehouseName: targetWarehouse } : s))
    );
    showToast(`已将 ${skuCode} (${qty} 件) 调拨至 ${targetWarehouse}`);
  };

  const handleCreateFbaShipment = (
    newShipmentData: Omit<FbaShipmentPlan, 'id' | 'tenantId' | 'createdAt'>
  ) => {
    if (!currentTenant || isReadOnlyExpired || !hasPerm('fba:create')) return;
    const created: FbaShipmentPlan = {
      ...newShipmentData,
      id: `fba-${Date.now()}`,
      tenantId: currentTenant.id,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
    };
    setFbaShipments((prev) => [created, ...prev]);
    const skuObj = localSkus.find((s) => s.sku === created.localSkuCode);
    const nextBal = Math.max(
      0,
      (skuObj?.localAvailableQty || 0) - created.totalUnitsShipped
    );
    setLocalSkus((prev) =>
      prev.map((s) =>
        s.sku === created.localSkuCode ? { ...s, localAvailableQty: nextBal } : s
      )
    );
    appendStockLedger(
      skuObj?.warehouseName || '华南 1 号中心仓',
      created.localSkuCode,
      'FBA_OUTBOUND',
      -created.totalUnitsShipped,
      nextBal,
      created.shipmentId
    );
    showToast(`已创建 FBA 货件 ${created.shipmentId}`);
  };

  const handleAdvanceShipmentStatus = (shipmentId: string) => {
    if (isReadOnlyExpired || !hasPerm('fba:create')) return;
    const target = fbaShipments.find((s) => s.id === shipmentId);
    if (!target) return;
    const nextMap: Record<FbaShipmentPlan['status'], FbaShipmentPlan['status']> = {
      WORKING: 'SHIPPED',
      SHIPPED: 'IN_TRANSIT',
      IN_TRANSIT: 'RECEIVING',
      RECEIVING: 'CLOSED',
      CLOSED: 'CLOSED',
    };
    const nextStatus = nextMap[target.status];
    const nextRec =
      nextStatus === 'CLOSED'
        ? target.totalUnitsShipped
        : nextStatus === 'RECEIVING'
        ? Math.round(target.totalUnitsShipped * 0.6)
        : target.totalUnitsReceived;
    setFbaShipments((prev) =>
      prev.map((s) =>
        s.id === shipmentId
          ? { ...s, status: nextStatus, totalUnitsReceived: nextRec }
          : s
      )
    );
    showToast(`FBA 货件 ${target.shipmentId} 已推进至 ${nextStatus}`);
  };

  // ==================== SIDEBAR DEFINITIONS ====================
  const superAdminMenuItems: {
    id: SuperAdminSubTab;
    label: string;
    subLabel: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'platform_overview',
      label: '平台运营总览',
      subLabel: 'MRR / 租户健康 / 配额监控',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'tenants_lifecycle',
      label: '多卖家租户与自动化开户',
      subLabel: 'Provisioning / 隔离层级 / 熔断',
      icon: <Building2 className="w-4 h-4" />,
    },
    {
      id: 'app_marketplace_admin',
      label: '平台应用市场目录管控',
      subLabel: '模块上下架与套餐门槛',
      icon: <Blocks className="w-4 h-4" />,
    },
    {
      id: 'plans_licenses',
      label: '套餐配额与激活码签发',
      subLabel: '四级定价与 License 池',
      icon: <KeyRound className="w-4 h-4" />,
    },
    {
      id: 'infra_auth_deploy',
      label: '全局认证与云端部署',
      subLabel: 'Supabase/Logto & Tenant SQL',
      icon: <Server className="w-4 h-4" />,
    },
    {
      id: 'platform_audit',
      label: '平台跨租户审计日志',
      subLabel: '计费变更与超管代管留痕',
      icon: <FileText className="w-4 h-4" />,
    },
  ];

  const allTenantMenuItems: {
    id: TenantModuleTab;
    group: string;
    label: string;
    subLabel: string;
    requiredPerm: PermissionCode;
    moduleCode?: ErpModuleCode;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'overview',
      group: '经营与统计',
      label: '首页 · 经营驾驶舱',
      subLabel: '全球时钟 / 实时销售 / 断货与TOP50',
      requiredPerm: 'dashboard:view',
      moduleCode: 'core_dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'product_performance',
      group: '经营与统计',
      label: '统计 · 产品表现',
      subLabel: 'ASIN/父体/MSKU 宽表与运营日志',
      requiredPerm: 'dashboard:view',
      moduleCode: 'core_dashboard',
      icon: <BarChart2 className="w-4 h-4" />,
    },
    {
      id: 'amazon',
      group: '销售与广告',
      label: '销售 · Listing 与订单',
      subLabel: '调价 / 订单全览 / 库龄跟卖',
      requiredPerm: 'amazon:view',
      moduleCode: 'mod_amazon_ops',
      icon: <ShoppingCart className="w-4 h-4" />,
    },
    {
      id: 'ads',
      group: '销售与广告',
      label: '广告 · 投放与分时',
      subLabel: '活动管理 / 搜索词否词 / 24h 矩阵',
      requiredPerm: 'ads:view',
      moduleCode: 'mod_ads_dayparting',
      icon: <Megaphone className="w-4 h-4" />,
    },
    {
      id: 'fba',
      group: '供应链与履约',
      label: 'FBA · 智能补货与货件',
      subLabel: '三态断货试算 / 4渠道分批 / 泡重',
      requiredPerm: 'fba:view',
      moduleCode: 'mod_fba_logistics',
      icon: <Truck className="w-4 h-4" />,
    },
    {
      id: 'inventory',
      group: '供应链与履约',
      label: '采购 · 供应链与 BOM',
      subLabel: '1688 采购单 / 委外组装 / 供应商',
      requiredPerm: 'purchase:view',
      moduleCode: 'mod_purchase_bom',
      icon: <Package className="w-4 h-4" />,
    },
    {
      id: 'warehouse',
      group: '供应链与履约',
      label: '仓库 · 多仓与 WMS',
      subLabel: '分仓库存 / 盘点校准 / 调拨流水',
      requiredPerm: 'warehouse:view',
      moduleCode: 'mod_warehouse_wms',
      icon: <Warehouse className="w-4 h-4" />,
    },
    {
      id: 'finance',
      group: '财务与工具',
      label: '财务 · 三口径利润与结算',
      subLabel: '发货/订单/结算利润 · 业绩报表',
      requiredPerm: 'finance:view',
      moduleCode: 'mod_finance_ledger',
      icon: <Calculator className="w-4 h-4" />,
    },
    {
      id: 'ops_tools',
      group: '财务与工具',
      label: '工具 · 预警/试算/审批',
      subLabel: '异常预警 / 多站点定价 / 审批台',
      requiredPerm: 'dashboard:view',
      moduleCode: 'core_dashboard',
      icon: <Wrench className="w-4 h-4" />,
    },
    {
      id: 'lingxing',
      group: '集成与系统设置',
      label: '集成 · 领星 MCP 数据源',
      subLabel: '12 域实时拉取与定时同步调度',
      requiredPerm: 'lingxing:manage',
      moduleCode: 'mod_mcp_gateway',
      icon: <Database className="w-4 h-4" />,
    },
    {
      id: 'mcp_downstream',
      group: '集成与系统设置',
      label: '网关 · 下游 MCP 智能体',
      subLabel: '令牌沙盒与 Claude/Cursor 接入',
      requiredPerm: 'mcp:read',
      moduleCode: 'mod_mcp_gateway',
      icon: <Cpu className="w-4 h-4" />,
    },
    {
      id: 'rbac_center',
      group: '集成与系统设置',
      label: '设置 · RBAC 权限与团队',
      subLabel: '成员店铺范围 / 邀请 / 三级权限树',
      requiredPerm: 'rbac:manage',
      icon: <Shield className="w-4 h-4" />,
    },
    {
      id: 'tenant_subscription',
      group: '集成与系统设置',
      label: '设置 · 企业订阅与配额',
      subLabel: '配额用量与激活码自助核销',
      requiredPerm: 'subscription:manage',
      icon: <CreditCard className="w-4 h-4" />,
    },
    {
      id: 'app_marketplace',
      group: '集成与系统设置',
      label: '设置 · 应用市场插件',
      subLabel: 'ERP 功能模块按需启停',
      requiredPerm: 'marketplace:manage',
      icon: <Blocks className="w-4 h-4" />,
    },
    {
      id: 'workspace_settings',
      group: '集成与系统设置',
      label: '设置 · 工作台白标配置',
      subLabel: '抬头徽章 / 告警通道 / 命名空间',
      requiredPerm: 'workspace:settings',
      icon: <Sliders className="w-4 h-4" />,
    },
  ];

  const visibleTenantMenuItems = currentTenant
    ? allTenantMenuItems.filter(
        (item) =>
          hasPerm(item.requiredPerm) &&
          (!item.moduleCode ||
            isModuleEnabledForTenant(
              currentTenant.id,
              item.moduleCode,
              installedModules,
              appModules
            ))
      )
    : [];

  // Ensure activeTenantTab is always allowed for current RBAC member & installed modules
  const effectiveTenantTab: TenantModuleTab = visibleTenantMenuItems.some(
    (m) => m.id === activeTenantTab
  )
    ? activeTenantTab
    : visibleTenantMenuItems[0]?.id || 'overview';

  const activePageId =
    portalMode === 'PLATFORM_SUPER_ADMIN' ? superAdminTab : effectiveTenantTab;

  const activeMemberAllowedShopsKey = (activeMember?.allowedShopIds || []).join(',');
  const backendQueryContext = useMemo<BackendQueryContext | undefined>(
    () =>
      currentTenant && activeMember
        ? {
            tenantId: currentTenant.id,
            roleCode: activeMember.roleCode,
            allowedShopIds: activeMember.allowedShopIds,
            queryVersion: backendQueryVersion,
          }
        : undefined,
    [
      currentTenant?.id,
      activeMember?.roleCode,
      activeMemberAllowedShopsKey,
      backendQueryVersion,
    ]
  );

  // Per-page on-demand backend data loading: fetches ONLY the entities required by the active page
  useEffect(() => {
    if (!hasBootstrapped || dbStatus !== 'LOADED') return;
    if (portalMode === 'TENANT_WORKSPACE' && (!currentTenant || !activeMember)) return;

    const ctrl = new AbortController();
    void fetchErpPageData({
      pageId: activePageId,
      tenantId: portalMode === 'TENANT_WORKSPACE' ? currentTenant?.id : undefined,
      roleCode: activeMember?.roleCode,
      allowedShopIds: activeMember?.allowedShopIds,
      signal: ctrl.signal,
    }).then((res) => {
      if (ctrl.signal.aborted || !res.ok) return;
      // Avoid overwriting server-paginated tables when on-demand page fetch returns a trimmed subset
      const fullEditableKeys = res.requiredEntities.filter(
        (k) =>
          !(k === 'orders' && (activePageId === 'overview' || activePageId === 'product_performance' || activePageId === 'lingxing'))
      );
      hydrateEntitiesSilently(res.data, fullEditableKeys);
      if (res.entityCounts) {
        setBackendEntityCounts(res.entityCounts);
      }
    });

    return () => ctrl.abort();
  }, [
    hasBootstrapped,
    dbStatus,
    portalMode,
    activePageId,
    currentTenant?.id,
    activeMember?.id,
    activeMember?.roleCode,
    activeMemberAllowedShopsKey,
    backendQueryVersion,
    hydrateEntitiesSilently,
  ]);

  const hasActiveImpersonation =
    portalMode === 'TENANT_WORKSPACE' &&
    isValidImpersonationSession(impersonationSession, tenants);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Persistent Audited Super-Admin Impersonation Top Banner */}
      {hasActiveImpersonation && impersonationSession && (
        <div className="bg-slate-900 text-slate-100 border-b border-slate-800 px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
            <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold text-amber-300">平台超管审计代管模式</span>
            <span>· 目标租户: {impersonationSession.targetTenantCode} (/t/{impersonationSession.targetTenantSlug})</span>
            <span className="hidden sm:inline text-slate-400">· 会话: {impersonationSession.sessionId}</span>
          </div>
          <button
            onClick={handleExitImpersonation}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-slate-950 rounded shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>退出代管返回中央面板</span>
          </button>
        </div>
      )}

      {/* Strict 3-Zone Top Navigation Bar Contract (Responsive Left-Collapse Controls) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 md:gap-6 px-3 sm:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Left-collapse triggers + Single text element wordmark */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="打开左侧导航菜单"
            aria-expanded={mobileSidebarOpen}
            className="lg:hidden inline-flex items-center justify-center p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <Menu className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setDesktopSidebarCollapsed((prev) => !prev)}
            aria-label={desktopSidebarCollapsed ? '展开左侧导航栏' : '折叠左侧导航栏'}
            title={desktopSidebarCollapsed ? '展开左侧导航栏' : '折叠左侧导航栏'}
            className="hidden lg:inline-flex items-center justify-center p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            {desktopSidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              if (portalMode === 'TENANT_WORKSPACE') {
                setActiveTenantTab('overview');
              } else {
                setSuperAdminTab('platform_overview');
              }
            }}
            className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white truncate max-w-[165px] sm:max-w-none"
          >
            {portalMode === 'TENANT_WORKSPACE' && currentTenant
              ? currentTenant.workspaceSettings.brandTitle
              : 'X Cloud ERP'}
          </a>
        </div>

        {/* Zone 2: Concise single-line Dual-Portal & Quick Navigation */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-400">
          <button
            onClick={() => setPortalMode('TENANT_WORKSPACE')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              portalMode === 'TENANT_WORKSPACE'
                ? 'text-blue-600 dark:text-blue-400 underline underline-offset-8 font-semibold'
                : ''
            }`}
          >
            租户 ERP 业务工作台
          </button>
          <button
            onClick={() => setPortalMode('PLATFORM_SUPER_ADMIN')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              portalMode === 'PLATFORM_SUPER_ADMIN'
                ? 'text-blue-600 dark:text-blue-400 underline underline-offset-8 font-semibold'
                : ''
            }`}
          >
            平台超管控制台 (Super Admin)
          </button>
          {portalMode === 'TENANT_WORKSPACE' && hasPerm('rbac:manage') && (
            <button
              onClick={() => setActiveTenantTab('rbac_center')}
              className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                effectiveTenantTab === 'rbac_center'
                  ? 'text-blue-600 dark:text-blue-400'
                  : ''
              }`}
            >
              RBAC 权限中心
            </button>
          )}
          {portalMode === 'TENANT_WORKSPACE' && hasPerm('lingxing:manage') && (
            <button
              onClick={() => setActiveTenantTab('lingxing')}
              className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                effectiveTenantTab === 'lingxing'
                  ? 'text-blue-600 dark:text-blue-400'
                  : ''
              }`}
            >
              领星 MCP 同步
            </button>
          )}
        </nav>

        {/* Zone 3: 1 primary action strictly scoped by portal & RBAC */}
        <div className="flex items-center gap-2 shrink-0">
          {portalMode === 'PLATFORM_SUPER_ADMIN' ? (
            <button
              onClick={() => setIsSetupModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Settings2 className="w-3.5 h-3.5 sm:hidden" />
              <span className="sm:hidden">基建配置</span>
              <span className="hidden sm:inline">平台数据库 & 认证配置</span>
            </button>
          ) : hasPerm('lingxing:manage') ? (
            <button
              onClick={() => setActiveTenantTab('lingxing')}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Database className="w-3.5 h-3.5 sm:hidden" />
              <span className="sm:hidden">领星配置</span>
              <span className="hidden sm:inline">领星 MCP 配置</span>
            </button>
          ) : null}
        </div>
      </header>

      {/* Main Workspace Layout: Mobile Left-Collapsible Drawer + Desktop Left-Collapsible Sidebar */}
      <div className="flex-1 flex relative">
        {/* Mobile Drawer Backdrop */}
        {mobileSidebarOpen && (
          <div
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[1px] lg:hidden"
          />
        )}

        <aside
          aria-label="左侧主导航"
          className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between py-4 px-4 transform transition-[transform,width] duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 lg:shrink-0 ${
            mobileSidebarOpen ? 'translate-x-0 shadow-2xl lg:shadow-none' : '-translate-x-full'
          } ${desktopSidebarCollapsed ? 'lg:w-16 lg:px-2' : 'lg:w-64 lg:px-4'}`}
        >
          <div className="flex-1 min-h-0 flex flex-col space-y-4 overflow-y-auto pr-0.5">
            {/* Mobile Drawer Top Header & Close Button */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 lg:hidden">
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {portalMode === 'TENANT_WORKSPACE' && currentTenant
                    ? currentTenant.workspaceSettings.brandTitle
                    : 'X Cloud ERP'}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {portalMode === 'PLATFORM_SUPER_ADMIN'
                    ? 'Super Admin Central'
                    : currentTenant
                    ? `/t/${currentTenant.slug}`
                    : `DB: ${dbStatus}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="关闭左侧导航菜单"
                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Dual-Portal Switcher (restores hidden top nav portal switch on < lg) */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs lg:hidden">
              <button
                type="button"
                onClick={() => {
                  setPortalMode('TENANT_WORKSPACE');
                  setMobileSidebarOpen(false);
                }}
                className={`py-1.5 px-2 rounded font-medium transition-colors ${
                  portalMode === 'TENANT_WORKSPACE'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                租户工作台
              </button>
              <button
                type="button"
                onClick={() => {
                  setPortalMode('PLATFORM_SUPER_ADMIN');
                  setMobileSidebarOpen(false);
                }}
                className={`py-1.5 px-2 rounded font-medium transition-colors ${
                  portalMode === 'PLATFORM_SUPER_ADMIN'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                超管控制台
              </button>
            </div>

            {/* Compact Desktop-Collapsed Portal Indicator */}
            {desktopSidebarCollapsed && (
              <div
                title={
                  portalMode === 'PLATFORM_SUPER_ADMIN'
                    ? '平台超管控制台 (Portal A)'
                    : currentTenant
                    ? `${currentTenant.tenantCode} (/t/${currentTenant.slug})`
                    : `Supabase 状态: ${dbStatus}`
                }
                className="hidden lg:flex items-center justify-center h-10 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 font-mono text-xs font-bold text-blue-600 dark:text-blue-400"
              >
                {portalMode === 'PLATFORM_SUPER_ADMIN'
                  ? 'SA'
                  : currentTenant?.workspaceSettings.brandBadge || 'DB'}
              </div>
            )}

            {/* Portal Context Box (always visible in mobile drawer, hidden only when desktop collapsed) */}
            <div className={desktopSidebarCollapsed ? 'lg:hidden' : ''}>
              {portalMode === 'PLATFORM_SUPER_ADMIN' ? (
                <div className="p-3 rounded-lg bg-slate-900 text-slate-100 border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-blue-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>PORTAL A · SUPER ADMIN</span>
                  </div>
                  <div className="text-xs font-semibold">平台运营商总控中心</div>
                  <div className="text-[11px] text-slate-400">
                    Supabase 实时库: {dbStatus} ({dbRecordCount})
                  </div>
                </div>
              ) : currentTenant ? (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-mono">/t/{currentTenant.slug}</span>
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                      {currentTenant.planCode} · {currentTenant.workspaceSettings.brandBadge}
                    </span>
                  </div>
                  <select
                    value={currentTenant.id}
                    onChange={(e) => {
                      const nextTenantId = e.target.value;
                      setCurrentTenantId(nextTenantId);
                      setImpersonationSession(null);
                      const nextAdmin = teamMembers.find(
                        (m) => m.tenantId === nextTenantId && m.status === 'ACTIVE'
                      );
                      if (nextAdmin) {
                        setActiveMemberId(nextAdmin.id);
                      }
                      setMobileSidebarOpen(false);
                    }}
                    className="w-full px-2 py-1 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        /t/{t.slug} · {t.tenantCode} ({t.subscriptionStatus})
                      </option>
                    ))}
                  </select>
                  <div className="text-[10px] font-mono text-slate-500 truncate">
                    隔离: {currentTenant.isolationMode} ({currentTenant.dbSchemaName})
                  </div>

                  {/* Live RBAC Role Perspective Switcher */}
                  {activeMember && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-500 mb-1">
                        当前登录员工身份 (RBAC 实时切换):
                      </div>
                      <select
                        value={activeMember.id}
                        onChange={(e) => {
                          setActiveMemberId(e.target.value);
                          const nextM = currentTenantMembers.find((m) => m.id === e.target.value);
                          if (nextM) {
                            showToast(
                              `已切换操作身份为 [${nextM.fullName} · ${nextM.roleName}]，菜单与数据权限已实时更新`
                            );
                          }
                          setMobileSidebarOpen(false);
                        }}
                        className="w-full px-2 py-1 text-[11px] font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                      >
                        {currentTenantMembers
                          .filter((m) => m.status === 'ACTIVE')
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.fullName} ({m.roleName})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : hasBootstrapped ? (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="font-mono text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                    Supabase: {dbStatus}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    当前数据库尚无租户记录，请在超管控制台初始化数据库或开户。
                  </div>
                </div>
              ) : null}
            </div>

            {/* Dynamic Portal Sidebar Menu */}
            <nav className="space-y-1">
              {portalMode === 'PLATFORM_SUPER_ADMIN'
                ? superAdminMenuItems.map((item) => {
                    const isActive = superAdminTab === item.id;
                    return (
                      <button
                        key={item.id}
                        title={item.label}
                        onClick={() => {
                          setSuperAdminTab(item.id);
                          setMobileSidebarOpen(false);
                        }}
                        className={`w-full flex items-start gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                          desktopSidebarCollapsed ? 'lg:justify-center lg:px-0 lg:py-2.5' : ''
                        } ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="mt-0.5 lg:mt-0 shrink-0">{item.icon}</div>
                        <div className={`min-w-0 ${desktopSidebarCollapsed ? 'lg:hidden' : ''}`}>
                          <div className="text-xs truncate">{item.label}</div>
                          <div className="text-[11px] text-slate-500 font-normal truncate">
                            {item.subLabel}
                          </div>
                        </div>
                      </button>
                    );
                  })
                : visibleTenantMenuItems.map((item, idx) => {
                    const isActive = effectiveTenantTab === item.id;
                    const prevGroup = idx > 0 ? visibleTenantMenuItems[idx - 1].group : null;
                    const showGroupHeader = item.group !== prevGroup;
                    return (
                      <React.Fragment key={item.id}>
                        {showGroupHeader && (
                          <div
                            className={`px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${
                              idx === 0 ? 'pt-0.5' : ''
                            } ${desktopSidebarCollapsed ? 'lg:hidden' : ''}`}
                          >
                            {item.group}
                          </div>
                        )}
                        <button
                          title={item.label}
                          onClick={() => {
                            setActiveTenantTab(item.id);
                            setMobileSidebarOpen(false);
                          }}
                          className={`w-full flex items-start gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                            desktopSidebarCollapsed ? 'lg:justify-center lg:px-0 lg:py-2.5' : ''
                          } ${
                            isActive
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="mt-0.5 lg:mt-0 shrink-0">{item.icon}</div>
                          <div className={`min-w-0 ${desktopSidebarCollapsed ? 'lg:hidden' : ''}`}>
                            <div className="text-xs truncate">{item.label}</div>
                            <div className="text-[11px] text-slate-500 font-normal truncate">
                              {item.subLabel}
                            </div>
                          </div>
                        </button>
                      </React.Fragment>
                    );
                  })}
            </nav>
          </div>

          <div className="pt-4 mt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs shrink-0">
            <div
              className={`flex items-center justify-between text-[11px] text-slate-500 font-mono ${
                desktopSidebarCollapsed ? 'lg:hidden' : ''
              }`}
            >
              <span>可见菜单:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {portalMode === 'PLATFORM_SUPER_ADMIN'
                  ? `${superAdminMenuItems.length} / ${superAdminMenuItems.length} (Super)`
                  : `${visibleTenantMenuItems.length} / ${allTenantMenuItems.length}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? '切换浅色模式' : '切换暗色模式'}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className={desktopSidebarCollapsed ? 'lg:hidden' : ''}>切换浅色模式</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span className={desktopSidebarCollapsed ? 'lg:hidden' : ''}>切换暗色模式</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setDesktopSidebarCollapsed((prev) => !prev)}
              title={desktopSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
              className="hidden lg:flex w-full items-center justify-center gap-2 py-1.5 px-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {desktopSidebarCollapsed ? (
                <PanelLeftOpen className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <>
                  <PanelLeftClose className="w-3.5 h-3.5 shrink-0" />
                  <span>收起侧边栏</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 p-3 sm:p-5 lg:p-6 space-y-5 overflow-y-auto">
          {portalMode === 'TENANT_WORKSPACE' &&
            currentTenant &&
            currentTenant.subscriptionStatus === 'GRACE_PERIOD' && (
              <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>订阅宽限期预警 (GRACE_PERIOD)</strong>：租户 [{currentTenant.tenantCode}] 宽限期截止至{' '}
                    <span className="font-mono">{currentTenant.graceEndsAt.slice(0, 10)}</span>。
                  </span>
                </div>
                {hasPerm('subscription:manage') && (
                  <button
                    onClick={() => setActiveTenantTab('tenant_subscription')}
                    className="px-3 py-1 font-medium text-white bg-amber-600 hover:bg-amber-700 rounded"
                  >
                    前往续费 / 核销激活码
                  </button>
                )}
              </div>
            )}

          {portalMode === 'TENANT_WORKSPACE' && currentTenant && isReadOnlyExpired && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 flex flex-wrap items-center justify-between gap-3 text-xs text-red-800 dark:text-red-200">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 shrink-0 text-red-600" />
                <span>
                  当前租户 [{currentTenant.tenantCode}] 处于到期只读保护模式 ({currentTenant.subscriptionStatus})，已熔断全部写操作与领星 MCP 定时同步。
                </span>
              </div>
              {hasPerm('subscription:manage') && (
                <button
                  onClick={() => setActiveTenantTab('tenant_subscription')}
                  className="px-3 py-1.5 font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                >
                  兑换激活码恢复服务
                </button>
              )}
            </div>
          )}

          {toastNotice && (
            <div className="p-3 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
              <span>{toastNotice}</span>
            </div>
          )}

          {/* Portal A: Platform Super Admin Console */}
          {portalMode === 'PLATFORM_SUPER_ADMIN' && (
            <SuperAdminConsoleView
              activeSubTab={superAdminTab}
              tenants={tenants}
              plans={plans}
              licenses={licenses}
              appModules={appModules}
              installedModules={installedModules}
              platformAuditLogs={auditLogs.filter((l) => l.scope === 'PLATFORM')}
              supabaseConfig={supabaseConfig}
              dbStatus={dbStatus}
              dbMessage={dbMessage}
              dbRecordCount={dbRecordCount}
              isLoadingDb={isLoadingDb}
              isSeedingDb={isSeedingDb}
              onReloadFromDb={() => reloadFromDatabase()}
              onSeedStandardDataToDb={handleSeedStandardDataToDb}
              onSavePlatformInfraConfig={handleSavePlatformInfraConfig}
              onUpdateTenantByodUrl={handleUpdateTenantByodUrl}
              onSimulateTenantStatus={handleSimulateTenantStatus}
              onProvisionTenant={handleProvisionTenant}
              onUpdateCatalogModule={handleUpdateCatalogModule}
              onUpdatePlanQuota={handleUpdatePlanQuota}
              onGenerateLicenseKey={handleGenerateLicenseKey}
              onImpersonateTenant={handleImpersonateTenant}
            />
          )}

          {/* Portal B: Tenant ERP Workspace — Show DB setup card ONLY after bootstrap confirms no tenant/DB */}
          {portalMode === 'TENANT_WORKSPACE' && hasBootstrapped && (!currentTenant || !activeMember) && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 max-w-2xl mx-auto space-y-4">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {dbStatus === 'SCHEMA_MISSING'
                      ? 'Supabase 已连接 · 需执行最新建表 SQL 启用全量持久化'
                      : dbStatus === 'EMPTY_DB'
                      ? 'Supabase 已连接 · 当前数据库为空 (0 条记录)'
                      : '尚未连接或初始化平台 Supabase 数据库'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    LIVE DB STATUS: {dbStatus} · RECORDS: {dbRecordCount}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded p-3">
                {dbMessage}
              </p>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPortalMode('PLATFORM_SUPER_ADMIN');
                    setSuperAdminTab('infra_auth_deploy');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>前往平台超管控制台配置 / 初始化数据库</span>
                </button>
                <button
                  type="button"
                  onClick={() => void reloadFromDatabase()}
                  disabled={isLoadingDb}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDb ? 'animate-spin' : ''}`} />
                  <span>重新检查连接</span>
                </button>
              </div>
            </div>
          )}

          {portalMode === 'TENANT_WORKSPACE' && currentTenant && activeMember && (
            <>
              {effectiveTenantTab === 'overview' && (
                <DashboardOverview
                  currentTenant={currentTenant}
                  listings={scopedListings}
                  orders={scopedOrders}
                  localSkus={localSkus}
                  purchaseOrders={purchaseOrders}
                  shipments={fbaShipments}
                  campaigns={scopedCampaigns}
                  settlements={scopedSettlements}
                  exchangeRates={tenantExchangeRates}
                  profitSummaries={tenantProfitSummaries}
                  hidePurchaseCost={activeCostMasked}
                  onTriggerLingxingSync={() =>
                    hasPerm('lingxing:manage')
                      ? setActiveTenantTab('lingxing')
                      : showToast('当前账号无领星 MCP 管理权限')
                  }
                  onNavigateTab={(tab) => setActiveTenantTab(tab as TenantModuleTab)}
                />
              )}

              {effectiveTenantTab === 'product_performance' && (
                <ProductPerformanceView
                  listings={scopedListings}
                  orders={scopedOrders}
                  localSkus={localSkus}
                  campaigns={scopedCampaigns}
                  exchangeRates={tenantExchangeRates}
                  hidePurchaseCost={activeCostMasked}
                  canExportCsv={hasPerm('finance:export_csv')}
                  isReadOnlyExpired={isReadOnlyExpired}
                  onNavigateTab={(tab) => setActiveTenantTab(tab as TenantModuleTab)}
                />
              )}

              {effectiveTenantTab === 'ops_tools' && (
                <OperationsToolsView
                  listings={scopedListings}
                  localSkus={localSkus}
                  campaigns={scopedCampaigns}
                  purchaseOrders={purchaseOrders}
                  shipments={fbaShipments}
                  settlements={scopedSettlements}
                  hidePurchaseCost={activeCostMasked}
                  isReadOnlyExpired={isReadOnlyExpired}
                  canApprovePo={hasPerm('purchase:approve')}
                  canReconcile={hasPerm('finance:reconcile')}
                  onApprovePo={handleApprovePurchaseOrder}
                  onAdvanceShipment={handleAdvanceShipmentStatus}
                  onReconcileSettlement={(id) => {
                    setSettlements((prev) =>
                      prev.map((s) =>
                        s.id === id ? { ...s, reconcileStatus: 'RECONCILED' } : s
                      )
                    );
                    showToast('亚马逊回款账期已完成入账核销');
                  }}
                  onNavigateTab={(tab) => setActiveTenantTab(tab as TenantModuleTab)}
                />
              )}

              {effectiveTenantTab === 'amazon' && (
                <AmazonOrdersAndListingsView
                  listings={scopedListings}
                  orders={scopedOrders}
                  exchangeRates={tenantExchangeRates}
                  backendQueryContext={backendQueryContext}
                  isReadOnlyExpired={isReadOnlyExpired}
                  canEditPrice={hasPerm('amazon:price_edit')}
                  canRefundOrder={hasPerm('amazon:order_refund')}
                  onUpdateListingPrice={handleUpdateListingPrice}
                  onToggleListingStatus={handleToggleListingStatus}
                  onMarkOrderRefunded={handleMarkOrderRefunded}
                  onCreateMcfOrder={handleCreateMcfOrder}
                />
              )}

              {effectiveTenantTab === 'inventory' && (
                <InventorySupplyChainView
                  localSkus={localSkus}
                  listings={scopedListings}
                  purchaseOrders={purchaseOrders}
                  suppliers={suppliers}
                  bomOrders={bomOrders}
                  isReadOnlyExpired={isReadOnlyExpired}
                  hidePurchaseCost={activeCostMasked}
                  canCreatePo={hasPerm('purchase:create')}
                  canApprovePo={hasPerm('purchase:approve')}
                  canReceivePo={hasPerm('purchase:receive')}
                  canExecuteBom={hasPerm('purchase:bom_execute')}
                  onCreatePurchaseOrder={handleCreatePurchaseOrder}
                  onApprovePurchaseOrder={handleApprovePurchaseOrder}
                  onReceivePurchaseOrder={handleReceivePurchaseOrder}
                  onReturnPurchaseOrder={handleReturnPurchaseOrder}
                  onExecuteBomAssembly={handleExecuteBomAssembly}
                  onAddSupplier={(sup) => {
                    setSuppliers((prev) => [
                      { ...sup, id: `sup-${Date.now()}`, tenantId: currentTenant.id },
                      ...prev,
                    ]);
                    showToast(`已新增合作供应商档案: ${sup.supplierName}`);
                  }}
                />
              )}

              {effectiveTenantTab === 'warehouse' && (
                <WarehouseInventoryView
                  localSkus={localSkus}
                  ledgers={warehouseLedgers}
                  backendQueryContext={backendQueryContext}
                  isReadOnlyExpired={isReadOnlyExpired}
                  hidePurchaseCost={activeCostMasked}
                  canCountAdjust={hasPerm('warehouse:count_adjust')}
                  canTransfer={hasPerm('warehouse:transfer')}
                  onSubmitStockCount={handleSubmitStockCount}
                  onExecuteWarehouseTransfer={handleExecuteWarehouseTransfer}
                />
              )}

              {effectiveTenantTab === 'fba' && (
                <FbaShipmentsView
                  shipments={fbaShipments}
                  localSkus={localSkus}
                  listings={scopedListings}
                  freightQuotes={freightQuotes}
                  isReadOnlyExpired={isReadOnlyExpired}
                  canCreateFba={hasPerm('fba:create')}
                  canPrintLabel={hasPerm('fba:print_label')}
                  onCreateFbaShipment={handleCreateFbaShipment}
                  onAdvanceShipmentStatus={handleAdvanceShipmentStatus}
                />
              )}

              {effectiveTenantTab === 'ads' && (
                <AdvertisingDaypartingView
                  campaigns={scopedCampaigns}
                  searchTerms={searchTerms}
                  backendQueryContext={backendQueryContext}
                  isReadOnlyExpired={isReadOnlyExpired}
                  canEditBid={hasPerm('ads:bid_edit')}
                  canNegateTerm={hasPerm('ads:negate_term')}
                  onToggleCampaignStatus={(id) =>
                    setAdCampaigns((prev) =>
                      prev.map((c) =>
                        c.id === id
                          ? { ...c, status: c.status === 'ENABLED' ? 'PAUSED' : 'ENABLED' }
                          : c
                      )
                    )
                  }
                  onToggleDayparting={(id) => {
                    setAdCampaigns((prev) =>
                      prev.map((c) =>
                        c.id === id
                          ? { ...c, daypartingEnabled: !c.daypartingEnabled }
                          : c
                      )
                    );
                    showToast('已更新广告分时调价开关');
                  }}
                  onUpdateCampaignBid={(id, newBudget, newBid, peakMult, offPeakMult) => {
                    setAdCampaigns((prev) =>
                      prev.map((c) =>
                        c.id === id
                          ? {
                              ...c,
                              dailyBudgetUsd: newBudget,
                              defaultBidUsd: newBid,
                              peakBidMultiplierPercent: peakMult,
                              offPeakBidMultiplierPercent: offPeakMult,
                              daypartingEnabled: true,
                            }
                          : c
                      )
                    );
                    showToast('已保存 24h 分时竞价策略');
                  }}
                  onNegateSearchTerm={(termId, mode, termRecord) => {
                    const baseTerm =
                      termRecord || searchTerms.find((st) => st.id === termId) || null;
                    if (baseTerm) {
                      const updatedTerm = { ...baseTerm, negatedStatus: mode };
                      setSearchTerms((prev) =>
                        prev.some((st) => st.id === termId)
                          ? prev.map((st) => (st.id === termId ? updatedTerm : st))
                          : prev
                      );
                      void upsertErpEntityRecords(
                        supabaseConfig,
                        'searchTerms',
                        [updatedTerm]
                      ).then(() => {
                        void invalidateErpBackendCache(['searchTerms'], currentTenant.id);
                        setBackendQueryVersion((v) => v + 1);
                      });
                    }
                    showToast(`已将搜索词加入否定词库 (${mode})`);
                  }}
                />
              )}

              {effectiveTenantTab === 'finance' && (
                <FinanceAccountingView
                  listings={scopedListings}
                  localSkus={localSkus}
                  settlements={scopedSettlements}
                  exchangeRates={tenantExchangeRates}
                  extraExpenses={extraExpenses}
                  purchaseOrders={purchaseOrders}
                  isReadOnlyExpired={isReadOnlyExpired}
                  hidePurchaseCost={activeCostMasked}
                  canExportCsv={hasPerm('finance:export_csv')}
                  canReconcile={hasPerm('finance:reconcile')}
                  onReconcileSettlement={(id) => {
                    setSettlements((prev) =>
                      prev.map((s) =>
                        s.id === id ? { ...s, reconcileStatus: 'RECONCILED' } : s
                      )
                    );
                    showToast('亚马逊回款账期已完成入账核销');
                  }}
                  onAddExtraExpense={(exp) => {
                    const created: ExtraExpenseItem = {
                      ...exp,
                      id: `exp-${Date.now()}`,
                      tenantId: currentTenant.id,
                      expenseNo: `EXP-${Date.now().toString().slice(-4)}`,
                      recordedAt: new Date().toISOString().slice(0, 10),
                    };
                    setExtraExpenses((prev) => [created, ...prev]);
                    showToast(`已记账并分摊至 ${exp.targetAsin} ($${exp.amountUsd})`);
                  }}
                  onWriteOffPoPayable={(poId) => {
                    setPurchaseOrders((prev) =>
                      prev.map((p) =>
                        p.id === poId ? { ...p, paymentStatus: 'PAID' } : p
                      )
                    );
                    showToast('供应商应付采购单已完成付款核销');
                  }}
                />
              )}

              {effectiveTenantTab === 'lingxing' && (
                <LingxingMcpConnectorView
                  currentTenant={currentTenant}
                  currentPlan={currentPlan}
                  supabaseConfig={supabaseConfig}
                  shops={tenantShops}
                  listings={scopedListings}
                  ordersCount={backendEntityCounts.orders ?? scopedOrders.length}
                  existingOrders={orders.filter((o) => o.tenantId === currentTenant.id)}
                  existingDomainCounts={{
                    ORDERS:
                      backendEntityCounts.orders ??
                      orders.filter((o) => o.tenantId === currentTenant.id).length,
                    WAREHOUSE_LEDGERS:
                      backendEntityCounts.warehouseLedgers ??
                      warehouseLedgers.filter((w) => w.tenantId === currentTenant.id).length,
                    FBA_SHIPMENTS:
                      backendEntityCounts.fbaShipments ??
                      fbaShipments.filter((f) => f.tenantId === currentTenant.id).length,
                    BOM_ORDERS:
                      backendEntityCounts.bomOrders ??
                      bomOrders.filter((b) => b.tenantId === currentTenant.id).length,
                  }}
                  localSkus={tenantLocalSkus}
                  isReadOnlyExpired={isReadOnlyExpired}
                  mcpModuleEnabled={isMcpGatewayEnabled}
                  onReloadFromDb={() => reloadFromDatabase()}
                  onUpdateTenantLingxingConfig={async (url, key, appId) => {
                    const updatedTenant: Tenant = {
                      ...currentTenant,
                      lingxingMcpUrl: url,
                      lingxingMcpKey: key,
                      lingxingAppId: appId,
                      lingxingConnectionStatus: 'CONNECTED',
                    };
                    const saveRes = await persistTenantLingxingToSupabase(
                      supabaseConfig,
                      updatedTenant
                    );
                    if (saveRes.ok) {
                      const nextTenants = tenants.map((t) =>
                        t.id === currentTenant.id ? updatedTenant : t
                      );
                      prevSnapshotRef.current = {
                        ...prevSnapshotRef.current,
                        tenants: nextTenants,
                      };
                      setTenants(nextTenants);
                      appendAuditLog(
                        'TENANT',
                        'USER',
                        activeMember.fullName,
                        'UPDATE_LINGXING_MCP_CONFIG',
                        currentTenant.tenantCode,
                        `保存并持久化领星 MCP 接入地址至 Supabase (${url})`
                      );
                      showToast('领星 MCP 配置已实时写入 Supabase 数据库');
                    } else {
                      showToast(saveRes.message);
                    }
                    return { ok: saveRes.ok, message: saveRes.message };
                  }}
                  onUpdateListingMapping={(listingId, newSkuCode) => {
                    setListings((prev) =>
                      prev.map((l) =>
                        l.id === listingId ? { ...l, localSkuCode: newSkuCode } : l
                      )
                    );
                    showToast(`已更新本地 SKU 映射为 ${newSkuCode || '未绑定'}`);
                  }}
                  onApplyLingxingSyncResult={async (payload) => {
                    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
                    const tenantId = currentTenant.id;
                    const deleteDemoRecordIds: Array<{ entityType: ErpEntityType; recordId: string }> = [];

                    const collectDemoDeletes = <
                      T extends {
                        id: string;
                        tenantId: string;
                        shopName?: string;
                        asin?: string;
                        amazonOrderId?: string;
                        sku?: string;
                        shipmentId?: string;
                        targetAsin?: string;
                      }
                    >(
                      entityType: ErpEntityType,
                      list: T[],
                      forceClean: boolean
                    ) => {
                      if (!payload.clearDemoForTenant || !forceClean) return;
                      for (const item of list) {
                        if (item.tenantId === tenantId && isDemoFixtureRecord(item)) {
                          deleteDemoRecordIds.push({ entityType, recordId: item.id });
                        }
                      }
                    };

                    const isFullSync = payload.toolNames.length > 1;
                    collectDemoDeletes('shops', shops, payload.shops.length > 0 || isFullSync);
                    collectDemoDeletes('localSkus', localSkus, payload.localSkus.length > 0 || isFullSync);
                    collectDemoDeletes('listings', listings, payload.listings.length > 0 || isFullSync);
                    collectDemoDeletes('orders', orders, payload.orders.length > 0 || isFullSync);
                    collectDemoDeletes('suppliers', suppliers, payload.suppliers.length > 0 || isFullSync);
                    collectDemoDeletes('purchaseOrders', purchaseOrders, payload.purchaseOrders.length > 0 || isFullSync);
                    collectDemoDeletes('bomOrders', bomOrders, payload.bomOrders.length > 0 || isFullSync);
                    collectDemoDeletes('warehouseLedgers', warehouseLedgers, payload.warehouseLedgers.length > 0 || isFullSync);
                    collectDemoDeletes('fbaShipments', fbaShipments, payload.fbaShipments.length > 0 || isFullSync);
                    collectDemoDeletes('adCampaigns', adCampaigns, payload.adCampaigns.length > 0 || isFullSync);
                    collectDemoDeletes('searchTerms', searchTerms, payload.searchTerms.length > 0 || isFullSync);
                    collectDemoDeletes('settlements', settlements, payload.settlements.length > 0 || isFullSync);
                    collectDemoDeletes('extraExpenses', extraExpenses, isFullSync);

                    const completedSet = new Set<ErpEntityType>(payload.completedDomains || []);
                    const nextShops = mergeSyncedEntities(shops, payload.shops, tenantId, payload.clearDemoForTenant && (payload.shops.length > 0 || isFullSync), completedSet.has('shops'));
                    const nextLocalSkus = mergeSyncedEntities(localSkus, payload.localSkus, tenantId, payload.clearDemoForTenant && (payload.localSkus.length > 0 || isFullSync), completedSet.has('localSkus'));
                    const nextListings = mergeSyncedEntities(listings, payload.listings, tenantId, payload.clearDemoForTenant && (payload.listings.length > 0 || isFullSync), completedSet.has('listings'));
                    const orderWindowStart = (payload.orderWindowStartDate || '').trim().slice(0, 10);
                    const nextOrders = mergeSyncedEntities(
                      orders,
                      payload.orders,
                      tenantId,
                      payload.clearDemoForTenant && (payload.orders.length > 0 || isFullSync),
                      completedSet.has('orders'),
                      /^\d{4}-\d{2}-\d{2}$/.test(orderWindowStart)
                        ? (ord) => {
                            const pDate = (ord.purchaseDate || '').slice(0, 10);
                            return !/^\d{4}-\d{2}-\d{2}$/.test(pDate) || pDate >= orderWindowStart;
                          }
                        : undefined
                    );
                    const nextSuppliers = mergeSyncedEntities(suppliers, payload.suppliers, tenantId, payload.clearDemoForTenant && (payload.suppliers.length > 0 || isFullSync), completedSet.has('suppliers'));
                    const nextPurchaseOrders = mergeSyncedEntities(purchaseOrders, payload.purchaseOrders, tenantId, payload.clearDemoForTenant && (payload.purchaseOrders.length > 0 || isFullSync), completedSet.has('purchaseOrders'));
                    const nextBomOrders = mergeSyncedEntities(bomOrders, payload.bomOrders, tenantId, payload.clearDemoForTenant && (payload.bomOrders.length > 0 || isFullSync), completedSet.has('bomOrders'));
                    const nextWarehouseLedgers = mergeSyncedEntities(warehouseLedgers, payload.warehouseLedgers, tenantId, payload.clearDemoForTenant && (payload.warehouseLedgers.length > 0 || isFullSync), completedSet.has('warehouseLedgers'));
                    const nextFbaShipments = mergeSyncedEntities(fbaShipments, payload.fbaShipments, tenantId, payload.clearDemoForTenant && (payload.fbaShipments.length > 0 || isFullSync), completedSet.has('fbaShipments'));
                    const nextAds = mergeSyncedEntities(adCampaigns, payload.adCampaigns, tenantId, payload.clearDemoForTenant && (payload.adCampaigns.length > 0 || isFullSync), completedSet.has('adCampaigns'));
                    const nextSearchTerms = mergeSyncedEntities(searchTerms, payload.searchTerms, tenantId, payload.clearDemoForTenant && (payload.searchTerms.length > 0 || isFullSync), completedSet.has('searchTerms'));
                    const nextSettlements = mergeSyncedEntities(settlements, payload.settlements, tenantId, payload.clearDemoForTenant && (payload.settlements.length > 0 || isFullSync), completedSet.has('settlements'));
                    const incomingFx = payload.exchangeRates || [];
                    const incomingProfits = payload.profitSummaries || [];
                    const nextExchangeRates = mergeSyncedEntities(exchangeRates, incomingFx, tenantId, false, completedSet.has('exchangeRates'));
                    const nextProfitSummaries = mergeSyncedEntities(profitSummaries, incomingProfits, tenantId, false, completedSet.has('profitSummaries'));
                    const nextExtraExpenses = payload.clearDemoForTenant && isFullSync ? extraExpenses.filter((e) => !(e.tenantId === tenantId && isDemoFixtureRecord(e))) : extraExpenses;

                    const realShopIds = nextShops.filter((s) => s.tenantId === tenantId).map((s) => s.id);
                    const updatedTeamMembers = teamMembers
                      .filter((m) => m.tenantId === tenantId && m.allowedShopIds.some((sid) => /^shop-(us|de|uk|jp)-0\d$/.test(sid)))
                      .map((m) => ({
                        ...m,
                        allowedShopIds: m.roleCode === 'TENANT_ADMIN' ? ['ALL'] : realShopIds,
                      }));
                    const nextTeamMembers =
                      updatedTeamMembers.length > 0
                        ? teamMembers.map((m) => updatedTeamMembers.find((u) => u.id === m.id) || m)
                        : teamMembers;

                    const updatedTenant: Tenant = {
                      ...currentTenant,
                      lastLingxingSyncAt: nowStr,
                      lingxingSyncWatermarks: payload.updatedWatermarks
                        ? {
                            ...(currentTenant.lingxingSyncWatermarks || {}),
                            ...payload.updatedWatermarks,
                          }
                        : currentTenant.lingxingSyncWatermarks,
                      lingxingConnectionStatus: 'CONNECTED',
                      usedShopsCount: realShopIds.length,
                      usedSkusCount: Math.max(
                        nextListings.filter((l) => l.tenantId === tenantId).length,
                        nextLocalSkus.filter((s) => s.tenantId === tenantId).length
                      ),
                    };
                    const nextTenants = tenants.map((t) =>
                      t.id === tenantId ? updatedTenant : t
                    );

                    const dbRes = await persistLingxingSyncedEntities(supabaseConfig, {
                      tenant: updatedTenant,
                      shops: payload.shops,
                      localSkus: payload.localSkus,
                      listings: payload.listings,
                      orders: payload.orders,
                      suppliers: payload.suppliers,
                      purchaseOrders: payload.purchaseOrders,
                      bomOrders: payload.bomOrders,
                      warehouseLedgers: payload.warehouseLedgers,
                      fbaShipments: payload.fbaShipments,
                      adCampaigns: payload.adCampaigns,
                      searchTerms: payload.searchTerms,
                      settlements: payload.settlements,
                      exchangeRates: incomingFx,
                      profitSummaries: incomingProfits,
                      updatedTeamMembers,
                      deleteDemoRecordIds,
                      pruneStaleDomains: Array.from(completedSet),
                      orderWindowStartDate: payload.orderWindowStartDate,
                    });

                    if (dbRes.ok) {
                      prevSnapshotRef.current = {
                        ...prevSnapshotRef.current,
                        tenants: nextTenants,
                        shops: nextShops,
                        localSkus: nextLocalSkus,
                        listings: nextListings,
                        orders: nextOrders,
                        suppliers: nextSuppliers,
                        purchaseOrders: nextPurchaseOrders,
                        bomOrders: nextBomOrders,
                        warehouseLedgers: nextWarehouseLedgers,
                        fbaShipments: nextFbaShipments,
                        adCampaigns: nextAds,
                        searchTerms: nextSearchTerms,
                        settlements: nextSettlements,
                        exchangeRates: nextExchangeRates,
                        profitSummaries: nextProfitSummaries,
                        extraExpenses: nextExtraExpenses,
                        teamMembers: nextTeamMembers,
                      };
                      setTenants(nextTenants);
                      setShops(nextShops);
                      setLocalSkus(nextLocalSkus);
                      setListings(nextListings);
                      setOrders(nextOrders);
                      setSuppliers(nextSuppliers);
                      setPurchaseOrders(nextPurchaseOrders);
                      setBomOrders(nextBomOrders);
                      setWarehouseLedgers(nextWarehouseLedgers);
                      setFbaShipments(nextFbaShipments);
                      setAdCampaigns(nextAds);
                      setSearchTerms(nextSearchTerms);
                      setSettlements(nextSettlements);
                      setExchangeRates(nextExchangeRates);
                      setProfitSummaries(nextProfitSummaries);
                      setExtraExpenses(nextExtraExpenses);
                      setTeamMembers(nextTeamMembers);
                      if (dbStatus === 'EMPTY_DB') {
                        setDbStatus('LOADED');
                      }
                      setDbRecordCount((c) => Math.max(0, c + dbRes.upserted - dbRes.deleted));
                      void invalidateErpBackendCache(undefined, tenantId).then(() => {
                        setBackendQueryVersion((v) => v + 1);
                      });
                      appendAuditLog(
                        'TENANT',
                        'LINGXING_MCP_CRON',
                        'Lingxing MCP Connector',
                        'PULL_SYNC_REAL_DATA',
                        payload.toolNames.join(', '),
                        dbRes.message
                      );
                      showToast(dbRes.message);
                    } else {
                      showToast(dbRes.message);
                    }

                    return { ok: dbRes.ok, upserted: dbRes.upserted, message: dbRes.message };
                  }}
                />
              )}

              {effectiveTenantTab === 'mcp_downstream' && (
                <McpAndCloudDeployView
                  currentTenant={currentTenant}
                  currentPlan={currentPlan}
                  mcpTokens={mcpTokens}
                  auditLogs={auditLogs.filter((l) => l.scope === 'TENANT')}
                  isReadOnlyExpired={isReadOnlyExpired}
                  canWriteMcp={hasPerm('mcp:write')}
                  mcpModuleEnabled={isMcpGatewayEnabled}
                  sampleAsin={scopedListings[0]?.asin || ''}
                  sampleMarketplace={scopedListings[0]?.marketplace || 'US'}
                  sampleLocalSku={tenantLocalSkus[0]?.sku || ''}
                  sampleSupplierName={tenantSuppliers[0]?.supplierName || ''}
                  onCreateMcpToken={(name, scope) => {
                    const rand = Math.random().toString(36).substring(2, 10);
                    const fullVal = `xc_mcp_demo_${rand}${Date.now().toString(36)}`;
                    setMcpTokens((prev) => [
                      {
                        id: `mcp-tok-${Date.now()}`,
                        tenantId: currentTenant.id,
                        tokenName: name,
                        tokenPreview: `${fullVal.slice(0, 16)}...${fullVal.slice(-4)}`,
                        fullTokenValue: fullVal,
                        permissionScope: scope,
                        authMode:
                          supabaseConfig.authMode === 'LOGTO_OIDC'
                            ? 'LOGTO_OAUTH21'
                            : 'PAT_STATIC',
                        callsCountMonth: 0,
                        lastUsedAt: '刚刚创建',
                        status: 'ACTIVE',
                      },
                      ...prev,
                    ]);
                    showToast(`已签发租户 MCP 令牌: ${name}`);
                  }}
                  onRecordMcpCallSuccess={(toolName) => {
                    setTenants((prev) =>
                      prev.map((t) =>
                        t.id === currentTenant.id
                          ? { ...t, usedMcpCallsMonth: t.usedMcpCallsMonth + 1 }
                          : t
                      )
                    );
                    appendAuditLog(
                      'TENANT',
                      'MCP_AI_AGENT',
                      'Downstream MCP Client',
                      'MCP_TOOL_CALL',
                      toolName,
                      `执行 /api/mcp 工具调用 (${toolName})`
                    );
                  }}
                />
              )}

              {effectiveTenantTab === 'rbac_center' && (
                <RbacPermissionCenterView
                  currentTenant={currentTenant}
                  currentPlan={currentPlan}
                  shops={shops}
                  roles={currentTenantRoles}
                  members={currentTenantMembers}
                  invitations={currentTenantInvitations}
                  activeMemberId={activeMember.id}
                  tenantAuditLogs={auditLogs.filter(
                    (l) => l.scope === 'TENANT' && l.tenantId === currentTenant.id
                  )}
                  isReadOnlyExpired={isReadOnlyExpired}
                  onAddMember={(memberData) => {
                    const created: RbacTeamMember = {
                      ...memberData,
                      id: `usr-${Date.now()}`,
                      tenantId: currentTenant.id,
                      lastLoginAt: '尚未登录',
                    };
                    setTeamMembers((prev) => [...prev, created]);
                    setTenants((prev) =>
                      prev.map((t) =>
                        t.id === currentTenant.id
                          ? { ...t, usedUsersCount: t.usedUsersCount + 1 }
                          : t
                      )
                    );
                    appendAuditLog(
                      'TENANT',
                      'USER',
                      activeMember.fullName,
                      'RBAC_ADD_MEMBER',
                      created.email,
                      `新增成员 [${created.fullName}] 并分配角色 [${created.roleCode}]`
                    );
                    showToast(`已新增成员 ${created.fullName}`);
                  }}
                  onUpdateMember={(memberId, patch) => {
                    setTeamMembers((prev) =>
                      prev.map((m) => (m.id === memberId ? { ...m, ...patch } : m))
                    );
                    showToast('已实时更新成员权限与店铺数据范围');
                  }}
                  onSwitchActiveMember={(memberId) => {
                    setActiveMemberId(memberId);
                    const nextM = teamMembers.find((m) => m.id === memberId);
                    if (nextM) {
                      showToast(`已切换体验视角为 [${nextM.fullName} · ${nextM.roleName}]`);
                    }
                  }}
                  onCreateRole={(roleName, roleCode, description) => {
                    const created: RbacRoleDefinition = {
                      id: `role-${Date.now()}`,
                      tenantId: currentTenant.id,
                      roleCode,
                      roleName,
                      description,
                      isSystemRole: false,
                      permissions: ['dashboard:view'],
                    };
                    setRbacRoles((prev) => [...prev, created]);
                    showToast(`已创建自定义岗位角色: ${roleName}`);
                  }}
                  onToggleRolePermission={(roleId, perm) => {
                    setRbacRoles((prev) =>
                      prev.map((r) => {
                        if (r.id !== roleId) return r;
                        const exists = r.permissions.includes(perm);
                        return {
                          ...r,
                          permissions: exists
                            ? r.permissions.filter((p) => p !== perm)
                            : [...r.permissions, perm],
                        };
                      })
                    );
                    showToast(`已更新角色权限码 [${perm}]`);
                  }}
                  onCreateInvitation={handleCreateInvitation}
                  onAcceptInvitation={handleAcceptInvitation}
                  onRevokeInvitation={handleRevokeInvitation}
                />
              )}

              {effectiveTenantTab === 'tenant_subscription' && (
                <TenantSubscriptionView
                  currentTenant={currentTenant}
                  currentPlan={currentPlan}
                  allPlans={plans}
                  onRedeemLicenseKey={handleRedeemLicenseKey}
                />
              )}

              {effectiveTenantTab === 'app_marketplace' && (
                <TenantAppMarketplaceView
                  currentTenant={currentTenant}
                  currentPlan={currentPlan}
                  appModules={appModules}
                  installedModules={installedModules}
                  isReadOnlyExpired={isReadOnlyExpired}
                  canManageMarketplace={hasPerm('marketplace:manage')}
                  onToggleTenantModule={handleToggleTenantModule}
                />
              )}

              {effectiveTenantTab === 'workspace_settings' && (
                <TenantWorkspaceSettingsView
                  currentTenant={currentTenant}
                  isReadOnlyExpired={isReadOnlyExpired}
                  canEditSettings={hasPerm('workspace:settings')}
                  onUpdateWorkspaceSettings={handleUpdateWorkspaceSettings}
                />
              )}
            </>
          )}
        </main>
      </div>

      {portalMode === 'PLATFORM_SUPER_ADMIN' && (
        <SupabaseSetupModal
          isOpen={isSetupModalOpen}
          onClose={() => setIsSetupModalOpen(false)}
          config={supabaseConfig}
          onSaveConfig={handleSavePlatformInfraConfig}
        />
      )}
    </div>
  );
}
