document.addEventListener('DOMContentLoaded', () => {
    let allData = [];
    const grid = document.getElementById('employeeGrid');
    const searchInput = document.getElementById('searchInput');
    const totalEl = document.getElementById('totalEmployees');
    const avgEl = document.getElementById('globalAverage');
    const sortBtns = document.querySelectorAll('.sort-btn');

    // Filters
    const filterOrg = document.getElementById('filterOrg');
    const filterUnit = document.getElementById('filterUnit');
    const filterSection = document.getElementById('filterSection');

    let currentSort = 'unit';
    let refreshInterval = null;
    let savedScrollPosition = 0;

    // Save current state before refresh
    function saveState() {
        savedScrollPosition = window.scrollY;
        // Save filter values to sessionStorage
        if (filterOrg) sessionStorage.setItem('filterOrg', filterOrg.value);
        if (filterUnit) sessionStorage.setItem('filterUnit', filterUnit.value);
        if (filterSection) sessionStorage.setItem('filterSection', filterSection.value);
        sessionStorage.setItem('currentSort', currentSort);
        sessionStorage.setItem('searchTerm', searchInput.value);
    }

    // Restore state after refresh
    function restoreState() {
        // Restore scroll position after a brief delay for rendering
        setTimeout(() => {
            window.scrollTo(0, savedScrollPosition);
        }, 50);
    }

    // Restore filter values from sessionStorage
    function restoreFilters() {
        const savedOrg = sessionStorage.getItem('filterOrg');
        const savedUnit = sessionStorage.getItem('filterUnit');
        const savedSection = sessionStorage.getItem('filterSection');
        const savedSort = sessionStorage.getItem('currentSort');
        const savedSearch = sessionStorage.getItem('searchTerm');

        if (savedOrg && filterOrg) filterOrg.value = savedOrg;
        if (savedUnit && filterUnit) filterUnit.value = savedUnit;
        if (savedSection && filterSection) filterSection.value = savedSection;

        // Default to 'unit' sort if no saved preference
        const sortValue = savedSort || 'unit';
        currentSort = sortValue;
        sortBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === sortValue);
        });

        if (savedSearch) searchInput.value = savedSearch;
    }

    // 1. Fetch Data - Try live server first, then Supabase, fallback to static data.js
    async function loadData() {
        saveState();

        try {
            // Try local server first
            const response = await fetch('/api/data');
            if (!response.ok) throw new Error('Server not available');
            const data = await response.json();
            allData = data;
            initDashboard();
            updateTimestamp();
            restoreState();
        } catch (err) {
            console.log('Local server not available, trying Supabase...', err.message);

            // Try Supabase directly (for GitHub Pages)
            if (typeof loadProcessedData === 'function') {
                try {
                    const data = await loadProcessedData();
                    allData = data;
                    initDashboard();
                    updateTimestamp();
                    restoreState();
                } catch (supabaseErr) {
                    console.error('Supabase also failed:', supabaseErr);
                    // Fallback to static data
                    if (typeof EMPLOYEE_DATA !== 'undefined') {
                        allData = EMPLOYEE_DATA;
                        initDashboard();
                    } else {
                        grid.innerHTML = `<h3 class="empty-state">無法載入資料。請確認網路連線。</h3>`;
                    }
                }
            } else if (typeof EMPLOYEE_DATA !== 'undefined') {
                allData = EMPLOYEE_DATA;
                initDashboard();
            } else {
                grid.innerHTML = `<h3 class="empty-state">無法載入資料。請啟動伺服器或確認 data.js 存在。</h3>`;
            }
        }
    }

    function updateTimestamp() {
        const timestampEl = document.getElementById('lastUpdate');
        if (timestampEl) {
            timestampEl.textContent = new Date().toLocaleString('zh-TW');
        }
    }

    // Auto-refresh toggle
    function toggleAutoRefresh(enabled) {
        if (enabled) {
            refreshInterval = setInterval(loadData, 5000); // Refresh every 5 seconds
        } else if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    // Initial load
    loadData();

    function initDashboard() {
        populateFilters();
        restoreFilters();
        updateStats();
        renderGrid(allData);
        setupEventListeners();
    }

    // Populate Dropdowns
    function populateFilters() {
        // Collect unique values
        const orgs = new Set();
        const units = new Set();
        const sections = new Set();

        allData.forEach(emp => {
            if (emp.org && emp.org !== '未分類') orgs.add(emp.org);
            if (emp.unit) units.add(emp.unit);
            if (emp.section) sections.add(emp.section);
        });

        fillSelect(filterOrg, orgs);
        fillSelect(filterUnit, units);
        fillSelect(filterSection, sections);
    }

    function fillSelect(selectEl, set) {
        if (!selectEl) return;
        const sorted = Array.from(set).sort();
        sorted.forEach(val => {
            if (!val) return;
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            selectEl.appendChild(opt);
        });
    }

    // 2. Statistics
    function updateStats(data = allData) {
        totalEl.textContent = data.length;
        if (data.length > 0) {
            const sum = data.reduce((acc, curr) => acc + curr.average_score, 0);
            avgEl.textContent = (sum / data.length).toFixed(2);
        } else {
            avgEl.textContent = "0.00";
        }
    }

    // 3. Render
    function renderGrid(data) {
        grid.innerHTML = '';

        if (data.length === 0) {
            grid.innerHTML = '<h3 class="empty-state">找不到符合的資料</h3>';
            return;
        }

        data.forEach((emp, index) => {
            const card = document.createElement('div');
            card.className = 'employee-card';
            card.style.animationDelay = `${index * 30}ms`;

            const scoreClass = getScoreClass(emp.average_score);

            // Create detailed raters HTML with editable fields
            const ratersHtml = emp.raters.map(r => {
                const isLow = r.total < 75;
                const isHigh = r.total >= 90;
                const totalColorClass = isLow ? 'text-red' : (isHigh ? 'text-green' : '');

                // Special Rater Logic
                const specialClass = r.is_special ? 'special-rater' : '';
                const specialLabel = r.is_special ? '<span class="rater-badge">主管</span>' : '';

                // Modified indicator
                const modifiedClass = r.is_modified ? 'is-modified' : '';
                const modifiedBadge = r.is_modified ? '<span class="modified-badge"><i class="fa-solid fa-pen"></i> 已修改</span>' : '';
                const restoreBtn = r.is_modified ? `
                    <button class="restore-btn" onclick="restoreScore('${emp.name}', '${r.name}')" title="還原為原始分數">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                ` : '';

                return `
                    <div class="rater-card ${specialClass} ${modifiedClass}" data-ratee="${emp.name}" data-rater="${r.name}">
                        <div class="rater-header">
                            <div class="rater-name">
                                ${r.name}
                                ${specialLabel}
                                ${modifiedBadge}
                            </div>
                            <div class="rater-actions">
                                ${restoreBtn}
                                <button class="delete-rater-btn" onclick="deleteScore('${emp.name}', '${r.name}')" title="刪除此評分">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="rater-scores">
                           <div class="score-row">
                               <span class="score-label">第一大類</span>
                               <input type="number" class="score-input" value="${r.cat1}" 
                                   data-field="cat1" data-ratee="${emp.name}" data-rater="${r.name}"
                                   data-original="${r.original_cat1 || r.cat1}"
                                   onchange="updateScore(this)" min="0" max="40">
                           </div>
                           <div class="score-row">
                               <span class="score-label">第二大類</span>
                               <input type="number" class="score-input" value="${r.cat2}" 
                                   data-field="cat2" data-ratee="${emp.name}" data-rater="${r.name}"
                                   data-original="${r.original_cat2 || r.cat2}"
                                   onchange="updateScore(this)" min="0" max="30">
                           </div>
                           <div class="score-row">
                               <span class="score-label">第三大類</span>
                               <input type="number" class="score-input" value="${r.cat3}" 
                                   data-field="cat3" data-ratee="${emp.name}" data-rater="${r.name}"
                                   data-original="${r.original_cat3 || r.cat3}"
                                   onchange="updateScore(this)" min="0" max="30">
                           </div>
                           <div class="score-row total ${totalColorClass}">
                               <span class="score-label">總分</span>
                               <span class="score-val total-val">${r.total}</span>
                           </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Build hierarchy tags
            let tagsHtml = '';
            if (emp.org && emp.org !== '未分類') tagsHtml += `<span class="meta-tag org">${emp.org}</span>`;
            if (emp.unit) tagsHtml += `<span class="meta-tag unit">${emp.unit}</span>`;
            if (emp.section) tagsHtml += `<span class="meta-tag section">${emp.section}</span>`;

            card.innerHTML = `
                <div class="card-header">
                    <div class="employee-info">
                        <h2>${emp.name}</h2>
                        <div class="hierarchy-tags">${tagsHtml}</div>
                    </div>
                    <div class="score-area">
                        <div class="score-badge ${scoreClass}">
                            ${Number.isInteger(emp.average_score) ? emp.average_score : emp.average_score.toFixed(2)}
                        </div>
                        ${(emp.breakdown && emp.breakdown.length > 0) ? `
                        <div class="score-breakdown">
                            ${emp.breakdown.map(b => `
                                <div class="breakdown-item" title="${b.raters ? b.raters.join('、') : ''}">
                                    <span class="breakdown-label">${b.desc} × ${b.weight}%</span>
                                    <span class="breakdown-raters">(${b.raters ? b.raters.join('、') : 'N/A'})</span>
                                </div>
                            `).join('')}
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="card-body">
                    <div class="meta-row">
                        <div class="meta-item">
                            ${getStarIcon(emp.average_score)}
                        </div>
                        <div class="meta-item">
                            <i class="fa-solid fa-user-pen"></i>
                            <span>${emp.rater_count} 人評分</span>
                        </div>
                    </div>
                    <div class="category-scores">
                        <div class="cat-score">
                            <span class="cat-label">第一大類</span>
                            <span class="cat-value">${emp.cat1_rounded !== undefined ? emp.cat1_rounded : '-'}</span>
                            <span class="cat-original">(${emp.cat1_avg !== undefined ? emp.cat1_avg.toFixed(2) : '-'})</span>
                        </div>
                        <div class="cat-score">
                            <span class="cat-label">第二大類</span>
                            <span class="cat-value">${emp.cat2_rounded !== undefined ? emp.cat2_rounded : '-'}</span>
                            <span class="cat-original">(${emp.cat2_avg !== undefined ? emp.cat2_avg.toFixed(2) : '-'})</span>
                        </div>
                        <div class="cat-score">
                            <span class="cat-label">第三大類</span>
                            <span class="cat-value">${emp.cat3_rounded !== undefined ? emp.cat3_rounded : '-'}</span>
                            <span class="cat-original">(${emp.cat3_avg !== undefined ? emp.cat3_avg.toFixed(2) : '-'})</span>
                        </div>
                    </div>
                    <div class="raters-section">
                        <h3>評分者名單</h3>
                        <div class="rater-grid">
                            ${ratersHtml || '<span class="rater-tag">無評分資料</span>'}
                        </div>
                    </div>

                    ${(emp.missing_raters && emp.missing_raters.length > 0) ? `
                    <div class="raters-section missing-section">
                        <h3>未評分同單位夥伴 (${emp.missing_raters.length})</h3>
                        <div class="rater-tags">
                            ${emp.missing_raters.map(m => `<span class="rater-tag missing">${m}</span>`).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
            grid.appendChild(card);
        });
    }

    function getScoreClass(score) {
        if (score >= 90) return 'high-score';
        if (score < 80) return 'low-score';
        return 'med-score';
    }

    function getStarIcon(score) {
        let stars = '';
        if (score >= 90) stars = '<i class="fa-solid fa-star" style="color: #fbbf24;"></i> 優異';
        else if (score >= 80) stars = '<i class="fa-solid fa-face-smile" style="color: #4f46e5;"></i> 良好';
        else stars = '<i class="fa-solid fa-triangle-exclamation" style="color: #f43f5e;"></i> 需加強';
        return stars;
    }

    // 4. Filtering & Sorting
    function filterAndSort() {
        const term = searchInput.value.toLowerCase();

        const orgVal = filterOrg ? filterOrg.value : '';
        const unitVal = filterUnit ? filterUnit.value : '';
        const sectionVal = filterSection ? filterSection.value : '';

        let filtered = allData.filter(emp => {
            const matchesName = emp.name.toLowerCase().includes(term);
            const matchesOrg = orgVal ? emp.org === orgVal : true;
            const matchesUnit = unitVal ? emp.unit === unitVal : true;
            const matchesSection = sectionVal ? emp.section === sectionVal : true;

            return matchesName && matchesOrg && matchesUnit && matchesSection;
        });

        filtered.sort((a, b) => {
            if (currentSort === 'unit') {
                // Define org order
                const orgOrder = { '基金會': 1, '兒少之家': 2, '少年家園': 3, '諮商所': 4 };
                // Define role hierarchy - lower number = higher rank
                const getRoleRank = (name) => {
                    // Institution heads
                    if (['李冠葦', '廖振杉', '廖慧雯', '楊顗帆'].includes(name)) return 1;
                    // Unit managers
                    if (['陳淑錡', '陳宛妤', '鍾宜珮', '高靜華', '白梅芳'].includes(name)) return 2;
                    // Section supervisors
                    if (['簡采琦', '林品亨', '林紀騰'].includes(name)) return 3;
                    // Senior staff (資深員工)
                    if (['林東美', '賀郁茵', '王芊蓉', '王元鼎', '熊小蓮'].includes(name)) return 4;
                    // Regular staff
                    return 5;
                };

                const orgA = orgOrder[a.org] || 99;
                const orgB = orgOrder[b.org] || 99;
                if (orgA !== orgB) return orgA - orgB;

                // Within same org, sort by role
                const roleA = getRoleRank(a.name);
                const roleB = getRoleRank(b.name);
                if (roleA !== roleB) return roleA - roleB;

                // Same role, sort by name
                return a.name.localeCompare(b.name, 'zh-Hant');
            } else if (currentSort === 'name') {
                return a.name.localeCompare(b.name, 'zh-Hant');
            } else if (currentSort === 'score') {
                return b.average_score - a.average_score;
            } else if (currentSort === 'count') {
                return b.rater_count - a.rater_count;
            }
        });

        updateStats(filtered);
        renderGrid(filtered);
    }

    function setupEventListeners() {
        searchInput.addEventListener('input', filterAndSort);

        if (filterOrg) filterOrg.addEventListener('change', filterAndSort);
        if (filterUnit) filterUnit.addEventListener('change', filterAndSort);
        if (filterSection) filterSection.addEventListener('change', filterAndSort);

        sortBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                sortBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentSort = e.target.dataset.sort;
                filterAndSort();
            });
        });

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshBtn.classList.add('spinning');
                loadData();
                setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
            });
        }

        // Auto-refresh toggle
        const autoRefreshCheckbox = document.getElementById('autoRefresh');
        if (autoRefreshCheckbox) {
            autoRefreshCheckbox.addEventListener('change', (e) => {
                toggleAutoRefresh(e.target.checked);
            });
        }

        // Backup button
        const backupBtn = document.getElementById('backupBtn');
        if (backupBtn) {
            backupBtn.addEventListener('click', backupScores);
        }

        // Restore all button
        const restoreAllBtn = document.getElementById('restoreAllBtn');
        if (restoreAllBtn) {
            restoreAllBtn.addEventListener('click', restoreAllScores);
        }
    }
});

