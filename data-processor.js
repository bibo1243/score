// Static data processor - processes Supabase data for display
// Updated with weighted calculation reading from rating_rules.json

let staffMeta = null;
let ratingRules = null;

// Custom rounding: .1-.9 → round up (ceil), .0 → round down (floor)
function customRound(value) {
    const firstDecimal = Math.floor((value * 10) % 10);
    if (firstDecimal >= 1) {
        return Math.ceil(value);
    } else {
        return Math.floor(value);
    }
}

// Load staff metadata from CSV
async function loadStaffMeta() {
    if (staffMeta) return staffMeta;
    try {
        const response = await fetch('工作人員名冊.csv');
        const text = await response.text();
        const rows = parseCSV(text); // Assumes generic CSV parser available or we implement simple one
        staffMeta = {};
        rows.forEach(row => {
            if (row['姓名']) {
                staffMeta[row['姓名']] = {
                    org: row['機構'] || '未分類',
                    unit: row['組別'] || '',
                    section: row['股別'] || '',
                    supervisor: row['直屬主管'] || '',
                    position: row['職稱'] || ''
                };
            }
        });
    } catch (e) {
        console.error("Error loading staff meta", e);
        staffMeta = {};
    }
    return staffMeta;
}

// Simple CSV parser if not available globally
function parseCSV(text) {
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h] = values[i] ? values[i].trim() : '');
        return obj;
    });
}

async function loadRatingRules() {
    if (ratingRules) return ratingRules;
    try {
        const response = await fetch('rating_rules.json');
        ratingRules = await response.json();
    } catch (e) {
        console.error("Failed to load rating rules", e);
        ratingRules = { employees: {} };
    }
    return ratingRules;
}

