let dataGlobal = [];

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightSafe(text) {
  const escaped = escapeHTML(text);

  return escaped
    .replace(/error|failed|refused/gi, m => `<span class="highlight">${m}</span>`)
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, m => `<span class="ip">${m}</span>`);
}


function flatten(obj, prefix = '', res = {}) {
  for (let key in obj) {
    let newKey = prefix ? prefix + '.' + key : key;

    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      flatten(obj[key], newKey, res);
    } else {
      res[newKey] = Array.isArray(obj[key]) ? JSON.stringify(obj[key]) : obj[key];
    }
  }
  return res;
}

function getSeverity(msg) {
  msg = (msg || '').toLowerCase();
  if (msg.includes('error') || msg.includes('failed')) return 'error';
  if (msg.includes('warn')) return 'warn';
  return 'info';
}

function parseMessage(msg) {
  return {
    short: msg?.slice(0, 100),
    code: msg?.match(/code = (\w+)/)?.[1],
    socket: msg?.match(/\/[^\s]+\.sock/)?.[0],
  };
}

function getInfo(obj) {
  const src = obj._source || obj;
  const msg = src.message || '';

  return {
    time: src['@timestamp'] || '—',
    host: src.host?.hostname || src.host?.name || 'unknown',
    process: src.process?.name || '-',

    src_ip: src.source?.ip || '-',
    src_port: src.source?.port || '-',
    dst_ip: src.destination?.ip || '-',
    dst_port: src.destination?.port || '-',

    message: parseMessage(msg).short || 'no info',
    severity: getSeverity(msg)
  };
}


function renderList(data) {
  const list = document.getElementById('list');
  list.innerHTML = '';

  data.forEach((item) => {
    const info = getInfo(item);

    const badgeClass =
      info.severity === 'error' ? 'badge-error' :
      info.severity === 'warn' ? 'badge-warn' : 'badge-info';

    const div = document.createElement('div');
    div.className = 'event-item';

    div.innerHTML = `
      <div>
        <span class="badge ${badgeClass}">${escapeHTML(info.severity)}</span>
        <strong>${escapeHTML(info.time)}</strong>
      </div>
      <div class="text-info">${escapeHTML(info.host)}</div>
      <div style="font-size:12px">🖥 ${escapeHTML(info.process)}</div>
      <div style="font-size:12px">
        🌐 ${escapeHTML(info.src_ip)}:${escapeHTML(info.src_port)} →
        ${escapeHTML(info.dst_ip)}:${escapeHTML(info.dst_port)}
      </div>
      <div>${highlightSafe(info.message)}</div>
    `;

    div.addEventListener('click', () => {
      document.querySelectorAll('.event-item').forEach(e => e.classList.remove('active'));
      div.classList.add('active');
      renderDetails(item);
    });

    list.appendChild(div);
  });
}

function renderDetails(item) {
  const viewer = document.getElementById('viewer');
  viewer.innerHTML = '';

  const src = item._source || item;
  const flat = flatten(item);
  const parsed = parseMessage(src.message || '');

  const container = document.createElement('div');

  const btnGroup = document.createElement('div');
  btnGroup.className = 'mb-3';

  const createBtn = (text, handler, cls) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.className = `btn btn-sm ${cls} me-2`;
    btn.addEventListener('click', handler);
    return btn;
  };

  btnGroup.appendChild(createBtn('Copy Src IP', () => copyText(src.source?.ip || ''), 'btn-outline-info'));
  btnGroup.appendChild(createBtn('Copy Dst IP', () => copyText(src.destination?.ip || ''), 'btn-outline-info'));
  btnGroup.appendChild(createBtn('Pivot Src', () => pivotIP(src.source?.ip || ''), 'btn-outline-warning'));
  btnGroup.appendChild(createBtn('Pivot Dst', () => pivotIP(src.destination?.ip || ''), 'btn-outline-warning'));

  container.appendChild(btnGroup);
  const infoBlock = document.createElement('div');
  infoBlock.innerHTML = `
    <div class="mb-3">
      <h6>🧠 Process</h6>
      ${escapeHTML(src.process?.name || '-')} (PID: ${escapeHTML(src.process?.pid || '-')})
    </div>

    <div class="mb-3">
      <h6>🌐 Network</h6>
      ${escapeHTML(src.source?.ip || '-')}:${escapeHTML(src.source?.port || '-')} →
      ${escapeHTML(src.destination?.ip || '-')}:${escapeHTML(src.destination?.port || '-')}
    </div>

    <div class="mb-3">
      <b>Error Code:</b> ${escapeHTML(parsed.code || '-')}<br>
      <b>Socket:</b> ${escapeHTML(parsed.socket || '-')}
    </div>
  `;

  container.appendChild(infoBlock);
  const table = document.createElement('table');
  table.className = 'table table-dark table-sm';

  const tbody = document.createElement('tbody');

  for (let key in flat) {
    const tr = document.createElement('tr');

    const tdKey = document.createElement('td');
    tdKey.style.color = '#38bdf8';
    tdKey.textContent = key;

    const tdVal = document.createElement('td');
    tdVal.innerHTML = highlightSafe(String(flat[key]));

    tr.appendChild(tdKey);
    tr.appendChild(tdVal);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.appendChild(table);

  viewer.appendChild(container);
}

function copyText(text) {
  navigator.clipboard.writeText(text);
}

function pivotIP(ip) {
  if (!ip) return;
  const results = dataGlobal.filter(e =>
    JSON.stringify(e).includes(ip)
  );
  renderList(results);
}

// ================= FILE INPUT =================

document.getElementById('fileInput').addEventListener('change', e => {
  const files = Array.from(e.target.files);

  files.forEach(file => {

    if (file.size > 5 * 1024 * 1024) {
      alert('File too large (max 5MB)');
      return;
    }

    const reader = new FileReader();

    reader.onload = evt => {
      try {
        const json = JSON.parse(evt.target.result);

        const data = Array.isArray(json)
          ? json
          : json.hits?.hits || [json];

        dataGlobal = dataGlobal.concat(data);
        saveToStorage();
        renderList(dataGlobal);

      } catch (e) {
        alert('Invalid JSON');
        console.error(e);
      }
    };

    reader.readAsText(file);
  });
});

// ================= SEARCH =================

document.getElementById('search').addEventListener('input', e => {
  const val = e.target.value.toLowerCase();

  const filtered = dataGlobal.filter(item =>
    JSON.stringify(item).toLowerCase().includes(val)
  );

  renderList(filtered);
});
function saveToStorage() {
  localStorage.setItem('soc_data', JSON.stringify(dataGlobal));
}

function loadFromStorage() {
  const saved = localStorage.getItem('soc_data');
  if (saved) {
    try {
      dataGlobal = JSON.parse(saved);
      renderList(dataGlobal);
    } catch {
      localStorage.removeItem('soc_data');
    }
  }
}

function clearStorage() {
  localStorage.removeItem('soc_data');
  dataGlobal = [];
  document.getElementById('list').innerHTML = '';
  document.getElementById('viewer').innerHTML = 'Очищено';
}

loadFromStorage();