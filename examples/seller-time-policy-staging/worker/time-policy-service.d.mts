import type {TimePolicy} from "../../../lib/time-policy.ts";
export const NATIVE_TIME_POLICY:{timezone:string;weekdays:number[];opens:string;closes:string;leadMinutes:number;cancelMinutes:number};
export const NATIVE_CALENDAR_POLICY:TimePolicy;
export function handleTimePolicyRequest(request:Request,env:{DB?:D1Database}):Promise<Response|null>;
