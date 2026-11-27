import React, { useState } from 'react';
import {
  Tenant,
  McpTokenItem,
  AuditLogItem,
  SubscriptionPlan,
} from '../types/erp';
import { Terminal, Copy, Check, Play, Cpu } from 'lucide-react';

interface McpAndCloudDeployViewProps {
  currentTenant: Tenant;
  currentPlan: SubscriptionPlan;
  mcpTokens: McpTokenItem[];
  auditLogs: AuditLogItem[];
  isReadOnlyExpired: boolean;
  canWriteMcp: boolean;
  mcpModuleEnabled?: boolean;
  sampleAsin?: string;
  sampleMarketplace?: string;
  sampleLocalSku?: string;
  sampleSupplierName?: string;
  onCreateMcpToken: (name: string, scope: 'READ_ONLY' | 'READ_WRITE') => void;
  onRecordMcpCallSuccess: (toolName: string) => void;
}

export const McpAndCloudDeployView: React.FC<McpAndCloudDeployViewProps> = ({
  currentTenant,
  currentPlan,
  mcpTokens,
  auditLogs,
  isReadOnlyExpired,
  canWriteMcp,
  mcpModuleEnabled = true,
  sampleAsin = '',
  sampleMarketplace = 'US',
  sampleLocalSku = '',
  sampleSupplierName = '',
  onCreateMcpToken,
  onRecordMcpCallSuccess,
}) => {
  const [selectedTokenId, setSelectedTokenId] = useState(
    mcpTokens[0]?.id || 'mcp-tok-01'
  );
  const activeToken =
    mcpTokens.find((t) => t.id === selectedTokenId) || mcpTokens[0];

  const [newTokenName, setNewTokenName] = useState('Dify-飞书运营日报机器人');
  const [newTokenScope, setNewTokenScope] = useState<'READ_ONLY' | 'READ_WRITE'>(
    'READ_ONLY'
  );

  const [mcpMethod, setMcpMethod] = useState<
    'initialize' | 'tools/list' | 'resources/list' | 'tools/call'
  >('tools/call');
  const [mcpToolName, setMcpToolName] = useState('get_asin_profit_breakdown');
  const [mcpResponseText, setMcpResponseText] = useState<string>(
    JSON.stringify(
      {
        hint: '点击 [发送 JSON-RPC 2.0 请求至 /api/mcp] 实测下游 X Cloud MCP Server（含租户订阅状态、月度配额与 READ_ONLY 权限沙箱拦截校验）',
      },
      null,
      2
    )
  );
  const [isTestingMcp, setIsTestingMcp] = useState(false);
  const [copiedFlag, setCopiedFlag] = useState(false);

  const handleIssueToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim() || !canWriteMcp || isReadOnlyExpired) return;
    onCreateMcpToken(newTokenName.trim(), newTokenScope);
    setNewTokenName('');
  };

  const handleTestMcpServer = async () => {
    setIsTestingMcp(true);
    const quotaRemaining = Math.max(
      0,
      currentPlan.mcpCallsQuota - currentTenant.usedMcpCallsMonth
    );

    const toolArgsMap: Record<string, Record<string, unknown>> = {
      get_asin_profit_breakdown: {
        asin: sampleAsin,
        marketplace: sampleMarketplace || 'US',
        days: 30,
      },
      calculate_smart_restock_plan: { targetCoverDays: 60, shippingMode: 'SEA' },
      diagnose_advertising_campaigns: { maxTargetAcos: 22 },
      create_draft_purchase_order: {
        localSku: sampleLocalSku,
        quantity: 200,
        supplierName: sampleSupplierName,
      },
      sync_from_lingxing_mcp: { domain: 'LISTINGS' },
    };

    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken?.fullTokenValue || 'xc_mcp_demo_placeholder'}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: mcpMethod,
          params:
            mcpMethod === 'tools/call'
              ? {
                  name: mcpToolName,
                  arguments: toolArgsMap[mcpToolName] || {},
                }
              : {},
          _contextTenantStatus: currentTenant.subscriptionStatus,
          _contextPermissionScope: activeToken?.permissionScope || 'READ_WRITE',
          _contextQuotaRemaining: quotaRemaining,
          _contextMcpModuleEnabled: mcpModuleEnabled,
        }),
      });

      const data = await res.json();
      setMcpResponseText(JSON.stringify(data, null, 2));
      if (res.ok && !data.error) {
        onRecordMcpCallSuccess(mcpMethod === 'tools/call' ? mcpToolName : mcpMethod);
      }
    } catch (err: unknown) {
      setMcpResponseText(
        JSON.stringify(
          { error: err instanceof Error ? err.message : String(err) },
          null,
          2
        )
      );
    } finally {
      setIsTestingMcp(false);
    }
  };

  const claudeDesktopConfigJson = JSON.stringify(
    {
      mcpServers: {
        'x-cloud-erp': {
          url: `${window.location.origin}/api/mcp`,
          headers: {
            Authorization: `Bearer ${activeToken?.tokenPreview || 'xc_mcp_demo_****0001'}`,
            'X-Tenant-Code': currentTenant.tenantCode,
          },
        },
      },
    },
    null,
    2
  );

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(claudeDesktopConfigJson);
    setCopiedFlag(true);
    setTimeout(() => setCopiedFlag(false), 2000);
  };

  const mcpAuditLogs = auditLogs.filter((l) => l.actorType === 'MCP_AI_AGENT');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 5 Cols: Tenant MCP Token Issuer & Selector */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  01. 下游 X Cloud MCP 令牌管理 (租户级)
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-500">
                额度: {currentTenant.usedMcpCallsMonth}/{currentPlan.mcpCallsQuota}
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5">
              向 Claude Desktop / Cursor / Dify 暴露本企业专属 <span className="font-mono">/api/mcp</span> 端点。受租户订阅状态、月度额度与 <span className="font-mono">READ_ONLY</span> 沙箱三重保护。
            </p>

            <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {mcpTokens.map((tok) => (
                <div
                  key={tok.id}
                  onClick={() => setSelectedTokenId(tok.id)}
                  className={`py-2.5 px-2 rounded cursor-pointer flex items-center justify-between ${
                    tok.id === selectedTokenId
                      ? 'bg-blue-50/70 dark:bg-blue-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {tok.tokenName}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {tok.tokenPreview} · {tok.authMode}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div
                      className={`text-[11px] font-bold ${
                        tok.permissionScope === 'READ_WRITE'
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {tok.permissionScope}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      本月 {tok.callsCountMonth} 次
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleIssueToken}
            className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5 text-xs"
          >
            <div className="font-medium text-slate-700 dark:text-slate-300">
              签发本企业 MCP 令牌 (需 mcp:write 权限):
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                disabled={!canWriteMcp || isReadOnlyExpired}
                placeholder="客户端名称，如 Claude-财务助理"
                className="flex-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
              />
              <select
                value={newTokenScope}
                disabled={!canWriteMcp || isReadOnlyExpired}
                onChange={(e) =>
                  setNewTokenScope(e.target.value as 'READ_ONLY' | 'READ_WRITE')
                }
                className="px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
              >
                <option value="READ_ONLY">READ_ONLY</option>
                <option value="READ_WRITE">READ_WRITE</option>
              </select>
              <button
                type="submit"
                disabled={!canWriteMcp || isReadOnlyExpired}
                className="px-3 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded whitespace-nowrap disabled:opacity-40"
              >
                签发
              </button>
            </div>
          </form>
        </div>

        {/* Right 7 Cols: Interactive MCP JSON-RPC 2.0 Sandbox */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  02. MCP Inspector 在线调试沙盒 (POST /api/mcp)
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500">
                令牌: {activeToken?.tokenName} ({activeToken?.permissionScope})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-3 text-xs">
              <div className="sm:col-span-4">
                <label className="block text-slate-500 mb-1">JSON-RPC 方法</label>
                <select
                  value={mcpMethod}
                  onChange={(e) =>
                    setMcpMethod(
                      e.target.value as
                        | 'initialize'
                        | 'tools/list'
                        | 'resources/list'
                        | 'tools/call'
                    )
                  }
                  className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  <option value="initialize">initialize</option>
                  <option value="tools/list">tools/list</option>
                  <option value="resources/list">resources/list</option>
                  <option value="tools/call">tools/call</option>
                </select>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-slate-500 mb-1">跨境业务 Tool</label>
                <select
                  value={mcpToolName}
                  disabled={mcpMethod !== 'tools/call'}
                  onChange={(e) => setMcpToolName(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
                >
                  <option value="get_asin_profit_breakdown">
                    [Read] get_asin_profit_breakdown
                  </option>
                  <option value="calculate_smart_restock_plan">
                    [Read] calculate_smart_restock_plan
                  </option>
                  <option value="diagnose_advertising_campaigns">
                    [Read] diagnose_advertising_campaigns
                  </option>
                  <option value="create_draft_purchase_order">
                    [Write] create_draft_purchase_order
                  </option>
                  <option value="sync_from_lingxing_mcp">
                    [Write] sync_from_lingxing_mcp
                  </option>
                </select>
              </div>

              <div className="sm:col-span-3 flex items-end">
                <button
                  onClick={handleTestMcpServer}
                  disabled={isTestingMcp}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>发送请求</span>
                </button>
              </div>
            </div>

            <pre className="mt-3 p-3.5 bg-slate-950 text-slate-200 text-[11px] font-mono rounded-md overflow-x-auto max-h-60 leading-relaxed">
              {mcpResponseText}
            </pre>
          </div>
        </div>
      </div>

      {/* Claude Desktop / Cursor Client JSON */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              03. Claude Desktop / Cursor 客户端一键接入配置 (mcp.json)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              平台级 Cloudflare Workers 与 Supabase RLS 建表脚本已归口至「平台超管控制台」统一维护
            </p>
          </div>
          <button
            onClick={handleCopyConfig}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded"
          >
            {copiedFlag ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedFlag ? '已复制 JSON' : '复制 mcp.json'}</span>
          </button>
        </div>
        <pre className="p-4 bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto leading-relaxed">
          {claudeDesktopConfigJson}
        </pre>
      </div>

      {/* Tenant MCP Call History */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            04. 本企业下游 AI Agent MCP 调用追踪 ({mcpAuditLogs.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
          {mcpAuditLogs.map((log) => (
            <div key={log.id} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono">
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {log.action}
                </span>{' '}
                · {log.targetEntity}
              </div>
              <div className="text-slate-500">
                {log.detail} · <span className="font-mono">{log.createdAt}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