// Global function to update a score
async function updateScore(inputEl) {
    const ratee = inputEl.dataset.ratee;
    const rater = inputEl.dataset.rater;
    const field = inputEl.dataset.field;
    const value = parseFloat(inputEl.value);

    // Get all inputs for this rater
    const raterCard = inputEl.closest('.rater-card');
    const cat1Input = raterCard.querySelector('input[data-field="cat1"]');
    const cat2Input = raterCard.querySelector('input[data-field="cat2"]');
    const cat3Input = raterCard.querySelector('input[data-field="cat3"]');
    const totalEl = raterCard.querySelector('.total-val');

    const cat1 = parseFloat(cat1Input.value) || 0;
    const cat2 = parseFloat(cat2Input.value) || 0;
    const cat3 = parseFloat(cat3Input.value) || 0;

    // Get original values
    const originalCat1 = parseFloat(cat1Input.dataset.original) || 0;
    const originalCat2 = parseFloat(cat2Input.dataset.original) || 0;
    const originalCat3 = parseFloat(cat3Input.dataset.original) || 0;

    // Update total display immediately
    const newTotal = cat1 + cat2 + cat3;
    if (totalEl) totalEl.textContent = newTotal;

    // Check if modified
    const isModified = (cat1 !== originalCat1 || cat2 !== originalCat2 || cat3 !== originalCat3);

    // Update modified indicator immediately
    updateModifiedIndicator(raterCard, isModified, ratee, rater);

    // Show saving indicator
    inputEl.style.backgroundColor = '#fef3c7';

    try {
        let success = false;

        // Try local server first
        try {
            const response = await fetch('/api/update-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ratee, rater, cat1, cat2, cat3 })
            });

            // Check if response is valid JSON (not HTML 404 page)
            if (!response.ok) throw new Error('Server not available');

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server not available');
            }

            const result = await response.json();
            success = result.success;
            if (!success) throw new Error(result.error || 'Server update failed');
        } catch (serverErr) {
            console.log('Local server not available, trying Supabase...', serverErr.message);

            // Try Supabase directly (for GitHub Pages)
            if (typeof updateScoreInSupabase === 'function') {
                await updateScoreInSupabase(ratee, rater, cat1, cat2, cat3);
                success = true;
            } else {
                throw serverErr;
            }
        }

        if (success) {
            inputEl.style.backgroundColor = '#d1fae5';

            // Reload data to update summary scores
            await refreshEmployeeData();

            setTimeout(() => {
                inputEl.style.backgroundColor = '';
            }, 500);
        }
    } catch (err) {
        console.error('Update failed:', err);
        alert('更新失敗：' + err.message);
        inputEl.style.backgroundColor = '#fee2e2';
    }
}

