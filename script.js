// Global flag to pause auto-refresh during dialogs (use window. for cross-scope access)
window.isDialogOpen = false;

// Organization display order
const ORG_ORDER = ['基金會', '兒少之家', '少年家園', '諮商所'];

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

    // Organization collapsed states (true = collapsed)
    let orgCollapsedStates = {};

    // Load collapsed states from localStorage
    function loadCollapsedStates() {
        try {
            const saved = localStorage.getItem('orgCollapsedStates');
            if (saved) {
                orgCollapsedStates = JSON.parse(saved);
            }
        } catch (e) {
            orgCollapsedStates = {};
        }
    }

    // Save collapsed states to localStorage
    function saveCollapsedStates() {
        localStorage.setItem('orgCollapsedStates', JSON.stringify(orgCollapsedStates));
    }

    // Toggle organization collapsed state - directly manipulate DOM for instant feedback
    window.toggleOrgCollapse = function (org) {
        orgCollapsedStates[org] = !orgCollapsedStates[org];
        saveCollapsedStates();

        // Find and toggle the container directly
        const container = document.querySelector(`.org-group-container[data-org="${org}"]`);
        const header = document.querySelector(`.org-group-header[data-org="${org}"]`);

        if (container) {
            container.classList.toggle('collapsed', orgCollapsedStates[org]);
        }
        if (header) {
            const icon = header.querySelector('.collapse-icon');
            if (icon) {
                icon.classList.toggle('fa-chevron-right', orgCollapsedStates[org]);
                icon.classList.toggle('fa-chevron-down', !orgCollapsedStates[org]);
            }
        }
    };

    // Save current state before refresh
    function saveState() {
        savedScrollPosition = window.scrollY;
        // Save filter values to localStorage (persistent across sessions)
        if (filterOrg) localStorage.setItem('filterOrg', filterOrg.value);
        if (filterUnit) localStorage.setItem('filterUnit', filterUnit.value);
        if (filterSection) localStorage.setItem('filterSection', filterSection.value);
        localStorage.setItem('currentSort', currentSort);
        localStorage.setItem('searchTerm', searchInput.value);
    }

    // Restore state after refresh
    function restoreState() {
        // Restore scroll position after a brief delay for rendering
        setTimeout(() => {
            window.scrollTo(0, savedScrollPosition);
        }, 50);
    }

    // Restore filter values from localStorage
    function restoreFilters() {
        loadCollapsedStates();

        const savedOrg = localStorage.getItem('filterOrg');
        const savedUnit = localStorage.getItem('filterUnit');
        const savedSection = localStorage.getItem('filterSection');
        const savedSort = localStorage.getItem('currentSort');
        const savedSearch = localStorage.getItem('searchTerm');

        // Restore sequentially to respect dependencies
        if (savedOrg && filterOrg) {
            filterOrg.value = savedOrg;
            updateUnitFilter(); // Manually trigger update to populate Units based on saved Org
        }

        if (savedUnit && filterUnit) {
            // Check if saved unit exists in the newly populated options
            // (It might not look valid if we filter out redundant units, but the value is still valid for logic)
            // But fillSelect might have reset it.

            // Re-apply value after updateUnitFilter
            filterUnit.value = savedUnit;
            updateSectionFilter(); // Manually trigger update to populate Sections based on saved Unit
        } else {
            // Even if no saved unit, we should update sections based on default unit (All)
            updateSectionFilter();
        }

        if (savedSection && filterSection) {
            filterSection.value = savedSection;
        }

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
        // saveState(); // REMOVED: Do not save state here, it overwrites saved filters with defaults!

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
            // Use a wrapper that checks for dialog state
            refreshInterval = setInterval(() => {
                if (!window.isDialogOpen) {
                    loadData();
                }
            }, 5000); // Refresh every 5 seconds
        } else if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    // Initial load
    loadData();

    function initDashboard() {
        initFilters();
        updateStats();
        // Use filterAndSort to render with applied filters
        filterAndSort();
        setupEventListeners();
    }

    // Populate Dropdowns
    // --- REDESIGNED FILTER SYSTEM ---

    // Initialize all filters in strict order to ensure state is restored correctly
    function initFilters() {
        // 1. Load saved state
        const savedOrg = localStorage.getItem('filterOrg') || '';
        const savedUnit = localStorage.getItem('filterUnit') || '';
        const savedSection = localStorage.getItem('filterSection') || '';
        const savedSearch = localStorage.getItem('searchTerm') || '';

        // Restore Search Term
        if (savedSearch && searchInput) {
            searchInput.value = savedSearch;
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) clearBtn.style.display = 'block';
        }

        // 2. Populate Organizations (Root)
        const orgs = new Set();
        allData.forEach(emp => {
            if (emp.org && emp.org !== '未分類') orgs.add(emp.org);
        });
        fillSelect(filterOrg, orgs, savedOrg);

        // 3. Populate Units based on current Org
        refreshUnitOptions(savedUnit);

        // 4. Populate Sections based on current Org and Unit
        refreshSectionOptions(savedSection);
    }

    // Refresh Unit options based on currently selected Org
    function refreshUnitOptions(preferredValue = '') {
        const selectedOrg = filterOrg ? filterOrg.value : '';
        const units = new Set();

        allData.forEach(emp => {
            // Filter by Org
            if (selectedOrg && emp.org !== selectedOrg) return;

            // Skip redundant units (same name as Org)
            if (selectedOrg && emp.unit && emp.unit === emp.org) return;

            if (emp.unit) units.add(emp.unit);
        });

        // Populate and try to select preferred value
        // If preferred value is invalid for this scope, fillSelect will default to first option ("All")
        fillSelect(filterUnit, units, preferredValue);
    }

    // Refresh Section options based on currently selected Org and Unit
    function refreshSectionOptions(preferredValue = '') {
        const selectedOrg = filterOrg ? filterOrg.value : '';
        const selectedUnit = filterUnit ? filterUnit.value : '';
        const sections = new Set();

        allData.forEach(emp => {
            if (selectedOrg && emp.org !== selectedOrg) return;
            if (selectedUnit && emp.unit !== selectedUnit) return;

            if (emp.section) sections.add(emp.section);
        });

        fillSelect(filterSection, sections, preferredValue);
    }

    // Helper to populate select element
    // selectedValue: the value we WANT to select if it exists
    function fillSelect(selectEl, set, selectedValue = '') {
        if (!selectEl) return;

        // Clear all except first option (default)
        while (selectEl.options.length > 1) {
            selectEl.remove(1);
        }

        const sorted = Array.from(set).sort();
        let valueFound = false;

        sorted.forEach(val => {
            if (!val) return;
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            selectEl.appendChild(opt);

            if (val === selectedValue) {
                valueFound = true;
            }
        });

        // If the preferred value exists in the new list, select it
        if (valueFound) {
            selectEl.value = selectedValue;
        } else {
            // Otherwise, reset to "All" (index 0)
            selectEl.selectedIndex = 0;
        }
    }

    // 2. Statistics
    function updateStats(data = allData) {
        totalEl.textContent = data.length;
        if (data.length > 0) {
            const sum = data.reduce((acc, curr) => acc + curr.average_score, 0);
            avgEl.textContent = (sum / data.length).toFixed(1);
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

        // Group data by organization
        const groupedByOrg = {};
        ORG_ORDER.forEach(org => { groupedByOrg[org] = []; });
        groupedByOrg['其他'] = []; // For any unclassified

        data.forEach(emp => {
            const org = emp.org || '其他';
            if (groupedByOrg[org]) {
                groupedByOrg[org].push(emp);
            } else {
                groupedByOrg['其他'].push(emp);
            }
        });

        // Render each organization group
        let globalIndex = 0;
        ORG_ORDER.concat(['其他']).forEach(org => {
            const employees = groupedByOrg[org];
            if (employees.length === 0) return;

            const isCollapsed = orgCollapsedStates[org] === true;
            const collapseIcon = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';

            // Create organization header
            const orgHeader = document.createElement('div');
            orgHeader.className = 'org-group-header';
            orgHeader.setAttribute('data-org', org);
            orgHeader.innerHTML = `
                <div class="org-header-content" onclick="toggleOrgCollapse('${org}')">
                    <i class="fa-solid ${collapseIcon} collapse-icon"></i>
                    <span class="org-name">${org}</span>
                    <span class="org-count">${employees.length} 人</span>
                </div>
            `;
            grid.appendChild(orgHeader);

            // Create container for this org's employees
            const orgContainer = document.createElement('div');
            orgContainer.className = 'org-group-container' + (isCollapsed ? ' collapsed' : '');
            orgContainer.setAttribute('data-org', org);

            employees.forEach((emp, index) => {
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
                            </div>
                            <div class="rater-actions">
                                <button class="save-rater-btn" onclick="manualSave('${emp.name}', '${r.name}')" title="儲存並寫入資料庫">
                                    <i class="fa-solid fa-check"></i>
                                </button>
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
                        ${modifiedBadge}
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
                    <div class="card-summary">
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
                    </div>
                    <div class="raters-section">
                        <div class="raters-section-header">
                            <h3>評分者名單</h3>
                            <button class="add-rater-btn" onclick="showAddRaterModal('${emp.name}')" title="新增評分者">
                                <i class="fa-solid fa-plus"></i> 新增
                            </button>
                        </div>
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
                    
                    ${(emp.subordinates && emp.subordinates.length > 0) ? `
                    <div class="raters-section subordinates-section">
                        <h3>下屬無須評分 (${emp.subordinates.length})</h3>
                        <div class="rater-tags">
                            ${emp.subordinates.map(s => `<span class="rater-tag subordinate">${s}</span>`).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
                orgContainer.appendChild(card);
                globalIndex++;
            });

            grid.appendChild(orgContainer);
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
        searchInput.addEventListener('input', () => {
            localStorage.setItem('searchTerm', searchInput.value);
            // Toggle clear button
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) {
                clearBtn.style.display = searchInput.value ? 'block' : 'none';
            }
            filterAndSort();
        });

        // Clear Search Button
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                localStorage.setItem('searchTerm', '');
                clearSearchBtn.style.display = 'none';
                filterAndSort();
            });
        }

        // Reset Filters Button
        const resetFiltersBtn = document.getElementById('resetFiltersBtn');
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                // 1. Reset Select Elements
                if (filterOrg) filterOrg.value = '';

                // 2. Trigger updates to reset dependent options
                refreshUnitOptions('');
                refreshSectionOptions('');

                // 3. Clear Local Storage
                localStorage.removeItem('filterOrg');
                localStorage.removeItem('filterUnit');
                localStorage.removeItem('filterSection');

                // 4. Apply changes (which is empty filters)
                filterAndSort();
            });
        }

        if (filterOrg) filterOrg.addEventListener('change', () => {
            // Org changed: Reset Unit and Section to default ('') but try to keep if valid?
            // Usually if Org changes, Unit is invalid. So we pass '' to reset.
            refreshUnitOptions('');
            refreshSectionOptions('');

            localStorage.setItem('filterOrg', filterOrg.value);
            localStorage.setItem('filterUnit', filterUnit.value);
            localStorage.setItem('filterSection', filterSection.value);

            filterAndSort();
        });
        if (filterUnit) filterUnit.addEventListener('change', () => {
            // Unit changed: Reset Section
            refreshSectionOptions('');

            localStorage.setItem('filterUnit', filterUnit.value);
            localStorage.setItem('filterSection', filterSection.value);

            filterAndSort();
        });
        if (filterSection) filterSection.addEventListener('change', () => {
            localStorage.setItem('filterSection', filterSection.value);
            filterAndSort();
        });

        sortBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                sortBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentSort = e.target.dataset.sort;
                localStorage.setItem('currentSort', currentSort);
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

            // Immediately update the employee card summary scores
            updateEmployeeCardSummary(ratee);

            // Reload data to update global stats
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

// Immediately update employee card summary scores based on current rater inputs
// Uses weighted calculation: 50% managers + 50% colleagues
function updateEmployeeCardSummary(ratee) {
    // Find the employee card
    const employeeCards = document.querySelectorAll('.employee-card');
    let targetCard = null;
    employeeCards.forEach(card => {
        const nameEl = card.querySelector('h2');
        if (nameEl && nameEl.textContent.trim() === ratee) {
            targetCard = card;
        }
    });

    if (!targetCard) return;

    // Collect all rater scores for this employee, separated by manager/colleague
    const raterCards = targetCard.querySelectorAll('.rater-card');

    // Managers (has special-rater class)
    let mgrCat1Sum = 0, mgrCat2Sum = 0, mgrCat3Sum = 0, mgrCount = 0;
    // Colleagues (no special-rater class)
    let colCat1Sum = 0, colCat2Sum = 0, colCat3Sum = 0, colCount = 0;

    raterCards.forEach(raterCard => {
        const cat1Input = raterCard.querySelector('input[data-field="cat1"]');
        const cat2Input = raterCard.querySelector('input[data-field="cat2"]');
        const cat3Input = raterCard.querySelector('input[data-field="cat3"]');

        if (cat1Input && cat2Input && cat3Input) {
            const cat1 = parseFloat(cat1Input.value) || 0;
            const cat2 = parseFloat(cat2Input.value) || 0;
            const cat3 = parseFloat(cat3Input.value) || 0;

            // Check if this rater is a manager (has special-rater class)
            if (raterCard.classList.contains('special-rater')) {
                mgrCat1Sum += cat1;
                mgrCat2Sum += cat2;
                mgrCat3Sum += cat3;
                mgrCount++;
            } else {
                colCat1Sum += cat1;
                colCat2Sum += cat2;
                colCat3Sum += cat3;
                colCount++;
            }
        }
    });

    if (mgrCount === 0 && colCount === 0) return;

    // Custom rounding function: .1-.9 → ceil, .0 → floor
    function customRound(value) {
        const firstDecimal = Math.floor((value * 10) % 10);
        if (firstDecimal >= 1) {
            return Math.ceil(value);
        } else {
            return Math.floor(value);
        }
    }

    // Calculate weighted averages for each category
    function calcWeightedAvg(mgrSum, mgrCnt, colSum, colCnt) {
        let mgrAvg = 0, colAvg = 0;
        let mgrWeight = 0, colWeight = 0;

        if (mgrCnt > 0) {
            mgrAvg = mgrSum / mgrCnt;
            mgrWeight = 0.5;
        }
        if (colCnt > 0) {
            colAvg = colSum / colCnt;
            colWeight = 0.5;
        }

        const totalWeight = mgrWeight + colWeight;
        if (totalWeight === 0) return 0;

        if (totalWeight < 1.0) {
            // Only one group exists, normalize
            return (mgrAvg * mgrWeight + colAvg * colWeight) / totalWeight;
        }

        return mgrAvg * 0.5 + colAvg * 0.5;
    }

    const cat1Avg = calcWeightedAvg(mgrCat1Sum, mgrCount, colCat1Sum, colCount);
    const cat2Avg = calcWeightedAvg(mgrCat2Sum, mgrCount, colCat2Sum, colCount);
    const cat3Avg = calcWeightedAvg(mgrCat3Sum, mgrCount, colCat3Sum, colCount);

    const cat1Rounded = customRound(cat1Avg);
    const cat2Rounded = customRound(cat2Avg);
    const cat3Rounded = customRound(cat3Avg);
    const totalScore = cat1Rounded + cat2Rounded + cat3Rounded;

    // Update the category scores display
    const catScores = targetCard.querySelectorAll('.cat-score');
    if (catScores.length >= 3) {
        const cat1Value = catScores[0].querySelector('.cat-value');
        const cat1Raw = catScores[0].querySelector('.cat-original');
        if (cat1Value) cat1Value.textContent = cat1Rounded;
        if (cat1Raw) cat1Raw.textContent = `(${cat1Avg.toFixed(2)})`;

        const cat2Value = catScores[1].querySelector('.cat-value');
        const cat2Raw = catScores[1].querySelector('.cat-original');
        if (cat2Value) cat2Value.textContent = cat2Rounded;
        if (cat2Raw) cat2Raw.textContent = `(${cat2Avg.toFixed(2)})`;

        const cat3Value = catScores[2].querySelector('.cat-value');
        const cat3Raw = catScores[2].querySelector('.cat-original');
        if (cat3Value) cat3Value.textContent = cat3Rounded;
        if (cat3Raw) cat3Raw.textContent = `(${cat3Avg.toFixed(2)})`;
    }

    // Update the total score badge
    const scoreBadge = targetCard.querySelector('.score-badge');
    if (scoreBadge) {
        scoreBadge.textContent = totalScore;
        scoreBadge.style.animation = 'pulse 0.3s ease';
        setTimeout(() => scoreBadge.style.animation = '', 300);
    }
}

// Update modified indicator on a rater card
function updateModifiedIndicator(raterCard, isModified, ratee, rater) {
    const raterName = raterCard.querySelector('.rater-name');
    const raterActions = raterCard.querySelector('.rater-actions');

    if (isModified) {
        // Add modified class
        raterCard.classList.add('is-modified');

        // Add modified badge if not exists (append to raterCard for absolute positioning)
        if (!raterCard.querySelector('.modified-badge')) {
            const badge = document.createElement('span');
            badge.className = 'modified-badge';
            badge.innerHTML = '<i class="fa-solid fa-pen"></i> 已修改';
            raterCard.appendChild(badge);
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
// Manual save function for "V" button
window.manualSave = async function (ratee, rater) {
    const card = document.querySelector(`.rater-card[data-ratee="${ratee}"][data-rater="${rater}"]`);
    if (!card) return;

    const btn = card.querySelector('.save-rater-btn');
    const icon = btn.querySelector('i');

    // UI Feedback: Spinning
    const originalClass = 'fa-solid fa-check';
    icon.className = 'fa-solid fa-spinner fa-spin';
    btn.disabled = true;

    // Collect values
    const cat1Input = card.querySelector('input[data-field="cat1"]');
    const cat2Input = card.querySelector('input[data-field="cat2"]');
    const cat3Input = card.querySelector('input[data-field="cat3"]');

    const cat1 = parseFloat(cat1Input.value) || 0;
    const cat2 = parseFloat(cat2Input.value) || 0;
    const cat3 = parseFloat(cat3Input.value) || 0;

    try {
        const response = await fetch('/api/update-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ratee, rater, cat1, cat2, cat3 })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || '儲存失敗');

        // Success Feedback
        icon.className = 'fa-solid fa-check-double'; // Double check to indicate "Written"
        btn.classList.add('success');

        // Re-check modified status (optional but good for consistency)
        const originalCat1 = parseFloat(cat1Input.dataset.original) || 0;
        const originalCat2 = parseFloat(cat2Input.dataset.original) || 0;
        const originalCat3 = parseFloat(cat3Input.dataset.original) || 0;
        const isModified = (cat1 !== originalCat1 || cat2 !== originalCat2 || cat3 !== originalCat3);

        if (typeof updateModifiedIndicator === 'function') {
            updateModifiedIndicator(card, isModified, ratee, rater);
        }

        setTimeout(() => {
            icon.className = originalClass;
            btn.classList.remove('success');
            btn.disabled = false;
        }, 1500);

    } catch (err) {
        console.error(err);
        alert('儲存失敗: ' + err.message);
        icon.className = originalClass;
        btn.disabled = false;
    }
}

async function deleteScore(ratee, rater) {
    window.isDialogOpen = true;
    const confirmed = confirm(`確定要刪除 ${rater} 對 ${ratee} 的評分嗎？`);
    window.isDialogOpen = false;

    if (!confirmed) {
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
    window.isDialogOpen = true;
    const confirmed = confirm('確定要將所有已修改的評分還原為原始分數嗎？\n\n此操作無法復原！');
    window.isDialogOpen = false;

    if (!confirmed) {
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
    window.isDialogOpen = true;
    const confirmed = confirm(`確定要將 ${rater} 對 ${ratee} 的評分還原為原始分數嗎？`);
    window.isDialogOpen = false;

    if (!confirmed) {
        return;
    }

    try {
        let result;

        // Try local server first
        try {
            const response = await fetch('/api/restore-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ratee, rater })
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
            if (typeof restoreScoreInSupabase === 'function') {
                await restoreScoreInSupabase(ratee, rater);
                result = { success: true };
            } else {
                throw serverErr;
            }
        }

        if (result.success) {
            // Refresh page to show updated data
            location.reload();
        } else {
            alert('還原失敗：' + (result.error || '未知錯誤'));
        }
    } catch (err) {
        console.error('Restore failed:', err);
        alert('還原失敗：' + err.message);
    }
}

// Global function to fetch and display deleted scores
async function showDeletedScores() {
    try {
        const response = await fetch('/api/deleted-scores');
        if (!response.ok) throw new Error('無法取得已刪除評分');

        const data = await response.json();
        const deleted = data.deleted || [];

        if (deleted.length === 0) {
            alert('目前沒有已刪除的評分');
            return;
        }

        // Create modal to show deleted scores
        let modal = document.getElementById('deletedScoresModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'deletedScoresModal';
            modal.className = 'deleted-modal';
            document.body.appendChild(modal);
        }

        const listHtml = deleted.map(d => `
            <div class="deleted-item">
                <div class="deleted-info">
                    <strong>${d.rater}</strong> → <strong>${d.ratee}</strong>
                    <span class="deleted-scores">第一類: ${d.cat1}, 第二類: ${d.cat2}, 第三類: ${d.cat3}</span>
                    <span class="deleted-time">刪除於: ${d.deleted_at ? new Date(d.deleted_at).toLocaleString('zh-TW') : '未知'}</span>
                </div>
                <button class="restore-deleted-btn" onclick="restoreDeletedScore('${d.ratee}', '${d.rater}')">
                    <i class="fa-solid fa-rotate-left"></i> 還原
                </button>
            </div>
        `).join('');

        modal.innerHTML = `
            <div class="deleted-modal-content">
                <div class="deleted-modal-header">
                    <h2><i class="fa-solid fa-trash-can-arrow-up"></i> 已刪除的評分 (${deleted.length})</h2>
                    <button class="close-modal-btn" onclick="closeDeletedModal()">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="deleted-list">
                    ${listHtml}
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    } catch (err) {
        console.error('Failed to fetch deleted scores:', err);
        alert('無法取得已刪除評分：' + err.message);
    }
}

// Close deleted scores modal
function closeDeletedModal() {
    const modal = document.getElementById('deletedScoresModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Restore a deleted score
async function restoreDeletedScore(ratee, rater) {
    window.isDialogOpen = true;
    const confirmed = confirm(`確定要還原 ${rater} 對 ${ratee} 的評分嗎？`);
    window.isDialogOpen = false;

    if (!confirmed) return;

    try {
        const response = await fetch('/api/restore-deleted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ratee, rater })
        });

        if (!response.ok) throw new Error('還原失敗');

        const result = await response.json();
        if (result.success) {
            alert('還原成功！');
            closeDeletedModal();
            location.reload();
        } else {
            alert('還原失敗：' + (result.error || '未知錯誤'));
        }
    } catch (err) {
        console.error('Restore deleted failed:', err);
        alert('還原失敗：' + err.message);
    }
}

// Show modal to add a new rater for an employee
function showAddRaterModal(ratee) {
    let modal = document.getElementById('addRaterModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'addRaterModal';
        modal.className = 'add-rater-modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="add-rater-modal-content">
            <div class="add-rater-modal-header">
                <h2><i class="fa-solid fa-user-plus"></i> 新增評分者</h2>
                <button class="close-modal-btn" onclick="closeAddRaterModal()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="add-rater-form">
                <div class="form-group">
                    <label>受評者</label>
                    <input type="text" id="addRaterRatee" value="${ratee}" readonly>
                </div>
                <div class="form-group">
                    <label>評分者姓名 <span class="required">*</span></label>
                    <input type="text" id="addRaterName" placeholder="請輸入評分者姓名">
                </div>
                <div class="form-group">
                    <label>評分者角色 <span class="required">*</span></label>
                    <div class="role-toggle">
                        <label class="role-option">
                            <input type="radio" name="raterRole" value="manager">
                            <span class="role-label manager"><i class="fa-solid fa-user-tie"></i> 主管</span>
                        </label>
                        <label class="role-option">
                            <input type="radio" name="raterRole" value="peer" checked>
                            <span class="role-label peer"><i class="fa-solid fa-users"></i> 平級</span>
                        </label>
                    </div>
                </div>
                <div class="score-inputs">
                    <div class="form-group score-group">
                        <label>第一大類 (0-40)</label>
                        <input type="number" id="addRaterCat1" min="0" max="40" value="30">
                    </div>
                    <div class="form-group score-group">
                        <label>第二大類 (0-30)</label>
                        <input type="number" id="addRaterCat2" min="0" max="30" value="22">
                    </div>
                    <div class="form-group score-group">
                        <label>第三大類 (0-30)</label>
                        <input type="number" id="addRaterCat3" min="0" max="30" value="22">
                    </div>
                </div>
                <div class="form-actions">
                    <button class="cancel-btn" onclick="closeAddRaterModal()">取消</button>
                    <button class="submit-btn" onclick="submitNewRater()">
                        <i class="fa-solid fa-check"></i> 確認新增
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';

    // Focus on rater name input
    setTimeout(() => {
        document.getElementById('addRaterName').focus();
    }, 100);
}

// Close add rater modal
function closeAddRaterModal() {
    const modal = document.getElementById('addRaterModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Submit new rater
async function submitNewRater() {
    const ratee = document.getElementById('addRaterRatee').value.trim();
    const rater = document.getElementById('addRaterName').value.trim();
    const roleRadio = document.querySelector('input[name="raterRole"]:checked');
    const isManager = roleRadio ? roleRadio.value === 'manager' : false;
    const cat1 = parseInt(document.getElementById('addRaterCat1').value) || 0;
    const cat2 = parseInt(document.getElementById('addRaterCat2').value) || 0;
    const cat3 = parseInt(document.getElementById('addRaterCat3').value) || 0;

    if (!rater) {
        alert('請輸入評分者姓名');
        return;
    }

    // Validate scores
    if (cat1 < 0 || cat1 > 40) {
        alert('第一大類分數必須在 0-40 之間');
        return;
    }
    if (cat2 < 0 || cat2 > 30) {
        alert('第二大類分數必須在 0-30 之間');
        return;
    }
    if (cat3 < 0 || cat3 > 30) {
        alert('第三大類分數必須在 0-30 之間');
        return;
    }

    try {
        // If running on GitHub Pages, use Supabase Client directly
        if (location.hostname.includes('github.io')) {
            if (typeof addScoreInSupabase !== 'function') {
                throw new Error('Supabase client module missing');
            }
            await addScoreInSupabase(ratee, rater, cat1, cat2, cat3);
            alert('新增成功！');
            closeAddRaterModal();
            location.reload();
            return;
        }

        // Local Server Logic
        const response = await fetch('/api/add-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ratee, rater, cat1, cat2, cat3, is_manager: isManager })
        });

        if (!response.ok) throw new Error('新增失敗');

        const result = await response.json();
        if (result.success) {
            alert(result.message || '新增成功！');
            closeAddRaterModal();
            location.reload();
        } else {
            alert('新增失敗：' + (result.error || '未知錯誤'));
        }
    } catch (err) {
        console.error('Add rater failed:', err);
        alert('新增失敗：' + err.message);
    }
}
