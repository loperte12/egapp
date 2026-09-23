// Metro config — monorepo pnpm workspace (paquete interno @egrouteplan/ui-kit).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Observar los paquetes internos del workspace.
config.watchFolders = [path.resolve(projectRoot, 'packages')];

// Resolución de node_modules (raíz del workspace-app).
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Symlinks de pnpm (paquetes workspace enlazados).
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
