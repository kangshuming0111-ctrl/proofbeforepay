import type {SellerBridgeCommand,SellerBridgeObservation} from "../../lib/seller-journey-bridge";
export const DOM_ADAPTER_VERSION:"pbp-seller-dom-adapter-v1";
export type DomCompletion={sequence:number;actionId:SellerBridgeCommand["actionId"];requests:SellerBridgeObservation["requests"];receipt?:unknown};
export type SellerDomConfiguration={document?:Document;runId:string;forms:{create:{partySize:string;slot:string;requestOperation:string;submit:string};cancel:{bookingId:string;requestOperation:string;submit:string};move:{bookingId:string;slot:string;requestOperation:string;submit:string};retry:{submit:string}};result:string;observe:(command:SellerBridgeCommand)=>{promise:Promise<DomCompletion>;cancel:(reason?:unknown)=>void};beforeAction?:(command:SellerBridgeCommand)=>void;timeoutMs?:number};
export function createSellerDomExecutor(configuration:SellerDomConfiguration):{execute(command:SellerBridgeCommand):Promise<Pick<SellerBridgeObservation,"ui"|"requests">>;dispose():void};
