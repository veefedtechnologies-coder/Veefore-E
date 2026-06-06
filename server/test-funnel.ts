import dotenv from 'dotenv';
dotenv.config({path: '../.env'});
import mongoose from 'mongoose';
import { AutomationFunnelStateModel } from './models/Automation/AutomationFunnelState';

async function test() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'veeforedb' });
  
  const customState = await AutomationFunnelStateModel.findOne({
    _id: new mongoose.Types.ObjectId("6a175b0c9e597dcfa618a1fb")
  });

  if (customState) {
    console.log("Found State!");
    try {
      customState.state = 'completed';
      await customState.save();
      console.log("Saved successfully!");
    } catch(e) {
      console.error("Save failed:", e);
    }
  } else {
    console.log("State not found!");
  }
  process.exit(0);
}
test();