// Update modified indicator on a rater card
function updateModifiedIndicator(raterCard, isModified, ratee, rater) {
    const raterName = raterCard.querySelector('.rater-name');
    const raterActions = raterCard.querySelector('.rater-actions');

    if (isModified) {
        // Add modified class
        raterCard.classList.add('is-modified');

        // Add modified badge if not exists
        if (!raterCard.querySelector('.modified-badge')) {
            const badge = document.createElement('span');
            badge.className = 'modified-badge';
            badge.innerHTML = '<i class="fa-solid fa-pen"></i> 已修改';
            raterName.appendChild(badge);
        }

        // Add restore button if not exists
        if (raterActions && !raterCard.querySelector('.restore-btn')) {
            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'restore-btn';
            restoreBtn.title = '還原為原始分數';
            restoreBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
            restoreBtn.onclick = () => restoreScore(ratee, rater);
            raterActions.insertBefore(restoreBtn, raterActions.firstChild);
        }
    } else {
        // Remove modified class
        raterCard.classList.remove('is-modified');

        // Remove modified badge
        const badge = raterCard.querySelector('.modified-badge');
        if (badge) badge.remove();

        // Remove restore button
        const restoreBtn = raterCard.querySelector('.restore-btn');
        if (restoreBtn) restoreBtn.remove();
    }
}

