import type {ProofQuote} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {operatorJourneyRegistrations} from "./server-journey-targets.ts";
import {approvedIntegrationRegistrations} from "./seller-integration-store";
/** Only persisted operator decisions and the retained legacy operator registry
 * are candidates. Submission and local manifest checks grant no network access. */
export async function projectJourneyRegistrations(quote:ProofQuote){
 const result=[...operatorJourneyRegistrations(),...await approvedIntegrationRegistrations(quote.id)];if(new Set(result.map(item=>item.id)).size!==result.length)throw new DomainError("Duplicate approved staging IDs need operator review.",503);return result;
}
