// commitlint config
//
// Enforces Conventional Commits with mandatory scope per PROJECT_BRIEF.md §5.1:
//   "O scope identifica o serviço afetado e direciona o release-please ao
//    package correto."
//
// Scopes are explicitly enumerated. Add a new entry whenever a new service or
// area is introduced. Fail loud > fail silent.

module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Scope is mandatory.
    "scope-empty": [2, "never"],

    // Allowed scopes — keep this list curated.
    "scope-enum": [
      2,
      "always",
      [
        // -------------------- services --------------------
        // Add a service here when it lands in services/<name>/.
        "hello-service",

        // -------------------- monorepo areas --------------------
        "repo", // root configs (.gitignore, README, LICENSE, etc.)
        "deps", // dependency bumps that span multiple workspaces
        "ci", // GitHub Actions and CI tooling
        "docs", // documentation, ADRs, runbooks, brief
        "infra", // Ansible, OpenTofu, Compose, k8s, Traefik
        "contracts", // contracts/proto, contracts/openapi
        "frontend", // frontend/web, frontend/admin, frontend/shared
        "observability", // OTel, Prometheus, Loki, Tempo, Grafana
        "security", // SECURITY.md, security policies, hardening
        "release", // release-please bookkeeping
      ],
    ],

    // Allow long subjects in some commits (e.g. squash merges).
    "header-max-length": [1, "always", 100],

    // Don't be opinionated about subject case — Spring/Maven prefer different conventions.
    "subject-case": [0],
  },
};
