"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

/**
 * 登录页 —— 用户名 + 密码。
 *
 * 成功后跳转 ?from=<path>（白名单：必须以 "/" 开头且不含 "//"，防 open redirect）。
 * 缺省跳 "/"。
 */
export default function LoginForm({ zh }: { zh: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function safeFrom(): string {
    const raw = search.get("from");
    if (!raw) return "/";
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    setBusy(true);
    const result = await login(username.trim(), password);
    if (result === true) {
      router.replace(safeFrom());
      return;
    }
    setErr(result);
    setBusy(false);
  }

  return (
    <div className="app login-app">
      <header className="chrome">
        <div className="left">
          <Link
            href={zh ? "/" : "/en"}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
              <b>LOGIN</b>
            </div>
          </Link>
        </div>
        <div className="right" />
      </header>

      <main className="login-main">
        <form className="login-card" onSubmit={onSubmit}>
          <h1 className="login-title">{zh ? "登录" : "Sign in"}</h1>
          <p className="login-sub">
            {zh
              ? "导演台与指南需要登录后访问"
              : "Director and Guide require sign-in"}
          </p>

          <label className="login-row">
            <span>{zh ? "用户名" : "Username"}</span>
            <input
              type="text"
              autoComplete="username"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
          </label>

          <label className="login-row">
            <span>{zh ? "密码" : "Password"}</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>

          {err && <div className="login-err">{err}</div>}

          <button
            type="submit"
            className="login-btn"
            disabled={busy || !username || !password}
          >
            {busy ? (zh ? "登录中…" : "Signing in…") : zh ? "登录" : "Sign in"}
          </button>

          <p style={{ textAlign: "center", fontSize: "12px", color: "var(--paper-mute)", marginTop: "8px" }}>
            {zh ? "没有账号？" : "No account? "}
            <Link href={zh ? "/register" : "/en/register"} style={{ color: "var(--accent)" }}>
              {zh ? "凭邀请码注册" : "Register with invite code"}
            </Link>
          </p>
        </form>
      </main>

      <style>{`
        .login-main {
          margin-top: 65px;
          min-height: calc(100vh - 65px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 24px;
        }
        .login-card {
          width: 100%;
          max-width: 380px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 32px 28px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .login-title {
          font-family: var(--font-serif);
          font-style: italic;
          font-weight: 400;
          font-size: 32px;
          margin: 0;
          color: var(--paper);
        }
        .login-sub {
          font-size: 12.5px;
          color: var(--paper-mute);
          margin: 0 0 12px;
        }
        .login-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .login-row > span {
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .login-row > input {
          background: var(--ink);
          border: 1px solid var(--line);
          color: var(--paper);
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 14px;
          font-family: var(--font-sans);
          outline: none;
          transition: border-color 0.15s;
        }
        .login-row > input:focus {
          border-color: var(--accent);
        }
        .login-err {
          color: var(--red, #f5524a);
          font-size: 12px;
          padding: 8px 12px;
          background: color-mix(in oklab, var(--red, #f5524a) 12%, transparent);
          border-radius: 6px;
        }
        .login-btn {
          margin-top: 8px;
          background: var(--accent);
          color: var(--ink);
          border: none;
          padding: 11px 0;
          border-radius: 6px;
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .login-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
