// Builds the Spec Lint edition of Bruno: installed as "Bruno SpecLint", next to an official Bruno,
// with settings of its own.
//
//   node scripts/build-speclint.js <mac|win> [--version <semver>] [--x64|--arm64]
//
// mac builds an unsigned .dmg; win builds an NSIS installer (.exe) and a .zip that runs without
// installing. Without an arch flag electron-builder builds for the machine it runs on. The version
// defaults to SPECLINT_VERSION from the environment, then to DEFAULT_VERSION.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { prepareElectronWeb } = require('./build-electron');

const PRODUCT_NAME = 'Bruno SpecLint';
const PACKAGE_NAME = 'bruno-speclint';
const APP_ID = 'com.usebruno.app.speclint';
const DEFAULT_VERSION = '4.2.1-speclint.1';

const TARGET_ARGS = {
  // There is no Apple certificate for this edition, so the app is left unsigned.
  mac: ['--mac', 'dmg', '-c.mac.identity=null'],
  win: ['--win', 'nsis', 'zip']
};
const ARCH_FLAGS = ['--x64', '--arm64'];
// electron-builder rejects versions that are not semver.
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const rootDir = path.join(__dirname, '..');
const electronDir = path.join(rootDir, 'packages/bruno-electron');
const appPackagePath = path.join(rootDir, 'packages/bruno-app/package.json');

const parseArgs = (argv) => {
  const [platform, ...rest] = argv;
  if (!TARGET_ARGS[platform]) {
    throw new Error(`Unknown platform "${platform}". Use mac or win.`);
  }
  let version = process.env.SPECLINT_VERSION || DEFAULT_VERSION;
  const archArgs = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--version') {
      version = rest[++i];
    } else if (ARCH_FLAGS.includes(rest[i])) {
      archArgs.push(rest[i]);
    } else {
      throw new Error(`Unknown option "${rest[i]}".`);
    }
  }
  if (!SEMVER.test(version || '')) {
    throw new Error(`Version "${version}" is not a semver version such as ${DEFAULT_VERSION}.`);
  }
  return { platform, version, archArgs };
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
  }
};

// The version Bruno shows in its status bar is read from bruno-app's package.json when the web app is built.
const buildWebWithVersion = (version) => {
  const original = fs.readFileSync(appPackagePath, 'utf8');
  const withVersion = original.replace(/"version": "[^"]*"/, `"version": "${version}"`);
  fs.writeFileSync(appPackagePath, withVersion);
  try {
    // npm is npm.cmd on Windows, which needs a shell; the arguments hold no spaces or quotes.
    run('npm', ['run', 'build:web'], { cwd: rootDir, shell: process.platform === 'win32' });
  } finally {
    fs.writeFileSync(appPackagePath, original);
  }
};

const buildElectron = ({ platform, version, archArgs }) => {
  // electron-builder's CLI runs through node directly, so names with spaces need no shell quoting.
  const cli = require.resolve('electron-builder/cli.js', { paths: [electronDir] });
  run(process.execPath, [
    cli,
    ...TARGET_ARGS[platform],
    ...archArgs,
    // On CI electron-builder otherwise tries to publish to GitHub Releases, which needs a token.
    '--publish', 'never',
    '--config', 'electron-builder-config.js',
    `-c.productName=${PRODUCT_NAME}`,
    `-c.appId=${APP_ID}`,
    `-c.extraMetadata.name=${PACKAGE_NAME}`,
    `-c.extraMetadata.productName=${PRODUCT_NAME}`,
    `-c.extraMetadata.version=${version}`
  ], { cwd: electronDir });
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  buildWebWithVersion(options.version);
  // prepareElectronWeb works with paths relative to the repository root.
  process.chdir(rootDir);
  await prepareElectronWeb();
  buildElectron(options);
  console.log(`Done. The ${options.platform} build of ${PRODUCT_NAME} ${options.version} is in ${path.join(electronDir, 'out')}`);
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
