import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const match: any = {
      workspaceId: '684402c2fd2cd4eb6521b386',
      date: { $gte: startDate, $lte: endDate }
    };

    const result = await db.collection('analytics').aggregate([
      { $match: match },
      { $sort: { date: 1 } },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: '$likes' },
          totalComments: { $sum: '$comments' },
          sumDailyReach: { $sum: '$reachDay' },
          latestWeekReach: { $last: '$reachWeek' },
          latestMonthReach: { $last: '$reachDays28' },
          startReachSnapshot: { $first: '$reach' },
          endReachSnapshot: { $last: '$reach' },
          latestFollowers: { $last: '$followers' },
          totalPosts: { $sum: '$posts' },
        }
      }
    ]).toArray();
    console.log("Aggregation Result:", result);
  } finally {
    await client.close();
  }
}
run().catch(console.error);
