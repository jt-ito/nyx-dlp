const builder = require('electron-builder');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Platform = builder.Platform;

const target = process.argv[2]; // 'portable' or 'installer'
const version = require('./package.json').version;

async function build() {
  try {
    const isPortable = target === 'portable';
    console.log(`Building ${isPortable ? 'portable zip' : 'NSIS installer'} with electron-builder...`);

    const result = await builder.build({
      publish: 'never',
      targets: Platform.WINDOWS.createTarget(isPortable ? 'zip' : 'nsis'),
      config: {
        afterPack: async (context) => {
          if (isPortable) {
            console.log('Creating .portable marker inside the app folder...');
            fs.writeFileSync(path.join(context.appOutDir, '.portable'), '');
          }
        },
        artifactName: isPortable 
          ? `nyx-dlp-v${version}-portable.\${ext}` 
          : `nyx-dlp-v${version}-setup.\${ext}`
      }
    });

    console.log(`${target} build complete.`);
    console.log('Artifacts created:', result);
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
