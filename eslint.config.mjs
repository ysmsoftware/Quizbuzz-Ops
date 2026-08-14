import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// `next lint` (now removed in Next 16, see next-lint-to-eslint-cli codemod)
// only ever linted app/, components/, lib/ by convention — `server/` was
// never covered. Scoped explicitly here so switching to the bare `eslint`
// CLI doesn't silently start linting the whole backend for the first time.
export default defineConfig([{
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    extends: [...nextCoreWebVitals, ...nextTypescript],
}]);