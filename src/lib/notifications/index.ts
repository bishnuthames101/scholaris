export { renderTemplate, extractVariables, validateVariables, SYSTEM_TEMPLATES } from "./templates";
export type { SystemTemplate } from "./templates";

export { getAdapter, allAdapters, WhatsAppFonnteAdapter, SmsAdapter, ViberAdapter, PushAdapter } from "./channels";
export type { SendResult, ChannelAdapter } from "./channels";

export {
  routeNotification,
  sendNotifications,
  channelPriorityOf,
  DEFAULT_CHANNEL_PRIORITY,
} from "./router";
export type { NotificationRecipient, SendNotificationInput, NotificationResult } from "./router";

export { getBalance, deductCredits, addCredits } from "./credits";

export { ensureSystemTemplates } from "./seed-templates";

export { processEvents } from "./consumer";
