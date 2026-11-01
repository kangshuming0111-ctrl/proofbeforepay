import { json, providerEnv } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = providerEnv();
  return json({ aiMode: config.DEEPSEEK_API_KEY ? "live" : "demo", paymentMode: config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET ? "sandbox" : "demo", model: config.DEEPSEEK_MODEL });
}
