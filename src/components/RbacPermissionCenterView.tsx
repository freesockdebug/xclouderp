import React, { useState } from 'react';
import {
  Tenant,
  SubscriptionPlan,
  AmazonShop,
  RbacRoleDefinition,
  RbacTeamMember,
  TenantInvitation,
  PermissionCode,
  AuditLogItem,
} from '../types/erp';
import { ALL_PERMISSIONS_TREE } from '../data/initialErpData';
import { checkTenantQuota } from '../lib/erpEngine';
import { Users, Shield, Building, FileText, Plus, Eye, MailPlus, CheckCircle2, XCircle } from 'lucide-react';

interface RbacPermissionCenterViewProps {
  currentTenant: Tenant;
  currentPlan: SubscriptionPlan;
  shops: AmazonShop[];
  roles: RbacRoleDefinition[];
  members: RbacTeamMember[];
  invitations: TenantInvitation[];
  activeMemberId: string;
  tenantAuditLogs: AuditLogItem[];
  isReadOnlyExpired: boolean;
  onAddMember: (member: Omit<RbacTeamMember, 'id' | 'tenantId' | 'lastLoginAt'>) => void;
  onUpdateMember: (memberId: string, patch: Partial<RbacTeamMember>) => void;
  onSwitchActiveMember: (memberId: string) => void;
  onCreateRole: (roleName: string, roleCode: string, description: string) => void;
  onToggleRolePermission: (roleId: string, permission: PermissionCode) => void;
  onCreateInvitation: (inv: {
    email: string;
    departmentName: string;
    roleCode: string;
    roleName: string;
    allowedShopIds: string[];
    hidePurchaseCost: boolean;
  }) => void;
  onAcceptInvitation: (invitationId: string) => void;
  onRevokeInvitation: (invitationId: string) => void;
}

