import React, { useState, useEffect } from 'react';
import {
  Tenant,
  TenantIsolationMode,
  SubscriptionPlan,
  SubscriptionPlanCode,
  SubscriptionStatus,
  BillingLicense,
  AuditLogItem,
  ErpAppModule,
  ErpModuleCode,
  TenantInstalledModule,
} from '../types/erp';
import {
  SUPABASE_MULTI_TENANT_SQL_SCHEMA,
  CLOUDFLARE_WORKER_DEPLOY_CODE,
  WRANGLER_TOML_CONFIG,
} from '../data/initialErpData';
import {
  validateTenantSlug,
  generateTenantSchemaSql,
  isModuleEnabledForTenant,
} from '../lib/erpEngine';
import {
  SupabaseConnectionConfig,
  probeSupabaseConnection,
} from '../services/supabaseClient';
import type { DatabaseLoadStatus } from '../services/erpDatabaseService';
import {
  Building2,
  KeyRound,
  ShieldCheck,
  Server,
  FileText,
  ArrowRight,
  Copy,
  Check,
  Plus,
  Blocks,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export type SuperAdminSubTab =
  | 'platform_overview'
  | 'tenants_lifecycle'
  | 'app_marketplace_admin'
  | 'plans_licenses'
  | 'infra_auth_deploy'
  | 'platform_audit';

export interface ProvisionTenantPayload {
  companyName: string;
  slug: string;
  isolationMode: TenantIsolationMode;
  planCode: SubscriptionPlanCode;
  initialAdminEmail: string;
  bundlePreset: 'BASIC' | 'FULL_SUITE';
}

interface SuperAdminConsoleViewProps {
  activeSubTab: SuperAdminSubTab;
  tenants: Tenant[];
  plans: SubscriptionPlan[];
  licenses: BillingLicense[];
  appModules: ErpAppModule[];
  installedModules: TenantInstalledModule[];
  platformAuditLogs: AuditLogItem[];
  supabaseConfig: SupabaseConnectionConfig;
  dbStatus: DatabaseLoadStatus;
  dbMessage: string;
  dbRecordCount: number;
  isLoadingDb: boolean;
  isSeedingDb: boolean;
  onReloadFromDb: () => Promise<void>;
  onSeedStandardDataToDb: () => Promise<void>;
  onSavePlatformInfraConfig: (newConfig: SupabaseConnectionConfig) => void | Promise<void>;
  onUpdateTenantByodUrl: (tenantId: string, byodUrl: string) => void;
  onSimulateTenantStatus: (tenantId: string, status: SubscriptionStatus) => void;
  onProvisionTenant: (payload: ProvisionTenantPayload) => void;
  onUpdateCatalogModule: (
    moduleCode: ErpModuleCode,
    patch: Partial<Pick<ErpAppModule, 'isPublished' | 'minPlanCode' | 'monthlyAddonPriceCny'>>
  ) => void;
  onUpdatePlanQuota: (
    planCode: SubscriptionPlanCode,
    patch: Partial<Pick<SubscriptionPlan, 'monthlyPriceCny' | 'maxShops' | 'maxUsers' | 'mcpCallsQuota'>>
  ) => void;
  onGenerateLicenseKey: (planCode: SubscriptionPlanCode, durationDays: number) => void;
  onImpersonateTenant: (tenantId: string) => void;
}

export const SuperAdminConsoleView: React.FC<SuperAdminConsoleViewProps> = ({
  activeSubTab,
  tenants,
  plans,
  licenses,
  appModules,
  installedModules,
  platformAuditLogs,
  supabaseConfig,
  dbStatus,
  dbMessage,
  dbRecordCount,
  isLoadingDb,
  isSeedingDb,
  onReloadFromDb,
  onSeedStandardDataToDb,
  onSavePlatformInfraConfig,
  onUpdateTenantByodUrl,
  onSimulateTenantStatus,
  onProvisionTenant,
  onUpdateCatalogModule,
  onUpdatePlanQuota,
  onGenerateLicenseKey,
  onImpersonateTenant,
}) => {
  const authProviderMode = supabaseConfig.authMode;
  const [newLicPlan, setNewLicPlan] = useState<SubscriptionPlanCode>('PRO');
  const [newLicDays, setNewLicDays] = useState<number>(365);
  const [codeTab, setCodeTab] = useState<'SQL' | 'TENANT_SQL' | 'WORKER' | 'WRANGLER'>('SQL');
  const [selectedSchemaTenantId, setSelectedSchemaTenantId] = useState<string>(
    tenants[0]?.id || ''
  );
  const [copiedFlag, setCopiedFlag] = useState(false);

  // Platform Infrastructure (DB + Auth Engine + BYOD Tenant DB) State
  const [dbProjectUrl, setDbProjectUrl] = useState(supabaseConfig.projectUrl);
  const [dbAnonKey, setDbAnonKey] = useState(supabaseConfig.anonKey);
  const [logtoEndpoint, setLogtoEndpoint] = useState(
    supabaseConfig.logtoEndpoint || 'https://auth.x-cloud-erp.example.com'
  );
  const [logtoAppId, setLogtoAppId] = useState(
    supabaseConfig.logtoAppId || 'app_xcloud_b2b_orgs'
  );
  const [probingDb, setProbingDb] = useState(false);
  const [dbProbeResult, setDbProbeResult] = useState<{
    connected: boolean;
    schemaInitialized: boolean;
    latencyMs: number;
    message: string;
  } | null>(null);
  const [byodDrafts, setByodDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDbProjectUrl(supabaseConfig.projectUrl);
    setDbAnonKey(supabaseConfig.anonKey);
    setLogtoEndpoint(supabaseConfig.logtoEndpoint || 'https://auth.x-cloud-erp.example.com');
    setLogtoAppId(supabaseConfig.logtoAppId || 'app_xcloud_b2b_orgs');
  }, [supabaseConfig]);

  const handleSwitchAuthProviderMode = (mode: 'SUPABASE_AUTH' | 'LOGTO_OIDC') => {
    onSavePlatformInfraConfig({
      projectUrl: dbProjectUrl.trim(),
      anonKey: dbAnonKey.trim(),
      authMode: mode,
      logtoEndpoint: logtoEndpoint.trim(),
      logtoAppId: logtoAppId.trim(),
    });
  };

  const handleSaveAndProbeInfra = async (e: React.FormEvent) => {
    e.preventDefault();
    setProbingDb(true);
    const updatedCfg: SupabaseConnectionConfig = {
      projectUrl: dbProjectUrl.trim(),
      anonKey: dbAnonKey.trim(),
      authMode: authProviderMode,
      logtoEndpoint: logtoEndpoint.trim(),
      logtoAppId: logtoAppId.trim(),
    };
    const res = await probeSupabaseConnection(updatedCfg);
    const normalizedCfg: SupabaseConnectionConfig = {
      ...updatedCfg,
      projectUrl: res.normalizedUrl || updatedCfg.projectUrl,
    };
    setDbProjectUrl(normalizedCfg.projectUrl);
    setDbProbeResult(res);
    await onSavePlatformInfraConfig(normalizedCfg);
    setProbingDb(false);
  };

  // Automated Tenant Provisioning Form State
  const [provCompany, setProvCompany] = useState('');
  const [provSlug, setProvSlug] = useState('');
  const [provIsolation, setProvIsolation] = useState<TenantIsolationMode>('SCHEMA_PER_TENANT');
  const [provPlan, setProvPlan] = useState<SubscriptionPlanCode>('PRO');
  const [provAdminEmail, setProvAdminEmail] = useState('');
  const [provBundle, setProvBundle] = useState<'BASIC' | 'FULL_SUITE'>('FULL_SUITE');
  const [provNotice, setProvNotice] = useState('');

  const slugValidation = validateTenantSlug(provSlug, tenants);

  const handleProvisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProvNotice('');
    if (!provCompany.trim() || !provAdminEmail.trim()) {
      setProvNotice('请填写企业名称与初始管理员邮箱。');
      return;
    }
    if (!slugValidation.valid) {
      setProvNotice(slugValidation.reason || '租户路径标识校验未通过');
      return;
    }
    onProvisionTenant({
      companyName: provCompany.trim(),
      slug: slugValidation.normalized,
      isolationMode: provIsolation,
      planCode: provPlan,
      initialAdminEmail: provAdminEmail.trim(),
      bundlePreset: provBundle,
    });
    setProvCompany('');
    setProvSlug('');
    setProvAdminEmail('');
    setProvNotice(`租户 /t/${slugValidation.normalized} 已自动完成初始化 Provisioning（默认角色 + 主账号 + 模块装配）。`);
  };

  const activeTenantsCount = tenants.filter((t) => t.subscriptionStatus === 'ACTIVE').length;
  const graceTenantsCount = tenants.filter((t) => t.subscriptionStatus === 'GRACE_PERIOD').length;
  const expiredTenantsCount = tenants.filter(
    (t) => t.subscriptionStatus === 'EXPIRED_READONLY' || t.subscriptionStatus === 'SUSPENDED'
  ).length;

  const estimatedMrrCny = tenants.reduce((acc, t) => {
    if (t.subscriptionStatus === 'EXPIRED_READONLY' || t.subscriptionStatus === 'SUSPENDED') {
      return acc;
    }
    const plan = plans.find((p) => p.planCode === t.planCode);
    return acc + (plan?.monthlyPriceCny || 0);
  }, 0);

  const totalMcpCallsMonth = tenants.reduce((acc, t) => acc + t.usedMcpCallsMonth, 0);

  const selectedSchemaTenant =
    tenants.find((t) => t.id === selectedSchemaTenantId) || tenants[0];

  const activeCode =
    codeTab === 'SQL'
      ? SUPABASE_MULTI_TENANT_SQL_SCHEMA
      : codeTab === 'TENANT_SQL'
      ? selectedSchemaTenant
        ? generateTenantSchemaSql(selectedSchemaTenant)
        : '-- 当前数据库暂无租户记录，请先新建租户或初始化数据后再生成独立租户 Schema SQL。'
      : codeTab === 'WORKER'
      ? CLOUDFLARE_WORKER_DEPLOY_CODE
      : WRANGLER_TOML_CONFIG;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeCode);
    setCopiedFlag(true);
    setTimeout(() => setCopiedFlag(false), 2000);
  };

  if (activeSubTab === 'platform_overview') {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                SaaS 平台超管运营总览 (Platform Super Admin Console)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                本控制台与卖家租户业务工作台物理隔离，仅面向平台运营商管理全局租户生命周期、订阅计费与底层基础设施
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Auth Engine: {authProviderMode} · RLS Isolation: ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="text-xs text-slate-500 dark:text-slate-400">平台月度经常性收入 (MRR)</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1.5">
                ¥{estimatedMrrCny.toLocaleString()}
              </div>
              <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                活跃计费租户 {activeTenantsCount} 家 · 宽限期 {graceTenantsCount} 家
              </div>
            </div>

            <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="text-xs text-slate-500 dark:text-slate-400">入驻卖家租户总数</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1.5">
                {tenants.length}
              </div>
              <div className="text-[11px] font-mono text-red-600 dark:text-red-400 mt-1">
                到期只读/熔断: {expiredTenantsCount} 家
              </div>
            </div>

            <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="text-xs text-slate-500 dark:text-slate-400">全平台本月 MCP 调用量</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1.5">
                {totalMcpCallsMonth.toLocaleString()}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-1">
                领星上游同步 + 下游 AI Agent
              </div>
            </div>

            <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="text-xs text-slate-500 dark:text-slate-400">未兑换订阅激活码池</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1.5">
                {licenses.filter((l) => l.status === 'UNUSED').length}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-1">
                累计已签发 {licenses.length} 张激活码
              </div>
            </div>
          </div>
        </div>

        {/* Quick Tenant Health & Impersonation Directory */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              全平台卖家租户运行状态与配额监控
            </h3>
            <span className="text-xs font-mono text-slate-500">
              支持审计留痕代管进入租户 ERP
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">租户编码 / 主体名称</th>
                  <th className="py-2.5 px-4">当前套餐</th>
                  <th className="py-2.5 px-4">生命周期状态</th>
                  <th className="py-2.5 px-4 text-right">店铺 / 席位 / SKU</th>
                  <th className="py-2.5 px-4 text-right">MCP 本月调用</th>
                  <th className="py-2.5 px-4">到期时间</th>
                  <th className="py-2.5 px-4 text-right">超管操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {tenants.map((t) => {
                  const plan = plans.find((p) => p.planCode === t.planCode);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-900 dark:text-white">
                          {t.tenantCode}
                        </div>
                        <div className="text-[11px] text-slate-500">{t.companyName}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {t.planCode}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        <span
                          className={
                            t.subscriptionStatus === 'ACTIVE'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : t.subscriptionStatus === 'GRACE_PERIOD'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {t.subscriptionStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {t.usedShopsCount}/{plan?.maxShops} · {t.usedUsersCount}/{plan?.maxUsers} · {t.usedSkusCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {t.usedMcpCallsMonth.toLocaleString()} / {plan?.mcpCallsQuota.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {t.subscriptionEndsAt.slice(0, 10)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onImpersonateTenant(t.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded"
                        >
                          <span>代管进入工作台</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (activeSubTab === 'tenants_lifecycle') {
    const statusOptions: SubscriptionStatus[] = [
      'ACTIVE',
      'GRACE_PERIOD',
      'EXPIRED_READONLY',
      'SUSPENDED',
    ];
    return (
      <div className="space-y-6">
        {/* Automated Tenant Provisioning Wizard */}
        <form
          onSubmit={handleProvisionSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>新建卖家租户自动化 Provisioning 向导 (统一路径 /t/&#123;slug&#125; · 零子域名配置)</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                一键创建租户命名空间（Schema / 缓存前缀 / 存储桶前缀）、初始化默认 RBAC 角色与企业主账号，并按选定套餐自动装配应用模块
              </p>
            </div>
            {provNotice && (
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {provNotice}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] text-slate-500 mb-1">企业主体名称</label>
              <input
                type="text"
                value={provCompany}
                onChange={(e) => setProvCompany(e.target.value)}
                placeholder="如：示例卖家 Delta 跨境有限公司"
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                路径标识 /t/{slugValidation.normalized || 'slug'}
              </label>
              <input
                type="text"
                value={provSlug}
                onChange={(e) => setProvSlug(e.target.value)}
                placeholder="如：delta"
                className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              {provSlug && !slugValidation.valid && (
                <div className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">
                  {slugValidation.reason}
                </div>
              )}
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">三级数据隔离模式</label>
              <select
                value={provIsolation}
                onChange={(e) => setProvIsolation(e.target.value as TenantIsolationMode)}
                className="w-full px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                <option value="SHARED_RLS">SHARED_RLS (共享库行隔离)</option>
                <option value="SCHEMA_PER_TENANT">SCHEMA_PER_TENANT (独立Schema)</option>
                <option value="DEDICATED_DB_BYOD">DEDICATED_DB_BYOD (独立库)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">初始套餐 / 模块包</label>
              <div className="flex gap-1.5">
                <select
                  value={provPlan}
                  onChange={(e) => setProvPlan(e.target.value as SubscriptionPlanCode)}
                  className="w-1/2 px-1.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  <option value="TRIAL">TRIAL</option>
                  <option value="PRO">PRO</option>
                  <option value="ENTERPRISE">ENTERPRISE</option>
                </select>
                <select
                  value={provBundle}
                  onChange={(e) => setProvBundle(e.target.value as 'BASIC' | 'FULL_SUITE')}
                  className="w-1/2 px-1.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  <option value="FULL_SUITE">全套模块</option>
                  <option value="BASIC">基础运营包</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">初始租户管理员邮箱</label>
              <input
                type="email"
                value={provAdminEmail}
                onChange={(e) => setProvAdminEmail(e.target.value)}
                placeholder="admin-delta@example.com"
                className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono text-slate-500">
              预计生成命名空间: Schema={provIsolation === 'DEDICATED_DB_BYOD' ? 'public(BYOD)' : `tenant_${slugValidation.normalized || 'xxx'}`} · Cache=tenant:{slugValidation.normalized || 'xxx'}:* · Bucket=erp-files/{slugValidation.normalized || 'xxx'}/
            </span>
            <button
              type="submit"
              disabled={!slugValidation.valid || !provCompany.trim() || !provAdminEmail.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-45"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>执行自动化初始化 (Provision Tenant)</span>
            </button>
          </div>
        </form>

        {/* Tenant Lifecycle Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>多卖家租户生命周期、隔离层级与失效状态机管控</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                切换任意租户状态为 EXPIRED_READONLY 或 SUSPENDED 时，将联动触发 Cloudflare Cron 同步暂停与 Supabase PostgreSQL RLS 写保护熔断
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">租户信息 / 统一路径</th>
                  <th className="py-2.5 px-4">隔离层级与命名空间</th>
                  <th className="py-2.5 px-4">套餐 / 已装模块</th>
                  <th className="py-2.5 px-4">生命周期状态切换 (立即生效)</th>
                  <th className="py-2.5 px-4 text-right">审计代管</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {tenants.map((t) => {
                  const enabledModulesCount = appModules.filter((m) =>
                    isModuleEnabledForTenant(t.id, m.moduleCode, installedModules, appModules)
                  ).length;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-semibold text-slate-900 dark:text-white">
                          {t.tenantCode} · /t/{t.slug}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {t.companyName} · 截止 {t.subscriptionEndsAt.slice(0, 10)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {t.isolationMode}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Schema: {t.dbSchemaName} · {t.cachePrefix}*
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {t.planCode}
                        </span>
                        <div className="text-[11px] text-slate-500">
                          已启用 {enabledModulesCount} / {appModules.length} 模块
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {statusOptions.map((st) => (
                            <button
                              key={st}
                              onClick={() => onSimulateTenantStatus(t.id, st)}
                              className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors ${
                                t.subscriptionStatus === st
                                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 font-semibold'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onImpersonateTenant(t.id)}
                          className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        >
                          代管进入
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (activeSubTab === 'app_marketplace_admin') {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Blocks className="w-4 h-4 text-blue-600" />
              <span>平台应用市场目录管控 (Central App Marketplace Catalog)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              控制全平台 ERP 插件模块的上架状态、最低套餐门槛与增值月费；平台下架任意非核心模块将立即从所有租户工作台撤除并拦截 API 调用
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            上架中: {appModules.filter((m) => m.isPublished).length} / {appModules.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4">模块编码与名称</th>
                <th className="py-2.5 px-4">业务域分类</th>
                <th className="py-2.5 px-4">最低套餐门槛</th>
                <th className="py-2.5 px-4 text-right">月度增值价 (CNY)</th>
                <th className="py-2.5 px-4 text-right">已启用租户数</th>
                <th className="py-2.5 px-4 text-right">平台上下架控制</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {appModules.map((mod) => {
                const adoptedCount = tenants.filter((t) =>
                  isModuleEnabledForTenant(t.id, mod.moduleCode, installedModules, appModules)
                ).length;
                return (
                  <tr key={mod.moduleCode} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {mod.moduleName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {mod.moduleCode} · {mod.description.slice(0, 42)}...
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {mod.category}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={mod.minPlanCode}
                        disabled={mod.isCoreRequired}
                        onChange={(e) =>
                          onUpdateCatalogModule(mod.moduleCode, {
                            minPlanCode: e.target.value as SubscriptionPlanCode,
                          })
                        }
                        className="px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
                      >
                        <option value="FREE">FREE</option>
                        <option value="TRIAL">TRIAL</option>
                        <option value="PRO">PRO</option>
                        <option value="ENTERPRISE">ENTERPRISE</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <input
                        type="number"
                        min={0}
                        value={mod.monthlyAddonPriceCny}
                        disabled={mod.isCoreRequired}
                        onChange={(e) =>
                          onUpdateCatalogModule(mod.moduleCode, {
                            monthlyAddonPriceCny: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-20 px-2 py-1 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
                      />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {adoptedCount} / {tenants.length}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        disabled={mod.isCoreRequired}
                        onClick={() =>
                          onUpdateCatalogModule(mod.moduleCode, {
                            isPublished: !mod.isPublished,
                          })
                        }
                        className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border disabled:opacity-45 ${
                          mod.isCoreRequired
                            ? 'border-slate-200 dark:border-slate-700 text-slate-400'
                            : mod.isPublished
                            ? 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                            : 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                        }`}
                      >
                        {mod.isCoreRequired
                          ? 'CORE_LOCKED'
                          : mod.isPublished
                          ? 'PUBLISHED (点击下架)'
                          : 'UNPUBLISHED (点击上架)'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeSubTab === 'plans_licenses') {
    return (
      <div className="space-y-6">
        {/* Editable 4-Tier Plan Quota Matrix */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              SaaS 四级订阅套餐配额矩阵 (平台定价与资源上限)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              修改下方配额上限将实时作用于租户工作台的席位新增校验与 MCP 速率限制器
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">套餐编码 / 名称</th>
                  <th className="py-2.5 px-4 text-right">月费 (CNY)</th>
                  <th className="py-2.5 px-4 text-right">最大店铺数</th>
                  <th className="py-2.5 px-4 text-right">最大员工席位</th>
                  <th className="py-2.5 px-4 text-right">月度 MCP 额度</th>
                  <th className="py-2.5 px-4 text-right">领星同步频率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {plans.map((p) => (
                  <tr key={p.planCode}>
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900 dark:text-white">
                        {p.planCode} · {p.planName}
                      </div>
                      <div className="text-[11px] text-slate-500">{p.targetAudience}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <input
                        type="number"
                        value={p.monthlyPriceCny}
                        onChange={(e) =>
                          onUpdatePlanQuota(p.planCode, {
                            monthlyPriceCny: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-20 px-2 py-1 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <input
                        type="number"
                        value={p.maxShops}
                        onChange={(e) =>
                          onUpdatePlanQuota(p.planCode, {
                            maxShops: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="w-16 px-2 py-1 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <input
                        type="number"
                        value={p.maxUsers}
                        onChange={(e) =>
                          onUpdatePlanQuota(p.planCode, {
                            maxUsers: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="w-16 px-2 py-1 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <input
                        type="number"
                        value={p.mcpCallsQuota}
                        onChange={(e) =>
                          onUpdatePlanQuota(p.planCode, {
                            mcpCallsQuota: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-24 px-2 py-1 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      每 {p.syncIntervalMinutes} 分钟
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* License Key Issuer */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <span>平台激活码签发中心 (License Key Issuer — 仅超管可见)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                签发后分发给对应卖家租户管理员，在其「本企业订阅与配额」页面输入即可自助续费与解封
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <select
                value={newLicPlan}
                onChange={(e) => setNewLicPlan(e.target.value as SubscriptionPlanCode)}
                className="px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                <option value="TRIAL">TRIAL</option>
                <option value="PRO">PRO</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
              </select>
              <select
                value={newLicDays}
                onChange={(e) => setNewLicDays(Number(e.target.value))}
                className="px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                <option value={30}>30 天</option>
                <option value={90}>90 天</option>
                <option value={365}>365 天</option>
              </select>
              <button
                onClick={() => onGenerateLicenseKey(newLicPlan, newLicDays)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>签发新激活码</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">激活码 (License Key)</th>
                  <th className="py-2.5 px-4">目标套餐 / 有效期</th>
                  <th className="py-2.5 px-4">状态</th>
                  <th className="py-2.5 px-4">签发时间 / 核销记录</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                {licenses.map((lic) => (
                  <tr key={lic.id}>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {lic.licenseKey}
                    </td>
                    <td className="py-3 px-4">
                      {lic.targetPlan} · {lic.durationDays} 天
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          lic.status === 'UNUSED'
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : 'text-slate-500'
                        }
                      >
                        {lic.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {lic.createdAt} {lic.redeemedAt ? `· 已核销 (${lic.redeemedAt})` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (activeSubTab === 'infra_auth_deploy') {
    const byodTenants = tenants.filter((t) => t.isolationMode === 'DEDICATED_DB_BYOD');
    return (
      <div className="space-y-6">
        {/* 0. Live Supabase Database Runtime Status & Explicit Seed Controls */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                全量数据直连状态 (Supabase Single Source of Truth)
              </h2>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                  dbStatus === 'LOADED'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : dbStatus === 'EMPTY_DB'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                }`}
              >
                {dbStatus} · {dbRecordCount} rows
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void onReloadFromDb()}
                disabled={isLoadingDb}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDb ? 'animate-spin' : ''}`} />
                <span>从 Supabase 重新拉取</span>
              </button>
              <button
                type="button"
                onClick={() => void onSeedStandardDataToDb()}
                disabled={isSeedingDb || dbStatus === 'UNCONFIGURED'}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {isSeedingDb
                    ? '正在写入 Supabase...'
                    : '一键初始化标准业务数据到 Supabase'}
                </span>
              </button>
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            {dbMessage}
          </p>
        </div>

        {/* 1. Platform Main Database & Auth Engine Form (Super Admin Exclusive) */}
        <form
          onSubmit={handleSaveAndProbeInfra}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600" />
                <span>平台全局数据库连接与双模认证引擎 (超管专属配置)</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                全平台 Supabase 主库与登录认证引擎（Supabase Auth / Logto OIDC）仅平台超级管理员可维护，租户工作台严禁访问或修改
              </p>
            </div>
            <button
              type="submit"
              disabled={probingDb}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${probingDb ? 'animate-spin' : ''}`} />
              <span>保存并测试主库连接</span>
            </button>
          </div>

          <div className="p-3 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-700 dark:text-slate-300 space-y-1">
            <div className="font-medium text-slate-900 dark:text-white">
              已停用浏览器 localStorage 存储数据库配置（旧缓存会在加载时自动清理）
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400">
              当前生效来源：
              <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                {supabaseConfig.configSource === 'ENV'
                  ? '服务端环境变量 (process.env)'
                  : supabaseConfig.configSource === 'SERVER_MEMORY' ||
                      supabaseConfig.configSource === 'CLIENT_MEMORY'
                    ? '服务端运行内存（重启后失效，持久化请设置服务端环境变量 SUPABASE_URL / SUPABASE_ANON_KEY）'
                    : '未配置（推荐在部署环境设置 SUPABASE_URL / SUPABASE_ANON_KEY）'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                平台 Supabase Project URL
              </label>
              <input
                type="text"
                value={dbProjectUrl}
                onChange={(e) => setDbProjectUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                平台 Supabase Anon / Public Key
              </label>
              <input
                type="password"
                value={dbAnonKey}
                onChange={(e) => setDbAnonKey(e.target.value)}
                placeholder="sb_publishable_your_supabase_anon_key"
                className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
          </div>

          {dbProbeResult && (
            <div
              className={`p-3 rounded border text-xs flex items-start gap-2 ${
                dbProbeResult.connected
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}
            >
              {dbProbeResult.connected ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{dbProbeResult.message}</span>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>全局双模认证引擎切换 (Supabase Auth vs Logto OIDC Organizations)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  支持从 MVP 期 Supabase Auth 平滑演进至多组织 B2B Logto OIDC
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs font-mono">
                <button
                  type="button"
                  onClick={() => handleSwitchAuthProviderMode('SUPABASE_AUTH')}
                  className={`px-3 py-1 rounded ${
                    authProviderMode === 'SUPABASE_AUTH'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  SUPABASE_AUTH (零成本直连)
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchAuthProviderMode('LOGTO_OIDC')}
                  className={`px-3 py-1 rounded ${
                    authProviderMode === 'LOGTO_OIDC'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  LOGTO_OIDC (企业 B2B 组织)
                </button>
              </div>
            </div>

            {authProviderMode === 'LOGTO_OIDC' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Logto OIDC Endpoint
                  </label>
                  <input
                    type="text"
                    value={logtoEndpoint}
                    onChange={(e) => setLogtoEndpoint(e.target.value)}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Logto Application ID
                  </label>
                  <input
                    type="text"
                    value={logtoAppId}
                    onChange={(e) => setLogtoAppId(e.target.value)}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded border border-slate-200 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Supabase Auth 模式
                </div>
                <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  内置 50,000 MAU 免费额度，与 PostgreSQL RLS 的 <span className="font-mono">auth.jwt()-&gt;&gt;&apos;tenant_id&apos;</span> 零延迟原生打通，适合单数据库极速上线。
                </p>
              </div>
              <div className="p-4 rounded border border-slate-200 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Logto OIDC Organizations 模式
                </div>
                <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  原生支持 B2B 多租户 Organization Token、SAML/企业微信 SSO、以及 OAuth 2.1 动态客户端注册，无缝对接企业级下游 MCP 鉴权。
                </p>
              </div>
            </div>
          </div>
        </form>

        {/* 2. Super Admin Managed BYOD Tenant Dedicated DB Instances */}
        {byodTenants.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600" />
                <span>专属独立数据库实例绑定 (DEDICATED_DB_BYOD · 仅超管托管)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                大客户独立数据库地址统一由平台超管在此绑定与变更，租户管理员无权在工作台自行修改数据库连接地址
              </p>
            </div>
            <div className="space-y-3">
              {byodTenants.map((tenant) => {
                const draftVal =
                  byodDrafts[tenant.id] !== undefined
                    ? byodDrafts[tenant.id]
                    : tenant.byodSupabaseUrl || '';
                return (
                  <div
                    key={tenant.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs"
                  >
                    <div className="sm:w-56 shrink-0">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {tenant.companyName}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {tenant.tenantCode} · /t/{tenant.slug}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={draftVal}
                      onChange={(e) =>
                        setByodDrafts((prev) => ({ ...prev, [tenant.id]: e.target.value }))
                      }
                      placeholder="https://tenant-dedicated-db.supabase.co"
                      className="flex-1 px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                    />
                    <button
                      type="button"
                      onClick={() => onUpdateTenantByodUrl(tenant.id, draftVal.trim())}
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded shrink-0"
                    >
                      保存独立库地址
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Cloudflare Workers + Supabase 多租户 RLS 基础设施代码导出
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {codeTab === 'TENANT_SQL' && (
                <select
                  value={selectedSchemaTenant?.id || ''}
                  onChange={(e) => setSelectedSchemaTenantId(e.target.value)}
                  className="px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      /t/{t.slug} ({t.isolationMode})
                    </option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs font-mono">
                {(['SQL', 'TENANT_SQL', 'WORKER', 'WRANGLER'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCodeTab(tab)}
                    className={`px-2.5 py-1 rounded ${
                      codeTab === tab
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab === 'SQL'
                      ? 'Supabase RLS SQL'
                      : tab === 'TENANT_SQL'
                      ? 'Tenant Schema SQL'
                      : tab === 'WORKER'
                      ? 'Cloudflare worker.ts'
                      : 'wrangler.toml'}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded"
              >
                {copiedFlag ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFlag ? '已复制' : '复制代码'}</span>
              </button>
            </div>
          </div>
          <pre className="p-5 bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto max-h-96 leading-relaxed">
            {activeCode}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            平台跨租户安全与计费审计日志 (Scope: PLATFORM)
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-500">
          共 {platformAuditLogs.length} 条平台级记录
        </span>
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
        {platformAuditLogs.map((log) => (
          <div key={log.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                [{log.actorType}]
              </span>
              <span className="font-semibold text-slate-900 dark:text-white">{log.actorName}</span>
              <span className="text-slate-400">·</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {log.action} ({log.targetEntity})
              </span>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <span>{log.detail}</span>
              <span className="font-mono text-[11px]">{log.createdAt}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
