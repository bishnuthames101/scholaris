import { describe, expect, it } from "vitest";
import {
  renderTemplate,
  extractVariables,
  validateVariables,
  SYSTEM_TEMPLATES,
} from "../src/lib/notifications/templates";
import {
  channelPriorityOf,
  DEFAULT_CHANNEL_PRIORITY,
} from "../src/lib/notifications/router";

// ─────────────────────────────────────────────────────────────
// Template rendering
// ─────────────────────────────────────────────────────────────

describe("renderTemplate", () => {
  it("replaces all {{var}} placeholders", () => {
    const body = "Dear {{guardianName}}, your child {{studentName}} was absent on {{date}}.";
    const result = renderTemplate(body, {
      guardianName: "Ram Sharma",
      studentName: "Sita Sharma",
      date: "2082-02-15",
    });
    expect(result).toBe("Dear Ram Sharma, your child Sita Sharma was absent on 2082-02-15.");
  });

  it("replaces missing variables with empty string", () => {
    expect(renderTemplate("Hello {{name}}, code: {{code}}", { name: "Test" })).toBe(
      "Hello Test, code: ",
    );
  });

  it("handles null/undefined variable values gracefully", () => {
    expect(renderTemplate("Value: {{x}}", { x: null })).toBe("Value: ");
    expect(renderTemplate("Value: {{x}}", { x: undefined })).toBe("Value: ");
  });

  it("handles numeric values", () => {
    expect(renderTemplate("GPA: {{gpa}}", { gpa: 3.6 })).toBe("GPA: 3.6");
  });

  it("returns body unchanged when no variables present", () => {
    const body = "Plain text with no placeholders.";
    expect(renderTemplate(body, {})).toBe(body);
  });

  it("handles Nepali template text with {{vars}}", () => {
    const body = "नमस्कार {{guardianName}}, {{studentName}} अनुपस्थित।";
    expect(renderTemplate(body, { guardianName: "राम", studentName: "सीता" })).toBe(
      "नमस्कार राम, सीता अनुपस्थित।",
    );
  });

  it("handles multiple occurrences of the same variable", () => {
    expect(
      renderTemplate("{{name}} and {{name}} again", { name: "Alice" }),
    ).toBe("Alice and Alice again");
  });
});

// ─────────────────────────────────────────────────────────────
// Variable extraction
// ─────────────────────────────────────────────────────────────

