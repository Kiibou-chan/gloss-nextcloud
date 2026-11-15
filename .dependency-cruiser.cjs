module.exports = {
  forbidden: [
    { name: 'domain-pure', severity: 'error', from: { path: '^src/domain/' }, to: { pathNot: '^src/domain/' } },
    { name: 'app-only-domain-and-app', severity: 'error', from: { path: '^src/app/' }, to: { pathNot: '^src/(domain|app)/' } },
    { name: 'adapters-no-ui', severity: 'error', from: { path: '^src/adapters/' }, to: { path: '^src/ui/' } },
    { name: 'adapters-allowed-layers', severity: 'error', from: { path: '^src/adapters/' }, to: { path: '^src/', pathNot: '^src/(adapters|app|domain)/' } },
    { name: 'ui-no-adapters', severity: 'error', from: { path: '^src/ui/' }, to: { path: '^src/adapters/' } },
    { name: 'ui-allowed-layers', severity: 'error', from: { path: '^src/ui/' }, to: { pathNot: '^(src/(ui|app|domain)/|node_modules/(preact|@preact/signals)/|preact(?:/|$)|@preact/signals(?:/|$))' } },
    { name: 'main-is-wiring', severity: 'error', from: {}, to: { path: '^src/main\\.ts$' } },
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
}
