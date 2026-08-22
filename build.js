const builder = require('electron-builder');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Platform = builder.Platform;

const target = process.argv[2]; // 'portable' | 'installer' | 'mac' | 'linux' | 'linux-cli'
const version = require('./package.json').version;

const TARGETS = {
  portable: {
    platform: Platform.WINDOWS,
    target: 'zip',
    artifactName: `nyx-dlp-v${version}-portable.\${ext}`,
    afterPack: async (context) => {
      console.log('Creating .portable marker inside the app folder...');
      fs.writeFileSync(path.join(context.appOutDir, '.portable'), '');
    }
  },
  installer: {
    platform: Platform.WINDOWS,
    target: 'nsis',
    artifactName: `nyx-dlp-v${version}-setup.\${ext}`
  },
  mac: {
    platform: Platform.MAC,
    target: 'dmg',
    artifactName: `nyx-dlp-v${version}-macos.\${ext}`
  },
  linux: {
    platform: Platform.LINUX,
    target: 'AppImage',
    artifactName: `nyx-dlp-v${version}-linux.\${ext}`
  },
  'linux-cli': {
    platform: Platform.LINUX,
    target: 'dir',
    artifactName: `nyx-dlp-v${version}-linux-cli.\${ext}`,
    afterPack: async (context) => {
      console.log('Injecting CLI executables, web assets, and modules into dir build...');
      const filesToCopy = ['cli.js', 'server.js', 'package.json', 'index.html', 'login.html', 'styles.css'];
      const dirsToCopy = ['lib', 'renderer', 'assets'];

      for (const file of filesToCopy) {
        const src = path.join(__dirname, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(context.appOutDir, file));
        }
      }
      for (const dir of dirsToCopy) {
        const src = path.join(__dirname, dir);
        if (fs.existsSync(src)) {
          fs.cpSync(src, path.join(context.appOutDir, dir), { recursive: true });
        }
      }

      const clijs = path.join(context.appOutDir, 'cli.js');
      const alias = path.join(context.appOutDir, 'nyx-dlp-cli');
      if (fs.existsSync(clijs)) {
        fs.chmodSync(clijs, 0o755);
        fs.copyFileSync(clijs, alias);
        fs.chmodSync(alias, 0o755);
      }
    }
  }
};

async function build() {
  const cfg = TARGETS[target];
  if (!cfg) {
    console.error(`Unknown target: "${target}". Valid targets: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }

  try {
    console.log(`Building ${target} with electron-builder...`);

    const config = {
      artifactName: cfg.artifactName
    };
    if (cfg.afterPack) config.afterPack = cfg.afterPack;

    const result = await builder.build({
      publish: 'never',
      targets: cfg.platform.createTarget(cfg.target),
      config
    });

    console.log(`${target} build complete.`);
    console.log('Artifacts created:', result);

    // For linux-cli, create a tar.gz of the dir output
    if (target === 'linux-cli') {
      await createCliTarball();
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

async function createCliTarball() {
  const distDir = path.join(__dirname, 'dist', 'installer');
  // Find the linux-unpacked dir
  const unpackedDir = path.join(distDir, 'linux-unpacked');
  if (!fs.existsSync(unpackedDir)) {
    console.error('linux-unpacked directory not found, skipping tarball creation.');
    return;
  }

  const tarballName = `nyx-dlp-v${version}-linux-cli.tar.gz`;
  const tarballPath = path.join(distDir, tarballName);

  console.log(`Creating ${tarballName}...`);
  execSync(`tar -czf "${tarballPath}" -C "${distDir}" linux-unpacked`, { stdio: 'inherit' });
  console.log(`CLI tarball created: ${tarballPath}`);
}

build();
