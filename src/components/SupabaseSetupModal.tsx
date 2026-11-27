import React, { useState, useEffect } from 'react';
import {
  SupabaseConnectionConfig,
  probeSupabaseConnection,
} from '../services/supabaseClient';
import { SUPABASE_MULTI_TENANT_SQL_SCHEMA } from '../data/initialErpData';
import {
  X,
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SupabaseConnectionConfig;
  onSaveConfig: (newConfig: SupabaseConnectionConfig) => void | Promise<void>;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [projectUrl, setProjectUrl] = useState(config.projectUrl);
  const [anonKey, setAnonKey] = useState(config.anonKey);
  const [authMode, setAuthMode] = useState<'SUPABASE_AUTH' | 'LOGTO_OIDC'>(
    config.authMode
  );
  const [logtoEndpoint, setLogtoEndpoint] = useState(
    config.logtoEndpoint || 'https://auth.x-cloud-erp.example.com'
  );
  const [logtoAppId, setLogtoAppId] = useState(
    config.logtoAppId || 'app_xcloud_b2b_orgs'
  );

  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    connected: boolean;
    schemaInitialized: boolean;
    latencyMs: number;
    message: string;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setProjectUrl(config.projectUrl);
    setAnonKey(config.anonKey);
    setAuthMode(config.authMode);
    setLogtoEndpoint(config.logtoEndpoint || 'https://auth.x-cloud-erp.example.com');
    setLogtoAppId(config.logtoAppId || 'app_xcloud_b2b_orgs');
    setProbeResult(null);
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProbing(true);
    const updatedCfg: SupabaseConnectionConfig = {
      projectUrl: projectUrl.trim(),
      anonKey: anonKey.trim(),
      authMode,
      logtoEndpoint: logtoEndpoint.trim(),
      logtoAppId: logtoAppId.trim(),
    };
    const res = await probeSupabaseConnection(updatedCfg);
    const normalizedCfg: SupabaseConnectionConfig = {
      ...updatedCfg,
      projectUrl: res.normalizedUrl || updatedCfg.projectUrl,
    };
    setProjectUrl(normalizedCfg.projectUrl);
    setProbeResult(res);
    await onSaveConfig(normalizedCfg);
    setProbing(false);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_MULTI_TENANT_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                平台超管专属 · 全局数据库与登录认证配置
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                仅平台超级管理员可见与修改，租户工作台已彻底隔离此入口
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleTestAndSave} className="mt-4 space-y-4 text-xs">
          <div className="p-3 rounded border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              租户的领星 ERP MCP 数据源凭证已独立归口至「租户工作台 → 领星 MCP 数据源接入」由各租户管理员自行维护，本弹窗仅管理全平台共享数据库与全局登录认证引擎。
            </span>
          </div>

          <div className="p-2.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 space-y-1">
            <div className="font-medium text-slate-900 dark:text-white">
              已停用浏览器 localStorage 存储数据库配置（旧浏览器缓存会自动清除）
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400">
              当前生效来源：
              <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                {config.configSource === 'ENV'
                  ? '服务端环境变量 (process.env)'
                  : config.configSource === 'SERVER_MEMORY' || config.configSource === 'CLIENT_MEMORY'
                    ? '当前服务端运行内存（服务重启后失效，持久化请配置环境变量 SUPABASE_URL / SUPABASE_ANON_KEY）'
                    : '未配置（建议通过服务端环境变量 SUPABASE_URL / SUPABASE_ANON_KEY 配置）'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                平台 Supabase Project URL
              </label>
              <input
                type="text"
                value={projectUrl}
                onChange={(e) => setProjectUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                平台 Supabase Anon / Public Key
              </label>
              <input
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="sb_publishable_your_supabase_anon_key"
                className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
          </div>

          {/* Auth Provider Mode Selection */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              全局身份认证引擎 (Supabase Auth vs. Logto OIDC Organizations 双模支持)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAuthMode('SUPABASE_AUTH')}
                className={`p-2.5 rounded border text-left ${
                  authMode === 'SUPABASE_AUTH'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="font-semibold text-slate-900 dark:text-white">
                  Supabase Auth (默认直连)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  50,000 MAU 免费，零外部依赖，内置 RLS 绑定
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('LOGTO_OIDC')}
                className={`p-2.5 rounded border text-left ${
                  authMode === 'LOGTO_OIDC'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="font-semibold text-slate-900 dark:text-white">
                  Logto OIDC + Organizations
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  原生 B2B 多卖家组织切换、飞书/微信扫码、MCP OAuth 2.1
                </div>
              </button>
            </div>

            {authMode === 'LOGTO_OIDC' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-slate-500 mb-1">
                    Logto OIDC Endpoint
                  </label>
                  <input
                    type="text"
                    value={logtoEndpoint}
                    onChange={(e) => setLogtoEndpoint(e.target.value)}
                    className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">
                    Logto Application ID
                  </label>
                  <input
                    type="text"
                    value={logtoAppId}
                    onChange={(e) => setLogtoAppId(e.target.value)}
                    className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
              </div>
            )}
          </div>

          {probeResult && (
            <div
              className={`p-3 rounded border flex items-start gap-2 ${
                probeResult.connected
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}
            >
              {probeResult.connected ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div>{probeResult.message}</div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleCopySql}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
            >
              {copiedSql ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>已复制多租户 RLS 建表 SQL</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制 Supabase 建表 SQL 脚本</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                关闭
              </button>
              <button
                type="submit"
                disabled={probing}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
                <span>保存并测试平台连接</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
