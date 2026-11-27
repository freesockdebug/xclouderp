import {
  AmazonShop,
  AmazonListingItem,
  AmazonListingVariantAttr,
  AmazonOrderItem,
  AmazonOrderLineItem,
  AdCampaignItem,
  AdSearchTermItem,
  SettlementPeriodItem,
  ExchangeRateItem,
  LingxingProfitSummaryItem,
  LocalMaterialSku,
  SupplierProfile,
  BomAssemblyOrder,
  BomComponentItem,
  PurchaseOrder1688,
  PurchaseOrderLineItem,
  WarehouseStockLedger,
  FbaShipmentPlan,
  FbaShipmentLineItem,
  MarketplaceCode,
  CurrencyCode,
  LingxingSyncMode,
  LingxingIncrementalStrategy,
  LingxingDomainWatermark,
} from '../types/erp';

export type LingxingSyncDomain =
  | 'SHOPS'
  | 'LOCAL_SKUS'
  | 'LISTINGS'
  | 'ORDERS'
  | 'SUPPLIERS'
  | 'PURCHASE_ORDERS'
  | 'BOM_ORDERS'
  | 'WAREHOUSE_LEDGERS'
  | 'FBA_SHIPMENTS'
  | 'ADS'
  | 'SEARCH_TERMS'
  | 'SETTLEMENTS'
  | 'EXCHANGE_RATES'
  | 'PROFIT_SUMMARY'
  | 'UNKNOWN';

export interface DiscoveredMcpTool {
  name: string;
  description: string;
  domain: LingxingSyncDomain;
  /** When connected to Lingxing OpenMCP gateway (help/search/action), invokes via tools/call -> action({ toolId, params }) */
  gatewayToolId?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<
      string,
      {
        type?: string;
        description?: string;
        enum?: unknown[];
        default?: unknown;
      }
    >;
    required?: string[];
  };
}

export interface NormalizedLingxingSyncBundle {
  shops: AmazonShop[];
  localSkus: LocalMaterialSku[];
  listings: AmazonListingItem[];
  orders: AmazonOrderItem[];
  suppliers: SupplierProfile[];
  purchaseOrders: PurchaseOrder1688[];
  bomOrders: BomAssemblyOrder[];
  warehouseLedgers: WarehouseStockLedger[];
  fbaShipments: FbaShipmentPlan[];
  adCampaigns: AdCampaignItem[];
  searchTerms: AdSearchTermItem[];
  settlements: SettlementPeriodItem[];
  exchangeRates: ExchangeRateItem[];
  profitSummaries: LingxingProfitSummaryItem[];
  rawCount: number;
  domain: LingxingSyncDomain;
  toolName: string;
}

/**
 * Standard Lingxing OpenMCP Gateway core read tools (all 12 verified against live https://openmcp.lingxing.com/mcp-servers/lingxing-mcp).
 */
export const LINGXING_OPENMCP_CORE_TOOLS: DiscoveredMcpTool[] = [
  {
    name: 'get_my_sids',
    gatewayToolId: 'get_my_sids',
    description: '查询我的店铺列表（获取所有授权亚马逊店铺的 sid、seller_id、站点国家与概念店标识）',
    domain: 'SHOPS',
  },
  {
    name: 'inventory_detail_list',
    gatewayToolId: 'inventory_detail_list',
    description: '查询本地仓 SKU 与即时库存明细（SKU、品名、可用/锁定/次品/待检/在途库存、货值与默认箱规）',
    domain: 'LOCAL_SKUS',
  },
  {
    name: 'erp_listing',
    gatewayToolId: 'erp_listing',
    description: '查询亚马逊 Listing 列表（ASIN/父ASIN/MSKU/FNSKU、缩略图、星级评论、BSR排名、变体属性、FBA分项库存与多周期销量广告）',
    domain: 'LISTINGS',
  },
  {
    name: 'amazon_sales_order_list',
    gatewayToolId: 'amazon_sales_order_list',
    description: '销售订单-查询列表（亚马逊订单号、本地下单时间、发货时限、Prime/B2B/促销/退换标识与 slist 商品明细）',
    domain: 'ORDERS',
  },
  {
    name: 'products_extra_get_supplier_map_list',
    gatewayToolId: 'products_extra_get_supplier_map_list',
    description: '查询本地 ERP 供应商档案目录（supplier_id、供应商编号、名称、默认交货仓与采购员）',
    domain: 'SUPPLIERS',
  },
  {
    name: 'purchase_order_page_list',
    gatewayToolId: 'purchase_order_page_list',
    description: '查询各状态采购单列表（单号、供应商、交货仓、付款/结算/质检方式、item_list 多 SKU 明细与逾期状态）',
    domain: 'PURCHASE_ORDERS',
  },
  {
    name: 'warehouse_processing_order_list',
    gatewayToolId: 'warehouse_processing_order_list',
    description: '查询加工单与拆分单列表（组合商品 BOM 加工单号、成品与子件配比、加工成本与完成时间）',
    domain: 'BOM_ORDERS',
  },
  {
    name: 'batch_inventory_statement_list',
    gatewayToolId: 'batch_inventory_statement_list',
    description: '查询本地仓批次出入库流水（批次号、质检/出入库单号、良品/次品/待检变动与库存成本）',
    domain: 'WAREHOUSE_LEDGERS',
  },
  {
    name: 'get_delivery_order_list',
    gatewayToolId: 'get_delivery_order_list',
    description: '查询 FBA/AWD 发货单与头程物流单列表（发货单号、AWD标识、预估/实付运费、货件号与 products 明细）',
    domain: 'FBA_SHIPMENTS',
  },
  {
    name: 'ad_campaign_report',
    gatewayToolId: 'ad_campaign_report',
    description: '查询广告活动报告（SP/SB/SD、站点币种、竞价策略、CTR/CPC/CVR/ACOS/ROAS、直接间接转化、建议预算与预算余额）',
    domain: 'ADS',
  },
  {
    name: 'ad_campaign_search_term_report',
    gatewayToolId: 'ad_campaign_search_term_report',
    description: '查询广告搜索词报表（客户搜索词、广告组、投放匹配方式、点击/转化/直接间接归因与出价）',
    domain: 'SEARCH_TERMS',
  },
  {
    name: 'settlement_sc_summary_list',
    gatewayToolId: 'settlement_sc_summary_list',
    description: '结算中心-SC结算汇总列表（站点原币、结算处理/转账状态、收款尾号、销售/费用/仓储/促销/退款与预留金明细）',
    domain: 'SETTLEMENTS',
  },
];

type LooseRecord = Record<string, unknown>;

function str(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  return fallback;
}

function num(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[¥$€£,\s%]/g, '');
    if (!cleaned || cleaned === '--') return fallback;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function pick(rec: LooseRecord, keys: string[]): unknown {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') {
      return rec[k];
    }
  }
  const lowerMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(rec)) {
    if (v !== undefined && v !== null && v !== '') {
      lowerMap.set(k.toLowerCase(), v);
    }
  }
  for (const k of keys) {
    const found = lowerMap.get(k.toLowerCase());
    if (found !== undefined) return found;
  }
  return undefined;
}

function mapMarketplace(raw: unknown): MarketplaceCode {
  const s = str(raw).toUpperCase();
  if (s === 'US' || s === 'USA' || s.includes('美国') || s === 'ATVPDKIKX0DER' || s.endsWith('-US')) return 'US';
  if (s === 'CA' || s === 'CAN' || s.includes('加拿大') || s === 'A2EUQ1WTGCTBG2' || s.endsWith('-CA')) return 'CA';
  if (s === 'MX' || s === 'MEX' || s.includes('墨西哥') || s === 'A1AM78C64UM0Y8' || s.endsWith('-MX')) return 'MX';
  if (s === 'BR' || s === 'BRA' || s.includes('巴西') || s === 'A2Q3Y263D00KWC' || s.endsWith('-BR')) return 'BR';
  if (s === 'UK' || s === 'GB' || s.includes('英国') || s === 'A1F83G8C2ARO7P' || s.endsWith('-UK')) return 'UK';
  if (s === 'JP' || s === 'JPN' || s.includes('日本') || s === 'A1VC38T7YXB528' || s.endsWith('-JP')) return 'JP';
  if (s === 'AU' || s === 'AUS' || s.includes('澳') || s === 'A39IBJ37TRP1C6' || s.endsWith('-AU')) return 'AU';
  if (s === 'FR' || s.includes('法') || s === 'A13V1IB3VIYZZH') return 'FR';
  if (s === 'IT' || s.includes('意') || s === 'APJ6JRA9NG5V4') return 'IT';
  if (s === 'ES' || s.includes('西') || s === 'A1RKKUPIHCS9HS') return 'ES';
  if (s === 'DE' || s === 'EU' || s.includes('德') || s === 'A1PA6795UKMFR9') return 'DE';
  return 'US';
}

function mapRegionFromMarketplace(mp: MarketplaceCode): 'NA' | 'SA' | 'EU' | 'FE' {
  if (mp === 'JP' || mp === 'AU') return 'FE';
  if (mp === 'UK' || mp === 'DE' || mp === 'FR' || mp === 'IT' || mp === 'ES') return 'EU';
  if (mp === 'BR') return 'SA';
  return 'NA';
}

function mapCurrencyFromMarketplace(
  mp: MarketplaceCode,
  rawCurrency?: unknown
): CurrencyCode {
  const c = str(rawCurrency).toUpperCase();
  if (
    c === 'USD' ||
    c === 'CAD' ||
    c === 'MXN' ||
    c === 'BRL' ||
    c === 'GBP' ||
    c === 'EUR' ||
    c === 'JPY' ||
    c === 'AUD' ||
    c === 'CNY'
  ) {
    return c;
  }
  if (mp === 'CA') return 'CAD';
  if (mp === 'MX') return 'MXN';
  if (mp === 'BR') return 'BRL';
  if (mp === 'UK') return 'GBP';
  if (mp === 'DE' || mp === 'FR' || mp === 'IT' || mp === 'ES') return 'EUR';
  if (mp === 'JP') return 'JPY';
  if (mp === 'AU') return 'AUD';
  return 'USD';
}

export function getCurrencyIcon(currency: CurrencyCode, rawIcon?: unknown): string {
  const custom = str(rawIcon);
  if (custom) return custom;
  switch (currency) {
    case 'JPY':
      return 'JP¥';
    case 'CAD':
      return 'CA$';
    case 'MXN':
      return 'Mex$';
    case 'BRL':
      return 'R$';
    case 'GBP':
      return '£';
    case 'EUR':
      return '€';
    case 'AUD':
      return 'A$';
    case 'CNY':
      return '¥';
    default:
      return '$';
  }
}

function mapListingCurrency(mp: MarketplaceCode, rawCurrency?: unknown): CurrencyCode {
  return mapCurrencyFromMarketplace(mp, rawCurrency);
}

function safeIdPart(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'unknown';
}

function shortStableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export const DEFAULT_ORDER_SYNC_DAYS = 90;
export const ORDER_SYNC_DAY_OPTIONS = [31, 90, 180, 365] as const;
export const DEFAULT_ORDER_INCREMENTAL_LOOKBACK_DAYS = 7;
export const DEFAULT_UPDATE_TIME_OVERLAP_DAYS = 1;
export const NATIVE_UPDATE_TIME_TOOL_IDS = [
  'batch_inventory_statement_list',
  'get_delivery_order_list',
  'warehouse_processing_order_list',
] as const;

export interface DateWindowChunk {
  startDate: string;
  endDate: string;
  label: string;
}

/**
 * Splits a multi-month order lookback range (e.g. 90 / 180 / 365 days) into newest-first
 * 30-day contiguous chunks so Lingxing API per-request date-span limits and deep-page caps never clip data.
 */
export function buildDateWindowChunks(params: {
  totalDays: number;
  chunkDays?: number;
  includeTomorrow?: boolean;
  nowDate?: Date;
}): DateWindowChunk[] {
  const safeTotalDays = Math.max(1, Math.min(730, Math.round(params.totalDays || DEFAULT_ORDER_SYNC_DAYS)));
  const safeChunkDays = Math.max(7, Math.min(90, Math.round(params.chunkDays || 30)));
  const now = params.nowDate && !Number.isNaN(params.nowDate.getTime()) ? params.nowDate : new Date();
  const baseUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const fmtOffset = (offsetDays: number) =>
    new Date(baseUtcDay + offsetDays * 86400000).toISOString().slice(0, 10);

  const chunks: DateWindowChunk[] = [];
  const endOffsetTop = params.includeTomorrow !== false ? 1 : 0;
  let cursorEndOffset = endOffsetTop;
  const earliestOffset = -safeTotalDays;

  while (cursorEndOffset >= earliestOffset) {
    const isFirst = chunks.length === 0;
    const span = isFirst && params.includeTomorrow !== false ? safeChunkDays : safeChunkDays - 1;
    const chunkStartOffset = Math.max(earliestOffset, cursorEndOffset - span);
    const startDate = fmtOffset(chunkStartOffset);
    const endDate = fmtOffset(cursorEndOffset);
    chunks.push({
      startDate,
      endDate,
      label: `${startDate} ~ ${endDate}`,
    });
    if (chunkStartOffset <= earliestOffset) break;
    cursorEndOffset = chunkStartOffset - 1;
  }

  return chunks;
}

/**
 * Detects whether a tools/list response represents the official Lingxing OpenMCP gateway
 * (exposing meta-tools: help, search, action, approval_status).
 */
export function isLingxingOpenMcpGateway(tools: Array<{ name?: string }>): boolean {
  const names = new Set(tools.map((t) => String(t.name || '').toLowerCase()));
  return names.has('help') && names.has('search') && names.has('action');
}

/**
 * Classifies a real Lingxing MCP tool into an X Cloud ERP sync domain using its name & description.
 */
export function classifyLingxingToolDomain(tool: {
  name?: string;
  description?: string;
  domain?: string;
}): LingxingSyncDomain {
  const explicit = str(tool.domain).toUpperCase();
  if (explicit === 'SHOPS') return 'SHOPS';
  if (explicit === 'LISTINGS' || explicit === 'FBA_INVENTORY') return 'LISTINGS';
  if (explicit === 'ORDERS') return 'ORDERS';
  if (explicit === 'ADS' || explicit === 'ADS_REPORTS') return 'ADS';
  if (explicit === 'SETTLEMENTS' || explicit === 'PROFIT_LEDGER') return 'SETTLEMENTS';
  if (explicit === 'EXCHANGE_RATES' || explicit === 'CURRENCY') return 'EXCHANGE_RATES';
  if (explicit === 'PROFIT_SUMMARY') return 'PROFIT_SUMMARY';

  const text = `${tool.name || ''} ${tool.description || ''}`.toLowerCase();

  if (text.includes('get_my_sids')) return 'SHOPS';
  if (text.includes('erp_listing')) return 'LISTINGS';
  if (text.includes('amazon_sales_order_list')) return 'ORDERS';
  if (text.includes('ad_campaign_report')) return 'ADS';
  if (text.includes('settlement_sc_summary_list')) return 'SETTLEMENTS';
  if (/(currency_month|currencymonth|exchange_rate|currency_rate|currency_list|汇率|币种汇率|币别)/.test(text)) {
    return 'EXCHANGE_RATES';
  }
  if (/(profit_stat|profit_report|profit_summary|store_profit|msku_profit|settlement_profit|利润统计|结算毛利润|利润报表)/.test(text)) {
    return 'PROFIT_SUMMARY';
  }

  if (
    /(order|orders|订单)/.test(text) &&
    !/(purchase|采购|fba_shipment|货件|return_order_stat)/.test(text)
  ) {
    return 'ORDERS';
  }
  if (
    /(seller_list|shop_list|store_list|marketplace|get_seller|seller_shops|店铺列表|查询店铺|授权店铺|获取店铺)/.test(
      text
    ) ||
    (/\b(shop|shops|seller|sellers|store|stores)\b/.test(text) &&
      !/(asin|listing|order|ad|campaign|profit|inventory|stock|sku)/.test(text))
  ) {
    return 'SHOPS';
  }
  if (/(campaign|ads|advertising|sponsored|acos|roas|广告活动|广告报表|广告)/.test(text)) {
    return 'ADS';
  }
  if (/(settlement|payout|reconcile|finance|profit|结算|回款|财务|利润报表)/.test(text)) {
    return 'SETTLEMENTS';
  }
  if (
    /(listing|asin|msku|fnsku|fba_inventory|inventory|stock|product|sales|商品|库存|销量|产品表现)/.test(
      text
    )
  ) {
    return 'LISTINGS';
  }

  return 'UNKNOWN';
}

/**
 * Builds exact Lingxing OpenMCP or generic MCP tool arguments.
 */
