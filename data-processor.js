// Static data processor - processes Supabase data for display
// Updated with weighted calculation matching server.py logic

// Staff metadata (cached)
let staffMeta = null;
let allEmployeeScores = {}; // Cache for subordinate performance calculation

// Define managers
const MANAGERS = new Set(['廖振杉', '廖慧雯', '李冠葦', '陳淑錡', '楊顗帆', '高靜華', '陳宛妤', '鍾宜珮']);
const SUPERVISORS = new Set(['簡采琦', '林品亨', '林紀騰']);
const ALL_MANAGERS = new Set([...MANAGERS, ...SUPERVISORS]);
const INSTITUTION_HEADS = new Set(['李冠葦', '廖振杉', '廖慧雯', '楊顗帆']);

// Special employee rules - who gets weighted subordinate performance
const SPECIAL_SUPERVISOR_RULES = {
    '林紀騰': {
        '庶務股股員': { members: ['林港博', '謝秀桃', '徐銘澤', '羅如光'], desc: '庶務股員績效平均', weight: 0.3 },
        '行政組其他組員': { members: ['劉春燕', '林麗娟', '熊小蓮', '王元鼎', '王芊蓉', '陸廷瑋'], desc: '行政組其他組員', weight: 0.2 }
    },
    '簡采琦': {
        '兒少之家社工股': { members: ['曾婷婷'], desc: '社工股員績效平均', weight: 0.4 },
        '兒少之家教保組其他員工': { members: ['林東美', '賀郁茵', '梁偉培', '廖玟慈', '張宜芳', '蕭婷予', '王卉蓁', '陳亮寧', '李炎輝', '許芸嘉'], desc: '保育股員績效平均', weight: 0.1 }
    },
    '林品亨': {
        '少年家園生輔股': { members: ['胡少淇', '郭楷欣', '吳秉熹', '蔣郡哲', '劉婷瑜', '吳思函', '陳昱綸'], desc: '生輔股員績效平均', weight: 0.4 },
        '少年家園教保組其他員工': { members: ['蘇盟惠', '劉宛宣', '黃歆藝', '黃穎蓁'], desc: '社工心輔股員績效平均', weight: 0.1 }
    },
    '李冠葦': {
        '機構員工': { members: ['劉春燕', '徐銘澤', '林港博', '林紀騰', '林麗娟', '王元鼎', '王芊蓉', '羅如光', '謝秀桃', '陳淑錡', '陸廷瑋'], desc: '行政組員工績效平均', weight: 0.5 }
    },
    '廖振杉': {
        '機構員工': { members: ['熊小蓮', '簡采琦', '廖玟慈', '張宜芳', '曾婷婷', '李炎輝', '林東美', '梁偉培', '王卉蓁', '蕭婷予', '許芸嘉', '賀郁茵', '陳亮寧', '陳宛妤'], desc: '兒少之家員工績效平均', weight: 0.5 }
    },
    '廖慧雯': {
        '機構員工': { members: ['劉婷瑜', '劉宛宣', '吳思函', '吳秉熹', '林品亨', '胡少淇', '蔣郡哲', '蘇盟惠', '郭楷欣', '鍾宜珮', '陳昱綸', '黃歆藝', '黃穎蓁'], desc: '少年家園員工績效平均', weight: 0.5 }
    },
    '楊顗帆': {
        '機構員工': { members: ['林彥秀', '陳柔安'], desc: '諮商所員工績效平均', weight: 0.5 }
    },
    '陳宛妤': {
        '兒少之家教保組員': { members: ['簡采琦', '林東美', '賀郁茵', '梁偉培', '廖玟慈', '張宜芳', '蕭婷予', '王卉蓁', '陳亮寧', '曾婷婷', '李炎輝', '許芸嘉'], desc: '兒少之家教保組員工績效平均', weight: 0.5 }
    },
    '鍾宜珮': {
        '少年家園教保組員': { members: ['林品亨', '胡少淇', '郭楷欣', '吳秉熹', '蔣郡哲', '劉婷瑜', '黃穎蓁', '吳思函', '蘇盟惠', '劉宛宣', '黃歆藝', '陳昱綸'], desc: '少年家園教保組員工績效平均', weight: 0.5 }
    },
    '陳淑錡': {
        '行政組員': { members: ['劉春燕', '徐銘澤', '林港博', '林紀騰', '林麗娟', '王元鼎', '王芊蓉', '羅如光', '謝秀桃', '陸廷瑋'], desc: '行政組員工績效平均', weight: 0.5 }
    },
    '高靜華': {
        '總幹事、兩家園主任': { members: [], desc: '總幹事、兩家園主任', weight: 1.0, directRatersOnly: true }
    }
};

