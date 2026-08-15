const mongoose = require('mongoose');

// Mongoose schemas for every entity.
// Note: app documents carry many extra fields at runtime (loose schema).
// We define the stable fields + indexes while keeping `strict: false` so
// existing documents are never dropped.
// `collection` is explicit so Mongo collection names match the app's
// storage names (no automatic pluralization surprises).

const UserSchema = new mongoose.Schema({
  topic: { type: String, trim: true },
  topic1: { type: String },
  username: { type: String },
  password: { type: String },
  id: { type: String },
  lid: { type: String },
  idreg: { type: String },
  token: { type: String },
  fp: { type: String },
  ip: { type: String },
  co: { type: String },
  code: { type: String },
  pic: { type: String },
  ucol: { type: String },
  mcol: { type: String },
  bg: { type: String },
  fontColor: { type: String },
  rep: { type: Number, default: 0 },
  msg: { type: String },
  power: { type: String },
  evaluation: { type: Number, default: 0 },
  stat: { type: Number, default: 0 },
  loginG: { type: Boolean, default: false },
  documentationc: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  online: { type: Number, default: 0 },
  roomid: { type: String },
  created: { type: Date, default: Date.now },
  time: { type: String },
}, { strict: false, minimize: false, collection: 'users' });

UserSchema.index({ topic: 1 }, { background: true });
UserSchema.index({ username: 1 }, { background: true });
UserSchema.index({ id: 1 }, { background: true });
UserSchema.index({ token: 1 }, { background: true });
UserSchema.index({ isAdmin: 1 }, { background: true });
UserSchema.index({ created: 1 }, { background: true });

const RoomSchema = new mongoose.Schema({
  id: { type: String },
  name: { type: String },
  topic: { type: String },
  about: { type: String },
  welcome: { type: String },
  owner: { type: String },
  ownerId: { type: String },
  password: { type: String },
  pass: { type: String },
  needpass: { type: Boolean, default: false },
  max: { type: Number, default: 200 },
  pic: { type: String },
  online: { type: Number, default: 0 },
  created: { type: Date, default: Date.now },
}, { strict: false, minimize: false, collection: 'rooms' });

RoomSchema.index({ id: 1 }, { background: true });
RoomSchema.index({ created: 1 }, { background: true });

const MessageSchema = new mongoose.Schema({
  category: { type: String },
  adresse: { type: String },
  msg: { type: String },
  roomId: { type: String },
  sender: { type: String },
  time: { type: String },
  created: { type: Date, default: Date.now },
}, { strict: false, minimize: false, collection: 'messages' });

MessageSchema.index({ roomId: 1 }, { background: true });
MessageSchema.index({ adresse: 1 }, { background: true });
MessageSchema.index({ created: 1 }, { background: true });

const BandSchema = new mongoose.Schema({
  device_band: { type: String },
  ip_band: { type: String },
  date: { type: String },
  name_band: { type: String },
}, { strict: false, minimize: false, collection: 'bands' });

BandSchema.index({ device_band: 1 }, { background: true });
BandSchema.index({ ip_band: 1 }, { background: true });

const PowerSchema = new mongoose.Schema({
  powers: { type: Array, default: [] },
}, { strict: false, minimize: false, collection: 'powers' });

const BanSchema = new mongoose.Schema({
  systems: { type: Object, default: {} },
  browsers: { type: Object, default: {} },
  ip_band: { type: String },
  device_band: { type: String },
  date: { type: String },
  reason: { type: String },
}, { strict: false, minimize: false, collection: 'bans' });

const SubscriptionSchema = new mongoose.Schema({
  iduser: { type: String },
  sub: { type: String },
  topic: { type: String },
  topic1: { type: String },
  time: { type: String },
  timeis: { type: Number },
  created: { type: Date, default: Date.now },
}, { strict: false, minimize: false, collection: 'subscriptions' });

SubscriptionSchema.index({ iduser: 1 }, { background: true });
SubscriptionSchema.index({ topic: 1 }, { background: true });

const SettingSchema = new mongoose.Schema({
  siteweb: { type: Object, default: {} },
  site: { type: Object, default: {} },
  dro3: { type: Array, default: [] },
  emo: { type: Array, default: [] },
  sico: { type: Array, default: [] },
  shrt: { type: Array, default: [] },
}, { strict: false, minimize: false, collection: 'settings' });

const LogSchema = new mongoose.Schema({
  state: { type: String },
  topic: { type: String },
  topic1: { type: String },
  ip: { type: String },
  code: { type: String },
  device: { type: String },
  isin: { type: String },
  time: { type: String },
  created: { type: Date, default: Date.now },
}, { strict: false, minimize: false, collection: 'logs' });

LogSchema.index({ topic: 1 }, { background: true });
LogSchema.index({ ip: 1 }, { background: true });
LogSchema.index({ created: 1 }, { background: true });

const StateSchema = new mongoose.Schema({}, { strict: false, minimize: false, collection: 'states' });
StateSchema.index({ created: 1 }, { background: true });

const NoLetterSchema = new mongoose.Schema({
  type: { type: String },
  v: { type: String },
  path: { type: String },
  created: { type: Date, default: Date.now },
}, { strict: false, minimize: false, collection: 'noletters' });

NoLetterSchema.index({ v: 1 }, { background: true });

const NameSchema = new mongoose.Schema({
  topic: { type: String },
  ip: { type: String },
  fp: { type: String },
  iduser: { type: String },
  created: { type: Date, default: Date.now },
}, { strict: false, minimize: false, collection: 'names' });

NameSchema.index({ topic: 1 }, { background: true });

const ZakrfaSchema = new mongoose.Schema({}, { strict: false, minimize: false, collection: 'zakrfa' });

const BarsSchema = new mongoose.Schema({
  device_band: { type: String },
  ip_band: { type: String },
  reason: { type: String },
  created: { type: Date, default: Date.now },
}, { strict: false, minimize: false, collection: 'bars' });

BarsSchema.index({ device_band: 1 }, { background: true });
BarsSchema.index({ ip_band: 1 }, { background: true });

const HistoryNoLetterSchema = new mongoose.Schema({}, { strict: false, minimize: false, collection: 'historynoletters' });
HistoryNoLetterSchema.index({ created: 1 }, { background: true });

const AuditLogSchema = new mongoose.Schema({
  actor: { type: String },
  ip: { type: String },
  action: { type: String },
  target: { type: String },
  before: { type: Object },
  after: { type: Object },
  detail: { type: Object },
  when: { type: String },
  created: { type: Date, default: Date.now },
}, { strict: false, minimize: false, collection: 'auditlogs' });

AuditLogSchema.index({ actor: 1 }, { background: true });
AuditLogSchema.index({ action: 1 }, { background: true });
AuditLogSchema.index({ created: 1 }, { background: true });

module.exports = {
  User: UserSchema,
  Room: RoomSchema,
  Message: MessageSchema,
  Band: BandSchema,
  Power: PowerSchema,
  Ban: BanSchema,
  Subscription: SubscriptionSchema,
  Setting: SettingSchema,
  Log: LogSchema,
  State: StateSchema,
  NoLetter: NoLetterSchema,
  Name: NameSchema,
  Zakrfa: ZakrfaSchema,
  Bars: BarsSchema,
  HistoryNoLetter: HistoryNoLetterSchema,
  AuditLog: AuditLogSchema,
};