// Refresh data silently without full page reload
async function refreshEmployeeData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();

        // Update employee cards with new data
        data.forEach(emp => {
            // Find the employee card
            const cards = document.querySelectorAll('.employee-card');
            cards.forEach(card => {
                const nameEl = card.querySelector('h2');
                if (nameEl && nameEl.textContent.trim() === emp.name) {
                    // Update score badge
                    const badge = card.querySelector('.score-badge');
                    if (badge) {
                        badge.textContent = Number.isInteger(emp.average_score)
                            ? emp.average_score
                            : emp.average_score.toFixed(2);
                    }

                    // Update category averages
                    const catScores = card.querySelectorAll('.cat-score');
                    if (catScores.length >= 3) {
                        // Update cat1
                        const cat1Value = catScores[0].querySelector('.cat-value');
                        const cat1Raw = catScores[0].querySelector('.cat-original');
                        if (cat1Value) cat1Value.textContent = emp.cat1_rounded;
                        if (cat1Raw) cat1Raw.textContent = `(${emp.cat1_avg.toFixed(2)})`;

                        // Update cat2
                        const cat2Value = catScores[1].querySelector('.cat-value');
                        const cat2Raw = catScores[1].querySelector('.cat-original');
                        if (cat2Value) cat2Value.textContent = emp.cat2_rounded;
                        if (cat2Raw) cat2Raw.textContent = `(${emp.cat2_avg.toFixed(2)})`;

                        // Update cat3
                        const cat3Value = catScores[2].querySelector('.cat-value');
                        const cat3Raw = catScores[2].querySelector('.cat-original');
                        if (cat3Value) cat3Value.textContent = emp.cat3_rounded;
                        if (cat3Raw) cat3Raw.textContent = `(${emp.cat3_avg.toFixed(2)})`;
                    }

                    // Update rater count
                    const raterCount = card.querySelector('.rater-count');
                    if (raterCount) {
                        raterCount.textContent = emp.rater_count + ' 人評分';
                    }
                }
            });
        });

        // Update global stats
        const totalEl = document.getElementById('totalEmployees');
        const avgEl = document.getElementById('globalAverage');
        if (totalEl) totalEl.textContent = data.length;
        if (avgEl && data.length > 0) {
            const avg = data.reduce((sum, e) => sum + e.average_score, 0) / data.length;
            avgEl.textContent = avg.toFixed(2);
        }
    } catch (err) {
        console.error('Failed to refresh data:', err);
    }
}

