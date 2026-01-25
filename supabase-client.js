// Supabase Configuration for Frontend
const SUPABASE_URL = 'https://acrkclmderqewcwugsnl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjcmtjbG1kZXJxZXdjd3Vnc25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNTc0MzAsImV4cCI6MjA4MTgzMzQzMH0.UT2vJTXpPO5tR9sUD8YU0gJ_47Zpe3yJiLzllUljPDw';

// Supabase REST API helper
async function supabaseRequest(endpoint, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || 'return=representation'
    };

    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Supabase error: ${errorText}`);
        }

        const text = await response.text();
        return text ? JSON.parse(text) : null;
    } catch (error) {
        console.error('Supabase request failed:', error);
        throw error;
    }
}

// Fetch all scores from Supabase
async function fetchScores() {
    return await supabaseRequest('scores?select=*&order=ratee,rater');
}

// Add a new score
async function addScoreInSupabase(ratee, rater, cat1, cat2, cat3) {
    // Check if exists
    const endpoint = `scores?ratee=eq.${encodeURIComponent(ratee)}&rater=eq.${encodeURIComponent(rater)}&select=id`;
    const existing = await supabaseRequest(endpoint);

    if (existing && existing.length > 0) {
        throw new Error(`${rater} 對 ${ratee} 的評分已存在`);
    }

    // Insert
    return await supabaseRequest('scores', {
        method: 'POST',
        body: {
            ratee,
            rater,
            cat1,
            cat2,
            cat3,
            original_cat1: cat1,
            original_cat2: cat2,
            original_cat3: cat3
        }
    });
}

// Update a score
async function updateScoreInSupabase(ratee, rater, cat1, cat2, cat3) {
    const endpoint = `scores?ratee=eq.${encodeURIComponent(ratee)}&rater=eq.${encodeURIComponent(rater)}`;
    return await supabaseRequest(endpoint, {
        method: 'PATCH',
        body: { cat1, cat2, cat3 }
    });
}

// Delete a score
async function deleteScoreInSupabase(ratee, rater) {
    const endpoint = `scores?ratee=eq.${encodeURIComponent(ratee)}&rater=eq.${encodeURIComponent(rater)}`;
    return await supabaseRequest(endpoint, {
        method: 'DELETE'
    });
}

// Restore a score to original
async function restoreScoreInSupabase(ratee, rater) {
    // First get the original values
    const endpoint = `scores?ratee=eq.${encodeURIComponent(ratee)}&rater=eq.${encodeURIComponent(rater)}&select=original_cat1,original_cat2,original_cat3`;
    const result = await supabaseRequest(endpoint);

    if (result && result.length > 0) {
        const original = result[0];
        if (original.original_cat1 !== null) {
            return await updateScoreInSupabase(ratee, rater,
                original.original_cat1,
                original.original_cat2,
                original.original_cat3
            );
        }
    }
    throw new Error('沒有原始分數記錄');
}

// Restore all modified scores
async function restoreAllScoresInSupabase() {
    // Get all modified scores
    const allScores = await supabaseRequest('scores?select=id,ratee,rater,cat1,cat2,cat3,original_cat1,original_cat2,original_cat3');

    const modified = allScores.filter(r =>
        r.original_cat1 !== null &&
        (r.cat1 !== r.original_cat1 || r.cat2 !== r.original_cat2 || r.cat3 !== r.original_cat3)
    );

    if (modified.length === 0) {
        return { success: true, count: 0 };
    }

    // Restore each
    let restoredCount = 0;
    for (const m of modified) {
        try {
            await supabaseRequest(`scores?id=eq.${m.id}`, {
                method: 'PATCH',
                body: {
                    cat1: m.original_cat1,
                    cat2: m.original_cat2,
                    cat3: m.original_cat3
                }
            });
            restoredCount++;
        } catch (e) {
            console.error('Failed to restore:', m, e);
        }
    }

    return { success: true, count: restoredCount };
}

// Export backup as CSV
async function exportBackupCSV() {
    const scores = await fetchScores();

    // Create CSV content
    const headers = ['建立時間', '評分者', '受評者', '第一大類（共40分）', '第二大類（共30分）', '第三大類（共30分）', '總分'];
    const rows = scores.map(r => [
        r.created_at || '',
        r.rater || '',
        r.ratee || '',
        r.cat1 || 0,
        r.cat2 || 0,
        r.cat3 || 0,
        r.total || 0
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    // Download
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `score_backup_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Save Bonus (Using 'SYSTEM_BONUS' as rater in scores table)
async function saveBonusInSupabase(name, bonus) {
    // Check if exists
    const endpoint = `scores?ratee=eq.${encodeURIComponent(name)}&rater=eq.SYSTEM_BONUS&select=id`;
    const existing = await supabaseRequest(endpoint);

    const bonusVal = parseInt(bonus) || 0;

    if (existing && existing.length > 0) {
        // Update
        return await supabaseRequest(`scores?id=eq.${existing[0].id}`, {
            method: 'PATCH',
            body: {
                cat1: bonusVal, // Use cat1 to store bonus
                cat2: 0,
                cat3: 0,
                total: bonusVal
            }
        });
    } else {
        // Insert
        return await supabaseRequest('scores', {
            method: 'POST',
            body: {
                ratee: name,
                rater: 'SYSTEM_BONUS',
                cat1: bonusVal,
                cat2: 0,
                cat3: 0,
                total: bonusVal,
                original_cat1: bonusVal,
                original_cat2: 0,
                original_cat3: 0
            }
        });
    }
}

// Fetch Bonuses
async function fetchBonusesFromSupabase() {
    const scores = await supabaseRequest('scores?rater=eq.SYSTEM_BONUS&select=ratee,cat1');
    const bonuses = {};
    if (scores) {
        scores.forEach(s => {
            bonuses[s.ratee] = s.cat1;
        });
    }
    return bonuses;
}