export function buildDefaultArgsForTool(
  tool: DiscoveredMcpTool,
  existingShops: AmazonShop[] = [],
  adProfileIds: string[] = []
): Record<string, unknown> {
  const now = new Date();
  const start29 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  const start31 = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const start90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const startDateStr = fmtDate(start29);
  const orderStartDateStr = fmtDate(start31);
  const start90Str = fmtDate(start90);
  const endDateStr = fmtDate(now);
  const yearMonthStr = endDateStr.slice(0, 7);
  // Use UTC + 1 day for orders endDate and UTC - 31 days for startDate so timezone shifts never clip 30d windows
  const orderEndDateStr = fmtDate(tomorrow);

  const tid = (tool.gatewayToolId || tool.name).toLowerCase();

  // Exact verified parameter contracts for official Lingxing OpenMCP core read tools
  if (
    tid === 'get_my_sids' ||
    tid === 'ad_auth_shops' ||
    tid === 'products_extra_get_supplier_map_list'
  ) {
    return {};
  }
  if (tid === 'inventory_detail_list') {
    return {
      offset: 0,
      length: 200,
    };
  }
  if (tid === 'erp_listing') {
    return {
      offset: 0,
      length: 200,
      pvi_ids: '',
      sort_field: 'thirty_volume',
      sort_type: 'desc',
    };
  }
  if (tid === 'amazon_sales_order_list') {
    return {
      pageNo: 1,
      pageSize: 200,
      isMcfOrder: '0',
      startDate: orderStartDateStr,
      endDate: orderEndDateStr,
      sortField: 'purchaseDateLocal',
      sortType: 'desc',
    };
  }
  if (tid === 'purchase_order_page_list') {
    return {
      offset: 0,
      length: 100,
    };
  }
  if (tid === 'warehouse_processing_order_list') {
    return {
      offset: 0,
      length: 100,
    };
  }
  if (tid === 'batch_inventory_statement_list') {
    return {
      offset: 0,
      length: 200,
      start_date: start90Str,
      end_date: endDateStr,
    };
  }
  if (tid === 'get_delivery_order_list') {
    return {
      offset: 0,
      length: 100,
    };
  }
  if (tid === 'ad_campaign_report') {
    return {
      report_date: `${startDateStr} - ${endDateStr}`,
      profile_ids: adProfileIds,
      page: 1,
      length: 100,
      sort_field: 'spends',
      sort_type: 'desc',
    };
  }
  if (tid === 'ad_campaign_search_term_report') {
    return {
      report_date: `${startDateStr} - ${endDateStr}`,
      profile_ids: adProfileIds,
      page: 1,
      length: 100,
      sort_field: 'spends',
      sort_type: 'desc',
    };
  }
  if (tid === 'settlement_sc_summary_list') {
    return {
      offset: 0,
      length: 100,
      startDate: startDateStr,
      endDate: endDateStr,
    };
  }

  const props = tool.inputSchema?.properties;
  if (!props || typeof props !== 'object') {
    if (tool.domain === 'EXCHANGE_RATES') {
      return { date: yearMonthStr };
    }
    if (tool.domain === 'PROFIT_SUMMARY') {
      return {
        startDate: startDateStr,
        endDate: endDateStr,
        currencyCode: 'USD',
        offset: 0,
        length: 100,
      };
    }
    return {};
  }

  const numericSids = existingShops
    .map((s) => {
      if (typeof s.sid === 'number' && Number.isFinite(s.sid) && s.sid > 0) return s.sid;
      const m = /(\d+)$/.exec(s.id) || /(\d+)$/.exec(s.sellerId);
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n !== null && Number.isFinite(n));

  const requiredSet = new Set(tool.inputSchema?.required || []);
  const args: Record<string, unknown> = {};

  for (const [key, schema] of Object.entries(props)) {
    const lk = key.toLowerCase();
    const t = schema?.type;

    if (schema?.default !== undefined) {
      args[key] = schema.default;
      continue;
    }

    if (lk === 'date' || lk === 'month' || lk === 'year_month' || lk === 'rate_date') {
      const desc = String(schema?.description || '');
      args[key] =
        tool.domain === 'EXCHANGE_RATES' || /yyyy-mm|月/i.test(desc)
          ? yearMonthStr
          : endDateStr;
      continue;
    }
    if (/(start_date|startdate|begin_date|begindate|date_from|from_date)/.test(lk)) {
      args[key] = startDateStr;
      continue;
    }
    if (/(end_date|enddate|date_to|to_date)/.test(lk)) {
      args[key] = endDateStr;
      continue;
    }
    if (lk === 'report_date') {
      args[key] = `${startDateStr} - ${endDateStr}`;
      continue;
    }
    if (lk === 'currency_code' || lk === 'currencycode' || lk === 'currency') {
      if (tool.domain === 'PROFIT_SUMMARY') {
        args[key] = 'USD';
        continue;
      }
    }
    if (lk === 'days' || lk === 'day_range' || lk === 'period_days') {
      args[key] = 30;
      continue;
    }
    if (lk === 'offset') {
      args[key] = 0;
      continue;
    }
    if (lk === 'page' || lk === 'pagenum' || lk === 'page_num' || lk === 'page_no' || lk === 'pageno') {
      args[key] = 1;
      continue;
    }
    if (lk === 'length' || lk === 'limit' || lk === 'pagesize' || lk === 'page_size') {
      args[key] = 100;
      continue;
    }
    if (lk === 'pvi_ids' && requiredSet.has(key)) {
      args[key] = '';
      continue;
    }
    if ((lk === 'sid' || lk === 'shop_id') && numericSids.length > 0) {
      if (t === 'array') {
        args[key] = numericSids;
      } else if (requiredSet.has(key)) {
        args[key] = t === 'integer' || t === 'number' ? numericSids[0] : String(numericSids[0]);
      }
      continue;
    }
    if ((lk === 'sids' || lk === 'sid_list' || lk === 'shop_ids') && numericSids.length > 0) {
      args[key] = t === 'string' ? numericSids.join(',') : numericSids;
      continue;
    }
    if (lk === 'profile_ids' && adProfileIds.length > 0) {
      args[key] = adProfileIds;
      continue;
    }
    if (requiredSet.has(key) && Array.isArray(schema?.enum) && schema.enum.length > 0) {
      args[key] = schema.enum[0];
    }
  }

  return args;
}

function tryParseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // continue
      }
    }
    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');
    const startIdx =
      firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace)
        ? firstBracket
        : firstBrace;
    if (startIdx >= 0) {
      const openChar = trimmed[startIdx];
      const closeChar = openChar === '[' ? ']' : '}';
      const endIdx = trimmed.lastIndexOf(closeChar);
      if (endIdx > startIdx) {
        try {
          return JSON.parse(trimmed.slice(startIdx, endIdx + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function findRecordArrays(node: unknown, depth = 0): LooseRecord[] {
  if (depth > 8 || node === null || node === undefined) return [];

  if (typeof node === 'string') {
    const parsed = tryParseJsonFromText(node);
    return parsed ? findRecordArrays(parsed, depth + 1) : [];
  }

  if (Array.isArray(node)) {
    const objectItems = node.filter(
      (item): item is LooseRecord =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
    );
    if (
      objectItems.length > 0 &&
      objectItems.every((it) => typeof it.type === 'string' && ('text' in it || 'resource' in it))
    ) {
      const extracted: LooseRecord[] = [];
      for (const block of objectItems) {
        if (typeof block.text === 'string') {
          extracted.push(...findRecordArrays(block.text, depth + 1));
        } else if (block.resource && typeof block.resource === 'object') {
          extracted.push(...findRecordArrays(block.resource, depth + 1));
        }
      }
      return extracted;
    }
    return objectItems;
  }

  if (typeof node === 'object') {
    const obj = node as LooseRecord;
    const priorityKeys = [
      'result',
      'structuredContent',
      'content',
      'data',
      'list',
      'records',
      'rows',
      'items',
      'shops',
      'sellers',
      'listings',
      'products',
      'orders',
      'campaigns',
      'settlements',
    ];
    for (const k of priorityKeys) {
      if (obj[k] !== undefined && obj[k] !== null) {
        const nested = findRecordArrays(obj[k], depth + 1);
        if (nested.length > 0) return nested;
      }
    }
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) || (v && typeof v === 'object')) {
        const nested = findRecordArrays(v, depth + 1);
        if (nested.length > 0) return nested;
      }
    }
  }

  return [];
}

/**
 * Extracts normalized plain-object records from any MCP JSON-RPC 2.0 response payload
 * (including Lingxing OpenMCP double-nested {code:1, data:{data:{data:[...]}}} & {data:{data:{records:[...]}}}).
 */
export function extractRecordsFromMcpResult(responsePayload: unknown): LooseRecord[] {
  return findRecordArrays(responsePayload, 0);
}

function findTotalCount(node: unknown, depth = 0): number | null {
  if (depth > 8 || node === null || node === undefined) return null;
  if (typeof node === 'string') {
    const parsed = tryParseJsonFromText(node);
    return parsed ? findTotalCount(parsed, depth + 1) : null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      if (item && typeof item === 'object' && 'text' in item && typeof (item as LooseRecord).text === 'string') {
        const found = findTotalCount((item as LooseRecord).text, depth + 1);
        if (found !== null) return found;
      }
    }
    return null;
  }
  if (typeof node === 'object') {
    const obj = node as LooseRecord;
    // Check nested wrappers first when outer wrapper only has a status/code, or check direct keys
    const totalKeys = ['total', 'totalCount', 'total_count', 'recordsTotal', 'count'];
    for (const k of totalKeys) {
      const raw = obj[k];
      if (raw !== undefined && raw !== null && raw !== '') {
        const n = num(raw, -1);
        if (n >= 0 && Number.isFinite(n)) return Math.round(n);
      }
    }
    for (const wrapper of ['result', 'structuredContent', 'content', 'data', 'pageInfo', 'pagination']) {
      if (obj[wrapper] !== undefined && obj[wrapper] !== null) {
        const nested = findTotalCount(obj[wrapper], depth + 1);
        if (nested !== null) return nested;
      }
    }
  }
  return null;
}

export function extractTotalCountFromMcpResult(rawResult: unknown): number | null {
  return findTotalCount(rawResult, 0);
}

export interface LingxingToolPaginationSpec {
  mode: 'NONE' | 'OFFSET' | 'PAGE';
  cursorKey: string;
  sizeKey: string;
  pageSize: number;
  maxPages: number;
}

export function getPaginationSpecForTool(tool: DiscoveredMcpTool): LingxingToolPaginationSpec {
  const tid = (tool.gatewayToolId || tool.name).toLowerCase();
  if (
    tid === 'get_my_sids' ||
    tid === 'ad_auth_shops' ||
    tid === 'products_extra_get_supplier_map_list'
  ) {
    return { mode: 'NONE', cursorKey: '', sizeKey: '', pageSize: 500, maxPages: 1 };
  }
  if (tid === 'erp_listing' || tid === 'inventory_detail_list') {
    return { mode: 'OFFSET', cursorKey: 'offset', sizeKey: 'length', pageSize: 200, maxPages: 100 };
  }
  if (tid === 'amazon_sales_order_list') {
    return { mode: 'PAGE', cursorKey: 'pageNo', sizeKey: 'pageSize', pageSize: 200, maxPages: 120 };
  }
  if (tid === 'ad_campaign_report' || tid === 'ad_campaign_search_term_report') {
    return { mode: 'PAGE', cursorKey: 'page', sizeKey: 'length', pageSize: 100, maxPages: 60 };
  }
  if (tid === 'batch_inventory_statement_list') {
    return { mode: 'OFFSET', cursorKey: 'offset', sizeKey: 'length', pageSize: 200, maxPages: 150 };
  }
  if (
    tid === 'purchase_order_page_list' ||
    tid === 'warehouse_processing_order_list' ||
    tid === 'get_delivery_order_list' ||
    tid === 'settlement_sc_summary_list'
  ) {
    return { mode: 'OFFSET', cursorKey: 'offset', sizeKey: 'length', pageSize: 100, maxPages: 80 };
  }

  const props = tool.inputSchema?.properties;
  if (props && typeof props === 'object') {
    const keys = Object.keys(props);
    const offsetKey = keys.find((k) => k.toLowerCase() === 'offset');
    const pageKey = keys.find((k) =>
      ['page', 'pageno', 'page_no', 'pagenum', 'page_num'].includes(k.toLowerCase())
    );
    const sizeKey =
      keys.find((k) => ['length', 'pagesize', 'page_size', 'limit'].includes(k.toLowerCase())) ||
      'length';
    if (offsetKey) {
      return { mode: 'OFFSET', cursorKey: offsetKey, sizeKey, pageSize: 100, maxPages: 80 };
    }
    if (pageKey) {
      return { mode: 'PAGE', cursorKey: pageKey, sizeKey, pageSize: 100, maxPages: 80 };
    }
  }

  return { mode: 'NONE', cursorKey: '', sizeKey: '', pageSize: 200, maxPages: 1 };
}

export function buildPaginatedArgsForTool(
  tool: DiscoveredMcpTool,
  baseArgs: Record<string, unknown>,
  pageIndex: number,
  effectivePageSize?: number
): Record<string, unknown> {
  const spec = getPaginationSpecForTool(tool);
  if (spec.mode === 'NONE') return { ...baseArgs };

  const pageSize = Math.max(
    1,
    effectivePageSize ||
      num(baseArgs[spec.sizeKey], spec.pageSize) ||
      spec.pageSize
  );

  if (spec.mode === 'OFFSET') {
    return {
      ...baseArgs,
      [spec.cursorKey]: pageIndex * pageSize,
      [spec.sizeKey]: pageSize,
    };
  }

  return {
    ...baseArgs,
    [spec.cursorKey]: pageIndex + 1,
    [spec.sizeKey]: pageSize,
  };
}

export function recordSignature(rec: LooseRecord, domain?: LingxingSyncDomain): string {
  // Warehouse batch inventory statements can share msku/sku/order_sn/wh_id across hundreds of
  // chronological movements; build a full movement-event composite key so zero rows ever collapse.
  if (
    domain === 'WAREHOUSE_LEDGERS' ||
    rec.batch_state_id !== undefined ||
    (rec.batch_time !== undefined && rec.balance_num !== undefined)
  ) {
    const parts = [
      str(pick(rec, ['batch_state_id', 'id'])),
      str(pick(rec, ['batch_no'])),
      str(pick(rec, ['order_sn'])),
      str(pick(rec, ['delivery_order_sn'])),
      str(pick(rec, ['wh_id', 'wid', 'warehouse_id'])),
      str(pick(rec, ['sku', 'msku', 'fnsku'])),
      str(pick(rec, ['batch_time', 'purchase_in_time', 'create_time'])),
      str(pick(rec, ['type', 'type_name'])),
      str(pick(rec, ['good_num'])),
      str(pick(rec, ['bad_num'])),
      str(pick(rec, ['qc_num'])),
      str(pick(rec, ['balance_num'])),
      str(pick(rec, ['transit_balance_num'])),
      str(pick(rec, ['stock_cost', 'amount'])),
      str(pick(rec, ['opt_name', 'create_user'])),
    ];
    if (parts.some(Boolean)) {
      return `wh:${parts.join('|')}`;
    }
  }

  // Prioritize unique transaction/entity IDs BEFORE generic product identifiers (asin/msku/sku)
  const primary = pick(rec, [
    'amazon_order_id',
    'amazonOrderId',
    'batch_state_id',
    'settlement_id',
    'settlementId',
    'st_md5',
    'campaign_id',
    'process_sn',
    'shipment_sn',
    'custom_order_sn',
    'order_sn',
    'listing_id',
    'id',
    'asin',
    'msku',
    'seller_sku',
    'sku',
    'sid',
  ]);
  if (primary !== undefined) {
    const secondary = pick(rec, [
      'sid',
      'store_id',
      'storeId',
      'wid',
      'wh_id',
      'warehouse_id',
      'product_id',
      'msku',
      'sku',
      'fnsku',
      'search_term',
      'batch_time',
    ]);
    return `${String(primary)}|${secondary !== undefined ? String(secondary) : ''}`;
  }
  try {
    return JSON.stringify(rec).slice(0, 240);
  } catch {
    return String(Math.random());
  }
}

export interface PaginatedFetchResult {
  records: LooseRecord[];
  pagesFetched: number;
  upstreamTotal: number | null;
  truncatedByCap: boolean;
}

const ABSOLUTE_MAX_PAGES_CEILING = 250;

/**
 * Fetches ALL pages for a Lingxing OpenMCP tool until exhausted, with:
 * - Automatic effectivePageSize calibration when upstream server caps page size (e.g. 100 vs requested 200)
 * - Dynamic maxPages scaling up to 250 pages when upstreamTotal is known (e.g. 6,155+ batch ledgers)
 * - Domain-aware composite record signatures + duplicate-page fingerprint guard so valid rows never collapse
 *   while non-paginated endpoints still terminate safely
 */
export async function collectAllPaginatedRecords(params: {
  tool: DiscoveredMcpTool;
  baseArgs: Record<string, unknown>;
  fetchPage: (
    pageArgs: Record<string, unknown>,
    pageIndex: number
  ) => Promise<{ ok: boolean; payload: unknown; errorMessage?: string }>;
  onPageFetched?: (info: {
    pageNumber: number;
    pageCount: number;
    accumulated: number;
    upstreamTotal: number | null;
  }) => void;
}): Promise<PaginatedFetchResult> {
  const spec = getPaginationSpecForTool(params.tool);
  const allRecords: LooseRecord[] = [];
  const seenSignatures = new Set<string>();
  const seenPageFingerprints = new Set<string>();
  let pagesFetched = 0;
  let upstreamTotal: number | null = null;
  let effectivePageSize = Math.max(
    1,
    num(params.baseArgs[spec.sizeKey], spec.pageSize) || spec.pageSize
  );
  let effectiveMaxPages = spec.maxPages;
  let truncatedByCap = false;

  for (let pageIndex = 0; pageIndex < effectiveMaxPages; pageIndex++) {
    const pageArgs = buildPaginatedArgsForTool(
      params.tool,
      params.baseArgs,
      pageIndex,
      effectivePageSize
    );
    const res = await params.fetchPage(pageArgs, pageIndex);
    if (!res.ok) {
      if (pageIndex === 0) {
        return { records: [], pagesFetched: 0, upstreamTotal: null, truncatedByCap: false };
      }
      break;
    }

    pagesFetched += 1;
    const pageRecords = extractRecordsFromMcpResult(res.payload);
    const pageTotal = extractTotalCountFromMcpResult(res.payload);
    if (pageTotal !== null && (upstreamTotal === null || pageTotal > upstreamTotal)) {
      upstreamTotal = pageTotal;
    }

    if (pageRecords.length === 0) {
      params.onPageFetched?.({
        pageNumber: pageIndex + 1,
        pageCount: 0,
        accumulated: allRecords.length,
        upstreamTotal,
      });
      break;
    }

    // Calibrate server-enforced max page size on page 0 so OFFSET never skips records
    if (
      pageIndex === 0 &&
      spec.mode !== 'NONE' &&
      pageRecords.length < effectivePageSize &&
      upstreamTotal !== null &&
      upstreamTotal > pageRecords.length
    ) {
      effectivePageSize = pageRecords.length;
    }

    // Dynamically extend maxPages when upstreamTotal requires more pages (e.g. 6,155 rows = 62 pages)
    if (spec.mode !== 'NONE' && upstreamTotal !== null && effectivePageSize > 0) {
      const neededPages = Math.ceil(upstreamTotal / effectivePageSize) + 2;
      if (neededPages > effectiveMaxPages) {
        effectiveMaxPages = Math.min(ABSOLUTE_MAX_PAGES_CEILING, neededPages);
      }
    }

    // Compute per-page fingerprint (using occurrence counters for legitimately identical intra-page rows)
    const intraPageCounts = new Map<string, number>();
    const pageKeyList: string[] = [];
    for (const rec of pageRecords) {
      const baseSig = recordSignature(rec, params.tool.domain);
      const occ = (intraPageCounts.get(baseSig) || 0) + 1;
      intraPageCounts.set(baseSig, occ);
      pageKeyList.push(occ > 1 ? `${baseSig}#${occ}` : baseSig);
    }
    const pageFingerprint = shortStableHash(pageKeyList.join('\n'));
    if (pageIndex > 0 && seenPageFingerprints.has(pageFingerprint)) {
      params.onPageFetched?.({
        pageNumber: pageIndex + 1,
        pageCount: pageRecords.length,
        accumulated: allRecords.length,
        upstreamTotal,
      });
      break;
    }
    seenPageFingerprints.add(pageFingerprint);

    let newlyAdded = 0;
    for (let idx = 0; idx < pageRecords.length; idx++) {
      const rec = pageRecords[idx];
      const sig = pageKeyList[idx];
      if (!seenSignatures.has(sig)) {
        seenSignatures.add(sig);
        allRecords.push(rec);
        newlyAdded += 1;
      }
    }

    params.onPageFetched?.({
      pageNumber: pageIndex + 1,
      pageCount: pageRecords.length,
      accumulated: allRecords.length,
      upstreamTotal,
    });

    if (spec.mode === 'NONE') break;
    if (pageIndex > 0 && newlyAdded === 0) break;
    if (upstreamTotal !== null && allRecords.length >= upstreamTotal) break;
    if (pageRecords.length < effectivePageSize) {
      if (upstreamTotal === null || allRecords.length >= upstreamTotal) break;
    }

    if (pageIndex === effectiveMaxPages - 1) {
      truncatedByCap =
        upstreamTotal !== null
          ? allRecords.length < upstreamTotal
          : pageRecords.length >= effectivePageSize;
    }
  }

  return {
    records: allRecords,
    pagesFetched,
    upstreamTotal,
    truncatedByCap,
  };
}

export interface ChunkedDateRangeFetchResult extends PaginatedFetchResult {
  chunksCompleted: number;
  totalChunks: number;
  windowStartDate: string;
  windowEndDate: string;
}

/**
 * Fetches long date ranges (e.g. 90 / 180 / 365 days of amazon_sales_order_list) by slicing
 * the range into 30-day chunks, paginating every chunk to completion, and deduplicating globally.
 */
export async function collectChunkedDateRangeRecords(params: {
  tool: DiscoveredMcpTool;
  baseArgs: Record<string, unknown>;
  totalDays: number;
  chunkDays?: number;
  startDateKey?: string;
  endDateKey?: string;
  includeTomorrow?: boolean;
  nowDate?: Date;
  fetchPage: (
    pageArgs: Record<string, unknown>,
    pageIndex: number
  ) => Promise<{ ok: boolean; payload: unknown; errorMessage?: string }>;
  onChunkStart?: (info: {
    chunkIndex: number;
    totalChunks: number;
    chunk: DateWindowChunk;
  }) => void;
  onPageFetched?: (info: {
    chunkIndex: number;
    totalChunks: number;
    chunk: DateWindowChunk;
    pageNumber: number;
    pageCount: number;
    chunkAccumulated: number;
    chunkUpstreamTotal: number | null;
    totalAccumulated: number;
  }) => void;
}): Promise<ChunkedDateRangeFetchResult> {
  const chunks = buildDateWindowChunks({
    totalDays: params.totalDays,
    chunkDays: params.chunkDays ?? 30,
    includeTomorrow: params.includeTomorrow ?? true,
    nowDate: params.nowDate,
  });

  const startKey = params.startDateKey || 'startDate';
  const endKey = params.endDateKey || 'endDate';
  const mergedRecords: LooseRecord[] = [];
  const globalSeen = new Set<string>();
  let totalPagesFetched = 0;
  let sumUpstreamTotals = 0;
  let hasUpstreamTotal = false;
  let anyTruncated = false;
  let chunksCompleted = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    params.onChunkStart?.({ chunkIndex: i, totalChunks: chunks.length, chunk });

    const chunkBaseArgs: Record<string, unknown> = {
      ...params.baseArgs,
      [startKey]: chunk.startDate,
      [endKey]: chunk.endDate,
    };

    const res = await collectAllPaginatedRecords({
      tool: params.tool,
      baseArgs: chunkBaseArgs,
      fetchPage: params.fetchPage,
      onPageFetched: ({ pageNumber, pageCount, accumulated, upstreamTotal }) => {
        params.onPageFetched?.({
          chunkIndex: i,
          totalChunks: chunks.length,
          chunk,
          pageNumber,
          pageCount,
          chunkAccumulated: accumulated,
          chunkUpstreamTotal: upstreamTotal,
          totalAccumulated: mergedRecords.length + accumulated,
        });
      },
    });

    totalPagesFetched += res.pagesFetched;
    if (res.pagesFetched > 0) {
      chunksCompleted += 1;
    }
    if (res.upstreamTotal !== null) {
      hasUpstreamTotal = true;
      sumUpstreamTotals += res.upstreamTotal;
    }
    if (res.truncatedByCap) {
      anyTruncated = true;
    }

    for (const rec of res.records) {
      const sig = recordSignature(rec, params.tool.domain);
      if (!globalSeen.has(sig)) {
        globalSeen.add(sig);
        mergedRecords.push(rec);
      }
    }
  }

  return {
    records: mergedRecords,
    pagesFetched: totalPagesFetched,
    upstreamTotal: hasUpstreamTotal ? sumUpstreamTotals : null,
    truncatedByCap: anyTruncated,
    chunksCompleted,
    totalChunks: chunks.length,
    windowStartDate: chunks[chunks.length - 1]?.startDate || '',
    windowEndDate: chunks[0]?.endDate || '',
  };
}