// Special employee rules for manager identification
const SPECIAL_EMPLOYEE_MANAGERS = {
    '王姿斐': new Set(['李冠葦']),
    '高靜華': new Set(['李冠葦', '廖振杉', '廖慧雯']),
};

// Helper function to get unit managers
function getUnitManagers(unit) {
    switch (unit) {
        case '社資組':
            return new Set(['李冠葦']);
        case '行政組':
            return new Set(['李冠葦', '陳淑錡', '林紀騰']);
        case '教保組':
            return MANAGERS;
        default:
            return MANAGERS;
    }
}

// Check if rater is a manager for specific employee
function isManagerForEmployee(raterName, employeeName, employeeSection, employeeUnit) {
    if (SPECIAL_EMPLOYEE_MANAGERS[employeeName]) {
        return SPECIAL_EMPLOYEE_MANAGERS[employeeName].has(raterName);
    }
    const unitManagers = getUnitManagers(employeeUnit);
    if (unitManagers.has(raterName)) return true;
    if (MANAGERS.has(raterName)) return true;
    return false;
}

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
        staffMeta = parseStaffCSV(text);
        return staffMeta;
    } catch (e) {
        console.error('Failed to load staff metadata:', e);
        return {};
    }
}

function parseStaffCSV(csvText) {
    const lines = csvText.split('\n');
    if (lines.length < 2) return {};
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const meta = {};

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        if (values.length < headers.length) continue;
        const row = {};
        headers.forEach((h, idx) => row[h] = values[idx] || '');

        const name = row['員工姓名'];
        if (name) {
            let org = row['所屬機構'] || '';
            let unit = row['所屬單位'] || '';
            const section = row['股別'] || '';

            // Explicit mapping for Institution Heads
            if (name === '李冠葦') org = '基金會';
            else if (name === '熊小蓮') {
                org = '基金會';
                unit = '行政組';
            }
            else if (name === '廖振杉') org = '兒少之家';
            else if (name === '廖慧雯') org = '少年家園';
            else if (name === '楊顗帆') org = '諮商所';
            else if (['行政組', '社資組', '人資公關組', '圖書組', '會計室'].includes(unit)) {
                org = '基金會';
            } else if (org.includes('基金會')) {
                org = '基金會';
            } else if (org.includes('兒少') || unit === '兒少之家') {
                org = '兒少之家';
            } else if (org.includes('少年') || unit === '少年家園') {
                org = '少年家園';
            } else if (org.includes('諮商')) {
                org = '諮商所';
            }

            meta[name] = {
                org: org,
                unit: unit,
                section: section,
                supervisor: row['直屬主管'] || '',
                position: row['職稱'] || ''
            };
        }
    }
    return meta;
}

