// Static data processor - processes Supabase data for display

// Staff metadata (cached)
let staffMeta = null;

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
                supervisor: row['直屬主管'] || '',
                position: row['職稱'] || ''
            };
        }
    }

    return meta;
}

// Process raw Supabase scores into display format
async function processScoresForDisplay(rawScores) {
    const staff = await loadStaffMeta();

    const employeeScores = {};
    const employeeRaters = {};

    rawScores.forEach(row => {
        const ratee = row.ratee || '';
        const rater = row.rater || '';
        const cat1 = parseFloat(row.cat1) || 0;
        const cat2 = parseFloat(row.cat2) || 0;
        const cat3 = parseFloat(row.cat3) || 0;
        const total = row.total || (cat1 + cat2 + cat3);

        const originalCat1 = row.original_cat1;
        const originalCat2 = row.original_cat2;
        const originalCat3 = row.original_cat3;

        const isModified = (
            originalCat1 !== null &&
            (cat1 !== originalCat1 || cat2 !== originalCat2 || cat3 !== originalCat3)
        );

        if (ratee) {
            if (!employeeScores[ratee]) {
                employeeScores[ratee] = { totals: [], cat1s: [], cat2s: [], cat3s: [] };
            }
            employeeScores[ratee].totals.push(total);
            employeeScores[ratee].cat1s.push(cat1);
            employeeScores[ratee].cat2s.push(cat2);
            employeeScores[ratee].cat3s.push(cat3);

            if (!employeeRaters[ratee]) {
                employeeRaters[ratee] = [];
            }

            // Check if rater is special (supervisor)
            const employeeMeta = staff[ratee] || {};
            const isSpecial = employeeMeta.supervisor === rater;

            employeeRaters[ratee].push({
                name: rater,
                total: total,
                cat1: cat1,
                cat2: cat2,
                cat3: cat3,
                original_cat1: originalCat1,
                original_cat2: originalCat2,
                original_cat3: originalCat3,
                is_modified: isModified,
                is_special: isSpecial
            });
        }
    });

    // Build result array
    const result = [];

    for (const [name, scores] of Object.entries(employeeScores)) {
        const raters = employeeRaters[name] || [];
        const totals = scores.totals;
        const cat1s = scores.cat1s;
        const cat2s = scores.cat2s;
        const cat3s = scores.cat3s;

        const avgTotal = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
        const avgCat1 = cat1s.length > 0 ? cat1s.reduce((a, b) => a + b, 0) / cat1s.length : 0;
        const avgCat2 = cat2s.length > 0 ? cat2s.reduce((a, b) => a + b, 0) / cat2s.length : 0;
        const avgCat3 = cat3s.length > 0 ? cat3s.reduce((a, b) => a + b, 0) / cat3s.length : 0;

        const employeeMeta = staff[name] || {};

        result.push({
            name: name,
            average_score: Math.round(avgTotal * 100) / 100,
            rater_count: raters.length,
            raters: raters,
            org: employeeMeta.org || '未分類',
            unit: employeeMeta.unit || '',
            position: employeeMeta.position || '',
            supervisor: employeeMeta.supervisor || '',
            cat1_avg: avgCat1,
            cat2_avg: avgCat2,
            cat3_avg: avgCat3,
            cat1_rounded: Math.round(avgCat1),
            cat2_rounded: Math.round(avgCat2),
            cat3_rounded: Math.round(avgCat3)
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
