import React, { useState } from 'react';
import {
  Tenant,
  SubscriptionPlan,
  ErpAppModule,
  ErpModuleCode,
  TenantInstalledModule,
} from '../types/erp';
import {
  canTenantInstallModule,
  isModuleEnabledForTenant,
} from '../lib/erpEngine';
import {
  Blocks,
  CheckCircle2,
  Lock,
  Power,
  AlertCircle,
  Layers,
} from 'lucide-react';

interface TenantAppMarketplaceViewProps {
  currentTenant: Tenant;
  currentPlan: SubscriptionPlan;
  appModules: ErpAppModule[];
  installedModules: TenantInstalledModule[];
  isReadOnlyExpired: boolean;
  canManageMarketplace: boolean;
  onToggleTenantModule: (moduleCode: ErpModuleCode) => void;
}

const CATEGORY_LABELS: Record<'ALL' | ErpAppModule['category'], string> = {
  ALL: '全部模块',
  CORE: '核心底座',
  OPERATIONS: '亚马逊运营',
  SUPPLY_CHAIN: '采购与仓配',
  FINANCE: '业财核算',
  AI_INTEGRATION: 'MCP 智能体',
};

export const TenantAppMarketplaceView: React.FC<TenantAppMarketplaceViewProps> = ({
  currentTenant,
  currentPlan,
  appModules,
  installedModules,
  isReadOnlyExpired,
  canManageMarketplace,
  onToggleTenantModule,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<
    'ALL' | ErpAppModule['category']
  >('ALL');

  const visibleModules = appModules.filter((m) =>
    selectedCategory === 'ALL' ? true : m.category === selectedCategory
  );

  const enabledCount = appModules.filter((m) =>
    isModuleEnabledForTenant(currentTenant.id, m.moduleCode, installedModules, appModules)
  ).length;

  const monthlyAddonTotalCny = appModules.reduce((acc, m) => {
    const active = isModuleEnabledForTenant(
      currentTenant.id,
      m.moduleCode,
      installedModules,
      appModules
    );
    return active ? acc + m.monthlyAddonPriceCny : acc;
  }, 0);

  return (
    <div className="space-y-5">
      {/* Header Summary Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Blocks className="w-4 h-4 text-blue-600" />
              <span>租户应用市场与模块按需启停 (App Marketplace · /t/{currentTenant.slug})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              基于模块化 SaaS 能力编排：按套餐门槛启用或卸载业务模块。停用模块后，左侧菜单立即隐藏，且服务端网关 (/api/mcp & 领星代理) 同步返回 HTTP 403 MODULE_NOT_ENABLED。
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="text-right">
              <div className="text-[11px] text-slate-500">当前套餐门槛</div>
              <div className="font-semibold text-blue-600 dark:text-blue-400">
                {currentPlan.planCode} ({currentPlan.planName})
              </div>
            </div>
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="text-right">
              <div className="text-[11px] text-slate-500">已启用模块 / 增值月费</div>
              <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                {enabledCount} / {appModules.length} · +¥{monthlyAddonTotalCny}/月
              </div>
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 mt-4 text-xs">
          {(Object.keys(CATEGORY_LABELS) as Array<'ALL' | ErpAppModule['category']>).map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded border transition-colors ${
                  selectedCategory === cat
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 font-semibold'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            )
          )}
        </div>
      </div>

      {/* Modular Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleModules.map((mod) => {
          const isEnabled = isModuleEnabledForTenant(
            currentTenant.id,
            mod.moduleCode,
            installedModules,
            appModules
          );
          const installRecord = installedModules.find(
            (im) => im.tenantId === currentTenant.id && im.moduleCode === mod.moduleCode
          );
          const eligibility = canTenantInstallModule(currentPlan.planCode, mod);
          const disabledBtn =
            isReadOnlyExpired ||
            !canManageMarketplace ||
            mod.isCoreRequired ||
            (!isEnabled && !eligibility.allowed);

          return (
            <div
              key={mod.moduleCode}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {mod.moduleName}
                      </h3>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-1">
                      {mod.moduleCode} · 最低套餐: {mod.minPlanCode} ·{' '}
                      {mod.monthlyAddonPriceCny > 0
                        ? `增值 +¥${mod.monthlyAddonPriceCny}/月`
                        : '套餐内含 (¥0)'}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-semibold shrink-0 ${
                      !mod.isPublished
                        ? 'text-slate-400'
                        : isEnabled
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {!mod.isPublished
                      ? '平台已下架'
                      : mod.isCoreRequired
                      ? '核心必装'
                      : isEnabled
                      ? '已启用'
                      : '未启用'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                  {mod.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-[11px] text-slate-500 font-mono">
                  {!eligibility.allowed && !isEnabled ? (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{eligibility.reason}</span>
                    </span>
                  ) : installRecord ? (
                    <span>安装时间: {installRecord.installedAt}</span>
                  ) : (
                    <span>按需即装即用</span>
                  )}
                </div>

                <button
                  onClick={() => onToggleTenantModule(mod.moduleCode)}
                  disabled={disabledBtn}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-45 ${
                    mod.isCoreRequired
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                      : isEnabled
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {mod.isCoreRequired ? (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>核心锁定</span>
                    </>
                  ) : isEnabled ? (
                    <>
                      <Power className="w-3.5 h-3.5" />
                      <span>停用模块</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>安装并启用</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
