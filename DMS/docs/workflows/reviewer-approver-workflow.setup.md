# Reviewer-Approver Workflow Template Setup

This setup implements the requested flow:

1. Editable template in Workflow Management (draft + publish)
2. Workflow instance auto-start on document submit
3. Reviewer step first
4. Reviewer approve routes to approver
5. Reviewer reject routes to uploader
6. Approver approve ends, approver reject routes to uploader
7. Full approval history visible in workflow instance steps

## Files

- BPMN diagram: `docs/workflows/reviewer-approver-workflow.bpmn`
- Template payload: `docs/workflows/reviewer-approver-workflow.template.json`

## Important Routing Rule

For MANUAL activities in this backend, decision routing uses:

- `TRUE` for **APPROVE**
- `FALSE` for **REJECT**
- `DEFAULT` as fallback

So connection `conditionCase` must be `TRUE`/`FALSE`/`DEFAULT`.

## Apply In Workflow Designer

1. Open **Workflow Designer**.
2. Create a new template named `Document Reviewer-Approver Workflow`.
3. Import `docs/workflows/reviewer-approver-workflow.bpmn`.
4. Configure MANUAL activity assignees:
   - `Reviewer Review` -> `assigneeType = DOCUMENT_REVIEWER`
   - `Approver Approval` -> `assigneeType = DOCUMENT_APPROVER`
   - `Returned to Uploader` -> `assigneeType = DOCUMENT_OWNER`
5. Configure connection `conditionCase` values:
   - Reviewer -> Approver: `TRUE`
   - Reviewer -> Uploader: `FALSE`
   - Approver -> End: `TRUE`
   - Approver -> Uploader: `FALSE`
   - Uploader -> End: `DEFAULT`
6. Save template.
7. Publish template.
8. Bind the published template to your target document category in **Category binding**.

## How It Works At Runtime

- On document creation, backend calls `workflowService.startWorkflowForDocument(...)`.
- It finds active category binding and starts an instance for the published template.
- Document workflow panel shows each step (`instance.steps`) including actor, status, note, and timestamps.

## Notes

- In this project, reviewer is mapped to upload `reviewerId` and should use `DOCUMENT_REVIEWER`.
- Supervisor (`supervisorId`) is reserved for retention/reminder management and is not part of workflow approval routing.
- If you want reviewer to be a fixed user instead, set `assigneeUsername` on the reviewer step.
- If uploader needs to re-submit content after rejection, keep the uploader step as return/ack and allow creating a new version to trigger a new workflow cycle.
