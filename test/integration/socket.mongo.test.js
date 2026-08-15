const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { runSocketIntegrationSuite } = require('./socket.suite');
const repository = require('../../src/db/repository');
const schemas = require('../../src/db/schemas');

// Integration suite against a real MongoDB instance spun up in-memory via
// mongodb-memory-server. The unified repository layer (Prompt 2) is pointed at
// Mongo while the same Socket.io handlers run unchanged.
runSocketIntegrationSuite('Socket integration (mongodb-memory-server)', async function () {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  Object.keys(schemas).forEach(function (key) {
    if (!mongoose.models[key]) mongoose.model(key, schemas[key]);
  });

  const db = repository.buildMongoRepository(mongoose, null);
  db.cleanup = async function () {
    await mongoose.disconnect();
    await mongod.stop();
  };
  return db;
});
