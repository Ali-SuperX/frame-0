"use client";

/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2026 FRAME/0 (openFrame)
 *
 * 代码指纹 / AGPL 合规 —— 启动时在浏览器控制台打印版权与源码地址。
 * 抄改本项目并部署的网站，开 DevTools 即见此 banner；删除它本身也是
 * AGPL-3.0 违约的旁证。不渲染任何可见 UI。
 */

import { useEffect } from "react";

export default function Fingerprint() {
  useEffect(() => {
    try {
      console.log(
        "%c FRAME/0 %c openFrame · AGPL-3.0 ",
        "background:#FF6A00;color:#fff;font-weight:700;padding:2px 7px;border-radius:3px 0 0 3px",
        "background:#1a1a1a;color:#FF6A00;padding:2px 7px;border-radius:0 3px 3px 0",
      );
      console.log(
        "%c© 2026 FRAME/0 · Source: https://github.com/ali-lanke/frame-0",
        "color:#999;font-size:11px",
      );
      console.log(
        "%cForked & deployed this? AGPL-3.0 requires you to publish your modified source to its users.",
        "color:#777;font-size:11px",
      );
    } catch {
      /* console unavailable — stay silent */
    }
  }, []);
  return null;
}
