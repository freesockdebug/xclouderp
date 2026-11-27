import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Sun,
  Moon,
  ArrowRight,
  KeyRound,
} from 'lucide-react';
import type { AuthSessionUser, AuthStatusPayload } from '../services/authService';
import { loginWithPassword, setupInitialAdmin } from '../services/authClient';

interface LoginGateViewProps {
  authStatus: AuthStatusPayload | null;
  statusError?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onAuthenticated: (user: AuthSessionUser) => void;
  onRefreshStatus: () => void;
}

export const LoginGateView: React.FC<LoginGateViewProps> = ({
  authStatus,
  statusError,
  darkMode,
  onToggleDarkMode,
  onAuthenticated,
  onRefreshStatus,
}) => {
  const isInitialSetup = Boolean(authStatus?.needsInitialSetup);

  const [email, setEmail] = useState(authStatus?.defaultAdminEmailHint || '');
  const [fullName, setFullName] = useState('Platform Super Admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (authStatus?.defaultAdminEmailHint && !email) {
      setEmail(authStatus.defaultAdminEmailHint);
    }
  }, [authStatus?.defaultAdminEmailHint, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('请输入登录邮箱地址。');
      return;
    }
    if (!password) {
      setErrorMessage('请输入登录密码。');
      return;
    }

    if (isInitialSetup) {
      if (password.length < 8) {
        setErrorMessage('管理员密码长度不能少于 8 位。');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('两次输入的密码不一致，请重新确认。');
        return;
      }

      setSubmitting(true);
      const res = await setupInitialAdmin({
        email: cleanEmail,
        fullName: fullName.trim() || 'Platform Super Admin',
        password,
      });
      setSubmitting(false);

      if (!res.ok) {
        setErrorMessage(res.message);
        if (res.errorCode === 'ALREADY_INITIALIZED') {
          onRefreshStatus();
        }
        return;
      }
      setPassword('');
      setConfirmPassword('');
      onAuthenticated(res.user);
      return;
    }

    setSubmitting(true);
    const res = await loginWithPassword({
      email: cleanEmail,
      password,
    });
    setSubmitting(false);

    if (!res.ok) {
      setErrorMessage(res.message);
      return;
    }

    setPassword('');
    onAuthenticated(res.user);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top minimal bar */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-blue-600 text-white flex items-center justify-center font-mono text-xs font-bold">
            XC
          </div>
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            X Cloud ERP
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label={darkMode ? '切换浅色模式' : '切换暗色模式'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>浅色</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-slate-600" />
              <span>暗色</span>
            </>
          )}
        </button>
      </header>

      {/* Main split workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12">
        {/* Left architectural narrative column (Desktop) */}
        <section className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between p-12 xl:p-16 bg-slate-900 text-slate-100 border-r border-slate-800">
          <div className="space-y-6 max-w-xl">
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-blue-400">
              Cross-Border Multi-Tenant ERP
            </div>
            <h1 className="text-3xl xl:text-4xl font-bold tracking-tight text-white leading-tight">
              亚马逊多租户业财一体与供应链中台
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              所有业务接口与租户数据均受服务端签名会话鉴权保护。请完成身份验证后进入平台超管控制台或卖家租户工作台。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-slate-800 max-w-2xl">
            <div className="space-y-1.5">
              <div className="text-xs font-mono text-blue-400">01 / ISOLATION</div>
              <div className="text-sm font-semibold text-white">双门户权限隔离</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                平台超管与租户成员按角色隔离，店铺级数据范围与成本脱敏实时生效。
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-mono text-blue-400">02 / ON-DEMAND</div>
              <div className="text-sm font-semibold text-white">后台按需分页查询</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                全量数据留在后台数据库，仅按当前视图与页码实时返回所需切片。
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-mono text-blue-400">03 / SYNC</div>
              <div className="text-sm font-semibold text-white">领星 MCP 增量同步</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                支持服务端定时与增量同步订单、库存、广告及利润台账至云端数据库。
              </p>
            </div>
          </div>
        </section>

        {/* Right authentication form column */}
        <section className="lg:col-span-6 xl:col-span-5 flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-mono uppercase tracking-wider">
                {isInitialSetup ? (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>FIRST-RUN ADMIN SETUP</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>AUTHENTICATION REQUIRED</span>
                  </>
                )}
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {isInitialSetup ? '初始化平台超级管理员账号' : '登录 X Cloud ERP'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {isInitialSetup
                  ? '首次启用登录验证，请设置首位平台超级管理员的登录邮箱与密码。初始化完成后该注册入口将自动锁定。'
                  : '请输入您的工作邮箱与密码以获取签名会话凭证。'}
              </p>
            </div>

            {(errorMessage || statusError) && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 rounded border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage || statusError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isInitialSetup && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-fullname"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    管理员姓名
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="例如：系统管理员"
                      autoComplete="name"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  登录邮箱
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.com"
                    autoComplete="username"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {isInitialSetup ? '设置管理员密码（至少 8 位）' : '登录密码'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={isInitialSetup ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isInitialSetup ? '请输入至少 8 位强密码' : '请输入登录密码'}
                    autoComplete={isInitialSetup ? 'new-password' : 'current-password'}
                    className="w-full pl-9 pr-10 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isInitialSetup && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-confirm-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    确认管理员密码
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="请再次输入管理员密码"
                      autoComplete="new-password"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !authStatus}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
              >
                <span>
                  {submitting
                    ? '正在验证...'
                    : isInitialSetup
                    ? '初始化管理员并进入系统'
                    : '登录进入工作台'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
              <div>
                会话凭证仅保存在当前浏览器运行内存中，刷新页面或点击退出登录即自动清除。
              </div>
              {authStatus?.envAdminConfigured && (
                <div className="font-mono text-slate-600 dark:text-slate-300">
                  已检测到服务端环境变量托管管理员凭据。
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
