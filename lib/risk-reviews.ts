import type { ProofQuote, ProofRiskReview, ProofRole } from './contracts.ts';
import { DomainError } from './domain.ts';

export type RiskReviewInput = { deliveryId: string; assessmentId: string; riskIndex: number; riskOrigin?: "withheld"; decision: ProofRiskReview['decision']; reason: string };

/** Human annotation of one exact, immutable model risk. Never rewrites its verdict. */
export function recordRiskReview(quote: ProofQuote, role: ProofRole, value: unknown, now = new Date().toISOString()): ProofQuote {
  if (role !== 'buyer' && role !== 'seller') throw new DomainError('Project membership is required.',403);
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw new DomainError('Supply a plain-data risk review.');
  const input = value as Record<string,unknown>;
  if (Reflect.ownKeys(input).some(key=>typeof key!=='string'||!['deliveryId','assessmentId','riskIndex','riskOrigin','decision','reason'].includes(key)||!("value" in Object.getOwnPropertyDescriptor(input,key)!)||!Object.getOwnPropertyDescriptor(input,key)!.enumerable)) throw new DomainError('Unknown or non-data risk-review fields.');
  const withheld=Object.hasOwn(input,'riskOrigin');
  if(withheld&&input.riskOrigin!=='withheld')throw new DomainError('Choose the explicit withheld origin or omit it for a published risk.');
  const delivery = quote.proof?.delivery, report = delivery?.assessment;
  if (!delivery || input.deliveryId !== delivery.id || !report || report.deliveryId !== delivery.id || input.assessmentId !== report.id) throw new DomainError('The delivery or AI report changed. Reload its current evidence.',409);
  if (!Number.isSafeInteger(input.riskIndex) || Number(input.riskIndex)<0) throw new DomainError('Choose a risk in this report.');
  const riskIndex=Number(input.riskIndex);
  if(withheld){
    const pool=report.withheldRisks,entry=pool?.entries?.[riskIndex];
    if(!pool||pool.version!==1||pool.reason!=='item_status_adjusted'||!Array.isArray(pool.entries)||pool.entries.length>5||!entry||entry.originalRiskIndex!==riskIndex||!entry.risk)throw new DomainError('Choose an exact withheld lead in this report.');
  }else if(riskIndex>=report.risks.length)throw new DomainError('Choose a published risk in this report.');
  if (typeof input.decision !== 'string' || !['confirmed','rejected','needs_evidence'].includes(input.decision)) throw new DomainError('Choose a human review decision.');
  if (typeof input.reason!=='string' || !input.reason.trim() || input.reason.trim().length>1000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(input.reason)) throw new DomainError('Add a reason of 1–1000 characters.');
  if (!Number.isFinite(Date.parse(now))) throw new DomainError('Invalid review timestamp.');
  const reason=input.reason.trim(), history=delivery.riskReviews??[];
  const last=history.findLast(entry=>entry.deliveryId===delivery.id && entry.assessmentId===report.id && entry.riskOrigin===(withheld?'withheld':undefined) && entry.riskIndex===riskIndex && entry.actorRole===role);
  if (last && last.decision===input.decision && last.reason===reason) return quote;
  if (history.length>=100) throw new DomainError('This delivery has reached its human-review history limit.',409);
  const entry:ProofRiskReview={id:crypto.randomUUID(),deliveryId:delivery.id,assessmentId:report.id,riskIndex,...(withheld?{riskOrigin:'withheld' as const}:{}),decision:input.decision as ProofRiskReview['decision'],reason,actorRole:role,reviewedAt:now};
  return {...quote,proof:{...quote.proof,delivery:{...delivery,riskReviews:[...history,entry]},audit:[...quote.proof.audit,{kind:'risk_reviewed',at:now,deliveryId:delivery.id}]}};
}
