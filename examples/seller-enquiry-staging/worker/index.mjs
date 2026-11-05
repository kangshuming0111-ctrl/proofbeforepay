import {handleEnquiryRequest} from './enquiry-service.mjs';
export default{fetch(request,env){return handleEnquiryRequest(request,env);}};
