import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // React 19 / eslint-plugin-react-hooks v6 的新规偏激进，会把项目里大量
    // 合理写法（同步外部状态到 state、render 期更新 ref 存最新值、配合
    // interval 的 Date.now()）一并标红。降为 warn：保留可见性、不阻塞 CI。
    // 真正关键的 react-hooks/rules-of-hooks 仍保持 error（违规已全部修复）。
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      // `_` 前缀的参数/变量是「有意保留不用」的约定，不报未用告警。
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
