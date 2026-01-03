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

    // 1. Fetch Data - Try live server first, fallback to static data.js
    function loadData() {
        saveState();

        fetch('/api/data')
            .then(response => {
                if (!response.ok) throw new Error('Server not available');
                return response.json();
            })
            .then(data => {
                allData = data;
                initDashboard();
                updateTimestamp();
                restoreState();
            })
            .catch(err => {
                console.log('Live server not available, using static data:', err.message);
                if (typeof EMPLOYEE_DATA !== 'undefined') {
                    allData = EMPLOYEE_DATA;
                    initDashboard();
                } else {
                    grid.innerHTML = `<h3 class="empty-state">無法載入資料。請啟動伺服器或確認 data.js 存在。</h3>`;
                }
            });
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

            // Create detailed raters HTML
            const ratersHtml = emp.raters.map(r => {
                const isLow = r.total < 75;
                const isHigh = r.total >= 90;
                const totalColorClass = isLow ? 'text-red' : (isHigh ? 'text-green' : '');

                // Special Rater Logic
                const specialClass = r.is_special ? 'special-rater' : '';
                const specialLabel = r.is_special ? '<span class="rater-badge">主管</span>' : '';

                return `
                    <div class="rater-card ${specialClass}">
                        <div class="rater-name">
                            ${r.name}
                            ${specialLabel}
                        </div>
                        <div class="rater-scores">
                           <div class="score-row">
                               <span class="score-label">第一大類</span><span class="score-val">${r.cat1}</span>
                           </div>
                           <div class="score-row">
                               <span class="score-label">第二大類</span><span class="score-val">${r.cat2}</span>
                           </div>
                           <div class="score-row">
                               <span class="score-label">第三大類</span><span class="score-val">${r.cat3}</span>
                           </div>
                           <div class="score-row total ${totalColorClass}">
                               <span class="score-label">總分</span><span class="score-val">${r.total}</span>
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
    }
});