// Global function to delete a score
async function deleteScore(ratee, rater) {
    if (!confirm(`確定要刪除 ${rater} 對 ${ratee} 的評分嗎？`)) {
        return;
    }

    try {
        let success = false;

        // Try local server first
        try {
            const response = await fetch('/api/delete-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ratee, rater })
            });

            if (!response.ok) throw new Error('Server not available');
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server not available');
            }

            const result = await response.json();
            success = result.success;
            if (!success) throw new Error(result.error || 'Delete failed');
        } catch (serverErr) {
            console.log('Local server not available, trying Supabase...', serverErr.message);

            // Try Supabase directly (for GitHub Pages)
            if (typeof deleteScoreInSupabase === 'function') {
                await deleteScoreInSupabase(ratee, rater);
                success = true;
            } else {
                throw serverErr;
            }
        }

        if (success) {
            // Remove the rater card from DOM
            const raterCards = document.querySelectorAll('.rater-card');
            raterCards.forEach(card => {
                if (card.dataset.ratee === ratee && card.dataset.rater === rater) {
                    card.style.animation = 'fadeOut 0.3s ease';
                    setTimeout(() => card.remove(), 300);
                }
            });

            // Update the rater count display
            const cards = document.querySelectorAll('.employee-card');
            cards.forEach(card => {
                const nameEl = card.querySelector('h2');
                if (nameEl && nameEl.textContent.trim() === ratee) {
                    const raterCount = card.querySelector('.rater-count');
                    if (raterCount) {
                        const currentCount = parseInt(raterCount.textContent) || 0;
                        raterCount.innerHTML = `<i class="fa-solid fa-users"></i> ${currentCount - 1} 人評分`;
                    }
                }
            });

            // Refresh employee data to update scores
            await refreshEmployeeData();
        }
    } catch (err) {
        console.error('Delete failed:', err);
        alert('刪除失敗：' + err.message);
    }
}

