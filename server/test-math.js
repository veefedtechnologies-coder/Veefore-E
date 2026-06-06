const currentData = { followers: 3, reach: 503, views: 0, posts: 0, likes: 0, engagement: 0 };
const oldestRecord = { followers: 4, reach: 413, views: 0, posts: 0, likes: 0, engagement: 0 };

const oldFollowers = oldestRecord.followers === 0 ? (currentData.followers || 0) : oldestRecord.followers;
let followerGrowth = 0;
if (oldFollowers === 0 && currentData.followers > 0) followerGrowth = 100;
else if (oldFollowers > 0) followerGrowth = ((currentData.followers - oldFollowers) / oldFollowers) * 100;

console.log("Follower Growth:", followerGrowth);

const currentReachPeriod = currentData.reach || oldestRecord.reach || 0;
const oldReachPeriod = oldestRecord.reach || 0;

let reachGrowth = 0;
if (oldReachPeriod === 0 && currentReachPeriod > 0) reachGrowth = 100;
else if (oldReachPeriod > 0) reachGrowth = ((currentReachPeriod - oldReachPeriod) / oldReachPeriod) * 100;

console.log("Reach Growth:", reachGrowth);
