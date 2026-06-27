const { packager } = require('@electron/packager');
const fs = require('fs');
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
        
        // Ignore root dist folder
        if (normalized === '/dist' || normalized.startsWith('/dist/')) return true;
        
        // Ignore other root folders/files
        if (normalized === '/temp_dl' || normalized.startsWith('/temp_dl/')) return true;
        if (normalized === '/scripts' || normalized.startsWith('/scripts/')) return true;
        
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
      }
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
