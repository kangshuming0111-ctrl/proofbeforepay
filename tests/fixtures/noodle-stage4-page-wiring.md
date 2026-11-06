# Stage4 exact page wiring review seam

This is an exact bounded source excerpt, not the complete page. No backend or model behavior is implemented by this callback. Existing LayoutCheckPanel onRun remains a distinct explicit action. Current-only mobileObservation context is absent from readOnly history reports. Guard and focus function navigation only, no report writes/manual check/accept/pay. Full source SHA256 edd38f8f51059cbd3db9cee755c0709ded1c1992a7e55a4841c6da35c07437d6.

```tsx
959: 
960:   /** Only the latest request for this exact project/delivery/perspective may
961:    * move focus after React commits. A resume never invokes a workflow action. */
962:   function scheduleWorkspaceFocus(task:(root:HTMLDivElement)=>void) {
963:     const view={...currentQuoteView.current},serial=++workspaceFocusSerial.current;
964:     setTechnicalFocusRequest(undefined);
965:     window.requestAnimationFrame(()=>{
966:       if(serial!==workspaceFocusSerial.current||!sameQuoteResponseView(view,currentQuoteView.current))return;
967:       if(workspaceRef.current)task(workspaceRef.current);
968:     });
969:   }
970: 
971:   function focusPanel(panel: "agreement" | "delivery" | "payment", selector?: string) {
972:     setWorkspaceView("workbench"); setWorkspacePanel(panel);
973:     const section=`.${panel === "agreement" ? "scope" : panel === "payment" ? "payment" : "evidence"}-panel`;
974:     scheduleWorkspaceFocus(root=>{
975:       if(!revealGuidedTarget(root,selector??section,section))setNotice(tr("请查看当前区域的说明；该操作控件暂不可用。", "Read this section’s instructions; the requested control is currently unavailable."));
976:     });
977:   }
978: 
979:   function openMobileChecks() {
980:     if (!quote || !delivery || !deliveryUnlocked || busy) return;
981:     setDeliveryTab("layout");
982:     focusPanel("delivery", ".layout-check-panel");
983:   }
984: 
1734:                 <LayoutCheckPanel key={delivery?.id ?? "empty"} language={language} report={delivery?.layoutReport}
1765:               {delivery&&proof&&proof.criteria[criterionIndex]&&<RequirementNextStep criterion={proof.criteria[criterionIndex]} item={delivery.assessment?.deliveryId===delivery.id?delivery.assessment.items.find(item=>item.criterionId===proof.criteria[criterionIndex].id):undefined} evidence={evidence.filter(item=>item.criterionId===proof.criteria[criterionIndex].id)} businessSteps={assessmentFeedbackScopeSteps(quote)} requirementCompletenessPolicy={delivery.assessment?.deliveryId===delivery.id?delivery.assessment.requirementCompletenessPolicy:undefined} mobileObservation={customProject?{requiredPages:customProject.requiredPages,onOpen:openMobileChecks,disabled:!!busy||!deliveryUnlocked}:undefined} humanConfirmed={confirmedManualChecks.includes(proof.criteria[criterionIndex].id)} language={language}/>}
1767:               {delivery && proof && <DeliveryAssessment report={delivery.assessment?.deliveryId === delivery.id ? delivery.assessment : undefined} riskReviews={delivery.riskReviews} actorRole={displayRole} onSaveRiskReview={saveRiskReview} criteria={proof.criteria} scopeSteps={assessmentFeedbackScopeSteps(quote)} mobileObservation={customProject?{requiredPages:customProject.requiredPages,onOpen:openMobileChecks,disabled:!!busy||!deliveryUnlocked}:undefined} language={language} selectedCriterionId={proof.criteria[criterionIndex]?.id} configured={config?.aiMode === "live"} enabled={!!canCheckDelivery && reviewCurrent && !!delivery.files && !busy} busy={busy === "assess"} onPrepareFeedback={buyer && collaboration?.stage === "submitted" && deliveryUnlocked && !busy ? prepareFeedback : undefined} onRun={() => mutate("assess", {deliveryId: delivery.id, confirm: true}, tr("已保存当前版本的 AI 评估。建议与规则证据独立，最终仍由买家验收。", "AI assessment saved for this version. Advice remains separate from rule evidence; the buyer decides acceptance."))} />}
1768:               {!!delivery?.assessmentHistory?.length&&proof&&<details className="assessment-history"><summary>{tr(`查看本版先前评估（${delivery.assessmentHistory.length}）`,`Inspect earlier assessments of this version (${delivery.assessmentHistory.length})`)}</summary><p>{tr("这些报告使用当时的范围依据，原样保留；不作为当前评估，也不能用于自动验收。","These reports retain their original scope basis. They are earlier assessments, not the current finding, and cannot automatically accept the delivery.")}</p>{delivery.assessmentHistory.map(report=><DeliveryAssessment key={report.id} report={report} criteria={proof.criteria} language={language} selectedCriterionId={proof.criteria[criterionIndex]?.id} readOnly riskReviews={delivery.riskReviews}/>)}</details>}
```
