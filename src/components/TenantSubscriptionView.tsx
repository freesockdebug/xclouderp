import React, { useState } from 'react';
import { Tenant, SubscriptionPlan } from '../types/erp';
import { KeyRound, CheckCircle2, AlertTriangle, CreditCard } from 'lucide-react';

interface TenantSubscriptionViewProps {
  currentTenant: Tenant;
  currentPlan: SubscriptionPlan;
  allPlans: SubscriptionPlan[];
  onRedeemLicenseKey: (licenseKeyInput: string) => { ok: boolean; message: string };
}

export const TenantSubscriptionView: React.FC<TenantSubscriptionViewProps> = ({
  currentTenant,
  currentPlan,
  allPlans,
  onRedeemLicenseKey,
}) => {
  const [licenseInput, setLicenseInput] = useState('');
  const [redeemFeedback, setRedeemFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseInput.trim()) return;
    const res = onRedeemLicenseKey(licenseInput.trim());
    setRedeemFeedback(res);
  };

  const quotaBars = [
    {
      label: '绑定亚马逊店铺数',
      used: currentTenant.usedShopsCount,
      limit: currentPlan.maxShops,
    },
    {
      label: '企业团队员工席位',
      used: currentTenant.usedUsersCount,
      limit: currentPlan.maxUsers,
    },
    {
      label: '本地仓库 SKU 档案',
      used: currentTenant.usedSkusCount,
      limit: currentPlan.maxSkus,
    },
    {
      label: '当月 MCP AI 调用额度',
      used: currentTenant.usedMcpCallsMonth,
      limit: currentPlan.mcpCallsQuota,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Current Tenant Subscription Summary — Strictly scoped to currentTenant only */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span>本企业订阅套餐与配额中心 ({currentTenant.companyName})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              租户编码: <span className="font-mono">{currentTenant.tenantCode}</span> · 仅展示当前企业的配额用量与激活码自助核销，平台其他租户数据完全不可见
            </p>
          </div>
          <div className="text-right font-mono text-xs">
            <div className="font-bold text-blue-600 dark:text-blue-400">
              {currentPlan.planName} ({currentPlan.planCode})
            </div>
            <div
              className={`mt-0.5 font-semibold ${
                currentTenant.subscriptionStatus === 'ACTIVE'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : currentTenant.subscriptionStatus === 'GRACE_PERIOD'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              状态: {currentTenant.subscriptionStatus} · 到期: {currentTenant.subscriptionEndsAt.slice(0, 10)}
            </div>
          </div>
        </div>

        {/* 4 Quota Usage Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {quotaBars.map((bar) => {
            const pct = Math.min(100, Math.round((bar.used / Math.max(1, bar.limit)) * 100));
            return (
              <div
                key={bar.label}
                className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>{bar.label}</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                    {pct}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-600'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 text-[11px] font-mono tabular-nums text-slate-500">
                  已用 {bar.used.toLocaleString()} / 上限 {bar.limit.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* License Key Self-Service Redemption */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-blue-600" />
          <span>自助兑换订阅激活码 (续费 / 升级套餐 / 解除到期只读锁)</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          输入平台运营商签发的企业激活码后，系统将即时延长租户有效期并恢复领星 MCP 同步与 ERP 全部写入权限。
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={licenseInput}
            onChange={(e) => setLicenseInput(e.target.value)}
            placeholder="输入 XC-XXX-XXXD-XXXX-XXXX 激活码"
            className="w-full sm:flex-1 sm:min-w-64 px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap shrink-0"
          >
            立即核销并激活服务
          </button>
        </form>

        {redeemFeedback && (
          <div
            className={`mt-3 p-3 rounded text-xs flex items-center gap-2 border ${
              redeemFeedback.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900'
            }`}
          >
            {redeemFeedback.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{redeemFeedback.message}</span>
          </div>
        )}
      </div>

      {/* Plan Comparison Reference */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
          可选订阅版本规格对比
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-4">版本名称</th>
                <th className="py-2.5 px-4 text-right">月费 / 年费</th>
                <th className="py-2.5 px-4 text-right">店铺数上限</th>
                <th className="py-2.5 px-4 text-right">子账号席位</th>
                <th className="py-2.5 px-4 text-right">月度 MCP 配额</th>
                <th className="py-2.5 px-4 text-right">领星同步周期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
              {allPlans.map((p) => (
                <tr
                  key={p.planCode}
                  className={
                    p.planCode === currentPlan.planCode
                      ? 'bg-blue-50/50 dark:bg-blue-950/30'
                      : ''
                  }
                >
                  <td className="py-3 px-4 font-sans">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {p.planName}
                    </span>
                    {p.planCode === currentPlan.planCode && (
                      <span className="ml-2 font-mono text-[11px] text-blue-600 dark:text-blue-400">
                        · 当前版本
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    ¥{p.monthlyPriceCny} / ¥{p.annualPriceCny}
                  </td>
                  <td className="py-3 px-4 text-right">{p.maxShops}</td>
                  <td className="py-3 px-4 text-right">{p.maxUsers}</td>
                  <td className="py-3 px-4 text-right">{p.mcpCallsQuota.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">{p.syncIntervalMinutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
