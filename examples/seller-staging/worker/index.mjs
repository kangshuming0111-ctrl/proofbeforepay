import {handleSellerBookingRequest} from "./booking-service.mjs";

export default {
  async fetch(request, env) {
    return handleSellerBookingRequest(request, env);
  },
};
