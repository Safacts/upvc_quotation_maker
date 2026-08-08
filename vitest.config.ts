import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest configuration — owned by Bugsy (QA).
 *
 * TWO PROJECTS, SPLIT BY FILE EXTENSION:
 *
 *   `server`  tests/**\/*.test.ts   environment: node
 *   `client`  tests/**\/*.test.tsx  environment: jsdom
 *
 * WHY SPLIT BY EXTENSION AND NOT BY AN EXPLICIT FILE LIST:
 * The first attempt named `tests/console-ui.test.tsx` literally in the client
 * project and excluded it from the server one. That looks tidy and is a trap —
 * `extends: true` merges the ROOT `include` into each project, so every `.ts`
 * suite was collected by BOTH projects and ran twice (96 "passing" tests for a
 * 48-test file). Doubling the runtime is the mild symptom; the real one is that
 * a node-only suite silently gained a jsdom run where `window` exists, so a
 * server module that accidentally touches a browser global would still pass.
 *
 * Extension is the honest discriminator: a `.tsx` test renders components and
 * needs a DOM, a `.ts` test does not. The root config therefore declares NO
 * `include` at all — each project owns its own, with no merge to reason about.
 *
 * WHY `environment: node` is the default for server tests:
 * Route handlers, pricing math and JWT helpers are server-side. Loading jsdom
 * would be slower and would let a server module depend on `window` without the
 * suite catching it. That failure must stay loud.
 *
 * WHY the exclusions:
 * The repo is a Flutter + Next.js hybrid. `test/widget_test.dart` and anything
 * under `build/`, `android/`, `ios/` must never be picked up — Dart tests run
 * via `flutter test`.
 */

/** Shared by both projects; `test/` is Flutter's Dart folder, not ours. */
const SHARED_EXCLUDE = [
  "node_modules/**",
  "build/**",
  ".next/**",
  ".next-verify/**",
  "android/**",
  "ios/**",
  "windows/**",
  "linux/**",
  "macos/**",
  "web/**",
  "public/**",
  "test/**",
];

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    // Route-handler tests mutate module-level env and rely on vi.mock; isolate
    // them so one suite cannot leak a mocked Supabase client into another.
    isolate: true,
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["**/*.d.ts"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: SHARED_EXCLUDE,
        },
      },
      {
        extends: true,
        test: {
          name: "client",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          exclude: SHARED_EXCLUDE,
          setupFiles: ["tests/console-ui-setup.ts"],
        },
      },
    ],
  },
});
