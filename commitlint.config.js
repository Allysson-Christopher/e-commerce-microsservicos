// commitlint config
//
// Enforces Conventional Commits with mandatory scope (PROJECT_BRIEF.md §5.1)
// and a *conditional* body requirement designed for solo-dev-with-LLM
// workflows: types that record decisions or behavior (feat/fix/refactor/perf)
// must include a body explaining the WHY; trivial bookkeeping types
// (chore/docs/style/ci/build/test) may stand on the subject alone.
//
// Rationale: every commit message is consumed by future Claude Code sessions
// as project memory. See CLAUDE.md "Commit messages" for the full policy.

const REQUIRE_BODY_TYPES = ["feat", "fix", "refactor", "perf"];
const MIN_BODY_CHARS = 50;

module.exports = {
  extends: ["@commitlint/config-conventional"],

  plugins: [
    {
      rules: {
        // Body must exist and be substantive for feat/fix/refactor/perf and
        // for any commit marked as a breaking change (`!` after type/scope).
        "body-required-when-typed": ({ type, body, header }) => {
          const isBreaking = /!:/.test(header || "");
          const requires = REQUIRE_BODY_TYPES.includes(type) || isBreaking;
          if (!requires) return [true];

          const trimmed = (body || "").trim();
          if (trimmed.length === 0) {
            return [
              false,
              `commits of type [${REQUIRE_BODY_TYPES.join(", ")}] or with breaking change (!) require a body explaining the WHY (see CLAUDE.md)`,
            ];
          }
          if (trimmed.length < MIN_BODY_CHARS) {
            return [
              false,
              `commit body is too short (${trimmed.length} chars; minimum ${MIN_BODY_CHARS}). Explain the WHY, not the WHAT — see CLAUDE.md`,
            ];
          }
          return [true];
        },
      },
    },
  ],

  rules: {
    // ---- Header ----
    "header-max-length": [2, "always", 100],
    "subject-case": [0],

    // ---- Type ----
    "type-empty": [2, "never"],
    "type-case": [2, "always", "lower-case"],

    // ---- Scope (mandatory + curated list) ----
    "scope-empty": [2, "never"],
    "scope-enum": [
      2,
      "always",
      [
        // -------------------- services --------------------
        "hello-service",

        // -------------------- monorepo areas --------------------
        "repo", // root configs (.gitignore, README, LICENSE, CLAUDE.md, ...)
        "deps", // dependency bumps spanning multiple workspaces
        "ci", // GitHub Actions and CI tooling
        "docs", // documentation, ADRs, runbooks, brief
        "infra", // Ansible, OpenTofu, Compose, k8s/Helm, Traefik
        "contracts", // contracts/proto, contracts/openapi
        "frontend", // frontend/web, frontend/admin, frontend/shared
        "observability", // OTel, Prometheus, Loki, Tempo, Grafana
        "security", // SECURITY.md, hardening, threat model
        "release", // release-please bookkeeping
      ],
    ],

    // ---- Body ----
    "body-leading-blank": [2, "always"],
    "body-max-line-length": [2, "always", 100],
    "body-required-when-typed": [2, "always"],

    // ---- Footer ----
    "footer-leading-blank": [1, "always"],
    "footer-max-line-length": [2, "always", 200],
  },
};