export const RbacPermissionCenterView: React.FC<RbacPermissionCenterViewProps> = ({
  currentTenant,
  currentPlan,
  shops,
  roles,
  members,
  invitations,
  activeMemberId,
  tenantAuditLogs,
  isReadOnlyExpired,
  onAddMember,
  onUpdateMember,
  onSwitchActiveMember,
  onCreateRole,
  onToggleRolePermission,
  onCreateInvitation,
  onAcceptInvitation,
  onRevokeInvitation,
}) => {
  const [subTab, setSubTab] = useState<'members' | 'invitations' | 'roles' | 'departments' | 'audit'>('members');
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[1]?.id || roles[0]?.id || '');

  // New Member Form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDept, setNewDept] = useState('北美运营部');
  const [newRoleCode, setNewRoleCode] = useState(roles[1]?.roleCode || roles[0]?.roleCode || 'TENANT_ADMIN');
  const [newShopIds, setNewShopIds] = useState<string[]>([shops[0]?.id || 'shop-us-01']);
  const [newHideCost, setNewHideCost] = useState(true);
  const [formNotice, setFormNotice] = useState('');

  // New Invitation Form
  const [invEmail, setInvEmail] = useState('');
  const [invDept, setInvDept] = useState('欧洲运营部');
  const [invRoleCode, setInvRoleCode] = useState(roles[1]?.roleCode || roles[0]?.roleCode || 'TENANT_ADMIN');
  const [invShopIds, setInvShopIds] = useState<string[]>([shops[0]?.id || 'shop-us-01']);
  const [invHideCost, setInvHideCost] = useState(true);
  const [invNotice, setInvNotice] = useState('');

  // New Role Form
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleCodeInput, setNewRoleCodeInput] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  const quotaCheck = checkTenantQuota(currentTenant, currentPlan, 'USERS');
  const activeRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  const handleSubmitMember = (e: React.FormEvent) => {
    e.preventDefault();
    setFormNotice('');
    if (isReadOnlyExpired) {
      setFormNotice('当前租户处于只读到期状态，禁止新增成员。');
      return;
    }
    if (!quotaCheck.allowed) {
      setFormNotice(quotaCheck.reason || '员工席位配额已满');
      return;
    }
    if (!newName.trim() || !newEmail.trim()) {
      setFormNotice('请填写成员姓名与企业邮箱。');
      return;
    }
    const matchedRole = roles.find((r) => r.roleCode === newRoleCode);
    onAddMember({
      fullName: newName.trim(),
      email: newEmail.trim(),
      departmentName: newDept,
      roleCode: newRoleCode,
      roleName: matchedRole?.roleName || newRoleCode,
      authProvider: 'SUPABASE_AUTH',
      allowedShopIds: newShopIds,
      hidePurchaseCost: newHideCost,
      status: 'ACTIVE',
    });
    setNewName('');
    setNewEmail('');
    setFormNotice('已添加新团队成员并同步分配数据权限范围。');
  };

  const handleSubmitRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnlyExpired || !newRoleName.trim() || !newRoleCodeInput.trim()) return;
    onCreateRole(
      newRoleName.trim(),
      newRoleCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      newRoleDesc.trim() || '自定义岗位角色'
    );
    setNewRoleName('');
    setNewRoleCodeInput('');
    setNewRoleDesc('');
  };

  const handleSubmitInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    setInvNotice('');
    if (isReadOnlyExpired) {
      setInvNotice('当前租户处于只读到期状态，禁止发出新邀请。');
      return;
    }
    if (!invEmail.trim()) {
      setInvNotice('请输入受邀成员邮箱地址。');
      return;
    }
    const matchedRole = roles.find((r) => r.roleCode === invRoleCode) || roles[0];
    onCreateInvitation({
      email: invEmail.trim(),
      departmentName: invDept.trim() || '运营部',
      roleCode: matchedRole?.roleCode || invRoleCode,
      roleName: matchedRole?.roleName || invRoleCode,
      allowedShopIds: invShopIds,
      hidePurchaseCost: invHideCost,
    });
    setInvEmail('');
    setInvNotice('已生成 7 天有效期的企业入驻邀请链接，可点击下方按钮模拟受邀人接受入驻。');
  };

  const departments = Array.from(new Set(members.map((m) => m.departmentName))).map((dept) => {
    const deptMembers = members.filter((m) => m.departmentName === dept);
    const shopSet = new Set(deptMembers.flatMap((m) => m.allowedShopIds));
    return {
      departmentName: dept,
      memberCount: deptMembers.length,
      shopCount: shopSet.size,
      costMaskedCount: deptMembers.filter((m) => m.hidePurchaseCost).length,
    };
  });

  return (
    <div className="space-y-5">
      {/* Module Header & 4-Tab Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              企业 RBAC 权限管理中心 (租户管理员专属 · 仅管理本租户 {currentTenant.tenantCode})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              支持功能级「菜单/按钮三级权限树」与数据级「专人专店 Shop Scope + 1688 采购成本脱敏」，切换成员视角可立即体验实时鉴权
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs max-w-full">
            <button
              onClick={() => setSubTab('members')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'members'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>成员与店铺范围</span>
            </button>
            <button
              onClick={() => setSubTab('invitations')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'invitations'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <MailPlus className="w-3.5 h-3.5" />
              <span>待接受邀请 ({invitations.filter((i) => i.status === 'PENDING').length})</span>
            </button>
            <button
              onClick={() => setSubTab('roles')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'roles'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>角色与三级权限树</span>
            </button>
            <button
              onClick={() => setSubTab('departments')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'departments'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Building className="w-3.5 h-3.5" />
              <span>部门与 RLS 策略</span>
            </button>
            <button
              onClick={() => setSubTab('audit')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${
                subTab === 'audit'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>本企业审计日志</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab 1: Members & Shop Scope */}
      {subTab === 'members' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                团队成员列表与专人专店授权
              </h3>
              <span className="text-xs font-mono text-slate-500">
                当前席位配额: {quotaCheck.used} / {quotaCheck.limit} ({currentPlan.planCode})
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">成员 / 部门</th>
                    <th className="py-2.5 px-4">分配角色</th>
                    <th className="py-2.5 px-4">授权可见店铺 (Shop Scope)</th>
                    <th className="py-2.5 px-4">成本脱敏</th>
                    <th className="py-2.5 px-4">状态</th>
                    <th className="py-2.5 px-4 text-right">实时权限验证</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {members.map((m) => {
                    const isCurrentActor = m.id === activeMemberId;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {m.fullName} {isCurrentActor ? '· 当前视角' : ''}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {m.email} · {m.departmentName}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={m.roleCode}
                            disabled={isReadOnlyExpired || m.roleCode === 'TENANT_ADMIN'}
                            onChange={(e) => {
                              const nextRole = roles.find((r) => r.roleCode === e.target.value);
                              onUpdateMember(m.id, {
                                roleCode: e.target.value,
                                roleName: nextRole?.roleName || e.target.value,
                              });
                            }}
                            className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-60"
                          >
                            {roles.map((r) => (
                              <option key={r.id} value={r.roleCode}>
                                {r.roleName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1.5">
                            {shops.map((sh) => {
                              const checked = m.allowedShopIds.includes(sh.id);
                              return (
                                <label
                                  key={sh.id}
                                  className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-700 dark:text-slate-300 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={isReadOnlyExpired || m.roleCode === 'TENANT_ADMIN'}
                                    onChange={() => {
                                      const nextIds = checked
                                        ? m.allowedShopIds.filter((id) => id !== sh.id)
                                        : [...m.allowedShopIds, sh.id];
                                      onUpdateMember(m.id, { allowedShopIds: nextIds });
                                    }}
                                  />
                                  <span>{sh.marketplace}</span>
                                </label>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={m.hidePurchaseCost}
                              disabled={isReadOnlyExpired}
                              onChange={() =>
                                onUpdateMember(m.id, { hidePurchaseCost: !m.hidePurchaseCost })
                              }
                            />
                            <span className="text-[11px] text-slate-600 dark:text-slate-400">
                              {m.hidePurchaseCost ? '已脱敏 (***)' : '明文可见'}
                            </span>
                          </label>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <button
                            disabled={isReadOnlyExpired || m.roleCode === 'TENANT_ADMIN'}
                            onClick={() =>
                              onUpdateMember(m.id, {
                                status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                              })
                            }
                            className={`text-[11px] font-semibold disabled:opacity-50 ${
                              m.status === 'ACTIVE'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {m.status}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => onSwitchActiveMember(m.id)}
                            disabled={m.status !== 'ACTIVE'}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors disabled:opacity-40 ${
                              isCurrentActor
                                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold'
                                : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            <span>{isCurrentActor ? '当前体验中' : '切换此视角'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Member Form */}
          <form
            onSubmit={handleSubmitMember}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>新增本企业子账号 (自动校验套餐席位配额)</span>
              </h3>
              {formNotice && <span className="text-blue-600 dark:text-blue-400">{formNotice}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input
                type="text"
                placeholder="成员姓名，如 欧洲运营专员 D"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              <input
                type="email"
                placeholder="成员邮箱，如 ops-eu@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              <input
                type="text"
                placeholder="所属部门"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              <select
                value={newRoleCode}
                onChange={(e) => setNewRoleCode(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.roleCode}>
                    {r.roleName}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={isReadOnlyExpired || !quotaCheck.allowed}
                className="px-3 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
              >
                创建成员账号
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-600 dark:text-slate-400">
              <span>授权店铺:</span>
              {shops.map((sh) => (
                <label key={sh.id} className="inline-flex items-center gap-1 font-mono cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newShopIds.includes(sh.id)}
                    onChange={() =>
                      setNewShopIds((prev) =>
                        prev.includes(sh.id) ? prev.filter((id) => id !== sh.id) : [...prev, sh.id]
                      )
                    }
                  />
                  <span>{sh.shopName}</span>
                </label>
              ))}
              <label className="inline-flex items-center gap-1 ml-auto cursor-pointer">
                <input
                  type="checkbox"
                  checked={newHideCost}
                  onChange={() => setNewHideCost(!newHideCost)}
                />
                <span>隐藏采购底价与毛利敏感字段</span>
              </label>
            </div>
          </form>
        </div>
      )}

      {/* Tab 1.5: Team Invitations Workflow */}
      {subTab === 'invitations' && (
        <div className="space-y-5">
          <form
            onSubmit={handleSubmitInvitation}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <MailPlus className="w-4 h-4 text-blue-600" />
                <span>发送企业成员入驻邀请链接 (预绑定角色 + 店铺范围 + 成本脱敏)</span>
              </h3>
              {invNotice && <span className="text-blue-600 dark:text-blue-400">{invNotice}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                type="email"
                placeholder="受邀人邮箱，如 eu-ops@x-cloud-demo.example"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              <input
                type="text"
                placeholder="归属部门"
                value={invDept}
                onChange={(e) => setInvDept(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              <select
                value={invRoleCode}
                onChange={(e) => setInvRoleCode(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.roleCode}>
                    {r.roleName}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={isReadOnlyExpired}
                className="px-3 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
              >
                生成邀请链接
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-600 dark:text-slate-400">
              <span>预授权店铺:</span>
              {shops.map((sh) => (
                <label key={sh.id} className="inline-flex items-center gap-1 font-mono cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invShopIds.includes(sh.id)}
                    onChange={() =>
                      setInvShopIds((prev) =>
                        prev.includes(sh.id) ? prev.filter((id) => id !== sh.id) : [...prev, sh.id]
                      )
                    }
                  />
                  <span>{sh.shopName}</span>
                </label>
              ))}
              <label className="inline-flex items-center gap-1 ml-auto cursor-pointer">
                <input
                  type="checkbox"
                  checked={invHideCost}
                  onChange={() => setInvHideCost(!invHideCost)}
                />
                <span>入驻后默认脱敏采购成本</span>
              </label>
            </div>
          </form>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                本企业待接受与历史邀请记录 (/t/{currentTenant.slug}/invite/...)
              </h3>
              <span className="text-xs font-mono text-slate-500">
                当前席位: {quotaCheck.used} / {quotaCheck.limit}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">受邀人邮箱 / 部门</th>
                    <th className="py-2.5 px-4">预绑定角色与范围</th>
                    <th className="py-2.5 px-4">邀请路径与过期时间</th>
                    <th className="py-2.5 px-4">状态</th>
                    <th className="py-2.5 px-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {invitations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 px-4 text-center text-slate-500">
                        当前租户暂无团队邀请记录，可在上方表单生成入驻邀请链接。
                      </td>
                    </tr>
                  ) : (
                    invitations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-slate-900 dark:text-white">
                            {inv.email}
                          </div>
                          <div className="text-[11px] text-slate-500">{inv.departmentName}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {inv.roleName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            Shops: {inv.allowedShopIds.length} · 成本{inv.hidePurchaseCost ? '脱敏' : '明文'}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <div className="text-[11px] text-blue-600 dark:text-blue-400">
                            /t/{currentTenant.slug}/invite/{inv.inviteToken}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            有效期至 {inv.expiresAt}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold">
                          <span
                            className={
                              inv.status === 'PENDING'
                                ? 'text-amber-600 dark:text-amber-400'
                                : inv.status === 'ACCEPTED'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-400'
                            }
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {inv.status === 'PENDING' ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => onAcceptInvitation(inv.id)}
                                disabled={isReadOnlyExpired || !quotaCheck.allowed}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 rounded disabled:opacity-45"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>模拟接受入驻</span>
                              </button>
                              <button
                                onClick={() => onRevokeInvitation(inv.id)}
                                disabled={isReadOnlyExpired}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded disabled:opacity-45"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>撤销</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono">已终结</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Roles & 3-Level Menu/Button Permission Tree */}
      {subTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left 4 Cols: Role List + Create Custom Role */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white">
                本企业岗位角色列表 ({roles.length})
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {roles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`w-full text-left px-4 py-3 text-xs transition-colors ${
                      activeRole?.id === r.id
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span>{r.roleName}</span>
                      <span className="font-mono text-[11px]">{r.permissions.length} 项权限</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{r.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleSubmitRole}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5 text-xs"
            >
              <div className="font-semibold text-slate-900 dark:text-white">新增自定义角色</div>
              <input
                type="text"
                placeholder="角色名称，如 广告投放专员"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              <input
                type="text"
                placeholder="角色编码，如 ADS_SPECIALIST"
                value={newRoleCodeInput}
                onChange={(e) => setNewRoleCodeInput(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              <input
                type="text"
                placeholder="职责说明"
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
              <button
                type="submit"
                disabled={isReadOnlyExpired}
                className="w-full py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
              >
                新建角色
              </button>
            </form>
          </div>

          {/* Right 8 Cols: Interactive 3-Level Menu/Button Permission Tree */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  三级菜单 / 按钮权限配置树 — {activeRole?.roleName} ({activeRole?.roleCode})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  勾选或取消任意权限码后，左侧菜单与页面内的操作按钮将实时联动生效
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                已授予 {activeRole?.permissions.length || 0} 项
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {ALL_PERMISSIONS_TREE.map((group) => (
                <div
                  key={group.moduleId}
                  className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mb-2.5">
                    {group.moduleLabel}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {group.permissions.map((perm) => {
                      const checked = activeRole?.permissions.includes(perm.code) || false;
                      return (
                        <label
                          key={perm.code}
                          className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={
                              isReadOnlyExpired ||
                              (activeRole?.roleCode === 'TENANT_ADMIN' &&
                                perm.code === 'rbac:manage')
                            }
                            onChange={() =>
                              activeRole && onToggleRolePermission(activeRole.id, perm.code)
                            }
                            className="mt-0.5"
                          />
                          <div>
                            <div>{perm.label}</div>
                            <div className="text-[10px] font-mono text-slate-500">{perm.code}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Departments & RLS Data Policy */}
      {subTab === 'departments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
              企业组织部门与数据边界概览
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">部门名称</th>
                  <th className="py-2.5 px-4 text-right">成员数</th>
                  <th className="py-2.5 px-4 text-right">覆盖店铺数</th>
                  <th className="py-2.5 px-4 text-right">成本脱敏人数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {departments.map((d) => (
                  <tr key={d.departmentName}>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {d.departmentName}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{d.memberCount}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{d.shopCount}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {d.costMaskedCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              PostgreSQL RLS 行级数据隔离策略预览
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              系统在数据库内核层强制执行「租户边界 (tenant_id) + 店铺白名单 (allowed_shop_ids) + 订阅写锁 (is_tenant_writable)」三重校验：
            </p>
            <pre className="mt-3 p-3.5 bg-slate-950 text-slate-200 text-[11px] font-mono rounded overflow-x-auto leading-relaxed">{`CREATE POLICY "rls_shop_scope_read" ON amz_listings_daily
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (
      EXISTS (SELECT 1 FROM sys_tenant_members m
              WHERE m.user_id = auth.uid() AND m.role_code = 'TENANT_ADMIN')
      OR shop_id = ANY (
        SELECT UNNEST(allowed_shop_ids) FROM sys_tenant_members
        WHERE user_id = auth.uid() AND status = 'ACTIVE'
      )
    )
  );`}</pre>
          </div>
        </div>
      )}

      {/* Tab 4: Tenant Audit Logs */}
      {subTab === 'audit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              本企业内部安全与业务操作审计日志 (Scope: TENANT · {currentTenant.tenantCode})
            </h3>
            <span className="text-xs font-mono text-slate-500">共 {tenantAuditLogs.length} 条</span>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {tenantAuditLogs.map((log) => (
              <div key={log.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                    [{log.actorType}]
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {log.actorName}
                  </span>
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
      )}
    </div>
  );
};
