import {recordRiskRepair, replayRiskRepairs} from "@/lib/risk-repairs";
import {proofActor, proofResponse, readProofCase, saveProofCase} from "@/lib/proof-store";
import {body, handle, json} from "@/lib/server";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const {id} = await context.params, record = await readProofCase(id, proofActor(request));
    const state = record.quote.proof.collaboration;
    return json({tasks: replayRiskRepairs(state?.feedback ?? [], state?.riskRepairEvents, record.quote.proof.criteria)});
  });
}
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const {id} = await context.params, record = await readProofCase(id, proofActor(request, true));
    const next = recordRiskRepair(record.quote, record.role, await body(request, 8000));
    await saveProofCase(record, next);
    return json(proofResponse(record, next));
  });
}
