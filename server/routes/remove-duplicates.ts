// API endpoint to remove duplicate content
import express from 'express';

export async function removeDuplicateContent(req: express.Request, res: express.Response) {
    try {
        const { ContentModel } = await import('../models/Content/Content');

        console.log('🔍 Finding duplicate content...');

        // Find all Instagram content
        const allContent = await ContentModel.find({ platform: 'instagram' }).sort({ createdAt: 1 });
        console.log(`Total content items: ${allContent.length}`);

        // Group by Instagram media ID
        const seenIds = new Map();
        const duplicates: any[] = [];

        for (const content of allContent) {
            const mediaId = content.contentData?.id;
            if (!mediaId) continue;

            if (seenIds.has(mediaId)) {
                duplicates.push(content);
                console.log(`🔄 Duplicate: ${mediaId} (removing ${content._id})`);
            } else {
                seenIds.set(mediaId, content);
            }
        }

        if (duplicates.length > 0) {
            const duplicateIds = duplicates.map(d => d._id);
            const result = await ContentModel.deleteMany({ _id: { $in: duplicateIds } });
            console.log(`✅ Deleted ${result.deletedCount} duplicates`);

            const finalCount = await ContentModel.countDocuments({ platform: 'instagram' });

            res.json({
                success: true,
                removed: result.deletedCount,
                finalCount,
                duplicates: duplicates.map(d => ({ id: d._id, mediaId: d.contentData?.id }))
            });
        } else {
            res.json({ success: true, removed: 0, message: 'No duplicates found' });
        }
    } catch (error: any) {
        console.error('❌ Error removing duplicates:', error);
        res.status(500).json({ error: error.message });
    }
}
