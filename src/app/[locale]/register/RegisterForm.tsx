"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function RegisterForm({ zh }: { zh: boolean }) {
  const router = useRouter();
  const { register } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setErr(zh ? "两次密码不一致" : "Passwords don't match");
      return;
    }
    setErr(null);
    setBusy(true);
    const result = await register(username.trim(), password, inviteCode.trim());
    if (result === true) {
      router.replace(zh ? "/studio" : "/en/studio");
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
              <b>REGISTER</b>
            </div>
          </Link>
        </div>
        <div className="right" />
      </header>

      <main className="login-main">
        <form className="login-card" onSubmit={onSubmit}>
          <h1 className="login-title">{zh ? "注册" : "Sign up"}</h1>
          <p className="login-sub">
            {zh ? "凭邀请码创建账号" : "Create an account with invite code"}
          </p>

          <label className="login-row">
            <span>{zh ? "邀请码" : "Invite code"}</span>
            <input
              type="text"
              required
              autoFocus
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              disabled={busy}
              placeholder={zh ? "8 位邀请码" : "8-char code"}
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em", textTransform: "uppercase" }}
            />
          </label>

          <label className="login-row">
            <span>{zh ? "用户名" : "Username"}</span>
            <input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              minLength={2}
              maxLength={32}
            />
          </label>

          <label className="login-row">
            <span>{zh ? "密码" : "Password"}</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              minLength={6}
            />
          </label>

          <label className="login-row">
            <span>{zh ? "确认密码" : "Confirm password"}</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              minLength={6}
            />
          </label>

          {err && <div className="login-err">{err}</div>}

          <button
            type="submit"
            className="login-btn"
            disabled={busy || !username || !password || !confirm || !inviteCode}
          >
            {busy ? (zh ? "注册中…" : "Registering…") : zh ? "注册" : "Sign up"}
          </button>

          <p style={{ textAlign: "center", fontSize: "12px", color: "var(--paper-mute)", marginTop: "8px" }}>
            {zh ? "已有账号？" : "Have an account? "}
            <Link href={zh ? "/login" : "/en/login"} style={{ color: "var(--accent)" }}>
              {zh ? "去登录" : "Sign in"}
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
