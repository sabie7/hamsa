const env = require('fs').readFileSync('F:/hi-master/.env', 'utf8');
const mongoUri = (env.match(/^MONGO_URI=(.+)$/m) || [])[1];
if (!mongoUri) { console.log('no uri'); process.exit(0); }
const mongoose = require('mongoose');
mongoose.set('strictQuery', false);
(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  const User = mongoose.connection.collection('users');
  const admin = await User.findOne({ isAdmin: { $ne: null } }).catch(() => null);
  console.log('admin-ish count:', await User.countDocuments({ isAdmin: true }));
  const admins = await User.find({ isAdmin: true }).toArray();
  admins.forEach((u) => console.log('ADMIN', JSON.stringify({ topic: u.topic, id: u.id, lid: u.lid, idreg: u.idreg, power: u.power, created: u.created })));
  const all = await User.find({}).sort({ created: 1 }).limit(8).toArray();
  console.log('first users by created:');
  all.forEach((u) => console.log(' ', JSON.stringify({ topic: u.topic, id: u.id, lid: u.lid, idreg: u.idreg, power: u.power })));
  await mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });