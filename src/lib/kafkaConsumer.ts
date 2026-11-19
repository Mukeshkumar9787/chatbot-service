import fs from "fs";
import { dbTenantStore, dbUserStore } from "./db";

/**
 * Builds Kafka configuration for Kafkajs consumer
 */
export function getChatbotKafkaConfig(clientId = "chatbot-service-tenant-consumer") {
  const brokers = (
    process.env.KAFKA_BOOTSTRAP_SERVERS || "localhost:9092"
  ).split(",");

  const config: any = {
    clientId,
    brokers,
    retry: { retries: 5 },
  };

  if (process.env.KAFKA_USERNAME && process.env.KAFKA_PASSWORD) {
    config.sasl = {
      mechanism: (process.env.KAFKA_SASL_MECHANISM || "plain").toLowerCase(),
      username: process.env.KAFKA_USERNAME,
      password: process.env.KAFKA_PASSWORD,
    };
  }

  const isSslRequested =
    (process.env.KAFKA_SECURITY_PROTOCOL || "").toUpperCase().includes("SSL") ||
    Boolean(process.env.KAFKA_CA_PATH || process.env.KAFKA_CA_CERT) ||
    Boolean(process.env.KAFKA_USERNAME);

  if (isSslRequested) {
    let caCert = null;
    if (process.env.KAFKA_CA_PATH && fs.existsSync(process.env.KAFKA_CA_PATH)) {
      caCert = fs.readFileSync(process.env.KAFKA_CA_PATH, "utf-8");
    } else if (process.env.KAFKA_CA_CERT) {
      caCert = process.env.KAFKA_CA_CERT;
    }

    if (caCert) {
      config.ssl = {
        rejectUnauthorized: true,
        ca: [caCert],
      };
    } else {
      config.ssl = true;
    }
  }

  return config;
}

/**
 * Starts the Kafka Tenant Lifecycle Consumer
 */
export async function startKafkaTenantConsumer() {
  const topic = process.env.KAFKA_TOPIC_TENANT_LIFECYCLE || "smk.tenant.lifecycle";
  const groupId = process.env.KAFKA_CONSUMER_GROUP_ID || "chatbot-tenant-lifecycle-group";

  try {
    const { Kafka } = await import("kafkajs");
    const kafkaConfig = getChatbotKafkaConfig();
    const kafka = new Kafka(kafkaConfig);
    const consumer = kafka.consumer({ groupId });

    await consumer.connect();
    console.log(`[Kafka Consumer] Connected to Kafka brokers. Subscribing to '${topic}'...`);

    await consumer.subscribe({ topic, fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const raw = message.value?.toString();
          if (!raw) return;
          const payload = JSON.parse(raw);
          console.log(`[Kafka Consumer] Received message on ${topic} [p${partition}]:`, payload.event, payload.slug);

          const {
            event,
            tenantId,
            slug,
            name,
            status = "ACTIVE",
            aiChatbotEnabled = true,
            planCode,
            branding,
            owner,
            ownerEmail,
            ownerPasswordHash,
            ownerName,
          } = payload;

          if (!slug) return;

          const isEcomActive = status === "ACTIVE" || status === "TRIAL";
          const isChatbotAllowed = Boolean(aiChatbotEnabled);
          const effectiveStatus: "ACTIVE" | "INACTIVE" =
            isEcomActive && isChatbotAllowed ? "ACTIVE" : "INACTIVE";

          const syncedTenant = await dbTenantStore.createTenant({
            id: tenantId ? String(tenantId).trim() : `tenant_${slug}_${Date.now()}`,
            slug: String(slug).trim().toLowerCase(),
            name: String(name || slug).trim(),
            status: effectiveStatus,
            source: "SMK_ECOMMERCE",
            planCode: planCode ? String(planCode) : undefined,
            aiChatbotEnabled: isChatbotAllowed,
            settings: {
              storeName: branding?.storeName || name,
              syncedVia: "KAFKA",
              lastEvent: event,
              syncedAt: new Date().toISOString(),
            },
          });

          // Synchronize owner administrator user so login works transparently across both platforms
          const targetEmail = owner?.email || ownerEmail;
          const targetPasswordHash = owner?.passwordHash || ownerPasswordHash;
          const targetName = owner?.name || ownerName || name || slug;

          if (targetEmail && targetPasswordHash) {
            try {
              await dbUserStore.createOrUpdateUser({
                email: targetEmail,
                name: targetName,
                role: "SUPPORT_ADMIN",
                is_active: effectiveStatus === "ACTIVE",
                passwordHash: targetPasswordHash,
                tenantId: syncedTenant.id,
              });
              console.log(`[Kafka Consumer] Synced administrator ${targetEmail} for tenant ${slug}`);
            } catch (uErr: any) {
              console.warn(`[Kafka Consumer] User sync notice:`, uErr.message);
            }
          }

          console.log(`[Kafka Consumer] Synced tenant '${slug}' -> status: ${effectiveStatus}`);
        } catch (msgErr: any) {
          console.error("[Kafka Consumer] Error processing message:", msgErr.message);
        }
      },
    });

    return consumer;
  } catch (err: any) {
    console.warn("[Kafka Consumer Notice] Kafka consumer startup skipped/failed:", err.message);
    return null;
  }
}
