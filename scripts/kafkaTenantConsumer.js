#!/usr/bin/env node
/**
 * Standalone Kafka Tenant Lifecycle Consumer Daemon for Chatbot Service
 * Usage: node scripts/kafkaTenantConsumer.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function main() {
  console.log("====================================================");
  console.log("Starting Chatbot Service Kafka Tenant Consumer Daemon");
  console.log("====================================================");

  // Dynamic import of compiled or ts modules
  const { startKafkaTenantConsumer } = require("../src/lib/kafkaConsumer");
  await startKafkaTenantConsumer();
}

main().catch((err) => {
  console.error("Fatal error in Kafka Tenant Consumer:", err);
  process.exit(1);
});
