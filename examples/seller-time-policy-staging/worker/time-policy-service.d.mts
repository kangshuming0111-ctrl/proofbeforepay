export const NATIVE_TIME_POLICY:{timezone:string;weekdays:number[];opens:string;closes:string;leadMinutes:number;cancelMinutes:number};
export function handleTimePolicyRequest(request:Request,env:{DB?:D1Database}):Promise<Response|null>;
