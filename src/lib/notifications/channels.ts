/**
 * Channel adapter interface and implementations (§5.6).
 * Each adapter handles send + status + cost for one delivery channel.
 */

export type SendResult = {
  success: boolean;
  providerRef?: string;
  errorMessage?: string;
  costPaisa: number;
};

export type ChannelAdapter = {
  channel: "whatsapp" | "sms" | "viber" | "push";
  send(params: { phone: string; message: string }): Promise<SendResult>;
  /** Cost per message in paisa (for credit estimation). */
  estimateCost(): number;
};

// ─────────────────────────────────────────────────────────────
// WhatsApp adapter (Fonnte — primary channel for Nepal)
// ─────────────────────────────────────────────────────────────

export class WhatsAppFonnteAdapter implements ChannelAdapter {
  channel = "whatsapp" as const;

  async send(params: { phone: string; message: string }): Promise<SendResult> {
    const apiKey = process.env.FONNTE_API_KEY;
    if (!apiKey) {
      return { success: false, errorMessage: "FONNTE_API_KEY not configured", costPaisa: 0 };
    }

    try {
      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target: params.phone,
          message: params.message,
        }),
      });
      const data = (await res.json()) as { status: boolean; id?: string; reason?: string };
      if (data.status) {
        return { success: true, providerRef: data.id ?? undefined, costPaisa: this.estimateCost() };
      }
      return { success: false, errorMessage: data.reason ?? "Fonnte send failed", costPaisa: 0 };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : "WhatsApp send error",
        costPaisa: 0,
      };
    }
  }

  estimateCost(): number {
    return 50; // ~NPR 0.50 per WhatsApp message
  }
}

// ─────────────────────────────────────────────────────────────
// SMS adapter (Nepal carrier aggregator — NTC/Ncell)
// ─────────────────────────────────────────────────────────────

export class SmsAdapter implements ChannelAdapter {
  channel = "sms" as const;

  async send(params: { phone: string; message: string }): Promise<SendResult> {
    const apiUrl = process.env.SMS_API_URL;
    const apiKey = process.env.SMS_API_KEY;

    if (!apiUrl || !apiKey) {
      return { success: false, errorMessage: "SMS gateway not configured", costPaisa: 0 };
    }

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: params.phone,
          message: params.message,
        }),
      });
      const data = (await res.json()) as { success: boolean; messageId?: string; error?: string };
      if (data.success) {
        return {
          success: true,
          providerRef: data.messageId ?? undefined,
          costPaisa: this.estimateCost(),
        };
      }
      return { success: false, errorMessage: data.error ?? "SMS send failed", costPaisa: 0 };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : "SMS send error",
        costPaisa: 0,
      };
    }
  }

  estimateCost(): number {
    return 200; // ~NPR 2.00 per SMS
  }
}

// ─────────────────────────────────────────────────────────────
// Viber adapter (secondary channel for Nepal)
// ─────────────────────────────────────────────────────────────

export class ViberAdapter implements ChannelAdapter {
  channel = "viber" as const;

  async send(params: { phone: string; message: string }): Promise<SendResult> {
    const apiKey = process.env.VIBER_API_KEY;
    const senderId = process.env.VIBER_SENDER_ID;

    if (!apiKey || !senderId) {
      return { success: false, errorMessage: "Viber not configured", costPaisa: 0 };
    }

    try {
      const res = await fetch("https://chatapi.viber.com/pa/send_message", {
        method: "POST",
        headers: {
          "X-Viber-Auth-Token": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receiver: params.phone,
          min_api_version: 1,
          sender: { name: senderId },
          type: "text",
          text: params.message,
        }),
      });
      const data = (await res.json()) as { status: number; message_token?: number; status_message?: string };
      if (data.status === 0) {
        return {
          success: true,
          providerRef: data.message_token?.toString(),
          costPaisa: this.estimateCost(),
        };
      }
      return {
        success: false,
        errorMessage: data.status_message ?? "Viber send failed",
        costPaisa: 0,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : "Viber send error",
        costPaisa: 0,
      };
    }
  }

  estimateCost(): number {
    return 100; // ~NPR 1.00 per Viber business message
  }
}

// ─────────────────────────────────────────────────────────────
// Push notification adapter (stub — wired in Phase 9 with Expo)
// ─────────────────────────────────────────────────────────────

export class PushAdapter implements ChannelAdapter {
  channel = "push" as const;

  async send(_params: { phone: string; message: string }): Promise<SendResult> {
    // Stub until Phase 9 mobile app is live.
    // In production this will use Expo push via expo-server-sdk.
    return {
      success: false,
      errorMessage: "Push notifications not yet available (Phase 9)",
      costPaisa: 0,
    };
  }

  estimateCost(): number {
    return 0; // Push is free
  }
}

// ─────────────────────────────────────────────────────────────
// Adapter registry
// ─────────────────────────────────────────────────────────────

const adapters: Record<string, ChannelAdapter> = {
  whatsapp: new WhatsAppFonnteAdapter(),
  sms: new SmsAdapter(),
  viber: new ViberAdapter(),
  push: new PushAdapter(),
};

export function getAdapter(channel: string): ChannelAdapter | undefined {
  return adapters[channel];
}

export function allAdapters(): ChannelAdapter[] {
  return Object.values(adapters);
}
