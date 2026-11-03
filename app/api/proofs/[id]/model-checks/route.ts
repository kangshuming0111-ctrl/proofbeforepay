import {proofActor, proofResponse, readProofCase, saveProofCase, type ProofRecord} from "@/lib/proof-store";
import {body, handle, HttpError, json} from "@/lib/server";
import {runtimeDeliveryDigest} from "@/lib/runtime-project";
import {sameJourneyRegistration} from "@/lib/project-journey";
import {availableJourneyTargets, assertSeparateJourneyOrigin, resolveJourneyTarget} from "@/lib/server-journey-targets";
import {MODEL_DEFINITION, evaluateModelCheckReport} from "@/lib/model-checks";
import {executeModelCheckRun} from "@/lib/model-check-runner";
import {beginModelCheckRun, recordModelCheckCheckpoint, finishModelCheckRun, closeExpiredModelCheckRun} from "@/lib/model-check-actions";

export const dynamic = "force-dynamic";
async function modelView(record: ProofRecord) {
  const delivery = record.quote.proof.delivery, digest = delivery?.files ? await runtimeDeliveryDigest(delivery.files) : undefined;
  return {definition: MODEL_DEFINITION, targets: digest ? availableJourneyTargets(record.quote, digest) : [], run: delivery?.modelRun ?? null,
    report: delivery?.modelReport ?? null, evaluation: delivery?.modelReport ? evaluateModelCheckReport(delivery.modelReport) : null};
}
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const actor = proofActor(request);
    if (!actor.authenticated) throw new HttpError(401, "Sign in to inspect this project's model checks.");
    const {id} = await context.params, record = await readProofCase(id, actor);
    return json(await modelView(record));
  });
}
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const actor = proofActor(request, true);
    if (!actor.authenticated) throw new HttpError(401, "Sign in to run this project's model checks.");
    const {id} = await context.params, input = await body(request, 4096), record = await readProofCase(id, actor);
    if (input.action === "close") {
      await saveProofCase(record, closeExpiredModelCheckRun(record.quote, record.role, input));
      return json({...proofResponse(record), model: await modelView(record)});
    }
    if (input.action !== "run") throw new HttpError(400, "Choose run or explicitly close an expired model check.");
    const digest = await runtimeDeliveryDigest(record.quote.proof.delivery?.files), registration = resolveJourneyTarget(record.quote, input.targetId, digest);
    assertSeparateJourneyOrigin(registration, new URL(request.url).origin);
    // Persist the unique lease and evidence reservation before the runner can
    // attempt even its first GET. There is deliberately no write-resume path.
    await saveProofCase(record, beginModelCheckRun(record.quote, record.role, input, digest, registration));
    const run = record.quote.proof.delivery!.modelRun!;
    async function current() {
      const fresh = await readProofCase(id, actor), delivery = fresh.quote.proof.delivery;
      if (!delivery || delivery.id !== run.deliveryId || delivery.modelRun?.id !== run.id || await runtimeDeliveryDigest(delivery.files) !== run.deliveryDigest) throw new HttpError(409, "The model-check lease or delivery changed while checks were running.");
      const approved = resolveJourneyTarget(fresh.quote, run.registration.id, run.deliveryDigest);
      if (!sameJourneyRegistration(run.registration, approved)) throw new HttpError(409, "The model-check target approval changed. No further checks were issued.");
      return fresh;
    }
    const report = await executeModelCheckRun(run, {onCheckpoint: async trace => {
      // Start from the newest record so concurrent human annotations survive;
      // saveProofCase still rejects a concurrent mutation after this read.
      const fresh = await current();
      await saveProofCase(fresh, recordModelCheckCheckpoint(fresh.quote, run.id, trace));
    }});
    const fresh = await current();
    await saveProofCase(fresh, finishModelCheckRun(fresh.quote, run.id, report));
    return json({...proofResponse(fresh), model: await modelView(fresh)});
  });
}
