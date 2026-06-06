// Remove duplicate content entries from ContentModel
import mongoose from 'mongoose';

async function removeDuplicates() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb');

        const { ContentModel } = await import('./server/models/Content/Content');

        console.log('🔍 Finding duplicate content...');

        // Find all content
        const allContent = await ContentModel.find({ platform: 'instagram' }).sort({ createdAt: 1 });
        console.log(`Total content items: ${allContent.length}`);

        // Group by Instagram media ID
        const seenIds = new Map<string, any>();
        const duplicates: any[] = [];

        for (const content of allContent) {
            const mediaId = content.contentData?.id;
            if (!mediaId) {
                console.log(`⚠️  Content ${content._id} has no media ID`);
                continue;
            }

            if (seenIds.has(mediaId)) {
                // This is a duplicate
                duplicates.push(content);
                console.log(`🔄 Duplicate found: ${mediaId} (keeping first, removing ${content._id})`);
            } else {
                seenIds.set(mediaId, content);
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`  Total items: ${allContent.length}`);
        console.log(`  Unique items: ${seenIds.size}`);
        console.log(`  Duplicates to remove: ${duplicates.length}`);

        if (duplicates.length > 0) {
            console.log(`\n🗑️  Removing ${duplicates.length} duplicates...`);
            const duplicateIds = duplicates.map(d => d._id);
            const result = await ContentModel.deleteMany({ _id: { $in: duplicateIds } });
            console.log(`✅ Deleted ${result.deletedCount} duplicate entries`);

            // Verify
            const finalCount = await ContentModel.countDocuments({ platform: 'instagram' });
            console.log(`\n✨ Final count: ${finalCount} unique posts`);
        } else {
            console.log(`\n✅ No duplicates found!`);
        }

        await mongoose.disconnect();
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }
}

removeDuplicates();