// Global function to backup all scores (download as CSV)
async function backupScores() {
    try {
        // Try local server first
        try {
            const response = await fetch('/api/backup-download');
            if (response.ok) {
                const blob = await response.blob();
                const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
                    || `score_backup_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.csv`;

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);

                alert('備份下載成功！');
                return;
            }
            throw new Error('Server backup failed');
        } catch (serverErr) {
            console.log('Local server not available, trying Supabase...', serverErr.message);

            // Try Supabase directly (for GitHub Pages)
            if (typeof exportBackupCSV === 'function') {
                await exportBackupCSV();
                alert('備份下載成功！');
                return;
            }
            throw serverErr;
        }
    } catch (err) {
        console.error('Backup failed:', err);
        alert('備份失敗：' + err.message);
    }
}

// Global function to restore ALL modified scores
async function restoreAllScores() {
    if (!confirm('確定要將所有已修改的評分還原為原始分數嗎？\n\n此操作無法復原！')) {
        return;
    }

    try {
        let result;

        // Try local server first
        try {
            const response = await fetch('/api/restore-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) throw new Error('Server not available');
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server not available');
            }

            result = await response.json();
        } catch (serverErr) {
            console.log('Local server not available, trying Supabase...', serverErr.message);

            // Try Supabase directly (for GitHub Pages)
            if (typeof restoreAllScoresInSupabase === 'function') {
                result = await restoreAllScoresInSupabase();
            } else {
                throw serverErr;
            }
        }

        if (result.success) {
            if (result.count > 0) {
                alert(`還原成功！\n還原了 ${result.count} 筆評分`);
                location.reload();
            } else {
                alert('目前沒有需要還原的修改記錄');
            }
        } else {
            alert('還原失敗：' + (result.error || '未知錯誤'));
        }
    } catch (err) {
        console.error('Restore all failed:', err);
        alert('還原失敗：' + err.message);
    }
}