// Process raw Supabase scores into display format with weighted calculation
async function processScoresForDisplay(rawScores) {
    const staff = await loadStaffMeta();
    const rulesConfig = await loadRatingRules();
    const employeeConfigs = rulesConfig.employees || {};

    // 1. Group raters by Ratee
    const employeeRaters = {};

    // Reverse map for subordinates list building
    // Manager -> Set of Subordinates
    const managerToSubordinates = {};

    // Build maps from rules
    Object.entries(employeeConfigs).forEach(([empName, conf]) => {
        const mgrs = conf.managers || [];
        mgrs.forEach(m => {
            if (!managerToSubordinates[m]) managerToSubordinates[m] = new Set();
            managerToSubordinates[m].add(empName);
        });
    });

    // Process Raw Scores
    rawScores.forEach(row => {
        const ratee = row.ratee;
        if (!ratee) return;
        if (!employeeRaters[ratee]) employeeRaters[ratee] = [];

        const cat1 = parseFloat(row.cat1) || 0;
        const cat2 = parseFloat(row.cat2) || 0;
        const cat3 = parseFloat(row.cat3) || 0;

        employeeRaters[ratee].push({
            name: row.rater,
            cat1: cat1,
            cat2: cat2,
            cat3: cat3,
            total: cat1 + cat2 + cat3,
            original_cat1: row.original_cat1,
            is_modified: (row.original_cat1 !== null && row.original_cat1 != cat1) // simplified check
        });
    });

    const result = [];
    const allRatees = new Set([...Object.keys(employeeRaters), ...Object.keys(staff)]);

    for (const employee of allRatees) {
        if (!employeeRaters[employee]) {
            // Handle employee with 0 raters if needed, or skip?
            // Usually we want to show them with 0 score
            employeeRaters[employee] = [];
        }

        const currentRaters = employeeRaters[employee];
        const meta = staff[employee] || { org: '未分類', unit: '', section: '' };

        // Config
        const empConfig = employeeConfigs[employee] || {};
        const myManagers = new Set(empConfig.managers || []);
        const managerWeight = empConfig.manager_weight !== undefined ? empConfig.manager_weight : 0.5;
        const subRules = empConfig.subordinate_rules || [];
        const excludedPeers = new Set(empConfig.excluded_peers || []);

        // Calculate Weights
        let subTotalWeight = 0;
        subRules.forEach(r => subTotalWeight += r.weight);
        let peerWeight = Math.max(0, 1.0 - managerWeight - subTotalWeight);

        // Identify Subordinates for UI display
        const mySubordinates = Array.from(managerToSubordinates[employee] || []).sort();

        // Identify Missing Raters
        // Logic: Same Unit Peers who are NOT my manager AND NOT my subordinate AND haven't rated me
        const missingRaters = [];
        if (meta.org !== '未分類') {
            // This assumes we can iterate all staff to find unit peers. 
            // Inefficient but fine for small list.
            for (const [sName, sMeta] of Object.entries(staff)) {
                if (sName !== employee && sMeta.org === meta.org && sMeta.unit === meta.unit) {
                    // Check exclusion
                    if (!myManagers.has(sName) && !mySubordinates.includes(sName)) {
                        // Check if rated
                        if (!currentRaters.find(r => r.name === sName)) {
                            missingRaters.push(sName);
                        }
                    }
                }
            }
        }

        // Calculation Function
        const calcCategory = (catKey) => {
            let totalWeighted = 0;
            let totalWeightUsed = 0;
            const breakdown = [];

            // A. Managers
            const myManagerWeights = {};
            // Pre-calculate custom weights if any
            // (Only if complex logic is needed, but we use simplified logic here for match)

            // Update is_special flag for UI rendering
            currentRaters.forEach(r => {
                if (myManagers.has(r.name)) {
                    r.is_special = true;
                } else {
                    r.is_special = false;
                }
            });

            const myMgrRaters = currentRaters.filter(r => myManagers.has(r.name));
            if (myMgrRaters.length > 0) {
                const avg = myMgrRaters.reduce((s, r) => s + r[catKey], 0) / myMgrRaters.length;
                totalWeighted += avg * managerWeight;
                totalWeightUsed += managerWeight;
                breakdown.push({
                    desc: '主管',
                    weight: Math.round(managerWeight * 100),
                    avg: avg,
                    count: myMgrRaters.length,
                    raters: myMgrRaters.map(r => r.name)
                });
            } else if (managerWeight > 0) {
                breakdown.push({ desc: '主管', weight: Math.round(managerWeight * 100), avg: 0, count: 0, raters: [] });
            }

            // B. Subordinate Rules
            subRules.forEach(rule => {
                const members = rule.members || [];
                const mScores = [];
                const foundMembers = [];

                members.forEach(mName => {
                    const mRaters = employeeRaters[mName];
                    if (mRaters && mRaters.length > 0) {
                        const mRawAvg = mRaters.reduce((s, r) => s + r[catKey], 0) / mRaters.length;
                        mScores.push(mRawAvg);
                        foundMembers.push(mName);
                    }
                });

                if (mScores.length > 0) {
                    const grpAvg = mScores.reduce((a, b) => a + b, 0) / mScores.length;
                    totalWeighted += grpAvg * rule.weight;
                    totalWeightUsed += rule.weight;
                    breakdown.push({
                        desc: rule.name,
                        weight: Math.round(rule.weight * 100),
                        avg: grpAvg,
                        count: mScores.length,
                        raters: foundMembers
                    });
                } else {
                    breakdown.push({ desc: rule.name, weight: Math.round(rule.weight * 100), avg: 0, count: 0, raters: [] });
                }
            });

            // C. Peers (exclude managers and excluded_peers)
            const myPeerRaters = currentRaters.filter(r => !myManagers.has(r.name) && !excludedPeers.has(r.name));
            if (myPeerRaters.length > 0) {
                const avg = myPeerRaters.reduce((s, r) => s + r[catKey], 0) / myPeerRaters.length;
                totalWeighted += avg * peerWeight;
                totalWeightUsed += peerWeight;
                breakdown.push({
                    desc: '其他同仁',
                    weight: Math.round(peerWeight * 100),
                    avg: avg,
                    count: myPeerRaters.length,
                    raters: myPeerRaters.map(r => r.name)
                });
            } else if (peerWeight > 0) {
                breakdown.push({ desc: '其他同仁', weight: Math.round(peerWeight * 100), avg: 0, count: 0, raters: [] });
            }

            return { score: totalWeighted, breakdown: breakdown };
        };

        const c1 = calcCategory('cat1');
        const c2 = calcCategory('cat2');
        const c3 = calcCategory('cat3');

        const cat1Rounded = customRound(c1.score);
        const cat2Rounded = customRound(c2.score);
        const cat3Rounded = customRound(c3.score);
        const total = cat1Rounded + cat2Rounded + cat3Rounded;

        // Skip empty entries if they are just from staff meta but have no data and no ratings
        if (currentRaters.length === 0 && !meta.org) continue;

        // For display table, we usually only show those with ratings or missing raters
        // But let's include everyone in staffMeta

        result.push({
            name: employee,
            org: meta.org,
            unit: meta.unit,
            section: meta.section,
            average_score: total,
            cat1_avg: c1.score, cat2_avg: c2.score, cat3_avg: c3.score,
            cat1_rounded: cat1Rounded, cat2_rounded: cat2Rounded, cat3_rounded: cat3Rounded,
            rater_count: currentRaters.length,
            raters: currentRaters,
            missing_raters: missingRaters,
            subordinates: mySubordinates,
            breakdown: c1.breakdown, // Use Cat1 as sample
            is_weighted: true
        });
    }

    // Sort
    result.sort((a, b) => b.average_score - a.average_score);
    return result;
}

// Load and process all data
async function loadProcessedData() {
    const rawScores = await fetchScores();
    return await processScoresForDisplay(rawScores);
}
