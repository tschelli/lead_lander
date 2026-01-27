import { Queue } from "bullmq";
import { env } from "./env";

export const deliveryQueue = new Queue(env.queueName, {
  connection: {
    url: env.redisUrl
  }
});
