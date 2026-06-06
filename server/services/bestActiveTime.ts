import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

const traceLog = (msg: string) => {
    try {
        const logPath = path.join(process.cwd(), 'debug-trace.log');
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logPath, `[${timestamp}] [BestActiveTime] ${msg}\n`);
    } catch (e) { }
};

export class BestActiveTimeService {
    /**
     * V4.6 - Mon-First + Sensitivity 5% + Fixed Metadata + Resilient Persistence
     */
    static async calculateBestActiveTime(accountId: string, token: string): Promise<void> {
        try {
            traceLog(`🚀 Starting calculation for ID: ${accountId}`);

            const db = mongoose.connection.db;
            if (!db) {
                traceLog('❌ No DB connection available in Mongoose instance.');
                return;
            }

            const socialAccounts = db.collection('socialaccounts');
            const contents = db.collection('contents');

            // 1. Resolve Account
            let accountIdObj: any = null;
            try { accountIdObj = new mongoose.Types.ObjectId(accountId); } catch (e) { }

            const account = await socialAccounts.findOne({
                $or: [
                    { _id: accountIdObj || accountId },
                    { accountId: accountId }
                ]
            });

            if (!account) {
                traceLog(`❌ Account NOT found for ID: ${accountId}`);
                return;
            }

            // 2. Fetch Published Media
            const mediaToAnalyze = await contents.find({
                workspaceId: account.workspaceId,
                platform: 'instagram',
                status: 'published'
            }).toArray();

            traceLog(`📊 ${mediaToAnalyze.length} posts analyzed for @${account.username}`);

            // 3. Signal Generation (Monday=0)
            const utc_matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
            const processedPosts: any[] = [];
            mediaToAnalyze.forEach(post => {
                const ts = post.publishedAt || post.scheduledAt || post.createdAt;
                if (!ts) return;
                const date = new Date(ts);
                const utcDay = date.getUTCDay(); // 0=Sun
                const dayIdx = (utcDay + 6) % 7; // Transform: 0=Mon, 4=Fri, 6=Sun
                const hour = date.getUTCHours();
                const m = post.metrics || {};
                const engagement = Number(m.likes || 0) + (Number(m.comments || 0) * 1.5) + (Number(m.saves || 0) * 2);
                const reach = Number(m.reach || 0);
                const score = engagement * (reach > 0 ? (1 + Math.log10(reach)) : 1);
                processedPosts.push({ dayIdx, hour, score });
            });

            const avg = processedPosts.reduce((acc, p) => acc + p.score, 0) / (processedPosts.length || 1);
            const usableMedia = processedPosts.filter(p => p.score >= avg * 0.1);

            usableMedia.forEach(p => {
                utc_matrix[p.dayIdx][p.hour] += p.score;
            });

            // 4. Timezone Shifting (IST +5:30)
            const offsetHours = 5.5;
            const local_matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
            for (let d = 0; d < 7; d++) {
                for (let h = 0; h < 24; h++) {
                    const utcScore = utc_matrix[d][h];
                    if (utcScore === 0) continue;
                    let lh = Math.round(h + offsetHours);
                    let ld = d;
                    if (lh >= 24) { lh -= 24; ld = (ld + 1) % 7; }
                    local_matrix[ld][lh] += utcScore;
                }
            }

            // 5. Next Peak Analysis (Sensitivity 5%)
            const now = new Date();
            const localNow = new Date(now.getTime() + (offsetHours * 3600000));
            const startDayMonIdx = (localNow.getUTCDay() + 6) % 7;
            const startHour = localNow.getUTCHours();

            const scoresList = local_matrix.flat();
            const maxScore = Math.max(...scoresList);
            const pulseThreshold = maxScore * 0.05;

            let billboardDay = startDayMonIdx;
            let billboardHour = 0;
            let foundNext = false;
            let foundInterval = 0;

            for (let i = 1; i <= 168; i++) {
                const checkTime = new Date(localNow.getTime() + (i * 3600000));
                const dIdx = (checkTime.getUTCDay() + 6) % 7;
                const h = checkTime.getUTCHours();
                if (local_matrix[dIdx][h] >= pulseThreshold && local_matrix[dIdx][h] > 0) {
                    billboardDay = dIdx;
                    billboardHour = h;
                    foundNext = true;
                    foundInterval = i;
                    break;
                }
            }

            if (!foundNext) {
                let absMax = -1;
                for (let d = 0; d < 7; d++) {
                    for (let h = 0; h < 24; h++) {
                        if (local_matrix[d][h] > absMax) {
                            absMax = local_matrix[d][h];
                            billboardDay = d; billboardHour = h;
                        }
                    }
                }
            }

            // 6. Metadata Generation
            const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const displayHour = billboardHour % 12 || 12;
            const ampm = billboardHour >= 12 ? 'PM' : 'AM';
            const displayHourLabel = `${displayHour}${ampm}`;
            const displayWindowLabel = `${displayHourLabel} - ${(billboardHour + 1) % 12 || 12}${(billboardHour + 1) % 24 >= 12 ? 'PM' : 'AM'}`;

            const isToday = billboardDay === startDayMonIdx;
            const isTomorrow = billboardDay === (startDayMonIdx + 1) % 7;
            const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : dayNames[billboardDay];

            const status = `Next High-Yield window detected for ${dayLabel} at ${displayHourLabel}.`;

            const mean = scoresList.reduce((a, b) => a + b, 0) / (scoresList.length || 1);
            const stdDev = Math.sqrt(scoresList.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (scoresList.length || 1));
            const zScore = stdDev > 0 ? (maxScore - mean) / stdDev : 0;

            const payload = {
                best_hour: billboardHour,
                best_hour_label: displayHourLabel,
                best_window_label: displayWindowLabel,
                best_window: { start: billboardHour, end: (billboardHour + 1) % 24 },
                billboard_day: dayLabel,
                is_billboard_today: isToday,
                confidence: 0.75, // Default for v4.6
                status,
                usable_posts: usableMedia.length,
                scanned_posts: mediaToAnalyze.length,
                z_score: parseFloat(zScore.toFixed(2)),
                dominant_weekday: dayNames[billboardDay],
                heatmap_data: local_matrix,
                daily_best_hours: local_matrix.map((row, d) => {
                    let dMax = -1; let dHour = 0;
                    row.forEach((v, h) => { if (v > dMax) { dMax = v; dHour = h; } });
                    return { day: d, day_name: dayNames[d], best_hour: dHour, score: parseFloat((dMax / (maxScore || 1)).toFixed(2)), is_peak: dMax === maxScore };
                }),
                next_peak_at: new Date(now.getTime() + (foundInterval * 3600000)),
                method: 'AI Post Performance Model (V4.6 All Aligned)',
                lastComputedAt: new Date()
            };

            // 7. Persist (Raw)
            await socialAccounts.updateOne({ _id: account._id }, { $set: { aiBestActiveTime: payload } });
            traceLog(`✅ V4.6 Success for @${account.username}. Billboard: ${dayLabel} at ${displayHourLabel}. Usable: ${usableMedia.length}`);

        } catch (error: any) {
            traceLog(`❌ FATAL ERROR: ${error.message}`);
        }
    }
}
export default BestActiveTimeService;