export interface PendingOrderRefreshCandidate {
  amazonOrderId: string;
  purchaseDate: string;
}

export interface IncrementalSyncPlan {
  mode: LingxingSyncMode;
  strategy: LingxingIncrementalStrategy;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  effectiveTotalDays?: number;
  argsPatch: Record<string, unknown>;
  /**
   * When true (native update_time incremental sync), caller MUST NOT prune untouched lx-* rows
   * outside the returned delta because only recently updated records are fetched.
   */
  preserveExistingOutsideDelta: boolean;
  pendingOrdersToRefresh: PendingOrderRefreshCandidate[];
  watermarkUsed?: string;
  summary: string;
}

function parseIsoDayStartUtcMs(rawDate?: string): number | null {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (!match) return null;
  const ms = Date.parse(`${match[1]}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function formatUtcDayOffset(baseUtcDayMs: number, offsetDays: number): string {
  return new Date(baseUtcDayMs + offsetDays * 86400000).toISOString().slice(0, 10);
}

/**
 * Resolves the exact hybrid incremental sync strategy for any Lingxing OpenMCP tool:
 * - First sync or empty local domain => automatically upgrades to FULL_SNAPSHOT backfill
 * - `batch_inventory_statement_list`, `get_delivery_order_list`, `warehouse_processing_order_list`
 *   => native `update_time` incremental sync (`time_filter_field`, `time_type="3"`, `search_field_time`)
 *      with `preserveExistingOutsideDelta = true` so unchanged rows are never pruned
 * - `amazon_sales_order_list` => lookback window incremental sync (`watermark - lookbackDays .. tomorrow`)
 *   + targeted batch re-check of older `PENDING` orders via `searchField="amazonOrderId", exactSearch=1`
 */
export function resolveIncrementalSyncPlan(params: {
  tool: DiscoveredMcpTool;
  syncMode: LingxingSyncMode;
  fullOrderSyncDays?: number;
  orderLookbackDays?: number;
  updateTimeOverlapDays?: number;
  domainWatermark?: LingxingDomainWatermark | null;
  tenantLastSyncAt?: string;
  existingDomainCount?: number;
  existingTenantOrders?: Array<Pick<AmazonOrderItem, 'amazonOrderId' | 'orderStatus' | 'purchaseDate'>>;
  nowDate?: Date;
}): IncrementalSyncPlan {
  const tid = (params.tool.gatewayToolId || params.tool.name).toLowerCase();
  const fullOrderDays = Math.max(
    7,
    Math.min(730, Math.round(params.fullOrderSyncDays || DEFAULT_ORDER_SYNC_DAYS))
  );
  const lookbackDays = Math.max(
    1,
    Math.min(30, Math.round(params.orderLookbackDays ?? DEFAULT_ORDER_INCREMENTAL_LOOKBACK_DAYS))
  );
  const overlapDays = Math.max(
    0,
    Math.min(7, Math.round(params.updateTimeOverlapDays ?? DEFAULT_UPDATE_TIME_OVERLAP_DAYS))
  );
  const now = params.nowDate && !Number.isNaN(params.nowDate.getTime()) ? params.nowDate : new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const tomorrowStr = formatUtcDayOffset(todayUtcMs, 1);

  const existingCount = Math.max(0, params.existingDomainCount ?? 0);
  const watermarkRaw = params.domainWatermark?.lastSyncedAt || params.tenantLastSyncAt || '';
  const watermarkMs = parseIsoDayStartUtcMs(watermarkRaw);
  const canUseIncremental =
    params.syncMode === 'INCREMENTAL' && watermarkMs !== null && existingCount > 0;

  // 1. Native `update_time` incremental tools verified against live Lingxing OpenMCP
  if (
    tid === 'batch_inventory_statement_list' ||
    tid === 'get_delivery_order_list' ||
    tid === 'warehouse_processing_order_list'
  ) {
    if (!canUseIncremental || watermarkMs === null) {
      return {
        mode: 'FULL',
        strategy: 'FULL_SNAPSHOT',
        argsPatch: {},
        preserveExistingOutsideDelta: false,
        pendingOrdersToRefresh: [],
        summary:
          params.syncMode === 'INCREMENTAL'
            ? '首次同步或本地为空，自动执行全量初始化拉取'
            : '全量拉取模式',
      };
    }

    const startMs = Math.min(todayUtcMs, watermarkMs - overlapDays * 86400000);
    const startStr = new Date(startMs).toISOString().slice(0, 10);
    const argsPatch: Record<string, unknown> =
      tid === 'batch_inventory_statement_list'
        ? {
            time_filter_field: 'update_time',
            start_date: startStr,
            end_date: tomorrowStr,
          }
        : tid === 'get_delivery_order_list'
          ? {
              time_type: '3',
              start_date: startStr,
              end_date: tomorrowStr,
              sort_field: 'update_time',
              sort_type: 'desc',
            }
          : {
              search_field_time: 'update_time',
              start_date: startStr,
              end_date: tomorrowStr,
            };

    return {
      mode: 'INCREMENTAL',
      strategy: 'UPDATE_TIME_INCREMENTAL',
      effectiveStartDate: startStr,
      effectiveEndDate: tomorrowStr,
      argsPatch,
      preserveExistingOutsideDelta: true,
      pendingOrdersToRefresh: [],
      watermarkUsed: watermarkRaw,
      summary: `原生 update_time 增量 (${startStr} ~ ${tomorrowStr})`,
    };
  }

  // 2. Amazon Sales Orders (amazon_sales_order_list) — lookback window + older PENDING targeted refresh
  if (params.tool.domain === 'ORDERS' || tid === 'amazon_sales_order_list') {
    if (!canUseIncremental || watermarkMs === null) {
      const startStr = formatUtcDayOffset(todayUtcMs, -fullOrderDays);
      return {
        mode: 'FULL',
        strategy: 'FULL_SNAPSHOT',
        effectiveStartDate: startStr,
        effectiveEndDate: tomorrowStr,
        effectiveTotalDays: fullOrderDays,
        argsPatch: {},
        preserveExistingOutsideDelta: false,
        pendingOrdersToRefresh: [],
        summary:
          params.syncMode === 'INCREMENTAL'
            ? `首次同步或本地无订单，自动全量回溯近 ${fullOrderDays} 天`
            : `全量分段回溯近 ${fullOrderDays} 天`,
      };
    }

    const daysSinceWatermark = Math.max(0, Math.ceil((todayUtcMs - watermarkMs) / 86400000));
    const effectiveTotalDays = Math.min(
      fullOrderDays,
      Math.max(lookbackDays, daysSinceWatermark + lookbackDays)
    );
    const effectiveStartDate = formatUtcDayOffset(todayUtcMs, -effectiveTotalDays);

    // Collect older PENDING Amazon orders outside the lookback window so their Shipped/Canceled status stays fresh
    const seenPending = new Set<string>();
    const pendingOrdersToRefresh: PendingOrderRefreshCandidate[] = [];
    for (const ord of params.existingTenantOrders || []) {
      if (ord.orderStatus !== 'PENDING') continue;
      const oid = (ord.amazonOrderId || '').trim();
      if (!oid || /^MCF-/i.test(oid) || seenPending.has(oid)) continue;
      const pDay = (ord.purchaseDate || '').trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(pDay) && pDay < effectiveStartDate) {
        seenPending.add(oid);
        pendingOrdersToRefresh.push({ amazonOrderId: oid, purchaseDate: pDay });
        if (pendingOrdersToRefresh.length >= 200) break;
      }
    }

    return {
      mode: 'INCREMENTAL',
      strategy: 'LOOKBACK_WINDOW_INCREMENTAL',
      effectiveStartDate,
      effectiveEndDate: tomorrowStr,
      effectiveTotalDays,
      argsPatch: {},
      preserveExistingOutsideDelta: false,
      pendingOrdersToRefresh,
      watermarkUsed: watermarkRaw,
      summary: `订单回溯增量 近 ${effectiveTotalDays} 天 (${effectiveStartDate} ~ ${tomorrowStr})${
        pendingOrdersToRefresh.length > 0
          ? ` + 复查 ${pendingOrdersToRefresh.length} 笔历史 PENDING 单`
          : ''
      }`,
    };
  }

  return {
    mode: params.syncMode,
    strategy: 'FULL_SNAPSHOT',
    argsPatch: {},
    preserveExistingOutsideDelta: false,
    pendingOrdersToRefresh: [],
    summary: '全量快照同步',
  };
}

export interface PendingOrderRefreshResult {
  records: LooseRecord[];
  pagesFetched: number;
  checkedCount: number;
}

/**
 * Queries Lingxing `amazon_sales_order_list` in exact-match batches (50 order IDs per call)
 * to refresh historical PENDING orders older than the incremental lookback window.
 */
export async function collectPendingOrderRefreshRecords(params: {
  tool: DiscoveredMcpTool;
  baseArgs: Record<string, unknown>;
  pendingOrders: PendingOrderRefreshCandidate[];
  batchSize?: number;
  nowDate?: Date;
  fetchPage: (
    pageArgs: Record<string, unknown>,
    pageIndex: number
  ) => Promise<{ ok: boolean; payload: unknown; errorMessage?: string }>;
}): Promise<PendingOrderRefreshResult> {
  if (!params.pendingOrders || params.pendingOrders.length === 0) {
    return { records: [], pagesFetched: 0, checkedCount: 0 };
  }

  const batchSize = Math.max(1, Math.min(50, Math.round(params.batchSize || 50)));
  const now = params.nowDate && !Number.isNaN(params.nowDate.getTime()) ? params.nowDate : new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const earliestAllowedMs = todayUtcMs - 365 * 86400000;
  const endDate = formatUtcDayOffset(todayUtcMs, 1);

  const merged: LooseRecord[] = [];
  const seen = new Set<string>();
  let pagesFetched = 0;

  for (let i = 0; i < params.pendingOrders.length; i += batchSize) {
    const batch = params.pendingOrders.slice(i, i + batchSize);
    let minMs: number | null = null;
    for (const item of batch) {
      const ms = parseIsoDayStartUtcMs(item.purchaseDate);
      if (ms !== null && (minMs === null || ms < minMs)) {
        minMs = ms;
      }
    }
    const effectiveMinMs = minMs ?? todayUtcMs - 90 * 86400000;
    const startMs = Math.max(earliestAllowedMs, effectiveMinMs - 2 * 86400000);
    const startDate = new Date(startMs).toISOString().slice(0, 10);

    const queryArgs: Record<string, unknown> = {
      ...params.baseArgs,
      pageNo: 1,
      pageSize: 200,
      isMcfOrder: '0',
      startDate,
      endDate,
      searchField: 'amazonOrderId',
      exactSearch: 1,
      searchValue: batch.map((b) => b.amazonOrderId).join(','),
    };

    const res = await params.fetchPage(queryArgs, Math.floor(i / batchSize));
    if (!res.ok) continue;
    pagesFetched += 1;
    const rows = extractRecordsFromMcpResult(res.payload);
    for (const rec of rows) {
      const sig = recordSignature(rec, 'ORDERS');
      if (!seen.has(sig)) {
        seen.add(sig);
        merged.push(rec);
      }
    }
  }

  return {
    records: merged,
    pagesFetched,
    checkedCount: params.pendingOrders.length,
  };
}

/**
 * Normalizes Lingxing MCP shop/seller records (get_my_sids) into X Cloud ERP AmazonShop entities.
 */
export function normalizeLingxingShops(
  rawRecords: LooseRecord[],
  tenantId: string
): AmazonShop[] {
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const out: AmazonShop[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawRecords.length; i++) {
    const r = rawRecords[i];
    const sid = str(pick(r, ['id', 'sid', 'shop_id', 'shopId']));
    const shopName = str(
      pick(r, ['name', 'shop_name', 'shopName', 'seller_name', 'sellerName', 'account_name', 'store_name', 'alias']),
      sid ? `Shop-${sid}` : ''
    );
    if (!sid && !shopName) continue;

    const mp = mapMarketplace(
      pick(r, ['country_code', 'countryCode', 'country', 'marketplace', 'marketplace_code', 'marketplace_id', 'region'])
    );
    const id = `lx-shop-${safeIdPart(tenantId)}-${safeIdPart(sid || `${shopName}-${mp}-${i}`)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const rawStatus = str(pick(r, ['status', 'is_sync', 'sync_status'])).toUpperCase();
    const status: AmazonShop['status'] =
      rawStatus === '0' || rawStatus === 'PAUSED' || rawStatus === 'STOPPED' || rawStatus === 'DISABLED'
        ? 'PAUSED'
        : rawStatus === 'ERROR' || rawStatus === 'AUTH_ERROR'
        ? 'ERROR'
        : 'CONNECTED';

    const sidNum = num(pick(r, ['id', 'sid']), 0);
    out.push({
      id,
      tenantId,
      shopName,
      sellerId: str(pick(r, ['seller_id', 'seller_account_id', 'sellerId', 'sid', 'id']), sid || id),
      marketplace: mp,
      region: mapRegionFromMarketplace(mp),
      currency: mapCurrencyFromMarketplace(mp, pick(r, ['currency', 'currency_code'])),
      syncSource: 'LINGXING_MCP',
      status,
      lastSyncedAt: nowStr,
      sid: sidNum > 0 ? sidNum : undefined,
      countryName: str(pick(r, ['country', 'country_name'])) || undefined,
      isConcept: num(r.is_concept, 0) === 1,
    });
  }

  return out;
}

function buildShopLookup(existingShops: AmazonShop[], tenantId: string) {
  const bySid = new Map<string, AmazonShop>();
  const byName = new Map<string, AmazonShop>();
  for (const s of existingShops) {
    if (s.tenantId !== tenantId) continue;
    bySid.set(s.id, s);
    bySid.set(s.sellerId, s);
    const sidMatch = /(\d+)$/.exec(s.id);
    if (sidMatch) bySid.set(sidMatch[1], s);
    byName.set(s.shopName.toLowerCase(), s);
  }
  return { bySid, byName };
}

/**
 * Normalizes Lingxing MCP listing / ASIN / FBA inventory records (erp_listing) into AmazonListingItem entities.
 */
export function normalizeLingxingListings(
  rawRecords: LooseRecord[],
  tenantId: string,
  existingShops: AmazonShop[],
  existingListings: AmazonListingItem[]
): AmazonListingItem[] {
  const { bySid: shopBySid, byName: shopByName } = buildShopLookup(existingShops, tenantId);

  const existingByKey = new Map<string, AmazonListingItem>();
  for (const l of existingListings) {
    if (l.tenantId !== tenantId) continue;
    existingByKey.set(`${l.shopId}::${l.marketplace}::${(l.msku || l.asin).toLowerCase()}`, l);
    existingByKey.set(`${l.marketplace}::${(l.msku || l.asin).toLowerCase()}`, l);
    if (l.asin) {
      existingByKey.set(`${l.shopId}::${l.marketplace}::asin::${l.asin.toLowerCase()}`, l);
      existingByKey.set(`${l.marketplace}::asin::${l.asin.toLowerCase()}`, l);
    }
  }

  const outMap = new Map<string, AmazonListingItem>();

  for (let i = 0; i < rawRecords.length; i++) {
    const r = rawRecords[i];
    const asin = str(pick(r, ['asin', 'child_asin', 'parent_asin', 'ASIN']));
    const msku = str(pick(r, ['msku', 'seller_sku', 'sellerSku', 'sku', 'MSKU']), asin);
    if (!asin && !msku) continue;

    const rawSid = str(pick(r, ['store_id', 'sid', 'shop_id', 'shopId', 'seller_id']));
    const rawShopName = str(pick(r, ['seller_name', 'shop_name', 'shopName', 'sellerName', 'store_name']));
    const matchedShop =
      (rawSid && shopBySid.get(rawSid)) ||
      (rawShopName && shopByName.get(rawShopName.toLowerCase())) ||
      existingShops.find((s) => s.tenantId === tenantId);

    const mp = mapMarketplace(
      pick(r, ['marketplace_id', 'marketplace', 'country_code', 'country', 'countryCode']) ||
        matchedShop?.marketplace ||
        'US'
    );
    const resolvedShopId =
      matchedShop?.id ||
      (rawSid ? `lx-shop-${safeIdPart(tenantId)}-${safeIdPart(rawSid)}` : `lx-shop-${safeIdPart(tenantId)}-${mp}`);
    const key = `${resolvedShopId}::${mp}::${(msku || asin).toLowerCase()}`;
    const prev =
      outMap.get(key) ||
      existingByKey.get(key) ||
      existingByKey.get(`${mp}::${(msku || asin).toLowerCase()}`) ||
      (asin ? existingByKey.get(`${resolvedShopId}::${mp}::asin::${asin.toLowerCase()}`) : undefined);

    const shopId = matchedShop?.id || prev?.shopId || resolvedShopId;
    const shopName = rawShopName || matchedShop?.shopName || prev?.shopName || `Lingxing-${mp}`;

    const id =
      prev?.id || `lx-lst-${safeIdPart(tenantId)}-${safeIdPart(rawSid || mp)}-${safeIdPart(msku || asin || String(i))}`;

    const orders30dRaw = pick(r, [
      'thirty_volume',
      'orders_30d',
      'orders30d',
      'volume',
      'sales_volume',
      'order_count',
      'units_ordered',
    ]);
    const orders30d =
      orders30dRaw !== undefined ? Math.max(0, Math.round(num(orders30dRaw))) : prev?.orders30d || 0;

    const daily7dRaw = pick(r, [
      'average_seven_volume',
      'daily_sales_7d',
      'dailySales7d',
      'dailyUnits7dAvg',
      'avg_daily_sales_7d',
    ]);
    const daily30dRaw = pick(r, [
      'average_thirty_volume',
      'daily_sales_30d',
      'dailySales30d',
      'avg_daily_sales_30d',
      'avg_daily_sales',
    ]);
    const dailySales30d =
      daily30dRaw !== undefined
        ? Math.max(0, Number(num(daily30dRaw).toFixed(2)))
        : orders30dRaw !== undefined
        ? Number((orders30d / 30).toFixed(2))
        : prev?.dailySales30d || 0;
    const dailySales7d =
      daily7dRaw !== undefined
        ? Math.max(0, Number(num(daily7dRaw).toFixed(2)))
        : prev?.dailySales7d || dailySales30d;

    const priceRaw = pick(r, ['price', 'listing_price', 'landed_price', 'regular_price', 'price_orig']);
    const priceOrig = priceRaw !== undefined ? Math.max(0, num(priceRaw)) : prev?.priceOrig || 0;

    const revRaw = pick(r, [
      'thirty_amount',
      'revenue_30d_usd',
      'revenue30dUsd',
      'revenue_30d',
      'amount',
      'sales_amount',
      'total_sales',
    ]);
    const revenue30dUsd =
      revRaw !== undefined
        ? Math.max(0, num(revRaw))
        : prev?.revenue30dUsd || Number((priceOrig * orders30d).toFixed(2));

    const fbaAvailRaw = pick(r, [
      'afn_fulfillable_quantity',
      'fba_available',
      'fbaAvailable',
      'available_qty',
      'fulfillable_quantity',
    ]);
    const inboundShipped = num(pick(r, ['afn_inbound_shipped_quantity']), 0);
    const inboundReceiving = num(pick(r, ['afn_inbound_receiving_quantity']), 0);
    const inboundWorking = num(pick(r, ['afn_inbound_working_quantity']), 0);
    const hasAfnInboundBreakdown =
      r.afn_inbound_shipped_quantity !== undefined ||
      r.afn_inbound_receiving_quantity !== undefined ||
      r.afn_inbound_working_quantity !== undefined;
    const fbaInboundFallback = pick(r, ['fba_inbound', 'fbaInbound', 'inbound_qty', 'inbound_quantity']);
    const fbaReservedRaw = pick(r, [
      'afn_reserved_quantity',
      'fba_reserved',
      'fbaReserved',
      'reserved_qty',
    ]);

    const fbaAvailable =
      fbaAvailRaw !== undefined ? Math.max(0, Math.round(num(fbaAvailRaw))) : prev?.fbaAvailable || 0;
    const fbaInbound = hasAfnInboundBreakdown
      ? Math.max(0, Math.round(inboundShipped + inboundReceiving + inboundWorking))
      : fbaInboundFallback !== undefined
      ? Math.max(0, Math.round(num(fbaInboundFallback)))
      : prev?.fbaInbound || 0;
    const fbaReserved =
      fbaReservedRaw !== undefined ? Math.max(0, Math.round(num(fbaReservedRaw))) : prev?.fbaReserved || 0;

    const aging0To90Raw = pick(r, ['aging_0_90', 'inv_age_0_to_90_days', 'aging0To90Qty']);
    const aging91To180Raw = pick(r, ['aging_91_180', 'inv_age_91_to_180_days', 'aging91To180Qty']);
    const aging181PlusRaw = pick(r, ['aging_181_plus', 'inv_age_181_to_270_days', 'aging181PlusQty']);

    const aging91To180Qty =
      aging91To180Raw !== undefined ? Math.max(0, Math.round(num(aging91To180Raw))) : prev?.aging91To180Qty || 0;
    const aging181PlusQty =
      aging181PlusRaw !== undefined ? Math.max(0, Math.round(num(aging181PlusRaw))) : prev?.aging181PlusQty || 0;
    const aging0To90Qty =
      aging0To90Raw !== undefined
        ? Math.max(0, Math.round(num(aging0To90Raw)))
        : prev?.aging0To90Qty || Math.max(0, fbaAvailable - aging91To180Qty - aging181PlusQty);

    const adSpendRaw = pick(r, ['thirty_spend', 'ad_spend_30d_usd', 'adSpend30dUsd', 'ad_spend', 'spend']);
    const adSalesRaw = pick(r, ['ad_sales_30d_usd', 'adSales30dUsd', 'ad_sales', 'ad_revenue']);
    const fbaFeeRaw = pick(r, ['fba_fee', 'report_fba_fee', 'fba_fee_per_unit', 'fbaFeePerUnitUsd']);
    const refRateRaw = pick(r, [
      'estimated_referral_fee_rate',
      'referral_fee_rate',
      'referralFeeRate',
      'commission_rate',
    ]);
    const storageRaw = pick(r, ['monthly_storage_fee', 'monthlyStorageFeeUsd', 'storage_fee']);
    const refundRateRaw = pick(r, ['refund_rate', 'refundRatePercent', 'return_rate']);

    const rawStatus = str(pick(r, ['status', 'listing_status', 'listingStatus'])).toUpperCase();
    const statusText = str(pick(r, ['status_text']));
    const listingStatus: AmazonListingItem['listingStatus'] =
      rawStatus === '0' || rawStatus === 'INACTIVE' || rawStatus === 'OFF_SALE' || statusText.includes('停售')
        ? 'INACTIVE'
        : rawStatus === 'SUPPRESSED'
        ? 'SUPPRESSED'
        : 'ACTIVE';

    const parsedRefRate =
      refRateRaw !== undefined
        ? num(refRateRaw) > 1
          ? Number((num(refRateRaw) / 100).toFixed(4))
          : num(refRateRaw)
        : prev?.referralFeeRate ?? 0.15;

    const listingCurrency = mapListingCurrency(
      mp,
      pick(r, ['listing_price_currency_code', 'regular_price_currency_code', 'currency_symbol', 'currency', 'currency_code']) ||
        prev?.currency
    );
    const currencyIcon = getCurrencyIcon(
      listingCurrency,
      pick(r, ['listing_price_currency_icon', 'regular_price_currency_icon', 'icon'])
    );

    // Parse Lingxing variant_text array: [{ attr_name: "size", attr_value: "3-5T" }, ...]
    const variantAttrs: AmazonListingVariantAttr[] = Array.isArray(r.variant_text)
      ? (r.variant_text as LooseRecord[])
          .map((v) => ({
            attrName: str(v.attr_name),
            attrValue: str(v.attr_value),
          }))
          .filter((v) => v.attrName && v.attrValue)
      : prev?.variantAttrs || [];

    // Parse Lingxing small_rank JSON string: "[{\"category\":\"Baby Girls' Crew Socks\",\"rank\":38,...}]"
    let smallCategoryName = prev?.smallCategoryName;
    let smallCategoryRank = prev?.smallCategoryRank;
    if (typeof r.small_rank === 'string' && r.small_rank.trim().startsWith('[')) {
      const parsedSmall = tryParseJsonFromText(r.small_rank);
      if (Array.isArray(parsedSmall) && parsedSmall[0] && typeof parsedSmall[0] === 'object') {
        const sr0 = parsedSmall[0] as LooseRecord;
        smallCategoryName = str(sr0.category) || smallCategoryName;
        const rk = num(sr0.rank, 0);
        if (rk > 0) smallCategoryRank = rk;
      }
    }
    const categoryRankObj =
      r.category_rank && typeof r.category_rank === 'object' ? (r.category_rank as LooseRecord) : null;
    const sellerCategoryArr = Array.isArray(r.seller_category) ? (r.seller_category as unknown[]) : [];
    const sellerCategory =
      str(categoryRankObj?.category) ||
      str(sellerCategoryArr[0]) ||
      str(r.category_text) ||
      prev?.sellerCategory;
    const categoryRankNum = Math.round(num(pick(r, ['rank', 'seller_rank']) ?? categoryRankObj?.rank, 0));

    const merged: AmazonListingItem = {
      id,
      tenantId,
      shopId,
      shopName,
      marketplace: mp,
      asin: asin || prev?.asin || msku,
      msku: msku || prev?.msku || asin,
      fnsku: str(pick(r, ['fnsku', 'FNSKU']), prev?.fnsku || ''),
      title: str(
        pick(r, ['item_name', 'title', 'itemName', 'local_name', 'product_name', 'name']),
        prev?.title || `${asin || msku} (领星同步)`
      ),
      localSkuId: prev?.localSkuId || '',
      localSkuCode: str(
        pick(r, ['local_sku', 'localSkuCode', 'local_sku_code', 'product_sku']),
        prev?.localSkuCode || ''
      ),
      priceOrig,
      currency: listingCurrency,
      dailySales7d,
      dailySales30d,
      orders30d,
      revenue30dUsd,
      fbaAvailable,
      fbaInbound,
      fbaReserved,
      aging0To90Qty,
      aging91To180Qty,
      aging181PlusQty,
      aging90PlusQty: aging91To180Qty + aging181PlusQty,
      referralFeeRate: parsedRefRate,
      fbaFeePerUnitUsd: fbaFeeRaw !== undefined ? Math.max(0, num(fbaFeeRaw)) : prev?.fbaFeePerUnitUsd || 0,
      monthlyStorageFeeUsd:
        storageRaw !== undefined ? Math.max(0, num(storageRaw)) : prev?.monthlyStorageFeeUsd || 0,
      adSpend30dUsd: adSpendRaw !== undefined ? Math.max(0, num(adSpendRaw)) : prev?.adSpend30dUsd || 0,
      adSales30dUsd: adSalesRaw !== undefined ? Math.max(0, num(adSalesRaw)) : prev?.adSales30dUsd || 0,
      refundRatePercent:
        refundRateRaw !== undefined ? Math.max(0, num(refundRateRaw)) : prev?.refundRatePercent || 0,
      buyBoxWinner:
        pick(r, ['is_buybox', 'buy_box_winner', 'buyBoxWinner']) !== undefined
          ? Boolean(pick(r, ['is_buybox', 'buy_box_winner', 'buyBoxWinner']))
          : prev?.buyBoxWinner ?? true,
      hijackerCount: Math.max(
        0,
        Math.round(num(pick(r, ['hijacker_count', 'seller_count', 'offer_count']), prev?.hijackerCount || 0))
      ),
      listingStatus,
      // Lingxing native fields (erp_listing)
      storeId: num(pick(r, ['store_id', 'sid']), 0) || prev?.storeId,
      marketplaceId: str(r.marketplace_id) || prev?.marketplaceId,
      parentAsin: str(r.parent_asin) || prev?.parentAsin,
      localName: str(r.local_name) || prev?.localName,
      smallImageUrl: str(r.small_image_url) || prev?.smallImageUrl,
      asinUrl: str(r.asin_url) || prev?.asinUrl,
      sellerBrand: str(pick(r, ['seller_brand', 'product_brand_text'])) || prev?.sellerBrand,
      sellerCategory,
      categoryRank: categoryRankNum > 0 ? categoryRankNum : prev?.categoryRank,
      smallCategoryName,
      smallCategoryRank,
      stars: num(r.stars, 0) > 0 ? num(r.stars, 0) : prev?.stars,
      reviewsNum: Math.max(0, Math.round(num(r.reviews_num, prev?.reviewsNum || 0))),
      variantAttrs: variantAttrs.length > 0 ? variantAttrs : undefined,
      fulfillmentChannelType: str(r.fulfillment_channel_type) || prev?.fulfillmentChannelType,
      currencyIcon,
      listPrice: num(r.list_price, 0) > 0 ? num(r.list_price, 0) : prev?.listPrice,
      landedPrice: num(r.landed_price, 0) > 0 ? num(r.landed_price, 0) : prev?.landedPrice,
      b2bPrice: num(r.b2b_price, 0) > 0 ? num(r.b2b_price, 0) : prev?.b2bPrice,
      shippingPrice: num(r.shipping, 0),
      referralFeeAmount: num(pick(r, ['referral_fee', 'estimated_referral_fee']), 0),
      statusText: statusText || prev?.statusText,
      isPair: r.is_pair !== undefined ? num(r.is_pair, 0) === 1 : prev?.isPair,
      pairType: str(r.pair_type) || prev?.pairType,
      openDate: str(pick(r, ['open_date', 'open_date_time'])).slice(0, 10) || prev?.openDate,
      firstOrderTime: str(r.first_order_time).slice(0, 10) || prev?.firstOrderTime,
      todayVolume: Math.max(0, Math.round(num(r.today_volume, 0))),
      yesterdayVolume: Math.max(0, Math.round(num(r.yesterday_volume, 0))),
      yesterdayAmount: Math.max(0, num(r.yesterday_amount, 0)),
      sevenAmount: Math.max(0, num(r.seven_amount, 0)),
      fourteenVolume: Math.max(0, Math.round(num(r.fourteen_volume, 0))),
      fourteenAmount: Math.max(0, num(r.fourteen_amount, 0)),
      dailySales14d: Math.max(0, Number(num(r.average_fourteen_volume, 0).toFixed(2))),
      yesterdaySpend: Math.max(0, num(r.yesterday_spend, 0)),
      sevenSpend: Math.max(0, num(r.seven_spend, 0)),
      fourteenSpend: Math.max(0, num(r.fourteen_spend, 0)),
      afnUnsellableQty: Math.max(0, Math.round(num(r.afn_unsellable_quantity, 0))),
      afnInboundWorkingQty: Math.max(0, Math.round(inboundWorking)),
      afnInboundShippedQty: Math.max(0, Math.round(inboundShipped)),
      afnInboundReceivingQty: Math.max(0, Math.round(inboundReceiving)),
      reservedCustomerOrdersQty: Math.max(0, Math.round(num(r.reserved_customerorders, 0))),
      reservedFcTransfersQty: Math.max(0, Math.round(num(r.reserved_fc_transfers, 0))),
      reservedFcProcessingQty: Math.max(0, Math.round(num(r.reserved_fc_processing, 0))),
    };

    outMap.set(key, merged);
  }

  return Array.from(outMap.values());
}

/**
 * Normalizes Lingxing MCP order records (amazon_sales_order_list, including slist[] items) into AmazonOrderItem entities.
 */
export function normalizeLingxingOrders(
  rawRecords: LooseRecord[],
  tenantId: string,
  existingShops: AmazonShop[]
): AmazonOrderItem[] {
  const { bySid: shopBySid, byName: shopByName } = buildShopLookup(existingShops, tenantId);
  const outByOrderId = new Map<string, AmazonOrderItem>();

  for (let i = 0; i < rawRecords.length; i++) {
    const r = rawRecords[i];
    const amazonOrderId = str(
      pick(r, ['amazonOrderId', 'amazon_order_id', 'order_id', 'orderId', 'order_no', 'global_order_no'])
    );
    if (!amazonOrderId) continue;

    // Lingxing amazon_sales_order_list nests items in slist[] (and some tools use item_list[])
    const nestedItems = Array.isArray(r.slist)
      ? (r.slist as LooseRecord[])
      : Array.isArray(r.item_list)
      ? (r.item_list as LooseRecord[])
      : null;
    const firstItem = nestedItems && nestedItems.length > 0 ? nestedItems[0] : null;
    const parsedItems: AmazonOrderLineItem[] = (nestedItems || []).map((it) => ({
      asin: str(pick(it, ['asin', 'ASIN'])),
      sellerSku: str(pick(it, ['sellerSku', 'seller_sku', 'msku'])),
      localSku: str(pick(it, ['sku', 'local_sku'])) || undefined,
      title: str(pick(it, ['title', 'item_name'])),
      productName: str(pick(it, ['productName', 'product_name'])) || undefined,
      quantityOrdered: Math.max(1, Math.round(num(pick(it, ['quantityOrdered', 'quantity_ordered', 'quantity']), 1))),
      picUrl: str(pick(it, ['picUrl', 'pic_url'])) || undefined,
      asinUrl: str(pick(it, ['asinUrl', 'asin_url'])) || undefined,
    }));
    const totalQtyFromSlist = parsedItems.reduce((sum, it) => sum + it.quantityOrdered, 0);

    const asin = str(
      pick(r, ['asin', 'ASIN']) || (firstItem && pick(firstItem, ['asin', 'ASIN'])),
      ''
    );
    const msku = str(
      pick(r, ['msku', 'sellerSku', 'seller_sku', 'sku']) ||
        (firstItem && pick(firstItem, ['sellerSku', 'seller_sku', 'msku', 'sku'])),
      asin
    );

    // Deterministic order-level ID keyed strictly by (tenantId, amazonOrderId) so Pending->Shipped
    // updates or array-index shifts NEVER create duplicate rows in Supabase.
    const id = `lx-ord-${safeIdPart(tenantId)}-${safeIdPart(amazonOrderId)}`;

    const rawSid = str(pick(r, ['sid', 'store_id', 'storeId', 'shop_id', 'shopId', 'seller_id']));
    const rawShopName = str(pick(r, ['sellerName', 'seller_name', 'shop_name', 'shopName', 'store_name']));
    const matchedShop =
      (rawSid && shopBySid.get(rawSid)) ||
      (rawShopName && shopByName.get(rawShopName.toLowerCase())) ||
      existingShops.find((s) => s.tenantId === tenantId);

    const mp = mapMarketplace(
      pick(r, ['marketplace', 'country', 'country_code', 'sales_channel']) ||
        matchedShop?.marketplace ||
        'US'
    );
    const ordCurrency = mapCurrencyFromMarketplace(
      mp,
      pick(r, ['orderTotalCurrencyCode', 'order_total_currency_code', 'currency_code', 'currency']) ||
        matchedShop?.currency
    );
    const currencyIcon = getCurrencyIcon(ordCurrency, r.icon);

    const rawChannel = str(pick(r, ['fulfillmentChannel', 'fulfillment_channel', 'delivery_type'])).toUpperCase();
    const isMcf = num(pick(r, ['isMcfOrder', 'is_mcf_order']), 0) === 1;
    const fulfillmentChannel: AmazonOrderItem['fulfillmentChannel'] = isMcf || rawChannel.includes('MCF')
      ? 'MCF'
      : rawChannel.includes('MFN') || rawChannel === 'FBM'
      ? 'FBM'
      : 'FBA';

    const rawOrderStatusStr = str(pick(r, ['orderStatus', 'order_status', 'status']));
    const rawStatus = rawOrderStatusStr.toUpperCase();
    const isReturn = num(pick(r, ['isReturn', 'isReturnOrder', 'is_return']), 0) === 1;
    // Separate CANCELED (excluded from Lingxing valid order counts) from REFUNDED (shipped then returned)
    const orderStatus: AmazonOrderItem['orderStatus'] = rawStatus.includes('CANCEL')
      ? 'CANCELED'
      : isReturn || rawStatus.includes('REFUND') || rawStatus.includes('RETURN')
      ? 'REFUNDED'
      : rawStatus.includes('PENDING')
      ? 'PENDING'
      : rawStatus.includes('UNSHIPPED')
      ? 'UNSHIPPED'
      : 'SHIPPED';

    const city = str(pick(r, ['ship_city', 'city']));
    const state = str(pick(r, ['ship_state', 'state', 'buyer_region', 'buyerRegion']));
    const country = str(pick(r, ['ship_country', 'buyer_country', 'marketplace', 'country']), mp);
    const buyerRegion = [city, state, country].filter(Boolean).join(', ') || mp;

    const orderAmountUsd = Math.max(
      0,
      num(
        pick(r, ['orderTotalAmount', 'order_total_amount', 'order_amount', 'orderAmountUsd', 'amount']) ||
          (firstItem && pick(firstItem, ['item_price_amount', 'amount']))
      )
    );
    const rowQuantity =
      totalQtyFromSlist > 0
        ? totalQtyFromSlist
        : Math.max(1, Math.round(num(pick(r, ['quantity', 'quantityOrdered', 'quantity_ordered', 'units']), 1)));

    const existing = outByOrderId.get(id);
    if (existing) {
      // If an upstream endpoint returned split rows for the same amazonOrderId, merge line items cleanly
      const mergedItems = [...(existing.items || []), ...parsedItems];
      const hasNewDistinctLine =
        parsedItems.length > 0 &&
        parsedItems.some(
          (ni) =>
            !(existing.items || []).some(
              (ei) => ei.asin === ni.asin && ei.sellerSku === ni.sellerSku
            )
        );
      outByOrderId.set(id, {
        ...existing,
        asin: existing.asin !== 'N/A' ? existing.asin : asin || 'N/A',
        msku: existing.msku !== 'N/A' ? existing.msku : msku || 'N/A',
        quantity: hasNewDistinctLine ? existing.quantity + rowQuantity : Math.max(existing.quantity, rowQuantity),
        orderAmountUsd: Math.max(existing.orderAmountUsd, orderAmountUsd),
        orderStatus: existing.orderStatus === 'CANCELED' || orderStatus === 'CANCELED' ? 'CANCELED' : existing.orderStatus,
        items: mergedItems.length > 0 ? mergedItems : existing.items,
      });
      continue;
    }

    outByOrderId.set(id, {
      id,
      tenantId,
      shopId:
        matchedShop?.id ||
        (rawSid ? `lx-shop-${safeIdPart(tenantId)}-${safeIdPart(rawSid)}` : `lx-shop-${safeIdPart(tenantId)}-${mp}`),
      shopName: rawShopName || matchedShop?.shopName || `Lingxing-${mp}`,
      marketplace: mp,
      amazonOrderId,
      fulfillmentChannel,
      asin: asin || 'N/A',
      msku: msku || 'N/A',
      quantity: rowQuantity,
      orderAmountUsd,
      amazonFeeUsd: Math.max(
        0,
        num(pick(r, ['amazon_fee', 'amazonFeeUsd', 'commission', 'fba_fee', 'platform_fee']))
      ),
      orderStatus,
      purchaseDate: str(
        pick(r, ['purchaseDateLocal', 'purchase_date_local', 'purchaseDate', 'purchase_date', 'order_time']),
        new Date().toISOString().replace('T', ' ').slice(0, 16)
      ),
      buyerRegion,
      returnReason: str(pick(r, ['return_reason', 'returnReason', 'refund_reason'])) || undefined,
      // Lingxing native fields (amazon_sales_order_list)
      sid: num(pick(r, ['sid', 'store_id', 'storeId']), 0) || undefined,
      currency: ordCurrency,
      currencyIcon,
      rawOrderStatus: rawOrderStatusStr || undefined,
      purchaseDateUtc: str(r.purchaseDate) || undefined,
      lastUpdateDate: str(r.lastUpdateDate) || undefined,
      earliestShipDate: str(r.earliestShipDate) || undefined,
      latestShipDate: str(r.latestShipDate) || undefined,
      isPrime: num(r.isPrime, 0) === 1,
      isBusinessOrder: num(r.isBusinessOrder, 0) === 1,
      isPromotion: num(r.isPromotion, 0) === 1,
      isReplacementOrder: num(r.isReplacementOrder, 0) === 1,
      isReturnOrder: isReturn,
      buyerName: str(r.buyerName) || undefined,
      buyerEmail: str(r.buyerEmail) || undefined,
      remark: str(r.remark) || undefined,
      localSkuCode: parsedItems[0]?.localSku || undefined,
      productTitle: parsedItems[0]?.productName || parsedItems[0]?.title || undefined,
      picUrl: parsedItems[0]?.picUrl || undefined,
      items: parsedItems.length > 0 ? parsedItems : undefined,
    });
  }

  return Array.from(outByOrderId.values());
}

/**
 * Normalizes Lingxing MCP advertising campaign records (ad_campaign_report) into AdCampaignItem entities.
 * Skips Lingxing's leading totals summary row where campaign_id & name are null.
 */
export function normalizeLingxingAdCampaigns(
  rawRecords: LooseRecord[],
  tenantId: string,
  existingShops: AmazonShop[]
): AdCampaignItem[] {
  const { bySid: shopBySid, byName: shopByName } = buildShopLookup(existingShops, tenantId);
  const out: AdCampaignItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawRecords.length; i++) {
    const r = rawRecords[i];
    const campaignId = str(pick(r, ['campaign_id', 'campaignId']));
    const campaignName = str(pick(r, ['name', 'campaign_name', 'campaignName']));
    // Skip totals summary row returned at index 0 of Lingxing ad_campaign_report
    if (!campaignId && !campaignName) continue;

    const id = `lx-ad-${safeIdPart(tenantId)}-${safeIdPart(campaignId || `${campaignName}-${i}`)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const rawShopName = str(pick(r, ['store_name', 'shop_name', 'shopName', 'seller_name']));
    const rawSid = str(pick(r, ['sid', 'store_id']));
    const matchedShop =
      (rawShopName && shopByName.get(rawShopName.toLowerCase())) ||
      (rawSid && shopBySid.get(rawSid)) ||
      existingShops.find((s) => s.tenantId === tenantId);

    const mp = mapMarketplace(
      pick(r, ['store_country', 'marketplace', 'country', 'country_code']) ||
        matchedShop?.marketplace ||
        'US'
    );
    const currency = mapCurrencyFromMarketplace(
      mp,
      pick(r, ['currency_code', 'currencyCode', 'currency']) || matchedShop?.currency
    );
    const currencyIcon = getCurrencyIcon(currency, pick(r, ['currency_icon', 'icon']));

    const rawAdType = str(pick(r, ['ads_type', 'sponsored_type', 'ad_type', 'adType', 'campaign_type'])).toUpperCase();
    const adType: AdCampaignItem['adType'] =
      rawAdType.includes('SB') || rawAdType.includes('BRAND')
        ? 'SB'
        : rawAdType.includes('SD') || rawAdType.includes('DISPLAY')
        ? 'SD'
        : 'SP';
    const rawStatus = str(pick(r, ['state', 'status'])).toUpperCase();
    const creativeAsins = Array.isArray(r.creative_asins) ? (r.creative_asins as string[]) : [];
    const surplusObj =
      r.surplus_budget && typeof r.surplus_budget === 'object'
        ? (r.surplus_budget as LooseRecord)
        : null;

    const impressions30d = Math.max(0, Math.round(num(pick(r, ['impressions', 'impressions30d']))));
    const clicks30d = Math.max(0, Math.round(num(pick(r, ['clicks', 'clicks30d']))));
    const spend30dUsd = Math.max(0, num(pick(r, ['spends', 'cost', 'spend', 'spend30dUsd', 'ad_spend'])));
    const sales30dUsd = Math.max(0, num(pick(r, ['sales', 'direct_sales', 'sales30dUsd', 'ad_sales'])));
    const orders30d = Math.max(0, Math.round(num(pick(r, ['orders', 'orders30d', 'order_num']))));

    out.push({
      id,
      tenantId,
      shopId: matchedShop?.id || `lx-shop-${safeIdPart(tenantId)}-${mp}`,
      shopName: rawShopName || matchedShop?.shopName || `Lingxing-${mp}`,
      marketplace: mp,
      campaignId: campaignId || id,
      campaignName: campaignName || campaignId,
      adType,
      associatedAsin: str(pick(r, ['asin', 'associated_asin', 'associatedAsin']), creativeAsins[0] || 'MULTI-ASIN'),
      dailyBudgetUsd: Math.max(0, num(pick(r, ['daily_budget', 'budget', 'dailyBudgetUsd']))),
      defaultBidUsd: Math.max(0, num(pick(r, ['default_bid', 'defaultBidUsd', 'cpc', 'bid']), 0.8)),
      impressions30d,
      clicks30d,
      spend30dUsd,
      sales30dUsd,
      orders30d,
      status: rawStatus === 'PAUSED' || rawStatus === 'ARCHIVED' ? 'PAUSED' : 'ENABLED',
      daypartingEnabled: Boolean(r.is_apply_time || r.is_apply_rule),
      peakHoursRange: '18:00-23:00',
      peakBidMultiplierPercent: 115,
      offPeakHoursRange: '02:00-06:00',
      offPeakBidMultiplierPercent: 75,
      // Lingxing native fields (ad_campaign_report)
      profileId: str(r.profile_id) || undefined,
      currency,
      currencyIcon,
      targetingType: str(r.targeting_type) || undefined,
      biddingType: str(r.bidding_type) || undefined,
      budgetTypeLabel: str(pick(r, ['budget_type_sc', 'budget_type'])) || undefined,
      servingStatus: str(pick(r, ['serving_status', 'service_status'])) || undefined,
      portfolioName: str(r.portfolio_name) || undefined,
      startDate: str(r.start_date) || undefined,
      ctrPercent: num(r.ctr, impressions30d > 0 ? Number(((clicks30d / impressions30d) * 100).toFixed(2)) : 0),
      cpcAmount: num(r.cpc, clicks30d > 0 ? Number((spend30dUsd / clicks30d).toFixed(2)) : 0),
      cvrPercent: num(r.cvr, clicks30d > 0 ? Number(((orders30d / clicks30d) * 100).toFixed(2)) : 0),
      cpaAmount: num(r.cpa, orders30d > 0 ? Number((spend30dUsd / orders30d).toFixed(2)) : 0),
      acosPercent: num(r.acos, sales30dUsd > 0 ? Number(((spend30dUsd / sales30dUsd) * 100).toFixed(2)) : 0),
      roasValue: num(r.roas, spend30dUsd > 0 ? Number((sales30dUsd / spend30dUsd).toFixed(2)) : 0),
      directOrders: Math.max(0, Math.round(num(r.direct_orders, 0))),
      directSales: Math.max(0, num(r.direct_sales, 0)),
      indirectOrders: Math.max(0, Math.round(num(r.indirect_orders, 0))),
      indirectSales: Math.max(0, num(r.indirect_sales, 0)),
      adUnits: Math.max(0, Math.round(num(r.ad_units, orders30d))),
      suggestionBudget: num(r.suggestion_budget, 0) > 0 ? num(r.suggestion_budget, 0) : undefined,
      surplusBudgetTip: str(surplusObj?.tip) || undefined,
      surplusBudgetPercent:
        surplusObj?.surplus_budget_percentage !== undefined
          ? num(surplusObj.surplus_budget_percentage, 0)
          : undefined,
      isOverBudget: surplusObj?.is_over_budget !== undefined ? Boolean(surplusObj.is_over_budget) : undefined,
      lastOverBudgetAt: str(r.last_over_budget_at) || undefined,
      placementTopPercent: num(r.placement_top, 0) > 0 ? num(r.placement_top, 0) : undefined,
      topOfSearchImpressionShare:
        r.top_of_search_impression_share !== undefined && r.top_of_search_impression_share !== null
          ? num(r.top_of_search_impression_share, 0)
          : undefined,
    });
  }

  return out;
}

/**
 * Normalizes Lingxing MCP finance/settlement records (settlement_sc_summary_list) into SettlementPeriodItem entities.
 */
export function normalizeLingxingSettlements(
  rawRecords: LooseRecord[],
  tenantId: string,
  existingShops: AmazonShop[]
): SettlementPeriodItem[] {
  const { bySid: shopBySid, byName: shopByName } = buildShopLookup(existingShops, tenantId);
  const out: SettlementPeriodItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawRecords.length; i++) {
    const r = rawRecords[i];
    const settlementId = str(
      pick(r, ['settlementId', 'settlement_id', 'financialEventGroupId', 'financial_event_group_id', 'id'])
    );
    if (!settlementId) continue;

    const id = `lx-settle-${safeIdPart(tenantId)}-${safeIdPart(settlementId)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const rawSid = str(pick(r, ['sid', 'store_id']));
    const rawShopName = str(pick(r, ['storeName', 'store_name', 'shop_name', 'shopName', 'seller_name']));
    const matchedShop =
      (rawSid && shopBySid.get(rawSid)) ||
      (rawShopName && shopByName.get(rawShopName.toLowerCase())) ||
      existingShops.find((s) => s.tenantId === tenantId);

    const mp = mapMarketplace(
      pick(r, ['countryCode', 'country_code', 'marketplace', 'country']) ||
        matchedShop?.marketplace ||
        'US'
    );
    const currency = mapCurrencyFromMarketplace(
      mp,
      pick(r, ['originalTotalCurrencyCode', 'currency_code', 'currency']) || matchedShop?.currency
    );
    const currencyIcon = getCurrencyIcon(currency, r.originCurrencyIcon);

    const saleObj = (r.sale && typeof r.sale === 'object' ? (r.sale as LooseRecord) : {}) as LooseRecord;
    const payObj = (r.pay && typeof r.pay === 'object' ? (r.pay as LooseRecord) : {}) as LooseRecord;
    const refundObj = (r.refund && typeof r.refund === 'object' ? (r.refund as LooseRecord) : {}) as LooseRecord;
    const transferObj = (r.transfer && typeof r.transfer === 'object' ? (r.transfer as LooseRecord) : {}) as LooseRecord;

    const grossSalesUsd = Math.max(
      0,
      num(saleObj.sale ?? saleObj.product ?? pick(r, ['gross_sales', 'grossSalesUsd', 'sales', 'total_sales']))
    );
    const amazonFeesUsd = Math.abs(
      num(payObj.amazon ?? payObj.pay ?? pick(r, ['amazon_fees', 'amazonFeesUsd', 'fees']))
    );
    const adSpendUsd = Math.abs(num(payObj.ad ?? pick(r, ['ad_spend', 'adSpendUsd', 'advertising_cost'])));
    const refundsUsd = Math.abs(num(refundObj.refund ?? refundObj.saleRefund ?? pick(r, ['refunds', 'refundsUsd'])));
    const reserveHeldUsd = Math.abs(
      num(transferObj.currentReserveAmount ?? pick(r, ['reserve_held', 'reserveHeldUsd']))
    );
    const netPayoutRaw =
      r.originalTotalCurrencyAmount ??
      r.financialEventsAmount ??
      transferObj.originalTotalCurrencyAmount ??
      pick(r, ['net_payout', 'netPayoutUsd', 'total_amount']);
    const netPayoutUsd =
      netPayoutRaw !== undefined
        ? num(netPayoutRaw)
        : Number((grossSalesUsd - amazonFeesUsd - adSpendUsd - refundsUsd - reserveHeldUsd).toFixed(2));

    const startLoc = str(pick(r, ['financialEventGroupStartLocale'])).slice(0, 10);
    const endLoc = str(pick(r, ['financialEventGroupEndLocale'])).slice(0, 10);
    const periodRange =
      startLoc && endLoc
        ? `${startLoc} ~ ${endLoc}`
        : startLoc
        ? `${startLoc} ~ 进行中`
        : str(pick(r, ['period_range', 'periodRange', 'date_range']), '领星最近结算周期');

    const recStatus = str(pick(r, ['reconciliationResult', 'reconcile_status', 'status']));
    const reconcileStatus: SettlementPeriodItem['reconcileStatus'] =
      recStatus === '已对账' || recStatus.toUpperCase() === 'RECONCILED' ? 'RECONCILED' : 'PENDING';

    out.push({
      id,
      tenantId,
      shopId:
        matchedShop?.id ||
        (rawSid ? `lx-shop-${safeIdPart(tenantId)}-${safeIdPart(rawSid)}` : `lx-shop-${safeIdPart(tenantId)}-${mp}`),
      shopName: rawShopName || matchedShop?.shopName || `Lingxing-${mp}`,
      marketplace: mp,
      settlementId,
      periodRange,
      grossSalesUsd,
      amazonFeesUsd,
      adSpendUsd,
      refundsUsd,
      reserveHeldUsd,
      netPayoutUsd,
      reconcileStatus,
      payoutDate:
        str(pick(r, ['fundTransferDateLocale', 'fundTransferDate', 'payout_date', 'payoutDate'])).slice(0, 10) ||
        startLoc ||
        new Date().toISOString().slice(0, 10),
      // Lingxing native fields (settlement_sc_summary_list)
      sid: num(r.sid, 0) || undefined,
      financialEventGroupId: str(r.financialEventGroupId) || undefined,
      accountType: str(r.accountType) || undefined,
      processingStatus: str(r.processingStatus) || undefined,
      fundTransferStatus: str(r.fundTransferStatus) || undefined,
      currency,
      currencyIcon,
      convertedCurrencyCode: str(r.convertedTotalCurrencyCode) || undefined,
      convertedTotalAmount:
        r.convertedTotalCurrencyAmount !== undefined ? num(r.convertedTotalCurrencyAmount, 0) : undefined,
      remittanceRate: num(r.remittanceRate, 0) > 0 ? num(r.remittanceRate, 0) : undefined,
      accountTail: str(r.accountTail) || undefined,
      reconciliationResultText: recStatus || undefined,
      storageFees: Math.abs(num(payObj.storage, 0)),
      promotionFees: Math.abs(num(payObj.promotion, 0)),
      otherFees: Math.abs(num(payObj.other, 0)),
      previousReserveAmount: num(transferObj.previousReserveAmount, 0),
      beginningBalanceAmount: num(transferObj.beginningBalanceCurrencyAmount, 0),
      saleProductAmount: num(saleObj.product, 0),
      saleFreightAmount: num(saleObj.freight, 0),
      saleTaxAmount: num(saleObj.tax, 0),
    });
  }

  return out;
}

export function normalizeLingxingLocalSkus(
  records: LooseRecord[],
  tenantId: string
): LocalMaterialSku[] {
  const out: LocalMaterialSku[] = [];
  const seen = new Set<string>();

  for (const r of records) {
    const sku = str(pick(r, ['sku', 'local_sku', 'localSku']));
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);

    const spec =
      r.default_spec_pack && typeof r.default_spec_pack === 'object'
        ? (r.default_spec_pack as LooseRecord)
        : {};
    const grossWeightRaw = num(spec.cg_product_gross_weight, 0);
    const grossUnit = str(spec.cg_product_gross_weight_unit, 'g').toLowerCase();
    const weightKg =
      grossWeightRaw > 0
        ? grossUnit === 'kg'
          ? grossWeightRaw
          : Number((grossWeightRaw / 1000).toFixed(3))
        : 0.1;

    const purchaseCostCny = num(pick(r, ['purchase_price', 'stock_price', 'price']), 0);
    const headFreightPerUnitCny = num(pick(r, ['head_stock_price', 'transit_head_cost']), 0);
    const localAvailableQty = Math.max(0, Math.round(num(pick(r, ['good_num', 'total']), 0)));
    const pendingQty = Math.max(0, Math.round(num(r.pending_num, 0)));
    const transitQty = Math.max(0, Math.round(num(r.transit_num, 0)));
    const localInboundQty = pendingQty + transitQty;

    const mskuList = Array.isArray(r.msku_list)
      ? (r.msku_list as unknown[]).map((x) => str(x)).filter(Boolean)
      : [];
    const storeNameList = Array.isArray(r.store_name_list)
      ? (r.store_name_list as unknown[]).map((x) => str(x)).filter(Boolean)
      : [];
    const fnskuList = Array.isArray(r.fnsku_list)
      ? (r.fnsku_list as unknown[]).map((x) => str(x)).filter(Boolean)
      : [];

    const stockPriceCny = num(r.stock_price, purchaseCostCny);
    const stockValueCny = num(pick(r, ['stock_cost', 'amount']), Number((localAvailableQty * stockPriceCny).toFixed(2)));

    out.push({
      id: `lx-sku-${safeIdPart(tenantId)}-${safeIdPart(sku)}`,
      tenantId,
      sku,
      name: str(pick(r, ['product_name', 'title', 'spu_name'])) || sku,
      category: str(pick(r, ['category_name', 'brand_name'])) || '未分类',
      purchaseCostCny,
      headFreightPerUnitCny,
      lengthCm: Math.max(0, num(spec.cg_package_length, 0)),
      widthCm: Math.max(0, num(spec.cg_package_width, 0)),
      heightCm: Math.max(0, num(spec.cg_package_height, 0)),
      weightKg,
      leadTimeDays: 10,
      supplierName: str(pick(r, ['supplier_name', 'brand_name'])) || '领星默认供应商',
      supplier1688Id: str(pick(r, ['product_id', 'spu'])) || sku,
      localAvailableQty,
      localInboundQty,
      warehouseName: str(pick(r, ['wh_name', 'wname', 'warehouse_name'])) || '默认仓库',
      // Lingxing native fields (inventory_detail_list)
      productId: num(r.product_id, 0) || undefined,
      warehouseId: num(r.wh_id, 0) || undefined,
      picUrl: str(pick(r, ['pic_url', 'img_url'])) || undefined,
      fnsku: str(r.fnsku) || fnskuList[0] || undefined,
      mskuList: mskuList.length > 0 ? mskuList : undefined,
      storeNameList: storeNameList.length > 0 ? storeNameList : undefined,
      brandName: str(r.brand_name) || undefined,
      productStatusName: str(r.product_status_name) || undefined,
      isCombo: num(r.is_combo, 0) === 1,
      goodLockQty: Math.max(0, Math.round(num(r.good_lock_num, 0))),
      badQty: Math.max(0, Math.round(num(r.bad_num, 0))),
      qcQty: Math.max(0, Math.round(num(r.qc_num, 0))),
      pendingQty,
      transitQty,
      totalQty: Math.max(0, Math.round(num(r.total, localAvailableQty))),
      safeStockQty: Math.max(0, Math.round(num(r.storage_safe_num, 0))),
      averageAgeDays: Math.max(0, Math.round(num(r.average_age, 0))),
      stockPriceCny,
      stockValueCny,
      headStockCostCny: num(r.head_stock_cost, 0),
      transitAmountCny: num(r.transit_amount, 0),
      boxPcs: Math.max(0, Math.round(num(spec.cg_box_pcs, 0))) || undefined,
      boxLengthCm: num(spec.cg_box_length, 0) > 0 ? num(spec.cg_box_length, 0) : undefined,
      boxWidthCm: num(spec.cg_box_width, 0) > 0 ? num(spec.cg_box_width, 0) : undefined,
      boxHeightCm: num(spec.cg_box_height, 0) > 0 ? num(spec.cg_box_height, 0) : undefined,
      boxWeightKg: num(spec.cg_box_weight, 0) > 0 ? num(spec.cg_box_weight, 0) : undefined,
    });
  }

  return out;
}

