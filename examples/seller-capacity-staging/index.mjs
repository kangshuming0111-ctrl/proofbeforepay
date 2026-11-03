import {handleCapacityRequest} from "./worker/capacity-service.mjs";
export default {async fetch(request,env){return handleCapacityRequest(request,env);}};
