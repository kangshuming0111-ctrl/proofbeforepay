import type { ProofQuote, ProofRiskReview, ProofRole } from './contracts.ts';
import { DomainError } from './domain.ts';

export type RiskReviewInput = { deliveryId: string; assessmentId: string; riskIndex: number; decision: ProofRiskReview['decision']; reason: string };

/** Human annotation of one exact, immutable model risk. Never rewrites its verdict. */
export function recordRiskReview(quote: ProofQuote, role: ProofRole, value: unknown, now = new Date().toISOString()): ProofQuote {
  if (role !== 'buyer' && role !== 'seller') throw new DomainError('Project membership is required.',403);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('Supply a risk review.');
  const input = value as Record<string,unknown>;
  if (Object.keys(input).some(key=>!['deliveryId','assessmentId','riskIndex','decision','reason'].includes(key))) throw new DomainError('Unknown risk-review fields.');
  const delivery = quote.proof?.delivery, report = delivery?.assessment;
  if (!delivery || input.deliveryId !== delivery.id || !report || report.deliveryId !== delivery.id || input.assessmentId !== report.id) throw new DomainError('The delivery or AI report changed. Reload its current evidence.',409);
  if (!Number.isInteger(input.riskIndex) || Number(input.riskIndex)<0 || Number(input.riskIndex)>=report.risks.length) throw new DomainError('Choose a risk in this report.');
  if (typeof input.decision !== 'string' || !['confirmed','rejected','needs_evidence'].includes(input.decision)) throw new DomainError('Choose a human review decision.');
  if (typeof input.reason!=='string' || !input.reason.trim() || input.reason.trim().length>1000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(input.reason)) throw new DomainError('Add a reason of 1–1000 characters.');
  if (!Number.isFinite(Date.parse(now))) throw new DomainError('Invalid review timestamp.');
  const reason=input.reason.trim(), history=delivery.riskReviews??[];
  const last=history.findLast(entry=>entry.assessmentId===report.id && entry.riskIndex===input.riskIndex && entry.actorRole===role);
  if (last && last.decision===input.decision && last.reason===reason) return quote;
  if (history.length>=100) throw new DomainError('This delivery has reached its human-review history limit.',409);
  const entry:ProofRiskReview={id:crypto.randomUUID(),deliveryId:delivery.id,assessmentId:report.id,riskIndex:Number(input.riskIndex),decision:input.decision as ProofRiskReview['decision'],reason,actorRole:role,reviewedAt:now};
  return {...quote,proof:{...quote.proof,delivery:{...delivery,riskReviews:[...history,entry]},audit:[...quote.proof.audit,{kind:'risk_reviewed',at:now,deliveryId:delivery.id}]}};
}
