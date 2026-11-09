import type {Language, ProofCriterion, ProofFeedback} from "@/lib/contracts";
import {criterionDisplayTitle} from "@/lib/delivery-overview";

export function SellerRevisionFeedback({feedback, criteria, currentDeliveryId, current, language}: {
  feedback: readonly ProofFeedback[];
  criteria: readonly ProofCriterion[];
  currentDeliveryId: string;
  current: boolean;
  language: Language;
}) {
  // The server appends all comments from one return with the same timestamp.
  const latest = feedback.at(-1);
  if (!latest || (latest.deliveryId === currentDeliveryId) !== current) return null;
  const comments = feedback.filter(row => row.deliveryId === latest.deliveryId && row.at === latest.at);
  const zh = language === "zh";
  return <section className="collaboration-feedback seller-revision-feedback" aria-label={zh ? "本次返工的买家意见" : "Buyer feedback for this revision"}>
    <h4>{current ? zh ? "买家退回本版的意见" : "Buyer feedback on the returned version" : zh ? "买家上次退回的意见" : "Buyer feedback from the last return"}</h4>
    {!current && <p className="collaboration-help">{zh ? "这些意见针对旧版。请在新版交付说明中写明如何处理。" : "These comments refer to an earlier version. Explain how you addressed them in the new delivery note."}</p>}
    <ul className="collaboration-feedback-list">{comments.map(row => {
      const criterion = criteria.find(item => item.id === row.criterionId);
      return <li key={row.id}>
        {criterion && <strong>{criterionDisplayTitle(criterion, language)}</strong>}
        <p>{row.comment}</p>
      </li>;
    })}</ul>
  </section>;
}
