/* ── Batch Rest Context Menu ────────────────────────────── */
document.addEventListener('contextmenu', e => {
  const target = e.target;
  const targetLine = target.closest ? target.closest('.line-info, .line-cmd, #batch-rest-toggle, #concat-force-toggle') : null;
  
  // Hide all context menus first
  const batchMenu = document.getElementById('batch-rest-context-menu');
  const concatMenu = document.getElementById('concat-quality-context-menu');
  if (batchMenu) batchMenu.style.display = 'none';
  if (concatMenu) concatMenu.style.display = 'none';
  
  if (!targetLine) return;
  
  if (targetLine.id === 'concat-force-toggle') {
    e.preventDefault();
    if (concatMenu) {
      concatMenu.style.display = 'block';
      concatMenu.style.left = e.pageX + 'px';
      concatMenu.style.top = e.pageY + 'px';
    }
    return;
  }
  
  const isToggle = targetLine.id === 'batch-rest-toggle';
  const isRestText = targetLine.textContent.includes('Rest between downloads') || (targetLine.textContent.includes('Pausing') && targetLine.textContent.includes('before next download'));
  
  if (isToggle || isRestText) {
    e.preventDefault();
    if (!batchMenu) return;
    batchMenu.style.display = 'block';
    batchMenu.style.left = e.pageX + 'px';
    batchMenu.style.top = e.pageY + 'px';
  }
});

function applyRestValue(val) {
  if (window.api && window.api.setBatchRest) {
    document.getElementById('batch-rest').dataset.customVal = val;
    const desc = document.querySelector('#batch-rest-toggle .toggle-desc');
    if (desc) {
       desc.textContent = `Pause ~${val} minute(s) between each download`;
    }
    const outputDir = document.getElementById('batch-output').value.trim();
    if (outputDir) {
       window.api.setBatchRest({ outputDir, val });
    }
  }
}

document.addEventListener('click', e => {
  const batchMenu = document.getElementById('batch-rest-context-menu');
  const concatMenu = document.getElementById('concat-quality-context-menu');
  
  if (batchMenu && batchMenu.style.display === 'block') {
    if (e.target.classList.contains('context-menu-item')) {
      let val = e.target.getAttribute('data-val');
      if (val === 'custom') {
        const modal = document.getElementById('custom-rest-modal');
        if (modal) {
          modal.style.display = 'flex';
          const input = document.getElementById('custom-rest-input');
          if (input) { input.value = ''; input.focus(); }
        }
      } else {
        applyRestValue(val);
      }
    }
    batchMenu.style.display = 'none';
  }
  
  if (concatMenu && concatMenu.style.display === 'block') {
    if (e.target.classList.contains('context-menu-item')) {
      let val = e.target.getAttribute('data-val');
      
      const toggle = document.getElementById('concat-force');
      if (toggle) {
        toggle.dataset.quality = val;
        const desc = document.querySelector('#concat-force-toggle .toggle-desc');
        if (desc) {
          const capVal = val.charAt(0).toUpperCase() + val.slice(1);
          desc.textContent = `Force a full re-encode using ${capVal} quality settings.`;
        }
        localStorage.setItem('field:concat-quality', val);
      }
    }
    concatMenu.style.display = 'none';
  }
});

const restModal = document.getElementById('custom-rest-modal');
const restOkBtn = document.getElementById('custom-rest-ok');
const restCancelBtn = document.getElementById('custom-rest-cancel');
const restInput = document.getElementById('custom-rest-input');

if (restOkBtn) {
  restOkBtn.addEventListener('click', () => {
    const inputVal = parseInt(restInput.value);
    if (!isNaN(inputVal) && inputVal > 0) {
      applyRestValue(inputVal / 60);
    }
    restModal.style.display = 'none';
  });
}
if (restCancelBtn) {
  restCancelBtn.addEventListener('click', () => {
    restModal.style.display = 'none';
  });
}
