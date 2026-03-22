/**
 * Rebuild native addons for Electron. Must run with monorepo root as cwd so
 * hoisted node_modules (better-sqlite3, electron) resolve correctly.
 */
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const root = path.join(__dirname, '..')

const result = spawnSync(
  'npx',
  ['electron-rebuild', '-f', '-w', 'better-sqlite3'],
  { cwd: root, stdio: 'inherit', shell: true },
)

process.exit(result.status === null ? 1 : result.status)
