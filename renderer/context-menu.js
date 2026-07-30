/* ── Batch Rest Context Menu ────────────────────────────── */
document.addEventListener('contextmenu', e => {
  const target = e.target;
  const targetLine = target.closest ? target.closest('.line-info, .line-cmd, #batch-rest-toggle') : null;
  if (!targetLine) {
    const menu = document.getElementById('batch-rest-context-menu');
    if (menu) menu.style.display = 'none';
    return;
  }
  
  const isToggle = targetLine.id === 'batch-rest-toggle';
  const isRestText = targetLine.textContent.includes('Rest between downloads') || (targetLine.textContent.includes('Pausing') && targetLine.textContent.includes('before next download'));
  
  if (isToggle || isRestText) {
    e.preventDefault();
    const menu = document.getElementById('batch-rest-context-menu');
    if (!menu) return;
    menu.style.display = 'block';
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
  } else {
    const menu = document.getElementById('batch-rest-context-menu');
    if (menu) menu.style.display = 'none';
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
  const menu = document.getElementById('batch-rest-context-menu');
  if (menu && menu.style.display === 'block') {
    if (e.target.classList.contains('context-menu-item')) {
      let val = e.target.getAttribute('data-val');
      if (val === 'custom') {
        const modal = document.getElementById('custom-rest-modal');
        const input = document.getElementById('custom-rest-input');
        if (modal && input) {
          input.value = '';
          modal.style.display = 'flex';
          input.focus();
        }
      } else {
        val = parseFloat(val); // data-val is in minutes
        applyRestValue(val);
      }
    }
    menu.style.display = 'none';
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
