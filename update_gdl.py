import sys

with open('renderer.js', 'r', encoding='utf-8') as f:
    content = f.read()

target1 = '''  let currentPid   = null;
  let isPaused     = false;
  let gdlMultiMode = false;'''

replacement1 = '''  let currentPid   = null;
  let isPaused     = false;
  let gdlMultiMode = false;
  let activeUrls   = [];'''

target2 = '''  function updateGdlCount() {
    const n = getGdlUrls().length;
    countBadge.textContent = n + (n === 1 ? ' URL' : ' URLs');
  }'''

replacement2 = '''  function checkAddQueue() {
    if (!currentPid || !gdlMultiMode) return;
    const currentInputUrls = getGdlUrls();
    const newUrls = currentInputUrls.filter(u => !activeUrls.includes(u));
    if (newUrls.length > 0) {
      pauseBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg> Add to Queue`;
      pauseBtn.classList.add('btn-add-queue');
      pauseBtn.classList.remove('paused');
      pauseBtn._newUrls = newUrls;
    } else {
      pauseBtn.innerHTML = isPaused ? resumeIconHTML : pauseIconHTML;
      pauseBtn.classList.remove('btn-add-queue');
      pauseBtn.classList.toggle('paused', isPaused);
      pauseBtn._newUrls = null;
    }
  }

  function updateGdlCount() {
    const n = getGdlUrls().length;
    countBadge.textContent = n + (n === 1 ? ' URL' : ' URLs');
    checkAddQueue();
  }'''

target3 = '''  runBtn.addEventListener('click', () => {
    const urls        = getGdlUrls();'''

replacement3 = '''  runBtn.addEventListener('click', () => {
    activeUrls        = getGdlUrls();
    const urls        = activeUrls;'''

content = content.replace(target1, replacement1)
content = content.replace(target2, replacement2)
content = content.replace(target3, replacement3)

with open('renderer.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Gallery-dl update done.')