// Global function to restore a score to original values
async function restoreScore(ratee, rater) {
    if (!confirm(`確定要將 ${rater} 對 ${ratee} 的評分還原為原始分數嗎？`)) {
        return;
    }

    try {
        const response = await fetch('/api/restore-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ratee, rater })
        });

        const result = await response.json();

        if (result.success) {
            // Update the input fields with original values
            const raterCards = document.querySelectorAll('.rater-card');
            raterCards.forEach(card => {
                if (card.dataset.ratee === ratee && card.dataset.rater === rater) {
                    const cat1Input = card.querySelector('input[data-field="cat1"]');
                    const cat2Input = card.querySelector('input[data-field="cat2"]');
                    const cat3Input = card.querySelector('input[data-field="cat3"]');
                    const totalEl = card.querySelector('.total-val');

                    if (cat1Input) cat1Input.value = result.original.cat1;
                    if (cat2Input) cat2Input.value = result.original.cat2;
                    if (cat3Input) cat3Input.value = result.original.cat3;

                    const newTotal = result.original.cat1 + result.original.cat2 + result.original.cat3;
                    if (totalEl) totalEl.textContent = newTotal;

                    // Remove modified class and badge
                    card.classList.remove('is-modified');
                    const modifiedBadge = card.querySelector('.modified-badge');
                    if (modifiedBadge) modifiedBadge.remove();
                    const restoreBtn = card.querySelector('.restore-btn');
                    if (restoreBtn) restoreBtn.remove();

                    // Flash green to indicate success
                    card.style.animation = 'flashGreen 0.5s ease';
                    setTimeout(() => card.style.animation = '', 500);
                }
            });

            // Refresh all data to update averages
            await refreshEmployeeData();

        } else {
            alert('還原失敗：' + result.error);
        }
    } catch (err) {
        console.error('Restore failed:', err);
        alert('還原失敗');
    }
}
