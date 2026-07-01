const { packager } = require('@electron/packager');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const target = process.argv[2]; // 'portable' or 'installer'
const outPath = target === 'portable' ? 'dist/portable' : 'dist/installer';

async function build() {
  try {
    console.log(`Building ${target} to ${outPath}...`);
    await packager({
      dir: '.',
      name: 'nyx-dlp',
      platform: 'win32',
      arch: 'x64',
      out: outPath,
      overwrite: true,
      asar: false,
      extraResource: 'scripts',
      icon: 'assets/icon.ico',
      ignore: (filePath) => {
        if (!filePath) return false;
        // Normalize slashes for comparison
        const normalized = filePath.replace(/\\/g, '/');
        
        // Ignore specific folders
        if (normalized.includes('/.git/') || normalized.endsWith('/.git')) return true;
        if (normalized.includes('/.github/') || normalized.endsWith('/.github')) return true;
        if (normalized.includes('/.gemini/') || normalized.endsWith('/.gemini')) return true;
        if (normalized.includes('/dist/') || normalized.endsWith('/dist')) return true;
        if (normalized.includes('/temp_dl/') || normalized.endsWith('/temp_dl')) return true;
        if (normalized.includes('/scripts/') || normalized.endsWith('/scripts')) return true;
        
        // Ignore specific files and patterns
        if (normalized.includes('__pycache__')) return true;
        if (/\.md$/.test(normalized)) return true;
        if (/\.py$/.test(normalized)) return true;
        if (/\.patch$/.test(normalized)) return true;
        if (/\.txt$/.test(normalized)) return true;
        if (/\.mp4$/.test(normalized)) return true;
        if (/\.part$/.test(normalized)) return true;
        if (/\.mkv$/.test(normalized)) return true;
        if (/\.webm$/.test(normalized)) return true;
        if (/\.avi$/.test(normalized)) return true;
        if (/\.log$/.test(normalized)) return true;
        
        return false;
      },
      afterPrune: [
        async (buildPath, electronVersion, pPlatform, pArch) => {
          try {
            console.log('Repairing pruned node_modules in temp directory...');
            const nodeModulesPath = path.join(buildPath, 'node_modules');
            if (fs.existsSync(nodeModulesPath)) {
              fs.rmSync(nodeModulesPath, { recursive: true, force: true });
            }
            execSync('npm install --omit=dev', { cwd: buildPath, stdio: 'inherit' });
          } catch (e) {
            console.error('Repair failed:', e);
          }
        }
      ]
    });

    const version = require('./package.json').version;

    if (target === 'portable') {
      fs.writeFileSync(`dist/portable/nyx-dlp-win32-x64/.portable`, '');
      const zipName = `dist/nyx-dlp-v${version}-portable.zip`;
      console.log(`Creating portable zip: ${zipName}`);
      execSync(`powershell -Command Compress-Archive -Force dist/portable/nyx-dlp-win32-x64 ${zipName}`);
    } else if (target === 'installer') {
      console.log('Building installer with NSIS...');
      execSync('"C:\\Program Files (x86)\\NSIS\\makensis.exe" installer.nsi', { stdio: 'inherit' });
    }
    console.log(`${target} build complete.`);
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
