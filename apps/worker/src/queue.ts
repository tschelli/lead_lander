import { Queue, QueueScheduler } from "bullmq";
import { env } from "./env";

export const deliveryQueue = new Queue(env.queueName, {
  connection: {
    url: env.redisUrl
  }
});

export const deliveryQueueScheduler = new QueueScheduler(env.queueName, {
  connection: {
    url: env.redisUrl
  }
});
