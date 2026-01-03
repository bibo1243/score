// Static data processor - processes Supabase data for display
// Updated with weighted calculation: 50% managers + 50% colleagues

// Staff metadata (cached)
let staffMeta = null;

// Define managers
const MANAGERS = new Set(['廖振杉', '廖慧雯', '李冠葦', '陳淑錡', '楊顗帆', '高靜華', '陳宛妤', '鍾宜珮']);
const SUPERVISORS = new Set(['簡采琦', '林品亨', '林紀騰']);
const ALL_MANAGERS = new Set([...MANAGERS, ...SUPERVISORS]);

// Supervisor sections mapping
const SUPERVISOR_SECTIONS = {
    '簡采琦': '社工股',
    '林品亨': '生輔股',
    '林紀騰': '庶務股'
};

// Special employee rules - defines who counts as "manager" for specific employees
const SPECIAL_EMPLOYEE_MANAGERS = {
    '王姿斐': new Set(['李冠葦']),  // 社資組，主管只有總幹事
    '高靜華': new Set(['李冠葦', '廖振杉', '廖慧雯']),  // 只被總幹事和兩家園主任評分
};

// Helper function to get unit managers
function getUnitManagers(unit) {
    switch (unit) {
        case '社資組':
            return new Set(['李冠葦']);  // 只有總幹事
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
    // Check special rules first
    if (SPECIAL_EMPLOYEE_MANAGERS[employeeName]) {
        return SPECIAL_EMPLOYEE_MANAGERS[employeeName].has(raterName);
    }

    // Check unit-specific managers
    const unitManagers = getUnitManagers(employeeUnit);
    if (unitManagers.has(raterName)) {
        return true;
    }

    // Default manager check
    if (MANAGERS.has(raterName)) return true;
    if (SUPERVISORS.has(raterName)) {
        const supervisorSection = SUPERVISOR_SECTIONS[raterName] || '';
        if (['保育股', '保育/生輔股', '生輔股'].includes(supervisorSection)) {
            return ['保育股', '保育/生輔股', '生輔股'].includes(employeeSection);
        }
        return supervisorSection === employeeSection;
    }
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
            const unit = row['所屬單位'] || '';
            const section = row['股別'] || '';

            // Normalize org
            if (['行政組', '社資組', '人資公關組', '圖書組', '會計室'].includes(unit)) {
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

// Process raw Supabase scores into display format with weighted calculation
async function processScoresForDisplay(rawScores) {
    const staff = await loadStaffMeta();

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

        const isModified = (
            originalCat1 !== null &&
            (cat1 !== originalCat1 || cat2 !== originalCat2 || cat3 !== originalCat3)
        );

        if (ratee) {
            if (!employeeData[ratee]) {
                employeeData[ratee] = { raters: [] };
            }

            employeeData[ratee].raters.push({
                name: rater,
                cat1: cat1,
                cat2: cat2,
                cat3: cat3,
                total: cat1 + cat2 + cat3,
                original_cat1: originalCat1,
                original_cat2: originalCat2,
                original_cat3: originalCat3,
                is_modified: isModified
            });
        }
    });

    // Build result array with weighted calculation
    const result = [];

    for (const [name, data] of Object.entries(employeeData)) {
        const employeeMeta = staff[name] || { org: '未分類', unit: '', section: '' };
        const employeeSection = employeeMeta.section || '';
        const employeeUnit = employeeMeta.unit || '';
        const raters = data.raters;

        // Separate raters into managers and colleagues
        const managerRaters = [];
        const colleagueRaters = [];

        raters.forEach(r => {
            const isMgr = isManagerForEmployee(r.name, name, employeeSection, employeeUnit);
            r.is_special = isMgr;
            if (isMgr) {
                managerRaters.push(r);
            } else {
                colleagueRaters.push(r);
            }
        });

        // Calculate weighted averages for each category
        function calcWeightedCatAvg(catKey) {
            let managerAvg = 0;
            let colleagueAvg = 0;
            let managerWeight = 0;
            let colleagueWeight = 0;

            if (managerRaters.length > 0) {
                const sum = managerRaters.reduce((s, r) => s + r[catKey], 0);
                managerAvg = sum / managerRaters.length;
                managerWeight = 0.5;
            }

            if (colleagueRaters.length > 0) {
                const sum = colleagueRaters.reduce((s, r) => s + r[catKey], 0);
                colleagueAvg = sum / colleagueRaters.length;
                colleagueWeight = 0.5;
            }

            // If only one group exists, use 100% from that group
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
        const totalScore = cat1Rounded + cat2Rounded + cat3Rounded;

        result.push({
            name: name,
            average_score: totalScore,
            rater_count: raters.length,
            raters: raters,
            org: employeeMeta.org || '未分類',
            unit: employeeMeta.unit || '',
            section: employeeMeta.section || '',
            position: employeeMeta.position || '',
            supervisor: employeeMeta.supervisor || '',
            cat1_avg: cat1Avg,
            cat2_avg: cat2Avg,
            cat3_avg: cat3Avg,
            cat1_rounded: cat1Rounded,
            cat2_rounded: cat2Rounded,
            cat3_rounded: cat3Rounded
        });
    }

    // Sort by average score descending
    result.sort((a, b) => b.average_score - a.average_score);

    return result;
}

// Load and process all data
async function loadProcessedData() {
    const rawScores = await fetchScores();
    return await processScoresForDisplay(rawScores);
}
