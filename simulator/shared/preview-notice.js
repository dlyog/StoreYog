(() => {
  const storageKey = 'storeyog-preview-ack-v1';
  const dialog = document.createElement('dialog');
  dialog.id = 'preview-notice';
  dialog.setAttribute('aria-labelledby', 'preview-notice-title');
  dialog.setAttribute('aria-describedby', 'preview-notice-summary');
  dialog.innerHTML = `
    <style>
      #preview-notice{box-sizing:border-box;width:min(590px,calc(100vw - 28px));max-height:calc(100dvh - 36px);overflow:auto;border:1px solid #d2dfd3;border-radius:22px;padding:30px;background:#fcfdf9;color:#18392b;font:16px/1.5 system-ui,sans-serif;box-shadow:0 24px 90px #061b2355}
      #preview-notice::backdrop{background:#071a20b8;backdrop-filter:blur(5px)}
      #preview-notice .preview-label{font-size:12px;letter-spacing:1.5px;font-weight:700;color:#52745e;text-transform:uppercase}
      #preview-notice h2{margin:10px 0 14px;font-size:29px;line-height:1.15;letter-spacing:-.6px;color:#18392b}
      #preview-notice p{margin:12px 0;font-size:15px;line-height:1.5;color:#334c40}
      #preview-notice ul{padding-left:22px;margin:16px 0}#preview-notice li{margin:10px 0;font-size:15px;color:#334c40}
      #preview-notice .preview-data{padding:13px 15px;background:#edf3e8;border-radius:12px}
      #preview-notice label{display:flex;gap:12px;align-items:flex-start;margin:20px 0;font-size:15px;color:#18392b;cursor:pointer}
      #preview-notice input{width:19px;height:19px;margin-top:2px;flex-shrink:0;accent-color:#315f43}
      #preview-notice .preview-actions{display:flex;gap:12px;flex-wrap:wrap}#preview-notice button{border:0;border-radius:10px;padding:13px 17px;font:600 15px system-ui;cursor:pointer;background:#285d40;color:white}#preview-notice button:disabled{opacity:.45;cursor:default}#preview-notice button.preview-leave{background:#edf0e9;color:#385441}
      #preview-notice :focus-visible,#preview-notice-reopen:focus-visible{outline:3px solid #429acc;outline-offset:3px}
      #preview-notice-reopen{position:fixed;bottom:12px;right:16px;z-index:90;width:36px;height:36px;display:grid;place-items:center;padding:0;background:#fcfdf5;color:#31543e;border:1px solid #c8d9c8;border-radius:50%;cursor:pointer;box-shadow:0 3px 14px #102c1820}#preview-notice-reopen svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
      @media(max-width:480px){#preview-notice{padding:22px}#preview-notice h2{font-size:25px}#preview-notice .preview-actions{flex-direction:column}}
    </style>
    <span class="preview-label">StoreYog · Private preview</span>
    <h2 id="preview-notice-title" tabindex="-1">A hackathon playground.</h2>
    <p id="preview-notice-summary">This private preview is for hackathon evaluation and experimentation only. It is not a production service.</p>
    <ul>
      <li><strong>No warranty or guarantee.</strong> Provided “as is,” without warranties or guarantees of accuracy, availability, security, or fitness for a particular purpose.</li>
      <li><strong>AI can be wrong.</strong> Responses may be inaccurate or incomplete. Verify results independently and do not rely on this preview for real business decisions.</li>
    </ul>
    <p class="preview-data"><strong>Synthetic data only.</strong> Do not enter, upload, or speak real customer personally identifiable information (PII), protected health information (PHI), or payment/cardholder data (PCI). Such data is not requested or permitted in this playground.</p>
    <p>Registration stores your owner email and a password hash for sign-in. Chat text and microphone audio are processed to provide responses. Tool activity and technical access logs may be recorded. Do not submit confidential information. Orders are simulated; no purchases or payments are processed.</p>
    <label><input id="preview-notice-ack" type="checkbox"><span>I understand this is a hackathon preview and will use synthetic data only.</span></label>
    <div class="preview-actions"><button id="preview-notice-continue" disabled>Enter the playground</button><button type="button" class="preview-leave">Leave preview</button></div>`;
  const reopen = document.createElement('button');
  reopen.id = 'preview-notice-reopen';
  reopen.type = 'button';
  reopen.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>';
  reopen.setAttribute('aria-label', 'Preview notice');
  reopen.title = 'Preview notice';
  reopen.setAttribute('aria-haspopup', 'dialog');
  document.body.append(dialog, reopen);
  const checkbox = dialog.querySelector('#preview-notice-ack');
  const proceed = dialog.querySelector('#preview-notice-continue');
  const show = () => { if (!dialog.open) { dialog.showModal(); dialog.querySelector('h2').focus(); } };
  dialog.addEventListener('cancel', e => e.preventDefault());
  checkbox.addEventListener('change', () => { proceed.disabled = !checkbox.checked; });
  proceed.addEventListener('click', () => { if (!checkbox.checked) return; try { sessionStorage.setItem(storageKey, 'yes'); } catch {} dialog.close(); reopen.focus(); });
  dialog.querySelector('.preview-leave').addEventListener('click', () => location.replace('about:blank'));
  reopen.addEventListener('click', show);
  let accepted = false;
  try { accepted = sessionStorage.getItem(storageKey) === 'yes'; } catch {}
  if (!accepted) show();
})();
