import React, { useState, useEffect } from 'react';
import { Tenant, TenantWorkspaceSettings } from '../types/erp';
import { Sliders, Palette, Bell, Database, Save, CheckCircle2 } from 'lucide-react';

interface TenantWorkspaceSettingsViewProps {
  currentTenant: Tenant;
  isReadOnlyExpired: boolean;
  canEditSettings: boolean;
  onUpdateWorkspaceSettings: (patch: Partial<TenantWorkspaceSettings>) => void;
}

const ACCENT_PRESETS: Array<{
  id: TenantWorkspaceSettings['accentColor'];
  label: string;
  swatchClass: string;
}> = [
  { id: 'blue', label: '科技蓝 (Blue)', swatchClass: 'bg-blue-600' },
  { id: 'indigo', label: '深靛蓝 (Indigo)', swatchClass: 'bg-indigo-600' },
  { id: 'emerald', label: '跨境绿 (Emerald)', swatchClass: 'bg-emerald-600' },
  { id: 'slate', label: '极简灰 (Slate)', swatchClass: 'bg-slate-800' },
  { id: 'amber', label: '琥珀金 (Amber)', swatchClass: 'bg-amber-600' },
];

export const TenantWorkspaceSettingsView: React.FC<TenantWorkspaceSettingsViewProps> = ({
  currentTenant,
  isReadOnlyExpired,
  canEditSettings,
  onUpdateWorkspaceSettings,
}) => {
  const ws = currentTenant.workspaceSettings;
  const [brandTitle, setBrandTitle] = useState(ws.brandTitle);
  const [brandBadge, setBrandBadge] = useState(ws.brandBadge);
  const [accentColor, setAccentColor] = useState<TenantWorkspaceSettings['accentColor']>(
    ws.accentColor
  );
  const [defaultFxRateUsdCny, setDefaultFxRateUsdCny] = useState(ws.defaultFxRateUsdCny);
  const [alertWebhookChannel, setAlertWebhookChannel] = useState<
    TenantWorkspaceSettings['alertWebhookChannel']
  >(ws.alertWebhookChannel);
  const [alertWebhookPlaceholder, setAlertWebhookPlaceholder] = useState(
    ws.alertWebhookPlaceholder
  );
  const [notifyStockout, setNotifyStockout] = useState(ws.notifyStockout);
  const [notifyHijack, setNotifyHijack] = useState(ws.notifyHijack);
  const [notifyExpiry7d, setNotifyExpiry7d] = useState(ws.notifyExpiry7d);
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    const nextWs = currentTenant.workspaceSettings;
    setBrandTitle(nextWs.brandTitle);
    setBrandBadge(nextWs.brandBadge);
    setAccentColor(nextWs.accentColor);
    setDefaultFxRateUsdCny(nextWs.defaultFxRateUsdCny);
    setAlertWebhookChannel(nextWs.alertWebhookChannel);
    setAlertWebhookPlaceholder(nextWs.alertWebhookPlaceholder);
    setNotifyStockout(nextWs.notifyStockout);
    setNotifyHijack(nextWs.notifyHijack);
    setNotifyExpiry7d(nextWs.notifyExpiry7d);
    setSavedNotice('');
  }, [currentTenant.id, currentTenant.workspaceSettings]);

  const disabled = isReadOnlyExpired || !canEditSettings;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    const safeFx = Number.isFinite(defaultFxRateUsdCny) && defaultFxRateUsdCny > 0 ? defaultFxRateUsdCny : 7.24;
    onUpdateWorkspaceSettings({
      brandTitle: brandTitle.trim() || currentTenant.companyName,
      brandBadge: brandBadge.trim().toUpperCase().slice(0, 2) || 'XC',
      accentColor,
      defaultFxRateUsdCny: safeFx,
      alertWebhookChannel,
      alertWebhookPlaceholder: alertWebhookPlaceholder.trim(),
      notifyStockout,
      notifyHijack,
      notifyExpiry7d,
    });
    setSavedNotice('已保存本企业工作台白标品牌与运营预警通道配置。');
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-600" />
            <span>工作台配置与轻量白标 (Workspace Settings · /t/{currentTenant.slug})</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            无需绑定独立域名即可配置本企业专属工作台抬头、主题强调色、默认结算汇率与飞书/企微/钉钉运营预警机器人。
          </p>
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-45"
        >
          <Save className="w-3.5 h-3.5" />
          <span>保存工作台配置</span>
        </button>
      </div>

      {savedNotice && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* 2-Column Main Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Branding & Finance Defaults */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <Palette className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              01. 轻量白标品牌与业财默认参数
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                工作台顶部白标名称
              </label>
              <input
                type="text"
                value={brandTitle}
                disabled={disabled}
                onChange={(e) => setBrandTitle(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                2位徽章代码
              </label>
              <input
                type="text"
                maxLength={2}
                value={brandBadge}
                disabled={disabled}
                onChange={(e) => setBrandBadge(e.target.value.toUpperCase())}
                className="w-full px-3 py-1.5 font-mono uppercase bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-2">
              企业主题强调色
            </label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  disabled={disabled}
                  onClick={() => setAccentColor(preset.id)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-xs transition-colors disabled:opacity-50 ${
                    accentColor === preset.id
                      ? 'border-slate-900 dark:border-slate-100 bg-slate-100 dark:bg-slate-800 font-semibold text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${preset.swatchClass}`} />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1">
              默认 USD / CNY 核算参考汇率
            </label>
            <input
              type="number"
              step="0.01"
              min="1"
              value={defaultFxRateUsdCny}
              disabled={disabled}
              onChange={(e) => setDefaultFxRateUsdCny(Number(e.target.value))}
              className="w-40 px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
            />
          </div>
        </div>

        {/* Alert Webhooks */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <Bell className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              02. 运营预警 Webhook 通知通道
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                推送平台
              </label>
              <select
                value={alertWebhookChannel}
                disabled={disabled}
                onChange={(e) =>
                  setAlertWebhookChannel(
                    e.target.value as TenantWorkspaceSettings['alertWebhookChannel']
                  )
                }
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
              >
                <option value="NONE">未启用</option>
                <option value="FEISHU">飞书机器人 (Feishu)</option>
                <option value="WECOM">企业微信 (WeCom)</option>
                <option value="DINGTALK">钉钉机器人 (DingTalk)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                Webhook 地址 (脱敏展示)
              </label>
              <input
                type="text"
                value={alertWebhookPlaceholder}
                disabled={disabled || alertWebhookChannel === 'NONE'}
                onChange={(e) => setAlertWebhookPlaceholder(e.target.value)}
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/demo-placeholder"
                className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={notifyStockout}
                disabled={disabled}
                onChange={() => setNotifyStockout(!notifyStockout)}
              />
              <span>FBA 可售天数低于 15 天时触发断货补货预警</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={notifyHijack}
                disabled={disabled}
                onChange={() => setNotifyHijack(!notifyHijack)}
              />
              <span>监测到 BuyBox 丢失或新增跟卖者时立即推送告警</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={notifyExpiry7d}
                disabled={disabled}
                onChange={() => setNotifyExpiry7d(!notifyExpiry7d)}
              />
              <span>SaaS 订阅到期前 7 天自动推送续费提醒</span>
            </label>
          </div>
        </div>
      </div>

      {/* Section 3: Data Isolation & Tenant Namespace Snapshot */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              03. 多租户三级数据、缓存与存储隔离命名空间 (统一单域名路径模式)
            </h3>
          </div>
          <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
            {currentTenant.isolationMode}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
          <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="text-[11px] text-slate-500">统一路径租户入口 (无子域名)</div>
            <div className="font-semibold text-slate-900 dark:text-white mt-1">
              /t/{currentTenant.slug}
            </div>
          </div>
          <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="text-[11px] text-slate-500">数据库 Schema 命名空间</div>
            <div className="font-semibold text-slate-900 dark:text-white mt-1">
              {currentTenant.dbSchemaName}
            </div>
          </div>
          <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="text-[11px] text-slate-500">边缘缓存 Key 隔离前缀</div>
            <div className="font-semibold text-slate-900 dark:text-white mt-1">
              {currentTenant.cachePrefix}*
            </div>
          </div>
          <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="text-[11px] text-slate-500">对象存储 Bucket 隔离前缀</div>
            <div className="font-semibold text-slate-900 dark:text-white mt-1">
              {currentTenant.storageBucketPrefix}*
            </div>
          </div>
        </div>

        <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 leading-relaxed">
          数据库实例连接、专属 BYOD 数据库绑定及登录认证引擎（Supabase Auth / Logto OIDC）均由<span className="font-semibold text-slate-800 dark:text-slate-200">平台超级管理员</span>统一托管维护，租户侧仅提供只读隔离状态查看；如需调整隔离等级或独立数据库接入，请联系平台运维团队。
        </div>
      </div>
    </form>
  );
};
