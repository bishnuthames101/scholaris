import { ApiError } from "@/lib/api";
import type { OnlineMethod, PaymentProvider } from "./provider";
import { esewaProvider } from "./esewa";
import { khaltiProvider } from "./khalti";

export * from "./provider";

const providers: Record<OnlineMethod, PaymentProvider> = {
  esewa: esewaProvider,
  khalti: khaltiProvider,
};

export function isOnlineMethod(method: string): method is OnlineMethod {
  return method === "esewa" || method === "khalti";
}

export function getProvider(method: string): PaymentProvider {
  if (!isOnlineMethod(method)) {
    throw new ApiError("UNKNOWN_PROVIDER", `No payment provider for "${method}"`, 400);
  }
  return providers[method];
}
