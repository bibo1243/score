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
            const name = row['員工姓名'] || row['姓名']; // Fallback
            if (name) {
                staffMeta[name] = {
                    org: row['所屬機構'] || row['機構'] || '未分類',
                    unit: row['所屬單位'] || row['組別'] || '',
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
        // Add cache-busting to ensure fresh data
        const response = await fetch('rating_rules.json?t=' + Date.now());
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
    const bonuses = {}; // Store system bonuses here

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

    const h1Scores = {}; // Store system H1 scores

    // Process Raw Scores
    rawScores.forEach(row => {
        const ratee = row.ratee;
        if (!ratee) return;

        // Filter out System Raters
        if (row.rater === '_SYSTEM_BONUS_') {
            bonuses[ratee] = parseFloat(row.cat1) || 0;
            return;
        }
        if (row.rater === '_SYSTEM_H1_') {
            // H1 score is distinct, strictly for display in self-assessment & annual calc
            h1Scores[ratee] = parseFloat(row.cat1) || 0;
            return;
        }

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

    // ========== PHASE 1: Calculate base weighted scores for ALL employees ==========
    // This ensures subordinates' scores are properly weighted before being used
    // in institution heads' calculations (same fix as server.py)
    // Uses iterative calculation to handle multi-level dependencies
    const baseScores = {}; // { employeeName: { cat1: weightedAvg, cat2: weightedAvg, cat3: weightedAvg } }

    const allRatees = new Set([...Object.keys(employeeRaters), ...Object.keys(staff)]);

    // Helper function to calculate base score for an employee
    const calcBaseScoreForEmployee = (employee, useSubRules = true) => {
        const currentRaters = employeeRaters[employee] || [];
        const empConfig = employeeConfigs[employee] || {};
        const myManagers = new Set(empConfig.managers || []);
        const managerWeight = empConfig.manager_weight !== undefined ? empConfig.manager_weight : 0.5;
        const subRules = empConfig.subordinate_rules || [];
        const excludedPeers = new Set(empConfig.excluded_peers || []);

        const calcCategoryScore = (catKey) => {
            let totalWeighted = 0;
            let totalWeightUsed = 0;

            // Managers
            const mgrRaters = currentRaters.filter(r => myManagers.has(r.name));
            if (mgrRaters.length > 0) {
                const avg = mgrRaters.reduce((s, r) => s + r[catKey], 0) / mgrRaters.length;
                totalWeighted += avg * managerWeight;
                totalWeightUsed += managerWeight;
            }

            // Subordinate Rules - use baseScores for members
            if (useSubRules && subRules.length > 0) {
                subRules.forEach(rule => {
                    const ruleWeight = rule.weight || 0;
                    if (ruleWeight <= 0) return;

                    const ruleMembers = rule.members || [];
                    const subScores = [];
                    ruleMembers.forEach(member => {
                        if (baseScores[member]) {
                            subScores.push(baseScores[member][catKey]);
                        }
                    });

                    if (subScores.length > 0) {
                        const avg = subScores.reduce((s, v) => s + v, 0) / subScores.length;
                        totalWeighted += avg * ruleWeight;
                        totalWeightUsed += ruleWeight;
                    }
                });
            } else {
                // Peers (excluding managers and excluded peers)
                const peerWeight = Math.max(0, 1.0 - managerWeight);
                const peerRaters = currentRaters.filter(r => !myManagers.has(r.name) && !excludedPeers.has(r.name));
                if (peerRaters.length > 0 && peerWeight > 0) {
                    const avg = peerRaters.reduce((s, r) => s + r[catKey], 0) / peerRaters.length;
                    totalWeighted += avg * peerWeight;
                    totalWeightUsed += peerWeight;
                }
            }

            // Normalize if not all weights used
            if (totalWeightUsed > 0 && totalWeightUsed < 1.0) {
                return totalWeighted / totalWeightUsed;
            }
            return totalWeighted;
        };

        return {
            cat1: calcCategoryScore('cat1'),
            cat2: calcCategoryScore('cat2'),
            cat3: calcCategoryScore('cat3')
        };
    };

    // Round 1A: Calculate employees WITHOUT subordinate_rules
    for (const employee of allRatees) {
        const empConfig = employeeConfigs[employee] || {};
        const subRules = empConfig.subordinate_rules || [];

        if (subRules.length === 0) {
            baseScores[employee] = calcBaseScoreForEmployee(employee, false);
        }
    }

    // Round 1B: Iteratively calculate employees WITH subordinate_rules
    // Process in order of dependencies (employees whose subordinates are already calculated)
    const employeesWithSubRules = [];
    for (const employee of allRatees) {
        const empConfig = employeeConfigs[employee] || {};
        const subRules = empConfig.subordinate_rules || [];
        if (subRules.length > 0) {
            employeesWithSubRules.push(employee);
        }
    }

    // Iterative processing - up to 10 rounds to handle multi-level dependencies
    for (let round = 0; round < 10 && employeesWithSubRules.length > 0; round++) {
        const remaining = [];

        for (const employee of employeesWithSubRules) {
            if (baseScores[employee]) continue; // Already processed

            const empConfig = employeeConfigs[employee] || {};
            const subRules = empConfig.subordinate_rules || [];

            // Check if all subordinate members are in baseScores
            let allMembersAvailable = true;
            for (const rule of subRules) {
                const members = rule.members || [];
                for (const member of members) {
                    if (!baseScores[member]) {
                        allMembersAvailable = false;
                        break;
                    }
                }
                if (!allMembersAvailable) break;
            }

            if (allMembersAvailable) {
                // All dependencies met, calculate this employee
                baseScores[employee] = calcBaseScoreForEmployee(employee, true);
            } else {
                // Dependencies not met, try again next round
                remaining.push(employee);
            }
        }

        // Update the list for next round
        employeesWithSubRules.length = 0;
        employeesWithSubRules.push(...remaining);

        // If no progress, break
        if (remaining.length === employeesWithSubRules.length) break;
    }

    // Handle any remaining employees (circular dependencies or missing data)
    for (const employee of employeesWithSubRules) {
        if (!baseScores[employee]) {
            baseScores[employee] = calcBaseScoreForEmployee(employee, true);
        }
    }

    const result = [];

    for (const employee of allRatees) {
        if (!employeeRaters[employee]) {
            // Handle employee with 0 raters if needed, or skip?
            // Usually we want to show them with 0 score
            employeeRaters[employee] = [];
        }

        const currentRaters = employeeRaters[employee];
        const meta = staff[employee] || { org: '未分類', unit: '', section: '' };

        // ... (Config loading omitted for brevity, logic unchanged) ...
        const empConfig = employeeConfigs[employee] || {};
        const myManagers = new Set(empConfig.managers || []);
        const managerWeight = empConfig.manager_weight !== undefined ? empConfig.manager_weight : 0.5;
        const subRules = empConfig.subordinate_rules || [];
        const excludedPeers = new Set(empConfig.excluded_peers || []);

        // Calculate Weights
        let subTotalWeight = 0;
        subRules.forEach(r => subTotalWeight += r.weight);
        let peerWeight = Math.max(0, 1.0 - managerWeight - subTotalWeight);

        const mySubordinates = Array.from(managerToSubordinates[employee] || []).sort();

        // Identify Missing Raters logic unchanged
        const missingRaters = [];
        if (meta.org !== '未分類') {
            for (const [sName, sMeta] of Object.entries(staff)) {
                if (sName !== employee && sMeta.org === meta.org && sMeta.unit === meta.unit) {
                    if (!myManagers.has(sName) && !mySubordinates.includes(sName)) {
                        if (!currentRaters.find(r => r.name === sName)) {
                            missingRaters.push(sName);
                        }
                    }
                }
            }
        }

        // Calculation Function logic unchanged
        const calcCategory = (catKey) => {
            let totalWeighted = 0;
            let totalWeightUsed = 0;
            const breakdown = [];

            // A. Managers
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
                    raterDetails: myMgrRaters.map(r => ({ name: r.name, score: r[catKey] }))
                });
            } else if (managerWeight > 0) {
                breakdown.push({ desc: '主管', weight: Math.round(managerWeight * 100), avg: 0, count: 0, raterDetails: [] });
            }

            // B. Subordinate Rules - Use pre-calculated weighted scores from baseScores
            subRules.forEach(rule => {
                const members = rule.members || [];
                const mDetails = [];
                let grpTotal = 0;

                members.forEach(mName => {
                    // Use baseScores (weighted) instead of raw rater average
                    if (baseScores[mName]) {
                        const mWeightedScore = baseScores[mName][catKey];
                        grpTotal += mWeightedScore;
                        mDetails.push({ name: mName, score: mWeightedScore });
                    }
                });

                if (mDetails.length > 0) {
                    const grpAvg = grpTotal / mDetails.length;
                    totalWeighted += grpAvg * rule.weight;
                    totalWeightUsed += rule.weight;
                    breakdown.push({
                        desc: rule.name,
                        weight: Math.round(rule.weight * 100),
                        avg: grpAvg,
                        count: mDetails.length,
                        raterDetails: mDetails
                    });
                } else {
                    breakdown.push({ desc: rule.name, weight: Math.round(rule.weight * 100), avg: 0, count: 0, raterDetails: [] });
                }
            });

            // C. Peers
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
                    raterDetails: myPeerRaters.map(r => ({ name: r.name, score: r[catKey] }))
                });
            } else if (peerWeight > 0) {
                breakdown.push({ desc: '其他同仁', weight: Math.round(peerWeight * 100), avg: 0, count: 0, raterDetails: [] });
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

        // Add Bonus Handling
        const bonus = bonuses[employee] || 0;

        result.push({
            name: employee,
            org: meta.org,
            unit: meta.unit,
            section: meta.section,
            average_score: total, // Base score without bonus
            bonus: bonus,        // Separate bonus field
            final_score: total + bonus, // Total with bonus
            cat1_avg: c1.score, cat2_avg: c2.score, cat3_avg: c3.score,
            cat1_rounded: cat1Rounded, cat2_rounded: cat2Rounded, cat3_rounded: cat3Rounded,
            rater_count: currentRaters.length,
            raters: currentRaters,
            missing_raters: missingRaters,
            subordinates: mySubordinates,
            breakdown: c1.breakdown, // Keep for backward compatibility
            breakdowns: {
                cat1: c1.breakdown,
                cat2: c2.breakdown,
                cat3: c3.breakdown
            },
            h1_score: h1Scores[employee] || 0,
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
