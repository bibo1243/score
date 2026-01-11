// rating-management.js

// Simple password protection (hard‑coded "1234")
const ADMIN_PASSWORD = '1234';
const authContainer = document.getElementById('authContainer');
const managementApp = document.getElementById('managementApp');
const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('errorMsg');

loginBtn.addEventListener('click', () => {
    const pwd = document.getElementById('adminPassword').value;
    if (pwd === ADMIN_PASSWORD) {
        authContainer.classList.add('hidden');
        managementApp.classList.remove('hidden');
        initApp();
    } else {
        errorMsg.textContent = '密碼錯誤，請再試一次。';
    }
});

// ------------------------------------------------------------------
// Data structures
let relationships = {}; // { name: { supervisors: [], peers: [], subordinates: [], weights: { supervisor:{cat1:0.5,cat2:0.5,cat3:0.5}, peer:{...}, subordinate:{...} } }
let orgMap = {}; // { org: Set(unit) }

// ------------------------------------------------------------------
// Initialise UI – load org/unit filters and employee cards
async function initApp() {
    await loadRelationships();
    populateOrgFilters();
    renderEmployees();
}

async function loadRelationships() {
    const res = await fetch('/api/relationships');
    if (res.ok) {
        const data = await res.json();
        relationships = {};
        data.forEach(item => {
            relationships[item.name] = item;
        });
    } else {
        console.error('Failed to load relationships');
    }
}

function populateOrgFilters() {
    const orgSelect = document.getElementById('orgSelect');
    const unitSelect = document.getElementById('unitSelect');
    const orgSet = new Set();
    const unitMap = {};
    // staff directory is stored in Supabase – we reuse the existing loadStaffMeta function from data‑processor.js
    // It is attached to window after that script loads.
    if (window.loadStaffMeta) {
        window.loadStaffMeta().then(staff => {
            Object.values(staff).forEach(meta => {
                orgSet.add(meta.org);
                if (!unitMap[meta.org]) unitMap[meta.org] = new Set();
                unitMap[meta.org].add(meta.unit || '其他');
            });
            // Populate org options
            orgSelect.innerHTML = '<option value="all">全部</option>';
            orgSet.forEach(o => {
                orgSelect.innerHTML += `<option value="${o}">${o}</option>`;
            });
            // When org changes, refill unit options
            orgSelect.addEventListener('change', () => {
                const selOrg = orgSelect.value;
                unitSelect.innerHTML = '<option value="all">全部</option>';
                if (selOrg !== 'all') {
                    unitMap[selOrg].forEach(u => {
                        unitSelect.innerHTML += `<option value="${u}">${u}</option>`;
                    });
                }
                renderEmployees();
            });
            unitSelect.addEventListener('change', renderEmployees);
            renderEmployees();
        });
    }
}

function renderEmployees() {
    const container = document.getElementById('employeeContainer');
    const orgFilter = document.getElementById('orgSelect').value;
    const unitFilter = document.getElementById('unitSelect').value;
    container.innerHTML = '';
    // Build list of employees from relationships + staff meta (fallback to name only)
    const names = Object.keys(relationships);
    names.forEach(name => {
        const rel = relationships[name];
        const meta = (window.staffDir && window.staffDir[name]) || { org: '未分類', unit: '' };
        if (orgFilter !== 'all' && meta.org !== orgFilter) return;
        if (unitFilter !== 'all' && meta.unit !== unitFilter) return;
        const card = document.createElement('div');
        card.className = 'employee-card';
        card.innerHTML = `
      <h3>${name}</h3>
      <div class="section"><strong>機構：</strong> ${meta.org}</div>
      <div class="section"><strong>單位：</strong> ${meta.unit || '—'}</div>
      ${renderRelationSection(name, 'supervisors', '主管')}
      ${renderRelationSection(name, 'peers', '平級')}
      ${renderRelationSection(name, 'subordinates', '下屬')}
      ${renderWeightSection(name)}
      <button class="btn save-btn" data-name="${name}">儲存變更</button>
    `;
        container.appendChild(card);
    });
    // Attach save handlers
    document.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const empName = btn.dataset.name;
            saveEmployee(empName);
        });
    });
}

function renderRelationSection(empName, key, label) {
    const list = relationships[empName][key] || [];
    const items = list.map(person => `<li>${person}<button class="btn remove" data-name="${empName}" data-key="${key}" data-target="${person}">✕</button></li>`).join('');
    return `
    <div class="section">
      <div class="section-title">${label} <button class="btn add" data-name="${empName}" data-key="${key}">+ 新增</button></div>
      <ul class="list" id="${empName}-${key}">${items}</ul>
    </div>
  `;
}

function renderWeightSection(empName) {
    const w = relationships[empName].weights || {};
    const categories = ['supervisor', 'peer', 'subordinate'];
    const html = categories.map(cat => {
        const catWeight = w[cat] || { cat1: 0.5, cat2: 0.5, cat3: 0.5 };
        return `
      <div class="section weight-${cat}">
        <div class="section-title">${cat.charAt(0).toUpperCase() + cat.slice(1)} 權重</div>
        ${['cat1', 'cat2', 'cat3'].map(c => `
          <label>${c.toUpperCase()}: <input type="range" min="0" max="1" step="0.05" value="${catWeight[c]}" data-name="${empName}" data-cat="${cat}" data-field="${c}" class="weight-slider"/></label>
        `).join('')}
      </div>
    `;
    }).join('');
    return html;
}

// ------------------------------------------------------------------
// Interaction handlers – add / remove relations
document.addEventListener('click', async e => {
    if (e.target.matches('.add')) {
        const emp = e.target.dataset.name;
        const key = e.target.dataset.key;
        const newName = prompt('請輸入要加入的姓名');
        if (newName) {
            if (!relationships[emp][key]) relationships[emp][key] = [];
            if (!relationships[emp][key].includes(newName)) relationships[emp][key].push(newName);
            renderEmployees();
        }
    }
    if (e.target.matches('.remove')) {
        const emp = e.target.dataset.name;
        const key = e.target.dataset.key;
        const target = e.target.dataset.target;
        relationships[emp][key] = (relationships[emp][key] || []).filter(n => n !== target);
        renderEmployees();
    }
});

// Weight sliders – live update object
document.addEventListener('input', e => {
    if (e.target.matches('.weight-slider')) {
        const emp = e.target.dataset.name;
        const cat = e.target.dataset.cat;
        const field = e.target.dataset.field;
        if (!relationships[emp].weights) relationships[emp].weights = {};
        if (!relationships[emp].weights[cat]) relationships[emp].weights[cat] = { cat1: 0.5, cat2: 0.5, cat3: 0.5 };
        relationships[emp].weights[cat][field] = parseFloat(e.target.value);
    }
});

// ------------------------------------------------------------------
// Save employee changes to Supabase via API
async function saveEmployee(name) {
    const payload = relationships[name];
    try {
        const res = await fetch('/api/relationships', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            alert(`${name} 的設定已儲存`);
        } else {
            const err = await res.text();
            alert('儲存失敗: ' + err);
        }
    } catch (e) {
        console.error(e);
        alert('儲存時發生錯誤');
    }
}

// ------------------------------------------------------------------
// Helper – hide auth container after login
authContainer.classList.remove('hidden');
managementApp.classList.add('hidden');
