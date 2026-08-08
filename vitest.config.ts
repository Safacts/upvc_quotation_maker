import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest configuration — owned by Bugsy (QA).
 *
 * WHY `environment: "node"`:
 * Everything under test here is server-side (Next.js route handlers, pricing
 * math, JWT session helpers). Loading jsdom would be slower and would let a
 * server module accidentally depend on `window` without the suite catching it.
 * When we start testing React components, add a SEPARATE project entry with
 * `environment: "jsdom"` rather than flipping this global — server code must
 * keep failing loudly if it touches browser globals.
 *
 * WHY the narrow `include`:
 * The repo is a Flutter + Next.js hybrid. `test/widget_test.dart` and anything
 * under `build/`, `android/`, `ios/` etc. must never be picked up. Vitest is
 * scoped to `tests/**` only; Dart tests run via `flutter test`.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    exclude: [
      "node_modules/**",
      "build/**",
      ".next/**",
      "android/**",
      "ios/**",
      "windows/**",
      "linux/**",
      "macos/**",
      "web/**",
      "public/**",
      "test/**", // Flutter's Dart test folder
    ],
    // Route-handler tests mutate module-level env and rely on vi.mock; isolate
    // them so one suite cannot leak a mocked Supabase client into another.
    isolate: true,
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["**/*.d.ts"],
    },
  },
});
