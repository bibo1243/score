
// CSV Parser handling quoted fields and newlines
function parseCSV(text) {
    const arr = [];
    let quote = false;
    let row = [];
    let col = '';

    for (let c = 0; c < text.length; c++) {
        let cc = text[c];
        let nc = text[c + 1];

        if (cc == '"') {
            if (quote && nc == '"') {
                col += '"';
                c++;
            } else {
                quote = !quote;
            }
        } else if (cc == ',' && !quote) {
            row.push(col);
            col = '';
        } else if ((cc == '\r' || cc == '\n') && !quote) {
            if (cc == '\r' && nc == '\n') { c++; }
            row.push(col);
            col = '';
            arr.push(row);
            row = [];
        } else {
            col += cc;
        }
    }
    if (row.length > 0 || col) {
        row.push(col);
        arr.push(row);
    }
    return arr;
}

// Load Staff Directory for Org mapping
async function loadStaffDirectory() {
    try {
        const res = await fetch('工作人員名冊.csv');
        const text = await res.text();
        const rows = parseCSV(text);
        if (rows.length < 2) return {};

        const h = rows[0].map(x => x.trim());
        const nameIdx = h.indexOf('員工姓名');
        const orgIdx = h.indexOf('所屬機構');
        const unitIdx = h.indexOf('所屬單位');

        if (nameIdx === -1) return {};

        const dir = {};
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            const name = r[nameIdx] ? r[nameIdx].trim() : '';
            if (!name) continue;

            let org = r[orgIdx] ? r[orgIdx].trim() : '';
            let unit = r[unitIdx] ? r[unitIdx].trim() : '';

            // Apply Organization Fixes matching data-processor.js
            if (name === '李冠葦') org = '基金會';
            else if (name === '熊小蓮') { org = '基金會'; unit = '行政組'; }
            else if (name === '廖振杉') org = '兒少之家';
            else if (name === '廖慧雯') org = '少年家園';
            else if (name === '楊顗帆') org = '諮商所';
            else if (['行政組', '社資組', '人資公關組', '圖書組', '會計室'].includes(unit)) org = '基金會';
            else if (org.includes('基金會')) org = '基金會';
            else if (org.includes('兒少') || unit === '兒少之家') org = '兒少之家';
            else if (org.includes('少年') || unit === '少年家園') org = '少年家園';
            else if (org.includes('諮商')) org = '諮商所';

            dir[name] = { org, unit };
        }
        return dir;
    } catch (e) {
        console.error("Error loading staff directory:", e);
        return {};
    }
}