// First pass: Calculate basic scores for all employees (without subordinate weighting)
function calculateBasicScores(rawScores, staff) {
    const employeeData = {};

    rawScores.forEach(row => {
        const ratee = row.ratee || '';
        const rater = row.rater || '';
        const cat1 = parseFloat(row.cat1) || 0;
        const cat2 = parseFloat(row.cat2) || 0;
        const cat3 = parseFloat(row.cat3) || 0;
        const originalCat1 = row.original_cat1;
        const originalCat2 = row.original_cat2;
        const originalCat3 = row.original_cat3;
        const isModified = (originalCat1 !== null && (cat1 !== originalCat1 || cat2 !== originalCat2 || cat3 !== originalCat3));

        if (ratee) {
            if (!employeeData[ratee]) {
                employeeData[ratee] = { raters: [] };
            }
            employeeData[ratee].raters.push({
                name: rater,
                cat1: cat1, cat2: cat2, cat3: cat3,
                total: cat1 + cat2 + cat3,
                original_cat1: originalCat1, original_cat2: originalCat2, original_cat3: originalCat3,
                is_modified: isModified
            });
        }
    });

    // Calculate basic weighted average (50% manager + 50% colleague) for each employee
    const basicScores = {};
    for (const [name, data] of Object.entries(employeeData)) {
        const employeeMeta = staff[name] || { org: '未分類', unit: '', section: '' };
        const raters = data.raters;

        // Separate raters
        const managerRaters = [];
        const colleagueRaters = [];
        raters.forEach(r => {
            const isMgr = isManagerForEmployee(r.name, name, employeeMeta.section, employeeMeta.unit);
            r.is_special = isMgr;
            if (isMgr) managerRaters.push(r);
            else colleagueRaters.push(r);
        });

        // Calculate weighted averages
        function calcWeightedCatAvg(catKey) {
            let managerAvg = 0, colleagueAvg = 0;
            let managerWeight = 0, colleagueWeight = 0;

            if (managerRaters.length > 0) {
                managerAvg = managerRaters.reduce((s, r) => s + r[catKey], 0) / managerRaters.length;
                managerWeight = 0.5;
            }
            if (colleagueRaters.length > 0) {
                colleagueAvg = colleagueRaters.reduce((s, r) => s + r[catKey], 0) / colleagueRaters.length;
                colleagueWeight = 0.5;
            }

            const totalWeight = managerWeight + colleagueWeight;
            if (totalWeight === 0) return 0;
            if (totalWeight < 1.0) {
                return (managerAvg * managerWeight + colleagueAvg * colleagueWeight) / totalWeight;
            }
            return managerAvg * 0.5 + colleagueAvg * 0.5;
        }

        const cat1Avg = calcWeightedCatAvg('cat1');
        const cat2Avg = calcWeightedCatAvg('cat2');
        const cat3Avg = calcWeightedCatAvg('cat3');
        const cat1Rounded = customRound(cat1Avg);
        const cat2Rounded = customRound(cat2Avg);
        const cat3Rounded = customRound(cat3Avg);

        // Calculate sub-averages for breakdown display
        function getGroupAvg(list) {
            if (list.length === 0) return 0;
            return Math.round(list.reduce((s, r) => s + r.total, 0) / list.length);
        }

        const breakdown = [];
        if (managerRaters.length > 0) {
            breakdown.push({
                desc: '主管',
                weight: 50,
                avg: getGroupAvg(managerRaters),
                count: managerRaters.length,
                raters: managerRaters.map(r => r.name)
            });
        }
        if (colleagueRaters.length > 0) {
            breakdown.push({
                desc: '其他同仁',
                weight: 50,
                avg: getGroupAvg(colleagueRaters),
                count: colleagueRaters.length,
                raters: colleagueRaters.map(r => r.name)
            });
        }

        basicScores[name] = {
            name: name,
            average_score: cat1Rounded + cat2Rounded + cat3Rounded,
            cat1_avg: cat1Avg, cat2_avg: cat2Avg, cat3_avg: cat3Avg,
            cat1_rounded: cat1Rounded, cat2_rounded: cat2Rounded, cat3_rounded: cat3Rounded,
            raters: raters,
            rater_count: raters.length,
            org: employeeMeta.org || '未分類',
            unit: employeeMeta.unit || '',
            section: employeeMeta.section || '',
            position: employeeMeta.position || '',
            supervisor: employeeMeta.supervisor || '',
            breakdown: breakdown,
            is_weighted: true // Force display of breakdown
        };
    }
    return basicScores;
}

