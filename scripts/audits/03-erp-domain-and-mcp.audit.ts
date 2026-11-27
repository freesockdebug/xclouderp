import type { DomainAuditSuite, AuditViolation } from './types';
import {
  evaluateMcpAccess,
  calculateAsinProfit,
  calculateFbaVolumetricCharge,
  calculateLingxingReplenishment,
  calculateThreeBasisProfit,
  calculatePricingProfitTrial,
  calculateLingxingWindowSales,
  calculateLingxingAdSummary,
  getTargetDateRangeForMarketplace,
} from '../../src/lib/erpEngine';
import { normalizeLingxingExchangeRates } from '../../src/services/lingxingMcpSync';
import { INITIAL_LISTINGS, INITIAL_LOCAL_SKUS } from '../../src/data/initialErpData';

const DOMAIN = '03-erp-domain-and-mcp';
const DOC_PATH = 'docs/03-erp-domain-and-mcp.md';

export const erpDomainMcpAuditSuite: DomainAuditSuite = {
  domain: DOMAIN,
  name: '核心跨境 ERP 业财引擎与下游 MCP Server 域',
  docPath: DOC_PATH,
  triggerPatterns: [
    /^src\/lib\/erpEngine\.ts$/,
    /^src\/services\/lingxingMcpSync\.ts$/,
    /^server\.ts$/,
    /^src\/components\/(DashboardOverview|AmazonOrdersAndListingsView|InventorySupplyChainView|WarehouseInventoryView|FbaShipmentsView|AdvertisingDaypartingView|FinanceAccountingView|McpAndCloudDeployView|ProductPerformanceView|OperationsToolsView)\.tsx$/,
    /^docs\/03-erp-domain-and-mcp\.md$/,
    /^scripts\/audits\/03-/,
  ],
  unitTestFiles: ['test/03-erp-domain-mcp.test.ts'],
  rules: [
    {
      id: 'ERP-ADV-01',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '下游 /api/mcp 必须完整落实 401/402/429/403 四层拦截与 READ_ONLY 写工具清单',
      historicalContext:
        '历史版本中 sync_from_lingxing_mcp 遗漏在 READ_ONLY 写拦截列表中，导致只读令牌可以触发上游同步。',
      remediation:
        '在 server.ts 的 /api/mcp 中确保 status(401)、status(402)、status(429)、status(403) 以及 sync_from_lingxing_mcp 拦截完整存在。',
      check(ctx) {
        const code = ctx.readFile('server.ts');
        const mcpBlockIdx = code.indexOf("app.post('/api/mcp'");
        const mcpSlice = mcpBlockIdx >= 0 ? code.slice(mcpBlockIdx) : '';
        const missing: string[] = [];
        for (const st of ['status(401)', 'status(402)', 'status(429)', 'status(403)']) {
          if (!mcpSlice.includes(st)) missing.push(st);
        }
        if (!/READ_ONLY[\s\S]{0,200}sync_from_lingxing_mcp/.test(mcpSlice)) {
          missing.push('READ_ONLY -> sync_from_lingxing_mcp block');
        }
        if (missing.length > 0) {
          return [
            {
              ruleId: 'ERP-ADV-01',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `/api/mcp 四层安全漏斗缺失: ${missing.join(', ')}`,
              historicalContext: '下游 AI Agent 必须经过严格四层鉴权与写工具沙箱隔离。',
              file: 'server.ts',
              remediation: `在 /api/mcp 中补全: ${missing.join(', ')}。`,
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'ERP-ADV-02',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'MCP resources/list 必须统一使用 xcloud:// URI 命名空间',
      historicalContext: '重命名品牌后残留旧 URI 协议前缀会破坏下游客户端资源寻址。',
      remediation: '将 server.ts 中 resources/list 的全部资源 URI 统一为 xcloud:// 开头。',
      check(ctx) {
        const code = ctx.readFile('server.ts');
        const uris = code.match(/uri:\s*'([^']+)'/g) || [];
        const invalid = uris.filter((u) => !u.includes("'xcloud://"));
        if (uris.length === 0 || invalid.length > 0) {
          return [
            {
              ruleId: 'ERP-ADV-02',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `发现非 xcloud:// 协议的 MCP 资源 URI: ${invalid.join(', ') || '无资源定义'}`,
              historicalContext: '对外暴露的 MCP 资源命名空间必须保持品牌一致性。',
              file: 'server.ts',
              remediation: '确保 resources/list 中的 uri 均使用 xcloud:// 前缀。',
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'ERP-ADV-03',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'src/lib/erpEngine.ts 必须存在显式除零与负值边界保护',
      historicalContext: '0 销量新品或 0 营收退货期若直接除法会产生 NaN/Infinity 污染利润底表与 CSV。',
      remediation: '保持 erpEngine.ts 中对汇率、营收、广告销售、日均销量与总件数的 > 0 守卫。',
      check(ctx) {
        const code = ctx.readFile('src/lib/erpEngine.ts');
        const hasGuards =
          /usdToCnyRate\s*>\s*0/.test(code) &&
          /revenue30dUsd\s*>\s*0/.test(code) &&
          /totalUnits\s*>\s*0/.test(code);
        if (!hasGuards) {
          return [
            {
              ruleId: 'ERP-ADV-03',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: 'erpEngine.ts 缺失显式除零保护逻辑',
              historicalContext: '财务引擎绝不允许输出 NaN 或 Infinity。',
              file: 'src/lib/erpEngine.ts',
              remediation: '为汇率、营收与总件数除法补充 > 0 三元保护。',
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'ERP-ADV-04',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '领星连接器严禁回流 Amazon SP-API / AWS SigV4 密钥配置输入框',
      historicalContext:
        '产品架构已明确以领星 MCP 替代繁琐的亚马逊 SP-API 与 Advertising API，避免卖家自行申请 AWS 开发者密钥。',
      remediation:
        '在 LingxingMcpConnectorView.tsx 中仅保留领星 MCP Server URL 与 X-Mcp-Key 表单。',
      check(ctx) {
        const code = ctx.readFile('src/components/LingxingMcpConnectorView.tsx');
        if (/placeholder=["'][^"']*(aws_secret|lwa_client_secret|sp-api refresh)/i.test(code)) {
          return [
            {
              ruleId: 'ERP-ADV-04',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: 'LingxingMcpConnectorView.tsx 检测到已废弃的 SP-API / AWS 密钥输入框',
              historicalContext: '系统仅支持通过领星 MCP 接入亚马逊数据。',
              file: 'src/components/LingxingMcpConnectorView.tsx',
              remediation: '移除 SP-API / AWS 表单字段，仅保留领星 MCP 接入项。',
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'ERP-ADV-05',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '领星式科学补货、三口径利润与定价利润试算引擎必须收敛于 erpEngine.ts 并通过零值边界防线',
      historicalContext:
        '补货多渠道分批、发货/订单/结算三口径利润与定价试算若散落在各视图内独立计算，会导致首页驾驶舱、FBA 补货与财务业绩报表数据打架，且 0 销量/0 售价会触发 NaN。',
      remediation:
        '保持 calculateLingxingReplenishment、calculateThreeBasisProfit、calculatePricingProfitTrial 统一导出自 src/lib/erpEngine.ts 并具备显式零值保护。',
      check(ctx) {
        const code = ctx.readFile('src/lib/erpEngine.ts');
        const requiredFns = [
          'calculateLingxingReplenishment',
          'calculateThreeBasisProfit',
          'calculatePricingProfitTrial',
        ];
        const missing = requiredFns.filter(
          (fn) => !new RegExp(`export\\s+function\\s+${fn}\\b`).test(code)
        );
        if (missing.length > 0) {
          return [
            {
              ruleId: 'ERP-ADV-05',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `src/lib/erpEngine.ts 缺失领星核心业财纯函数: ${missing.join(', ')}`,
              historicalContext: '补货、三口径利润与定价试算必须保持单一计算真理源。',
              file: 'src/lib/erpEngine.ts',
              remediation: `在 src/lib/erpEngine.ts 中导出: ${missing.join(', ')}。`,
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'ERP-ADV-06',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '多币种实时汇率换算、换货单剔除与订单量/销量分列必须收敛于 erpEngine.ts 与 lingxingMcpSync.ts',
      historicalContext:
        '历史版本中多站点(JPY/CAD/GBP/EUR)销售额与广告花费直接按原币种相加导致金额虚高，且换货单未排除导致近30天销量与领星前台偏差，订单量(单)与销量(件)口径混淆。',
      remediation:
        '保持 buildUsdRateMapFromExchangeRates、isOrderReplacement、calculateLingxingAdSummary、calculateLingxingSettlementSummary 导出自 src/lib/erpEngine.ts，且 normalizeLingxingExchangeRates 与 normalizeLingxingProfitSummary 导出自 src/services/lingxingMcpSync.ts。',
      check(ctx) {
        const engineCode = ctx.readFile('src/lib/erpEngine.ts');
        const syncCode = ctx.readFile('src/services/lingxingMcpSync.ts');
        const missingEngine = [
          'buildUsdRateMapFromExchangeRates',
          'isOrderReplacement',
          'calculateLingxingAdSummary',
          'calculateLingxingSettlementSummary',
        ].filter((fn) => !new RegExp(`export\\s+function\\s+${fn}\\b`).test(engineCode));
        const missingSync = [
          'normalizeLingxingExchangeRates',
          'normalizeLingxingProfitSummary',
        ].filter((fn) => !new RegExp(`export\\s+function\\s+${fn}\\b`).test(syncCode));

        if (missingEngine.length > 0 || missingSync.length > 0) {
          return [
            {
              ruleId: 'ERP-ADV-06',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `缺失多币种实时汇率或领星口径汇总纯函数: ${[...missingEngine, ...missingSync].join(', ')}`,
              historicalContext: '多币种折算 USD 与换货单过滤必须保持全系统单一真理源。',
              file: missingEngine.length > 0 ? 'src/lib/erpEngine.ts' : 'src/services/lingxingMcpSync.ts',
              remediation: '在对应模块补全导出函数并接入领星 MCP 实时汇率。',
            },
          ];
        }
        return [];
      },
    },
  ],
  async verify() {
    const violations: AuditViolation[] = [];
    // 1. MCP READ_ONLY write-tool attack
    const readOnlyAttack = evaluateMcpAccess({
      tenantStatus: 'ACTIVE',
      permissionScope: 'READ_ONLY',
      quotaRemaining: 100,
      toolName: 'create_draft_purchase_order',
    });
    if (readOnlyAttack.allowed || readOnlyAttack.httpStatus !== 403) {
      violations.push({
        ruleId: 'ERP-ADV-01',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: READ_ONLY 令牌未被拦截 (预期 HTTP 403)',
        historicalContext: '只读 MCP 令牌严禁执行采购草稿写入。',
        file: 'src/lib/erpEngine.ts',
        remediation: '检查 evaluateMcpAccess READ_ONLY 校验。',
      });
    }
    // 2. Zero-revenue / zero-rate / zero-sales NaN injection
    const zeroListing = {
      ...INITIAL_LISTINGS[0],
      revenue30dUsd: 0,
      adSales30dUsd: 0,
      dailySales7d: 0,
      orders30d: 0,
    };
    const profitRes = calculateAsinProfit(zeroListing, INITIAL_LOCAL_SKUS[0], 0, 50);
    if (
      !Number.isFinite(profitRes.netProfitUsd) ||
      !Number.isFinite(profitRes.netMarginPercent) ||
      !Number.isFinite(profitRes.acosPercent) ||
      profitRes.coverDays !== 999
    ) {
      violations.push({
        ruleId: 'ERP-ADV-03',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: 零销量/零汇率输入触发了 NaN/Infinity',
        historicalContext: '新品零销售场景必须稳定返回有限数值。',
        file: 'src/lib/erpEngine.ts',
        remediation: '修复 calculateAsinProfit 除零防线。',
      });
    }
    // 3. FBA volumetric weight > gross weight + zero box edge case
    const volRes = calculateFbaVolumetricCharge({
      lengthCm: 60,
      widthCm: 50,
      heightCm: 40,
      grossWeightKg: 10,
      boxCount: 0,
      unitsPerBox: 0,
      freightRatePerKgCny: 15,
    });
    if (!volRes.isVolumetricApplied || !Number.isFinite(volRes.unitFreightCny)) {
      violations.push({
        ruleId: 'ERP-ADV-03',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: FBA 泡重测算在 0 箱数边界异常',
        historicalContext: '抛重 (60*50*40/6000 = 20kg > 10kg) 与 0 箱数除零必须安全计算。',
        file: 'src/lib/erpEngine.ts',
        remediation: '修复 calculateFbaVolumetricCharge 逻辑。',
      });
    }
    // 4. Lingxing replenishment zero-sales & STOCKOUT_CERTAIN fault injection
    const zeroRepl = calculateLingxingReplenishment({
      dailySales7d: 0,
      dailySales30d: 0,
      fbaAvailable: 0,
      fbaInbound: 0,
      localAvailable: 100,
      purchaseLeadDays: 10,
      safetyDays: 25,
    });
    const urgentRepl = calculateLingxingReplenishment({
      dailySales7d: 20,
      dailySales30d: 20,
      fbaAvailable: 40,
      fbaInbound: 0,
      localAvailable: 500,
      purchaseLeadDays: 10,
      safetyDays: 25,
    });
    const zeroPriceTrial = calculatePricingProfitTrial({
      sellingPriceLocal: 0,
      fxRateToCny: 0,
      purchaseCostCny: 30,
      headFreightCny: 10,
      fbaFeeLocal: 4,
      referralFeePercent: 15,
    });
    const threeBasisCheck = calculateThreeBasisProfit({
      listing: INITIAL_LISTINGS[0],
      localSku: INITIAL_LOCAL_SKUS[0],
      usdToCnyRate: 7.24,
      basis: 'SETTLEMENT_BASIS',
      includePreSettlement: false,
    });
    if (
      zeroRepl.coverDays !== 999 ||
      urgentRepl.status !== 'STOCKOUT_CERTAIN' ||
      !Number.isFinite(zeroPriceTrial.netMarginPercent) ||
      zeroPriceTrial.breakevenAcosPercent !== 0 ||
      !Number.isFinite(threeBasisCheck.netMarginPercent)
    ) {
      violations.push({
        ruleId: 'ERP-ADV-05',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: 领星补货/三口径利润/定价试算引擎边界防线异常',
        historicalContext: '0 销量、必断货 (<7d)、0 售价与结算口径必须严格输出确定有限值。',
        file: 'src/lib/erpEngine.ts',
        remediation: '检查 calculateLingxingReplenishment / calculateThreeBasisProfit / calculatePricingProfitTrial 边界保护。',
      });
    }
    // 5. Multi-currency MCP FX, replacement exclusion, order vs unit split & ad USD conversion fault injection
    const liveFxCnyBase = normalizeLingxingExchangeRates(
      [
        { code: 'CNY', name: '人民币', rate_org: 1, my_rate: 1 },
        { code: 'USD', name: '美元', rate_org: 7.2, my_rate: 7.25 },
        { code: 'CAD', name: '加元', rate_org: 5.22, my_rate: 0 },
        { code: 'JPY', name: '日元', rate_org: 0.0475, my_rate: 0 },
      ],
      't-adv-fx'
    );
    const liveFxInverseUsd = normalizeLingxingExchangeRates(
      [
        { code: 'USD', rate_org: 1 },
        { code: 'CNY', rate_org: 7.25 },
        { code: 'JPY', rate_org: 150 },
      ],
      't-adv-fx'
    );
    const cadFx = liveFxCnyBase.find((r) => r.currencyCode === 'CAD');
    const jpyInverseFx = liveFxInverseUsd.find((r) => r.currencyCode === 'JPY');
    const fixedNow = new Date('2026-11-25T18:00:00Z');
    const rangeYesterday30 = getTargetDateRangeForMarketplace('US', '30D', 'PER_SITE', fixedNow, true);

    const windowSalesCheck = calculateLingxingWindowSales({
      orders: [
        {
          id: 'adv-o1',
          tenantId: 't-adv-fx',
          shopId: 's-us',
          shopName: 'US-Shop',
          marketplace: 'US',
          amazonOrderId: '111-0001',
          fulfillmentChannel: 'FBA',
          asin: 'B0ADV01',
          msku: 'SKU-1',
          quantity: 3,
          orderAmountUsd: 100,
          amazonFeeUsd: 15,
          orderStatus: 'SHIPPED',
          purchaseDate: '2026-11-24 10:00:00',
          buyerRegion: 'US',
          currency: 'USD',
          isReplacementOrder: false,
        },
        {
          id: 'adv-o2',
          tenantId: 't-adv-fx',
          shopId: 's-ca',
          shopName: 'CA-Shop',
          marketplace: 'CA',
          amazonOrderId: '111-0002',
          fulfillmentChannel: 'FBA',
          asin: 'B0ADV02',
          msku: 'SKU-2',
          quantity: 2,
          orderAmountUsd: 100,
          amazonFeeUsd: 15,
          orderStatus: 'SHIPPED',
          purchaseDate: '2026-11-24 12:00:00',
          buyerRegion: 'CA',
          currency: 'CAD',
          isReplacementOrder: false,
        },
        {
          id: 'adv-o3',
          tenantId: 't-adv-fx',
          shopId: 's-us',
          shopName: 'US-Shop',
          marketplace: 'US',
          amazonOrderId: '111-0003',
          fulfillmentChannel: 'FBA',
          asin: 'B0ADV01',
          msku: 'SKU-1',
          quantity: 4,
          orderAmountUsd: 0,
          amazonFeeUsd: 0,
          orderStatus: 'SHIPPED',
          purchaseDate: '2026-11-24 13:00:00',
          buyerRegion: 'US',
          currency: 'USD',
          isReplacementOrder: true,
        },
      ],
      listings: [],
      window: '30D',
      siteDateMode: 'PER_SITE',
      excludeReplacement: true,
      endAtYesterday: true,
      exchangeRates: liveFxCnyBase,
      nowDate: fixedNow,
    });

    const adSummaryCheck = calculateLingxingAdSummary(
      [
        {
          id: 'adv-ad-1',
          tenantId: 't-adv-fx',
          shopId: 's-jp',
          shopName: 'JP-Shop',
          marketplace: 'JP',
          campaignId: 'cmp-jp',
          campaignName: 'JP Campaign',
          adType: 'SP',
          associatedAsin: 'B0JP01',
          dailyBudgetUsd: 5000,
          defaultBidUsd: 50,
          impressions30d: 10000,
          clicks30d: 200,
          spend30dUsd: 15000, // 15,000 JPY != 15,000 USD!
          sales30dUsd: 45000, // 45,000 JPY
          orders30d: 20,
          status: 'ENABLED',
          daypartingEnabled: false,
          peakHoursRange: '18:00-23:00',
          peakBidMultiplierPercent: 100,
          offPeakHoursRange: '02:00-06:00',
          offPeakBidMultiplierPercent: 100,
          currency: 'JPY',
        },
      ],
      liveFxInverseUsd
    );

    if (
      !cadFx ||
      Math.abs(cadFx.rateToUsd - 5.22 / 7.25) > 0.001 ||
      !jpyInverseFx ||
      Math.abs(jpyInverseFx.rateToUsd - 1 / 150) > 0.0005 ||
      rangeYesterday30.endDate !== '2026-11-24' ||
      windowSalesCheck.fxSource !== 'LINGXING_MCP' ||
      windowSalesCheck.orderCount !== 2 ||
      windowSalesCheck.unitVolume !== 5 ||
      windowSalesCheck.replacementOrderCount !== 1 ||
      windowSalesCheck.replacementUnitCount !== 4 ||
      Math.abs(windowSalesCheck.revenueUsd - 172) > 0.2 ||
      adSummaryCheck.fxSource !== 'LINGXING_MCP' ||
      Math.abs(adSummaryCheck.spendUsd - 100) > 0.5 ||
      Math.abs(adSummaryCheck.salesUsd - 300) > 1 ||
      Math.abs(adSummaryCheck.acosPercent - 33.33) > 0.1
    ) {
      violations.push({
        ruleId: 'ERP-ADV-06',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: 多币种 MCP 汇率换算、换货单排除或订单/销量分列计算异常',
        historicalContext: 'CAD/JPY 销售额与广告费必须经实时汇率折算 USD，换货单默认剔除且订单量(单)与销量(件)严格区分。',
        file: 'src/lib/erpEngine.ts',
        remediation: '检查 normalizeLingxingExchangeRates / calculateLingxingWindowSales / calculateLingxingAdSummary 实现。',
      });
    }
    return violations;
  },
};
