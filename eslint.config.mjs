import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/*
 * Flat config, imported directly.
 *
 * This used to go through FlatCompat from @eslint/eslintrc, wrapping the old
 * "next/core-web-vitals" and "next/typescript" shareable names. Next 16 ships
 * @next/eslint-plugin-next as flat config by default, ahead of ESLint 10
 * dropping eslintrc support, and feeding a flat config back through the
 * eslintrc validator makes it throw inside its own error formatter — the
 * failure surfaces as a stack trace from JSON.stringify rather than as
 * anything about configuration.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  // eslint-config-next ignores these by default; repeating them keeps that
  // true, since declaring any globalIgnores replaces the defaults.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      /*
       * A warning, not an error, and deliberately so.
       *
       * eslint-plugin-react-hooks turns this on as an error in the version
       * Next 16 pulls in. It is right about the code: GiftResults and
       * GiftDetail both reset state from an effect when a prop changes, which
       * costs a second render pass, and React's own answer is to key the
       * component or derive during render instead.
       *
       * Both are pre-existing and neither is a bug on screen. Rewriting the
       * overlay's stack and the grid's paging as part of a framework upgrade
       * would mix a behavioural refactor into a version bump, and these are
       * the two most interaction-heavy components in the app. Left visible so
       * the next person working in either file is told, rather than silenced.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
