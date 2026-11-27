import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ALL_PERMISSIONS_TREE,
  INITIAL_RBAC_ROLES,
  INITIAL_LISTINGS,
  INITIAL_LOCAL_SKUS,
  INITIAL_SHOPS,
} from '../src/data/initialErpData';

test('04-frontend-ui: Tailwind v4 dark mode custom variant is properly configured', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  assert.match(css, /@import\s+["']tailwindcss["'];/);
  assert.match(css, /@custom-variant\s+dark/);
});

test('04-frontend-ui: TENANT_ADMIN default role covers 100% of ALL_PERMISSIONS_TREE', () => {
  const allPerms = ALL_PERMISSIONS_TREE.flatMap((g) => g.permissions.map((p) => p.code));
  const adminRole = INITIAL_RBAC_ROLES.find((r) => r.roleCode === 'TENANT_ADMIN');
  assert.ok(adminRole, 'TENANT_ADMIN role must exist');
  for (const code of allPerms) {
    assert.ok(adminRole.permissions.includes(code), `TENANT_ADMIN missing permission ${code}`);
  }
});

test('04-frontend-ui: initial listings maintain referential integrity to shops and local SKUs', () => {
  const shopIds = new Set(INITIAL_SHOPS.map((s) => s.id));
  const skuCodes = new Set(INITIAL_LOCAL_SKUS.map((s) => s.sku));
  for (const listing of INITIAL_LISTINGS) {
    assert.ok(shopIds.has(listing.shopId), `Missing shopId ${listing.shopId}`);
    assert.ok(skuCodes.has(listing.localSkuCode), `Missing localSkuCode ${listing.localSkuCode}`);
  }
});

test('04-frontend-ui: App layout enforces mobile left-collapsible drawer and desktop icon-rail collapse', () => {
  const appSource = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(appSource.includes('mobileSidebarOpen'), 'Missing mobileSidebarOpen state');
  assert.ok(appSource.includes('-translate-x-full'), 'Missing mobile off-canvas slide class');
  assert.ok(appSource.includes('lg:translate-x-0'), 'Missing desktop static transform reset');
  assert.ok(appSource.includes('desktopSidebarCollapsed'), 'Missing desktopSidebarCollapsed state');
  assert.ok(appSource.includes('lg:w-16'), 'Missing desktop collapsed icon rail width');
});

test('04-frontend-ui: Lingxing-style cockpit, ProductPerformanceView, and OperationsToolsView are mounted in App', () => {
  const appSource = fs.readFileSync('src/App.tsx', 'utf8');
  const dashSource = fs.readFileSync('src/components/DashboardOverview.tsx', 'utf8');
  assert.ok(appSource.includes('<ProductPerformanceView'), 'Missing ProductPerformanceView mount');
  assert.ok(appSource.includes('<OperationsToolsView'), 'Missing OperationsToolsView mount');
  assert.ok(dashSource.includes('GLOBAL_SITE_CLOCKS'), 'Missing GLOBAL_SITE_CLOCKS in DashboardOverview');
  assert.ok(dashSource.includes('STOCKOUT_CERTAIN'), 'Missing STOCKOUT_CERTAIN replenishment widget in DashboardOverview');
});

test('04-frontend-ui: TablePagination is exported and wired into all 10 ERP data views', () => {
  const compSource = fs.readFileSync('src/components/TablePagination.tsx', 'utf8');
  assert.ok(compSource.includes('export function useTablePagination'), 'Missing useTablePagination export');
  assert.ok(compSource.includes('export const TablePagination'), 'Missing TablePagination export');

  const views = [
    'src/components/DashboardOverview.tsx',
    'src/components/ProductPerformanceView.tsx',
    'src/components/AmazonOrdersAndListingsView.tsx',
    'src/components/InventorySupplyChainView.tsx',
    'src/components/WarehouseInventoryView.tsx',
    'src/components/FbaShipmentsView.tsx',
    'src/components/AdvertisingDaypartingView.tsx',
    'src/components/FinanceAccountingView.tsx',
    'src/components/OperationsToolsView.tsx',
    'src/components/LingxingMcpConnectorView.tsx',
  ];
  for (const viewPath of views) {
    const src = fs.readFileSync(viewPath, 'utf8');
    assert.ok(src.includes('<TablePagination'), `${viewPath} must render <TablePagination>`);
    assert.ok(src.includes('useTablePagination'), `${viewPath} must use useTablePagination hook`);
  }
});
