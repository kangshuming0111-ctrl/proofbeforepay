import {proofActor} from "@/lib/proof-store";
import {handle,json} from "@/lib/server";
import {listAssignedIntegrations} from "@/lib/integration-operator-store";
export const dynamic="force-dynamic";
export async function GET(request:Request){return handle(async()=>json(await listAssignedIntegrations(proofActor(request),new URL(request.url).searchParams.get("cursor")??undefined)));}
