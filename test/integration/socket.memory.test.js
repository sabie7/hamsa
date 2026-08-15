const { runSocketIntegrationSuite } = require('./socket.suite');
const repository = require('../../src/db/repository');

// Integration suite against the pure in-memory repository (fast, hermetic).
runSocketIntegrationSuite('Socket integration (in-memory repo)', async function () {
  const db = repository.buildMemoryRepository(null);
  db.cleanup = function () {};
  return db;
});