// Second pass: Recalculate scores for managers using subordinate performance
function applySubordinatePerformance(basicScores, staff) {
    const result = [];

    for (const [name, emp] of Object.entries(basicScores)) {
        // Check if this employee has special supervisor rules
        if (SPECIAL_SUPERVISOR_RULES[name]) {
            const rules = SPECIAL_SUPERVISOR_RULES[name];
            const raters = emp.raters;

            // Separate manager raters from others
            const managerRaters = raters.filter(r => MANAGERS.has(r.name));

            // Calculate manager average (50% weight, unless special)
            let managerWeight = 0.5;
            let subordinateRulesWeight = 0;

            // Check if it's 高靜華 (100% from direct raters)
            if (name === '高靜華') {
                // Use only direct raters, no subordinate calculation
                result.push(emp);
                continue;
            }

            // Calculate each category with subordinate performance
            function calcCategoryWithSubordinates(catKey, roundedKey) {
                let totalWeighted = 0;
                let totalWeight = 0;
                const breakdown = [];

                // Manager component (50%)
                if (managerRaters.length > 0) {
                    const mgrAvg = managerRaters.reduce((s, r) => s + r[catKey], 0) / managerRaters.length;
                    totalWeighted += mgrAvg * 0.5;
                    totalWeight += 0.5;
                    breakdown.push({ desc: '主管', weight: 50, avg: mgrAvg, count: managerRaters.length, raters: managerRaters.map(r => r.name) });
                }

                // Subordinate performance components
                for (const [ruleDesc, ruleData] of Object.entries(rules)) {
                    const subordinateScores = ruleData.members
                        .filter(m => basicScores[m])
                        .map(m => basicScores[m][roundedKey]);

                    if (subordinateScores.length > 0) {
                        const subAvg = subordinateScores.reduce((a, b) => a + b, 0) / subordinateScores.length;
                        totalWeighted += subAvg * ruleData.weight;
                        totalWeight += ruleData.weight;
                        breakdown.push({
                            desc: ruleData.desc,
                            weight: Math.round(ruleData.weight * 100),
                            avg: subAvg,
                            count: subordinateScores.length,
                            raters: ruleData.members.filter(m => basicScores[m]).map(m => `${m}(${basicScores[m].average_score})`)
                        });
                    }
                }

                if (totalWeight === 0) return { avg: 0, breakdown: [] };
                return { avg: totalWeighted / totalWeight, breakdown: breakdown };
            }

            const cat1Result = calcCategoryWithSubordinates('cat1', 'cat1_rounded');
            const cat2Result = calcCategoryWithSubordinates('cat2', 'cat2_rounded');
            const cat3Result = calcCategoryWithSubordinates('cat3', 'cat3_rounded');

            const cat1Rounded = customRound(cat1Result.avg);
            const cat2Rounded = customRound(cat2Result.avg);
            const cat3Rounded = customRound(cat3Result.avg);

            result.push({
                ...emp,
                average_score: cat1Rounded + cat2Rounded + cat3Rounded,
                cat1_avg: cat1Result.avg,
                cat2_avg: cat2Result.avg,
                cat3_avg: cat3Result.avg,
                cat1_rounded: cat1Rounded,
                cat2_rounded: cat2Rounded,
                cat3_rounded: cat3Rounded,
                breakdown: cat1Result.breakdown, // Store breakdown for display
                is_weighted: true
            });
        } else {
            // Regular employee - use basic score
            result.push(emp);
        }
    }

    return result;
}

// Process raw Supabase scores into display format with weighted calculation
async function processScoresForDisplay(rawScores) {
    const staff = await loadStaffMeta();

    // First pass: Calculate basic scores
    const basicScores = calculateBasicScores(rawScores, staff);

    // Store for subordinate lookup
    allEmployeeScores = basicScores;

    // Second pass: Apply subordinate performance for managers
    const result = applySubordinatePerformance(basicScores, staff);

    // Sort by average score descending
    result.sort((a, b) => b.average_score - a.average_score);

    return result;
}

// Load and process all data
async function loadProcessedData() {
    const rawScores = await fetchScores();
    return await processScoresForDisplay(rawScores);
}