export function normalizeLingxingSuppliers(
  records: LooseRecord[],
  tenantId: string
): SupplierProfile[] {
  const out: SupplierProfile[] = [];
  const seen = new Set<string>();

  for (const r of records) {
    const supplierIdStr = str(pick(r, ['supplier_id', 'id']));
    const supplierName = str(pick(r, ['supplier_name', 'name']));
    if (!supplierName) continue;
    const supplierCode = str(pick(r, ['supplier_code', 'code'])) || `SUP-${supplierIdStr || out.length + 1}`;
    const id = `lx-sup-${safeIdPart(tenantId)}-${safeIdPart(supplierIdStr || supplierCode)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const purchaserNames = Array.isArray(r.purchaser_list)
      ? (r.purchaser_list as unknown[])
          .map((p) => (typeof p === 'object' && p ? str((p as LooseRecord).name || (p as LooseRecord).realname) : str(p)))
          .filter(Boolean)
      : [];

    const defaultWarehouseName = str(pick(r, ['w_name', 'warehouse_name']));

    out.push({
      id,
      tenantId,
      supplierCode,
      supplierName,
      category: defaultWarehouseName || str(r.category) || '领星同步供应商',
      moqUnits: 100,
      leadTimeDays: 7,
      paymentTerm: '领星 ERP 档案',
      tierPricingNote: defaultWarehouseName ? `默认交货仓: ${defaultWarehouseName}` : '以领星采购单单价为准',
      ratingScore: 4.8,
      status: 'ACTIVE',
      // Lingxing native fields (products_extra_get_supplier_map_list)
      supplierId: num(r.supplier_id, 0) || undefined,
      warehouseId: num(r.wid, 0) || undefined,
      defaultWarehouseName: defaultWarehouseName || undefined,
      receiptWarehouseId: num(r.receipt_wid, 0) || undefined,
      purchaserId: num(r.purchaser_id, 0) || undefined,
      purchaserNames: purchaserNames.length > 0 ? purchaserNames : undefined,
    });
  }

  return out;
}

export function normalizeLingxingPurchaseOrders(
  records: LooseRecord[],
  tenantId: string
): PurchaseOrder1688[] {
  const out: PurchaseOrder1688[] = [];
  const seen = new Set<string>();

  for (const r of records) {
    const poNumber = str(pick(r, ['order_sn', 'custom_order_sn', 'id']));
    if (!poNumber) continue;
    const id = `lx-po-${safeIdPart(tenantId)}-${safeIdPart(poNumber)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const itemList = Array.isArray(r.item_list) ? (r.item_list as LooseRecord[]) : [];
    const parsedItems: PurchaseOrderLineItem[] = itemList.map((it) => ({
      sku: str(it.sku),
      productName: str(it.product_name),
      picUrl: str(it.pic_url) || undefined,
      quantityPlan: Math.max(0, Math.round(num(it.quantity_plan, 0))),
      quantityReal: Math.max(0, Math.round(num(it.quantity_real, 0))),
      quantityEntry: Math.max(0, Math.round(num(it.quantity_entry, 0))),
      priceCny: num(pick(it, ['price', 'cg_price']), 0),
      amountCny: num(it.amount, 0),
      taxRate: num(it.tax_rate, 0) > 0 ? num(it.tax_rate, 0) : undefined,
      taxAmountCny: num(it.tax_amount, 0) > 0 ? num(it.tax_amount, 0) : undefined,
      expectArriveTime: str(it.expect_arrive_time) || undefined,
      warehouseName: str(it.ware_house_name) || undefined,
    }));

    const firstItem = itemList[0] || {};
    const quantity = Math.max(
      0,
      Math.round(num(pick(r, ['quantity_total', 'quantity_real']), num(firstItem.quantity_real, 0)))
    );
    const receivedQty = Math.max(0, Math.round(num(pick(r, ['quantity_entry']), 0)));
    const totalAmountCny = num(pick(r, ['amount_total', 'total_price']), 0);
    const unitPriceCny =
      num(firstItem.price, 0) ||
      num(firstItem.cg_price, 0) ||
      (quantity > 0 ? Number((totalAmountCny / quantity).toFixed(2)) : 0);

    const statusText = str(pick(r, ['status_text']));
    const statusNum = num(r.status, -1);
    let status: PurchaseOrder1688['status'] = 'IN_TRANSIT';
    if (statusText.includes('退') || statusText.includes('作废')) status = 'RETURNED';
    else if (statusText.includes('已完成') || statusText.includes('已入库')) status = 'RECEIVED';
    else if (statusText.includes('待到货') || statusText.includes('在途')) status = 'IN_TRANSIT';
    else if (statusText.includes('待审')) status = 'APPROVED';
    else if (statusText.includes('待提交') || statusText.includes('草稿')) status = 'DRAFT';
    else if (statusNum === 0) status = 'DRAFT';
    else if (statusNum === 1) status = 'APPROVED';
    else if (statusNum === 2) status = 'IN_TRANSIT';
    else if (statusNum === 3) status = 'RECEIVED';

    const payStatusNum = num(r.pay_status, -1);
    const payStatusText = str(pick(r, ['pay_status_text']));
    let paymentStatus: PurchaseOrder1688['paymentStatus'] = 'UNPAID';
    if (payStatusText.includes('部分')) paymentStatus = 'PARTIAL';
    else if (payStatusText.includes('已付') || payStatusText.includes('完成')) paymentStatus = 'PAID';
    else if (payStatusNum === 2) paymentStatus = 'PAID';
    else if (payStatusNum === 1) paymentStatus = 'PARTIAL';

    const poCurrency = mapCurrencyFromMarketplace('US', pick(r, ['purchase_currency']) || 'CNY');

    out.push({
      id,
      tenantId,
      poNumber,
      order1688No: str(pick(r, ['alibaba_order_sn', 'alibaba_order_id', 'custom_order_sn'])) || poNumber,
      localSkuCode: str(firstItem.sku) || 'MULTI-SKU',
      productName:
        str(firstItem.product_name) ||
        (itemList.length > 1 ? `多SKU采购单 (${itemList.length}款)` : poNumber),
      supplierName: str(pick(r, ['supplier_name'])) || '未指定供应商',
      quantity,
      receivedQty: Math.min(quantity, receivedQty),
      unitPriceCny,
      totalAmountCny,
      status,
      paymentStatus,
      createdBy: 'USER',
      createdAt: str(pick(r, ['order_time', 'create_time'])).slice(0, 10) || new Date().toISOString().slice(0, 10),
      expectedArrivalDate:
        str(pick(r, ['finish_time', 'expected_arrival_date', 'order_time'])).slice(0, 10) ||
        parsedItems[0]?.expectArriveTime?.slice(0, 10) ||
        new Date().toISOString().slice(0, 10),
      // Lingxing native fields (purchase_order_page_list)
      lingxingOrderId: str(r.order_id) || undefined,
      supplierId: num(r.supplier_id, 0) || undefined,
      warehouseId: num(r.wid, 0) || undefined,
      warehouseName: str(r.ware_house_name) || undefined,
      purchaserName: str(r.purchaser_name) || undefined,
      creatorName: str(pick(r, ['create_realname', 'opt_realname'])) || undefined,
      statusText: statusText || undefined,
      payStatusText: payStatusText || undefined,
      signStatusText: str(r.purchase_sign_status_text) || undefined,
      purchaseTypeText: str(r.purchase_type_text) || undefined,
      paymentMethodText: str(r.payment_method_text) || undefined,
      settlementMethodText: str(r.settlement_method_text) || undefined,
      qcTypeText: str(r.qc_type_text) || undefined,
      currency: poCurrency,
      currencyIcon: getCurrencyIcon(poCurrency, r.purchase_currency_icon),
      payAmountCny: num(r.pay_amount, 0),
      shippingPriceCny: num(r.shipping_price, 0),
      otherFeeCny: num(r.other_fee, 0),
      discountAmountCny: num(r.discount_amount, 0),
      isTax: num(r.is_tax, 0) === 1,
      totalGrossWeightG: num(r.total_product_gross_weight, 0) || undefined,
      itemCount: Math.max(parsedItems.length, Math.round(num(r.item_num, 0))) || undefined,
      quantityNoticed: Math.max(0, Math.round(num(r.quantity_noticed, 0))),
      quantityReceivePending: Math.max(0, Math.round(num(r.quantity_receive, 0))),
      quantityReturn: Math.max(0, Math.round(num(r.quantity_return, 0))),
      isOverdue: num(r.is_overdue, 0) === 1,
      overdueDays: Math.max(0, Math.round(num(r.overdue_days, 0))),
      remark: str(r.remark) || undefined,
      items: parsedItems.length > 0 ? parsedItems : undefined,
    });
  }

  return out;
}

/**
 * Normalizes Lingxing MCP BOM / Processing Orders (warehouse_processing_order_list) into BomAssemblyOrder entities.
 */
export function normalizeLingxingBomOrders(
  records: LooseRecord[],
  tenantId: string
): BomAssemblyOrder[] {
  const out: BomAssemblyOrder[] = [];
  const seen = new Set<string>();

  for (const r of records) {
    const assemblyNo = str(pick(r, ['process_sn', 'id']));
    if (!assemblyNo) continue;

    const productList = Array.isArray(r.product_list) ? (r.product_list as LooseRecord[]) : [];
    const prod0 = productList[0] || {};
    const bundleSkuCode = str(prod0.sku) || assemblyNo;
    const id = `lx-bom-${safeIdPart(tenantId)}-${safeIdPart(assemblyNo)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const targetBundleQty = Math.max(1, Math.round(num(prod0.quantity, 1)));
    const rawItems = Array.isArray(prod0.item_list) ? (prod0.item_list as LooseRecord[]) : [];
    const components: BomComponentItem[] = rawItems.map((it) => {
      const qtyProcess = Math.max(0, Math.round(num(it.quantity_process, 0)));
      const ratio = targetBundleQty > 0 ? Number((qtyProcess / targetBundleQty).toFixed(2)) : 1;
      return {
        sku: str(it.sku),
        productName: str(it.product_name),
        quantityProcess: qtyProcess,
        unitsPerBundle: ratio > 0 ? ratio : 1,
        syncPriceCny: num(it.sync_price, 0),
        syncAmountCny: num(it.sync_amount, 0),
        picUrl: str(it.child_pic_url) || undefined,
      };
    });

    const firstComp = components[0];
    const statusNum = num(r.status, 0);
    const status: BomAssemblyOrder['status'] = statusNum === 2 ? 'COMPLETED' : 'PENDING';
    const processType: BomAssemblyOrder['processType'] = num(r.type, 1) === 2 ? 'SPLIT' : 'ASSEMBLE';

    out.push({
      id,
      tenantId,
      assemblyNo,
      bundleSkuCode,
      bundleName: str(prod0.product_name) || bundleSkuCode,
      componentSkuCode: firstComp?.sku || 'N/A',
      unitsPerBundle: firstComp?.unitsPerBundle || 1,
      targetBundleQty,
      status,
      createdAt: str(pick(r, ['create_time', 'opt_time'])).slice(0, 16) || new Date().toISOString().slice(0, 16),
      // Lingxing native fields (warehouse_processing_order_list)
      processOrderId: num(r.id, 0) || undefined,
      processType,
      warehouseId: num(r.wid, 0) || undefined,
      warehouseName: str(pick(r, ['ware_house_name', 'ware_house_bak_name'])) || '默认仓库',
      operatorName: str(pick(r, ['finish_realname', 'opt_realname'])) || undefined,
      creatorName: str(r.create_realname) || undefined,
      finishTime: str(r.finish_time) || undefined,
      remark: str(r.remark) || undefined,
      picUrl: str(pick(prod0, ['pic_url', 'pic_url_link'])) || undefined,
      unitCostCny: num(prod0.sync_price, 0) || undefined,
      totalCostCny: num(prod0.sync_amount, 0) || undefined,
      processFeeCny: num(prod0.process_fee, 0),
      components: components.length > 0 ? components : undefined,
    });
  }

  return out;
}

export function normalizeLingxingWarehouseLedgers(
  records: LooseRecord[],
  tenantId: string
): WarehouseStockLedger[] {
  const out: WarehouseStockLedger[] = [];
  const seenCounts = new Map<string, number>();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const ledgerNo = str(pick(r, ['batch_state_id', 'batch_no', 'delivery_order_sn', 'id'])) || `LX-WH-${i + 1}`;
    const sku = str(pick(r, ['sku', 'msku', 'fnsku', 'product_sku']));
    if (!sku) continue;

    // Combine ledgerNo + sku + movement event fingerprint so multiple stock movements sharing
    // the same batch_no/sku never overwrite or drop each other.
    const eventFingerprint = shortStableHash(
      [
        str(pick(r, ['batch_state_id', 'id'])),
        str(pick(r, ['batch_no'])),
        str(pick(r, ['wh_id', 'wid', 'warehouse_id'])),
        str(pick(r, ['order_sn'])),
        str(pick(r, ['delivery_order_sn'])),
        str(pick(r, ['batch_time', 'purchase_in_time'])),
        str(pick(r, ['type', 'type_name'])),
        str(pick(r, ['good_num'])),
        str(pick(r, ['bad_num'])),
        str(pick(r, ['qc_num'])),
        str(pick(r, ['balance_num'])),
        str(pick(r, ['stock_cost', 'amount'])),
      ].join('|')
    );
    const baseId = `lx-wh-${safeIdPart(tenantId)}-${safeIdPart(ledgerNo)}-${safeIdPart(sku)}-${eventFingerprint}`;
    const occ = (seenCounts.get(baseId) || 0) + 1;
    seenCounts.set(baseId, occ);
    const id = occ > 1 ? `${baseId}-${occ}` : baseId;

    const typeName = str(pick(r, ['type_name']));
    let movementType: WarehouseStockLedger['movementType'] = 'PO_INBOUND';
    if (typeName.includes('FBA') || typeName.includes('发货') || typeName.includes('出库')) {
      movementType = 'FBA_OUTBOUND';
    } else if (typeName.includes('调拨入')) {
      movementType = 'TRANSFER_IN';
    } else if (typeName.includes('调拨出')) {
      movementType = 'TRANSFER_OUT';
    } else if (typeName.includes('盘点') || typeName.includes('调整')) {
      movementType = 'COUNT_ADJUST';
    } else if (typeName.includes('加工') || typeName.includes('组装')) {
      movementType = 'BOM_CONSUME';
    }

    const goodNum = Math.round(num(r.good_num, 0));
    const badNum = Math.round(num(r.bad_num, 0));
    const qcNum = Math.round(num(r.qc_num, 0));
    const qtyDelta = goodNum !== 0 ? goodNum : badNum !== 0 ? badNum : qcNum;
    const balanceAfter = Math.max(0, Math.round(num(r.balance_num, Math.abs(qtyDelta))));

    const poSns = Array.isArray(r.purchase_order_sns)
      ? (r.purchase_order_sns as unknown[]).map((x) => str(x)).filter(Boolean)
      : [];
    const supplierNames = Array.isArray(r.supplier_names)
      ? (r.supplier_names as unknown[]).map((x) => str(x)).filter(Boolean)
      : [];

    out.push({
      id,
      tenantId,
      ledgerNo,
      warehouseName: str(pick(r, ['wh_name', 'w_name', 'warehouse_name'])) || '默认仓库',
      localSkuCode: sku,
      movementType,
      qtyDelta,
      balanceAfter,
      referenceDoc:
        str(r.order_sn) ||
        poSns[0] ||
        str(pick(r, ['purchase_order_sn', 'delivery_order_sn'])) ||
        ledgerNo,
      operatorName: str(pick(r, ['opt_name', 'create_user'])) || '领星 ERP',
      createdAt: str(pick(r, ['batch_time', 'purchase_in_time'])).slice(0, 16) || new Date().toISOString().slice(0, 16),
      // Lingxing native fields (batch_inventory_statement_list)
      batchNo: str(r.batch_no) || ledgerNo,
      warehouseId: num(r.wh_id, 0) || undefined,
      typeCode: str(r.type) || undefined,
      typeName: typeName || undefined,
      productName: str(r.product_name) || undefined,
      productPic: str(r.product_pic) || undefined,
      fnsku: str(r.fnsku) || undefined,
      msku: str(r.msku) || undefined,
      supplierName: str(r.supplier_name) || supplierNames[0] || undefined,
      orderSn: str(r.order_sn) || undefined,
      deliveryOrderSn: str(r.delivery_order_sn) || undefined,
      purchaseOrderSn: str(r.purchase_order_sn) || poSns[0] || undefined,
      goodDelta: goodNum,
      badDelta: badNum,
      qcDelta: qcNum,
      transitBalanceAfter: Math.max(0, Math.round(num(r.transit_balance_num, 0))),
      purchasePriceCny: num(r.purchase_price, 0),
      stockPriceCny: num(r.stock_price, 0),
      stockCostCny: num(pick(r, ['stock_cost', 'amount']), 0),
      headStockCostCny: num(r.head_stock_cost, 0),
      batchRemark: str(r.batch_remark) || undefined,
    });
  }

  return out;
}

export function normalizeLingxingFbaShipments(
  records: LooseRecord[],
  tenantId: string,
  existingShops: AmazonShop[]
): FbaShipmentPlan[] {
  const out: FbaShipmentPlan[] = [];
  const seen = new Set<string>();

  for (const r of records) {
    const products = Array.isArray(r.products) ? (r.products as LooseRecord[]) : [];
    const parsedItems: FbaShipmentLineItem[] = products.map((p) => ({
      shipmentId: str(p.shipment_id) || str(r.shipment_sn),
      sku: str(p.sku),
      msku: str(p.msku),
      asin: str(p.asin),
      fnsku: str(pick(p, ['fnsku', 'fulfillment_network_sku'])),
      productName: str(p.product_name),
      picUrl: str(p.pic_url) || undefined,
      quantityShipped: Math.max(0, Math.round(num(p.quantity_shipped, num(p.num, 0)))),
      quantityReceived: Math.max(0, Math.round(num(p.product_valid_num, 0))),
      diffNum: Math.round(num(p.diff_num, 0)),
      shipmentStatus: str(p.shipment_status) || undefined,
    }));

    const p0 = products[0] || {};
    const shipmentId =
      str(pick(p0, ['shipment_id'])) ||
      str(pick(r, ['shipment_sn', 'order_sn', 'id']));
    if (!shipmentId) continue;
    const id = `lx-fba-${safeIdPart(tenantId)}-${safeIdPart(str(r.id) || shipmentId)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const rawSid = str(p0.sid);
    const matchedShop = existingShops.find((s) => rawSid && s.id.endsWith(`-${safeIdPart(rawSid)}`));
    const shopName = str(p0.sname) || matchedShop?.shopName || str(r.wname) || 'FBA 仓库';
    const mp = matchedShop?.marketplace || mapMarketplace(p0.nation || shopName);

    const channel = str(pick(r, ['logistics_channel_name', 'logistics_provider_name']));
    let shippingMode: FbaShipmentPlan['shippingMode'] = 'SEA_FAST';
    if (/空|AIR|快递|EXPRESS|UPS|DHL|FEDEX/i.test(channel)) shippingMode = 'AIR_EXPRESS';
    else if (/慢|海卡|STANDARD/i.test(channel)) shippingMode = 'SEA_STANDARD';

    const rawShipStatus = str(p0.shipment_status || r.status_name).toUpperCase();
    let status: FbaShipmentPlan['status'] = 'IN_TRANSIT';
    if (rawShipStatus.includes('CLOSED') || rawShipStatus.includes('已完成') || rawShipStatus.includes('已签收')) {
      status = 'CLOSED';
    } else if (rawShipStatus.includes('RECEIVING') || rawShipStatus.includes('签收中')) {
      status = 'RECEIVING';
    } else if (rawShipStatus.includes('SHIPPED') || rawShipStatus.includes('已发货')) {
      status = 'SHIPPED';
    } else if (rawShipStatus.includes('WORKING') || rawShipStatus.includes('待发货')) {
      status = 'WORKING';
    }

    const totalShipped = Math.max(
      0,
      Math.round(num(pick(r, ['quantity_shipped_total', 'total_quantity_shipped', 'total_num']), num(p0.quantity_shipped, 0)))
    );
    const totalReceived =
      parsedItems.length > 0
        ? parsedItems.reduce((sum, it) => sum + it.quantityReceived, 0)
        : Math.max(0, Math.round(num(p0.product_valid_num, 0)));
    const boxCount = Math.max(1, Math.round(num(r.total_box_num, 1)));
    const unitsPerBox = Math.max(1, Math.round(totalShipped / boxCount));
    const predictFee = num(r.predict_total_fee, 0);
    const actualFee = num(r.actual_total_fee, 0);
    const totalFee = actualFee > 0 ? actualFee : predictFee;
    const totalWeightKg = Math.max(1, num(r.total_box_weight, num(p0.total_gw, 10)));

    out.push({
      id,
      tenantId,
      shipmentId,
      shopName,
      marketplace: mp,
      destinationFulfillmentCenter:
        str(pick(r, ['destination_fulfillment_center_id'])) ||
        str(p0.destination_fulfillment_center_id) ||
        str(r.wname) ||
        'FBA',
      shippingMode,
      carrierName: str(pick(r, ['logistics_provider_name', 'logistics_channel_name'])) || '领星发货渠道',
      trackingNumber: str(pick(r, ['logistics_tracking_number', 'shipment_sn'])) || shipmentId,
      localSkuCode: str(p0.sku) || str(p0.msku) || 'MULTI-SKU',
      fnsku: str(p0.fnsku) || str(p0.fulfillment_network_sku) || '',
      boxCount,
      unitsPerBox,
      totalUnitsShipped: totalShipped,
      totalUnitsReceived: totalReceived,
      boxLengthCm: Math.max(0, num(p0.cg_package_length, 40)),
      boxWidthCm: Math.max(0, num(p0.cg_package_width, 30)),
      boxHeightCm: Math.max(0, num(p0.cg_package_height, 30)),
      boxGrossWeightKg: Number((totalWeightKg / boxCount).toFixed(2)),
      freightRatePerKgCny: totalFee > 0 ? Number((totalFee / totalWeightKg).toFixed(2)) : 0,
      status,
      createdAt: str(pick(r, ['create_time', 'gmt_create'])).slice(0, 10) || new Date().toISOString().slice(0, 10),
      // Lingxing native fields (get_delivery_order_list)
      shipmentSn: str(r.shipment_sn) || undefined,
      warehouseId: num(r.wid, 0) || undefined,
      warehouseName: str(r.wname) || undefined,
      statusName: str(r.status_name) || undefined,
      isAwd: num(r.is_awd, 0) === 1,
      logisticsChannelName: str(r.logistics_channel_name) || undefined,
      headFeeTypeName: str(r.head_fee_type_name) || undefined,
      predictTotalFeeCny: predictFee,
      actualTotalFeeCny: actualFee,
      totalBoxVolume: num(r.total_box_volume, 0),
      totalBoxVolumeWeightKg: num(r.total_box_volume_weight, 0),
      itemTotalCount: Math.max(parsedItems.length, Math.round(num(r.item_total_count, 0))),
      shipmentUser: str(r.shipment_user) || undefined,
      createUser: str(r.create_user) || undefined,
      shipmentTime: str(r.shipment_time) || undefined,
      pickTime: str(r.pick_time) || undefined,
      expectedArrivalDate: str(r.expected_arrival_date) || undefined,
      printStatus: str(r.print_status) || undefined,
      remark: str(r.remark) || undefined,
      items: parsedItems.length > 0 ? parsedItems : undefined,
    });
  }

  return out;
}

export function normalizeLingxingAdSearchTerms(
  records: LooseRecord[],
  tenantId: string
): AdSearchTermItem[] {
  const out: AdSearchTermItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const searchTerm = str(pick(r, ['query', 'search_term', 'searchTerm', 'keyword_text']));
    // Skip totals summary row returned at index 0 where profile_id / query / campaign_id are null
    if (!searchTerm || (!r.campaign_id && !r.profile_id)) continue;

    const campaignId = str(pick(r, ['campaign_id', 'campaignId'])) || 'UNKNOWN';
    const keyHash = str(pick(r, ['st_md5', 'key'])) || `${campaignId}-${searchTerm}-${i}`;
    const id = `lx-st-${safeIdPart(tenantId)}-${safeIdPart(keyHash)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const mp = mapMarketplace(pick(r, ['country', 'store_country']));
    const currency = mapCurrencyFromMarketplace(mp);
    const currencyIcon = getCurrencyIcon(currency);

    const rawMatch = str(pick(r, ['target_match_type', 'match_type', 'exp_type_text'])).toUpperCase();
    let matchType: AdSearchTermItem['matchType'] = 'AUTO';
    if (rawMatch.includes('EXACT')) matchType = 'EXACT';
    else if (rawMatch.includes('PHRASE')) matchType = 'PHRASE';
    else if (rawMatch.includes('BROAD')) matchType = 'BROAD';

    const negRaw = str(pick(r, ['st_negative', 'kw_negative'])).toUpperCase();
    let negatedStatus: AdSearchTermItem['negatedStatus'] = 'ACTIVE';
    if (negRaw.includes('EXACT')) negatedStatus = 'NEGATIVE_EXACT';
    else if (negRaw.includes('PHRASE')) negatedStatus = 'NEGATIVE_PHRASE';

    const impressions = Math.max(0, Math.round(num(r.impressions, 0)));
    const clicks = Math.max(0, Math.round(num(r.clicks, 0)));
    const spendUsd = num(pick(r, ['spends', 'cost', 'spend']), 0);
    const salesUsd = num(pick(r, ['sales', 'direct_sales']), 0);
    const orders = Math.max(0, Math.round(num(pick(r, ['orders', 'direct_orders']), 0)));

    out.push({
      id,
      tenantId,
      campaignId,
      campaignName: str(pick(r, ['campaign_name', 'campaignName'])) || `Campaign-${campaignId}`,
      marketplace: mp,
      searchTerm,
      matchType,
      impressions,
      clicks,
      spendUsd,
      salesUsd,
      orders,
      negatedStatus,
      // Lingxing native fields (ad_campaign_search_term_report)
      storeName: str(r.store_name) || undefined,
      profileId: str(r.profile_id) || undefined,
      adGroupId: str(r.ad_group_id) || undefined,
      adGroupName: str(r.ad_group_name) || undefined,
      adSponsoredType: str(r.ad_sponsored_type) || undefined,
      targetingTextZh: str(pick(r, ['targeting_text_zh', 'targeting_text', 'target_match_type_zh'])) || undefined,
      expTypeText: str(r.exp_type_text) || undefined,
      currency,
      currencyIcon,
      ctrPercent: num(r.ctr, impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0),
      cpcAmount: num(r.cpc, clicks > 0 ? Number((spendUsd / clicks).toFixed(2)) : 0),
      cvrPercent: num(r.cvr, clicks > 0 ? Number(((orders / clicks) * 100).toFixed(2)) : 0),
      cpaAmount: num(r.cpa, orders > 0 ? Number((spendUsd / orders).toFixed(2)) : 0),
      acosPercent: num(r.acos, salesUsd > 0 ? Number(((spendUsd / salesUsd) * 100).toFixed(2)) : 0),
      roasValue: num(r.roas, spendUsd > 0 ? Number((salesUsd / spendUsd).toFixed(2)) : 0),
      directOrders: Math.max(0, Math.round(num(r.direct_orders, 0))),
      directSales: num(r.direct_sales, 0),
      indirectOrders: Math.max(0, Math.round(num(r.indirect_orders, 0))),
      indirectSales: num(r.indirect_sales, 0),
      adUnits: Math.max(0, Math.round(num(r.ad_units, orders))),
      bidAmount: num(pick(r, ['bid', 'default_bid']), 0) || undefined,
      isAsinTarget: num(r.is_asin, 0) === 1,
    });
  }

  return out;
}

const KNOWN_CURRENCY_CODES: Set<CurrencyCode> = new Set([
  'USD',
  'CAD',
  'MXN',
  'BRL',
  'GBP',
  'EUR',
  'JPY',
  'AUD',
  'CNY',
]);

/**
 * Extracts discovered tool candidates from Lingxing OpenMCP `search` meta-tool payload.
 */
export function parseOpenMcpSearchResults(responsePayload: unknown): Array<{
  toolId: string;
  name: string;
  description: string;
}> {
  const recs = extractRecordsFromMcpResult(responsePayload);
  const out: Array<{ toolId: string; name: string; description: string }> = [];
  const seen = new Set<string>();
  for (const r of recs) {
    const toolId = str(pick(r, ['toolId', 'tool_id', 'id', 'name', 'code']));
    if (!toolId || seen.has(toolId)) continue;
    seen.add(toolId);
    out.push({
      toolId,
      name: str(pick(r, ['name', 'title', 'toolName', 'tool_name']), toolId),
      description: str(pick(r, ['description', 'desc', 'summary', 'remark']), toolId),
    });
  }
  return out;
}

/**
 * Extracts JSON Schema `inputSchema` from Lingxing OpenMCP `help` meta-tool payload.
 */
export function parseOpenMcpHelpSchema(
  responsePayload: unknown
): DiscoveredMcpTool['inputSchema'] | undefined {
  const scan = (node: unknown, depth = 0): DiscoveredMcpTool['inputSchema'] | undefined => {
    if (depth > 7 || node === null || node === undefined) return undefined;
    if (typeof node === 'string') {
      const parsed = tryParseJsonFromText(node);
      return parsed ? scan(parsed, depth + 1) : undefined;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = scan(item, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    if (typeof node === 'object') {
      const obj = node as LooseRecord;
      if (obj.properties && typeof obj.properties === 'object' && !Array.isArray(obj.properties)) {
        return obj as DiscoveredMcpTool['inputSchema'];
      }
      for (const key of ['inputSchema', 'input_schema', 'parameters', 'paramsSchema', 'schema', 'result', 'content', 'data']) {
        if (obj[key] !== undefined) {
          const found = scan(obj[key], depth + 1);
          if (found) return found;
        }
      }
    }
    return undefined;
  };
  return scan(responsePayload, 0);
}

/**
 * Dynamically discovers a live Lingxing OpenMCP tool via `search` + `help` meta-tools.
 */
export async function discoverOpenMcpToolByKeywords(params: {
  keywords: string[];
  domain: LingxingSyncDomain;
  includeRegex: RegExp;
  excludeRegex?: RegExp;
  callMetaTool: (
    metaToolName: 'search' | 'help',
    args: Record<string, unknown>
  ) => Promise<{ ok: boolean; payload: unknown }>;
}): Promise<DiscoveredMcpTool | null> {
  for (const kw of params.keywords) {
    for (const searchArgs of [{ query: kw }, { keyword: kw }]) {
      const res = await params.callMetaTool('search', searchArgs);
      if (!res.ok) continue;
      const candidates = parseOpenMcpSearchResults(res.payload);
      const matched = candidates.find((c) => {
        const hay = `${c.toolId} ${c.name} ${c.description}`;
        if (!params.includeRegex.test(hay)) return false;
        if (params.excludeRegex && params.excludeRegex.test(hay)) return false;
        return true;
      });
      if (matched) {
        let inputSchema: DiscoveredMcpTool['inputSchema'] | undefined;
        try {
          const helpRes = await params.callMetaTool('help', { toolId: matched.toolId });
          if (helpRes.ok) {
            inputSchema = parseOpenMcpHelpSchema(helpRes.payload);
          }
        } catch {
          // Proceed with domain default args
        }
        return {
          name: matched.toolId,
          gatewayToolId: matched.toolId,
          description: matched.description || matched.name,
          domain: params.domain,
          inputSchema,
        };
      }
    }
  }
  return null;
}

/**
 * Normalizes Lingxing MCP currency / exchange rate records (e.g. currencyMonth / currency_list)
 * into ExchangeRateItem[] with exact cross-currency rateToUsd and rateToCny multipliers.
 * Prioritizes Lingxing `my_rate` (custom rate) over `rate_org` / `org_rate` (official rate),
 * and universally handles CNY-base, USD-direct, and USD-inverse quote conventions.
 */
export function normalizeLingxingExchangeRates(
  rawRecords: LooseRecord[],
  tenantId: string
): ExchangeRateItem[] {
  const rawEntries: Array<{
    code: CurrencyCode;
    name: string;
    icon: string;
    rateDate: string;
    officialRate: number;
    myRate: number;
    effectiveRate: number;
    updatedAt: string;
  }> = [];
  const seen = new Set<CurrencyCode>();

  for (const r of rawRecords) {
    const rawCode = str(
      pick(r, ['code', 'currency_code', 'currencyCode', 'currency'])
    ).toUpperCase() as CurrencyCode;
    if (!KNOWN_CURRENCY_CODES.has(rawCode) || seen.has(rawCode)) continue;

    const officialRate = Math.max(
      0,
      num(pick(r, ['rate_org', 'org_rate', 'official_rate', 'rate', 'exchange_rate']), 0)
    );
    const myRate = Math.max(0, num(pick(r, ['my_rate', 'myRate', 'custom_rate']), 0));
    const effectiveRate = myRate > 0 ? myRate : officialRate;
    if (effectiveRate <= 0) continue;

    seen.add(rawCode);
    rawEntries.push({
      code: rawCode,
      name: str(pick(r, ['name', 'currency_name', 'currencyName']), rawCode),
      icon: getCurrencyIcon(rawCode, pick(r, ['icon', 'currency_icon', 'symbol'])),
      rateDate: str(pick(r, ['date', 'month', 'rate_date']), new Date().toISOString().slice(0, 7)),
      officialRate: officialRate || effectiveRate,
      myRate,
      effectiveRate,
      updatedAt:
        str(pick(r, ['update_time', 'updateTime', 'updated_at'])) ||
        new Date().toISOString().replace('T', ' ').slice(0, 19),
    });
  }

  if (rawEntries.length === 0) return [];

  const usdEntry = rawEntries.find((e) => e.code === 'USD');
  const cnyEntry = rawEntries.find((e) => e.code === 'CNY');

  // Detect quote convention:
  // 1) Inverse-USD quote (1 USD = 7.24 CNY, 152 JPY): USD≈1 and CNY > 2
  // 2) Direct-base quote (Lingxing default CNY base: CNY=1, USD≈7.24, JPY≈0.048; OR USD base: USD=1, CNY≈0.138)
  const isInverseUsdQuote =
    Boolean(usdEntry && Math.abs(usdEntry.effectiveRate - 1) < 0.05) &&
    Boolean(cnyEntry && cnyEntry.effectiveRate > 2);

  const usdBaseRate = usdEntry?.effectiveRate || (cnyEntry && Math.abs(cnyEntry.effectiveRate - 1) < 0.05 ? 7.24 : 1);
  const cnyBaseRate = cnyEntry?.effectiveRate || (isInverseUsdQuote ? 7.24 : usdBaseRate / 7.24);

  return rawEntries.map((e) => {
    let rateToUsd: number;
    let rateToCny: number;

    if (isInverseUsdQuote) {
      rateToUsd = e.code === 'USD' ? 1 : 1 / e.effectiveRate;
      rateToCny = e.code === 'CNY' ? 1 : cnyBaseRate / e.effectiveRate;
    } else {
      rateToUsd = e.code === 'USD' ? 1 : e.effectiveRate / usdBaseRate;
      rateToCny = e.code === 'CNY' ? 1 : e.effectiveRate / cnyBaseRate;
    }

    return {
      id: `lx-fx-${safeIdPart(tenantId)}-${e.code}`,
      tenantId,
      currencyCode: e.code,
      currencyName: e.name,
      currencyIcon: e.icon,
      rateDate: e.rateDate,
      officialRate: Number(e.officialRate.toFixed(6)),
      myRate: Number(e.myRate.toFixed(6)),
      effectiveRate: Number(e.effectiveRate.toFixed(6)),
      rateToUsd: Number(rateToUsd.toFixed(8)),
      rateToCny: Number(rateToCny.toFixed(8)),
      source: 'LINGXING_MCP',
      updatedAt: e.updatedAt,
    };
  });
}

function optionalNum(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '' || val === '--') return undefined;
  const parsed = num(val, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Normalizes Lingxing MCP 30-day profit/overview statistics rows (shop/MSKU/summary profit reports)
 * into an aggregated LingxingProfitSummaryItem converted to USD using live MCP exchange rates.
 */
export function normalizeLingxingProfitSummary(
  rawRecords: LooseRecord[],
  tenantId: string,
  sourceToolName: string,
  exchangeRates: ExchangeRateItem[] = []
): LingxingProfitSummaryItem[] {
  if (rawRecords.length === 0) return [];

  const fxMap = new Map<CurrencyCode, number>();
  for (const fx of exchangeRates) {
    if (fx.rateToUsd > 0) fxMap.set(fx.currencyCode, fx.rateToUsd);
  }
  const toUsd = (amount: number, row: LooseRecord): number => {
    const rawCur = str(
      pick(row, ['currencyCode', 'currency_code', 'currency', 'icon'])
    ).toUpperCase();
    if (!rawCur || rawCur === 'USD' || rawCur === '$') return amount;
    const cur = rawCur as CurrencyCode;
    const rate = fxMap.get(cur);
    if (rate && rate > 0) return amount * rate;
    if (cur === 'CNY') return amount / 7.24;
    if (cur === 'CAD') return amount * 0.73;
    if (cur === 'MXN') return amount * 0.05;
    if (cur === 'BRL') return amount * 0.18;
    if (cur === 'GBP') return amount * 1.27;
    if (cur === 'EUR') return amount * 1.08;
    if (cur === 'JPY') return amount * 0.0066;
    if (cur === 'AUD') return amount * 0.65;
    return amount;
  };

  let salesVolume = 0;
  let orderCount = 0;
  let salesAmountUsd = 0;
  let adSpendUsd = 0;
  let adSalesUsd = 0;
  let refundAmountUsd = 0;
  let settlementGrossProfitUsd = 0;
  let matchedRows = 0;

  let firstRow: LooseRecord | null = null;

  for (const r of rawRecords) {
    const vol = num(
      pick(r, [
        'totalSalesQuantity',
        'total_sales_quantity',
        'salesVolume',
        'sales_volume',
        'volume',
        'totalVolume',
        'total_volume',
        'salesQuantity',
      ]),
      0
    );
    const ord = num(
      pick(r, ['orderCount', 'order_count', 'totalOrderCount', 'total_order_count', 'orders']),
      0
    );
    const salesAmt = num(
      pick(r, [
        'totalSalesAmount',
        'total_sales_amount',
        'salesAmount',
        'sales_amount',
        'totalSales',
        'total_sales',
        'productSales',
      ]),
      0
    );
    const adsSpend = Math.abs(
      num(
        pick(r, ['adsSpend', 'ads_spend', 'adSpend', 'ad_spend', 'totalAdsCost', 'total_ads_cost', 'spends']),
        0
      )
    );
    const adsSales = Math.abs(
      num(
        pick(r, ['adsSales', 'ads_sales', 'adSales', 'ad_sales', 'totalAdsSales', 'total_ads_sales']),
        0
      )
    );
    const refundAmt = Math.abs(
      num(
        pick(r, [
          'totalRefundAmount',
          'total_refund_amount',
          'refundAmount',
          'refund_amount',
          'refunds',
          'refund',
          'totalRefund',
        ]),
        0
      )
    );
    const grossProfit = num(
      pick(r, [
        'grossProfit',
        'gross_profit',
        'settlementGrossProfit',
        'settlement_gross_profit',
        'netProfit',
        'net_profit',
      ]),
      Number.NaN
    );

    const hasProfitSignals =
      vol > 0 || salesAmt > 0 || adsSpend > 0 || refundAmt > 0 || Number.isFinite(grossProfit);
    if (!hasProfitSignals) continue;

    if (!firstRow) firstRow = r;
    matchedRows += 1;
    salesVolume += Math.round(vol);
    orderCount += Math.round(ord);
    salesAmountUsd += toUsd(salesAmt, r);
    adSpendUsd += toUsd(adsSpend, r);
    adSalesUsd += toUsd(adsSales, r);
    refundAmountUsd += toUsd(refundAmt, r);
    if (Number.isFinite(grossProfit)) {
      settlementGrossProfitUsd += toUsd(grossProfit, r);
    }
  }

  if (matchedRows === 0 || !firstRow) return [];

  const roundedSales = Number(salesAmountUsd.toFixed(2));
  const roundedAdSpend = Number(adSpendUsd.toFixed(2));
  const roundedAdSales = Number(adSalesUsd.toFixed(2));
  const roundedRefund = Number(refundAmountUsd.toFixed(2));
  const roundedProfit = Number(settlementGrossProfitUsd.toFixed(2));

  const acosPercent =
    roundedAdSales > 0
      ? Number(((roundedAdSpend / roundedAdSales) * 100).toFixed(2))
      : num(pick(firstRow, ['acos', 'acosPercent']), 0);
  const rawMargin = optionalNum(
    pick(firstRow, ['grossProfitRate', 'gross_profit_rate', 'grossMargin', 'gross_margin'])
  );
  const settlementGrossMarginPercent =
    matchedRows === 1 && rawMargin !== undefined
      ? Number((Math.abs(rawMargin) <= 1 ? rawMargin * 100 : rawMargin).toFixed(2))
      : roundedSales > 0
      ? Number(((roundedProfit / roundedSales) * 100).toFixed(2))
      : 0;

  const now = new Date();
  const start29 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  const dateRange = `${start29.toISOString().slice(0, 10)} ~ ${now.toISOString().slice(0, 10)}`;

  return [
    {
      id: `lx-profit-${safeIdPart(tenantId)}-30D`,
      tenantId,
      windowKey: '30D',
      dateRange,
      currency: 'USD',
      salesVolume,
      salesVolumeMomPct: optionalNum(pick(firstRow, ['salesVolumeMom', 'volume_mom', 'volumeChainRatio'])),
      salesVolumeYoyPct: optionalNum(pick(firstRow, ['salesVolumeYoy', 'volume_yoy', 'volumeYearRatio'])),
      orderCount,
      salesAmountUsd: roundedSales,
      salesAmountMomPct: optionalNum(pick(firstRow, ['salesAmountMom', 'sales_mom'])),
      salesAmountYoyPct: optionalNum(pick(firstRow, ['salesAmountYoy', 'sales_yoy'])),
      adSpendUsd: roundedAdSpend,
      adSpendMomPct: optionalNum(pick(firstRow, ['adSpendMom', 'ads_spend_mom'])),
      adSpendYoyPct: optionalNum(pick(firstRow, ['adSpendYoy', 'ads_spend_yoy'])),
      adSalesUsd: roundedAdSales,
      adSalesMomPct: optionalNum(pick(firstRow, ['adSalesMom', 'ads_sales_mom'])),
      adSalesYoyPct: optionalNum(pick(firstRow, ['adSalesYoy', 'ads_sales_yoy'])),
      acosPercent,
      acosMomPct: optionalNum(pick(firstRow, ['acosMom', 'acos_mom'])),
      acosYoyPct: optionalNum(pick(firstRow, ['acosYoy', 'acos_yoy'])),
      refundAmountUsd: roundedRefund,
      refundAmountMomPct: optionalNum(pick(firstRow, ['refundAmountMom', 'refund_mom'])),
      refundAmountYoyPct: optionalNum(pick(firstRow, ['refundAmountYoy', 'refund_yoy'])),
      settlementGrossProfitUsd: roundedProfit,
      settlementGrossProfitMomPct: optionalNum(pick(firstRow, ['grossProfitMom', 'gross_profit_mom'])),
      settlementGrossProfitYoyPct: optionalNum(pick(firstRow, ['grossProfitYoy', 'gross_profit_yoy'])),
      settlementGrossMarginPercent,
      settlementGrossMarginMomPct: optionalNum(pick(firstRow, ['grossMarginMom', 'gross_margin_mom'])),
      settlementGrossMarginYoyPct: optionalNum(pick(firstRow, ['grossMarginYoy', 'gross_margin_yoy'])),
      sourceToolName,
      syncedAt: now.toISOString().replace('T', ' ').slice(0, 19),
    },
  ];
}

/**
 * Normalizes a pre-extracted (possibly multi-page merged) array of Lingxing raw records into typed X Cloud ERP entities.
 */
export function normalizeLingxingRecordsForDomain(
  toolName: string,
  domainHint: LingxingSyncDomain,
  rawRecords: LooseRecord[],
  tenantId: string,
  existingShops: AmazonShop[],
  existingListings: AmazonListingItem[],
  existingExchangeRates: ExchangeRateItem[] = []
): NormalizedLingxingSyncBundle {
  let domain = domainHint;
  if (domain === 'UNKNOWN' && rawRecords.length > 0) {
    const sampleKeys = Object.keys(rawRecords[0]).join(' ').toLowerCase();
    if (/rate_org|org_rate|my_rate/.test(sampleKeys)) domain = 'EXCHANGE_RATES';
    else if (/grossprofit|gross_profit|totalrefundamount|total_refund_amount/.test(sampleKeys)) domain = 'PROFIT_SUMMARY';
    else if (/amazonorderid|amazon_order_id|order_id|orderstatus/.test(sampleKeys)) domain = 'ORDERS';
    else if (/process_sn|product_list/.test(sampleKeys)) domain = 'BOM_ORDERS';
    else if (/st_md5|search_term_tags|targeting_text/.test(sampleKeys)) domain = 'SEARCH_TERMS';
    else if (/campaign_id|campaign_name|impressions|spends/.test(sampleKeys)) domain = 'ADS';
    else if (/settlementid|settlement_id|financialeventgroupid/.test(sampleKeys)) domain = 'SETTLEMENTS';
    else if (/supplier_code|supplier_name/.test(sampleKeys) && !/order_sn/.test(sampleKeys)) domain = 'SUPPLIERS';
    else if (/custom_order_sn|order_sn/.test(sampleKeys) && /item_list/.test(sampleKeys)) domain = 'PURCHASE_ORDERS';
    else if (/batch_state_id|batch_time/.test(sampleKeys)) domain = 'WAREHOUSE_LEDGERS';
    else if (/shipment_sn|logistics_channel_name/.test(sampleKeys)) domain = 'FBA_SHIPMENTS';
    else if (/default_spec_pack|good_num|wh_name/.test(sampleKeys)) domain = 'LOCAL_SKUS';
    else if (/asin|msku|fnsku|afn_fulfillable/.test(sampleKeys)) domain = 'LISTINGS';
    else if (/country_code|seller_id|shop_name/.test(sampleKeys)) domain = 'SHOPS';
  }

  const bundle: NormalizedLingxingSyncBundle = {
    shops: [],
    localSkus: [],
    listings: [],
    orders: [],
    suppliers: [],
    purchaseOrders: [],
    bomOrders: [],
    warehouseLedgers: [],
    fbaShipments: [],
    adCampaigns: [],
    searchTerms: [],
    settlements: [],
    exchangeRates: [],
    profitSummaries: [],
    rawCount: rawRecords.length,
    domain,
    toolName,
  };

  if (rawRecords.length === 0) return bundle;

  if (domain === 'SHOPS') {
    bundle.shops = normalizeLingxingShops(rawRecords, tenantId);
  } else if (domain === 'LOCAL_SKUS') {
    bundle.localSkus = normalizeLingxingLocalSkus(rawRecords, tenantId);
  } else if (domain === 'ORDERS') {
    bundle.orders = normalizeLingxingOrders(rawRecords, tenantId, existingShops);
  } else if (domain === 'SUPPLIERS') {
    bundle.suppliers = normalizeLingxingSuppliers(rawRecords, tenantId);
  } else if (domain === 'PURCHASE_ORDERS') {
    bundle.purchaseOrders = normalizeLingxingPurchaseOrders(rawRecords, tenantId);
  } else if (domain === 'BOM_ORDERS') {
    bundle.bomOrders = normalizeLingxingBomOrders(rawRecords, tenantId);
  } else if (domain === 'WAREHOUSE_LEDGERS') {
    bundle.warehouseLedgers = normalizeLingxingWarehouseLedgers(rawRecords, tenantId);
  } else if (domain === 'FBA_SHIPMENTS') {
    bundle.fbaShipments = normalizeLingxingFbaShipments(rawRecords, tenantId, existingShops);
  } else if (domain === 'ADS') {
    bundle.adCampaigns = normalizeLingxingAdCampaigns(rawRecords, tenantId, existingShops);
  } else if (domain === 'SEARCH_TERMS') {
    bundle.searchTerms = normalizeLingxingAdSearchTerms(rawRecords, tenantId);
  } else if (domain === 'SETTLEMENTS') {
    bundle.settlements = normalizeLingxingSettlements(rawRecords, tenantId, existingShops);
  } else if (domain === 'EXCHANGE_RATES') {
    bundle.exchangeRates = normalizeLingxingExchangeRates(rawRecords, tenantId);
  } else if (domain === 'PROFIT_SUMMARY') {
    bundle.profitSummaries = normalizeLingxingProfitSummary(
      rawRecords,
      tenantId,
      toolName,
      existingExchangeRates
    );
  } else {
    bundle.listings = normalizeLingxingListings(rawRecords, tenantId, existingShops, existingListings);
  }

  return bundle;
}

/**
 * Auto-detects entity type from a single MCP response payload + tool domain and normalizes them into typed X Cloud ERP entities.
 */
export function normalizeLingxingToolResponse(
  toolName: string,
  domainHint: LingxingSyncDomain,
  responsePayload: unknown,
  tenantId: string,
  existingShops: AmazonShop[],
  existingListings: AmazonListingItem[]
): NormalizedLingxingSyncBundle {
  const rawRecords = extractRecordsFromMcpResult(responsePayload);
  return normalizeLingxingRecordsForDomain(
    toolName,
    domainHint,
    rawRecords,
    tenantId,
    existingShops,
    existingListings
  );
}

/**
 * Checks whether an entity belongs to built-in demo fixtures (for clean replacement on real MCP sync).
 */
export function isDemoFixtureRecord(item: {
  id: string;
  shopName?: string;
  asin?: string;
  amazonOrderId?: string;
  sku?: string;
  shipmentId?: string;
  targetAsin?: string;
}): boolean {
  if (item.id.startsWith('lx-')) return false;
  if (item.asin && item.asin.startsWith('B00DEMO')) return true;
  if (item.targetAsin && item.targetAsin.startsWith('B00DEMO')) return true;
  if (item.amazonOrderId && item.amazonOrderId.includes('-DEMO-')) return true;
  if (item.shopName && item.shopName.startsWith('Store-Alpha-')) return true;
  if (item.sku && item.sku.startsWith('XC-ITEM-')) return true;
  if (item.shipmentId && item.shipmentId.includes('DEMO')) return true;
  return /^(shop-(us|de|uk|jp)-0\d|lst-0\d|ord-0\d|ad-0\d|set-0\d|sku-0\d|sup-0\d|po-0\d|bom-0\d|wh-log-0\d|fba-0\d|st-0\d|exp-0\d)$/.test(
    item.id
  );
}

/**
 * Merges incoming synced entities into existing collection by deterministic ID,
 * optionally stripping demo fixtures for the synced tenant.
 */
export function mergeSyncedEntities<
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
  existing: T[],
  incoming: T[],
  tenantId: string,
  clearDemoForTenant: boolean,
  pruneStaleLxRecords = false,
  prunePredicate?: (item: T) => boolean
): T[] {
  if (incoming.length === 0 && !clearDemoForTenant) return existing;

  const incomingIds = new Set(incoming.map((item) => item.id));
  const base = existing.filter((item) => {
    if (item.tenantId !== tenantId) return true;
    if (clearDemoForTenant && isDemoFixtureRecord(item)) return false;
    if (
      pruneStaleLxRecords &&
      incoming.length > 0 &&
      item.id.startsWith('lx-') &&
      !incomingIds.has(item.id) &&
      (!prunePredicate || prunePredicate(item))
    ) {
      return false;
    }
    return true;
  });

  const map = new Map<string, T>();
  for (const item of base) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}