describe("extractVariables", () => {
  it("extracts unique variable names from template body", () => {
    const vars = extractVariables(
      "Dear {{guardianName}}, {{studentName}} was absent. Contact {{guardianName}}.",
    );
    expect(vars).toContain("guardianName");
    expect(vars).toContain("studentName");
    expect(vars.length).toBe(2); // deduped
  });

  it("returns empty array for template with no variables", () => {
    expect(extractVariables("No variables here.")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// Variable validation
// ─────────────────────────────────────────────────────────────

describe("validateVariables", () => {
  it("returns missing variables", () => {
    const template = { variables: ["guardianName", "studentName", "date"] };
    const missing = validateVariables(template, { guardianName: "Ram" });
    expect(missing).toEqual(["studentName", "date"]);
  });

  it("returns empty array when all provided", () => {
    const template = { variables: ["a", "b"] };
    expect(validateVariables(template, { a: "1", b: "2" })).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// System templates
// ─────────────────────────────────────────────────────────────

describe("system templates", () => {
  it("has all required templates", () => {
    const slugs = SYSTEM_TEMPLATES.map((t) => t.slug);
    expect(slugs).toContain("absence_alert");
    expect(slugs).toContain("fee_due");
    expect(slugs).toContain("fee_overdue");
    expect(slugs).toContain("results_published");
    expect(slugs).toContain("notice");
    expect(slugs).toContain("rfid_tap");
    expect(slugs).toContain("bulk_message");
  });

  it("every template has both English and Nepali bodies", () => {
    for (const t of SYSTEM_TEMPLATES) {
      expect(t.bodyEn, `${t.slug} bodyEn`).toBeTruthy();
      expect(t.bodyNe, `${t.slug} bodyNe`).toBeTruthy();
    }
  });

  it("every template body uses only declared variables", () => {
    for (const t of SYSTEM_TEMPLATES) {
      const enVars = extractVariables(t.bodyEn);
      const neVars = extractVariables(t.bodyNe);
      const allUsed = new Set([...enVars, ...neVars]);
      for (const v of allUsed) {
        expect(t.variables, `${t.slug}: ${v} used but not declared`).toContain(v);
      }
    }
  });

  it("absence_alert template renders correctly", () => {
    const t = SYSTEM_TEMPLATES.find((t) => t.slug === "absence_alert")!;
    const rendered = renderTemplate(t.bodyEn, {
      guardianName: "Ram",
      studentName: "Sita",
      class: "Class 5 A",
      date: "2082-02-15",
    });
    expect(rendered).toContain("Ram");
    expect(rendered).toContain("Sita");
    expect(rendered).toContain("Class 5 A");
    expect(rendered).toContain("2082-02-15");
  });
});

// ─────────────────────────────────────────────────────────────
// Channel priority settings
// ─────────────────────────────────────────────────────────────

describe("channelPriorityOf", () => {
  it("returns default when settings is null/empty", () => {
    expect(channelPriorityOf(null)).toEqual(DEFAULT_CHANNEL_PRIORITY);
    expect(channelPriorityOf({})).toEqual(DEFAULT_CHANNEL_PRIORITY);
    expect(channelPriorityOf({ channelPriority: [] })).toEqual(DEFAULT_CHANNEL_PRIORITY);
  });

  it("reads valid priority from settings", () => {
    expect(channelPriorityOf({ channelPriority: ["sms", "whatsapp"] })).toEqual([
      "sms",
      "whatsapp",
    ]);
  });

  it("filters out invalid channel names", () => {
    expect(channelPriorityOf({ channelPriority: ["sms", "email", "viber"] })).toEqual([
      "sms",
      "viber",
    ]);
  });

  it("falls back to default if all invalid", () => {
    expect(channelPriorityOf({ channelPriority: ["email", "slack"] })).toEqual(
      DEFAULT_CHANNEL_PRIORITY,
    );
  });

  it("default priority is whatsapp → sms → viber (per plan §12)", () => {
    expect(DEFAULT_CHANNEL_PRIORITY).toEqual(["whatsapp", "sms", "viber"]);
  });
});

// ─────────────────────────────────────────────────────────────
// Credit metering (unit-level — no DB)
// ─────────────────────────────────────────────────────────────

describe("credit metering logic", () => {
  it("adapters have positive cost estimates for paid channels", async () => {
    // Dynamic import to avoid side effects
    const { WhatsAppFonnteAdapter, SmsAdapter, ViberAdapter, PushAdapter } = await import(
      "../src/lib/notifications/channels"
    );
    expect(new WhatsAppFonnteAdapter().estimateCost()).toBeGreaterThan(0);
    expect(new SmsAdapter().estimateCost()).toBeGreaterThan(0);
    expect(new ViberAdapter().estimateCost()).toBeGreaterThan(0);
    expect(new PushAdapter().estimateCost()).toBe(0); // push is free
  });

  it("WhatsApp is cheaper than SMS", async () => {
    const { WhatsAppFonnteAdapter, SmsAdapter } = await import(
      "../src/lib/notifications/channels"
    );
    const waCost = new WhatsAppFonnteAdapter().estimateCost();
    const smsCost = new SmsAdapter().estimateCost();
    expect(waCost).toBeLessThan(smsCost); // confirms WhatsApp-first makes financial sense
  });
});

// ─────────────────────────────────────────────────────────────
// Channel adapters — graceful failure without config
// ─────────────────────────────────────────────────────────────

describe("channel adapters (unconfigured)", () => {
  it("WhatsApp adapter fails gracefully without FONNTE_API_KEY", async () => {
    const { WhatsAppFonnteAdapter } = await import("../src/lib/notifications/channels");
    const adapter = new WhatsAppFonnteAdapter();
    const result = await adapter.send({ phone: "+977-9800000000", message: "test" });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("FONNTE_API_KEY");
  });

  it("SMS adapter fails gracefully without config", async () => {
    const { SmsAdapter } = await import("../src/lib/notifications/channels");
    const adapter = new SmsAdapter();
    const result = await adapter.send({ phone: "+977-9800000000", message: "test" });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("not configured");
  });

  it("Viber adapter fails gracefully without config", async () => {
    const { ViberAdapter } = await import("../src/lib/notifications/channels");
    const adapter = new ViberAdapter();
    const result = await adapter.send({ phone: "+977-9800000000", message: "test" });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("not configured");
  });

  it("Push adapter returns not available (Phase 9)", async () => {
    const { PushAdapter } = await import("../src/lib/notifications/channels");
    const adapter = new PushAdapter();
    const result = await adapter.send({ phone: "+977-9800000000", message: "test" });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("Phase 9");
  });
});

// ─────────────────────────────────────────────────────────────
// Routing logic
// ─────────────────────────────────────────────────────────────

describe("notification routing", () => {
  it("routeNotification tries channels in order and returns failure for all", async () => {
    const { routeNotification } = await import("../src/lib/notifications/router");
    // Without any channel configured, all should fail
    const { channel, result } = await routeNotification(
      "+977-9800000000",
      "test message",
      ["whatsapp", "sms", "viber"],
    );
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBeTruthy();
  });

  it("routeNotification with single channel returns that channel on failure", async () => {
    const { routeNotification } = await import("../src/lib/notifications/router");
    const { channel } = await routeNotification("+977-9800000000", "test", ["sms"]);
    expect(channel).toBe("sms");
  });
});
